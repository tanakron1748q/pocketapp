import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, ExpenseSummary, Refund, RefundHistory, Transaction } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const headers = { Origin: origin };
const users = [
  { id: "refund-a", name: "ผู้รับเงินคืน ก", email: "refund-a@example.test" },
  { id: "refund-b", name: "ผู้รับเงินคืน ข", email: "refund-b@example.test" },
];
const draft = { amount: "40.01", date: "2024-02-29", description: "คืนข้ามเดือน" };

async function setup(context: BrowserContext, userId = users[0].id, type = "EXPENSE") {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const categoryId = categories.find((category) => category.type === type)!.id;
  const input = { type, categoryId, amount: "100.25", date: "2024-01-31", description: "สินค้าต้นทาง" };
  const response = await context.request.post("/api/transactions", { headers, data: input });
  expect(response.status()).toBe(201);
  const transaction: Transaction = (await response.json()).transaction;
  const url = `/api/transactions/${transaction.id}`;
  const { type: _type, ...edit } = input;
  void _type;
  return { transaction, input, edit, categories, url, refunds: `${url}/refunds` };
}
async function create(context: BrowserContext, url: string, data: unknown = draft) {
  return context.request.post(url, { headers, data });
}
async function put(context: BrowserContext, url: string, data: unknown) {
  return context.request.put(url, { headers, data });
}
async function history(context: BrowserContext, url: string): Promise<RefundHistory> {
  const response = await context.request.get(url);
  expect(response.status()).toBe(200);
  return response.json();
}
async function summary(context: BrowserContext, month: string): Promise<ExpenseSummary> {
  const response = await context.request.get(`/api/expense-summary?month=${month}`);
  expect(response.status()).toBe(200);
  return response.json();
}
const list = (page: Page) => page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });
const manager = (page: Page) => page.getByRole("dialog", { name: "เงินคืนของรายจ่าย", exact: true });
async function fillRefund(page: Page, amount = draft.amount, date = draft.date) {
  await manager(page).getByLabel("จำนวนเงินคืน (บาท)").fill(amount);
  await manager(page).getByLabel("วันที่ได้รับเงินคืน (เวลาไทย)").fill(date);
  await manager(page).getByLabel("คำอธิบายเงินคืน (ไม่บังคับ)").fill("คืนผ่านหน้าจอ");
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  await db.refund.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await db.transaction.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
});
test.afterAll(async () => { await db.$disconnect(); });

test("partial/full refunds persist across devices, have immutable references and protect the source", async ({ context, browser }) => {
  const a = await setup(context);
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    const response = await create(context, a.refunds);
    expect(response.status()).toBe(201);
    const refund: Refund = (await response.json()).refund;
    expect(refund).toMatchObject({ ...draft, expenseId: a.transaction.id });
    expect(await history(device, a.refunds)).toMatchObject({ transaction: a.transaction, refunds: [refund], refunded: "40.01", remaining: "60.24" });
    const second = await create(device, a.refunds, { ...draft, amount: "60.24" });
    expect(second.status()).toBe(201);
    expect((await history(context, a.refunds)).remaining).toBe("0.00");
    expect((await create(context, a.refunds, { ...draft, amount: "0.01" })).status()).toBe(422);
    expect((await put(context, `${a.refunds}/${refund.id}`, { ...draft, amount: "40.02" })).status()).toBe(422);
    expect((await put(context, a.url, { ...a.edit, amount: "100.24" })).status()).toBe(422);
    expect((await context.request.delete(a.url, { headers })).status()).toBe(422);
    expect((await put(context, a.url, { ...a.edit, amount: "100.25" })).status()).toBe(200);
    expect((await put(context, `${a.refunds}/${refund.id}`, { ...draft, amount: "0.01", description: " แก้เงินคืน " })).status()).toBe(200);
    expect(await history(device, a.refunds)).toMatchObject({ refunded: "60.25", remaining: "40.00" });
    expect((await put(context, `${a.refunds}/${refund.id}`, { amount: "0.01", date: "2024-03-01" })).status()).toBe(200);
    expect(await summary(device, "2024-02")).toMatchObject({ netExpense: "-60.24" });
    expect(await summary(device, "2024-03")).toMatchObject({ netExpense: "-0.01" });
    const another = await setup(context);
    expect((await put(context, `${another.refunds}/${refund.id}`, draft)).status()).toBe(404);
    for (const item of (await history(context, a.refunds)).refunds) {
      expect((await context.request.delete(`${a.refunds}/${item.id}`, { headers })).status()).toBe(200);
    }
    expect((await context.request.delete(a.url, { headers })).status()).toBe(200);
    expect((await context.request.get(a.refunds)).status()).toBe(404);
  } finally { await device.close(); }
});

test("receipt month reduces source category, allows negative net, excludes income and follows category corrections", async ({ context, browser }) => {
  const a = await setup(context);
  await create(context, a.refunds);
  await setup(context, users[0].id, "INCOME");
  expect(await summary(context, "2024-01")).toMatchObject({ expense: "100.25", refunded: "0.00", netExpense: "100.25" });
  expect(await summary(context, "2024-02")).toMatchObject({ expense: "0.00", refunded: "40.01", netExpense: "-40.01", categories: [{ id: a.input.categoryId, netExpense: "-40.01" }] });
  expect(await summary(context, "2024-03")).toMatchObject({ expense: "0.00", refunded: "0.00", netExpense: "0.00", categories: [] });
  const categoryResponse = await context.request.post("/api/categories", { headers, data: { type: "EXPENSE", name: "หมวดเงินคืนเดิม" } });
  expect(categoryResponse.status()).toBe(201);
  const category: Category = (await categoryResponse.json()).category;
  expect((await put(context, a.url, { ...a.edit, categoryId: category.id })).status()).toBe(200);
  expect((await context.request.patch(`/api/categories/${category.id}`, { headers, data: { name: "หมวดคืนเงิน" } })).status()).toBe(200);
  expect((await context.request.patch(`/api/categories/${category.id}`, { headers, data: { archived: true } })).status()).toBe(200);
  expect((await summary(context, "2024-02")).categories).toEqual([{ id: category.id, name: "หมวดคืนเงิน", expense: "0.00", refunded: "40.01", netExpense: "-40.01" }]);
  const other = await browser.newContext();
  try {
    await authenticate(other, db, users[1].id);
    expect((await summary(other, "2024-02")).categories).toEqual([]);
  } finally { await other.close(); }
});

test("HTTP rejects unauthorized, cross-user, income, forged fields and invalid refund drafts", async ({ context, request, browser }) => {
  const a = await setup(context);
  const income = await setup(context, users[0].id, "INCOME");
  const other = await browser.newContext();
  try {
    const b = await setup(other, users[1].id);
    const refund: Refund = (await (await create(context, a.refunds)).json()).refund;
    const itemUrl = `${a.refunds}/${refund.id}`;
    for (const response of [await request.get(a.refunds), await request.post(a.refunds, { headers, data: draft }), await request.put(itemUrl, { headers, data: draft }), await request.delete(itemUrl, { headers }), await request.get("/api/expense-summary")]) expect(response.status()).toBe(401);
    for (const response of [await other.request.get(a.refunds), await create(other, a.refunds), await put(other, itemUrl, draft), await other.request.delete(itemUrl, { headers }), await create(context, b.refunds), await create(context, income.refunds), await context.request.get(income.refunds)]) expect(response.status()).toBe(404);
    for (const amount of ["0", "-1", "1.001", "21474836.48", "NaN", 0.1, null]) {
      expect((await create(context, a.refunds, { ...draft, amount })).status()).toBe(422);
      expect((await put(context, itemUrl, { ...draft, amount })).status()).toBe(422);
    }
    for (const date of ["2999-01-01", "2025-02-29", "0000-01-01", "bad", "2024-02-29T00:00:00Z"]) {
      expect((await create(context, a.refunds, { ...draft, date })).status()).toBe(422);
      expect((await put(context, itemUrl, { ...draft, date })).status()).toBe(422);
    }
    for (const extra of [{ userId: users[1].id }, { expenseId: b.transaction.id }, { categoryId: b.input.categoryId }, { type: "INCOME" }, { amountSatang: 1 }, { description: "x".repeat(1001) }]) expect((await put(context, itemUrl, { ...draft, ...extra })).status()).toBe(422);
    expect((await context.request.post(a.refunds, { headers: { Origin: origin, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
    expect((await context.request.post(a.refunds, { headers: { Origin: origin, "Content-Type": "text/plain" }, data: "bad" })).status()).toBe(415);
    expect((await context.request.post(a.refunds, { headers: { Origin: "https://attacker.invalid" }, data: draft })).status()).toBe(403);
    expect((await context.request.put(itemUrl, { data: draft })).status()).toBe(403);
    expect((await context.request.delete(itemUrl)).status()).toBe(403);
    expect((await context.request.get(a.refunds)).headers()["cache-control"]).toContain("no-store");
    for (const month of ["0000-01", "2024-13", "2024-1", "bad"]) expect((await context.request.get(`/api/expense-summary?month=${month}`)).status()).toBe(400);
    expect((await history(context, a.refunds)).refunds).toEqual([refund]);
  } finally { await other.close(); }
});

test("two devices cannot over-refund on concurrent creates and edits", async ({ context, browser }) => {
  const a = await setup(context);
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    const responses = await Promise.all([create(context, a.refunds, { ...draft, amount: "60.00" }), create(device, a.refunds, { ...draft, amount: "60.00" })]);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 422]);
    const second: Refund = (await (await create(context, a.refunds, { ...draft, amount: "20.00" })).json()).refund;
    const first = (await history(context, a.refunds)).refunds.find((item) => item.id !== second.id)!;
    // 60+40 and 80+20 are each valid alone; accepting both would exceed 100.25.
    const edits = await Promise.all([
      put(context, `${a.refunds}/${first.id}`, { ...draft, amount: "80.00" }),
      put(device, `${a.refunds}/${second.id}`, { ...draft, amount: "40.00" }),
    ]);
    expect(edits.map((response) => response.status()).sort()).toEqual([200, 422]);
    expect((await history(device, a.refunds)).refunded).toBe("100.00");
  } finally { await device.close(); }
});

test("source reductions and deletion racing with refunds preserve the limit and references", async ({ context, browser }) => {
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = await setup(context);
      const [edit, refund] = await Promise.all([
        put(context, a.url, { ...a.edit, amount: "20.00" }),
        create(device, a.refunds, { ...draft, amount: "80.00" }),
      ]);
      expect([edit.status(), refund.status()].sort()).toEqual(edit.status() === 200 ? [200, 422] : [201, 422]);
      const data = await history(context, a.refunds);
      expect(Number(data.refunded)).toBeLessThanOrEqual(Number(data.transaction.amount));
      const b = await setup(context);
      const [deletion, created] = await Promise.all([
        context.request.delete(b.url, { headers }), create(device, b.refunds),
      ]);
      if (deletion.status() === 200) {
        expect(created.status()).toBe(404);
        expect((await context.request.get(b.refunds)).status()).toBe(404);
      } else {
        expect(deletion.status()).toBe(422);
        expect(created.status()).toBe(201);
        expect((await history(context, b.refunds)).refunded).toBe("40.01");
      }
    }
    const c = await setup(context);
    const first: Refund = (await (await create(context, c.refunds, { ...draft, amount: "20.00" })).json()).refund;
    const [sourceEdit, refundEdit] = await Promise.all([
      put(context, c.url, { ...c.edit, amount: "30.00" }),
      put(device, `${c.refunds}/${first.id}`, { ...draft, amount: "80.00" }),
    ]);
    expect([sourceEdit.status(), refundEdit.status()].sort()).toEqual([200, 422]);
    const [remove, parentRemove] = await Promise.all([
      device.request.delete(`${c.refunds}/${first.id}`, { headers }), context.request.delete(c.url, { headers }),
    ]);
    expect(remove.status()).toBe(200);
    expect([200, 422]).toContain(parentRemove.status());
    if (parentRemove.status() === 422) expect((await context.request.delete(c.url, { headers })).status()).toBe(200);
  } finally { await device.close(); }
});

test("browser adds, edits, cancels and deletes refunds with source history and negative monthly net", async ({ context, page }, testInfo) => {
  const a = await setup(context);
  await page.goto("/dashboard");
  await list(page).getByRole("button", { name: "เงินคืน / ประวัติ" }).click();
  const dialog = manager(page);
  await expect(dialog).toContainText("สินค้าต้นทาง");
  await expect(dialog).toContainText("ยังไม่มีเงินคืน");
  await fillRefund(page);
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog).toContainText("คืนแล้ว 40.01 บาท");
  await expect(dialog.getByRole("list", { name: "ประวัติเงินคืน" })).toContainText("29/02/2024");
  await dialog.getByRole("button", { name: "แก้ไขเงินคืน", exact: true }).click();
  await expect(dialog.getByLabel("จำนวนเงินคืน (บาท)")).toHaveValue("40.01");
  await fillRefund(page, "30.01");
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog).toContainText("คืนแล้ว 30.01 บาท");
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.screenshot({ path: testInfo.outputPath("refund-history.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("เดือน (เวลาไทย)").fill("2024-02");
  await expect(page.getByRole("region", { name: "รายจ่ายสุทธิรายเดือน" })).toContainText("รายจ่ายสุทธิ -30.01 บาท");
  await page.reload();
  await list(page).getByRole("button", { name: "เงินคืน / ประวัติ" }).click();
  await expect(dialog).toContainText("คืนแล้ว 30.01 บาท");
  await dialog.getByRole("button", { name: "ลบเงินคืน", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "ยืนยันลบเงินคืน", exact: true });
  await confirm.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect((await history(context, a.refunds)).refunds).toHaveLength(1);
  await dialog.getByRole("button", { name: "ลบเงินคืน", exact: true }).click();
  await confirm.getByRole("button", { name: "ยืนยันลบเงินคืน", exact: true }).click();
  await expect(dialog).toContainText("ยังไม่มีเงินคืน");
  expect((await history(context, a.refunds)).remaining).toBe("100.25");
});

test("browser retains failed refund drafts, validates input and shows source guards", async ({ context, page }) => {
  const a = await setup(context);
  await create(context, a.refunds);
  await page.goto("/dashboard");
  await list(page).getByRole("button", { name: "ลบ", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "ยืนยันการลบรายการ", exact: true });
  await deletion.getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
  await expect(deletion).toContainText("กรุณาลบเงินคืนทั้งหมดก่อนลบรายจ่ายต้นทาง");
  await deletion.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await list(page).getByRole("button", { name: "เงินคืน / ประวัติ" }).click();
  const dialog = manager(page);
  await fillRefund(page, "0.001");
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog).toContainText("ทศนิยมไม่เกิน 2 ตำแหน่ง");
  await fillRefund(page, "90.00");
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("เงินคืนรวมต้องไม่เกินรายจ่ายต้นทาง");
  await expect(dialog.getByLabel("จำนวนเงินคืน (บาท)")).toHaveValue("90.00");
  await fillRefund(page, "10.00");
  let fail = true;
  await page.route(`**${a.refunds}`, async (route) => {
    if (route.request().method() === "POST" && fail) return route.fulfill({ status: 503, json: { error: "บันทึกเงินคืนไม่สำเร็จ" } });
    return route.continue();
  });
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("บันทึกเงินคืนไม่สำเร็จ");
  await expect(dialog.getByLabel("จำนวนเงินคืน (บาท)")).toHaveValue("10.00");
  fail = false;
  await dialog.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(dialog).toContainText("คืนแล้ว 50.01 บาท");
});

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, EditableTransactionDraft, Transaction, TransactionType } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = "http://localhost:3100";
const users = [
  { id: "correction-a", name: "ผู้แก้ไข ก", email: "correction-a@example.test", emailVerified: true },
  { id: "correction-b", name: "ผู้แก้ไข ข", email: "correction-b@example.test", emailVerified: true },
];

async function setup(context: BrowserContext, userId = users[0].id, type: TransactionType = "EXPENSE") {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const matching = categories.filter((category) => category.type === type);
  const input: EditableTransactionDraft = { amount: "100.25", date: "2020-02-29", categoryId: matching[0].id, description: "รายการเดิม" };
  const response = await context.request.post("/api/transactions", { headers: { Origin: origin }, data: { ...input, type } });
  expect(response.status()).toBe(201);
  const transaction: Transaction = (await response.json()).transaction;
  return { transaction, input, matching, categories, url: `/api/transactions/${transaction.id}` };
}

async function put(context: BrowserContext, url: string, data: unknown) {
  return context.request.put(url, { headers: { Origin: origin }, data });
}

function history(page: Page) {
  return page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });
}

async function openEdit(page: Page) {
  await history(page).getByRole("button", { name: "แก้ไข", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "แก้ไขรายการ", exact: true });
  await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toBeVisible();
  return dialog;
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  await db.transaction.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
});
test.afterAll(async () => { await db.$disconnect(); });

test("direct item endpoints require a session and hide nonexistent identifiers", async ({ context, request }) => {
  const { transaction, input, url } = await setup(context);
  const own = await context.request.get(url);
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect(await own.json()).toEqual({ transaction });
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.put(url, { headers: { Origin: origin }, data: input })).status()).toBe(401);
  expect((await request.delete(url, { headers: { Origin: origin } })).status()).toBe(401);
  for (const response of [
    await context.request.get("/api/transactions/missing-id"),
    await put(context, "/api/transactions/missing-id", input),
    await context.request.delete("/api/transactions/missing-id", { headers: { Origin: origin } }),
  ]) {
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "ไม่พบรายการ" });
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("HTTP edits all allowed fields on income and expense with exact money and persistent identity", async ({ context, browser }) => {
  const secondDevice = await browser.newContext();
  try {
    await authenticate(secondDevice, db, users[0].id);
    for (const type of ["EXPENSE", "INCOME"] as const) {
      const { transaction, input, matching, url } = await setup(context, users[0].id, type);
      const changes = { ...input, amount: "999.01", date: "2024-02-29", categoryId: matching[1].id, description: " แก้ข้อมูลแล้ว 🍀 " };
      const response = await put(context, url, changes);
      expect(response.status()).toBe(200);
      const updated: Transaction = (await response.json()).transaction;
      expect(updated).toEqual({
        ...transaction, amount: "999.01", date: "2024-02-29", category: matching[1], description: "แก้ข้อมูลแล้ว 🍀",
      });
      expect((await (await secondDevice.request.get(url)).json()).transaction).toEqual(updated);
      const noDescription = await put(context, url, { amount: "0.01", date: input.date, categoryId: input.categoryId });
      expect(noDescription.status()).toBe(200);
      expect((await noDescription.json()).transaction).toMatchObject({ amount: "0.01", description: null });
    }
    const list: Transaction[] = (await (await context.request.get("/api/transactions")).json()).transactions;
    expect(list).toHaveLength(2);
    expect(list.map((item) => item.type).sort()).toEqual(["EXPENSE", "INCOME"]);
  } finally { await secondDevice.close(); }
});

test("direct identifiers cannot read, edit or delete another user's records or attach another user's category", async ({ context, browser }) => {
  const a = await setup(context);
  const other = await browser.newContext();
  try {
    const b = await setup(other, users[1].id);
    for (const response of [
      await context.request.get(b.url), await put(context, b.url, a.input),
      await context.request.delete(b.url, { headers: { Origin: origin } }),
    ]) {
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: "ไม่พบรายการ" });
    }
    const wrongType = a.categories.find((category) => category.type === "INCOME")!;
    for (const categoryId of [b.input.categoryId, wrongType.id, "missing-category"]) {
      const response = await put(context, a.url, { ...a.input, categoryId });
      expect(response.status()).toBe(422);
      expect((await response.json()).fields).toHaveProperty("categoryId");
    }
    for (const forged of [{ type: "INCOME" }, { userId: users[1].id }, { id: b.transaction.id }, { amountSatang: 1 }]) {
      expect((await put(context, a.url, { ...a.input, ...forged })).status()).toBe(422);
    }
    expect((await (await context.request.get(a.url)).json()).transaction).toEqual(a.transaction);
    expect((await (await other.request.get(b.url)).json()).transaction).toEqual(b.transaction);
  } finally { await other.close(); }
});

test("invalid edits and malformed/cross-origin requests leave the original transaction unchanged", async ({ context }) => {
  const { transaction, input, url } = await setup(context);
  for (const amount of ["0", "-1", "1.001", "21474836.48", "NaN", 0.1, null]) {
    const response = await put(context, url, { ...input, amount });
    expect(response.status()).toBe(422);
    expect((await response.json()).fields).toHaveProperty("amount");
  }
  for (const date of ["2999-01-01", "2025-02-29", "invalid", "2020-01-01T00:00:00Z"]) {
    const response = await put(context, url, { ...input, date });
    expect(response.status()).toBe(422);
    expect((await response.json()).fields).toHaveProperty("date");
  }
  expect((await put(context, url, { ...input, description: "x".repeat(1001) })).status()).toBe(422);
  expect((await put(context, url, { amount: "1.00" })).status()).toBe(422);
  expect((await context.request.put(url, { headers: { Origin: origin, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
  expect((await context.request.put(url, { headers: { Origin: origin, "Content-Type": "text/plain" }, data: "not-json" })).status()).toBe(415);
  expect((await context.request.put(url, { headers: { Origin: "https://attacker.invalid" }, data: input })).status()).toBe(403);
  expect((await context.request.delete(url, { headers: { Origin: "https://attacker.invalid" } })).status()).toBe(403);
  expect((await context.request.delete(url)).status()).toBe(403);
  expect((await (await context.request.get(url)).json()).transaction).toEqual(transaction);
});

test("deleting an owned transaction persists and leaves categories and another user's data intact", async ({ context, browser }) => {
  const a = await setup(context);
  const other = await browser.newContext();
  try {
    const b = await setup(other, users[1].id);
    const response = await context.request.delete(a.url, { headers: { Origin: origin } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect((await context.request.get(a.url)).status()).toBe(404);
    expect((await context.request.delete(a.url, { headers: { Origin: origin } })).status()).toBe(404);
    expect((await (await context.request.get("/api/transactions")).json()).transactions).toEqual([]);
    expect((await (await context.request.get("/api/categories")).json()).categories).toEqual(a.categories);
    expect((await (await other.request.get(b.url)).json()).transaction).toEqual(b.transaction);
  } finally { await other.close(); }
});

test("concurrent edit and delete cannot recreate a deleted record", async ({ context }) => {
  const { input, url } = await setup(context);
  const [edit, deletion] = await Promise.all([
    put(context, url, { ...input, amount: "20.01" }),
    context.request.delete(url, { headers: { Origin: origin } }),
  ]);
  expect([200, 404]).toContain(edit.status());
  expect(deletion.status()).toBe(200);
  expect((await context.request.get(url)).status()).toBe(404);
  expect((await (await context.request.get("/api/transactions")).json()).transactions).toEqual([]);
});

test("browser opens fresh values, edits all fields, persists after reload and can cancel editing", async ({ context, page }, testInfo) => {
  const { input, matching, url } = await setup(context);
  await page.goto("/dashboard");
  await expect(history(page).getByText("รายการเดิม", { exact: true })).toBeVisible();
  // A change from another device after list loading must be read when the editor opens.
  expect((await put(context, url, { ...input, amount: "101.99" })).status()).toBe(200);
  const dialog = await openEdit(page);
  await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("101.99");
  await expect(dialog.getByLabel("วันที่ (เวลาไทย)")).toHaveValue(input.date);
  await expect(dialog.getByRole("radio", { name: "รายจ่าย", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "รายรับ", exact: true })).toBeDisabled();
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("543.21");
  await dialog.getByLabel("วันที่ (เวลาไทย)").fill("2024-02-29");
  await dialog.getByLabel("หมวดหมู่", { exact: true }).click();
  await expect(page.getByRole("option", { name: "เงินเดือน", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: matching[1].name, exact: true }).click();
  await dialog.getByLabel("คำอธิบาย (ไม่บังคับ)").fill("แก้ผ่านหน้าจอแล้ว");
  await expect(page.getByRole("option", { name: matching[1].name, exact: true })).toBeHidden();
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.screenshot({ path: testInfo.outputPath("edit-dialog.png") });
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("แก้ไขรายการแล้ว", { exact: true })).toBeVisible();
  await expect(history(page).getByText("−543.21 บาท", { exact: true })).toBeVisible();
  await expect(history(page)).toContainText("29/02/2024");
  await expect(history(page)).toContainText(matching[1].name);
  await page.reload();
  await expect(history(page)).toContainText("แก้ผ่านหน้าจอแล้ว");
  const again = await openEdit(page);
  await again.getByLabel("จำนวนเงิน (บาท)").fill("999.99");
  await again.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(again).toHaveCount(0);
  expect((await (await context.request.get(url)).json()).transaction.amount).toBe("543.21");
  await expect(history(page)).toContainText("−543.21 บาท");
});

test("browser rejects invalid edits without mutation or success feedback", async ({ context, page }) => {
  const { transaction, url } = await setup(context);
  await page.goto("/dashboard");
  const dialog = await openEdit(page);
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "PUT") writes++; });
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("0.001");
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog.getByText("กรอกจำนวนเงินมากกว่า 0 ถึง 21,474,836.47 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง", { exact: true })).toBeVisible();
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("1.00");
  await dialog.getByLabel("วันที่ (เวลาไทย)").fill("2999-01-01");
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog.getByText("บันทึกได้เฉพาะวันที่ถูกต้อง วันนี้หรือย้อนหลัง ตามเวลาไทย", { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await expect(page.getByText("แก้ไขรายการแล้ว", { exact: true })).toHaveCount(0);
  expect((await (await context.request.get(url)).json()).transaction).toEqual(transaction);
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(history(page)).toContainText("รายการเดิม");
});

test("canceling delete sends no request and confirming removes the record after reload", async ({ context, page }, testInfo) => {
  const { transaction, url } = await setup(context);
  await page.goto("/dashboard");
  let deletes = 0;
  page.on("request", (request) => { if (request.method() === "DELETE") deletes++; });
  await history(page).getByRole("button", { name: "ลบ", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ยืนยันการลบรายการ", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("100.25 บาท");
  await expect(dialog).toContainText("รายการเดิม");
  await expect(dialog.getByRole("button", { name: "ยืนยันลบรายการ", exact: true })).toBeInViewport();
  await dialog.screenshot({ path: testInfo.outputPath("delete-dialog.png") });
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toBe(0);
  expect((await (await context.request.get(url)).json()).transaction).toEqual(transaction);
  await expect(page.getByText("ลบรายการแล้ว", { exact: true })).toHaveCount(0);
  await history(page).getByRole("button", { name: "ลบ", exact: true }).click();
  await dialog.getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("ลบรายการแล้ว", { exact: true })).toBeVisible();
  await expect(history(page).locator("li")).toHaveCount(0);
  expect((await context.request.get(url)).status()).toBe(404);
  await page.reload();
  await expect(page.getByText("ยังไม่มีรายการ", { exact: false })).toBeVisible();
});

test("failed edit/delete retains the record and draft; pending actions prevent repeated submissions", async ({ context, page }) => {
  const { url } = await setup(context);
  await page.goto("/dashboard");
  const dialog = await openEdit(page);
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("88.99");
  await dialog.getByLabel("คำอธิบาย (ไม่บังคับ)").fill("ร่างที่ยังอยู่");
  let failEdit = true;
  let failDelete = true;
  let releaseEdit!: () => void;
  let releaseDelete!: () => void;
  const editGate = new Promise<void>((resolve) => { releaseEdit = resolve; });
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  await page.route(`**${url}`, async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      if (failEdit) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "แก้ไขไม่สำเร็จ กรุณาลองอีกครั้ง" }) });
      await editGate;
    }
    if (method === "DELETE") {
      if (failDelete) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ลบไม่สำเร็จ กรุณาลองอีกครั้ง" }) });
      await deleteGate;
    }
    return route.continue();
  });
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog.getByText("แก้ไขไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("88.99");
  await expect(dialog.getByLabel("คำอธิบาย (ไม่บังคับ)")).toHaveValue("ร่างที่ยังอยู่");
  await expect(history(page)).toContainText("−100.25 บาท");
  await expect(page.getByText("แก้ไขรายการแล้ว", { exact: true })).toHaveCount(0);
  failEdit = false;
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "กำลังบันทึก…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled();
  releaseEdit();
  await expect(dialog).toHaveCount(0);
  await expect(history(page)).toContainText("−88.99 บาท");
  await history(page).getByRole("button", { name: "ลบ", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "ยืนยันการลบรายการ", exact: true });
  await deletion.getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
  await expect(deletion.getByText("ลบไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(history(page)).toContainText("−88.99 บาท");
  await expect(page.getByText("ลบรายการแล้ว", { exact: true })).toHaveCount(0);
  expect((await context.request.get(url)).status()).toBe(200);
  failDelete = false;
  await deletion.getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
  await expect(deletion.getByRole("button", { name: "กำลังลบ…" })).toBeDisabled();
  await expect(deletion.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled();
  await expect(history(page).locator("li")).toHaveCount(1);
  releaseDelete();
  await expect(deletion).toHaveCount(0);
  await expect(history(page).locator("li")).toHaveCount(0);
});

test("failed editor load can retry without losing the listed transaction", async ({ context, page }) => {
  const { url } = await setup(context);
  await page.goto("/dashboard");
  let fail = true;
  await page.route(`**${url}`, (route) => fail
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "โหลดรายการไม่สำเร็จ" }) })
    : route.continue());
  await history(page).getByRole("button", { name: "แก้ไข", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "แก้ไขรายการ", exact: true });
  await expect(dialog.getByText("โหลดรายการไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true })).toBeDisabled();
  await expect(history(page)).toContainText("รายการเดิม");
  fail = false;
  await dialog.getByRole("button", { name: "ลองโหลดรายการอีกครั้ง", exact: true }).click();
  await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("100.25");
});

test("confirmed edit is reflected even if refreshing the history fails", async ({ context, page }) => {
  const { url } = await setup(context);
  await page.goto("/dashboard");
  const dialog = await openEdit(page);
  await page.route("**/api/transactions", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) }));
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("67.89");
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("แก้ไขรายการแล้ว", { exact: true })).toBeVisible();
  await expect(page.getByText("โหลดรายการไม่สำเร็จ กดโหลดรายการใหม่เพื่อลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(history(page)).toContainText("−67.89 บาท");
  expect((await (await context.request.get(url)).json()).transaction.amount).toBe("67.89");
});

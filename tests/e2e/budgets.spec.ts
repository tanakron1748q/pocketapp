import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { BudgetReport, Category } from "../../src/lib/finance";

const db = createTestDatabase();
const headers = { Origin: "http://localhost:3100" };
const users = [
  { id: "budget-a", name: "ผู้ตั้งงบ ก", email: "budget-a@example.test" },
  { id: "budget-b", name: "ผู้ตั้งงบ ข", email: "budget-b@example.test" },
];
async function setup(context: BrowserContext, userId = users[0].id) {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  return { category: categories.find((c) => c.type === "EXPENSE")!, income: categories.find((c) => c.type === "INCOME")! };
}
async function save(context: BrowserContext, categoryId: string, month: string, amount: string, scope = "DEFAULT") {
  return context.request.put("/api/budgets", { headers, data: { categoryId, month, amount, scope } });
}
async function report(context: BrowserContext, month: string): Promise<BudgetReport> {
  const response = await context.request.get(`/api/budgets?month=${month}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}
async function entry(context: BrowserContext, categoryId: string, amount: string, date: string) {
  const response = await context.request.post("/api/transactions", { headers, data: { type: "EXPENSE", categoryId, amount, date } });
  expect(response.status()).toBe(201);
  return (await response.json()).transaction;
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  const where = { userId: { in: users.map((u) => u.id) } };
  await db.refund.deleteMany({ where });
  await db.transaction.deleteMany({ where });
  await db.budgetSetting.deleteMany({ where });
  await db.category.deleteMany({ where });
});
test.afterAll(async () => { await db.$disconnect(); });

test("effective defaults, isolated overrides, year boundaries, zero and no rollover persist across devices", async ({ context, browser }) => {
  const { category } = await setup(context);
  expect((await report(context, "2024-11")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: null, remaining: null });
  expect((await save(context, category.id, "2024-12", "100.25")).status()).toBe(200);
  expect((await save(context, category.id, "2025-01", "80.01", "MONTH")).status()).toBe(200);
  expect((await save(context, category.id, "2025-03", "200.10")).status()).toBe(200);
  await entry(context, category.id, "10.01", "2024-12-31");
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    for (const [month, amount, remaining] of [["2024-12", "100.25", "90.24"], ["2025-01", "80.01", "80.01"], ["2025-02", "100.25", "100.25"], ["2025-03", "200.10", "200.10"]]) {
      expect((await report(device, month)).categories.find((c) => c.id === category.id)).toMatchObject({ amount, remaining });
    }
    expect((await save(device, category.id, "2025-01", "0", "MONTH")).status()).toBe(200);
    expect((await report(context, "2025-01")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "0.00", overrideAmount: "0.00" });
    expect((await save(context, category.id, "2025-01", "150.00")).status()).toBe(200);
    expect((await report(device, "2025-01")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "0.00", defaultAmount: "150.00" });
    expect((await report(device, "2025-02")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "150.00" });
    expect((await report(device, "2025-03")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "200.10" });
    expect((await report(device, "2024-12")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "100.25" });
  } finally { await device.close(); }
});

test("receipt-period refunds, corrected categories, archived history and overspending use exact signed amounts", async ({ context }) => {
  const { category } = await setup(context);
  await save(context, category.id, "2024-01", "50.01");
  const expense = await entry(context, category.id, "100.25", "2024-01-31");
  expect((await context.request.post(`/api/transactions/${expense.id}/refunds`, { headers, data: { amount: "40.01", date: "2024-02-29" } })).status()).toBe(201);
  expect((await report(context, "2024-01")).categories.find((c) => c.id === category.id)).toMatchObject({ netExpense: "100.25", remaining: "-50.24" });
  await entry(context, category.id, "0.01", "2024-01-31");
  expect((await report(context, "2024-01")).categories.find((c) => c.id === category.id)).toMatchObject({ remaining: "-50.25" });
  expect((await report(context, "2024-02")).categories.find((c) => c.id === category.id)).toMatchObject({ netExpense: "-40.01", remaining: "90.02" });
  expect((await report(context, "2024-03")).categories.find((c) => c.id === category.id)).toMatchObject({ netExpense: "0.00", remaining: "50.01" });
  const response = await context.request.post("/api/categories", { headers, data: { name: "หมวดย้ายเงินคืน", type: "EXPENSE" } });
  const changed: Category = (await response.json()).category;
  await save(context, changed.id, "2024-01", "10.00");
  expect((await context.request.put(`/api/transactions/${expense.id}`, { headers, data: { categoryId: changed.id, amount: "100.25", date: "2024-01-31" } })).status()).toBe(200);
  expect((await report(context, "2024-02")).categories.find((c) => c.id === category.id)).toMatchObject({ netExpense: "0.00", remaining: "50.01" });
  await context.request.patch(`/api/categories/${changed.id}`, { headers, data: { name: "ประวัติงบ" } });
  await context.request.patch(`/api/categories/${changed.id}`, { headers, data: { archived: true } });
  expect((await report(context, "2024-02")).categories.find((c) => c.id === changed.id)).toMatchObject({ name: "ประวัติงบ", archived: true, netExpense: "-40.01", remaining: "50.01" });
  expect((await save(context, changed.id, "2024-02", "1.00")).status()).toBe(404);
});

test("HTTP rejects foreign categories, ownership injection, invalid inputs, missing sessions and cross-origin writes", async ({ context, browser }) => {
  const { category, income } = await setup(context);
  await save(context, category.id, "2024-01", "99.99");
  const other = await browser.newContext();
  const guest = await browser.newContext();
  try {
    const b = await setup(other, users[1].id);
    expect((await report(other, "2024-01")).categories.some((c) => c.id === category.id)).toBe(false);
    expect((await save(other, category.id, "2024-01", "1.00")).status()).toBe(404);
    expect((await save(context, b.category.id, "2024-01", "1.00")).status()).toBe(404);
    expect((await save(context, income.id, "2024-01", "1.00")).status()).toBe(404);
    expect((await save(context, "missing", "2024-01", "1.00")).status()).toBe(404);
    const valid = { categoryId: category.id, month: "2024-01", amount: "1.00", scope: "MONTH" };
    for (const data of [{ ...valid, userId: users[1].id }, { ...valid, amount: 1 }, { ...valid, scope: "ALL" }, { ...valid, month: "0000-01" }, { ...valid, month: "2024-13" }]) {
      expect((await context.request.put("/api/budgets", { headers, data })).status()).toBe(422);
    }
    for (const amount of ["-1", "1.001", "21474836.48", "1e2", ""]) expect((await save(context, category.id, "2024-01", amount)).status()).toBe(422);
    expect((await context.request.put("/api/budgets", { data: valid })).status()).toBe(403);
    expect((await context.request.put("/api/budgets", { headers: { Origin: "https://attacker.test" }, data: valid })).status()).toBe(403);
    expect((await context.request.put("/api/budgets", { headers, data: "plain text" })).status()).toBe(415);
    expect((await context.request.put("/api/budgets", { headers: { ...headers, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
    expect((await guest.request.get("/api/budgets")).status()).toBe(401);
    expect((await guest.request.put("/api/budgets", { headers, data: valid })).status()).toBe(401);
    for (const query of ["month=2024-13", "month=0000-01", `month=2024-01&userId=${users[1].id}`]) expect((await context.request.get(`/api/budgets?${query}`)).status()).toBe(400);
    expect((await report(context, "2024-01")).categories.find((c) => c.id === category.id)).toMatchObject({ amount: "99.99" });
  } finally { await other.close(); await guest.close(); }
});

test("browser saves defaults and overrides, displays refund usage and permits entries after overspending", async ({ context, page }, testInfo) => {
  const { category } = await setup(context);
  const expense = await entry(context, category.id, "100.25", "2024-01-31");
  await context.request.post(`/api/transactions/${expense.id}/refunds`, { headers, data: { amount: "40.01", date: "2024-02-29" } });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", { name: "งบรายเดือน", exact: true });
  const card = panel.getByRole("listitem").filter({ has: page.getByRole("heading", { name: category.name, exact: true }) });
  const dialog = page.getByRole("dialog", { name: "ตั้งงบหมวดรายจ่าย", exact: true });
  const today = (await (await context.request.get("/api/categories")).json()).today;
  await expect(panel.getByLabel("เดือนงบ (เวลาไทย)")).toHaveValue(today.slice(0, 7));
  await panel.getByLabel("เดือนงบ (เวลาไทย)").fill("2024-01");
  await expect(card).toContainText("ยังไม่ได้ตั้งงบ");
  await card.getByRole("button", { name: "ตั้งงบ", exact: true }).click();
  await dialog.getByRole("radio", { name: "ค่าตั้งต้นตั้งแต่เดือนนี้เป็นต้นไป", exact: true }).check();
  await dialog.getByLabel("งบ (บาท)").fill("50.01");
  await dialog.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("ใช้เกินงบ 50.24 บาท");
  await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("0.01");
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2024-01-31");
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: category.name, exact: true }).click();
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(card).toContainText("ใช้เกินงบ 50.25 บาท");
  await panel.getByLabel("เดือนงบ (เวลาไทย)").fill("2024-02");
  await expect(card).toContainText("ใช้ไปสุทธิ -40.01 บาท");
  await expect(card).toContainText("คงเหลือ 90.02 บาท");
  await card.getByRole("button", { name: "ตั้งงบ", exact: true }).click();
  await dialog.getByLabel("งบ (บาท)").fill("10.00");
  await dialog.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
  await expect(card).toContainText("ปรับเฉพาะเดือนนี้");
  await expect(card).toContainText("คงเหลือ 50.01 บาท");
  await panel.getByLabel("เดือนงบ (เวลาไทย)").fill("2024-03");
  await expect(card).toContainText("คงเหลือ 50.01 บาท");
  await expect(card).toContainText("ค่าตั้งต้นตั้งแต่ 2024-01");
  await page.reload();
  await panel.getByLabel("เดือนงบ (เวลาไทย)").fill("2024-02");
  await expect(card).toContainText("ปรับเฉพาะเดือนนี้");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("budgets.png") });
});

test("browser retries loading, validates amounts, preserves failed drafts and prevents duplicate saves", async ({ context, page }) => {
  const { category } = await setup(context);
  let failLoad = true;
  let failSave = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/budgets**", async (route) => {
    if (route.request().method() === "GET" && failLoad) return route.fulfill({ status: 503, json: { error: "โหลดงบไม่สำเร็จ" } });
    if (route.request().method() === "PUT") {
      if (failSave) return route.fulfill({ status: 503, json: { error: "บันทึกงบไม่สำเร็จ" } });
      await gate;
    }
    return route.continue();
  });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", { name: "งบรายเดือน", exact: true });
  await expect(panel.getByRole("alert")).toContainText("โหลดงบไม่สำเร็จ");
  failLoad = false;
  await panel.getByRole("button", { name: "ลองโหลดงบอีกครั้ง" }).click();
  const card = panel.getByRole("listitem").filter({ has: page.getByRole("heading", { name: category.name, exact: true }) });
  await card.getByRole("button", { name: "ตั้งงบ", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ตั้งงบหมวดรายจ่าย", exact: true });
  for (const amount of ["-1", "0.001", "21474836.48"]) {
    await dialog.getByLabel("งบ (บาท)").fill(amount);
    await dialog.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
    await expect(dialog).toContainText("ทศนิยมไม่เกิน 2 ตำแหน่ง");
  }
  await dialog.getByLabel("งบ (บาท)").fill("0");
  await dialog.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("บันทึกงบไม่สำเร็จ");
  await expect(dialog.getByLabel("งบ (บาท)")).toHaveValue("0");
  failSave = false;
  await dialog.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /บันทึกงบ/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("งบ 0.00 บาท");
  await expect(card).toContainText("คงเหลือ 0.00 บาท");
});

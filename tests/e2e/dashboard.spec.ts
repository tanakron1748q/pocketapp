import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { BudgetReport, Category, DashboardReport, Transaction, TransactionDraft } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const headers = { Origin: origin };
const users = ["dashboard-a", "dashboard-b"];

async function entry(context: BrowserContext, data: TransactionDraft): Promise<Transaction> {
  const response = await context.request.post("/api/transactions", { headers, data });
  expect(response.status()).toBe(201);
  return (await response.json()).transaction;
}
async function seed(context: BrowserContext, userId = users[0]) {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const expense = categories.filter((c) => c.type === "EXPENSE");
  const income = categories.find((c) => c.type === "INCOME")!;
  const source = await entry(context, { type: "EXPENSE", categoryId: expense[0].id, amount: "100.25", date: "2024-01-31", description: "ต้นทางมกราคม" });
  await entry(context, { type: "INCOME", categoryId: income.id, amount: "0.10", date: "2024-01-01" });
  await entry(context, { type: "INCOME", categoryId: income.id, amount: "0.20", date: "2024-01-31" });
  const february: Transaction[] = [];
  for (const data of [
    { type: "INCOME" as const, categoryId: income.id, amount: "20.01", date: "2024-02-01", description: "รับต้นเดือน" },
    { type: "INCOME" as const, categoryId: income.id, amount: "20.02", date: "2024-02-29", description: "รับปลายเดือน" },
    { type: "EXPENSE" as const, categoryId: expense[0].id, amount: "10.01", date: "2024-02-01", description: "จ่ายหมวดได้เงินคืน" },
    { type: "EXPENSE" as const, categoryId: expense[1].id, amount: "25.01", date: "2024-02-29", description: "จ่ายหมวดบวก" },
  ]) february.push(await entry(context, data));
  const refund = await context.request.post(`/api/transactions/${source.id}/refunds`, { headers, data: { amount: "40.01", date: "2024-02-29" } });
  expect(refund.status()).toBe(201);
  expect((await context.request.put("/api/budgets", { headers, data: { categoryId: expense[0].id, month: "2024-01", amount: "50.01", scope: "DEFAULT" } })).status()).toBe(200);
  return { source, expense, income, february, refund: (await refund.json()).refund };
}
async function report(context: BrowserContext, month?: string): Promise<DashboardReport> {
  const response = await context.request.get(`/api/dashboard${month ? `?month=${month}` : ""}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.user.createMany({ data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })) });
});
test.beforeEach(async () => {
  const where = { userId: { in: users } };
  await db.refund.deleteMany({ where });
  await db.transaction.deleteMany({ where });
  await db.budgetSetting.deleteMany({ where });
  await db.category.deleteMany({ where });
});
test.afterAll(async () => { await db.$disconnect(); });

test("HTTP defaults to the Thai month and returns zeroes and no recent records for an empty month", async ({ context }) => {
  await authenticate(context, db, users[0]);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
  expect(await report(context)).toMatchObject({ month: today, income: "0.00", expense: "0.00", refunded: "0.00", netExpense: "0.00", monthlyNet: "0.00", categories: [], recentTransactions: [] });
  expect(await report(context, "2024-02")).toMatchObject({ month: "2024-02", monthlyNet: "0.00", categories: [], recentTransactions: [] });
});

test("HTTP computes exact monthly cash flow, signed categories, receipt-period refunds and consistent budget usage", async ({ context }) => {
  const a = await seed(context);
  expect(await report(context, "2024-01")).toMatchObject({ income: "0.30", expense: "100.25", refunded: "0.00", netExpense: "100.25", monthlyNet: "-99.95" });
  const feb = await report(context, "2024-02");
  expect(feb).toMatchObject({ income: "40.03", expense: "35.02", refunded: "40.01", netExpense: "-4.99", monthlyNet: "45.02" });
  expect(feb.categories.find((c) => c.id === a.expense[0].id)).toMatchObject({ expense: "10.01", refunded: "40.01", netExpense: "-30.00" });
  expect(feb.categories.find((c) => c.id === a.expense[1].id)).toMatchObject({ netExpense: "25.01" });
  expect(feb.recentTransactions.map((t) => t.id).sort()).toEqual(a.february.map((t) => t.id).sort());
  expect(feb.recentTransactions.some((t) => t.id === a.source.id)).toBe(false);
  const budgets: BudgetReport = await (await context.request.get("/api/budgets?month=2024-02")).json();
  expect(budgets.categories.find((c) => c.id === a.expense[0].id)).toMatchObject({ amount: "50.01", netExpense: "-30.00", remaining: "80.01" });
  expect(await report(context, "2024-03")).toMatchObject({ income: "0.00", expense: "0.00", refunded: "0.00", monthlyNet: "0.00", categories: [], recentTransactions: [] });
  // Corrections, archived categories and refund receipt dates remain live report inputs.
  await context.request.patch(`/api/categories/${a.expense[0].id}`, { headers, data: { name: "ประวัติรายงาน" } });
  await context.request.patch(`/api/categories/${a.expense[0].id}`, { headers, data: { archived: true } });
  expect((await report(context, "2024-02")).categories.find((c) => c.id === a.expense[0].id)).toMatchObject({ name: "ประวัติรายงาน", netExpense: "-30.00" });
  await context.request.put(`/api/transactions/${a.source.id}/refunds/${a.refund.id}`, { headers, data: { amount: "40.01", date: "2024-03-01" } });
  expect(await report(context, "2024-02")).toMatchObject({ netExpense: "35.02", monthlyNet: "5.01" });
  expect(await report(context, "2024-03")).toMatchObject({ income: "0.00", netExpense: "-40.01", monthlyNet: "40.01" });
});

test("recent records are limited to five in the selected month and large totals retain satang precision", async ({ context }) => {
  const a = await seed(context);
  for (let i = 0; i < 7; i++) await entry(context, { type: "INCOME", categoryId: a.income.id, amount: "21474836.47", date: "2024-12-31", description: `ล่าสุด ${i}` });
  await entry(context, { type: "EXPENSE", categoryId: a.expense[0].id, amount: "0.01", date: "2025-01-01" });
  const data = await report(context, "2024-12");
  expect(data.income).toBe("150323855.29");
  expect(data.monthlyNet).toBe("150323855.29");
  const history = await (await context.request.get("/api/transactions?startDate=2024-12-01&endDate=2024-12-31")).json();
  expect(data.recentTransactions).toEqual(history.transactions.slice(0, 5));
  expect(await report(context, "2025-01")).toMatchObject({ income: "0.00", netExpense: "0.01", monthlyNet: "-0.01" });
});

test("dashboard reports reject forged queries and sessions, stay private across account changes and cannot be shared-cached", async ({ context, browser, request }) => {
  const a = await seed(context);
  const other = await browser.newContext();
  try {
    await authenticate(other, db, users[1]);
    expect(await report(other, "2024-02")).toMatchObject({ income: "0.00", categories: [], recentTransactions: [] });
    expect((await request.get("/api/dashboard?month=2024-02")).status()).toBe(401);
    const invalid = ["month=0000-01", "month=2024-13", "month=2024-2", "month=2024-02-01", `month=2024-02&userId=${users[0]}`, `categoryId=${a.expense[0].id}`];
    for (const query of invalid) expect((await other.request.get(`/api/dashboard?${query}`)).status()).toBe(400);
    // Same URL and same browser session after switching cookies must return B's data.
    await authenticate(context, db, users[1]);
    const switched = await context.request.get("/api/dashboard?month=2024-02", { headers: { "Cache-Control": "max-age=3600" } });
    expect(switched.headers()["cache-control"]).toBe("private, no-store");
    expect(await switched.json()).toMatchObject({ income: "0.00", categories: [], recentTransactions: [] });
    expect((await report(context, "2024-02")).recentTransactions.some((t) => t.id === a.source.id)).toBe(false);
  } finally { await other.close(); }
});

test("browser uses Thai month boundaries, synchronizes budgets, and draws both negative and positive category bars", async ({ context, page }, testInfo) => {
  await seed(context);
  await page.clock.setFixedTime(new Date("2024-03-01T00:30:00+07:00"));
  await page.goto("/dashboard");
  const overview = page.getByRole("region", { name: "ภาพรวมรายเดือน", exact: true });
  const budgets = page.getByRole("region", { name: "งบรายเดือน", exact: true });
  await expect(overview.getByLabel("เดือน (เวลาไทย)")).toHaveValue("2024-03");
  await expect(budgets.getByLabel("เดือนงบ (เวลาไทย)")).toHaveValue("2024-03");
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toContainText("0.00 บาท");
  await expect(overview).toContainText("ยังไม่มีรายจ่ายหรือเงินคืนในเดือนนี้");
  await expect(overview).toContainText("ยังไม่มีรายการในเดือนนี้");
  await overview.getByLabel("เดือน (เวลาไทย)").fill("2024-02");
  await expect(budgets.getByLabel("เดือนงบ (เวลาไทย)")).toHaveValue("2024-02");
  await expect(overview.getByRole("region", { name: "รายรับประจำเดือน", exact: true })).toContainText("40.03 บาท");
  await expect(overview.getByRole("region", { name: "รายจ่ายสุทธิรายเดือน", exact: true })).toContainText("รายจ่ายสุทธิ -4.99 บาท");
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toContainText("45.02 บาท");
  await expect(overview).toContainText("ไม่ใช่ยอดเงินธนาคารหรือกระเป๋าทั้งหมด");
  await expect(budgets).toContainText("คงเหลือ 80.01 บาท");
  const amounts = overview.getByRole("list", { name: "ยอดรายจ่ายสุทธิแต่ละหมวด" });
  await expect(amounts).toContainText("สุทธิ -30.00 บาท");
  await expect(amounts).toContainText("สุทธิ 25.01 บาท");
  const chart = overview.getByRole("img", { name: "กราฟแท่งรายจ่ายสุทธิ ค่าติดลบอยู่ซ้ายศูนย์ ค่าบวกอยู่ขวาศูนย์", exact: true });
  await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(2);
  const categories = (await report(context, "2024-02")).categories;
  const zero = (await chart.locator(".recharts-reference-line-line").boundingBox())!;
  for (let i = 0; i < categories.length; i++) {
    const bar = (await chart.locator(".recharts-bar-rectangle").nth(i).boundingBox())!;
    expect(bar.width).toBeGreaterThan(0);
    if (categories[i].netExpense.startsWith("-")) expect(bar.x + bar.width).toBeLessThanOrEqual(zero.x + 1);
    else expect(bar.x).toBeGreaterThanOrEqual(zero.x - 1);
  }
  await expect(overview.getByRole("list", { name: "รายการล่าสุดของเดือน" }).locator("li")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await overview.screenshot({ path: testInfo.outputPath("dashboard.png") });
  // Changing the existing budget control also updates the entire overview.
  await budgets.getByLabel("เดือนงบ (เวลาไทย)").fill("2024-01");
  await expect(overview.getByLabel("เดือน (เวลาไทย)")).toHaveValue("2024-01");
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toContainText("-99.95 บาท");
  await expect(budgets).toContainText("ใช้เกินงบ 50.24 บาท");
});

test("browser refreshes the selected report after entries, recovers from report failures and clears data on account change", async ({ context, page }) => {
  const a = await seed(context);
  let fail = true;
  await page.route("**/api/dashboard?**", (route) => fail
    ? route.fulfill({ status: 503, json: { error: "โหลดภาพรวมไม่สำเร็จ" } }) : route.continue());
  await page.goto("/dashboard");
  const overview = page.getByRole("region", { name: "ภาพรวมรายเดือน", exact: true });
  await expect(overview.getByRole("alert")).toContainText("โหลดภาพรวมไม่สำเร็จ");
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toHaveCount(0);
  fail = false;
  await overview.getByRole("button", { name: "ลองโหลดภาพรวมอีกครั้ง" }).click();
  await overview.getByLabel("เดือน (เวลาไทย)").fill("2024-02");
  await expect(overview).toContainText("รายจ่ายสุทธิ -4.99 บาท");
  await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("0.01");
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2024-02-29");
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: a.expense[0].name, exact: true }).click();
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(overview).toContainText("รายจ่ายสุทธิ -4.98 บาท");
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toContainText("45.01 บาท");
  await expect(page.getByRole("region", { name: "งบรายเดือน", exact: true })).toContainText("คงเหลือ 80.00 บาท");
  await expect(overview.getByRole("list", { name: "รายการล่าสุดของเดือน" }).locator("li")).toHaveCount(5);
  // Failure in a newly selected month never presents the previous month's totals as current.
  fail = true;
  await overview.getByLabel("เดือน (เวลาไทย)").fill("2024-01");
  await expect(overview.getByRole("alert")).toBeVisible();
  await expect(overview.getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toHaveCount(0);
  fail = false;
  await overview.getByRole("button", { name: "ลองโหลดภาพรวมอีกครั้ง" }).click();
  await expect(overview).toContainText("รายจ่ายสุทธิ 100.25 บาท");
  await authenticate(context, db, users[1]);
  await page.reload();
  await overview.getByLabel("เดือน (เวลาไทย)").fill("2024-02");
  await expect(overview).toContainText("รายจ่ายสุทธิ 0.00 บาท");
  await expect(overview.getByRole("list", { name: "รายการล่าสุดของเดือน" })).toHaveCount(0);
  await expect(overview).not.toContainText(a.expense[0].name);
});

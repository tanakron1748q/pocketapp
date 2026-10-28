import { writeFile, rename } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, DashboardReport, Transaction } from "../../src/lib/finance";

const db = createTestDatabase();
const headers = { Origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3100" };
const users = ["comparison-a", "comparison-b"];

async function serverTime(value = "") {
  const file = process.env.POCKETAPP_TEST_CLOCK_FILE;
  if (!file) throw new Error("Run comparisons through pnpm test:e2e");
  // Atomic replacement keeps background session requests from reading a partial clock.
  await writeFile(`${file}.next`, value);
  await rename(`${file}.next`, file);
}
async function setup(context: BrowserContext, userId = users[0]) {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  return { income: categories.find((c) => c.type === "INCOME")!, expense: categories.find((c) => c.type === "EXPENSE")! };
}
async function entry(context: BrowserContext, category: Category, date: string, amount: string): Promise<Transaction> {
  const response = await context.request.post("/api/transactions", { headers, data: { type: category.type, categoryId: category.id, date, amount } });
  expect(response.status()).toBe(201);
  return (await response.json()).transaction;
}
async function refund(context: BrowserContext, expenseId: string, date: string, amount: string) {
  const response = await context.request.post(`/api/transactions/${expenseId}/refunds`, { headers, data: { date, amount } });
  expect(response.status()).toBe(201);
}
async function report(context: BrowserContext, month: string): Promise<DashboardReport> {
  const response = await context.request.get(`/api/dashboard?month=${month}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}
function shift(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.user.createMany({ data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })) });
});
test.beforeEach(async () => {
  await serverTime();
  const where = { userId: { in: users } };
  await db.refund.deleteMany({ where });
  await db.transaction.deleteMany({ where });
});
test.afterEach(async () => { await serverTime(); });
test.afterAll(async () => { await db.$disconnect(); });

const periods = [
  { today: "2024-03-31", month: "2024-03", currentEnd: "2024-03-31", previousStart: "2024-02-01", previousEnd: "2024-02-29", mode: "elapsed" },
  { today: "2025-03-31", month: "2025-03", currentEnd: "2025-03-31", previousStart: "2025-02-01", previousEnd: "2025-02-28", mode: "elapsed" },
  { today: "2024-02-29", month: "2024-02", currentEnd: "2024-02-29", previousStart: "2024-01-01", previousEnd: "2024-01-29", mode: "elapsed" },
  { today: "2025-01-01", month: "2025-01", currentEnd: "2025-01-01", previousStart: "2024-12-01", previousEnd: "2024-12-01", mode: "elapsed" },
  { today: "2024-05-31", month: "2024-05", currentEnd: "2024-05-31", previousStart: "2024-04-01", previousEnd: "2024-04-30", mode: "elapsed" },
  { today: "2024-03-15", month: "2024-02", currentEnd: "2024-02-29", previousStart: "2024-01-01", previousEnd: "2024-01-31", mode: "full" },
  { today: "2025-04-05", month: "2025-02", currentEnd: "2025-02-28", previousStart: "2025-01-01", previousEnd: "2025-01-31", mode: "full" },
  { today: "2025-01-01", month: "2024-12", currentEnd: "2024-12-31", previousStart: "2024-11-01", previousEnd: "2024-11-30", mode: "full" },
];
for (const scenario of periods) test(`HTTP ${scenario.today} compares ${scenario.month} with explicit ${scenario.mode} boundaries`, async ({ context }) => {
  const { income } = await setup(context);
  const currentStart = `${scenario.month}-01`;
  const dates = [...new Set([shift(scenario.previousStart, -1), scenario.previousStart, scenario.previousEnd, shift(scenario.previousEnd, 1), currentStart, scenario.currentEnd, shift(scenario.currentEnd, 1)])];
  for (let i = 0; i < dates.length; i++) await entry(context, income, dates[i], `${i + 1}.01`);
  await serverTime(`${scenario.today}T12:00:00+07:00`);
  const comparison = (await report(context, scenario.month)).comparison!;
  expect(comparison).toMatchObject({ mode: scenario.mode, asOfDate: scenario.today,
    current: { startDate: currentStart, endDate: scenario.currentEnd },
    previous: { startDate: scenario.previousStart, endDate: scenario.previousEnd },
  });
  // Verify amounts through the public filtered history with independently specified dates.
  for (const period of [comparison.current, comparison.previous]) {
    const response = await context.request.get(`/api/transactions?startDate=${period.startDate}&endDate=${period.endDate}&type=INCOME`);
    expect(response.status()).toBe(200);
    const records: Transaction[] = (await response.json()).transactions;
    const satang = records.reduce((sum, record) => sum + BigInt(record.amount.replace(".", "")), BigInt(0));
    expect(period.income).toBe(`${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, "0")}`);
    expect(period.monthlyNet).toBe(period.income);
    expect(period.netExpense).toBe("0.00");
  }
});

async function seedElapsed(context: BrowserContext) {
  const categories = await setup(context);
  const source = await entry(context, categories.expense, "2024-01-31", "100.00");
  for (const [date, amount] of [["2024-02-01", "20.01"], ["2024-02-15", "1.02"], ["2024-02-16", "1000.00"], ["2024-03-01", "8.01"], ["2024-03-15", "2.02"], ["2024-03-16", "400.00"]]) await entry(context, categories.income, date, amount);
  for (const [date, amount] of [["2024-02-01", "10.01"], ["2024-02-15", "5.02"], ["2024-02-16", "1000.00"], ["2024-03-01", "3.01"], ["2024-03-15", "4.02"], ["2024-03-16", "400.00"]]) await entry(context, categories.expense, date, amount);
  await refund(context, source.id, "2024-02-15", "7.01");
  await refund(context, source.id, "2024-03-15", "6.01");
  await serverTime("2024-03-15T12:00:00+07:00");
  return categories;
}

test("elapsed comparison excludes later days and counts refunds only in their receipt period", async ({ context }) => {
  await seedElapsed(context);
  const comparison = (await report(context, "2024-03")).comparison!;
  expect(comparison).toEqual({ mode: "elapsed", asOfDate: "2024-03-15",
    current: { startDate: "2024-03-01", endDate: "2024-03-15", income: "10.03", expense: "7.03", refunded: "6.01", netExpense: "1.02", monthlyNet: "9.01" },
    previous: { startDate: "2024-02-01", endDate: "2024-02-15", income: "21.03", expense: "15.03", refunded: "7.01", netExpense: "8.02", monthlyNet: "13.01" },
    change: { income: "-11.00", netExpense: "-7.00", monthlyNet: "-4.00" },
  });
});

test("zero and negative baselines use exact signed amount changes, and comparisons stay private", async ({ context, browser }) => {
  const { income, expense } = await setup(context);
  const source = await entry(context, expense, "2024-01-01", "100.00");
  await entry(context, income, "2024-04-01", "5.01");
  await entry(context, expense, "2024-04-10", "3.01");
  await serverTime("2024-04-10T12:00:00+07:00");
  let comparison = (await report(context, "2024-04")).comparison!;
  expect(comparison.previous).toMatchObject({ income: "0.00", netExpense: "0.00", monthlyNet: "0.00" });
  expect(comparison.change).toEqual({ income: "5.01", netExpense: "3.01", monthlyNet: "2.00" });
  await refund(context, source.id, "2024-03-05", "10.01");
  await refund(context, source.id, "2024-04-05", "20.01");
  comparison = (await report(context, "2024-04")).comparison!;
  expect(comparison.previous).toMatchObject({ netExpense: "-10.01", monthlyNet: "10.01" });
  expect(comparison.current).toMatchObject({ netExpense: "-17.00", monthlyNet: "22.01" });
  expect(comparison.change).toEqual({ income: "5.01", netExpense: "-6.99", monthlyNet: "12.00" });
  const other = await browser.newContext();
  try {
    await setup(other, users[1]);
    expect((await report(other, "2024-04")).comparison!.change).toEqual({ income: "0.00", netExpense: "0.00", monthlyNet: "0.00" });
    expect((await other.request.get(`/api/dashboard?month=2024-04&userId=${users[0]}`)).status()).toBe(400);
    expect((await context.request.get("/api/dashboard?month=2024-04&today=2024-04-30")).status()).toBe(400);
    expect((await report(context, "2024-05")).comparison).toBeNull();
    expect((await report(context, "0001-01")).comparison).toBeNull();
  } finally { await other.close(); }
});

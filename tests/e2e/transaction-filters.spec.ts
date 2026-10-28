import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, Transaction, TransactionDraft } from "../../src/lib/finance";

test.use({ timezoneId: "America/Los_Angeles" });

const db = createTestDatabase();
const users = ["filters-a", "filters-b"];
const origin = (process.env.BETTER_AUTH_URL ?? "http://localhost:3100");

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.user.createMany({ data: users.map((id) => ({ id, name: id, email: `${id}@example.test`, emailVerified: true })) });
});
test.beforeEach(async () => { await db.transaction.deleteMany({ where: { userId: { in: users } } }); });
test.afterAll(async () => { await db.$disconnect(); });

async function seed(context: BrowserContext, userId = users[0]) {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const expense = categories.filter((category) => category.type === "EXPENSE");
  const income = categories.find((category) => category.type === "INCOME")!;
  const records: Transaction[] = [];
  const inputs: TransactionDraft[] = [
    { type: "EXPENSE", categoryId: expense[0].id, amount: "1.00", date: "2024-01-31", description: "กาแฟ Coffee" },
    { type: "EXPENSE", categoryId: expense[0].id, amount: "2.00", date: "2024-02-01", description: "กาแฟ COFFEE 50%_\\" },
    { type: "EXPENSE", categoryId: expense[1].id, amount: "3.00", date: "2024-02-29", description: "กาแฟ coffee" },
    { type: "INCOME", categoryId: income.id, amount: "4.00", date: "2024-03-01", description: "กาแฟ Coffee" },
    { type: "EXPENSE", categoryId: expense[0].id, amount: "5.00", date: "2024-03-02" },
  ];
  for (const data of inputs) {
    const response = await context.request.post("/api/transactions", { headers: { Origin: origin }, data });
    expect(response.status()).toBe(201);
    records.push((await response.json()).transaction);
  }
  return { records, expense, income };
}

async function list(context: BrowserContext, params: Record<string, string> = {}) {
  const response = await context.request.get(`/api/transactions?${new URLSearchParams(params)}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return (await response.json()) as { transactions: Transaction[]; nextCursor: string | null };
}

test("HTTP single/combined filters use inclusive Thai business dates and literal case-insensitive descriptions", async ({ context }) => {
  const { records, expense } = await seed(context);
  const cases: [Record<string, string>, number[]][] = [
    [{ search: " COFFEE " }, [3, 2, 1, 0]],
    [{ search: "กาแฟ" }, [3, 2, 1, 0]],
    [{ search: "50%_\\" }, [1]],
    [{ search: "%" }, [1]],
    [{ type: "INCOME" }, [3]],
    [{ categoryId: expense[0].id }, [4, 1, 0]],
    [{ startDate: "2024-02-01", endDate: "2024-02-29" }, [2, 1]],
    [{ startDate: "2024-03-01" }, [4, 3]],
    [{ endDate: "2024-01-31" }, [0]],
    [{ startDate: "2024-02-01", endDate: "2024-02-01" }, [1]],
    [{ search: "coffee", type: "EXPENSE", categoryId: expense[0].id, startDate: "2024-02-01", endDate: "2024-02-29" }, [1]],
    [{ search: "ไม่ตรง" }, []],
    [{ type: "INCOME", categoryId: expense[0].id }, []],
    [{}, [4, 3, 2, 1, 0]],
  ];
  for (const [params, indexes] of cases) {
    expect((await list(context, params)).transactions).toEqual(indexes.map((i) => records[i]));
  }
  const invalid: Record<string, string>[] = [
    { startDate: "2024-02-30" }, { endDate: "0000-01-01" },
    { startDate: "2024-03-01", endDate: "2024-02-29" }, { type: "REFUND" },
    { search: "x".repeat(1001) }, { startDate: "2024-02-01T00:00:00+07:00" },
  ];
  for (const params of invalid) expect((await context.request.get(`/api/transactions?${new URLSearchParams(params)}`)).status()).toBe(400);
});

test("filtered pagination retains criteria and cannot reveal another account through category or cursor", async ({ context, browser, request }) => {
  const a = await seed(context);
  const other = await browser.newContext();
  try {
    const b = await seed(other, users[1]);
    for (let i = 0; i < 23; i++) {
      expect((await context.request.post("/api/transactions", { headers: { Origin: origin }, data: {
        type: "EXPENSE", categoryId: a.expense[0].id, amount: "1.00", date: "2024-02-01", description: `page ${i}`,
      } })).status()).toBe(201);
    }
    const filters = { search: "page", startDate: "2024-02-01", endDate: "2024-02-01", type: "EXPENSE", categoryId: a.expense[0].id };
    const first = await list(context, filters);
    expect(first.transactions).toHaveLength(20);
    const second = await list(context, { ...filters, cursor: first.nextCursor! });
    expect(second.transactions).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.transactions, ...second.transactions].map((record) => record.id)).size).toBe(23);
    expect((await list(context, { search: "coffee", categoryId: b.expense[0].id })).transactions).toEqual([]);
    for (const cursor of [b.records[1].id, a.records[1].id, "missing"]) {
      expect((await context.request.get(`/api/transactions?${new URLSearchParams({ ...filters, cursor })}`)).status()).toBe(404);
    }
    expect((await list(other, { search: "page" })).transactions).toEqual([]);
    expect((await request.get("/api/transactions?search=coffee")).status()).toBe(401);
    expect((await context.request.get("/api/transactions?userId=filters-b&search=coffee")).status()).toBe(400);
  } finally { await other.close(); }
});

test("browser combines filters, handles no results, resets, and keeps pagination/date results across device timezones", async ({ context, page }, testInfo) => {
  const { expense } = await seed(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const form = page.getByRole("form", { name: "ค้นหาและกรองรายการ" });
  const history = page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });
  await expect(history.locator("li")).toHaveCount(5);
  await form.getByLabel("ค้นหาคำอธิบาย").fill("coffee");
  await form.getByLabel("ตั้งแต่วันที่ (เวลาไทย)").fill("2024-02-01");
  await form.getByLabel("ถึงวันที่ (เวลาไทย)").fill("2024-02-29");
  await form.getByLabel("กรองประเภท", { exact: true }).click();
  await page.getByRole("option", { name: "รายจ่าย", exact: true }).click();
  await form.getByLabel("กรองหมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: `${expense[0].name} (รายจ่าย)`, exact: true }).click();
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(1);
  await expect(history.locator("time")).toHaveAttribute("datetime", "2024-02-01");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transaction-filters.png"), fullPage: true });
  await form.getByLabel("ค้นหาคำอธิบาย").fill("ไม่มีผลลัพธ์");
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(page.getByText("ไม่พบรายการที่ตรงกับตัวกรอง", { exact: false })).toBeVisible();
  await form.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(history.locator("li")).toHaveCount(5);
  await expect(form.getByLabel("ค้นหาคำอธิบาย")).toBeEmpty();
  await form.getByLabel("ตั้งแต่วันที่ (เวลาไทย)").fill("2024-03-01");
  await form.getByLabel("ถึงวันที่ (เวลาไทย)").fill("2024-02-29");
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(form.getByText("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด")).toBeVisible();
});

test("browser pagination and refresh retain filters, with recoverable loading failures", async ({ context, page }) => {
  const { expense } = await seed(context);
  for (let i = 0; i < 23; i++) {
    const response = await context.request.post("/api/transactions", { headers: { Origin: origin }, data: {
      type: "EXPENSE", categoryId: expense[0].id, date: "2024-02-01", amount: "1.00", description: `แบ่งหน้า ${i}`,
    } });
    expect(response.status()).toBe(201);
  }
  await page.goto("/dashboard");
  const form = page.getByRole("form", { name: "ค้นหาและกรองรายการ" });
  const history = page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });
  await form.getByLabel("ค้นหาคำอธิบาย").fill("แบ่งหน้า");
  let fail = true;
  await page.route("**/api/transactions?**", (route) => fail
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
    : route.continue());
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(page.getByText("โหลดรายการไม่สำเร็จ กดโหลดรายการใหม่เพื่อลองอีกครั้ง")).toBeVisible();
  await expect(history.locator("li")).toHaveCount(0);
  await expect(page.getByText("ไม่พบรายการที่ตรงกับตัวกรอง", { exact: false })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "โหลดรายการใหม่", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(20);
  await page.getByRole("button", { name: "ดูรายการก่อนหน้า" }).click();
  await expect(history.locator("li")).toHaveCount(23);
  await expect(page.getByRole("button", { name: "ดูรายการก่อนหน้า" })).toHaveCount(0);
  await expect(history).not.toContainText("Coffee");
  await page.getByRole("button", { name: "โหลดรายการใหม่", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(20);
  await expect(history).not.toContainText("Coffee");
});

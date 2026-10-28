import { readFile } from "node:fs/promises";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, Transaction, TransactionDraft } from "../../src/lib/finance";

const db = createTestDatabase();
const headers = { Origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3100" };
const users = ["csv-a", "csv-b"];
const columns = ["id", "date", "type", "category", "amount", "description", "refund_of"];

// Parse the downloaded bytes independently, including doubled quotes and embedded CR/LF.
function parseCsv(bytes: Buffer) {
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const input = bytes.toString("utf8").slice(1);
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(value); value = ""; }
    else if (!quoted && char === "\r" && input[i + 1] === "\n") {
      row.push(value); rows.push(row); row = []; value = ""; i++;
    } else value += char;
  }
  expect(quoted).toBe(false);
  expect(value).toBe("");
  expect(row).toEqual([]);
  expect(rows.shift()).toEqual(columns);
  return rows.map((cells) => {
    expect(cells).toHaveLength(columns.length);
    return Object.fromEntries(columns.map((column, i) => [column, cells[i]]));
  });
}
async function seed(context: BrowserContext, userId = users[0]) {
  await authenticate(context, db, userId);
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const expense = categories.filter((c) => c.type === "EXPENSE");
  const income = categories.find((c) => c.type === "INCOME")!;
  const inputs: TransactionDraft[] = [
    { type: "EXPENSE", categoryId: expense[0].id, amount: "100.25", date: "2024-01-31", description: 'กาแฟ Coffee, "อร่อย"\r\nบรรทัดสอง 🍀 50%_\\' },
    { type: "EXPENSE", categoryId: expense[0].id, amount: "0.01", date: "2024-02-01", description: "กาแฟ coffee" },
    { type: "EXPENSE", categoryId: expense[1].id, amount: "3.10", date: "2024-02-29", description: "กาแฟ COFFEE" },
    { type: "INCOME", categoryId: income.id, amount: "21474836.47", date: "2024-03-01", description: "กาแฟ Coffee" },
    { type: "EXPENSE", categoryId: expense[0].id, amount: "5.00", date: "2024-03-02" },
  ];
  const records: Transaction[] = [];
  for (const data of inputs) {
    const response = await context.request.post("/api/transactions", { headers, data });
    expect(response.status()).toBe(201);
    records.push((await response.json()).transaction);
  }
  const refunds: { id: string; date: string; description: string; amount: string; expenseId: string }[] = [];
  for (const data of [
    { amount: "40.01", date: "2024-02-01", description: 'คืนกาแฟ coffee, "บางส่วน"\nวันที่รับ 50%_\\' },
    { amount: "0.01", date: "2024-02-29", description: "คืน COFFEE" },
    { amount: "10.00", date: "2024-03-01", description: "เฉพาะเงินคืน" },
  ]) {
    const response = await context.request.post(`/api/transactions/${records[0].id}/refunds`, { headers, data });
    expect(response.status()).toBe(201);
    refunds.push((await response.json()).refund);
  }
  return { records, refunds, expense, income };
}
async function exported(context: BrowserContext, params: Record<string, string> = {}) {
  const response = await context.request.get(`/api/transactions/export?${new URLSearchParams(params)}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(response.headers()["content-disposition"]).toBe('attachment; filename="pocketapp-transactions.csv"');
  return parseCsv(await response.body());
}
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ดาวน์โหลด CSV", exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("pocketapp-transactions.csv");
  expect(await file.failure()).toBeNull();
  return parseCsv(await readFile((await file.path())!));
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.user.createMany({ data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })) });
});
test.beforeEach(async () => {
  const where = { userId: { in: users } };
  await db.refund.deleteMany({ where });
  await db.transaction.deleteMany({ where });
  await db.category.deleteMany({ where });
});
test.afterAll(async () => { await db.$disconnect(); });

test("HTTP CSV matches history filters plus matching receipt-date refunds and preserves Thai, quotes, newlines and satang", async ({ context }) => {
  const { records, refunds, expense } = await seed(context);
  const cases: [Record<string, string>, number[]][] = [
    [{}, [0, 1, 2]], [{ search: " COFFEE " }, [0, 1]], [{ search: "เฉพาะเงินคืน" }, [2]],
    [{ search: "50%_\\" }, [0]], [{ type: "INCOME" }, []], [{ type: "EXPENSE" }, [0, 1, 2]],
    [{ categoryId: expense[1].id }, []], [{ categoryId: expense[0].id }, [0, 1, 2]],
    [{ startDate: "2024-02-01", endDate: "2024-02-29" }, [0, 1]],
    [{ startDate: "2024-02-29", endDate: "2024-02-29" }, [1]],
    [{ endDate: "2024-01-31" }, []], [{ startDate: "2024-03-01" }, [2]],
    [{ search: "coffee", type: "EXPENSE", categoryId: expense[0].id, startDate: "2024-02-01", endDate: "2024-02-29" }, [0, 1]],
    [{ search: "ไม่มีผล" }, []],
  ];
  for (const [params, indexes] of cases) {
    const csv = await exported(context, params);
    const history = await (await context.request.get(`/api/transactions?${new URLSearchParams(params)}`)).json();
    expect(csv.filter((r) => r.type !== "REFUND").map((r) => r.id)).toEqual(history.transactions.map((r: Transaction) => r.id));
    expect(csv.filter((r) => r.type === "REFUND").map((r) => r.id).sort()).toEqual(indexes.map((i) => refunds[i].id).sort());
  }
  const all = await exported(context);
  for (const record of records) expect(all.find((r) => r.id === record.id)).toEqual({ id: record.id, date: record.date, type: record.type, category: record.category.name, amount: record.amount, description: record.description ?? "", refund_of: "" });
  for (const refund of refunds) expect(all.find((r) => r.id === refund.id)).toEqual({ id: refund.id, date: refund.date, type: "REFUND", category: records[0].category.name, amount: refund.amount, description: refund.description, refund_of: records[0].id });
  // Archived category histories retain both records and refund references.
  await context.request.patch(`/api/categories/${expense[0].id}`, { headers, data: { name: 'หมวด, "เก่า"\nย้อนหลัง' } });
  await context.request.patch(`/api/categories/${expense[0].id}`, { headers, data: { archived: true } });
  expect((await exported(context, { categoryId: expense[0].id })).every((r) => r.category === 'หมวด, "เก่า"\nย้อนหลัง')).toBe(true);
});

test("export is complete beyond one page, empty CSV has headers and user text cannot execute spreadsheet formulas", async ({ context }) => {
  await authenticate(context, db, users[0]);
  expect(await exported(context)).toEqual([]);
  const a = await seed(context);
  for (let i = 0; i < 24; i++) {
    await context.request.post("/api/transactions", { headers, data: { type: "EXPENSE", categoryId: a.expense[1].id, amount: "0.10", date: "2024-01-01", description: `page ${i}` } });
  }
  expect(await exported(context, { search: "page" })).toHaveLength(24);
  await context.request.patch(`/api/categories/${a.expense[1].id}`, { headers, data: { name: '=HYPERLINK("https://example.test")' } });
  for (const description of ['=1+1', '+SUM(1,2)', '-1+1', '@SUM(1,2)']) {
    await context.request.post("/api/transactions", { headers, data: { type: "EXPENSE", categoryId: a.expense[1].id, amount: "1.00", date: "2024-01-01", description } });
    const [row] = (await exported(context, { search: description }));
    expect(row.description).toBe(`'${description}`);
    expect(row.category).toBe('\'=HYPERLINK("https://example.test")');
  }
});

test("direct exports reject anonymous/forged queries and never reveal another user's records, categories or refunds", async ({ context, browser, request }) => {
  const a = await seed(context);
  const other = await browser.newContext();
  try {
    const b = await seed(other, users[1]);
    const own = await exported(context);
    const otherIds = [...b.records, ...b.refunds].map((r) => r.id);
    expect(own.some((r) => otherIds.includes(r.id) || otherIds.includes(r.refund_of))).toBe(false);
    expect(await exported(context, { categoryId: b.expense[0].id })).toEqual([]);
    expect(await exported(other, { categoryId: a.expense[0].id })).toEqual([]);
    expect((await request.get("/api/transactions/export")).status()).toBe(401);
    const invalid: Record<string, string>[] = [{ userId: users[1] }, { cursor: b.records[0].id }, { type: "REFUND" }, { startDate: "2024-02-30" }, { startDate: "2024-03-01", endDate: "2024-02-29" }, { search: "x".repeat(1001) }];
    for (const params of invalid) {
      expect((await context.request.get(`/api/transactions/export?${new URLSearchParams(params)}`)).status()).toBe(400);
    }
  } finally { await other.close(); }
});

test("browser download uses applied filters, includes matching refunds, ignores unsaved filter drafts and supports empty downloads", async ({ context, page }, testInfo) => {
  const a = await seed(context);
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
  await page.getByRole("option", { name: `${a.expense[0].name} (รายจ่าย)`, exact: true }).click();
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "ดาวน์โหลด CSV", exact: true })).toBeEnabled();
  const csv = await download(page);
  expect(csv.filter((r) => r.type !== "REFUND").map((r) => r.id)).toEqual([a.records[1].id]);
  expect(csv.filter((r) => r.type === "REFUND").map((r) => r.id).sort()).toEqual([a.refunds[0].id, a.refunds[1].id].sort());
  await form.getByLabel("ค้นหาคำอธิบาย").fill("ยังไม่ใช้เงื่อนไขนี้");
  expect(await download(page)).toEqual(csv);
  await form.getByRole("button", { name: "ค้นหาและกรอง", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ดาวน์โหลด CSV", exact: true })).toBeEnabled();
  expect(await download(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("region", { name: "รายการของคุณ", exact: true }).screenshot({ path: testInfo.outputPath("csv-export.png") });
  await form.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(history.locator("li")).toHaveCount(5);
  expect(await download(page)).toHaveLength(8);
});

test("browser export failure is retryable and pending downloads prevent duplicate requests", async ({ context, page }) => {
  await seed(context);
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/transactions/export*", async (route) => {
    if (fail) return route.fulfill({ status: 503, json: { error: "ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง" } });
    await gate;
    return route.continue();
  });
  await page.goto("/dashboard");
  const button = page.getByRole("button", { name: "ดาวน์โหลด CSV", exact: true });
  await button.click();
  await expect(page.getByRole("region", { name: "รายการของคุณ", exact: true }).getByRole("alert")).toContainText("ส่งออก CSV ไม่สำเร็จ");
  fail = false;
  const pending = page.waitForEvent("download");
  await button.click();
  await expect(button).toBeDisabled();
  release();
  expect(await (await pending).failure()).toBeNull();
  await expect(button).toBeEnabled();
});

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, Transaction, TransactionDraft } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = (process.env.BETTER_AUTH_URL ?? "http://localhost:3100");
const users = [
  { id: "finance-a", name: "ผู้บันทึก ก", email: "finance-a@example.test", emailVerified: true },
  { id: "finance-b", name: "ผู้บันทึก ข", email: "finance-b@example.test", emailVerified: true },
];

async function categories(context: BrowserContext): Promise<Category[]> {
  const response = await context.request.get("/api/categories");
  expect(response.status()).toBe(200);
  return (await response.json()).categories;
}

async function create(context: BrowserContext, data: unknown) {
  return context.request.post("/api/transactions", { headers: { Origin: origin }, data });
}

async function draft(context: BrowserContext): Promise<TransactionDraft> {
  const category = (await categories(context)).find((item) => item.type === "EXPENSE")!;
  return { type: "EXPENSE", amount: "0.01", date: "2020-02-29", categoryId: category.id };
}

async function fillExpense(page: Page, amount: string, description?: string) {
  await page.getByLabel("จำนวนเงิน (บาท)").fill(amount);
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: "อาหารและเครื่องดื่ม", exact: true }).click();
  if (description) await page.getByLabel("คำอธิบาย (ไม่บังคับ)").fill(description);
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  await db.transaction.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
});
test.afterAll(async () => { await db.$disconnect(); });

test("private finance endpoints reject anonymous requests", async ({ request }) => {
  for (const path of ["/api/categories", "/api/transactions"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.post("/api/transactions", { headers: { Origin: origin }, data: {} })).status()).toBe(401);
});

test("concurrent first visits get distinct personal starter categories without duplicates", async ({ context, browser }) => {
  await authenticate(context, db, users[0].id);
  // Remove only this test's categories so the next requests exercise first use.
  await db.category.deleteMany({ where: { userId: users[0].id } });
  const results = await Promise.all(Array.from({ length: 4 }, () => categories(context)));
  for (const list of results) {
    expect(list).toHaveLength(9);
    expect(list.filter((item) => item.type === "INCOME")).toHaveLength(3);
    expect(list.filter((item) => item.type === "EXPENSE")).toHaveLength(6);
    expect(new Set(list.map((item) => item.id)).size).toBe(9);
    expect(list).toEqual(results[0]);
  }
  const other = await browser.newContext();
  try {
    await authenticate(other, db, users[1].id);
    const otherCategories = await categories(other);
    expect(otherCategories.map((item) => item.id).some((id) => results[0].some((item) => item.id === id))).toBe(false);
    const response = await context.request.get("/api/categories?userId=finance-b");
    expect((await response.json()).categories).toEqual(results[0]);
  } finally { await other.close(); }
});

test("HTTP persists exact satang, date-only values, both types and optional descriptions", async ({ context }) => {
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  const amounts = ["0.01", "0.10", "0.20", "1.01", "10000000.01", "21474836.47"];
  for (const amount of amounts) {
    const response = await create(context, { ...input, amount });
    expect(response.status()).toBe(201);
    expect((await response.json()).transaction).toMatchObject({ amount, date: "2020-02-29", description: null });
  }
  const income = (await categories(context)).find((item) => item.type === "INCOME")!;
  const response = await create(context, { ...input, categoryId: income.id, type: "INCOME", amount: "12.3", description: "  เงินพิเศษ 🍀  " });
  expect(response.status()).toBe(201);
  expect((await response.json()).transaction).toMatchObject({ amount: "12.30", type: "INCOME", description: "เงินพิเศษ 🍀" });
  const persisted = await context.request.get("/api/transactions");
  expect(persisted.headers()["cache-control"]).toContain("no-store");
  const records: Transaction[] = (await persisted.json()).transactions;
  expect(records).toHaveLength(7);
  expect(records.map((item) => item.amount).sort()).toEqual([...amounts, "12.30"].sort());
});

test("invalid money, impossible/future dates and forged fields are rejected over HTTP", async ({ context }) => {
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  const badAmounts = ["0", "0.00", "-1", "1.001", "NaN", "Infinity", "1e3", "1,000.00", "21474836.48", "999999999999999999", "", 0.1, null];
  for (const amount of badAmounts) {
    const response = await create(context, { ...input, amount });
    expect(response.status(), JSON.stringify(amount)).toBe(422);
    expect((await response.json()).fields).toHaveProperty("amount");
  }
  const personal = await (await context.request.get("/api/categories")).json();
  const thaiToday = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  expect(personal.today).toBe(thaiToday);
  const tomorrow = new Date(`${thaiToday}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  for (const date of [tomorrow.toISOString().slice(0, 10), "2025-02-29", "2020-02-30", "2020-13-01", "2020-01-01T00:00:00Z", "not-a-date", "0000-01-01"]) {
    const response = await create(context, { ...input, date });
    expect(response.status(), date).toBe(422);
    expect((await response.json()).fields).toHaveProperty("date");
  }
  for (const overrides of [{ userId: users[1].id }, { amountSatang: 100 }, { type: "REFUND" }, { description: "x".repeat(1001) }, { categoryId: "" }]) {
    expect((await create(context, { ...input, ...overrides })).status()).toBe(422);
  }
  expect((await context.request.get("/api/transactions")).ok()).toBe(true);
  expect((await (await context.request.get("/api/transactions")).json()).transactions).toEqual([]);
});

test("ownership and category type are enforced for direct requests and across devices", async ({ context, browser }) => {
  await authenticate(context, db, users[0].id);
  const other = await browser.newContext();
  const secondDevice = await browser.newContext();
  try {
    await authenticate(other, db, users[1].id);
    await authenticate(secondDevice, db, users[0].id);
    const input = await draft(context);
    const otherInput = await draft(other);
    const wrongType = (await categories(context)).find((item) => item.type === "INCOME")!;
    for (const categoryId of [otherInput.categoryId, wrongType.id, "missing-category"]) {
      expect((await create(context, { ...input, categoryId })).status()).toBe(422);
    }
    const a = (await (await create(context, { ...input, description: "รายการลับของ ก" })).json()).transaction;
    const b = (await (await create(other, { ...otherInput, amount: "999.99", description: "รายการลับของ ข" })).json()).transaction;
    expect((await (await context.request.get("/api/transactions")).json()).transactions).toEqual([a]);
    expect((await (await other.request.get("/api/transactions")).json()).transactions).toEqual([b]);
    expect((await (await secondDevice.request.get("/api/transactions")).json()).transactions).toEqual([a]);
    expect((await context.request.get("/api/transactions?userId=finance-b")).status()).toBe(400);
    expect((await context.request.get(`/api/transactions?cursor=${b.id}`)).status()).toBe(404);
    expect((await context.request.get(`/api/transactions/${b.id}`)).status()).toBe(404);
    expect((await context.request.post("/api/transactions", { headers: { Origin: "https://attacker.invalid" }, data: input })).status()).toBe(403);
    expect((await context.request.post("/api/transactions", { headers: { Origin: origin, "Content-Type": "text/plain" }, data: JSON.stringify(input) })).status()).toBe(415);
    expect((await context.request.post("/api/transactions", { headers: { Origin: origin, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
  } finally { await Promise.all([other.close(), secondDevice.close()]); }
});

test("history is paginated in business date order with latest entry first on the same date", async ({ context }) => {
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  for (let day = 1; day <= 23; day++) {
    expect((await create(context, { ...input, date: `2020-01-${String(day).padStart(2, "0")}`, description: `รายการ ${day}` })).status()).toBe(201);
  }
  const newest = (await (await create(context, { ...input, date: "2020-01-23", description: "บันทึกล่าสุด" })).json()).transaction;
  const first = await (await context.request.get("/api/transactions")).json();
  expect(first.transactions).toHaveLength(20);
  expect(first.transactions[0]).toEqual(newest);
  expect(first.nextCursor).toBeTruthy();
  const second = await (await context.request.get(`/api/transactions?cursor=${first.nextCursor}`)).json();
  expect(second.transactions).toHaveLength(4);
  expect(second.nextCursor).toBeNull();
  const all: Transaction[] = [...first.transactions, ...second.transactions];
  expect(new Set(all.map((item) => item.id)).size).toBe(24);
  expect(all.map((item) => item.date)).toEqual(all.map((item) => item.date).sort().reverse());
});

test("browser adds expense/income, clears mismatched category, reloads and shows the same data on another device", async ({ context, page, browser }, testInfo) => {
  await authenticate(context, db, users[0].id);
  const today = (await (await context.request.get("/api/categories")).json()).today;
  await page.goto("/dashboard");
  await expect(page.getByText("ยังไม่มีรายการ เริ่มบันทึกรายรับหรือรายจ่ายแรกของคุณได้เลย", { exact: true })).toBeVisible();
  await expect(page.getByLabel("วันที่ (เวลาไทย)", { exact: true })).toHaveValue(today);
  await fillExpense(page, "123.45", "ข้าวกลางวัน 🍚");
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกรายการแล้ว", { exact: true })).toBeVisible();
  const history = page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });
  await expect(history.getByText("ข้าวกลางวัน 🍚")).toBeVisible();
  await expect(history.getByText("−123.45 บาท")).toBeVisible();
  await page.getByText("รายรับ", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "รายรับ", exact: true })).toBeChecked();
  await expect(page.getByText("เลือกหมวดหมู่", { exact: true })).toBeVisible();
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await expect(page.getByRole("option", { name: "อาหารและเครื่องดื่ม", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "เงินเดือน", exact: true }).click();
  await page.getByLabel("จำนวนเงิน (บาท)").fill("0.10");
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2020-02-29");
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(history.getByText("+0.10 บาท")).toBeVisible();
  await page.reload();
  await expect(history.getByText("ข้าวกลางวัน 🍚")).toBeVisible();
  await expect(history.locator("li").first()).toContainText("ข้าวกลางวัน 🍚");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transactions.png"), fullPage: true });
  const device = await browser.newContext({ viewport: page.viewportSize()!, timezoneId: "Pacific/Kiritimati" });
  try {
    await authenticate(device, db, users[0].id);
    const anotherPage = await device.newPage();
    await anotherPage.goto("/dashboard");
    await expect(anotherPage.getByLabel("วันที่ (เวลาไทย)", { exact: true })).toHaveValue(today);
    await expect(anotherPage.getByText("ข้าวกลางวัน 🍚")).toBeVisible();
    await expect(anotherPage.getByText("+0.10 บาท")).toBeVisible();
  } finally { await device.close(); }
});

test("browser rejects invalid amounts and future dates without sending a mutation", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  await page.goto("/dashboard");
  await fillExpense(page, "0");
  const mutations: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/transactions") && request.method() === "POST") mutations.push(request.url()); });
  for (const value of ["0", "-1", "0.001", "1e3", "21474836.48"]) {
    await page.getByLabel("จำนวนเงิน (บาท)").fill(value);
    await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
    await expect(page.getByText("กรอกจำนวนเงินมากกว่า 0 ถึง 21,474,836.47 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง", { exact: true })).toBeVisible();
  }
  await page.getByLabel("จำนวนเงิน (บาท)").fill("1.00");
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2999-01-01");
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกได้เฉพาะวันที่ถูกต้อง วันนี้หรือย้อนหลัง ตามเวลาไทย", { exact: true })).toBeVisible();
  expect(mutations).toHaveLength(0);
});

test("save failure retains the draft and pending submission is clear and cannot be double clicked", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  await page.goto("/dashboard");
  await fillExpense(page, "45.67", "เก็บร่างเมื่อบันทึกล้มเหลว");
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/transactions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" }) });
    await gate;
    return route.continue();
  });
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("45.67");
  await expect(page.getByLabel("คำอธิบาย (ไม่บังคับ)")).toHaveValue("เก็บร่างเมื่อบันทึกล้มเหลว");
  fail = false;
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByRole("button", { name: "กำลังบันทึก…" })).toBeDisabled();
  release();
  await expect(page.getByText("บันทึกรายการแล้ว", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "รายการรายรับและรายจ่าย" }).locator("li")).toHaveCount(1);
});

test("initial load error offers retry instead of claiming the account is empty", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  let fail = true;
  await page.route("**/api/transactions", (route) => {
    if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    return route.continue();
  });
  await page.goto("/dashboard");
  await expect(page.getByText("โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(page.getByText("ยังไม่มีรายการ เริ่มบันทึกรายรับหรือรายจ่ายแรกของคุณได้เลย", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "ลองโหลดอีกครั้ง", exact: true }).click();
  await expect(page.getByText("ยังไม่มีรายการ เริ่มบันทึกรายรับหรือรายจ่ายแรกของคุณได้เลย", { exact: true })).toBeVisible();
});

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, FavoriteDraft, FavoriteEntry } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const users = [
  { id: "favorites-a", name: "รายการโปรด ก", email: "favorites-a@example.test", emailVerified: true },
  { id: "favorites-b", name: "รายการโปรด ข", email: "favorites-b@example.test", emailVerified: true },
];

async function draft(context: BrowserContext, type: "EXPENSE" | "INCOME" = "EXPENSE"): Promise<FavoriteDraft> {
  const personal = await (await context.request.get("/api/categories")).json();
  const category = personal.categories.find((item: Category) => item.type === type)!;
  return { name: "กาแฟประจำ ☕", type, amount: "45.67", categoryId: category.id, description: "หวานน้อย" };
}
async function create(context: BrowserContext, input: unknown) {
  return context.request.post("/api/favorites", { headers: { Origin: origin }, data: input });
}
async function records(context: BrowserContext) {
  const response = await context.request.get("/api/transactions");
  expect(response.status()).toBe(200);
  return (await response.json()).transactions;
}
async function fill(page: Page) {
  await page.getByLabel("จำนวนเงิน (บาท)").fill("45.67");
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: "อาหารและเครื่องดื่ม", exact: true }).click();
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2020-02-29");
  await page.getByLabel("คำอธิบาย (ไม่บังคับ)").fill("หวานน้อย");
}

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  const where = { userId: { in: users.map((user) => user.id) } };
  await db.favoriteEntry.deleteMany({ where });
  await db.transaction.deleteMany({ where });
});
test.afterAll(async () => { await db.$disconnect(); });

test("favorites endpoints require a session and safe mutations", async ({ request, context }) => {
  for (const path of ["/api/favorites", "/api/favorites/missing"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.post("/api/favorites", { headers: { Origin: origin }, data: {} })).status()).toBe(401);
  expect((await request.delete("/api/favorites/missing", { headers: { Origin: origin } })).status()).toBe(401);
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  expect((await context.request.post("/api/favorites", { headers: { Origin: "https://attacker.invalid" }, data: input })).status()).toBe(403);
  expect((await context.request.delete("/api/favorites/missing", { headers: { Origin: "https://attacker.invalid" } })).status()).toBe(403);
  expect((await context.request.post("/api/favorites", { headers: { Origin: origin, "Content-Type": "text/plain" }, data: JSON.stringify(input) })).status()).toBe(415);
  expect((await context.request.post("/api/favorites", { headers: { Origin: origin, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
});

test("HTTP validates reusable details and never stores a date or creates financial records", async ({ context }) => {
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  for (const overrides of [
    { name: "  " }, { name: "x".repeat(101) }, { description: "x".repeat(1001) },
    { amount: "0" }, { amount: "-1" }, { amount: "0.001" }, { amount: "21474836.48" }, { amount: 1 },
    { type: "REFUND" }, { userId: users[1].id }, { date: "2020-02-29" }, { transactionId: "forged" },
  ]) expect((await create(context, { ...input, ...overrides })).status(), JSON.stringify(overrides)).toBe(422);
  for (const amount of ["0.01", "21474836.47"]) {
    const response = await create(context, { ...input, amount, name: "  เงินประจำ  ", description: "  รายละเอียด  " });
    expect(response.status()).toBe(201);
    const { favorite } = await response.json();
    expect(favorite).toMatchObject({ name: "เงินประจำ", amount, description: "รายละเอียด" });
    expect(favorite).not.toHaveProperty("date");
    const selected = await context.request.get(`/api/favorites/${favorite.id}`);
    expect(selected.status()).toBe(200);
    expect(selected.headers()["cache-control"]).toContain("no-store");
    expect((await selected.json()).favorite).toEqual(favorite);
  }
  const income = await draft(context, "INCOME");
  expect((await create(context, income)).status()).toBe(201);
  expect(await records(context)).toEqual([]);
});

test("favorites stay private across users and persist across devices; category ownership and type are enforced", async ({ context, browser }) => {
  await authenticate(context, db, users[0].id);
  const other = await browser.newContext();
  const device = await browser.newContext();
  try {
    await authenticate(other, db, users[1].id);
    await authenticate(device, db, users[0].id);
    const input = await draft(context);
    const foreign = await draft(other);
    const income = await draft(context, "INCOME");
    for (const categoryId of [foreign.categoryId, income.categoryId, "missing"]) {
      expect((await create(context, { ...input, categoryId })).status()).toBe(422);
    }
    const favorite: FavoriteEntry = (await (await create(context, input)).json()).favorite;
    const otherFavorite = (await (await create(other, { ...foreign, name: "ความลับของ ข" })).json()).favorite;
    expect((await (await other.request.get("/api/favorites")).json()).favorites).toEqual([otherFavorite]);
    expect((await (await context.request.get(`/api/favorites?userId=${users[1].id}`)).json()).favorites).toEqual([favorite]);
    expect((await (await device.request.get("/api/favorites")).json()).favorites).toEqual([favorite]);
    expect((await other.request.get(`/api/favorites/${favorite.id}`)).status()).toBe(404);
    expect((await other.request.delete(`/api/favorites/${favorite.id}`, { headers: { Origin: origin } })).status()).toBe(404);
    expect((await context.request.get(`/api/favorites/${favorite.id}`)).status()).toBe(200);
    expect((await context.request.delete(`/api/favorites/${favorite.id}`, { headers: { Origin: origin } })).status()).toBe(200);
    expect((await context.request.get(`/api/favorites/${favorite.id}`)).status()).toBe(404);
    expect((await (await device.request.get("/api/favorites")).json()).favorites).toEqual([]);
    expect(await records(context)).toEqual([]);
  } finally { await other.close(); await device.close(); }
});

test("browser stores details from a past draft, prefills today, cancels and edits before explicit save", async ({ context, page }, testInfo) => {
  await authenticate(context, db, users[0].id);
  const today = (await (await context.request.get("/api/categories")).json()).today;
  await page.goto("/dashboard");
  await fill(page);
  await page.getByRole("button", { name: "เก็บรายละเอียดในฟอร์มเป็นรายการโปรด" }).click();
  const dialog = page.getByRole("dialog", { name: "เก็บเป็นรายการโปรด" });
  await dialog.getByLabel("ชื่อรายการโปรด").fill("กาแฟเช้า");
  await dialog.getByRole("button", { name: "เก็บรายการโปรด", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const shortcut = page.getByRole("button", { name: "ใช้ กาแฟเช้า" });
  await expect(shortcut).toBeVisible();
  expect(await records(context)).toEqual([]);
  await page.reload();
  await expect(shortcut).toBeVisible();
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2020-01-01");
  await shortcut.click();
  await expect(page.getByText("เติมร่างจากรายการโปรดแล้ว", { exact: false })).toBeVisible();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("45.67");
  await expect(page.getByLabel("คำอธิบาย (ไม่บังคับ)")).toHaveValue("หวานน้อย");
  await expect(page.getByLabel("วันที่ (เวลาไทย)", { exact: true })).toHaveValue(today);
  expect(await records(context)).toEqual([]);
  await page.getByRole("button", { name: "ยกเลิกร่าง", exact: true }).click();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("");
  expect(await records(context)).toEqual([]);
  await shortcut.click();
  await page.getByLabel("จำนวนเงิน (บาท)").fill("50.01");
  await page.getByLabel("คำอธิบาย (ไม่บังคับ)").fill("เพิ่มช็อต");
  await page.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2020-02-29");
  await page.screenshot({ path: testInfo.outputPath("favorite-draft.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกรายการแล้ว", { exact: true })).toBeVisible();
  const transactions = await records(context);
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({ amount: "50.01", date: "2020-02-29", description: "เพิ่มช็อต" });
  const favorites = (await (await context.request.get("/api/favorites")).json()).favorites;
  expect(favorites).toHaveLength(1);
  expect(favorites[0]).toMatchObject({ amount: "45.67", description: "หวานน้อย" });
  await page.getByRole("button", { name: "ลบรายการโปรด กาแฟเช้า", exact: true }).click();
  await page.getByRole("button", { name: "ยืนยันลบ", exact: true }).click();
  await expect(shortcut).toHaveCount(0);
  expect(await records(context)).toEqual(transactions);
});

test("browser can cancel favorite creation, switch draft type, and recover from failures without losing details", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  const income = await draft(context, "INCOME");
  const created = await create(context, { ...income, name: "เงินประจำ" });
  expect(created.status()).toBe(201);
  const favorite: FavoriteEntry = (await created.json()).favorite;
  await page.goto("/dashboard");
  await fill(page);
  await page.getByRole("button", { name: "เก็บรายละเอียดในฟอร์มเป็นรายการโปรด" }).click();
  const dialog = page.getByRole("dialog", { name: "เก็บเป็นรายการโปรด" });
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("45.67");
  expect((await (await context.request.get("/api/favorites")).json()).favorites).toHaveLength(1);
  await page.getByRole("button", { name: "ใช้ เงินประจำ" }).click();
  await expect(page.getByRole("radio", { name: "รายรับ", exact: true })).toBeChecked();
  await expect(page.getByText(favorite.category.name, { exact: true })).toBeVisible();
  await page.route("**/api/transactions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" }) });
  });
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue(income.amount);
  expect(await records(context)).toEqual([]);
  await page.unroute("**/api/transactions");
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกรายการแล้ว", { exact: true })).toBeVisible();
  expect(await records(context)).toHaveLength(1);
});

test("favorite load, create and selection failures are retryable and preserve the current draft", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  let failLoad = true;
  let failSave = true;
  await page.route("**/api/favorites", (route) => {
    if ((route.request().method() === "GET" && failLoad) || (route.request().method() === "POST" && failSave)) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ระบบรายการโปรดไม่พร้อม" }) });
    }
    return route.continue();
  });
  await page.goto("/dashboard");
  await expect(page.getByText("โหลดรายการโปรดไม่สำเร็จ", { exact: true })).toBeVisible();
  failLoad = false;
  await page.getByRole("button", { name: "ลองโหลดรายการโปรดอีกครั้ง" }).click();
  await expect(page.getByText("ยังไม่มีรายการโปรด", { exact: false })).toBeVisible();
  await fill(page);
  await page.getByRole("button", { name: "เก็บรายละเอียดในฟอร์มเป็นรายการโปรด" }).click();
  const dialog = page.getByRole("dialog", { name: "เก็บเป็นรายการโปรด" });
  await dialog.getByLabel("ชื่อรายการโปรด").fill("กาแฟเช้า");
  await dialog.getByRole("button", { name: "เก็บรายการโปรด", exact: true }).click();
  await expect(dialog.getByText("ระบบรายการโปรดไม่พร้อม")).toBeVisible();
  await expect(dialog.getByLabel("ชื่อรายการโปรด")).toHaveValue("กาแฟเช้า");
  failSave = false;
  await dialog.getByRole("button", { name: "เก็บรายการโปรด", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("จำนวนเงิน (บาท)").fill("99.99");
  await page.route("**/api/favorites/*", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "ไม่พบรายการโปรด" }) }));
  await page.getByRole("button", { name: "ใช้ กาแฟเช้า" }).click();
  await expect(page.getByText("ไม่พบรายการโปรด", { exact: true })).toBeVisible();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("99.99");
  expect(await records(context)).toEqual([]);
});

test("long favorite names fit narrow screens and a pending selection cannot create a transaction", async ({ context, page }, testInfo) => {
  await authenticate(context, db, users[0].id);
  const input = await draft(context);
  const name = "กาแฟเช้า".repeat(12);
  expect((await create(context, { ...input, name })).status()).toBe(201);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard");
  const shortcut = page.getByRole("button", { name: `ใช้ ${name}` });
  await expect(shortcut).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/favorites/*", async (route) => { await gate; return route.continue(); });
  await shortcut.click();
  await expect(shortcut).toBeDisabled();
  await expect(page.getByRole("button", { name: "บันทึกรายการ", exact: true })).toBeDisabled();
  expect(await records(context)).toEqual([]);
  release();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue(input.amount);
  await expect(shortcut).toBeEnabled();
  expect(await records(context)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("favorite-narrow.png"), fullPage: true });
});

test("archived categories cannot create favorites and stale shortcuts require a new active category before save", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  const response = await context.request.post("/api/categories", { headers: { Origin: origin }, data: { type: "EXPENSE", name: "กาแฟที่เลิกใช้" } });
  expect(response.status()).toBe(201);
  const category = (await response.json()).category;
  const input = { ...await draft(context), categoryId: category.id, name: "กาแฟเก่า" };
  expect((await create(context, input)).status()).toBe(201);
  await page.goto("/dashboard");
  const shortcut = page.getByRole("button", { name: "ใช้ กาแฟเก่า" });
  await expect(shortcut).toBeVisible();
  expect((await context.request.patch(`/api/categories/${category.id}`, { headers: { Origin: origin }, data: { archived: true } })).status()).toBe(200);
  expect((await create(context, input)).status()).toBe(422);
  await shortcut.click();
  await expect(page.getByText("หมวดของรายการโปรดนี้เก็บแล้ว กรุณาเลือกหมวดที่ยังใช้งานก่อนบันทึก", { exact: true })).toBeVisible();
  await expect(page.getByLabel("จำนวนเงิน (บาท)")).toHaveValue(input.amount);
  await expect(page.getByText("เลือกหมวดหมู่", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("กรุณาเลือกหมวดหมู่", { exact: true })).toBeVisible();
  expect(await records(context)).toEqual([]);
  await page.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: "อาหารและเครื่องดื่ม", exact: true }).click();
  await page.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  await expect(page.getByText("บันทึกรายการแล้ว", { exact: true })).toBeVisible();
  expect((await records(context))[0].category.name).toBe("อาหารและเครื่องดื่ม");
});

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category, Transaction, TransactionType } from "../../src/lib/finance";

const db = createTestDatabase();
const origin = "http://localhost:3100";
const headers = { Origin: origin };
const users = [
  { id: "category-a", name: "ผู้จัดหมวด ก", email: "category-a@example.test", emailVerified: true },
  { id: "category-b", name: "ผู้จัดหมวด ข", email: "category-b@example.test", emailVerified: true },
];
const url = (id: string) => `/api/categories/${id}`;
async function categories(context: BrowserContext): Promise<Category[]> {
  const response = await context.request.get("/api/categories");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return (await response.json()).categories;
}
async function create(context: BrowserContext, type: TransactionType = "EXPENSE", name = "หมวดใหม่ 🍀") {
  const response = await context.request.post("/api/categories", { headers, data: { type, name } });
  expect(response.status()).toBe(201);
  return (await response.json()).category as Category;
}
async function patch(context: BrowserContext, id: string, data: unknown) {
  return context.request.patch(url(id), { headers, data });
}
async function record(context: BrowserContext, category: Category) {
  const response = await context.request.post("/api/transactions", {
    headers, data: { type: category.type, categoryId: category.id, date: "2020-02-29", amount: "123.45" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).transaction as Transaction;
}
const manager = (page: Page) => page.getByRole("dialog", { name: "จัดการหมวดหมู่", exact: true });
const history = (page: Page) => page.getByRole("list", { name: "รายการรายรับและรายจ่าย" });

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.user.createMany({ data: users });
});
test.beforeEach(async () => {
  await db.transaction.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await db.category.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
});
test.afterAll(async () => { await db.$disconnect(); });

test("HTTP creates both category types, renames and archives without losing history across devices", async ({ context, browser }) => {
  await authenticate(context, db, users[0].id);
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    for (const type of ["INCOME", "EXPENSE"] as const) {
      const category = await create(context, type, "  หมวดส่วนตัว 🍀  ");
      expect(category).toMatchObject({ type, name: "หมวดส่วนตัว 🍀", archived: false });
      const transaction = await record(context, category);
      expect((await patch(context, category.id, { name: " เปลี่ยนชื่อแล้ว " })).status()).toBe(200);
      expect((await patch(context, category.id, { archived: true })).status()).toBe(200);
      const archived = { ...category, name: "เปลี่ยนชื่อแล้ว", archived: true };
      expect(await categories(device)).toContainEqual(archived);
      const persisted = await device.request.get(`/api/transactions/${transaction.id}`);
      expect((await persisted.json()).transaction).toEqual({ ...transaction, category: archived });
      const list = (await (await device.request.get("/api/transactions")).json()).transactions;
      expect(list).toContainEqual({ ...transaction, category: archived });
      const input = { amount: "50.01", date: transaction.date, categoryId: category.id };
      expect((await context.request.post("/api/transactions", { headers, data: { ...input, type } })).status()).toBe(422);
      // Corrections can retain the original archived category, but cannot switch to another archived one.
      expect((await context.request.put(`/api/transactions/${transaction.id}`, { headers, data: input })).status()).toBe(200);
      const otherArchived = await create(context, type);
      await patch(context, otherArchived.id, { archived: true });
      expect((await context.request.put(`/api/transactions/${transaction.id}`, { headers, data: { ...input, categoryId: otherArchived.id } })).status()).toBe(422);
    }
    // Renaming/archiving a starter must not recreate or reset it on the next GET.
    const starter = (await categories(context)).find((item) => item.name === "เงินเดือน")!;
    await patch(context, starter.id, { name: "เงินเดือนเดิม" });
    await patch(context, starter.id, { archived: true });
    const reloaded = await categories(context);
    expect(reloaded.filter((item) => item.id === starter.id)).toEqual([{ ...starter, name: "เงินเดือนเดิม", archived: true }]);
    expect(reloaded.some((item) => item.name === "เงินเดือน")).toBe(false);
  } finally { await device.close(); }
});

test("HTTP category mutations enforce session, ownership, immutable type and valid JSON fields", async ({ context, browser, request }) => {
  await authenticate(context, db, users[0].id);
  const category = await create(context);
  const other = await browser.newContext();
  try {
    await authenticate(other, db, users[1].id);
    const otherCategory = await create(other, "INCOME", "ข้อมูลส่วนตัว ข");
    expect((await request.post("/api/categories", { headers, data: { name: "x", type: "EXPENSE" } })).status()).toBe(401);
    expect((await request.patch(url(category.id), { headers, data: { archived: true } })).status()).toBe(401);
    for (const id of [otherCategory.id, "missing-id"]) {
      for (const data of [{ name: "เปลี่ยนโดย ก" }, { archived: true }]) {
        const response = await patch(context, id, data);
        expect(response.status()).toBe(404);
        expect(await response.json()).toEqual({ error: "ไม่พบหมวดหมู่" });
      }
    }
    for (const name of ["", " \n ", "x".repeat(101), null, 42]) {
      expect((await context.request.post("/api/categories", { headers, data: { name, type: "EXPENSE" } })).status()).toBe(422);
      expect((await patch(context, category.id, { name })).status()).toBe(422);
    }
    for (const data of [{}, { type: "INCOME" }, { archived: false }, { name: "x", userId: users[1].id }, { name: "x", starterKey: "salary" }]) {
      expect((await patch(context, category.id, data)).status()).toBe(422);
    }
    for (const data of [{ name: "x", type: "REFUND" }, { name: "x", type: "INCOME", userId: users[1].id }]) {
      expect((await context.request.post("/api/categories", { headers, data })).status()).toBe(422);
    }
    for (const method of ["post", "patch"] as const) {
      const endpoint = method === "post" ? "/api/categories" : url(category.id);
      expect((await context.request[method](endpoint, { headers: { Origin: "https://attacker.invalid" }, data: { name: "x" } })).status()).toBe(403);
      expect((await context.request[method](endpoint, { headers: { ...headers, "Content-Type": "text/plain" }, data: "x" })).status()).toBe(415);
      expect((await context.request[method](endpoint, { headers: { ...headers, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
    }
    expect(await categories(other)).toContainEqual(otherCategory);
    expect((await categories(context)).some((item) => item.id === otherCategory.id)).toBe(false);
    expect(await categories(context)).toContainEqual(category);
  } finally { await other.close(); }
});

test("archiving blocks submissions from a form loaded on another device and preserves existing records", async ({ context, browser }) => {
  await authenticate(context, db, users[0].id);
  const category = await create(context);
  const original = await record(context, category);
  const device = await browser.newContext();
  try {
    await authenticate(device, db, users[0].id);
    const draft = (await categories(device)).find((item) => item.id === category.id)!;
    await patch(context, category.id, { archived: true });
    const response = await device.request.post("/api/transactions", {
      headers, data: { type: draft.type, categoryId: draft.id, amount: "1.00", date: "2020-01-01" },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).fields).toHaveProperty("categoryId");
    const records = (await (await device.request.get("/api/transactions")).json()).transactions;
    expect(records).toEqual([{ ...original, category: { ...category, archived: true } }]);
  } finally { await device.close(); }
});

for (const type of ["EXPENSE", "INCOME"] as const) {
  test(`browser adds, renames and archives ${type}, retains history and can correct an archived record`, async ({ context, page }, testInfo) => {
    await authenticate(context, db, users[0].id);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "จัดการหมวดหมู่", exact: true }).click();
    await manager(page).getByRole("button", { name: "เพิ่มหมวดหมู่", exact: true }).click();
    const add = page.getByRole("dialog", { name: "เพิ่มหมวดหมู่", exact: true });
    if (type === "INCOME") await add.getByText("รายรับ", { exact: true }).click();
    await add.getByLabel("ชื่อหมวดหมู่").fill("หมวดสร้างจากหน้าจอ");
    await add.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
    await expect(add).toHaveCount(0);
    await manager(page).getByRole("button", { name: "ปิด", exact: true }).click();
    // The new category is immediately available for its own type only.
    const entry = page.getByRole("region", { name: "เพิ่มรายการ", exact: true });
    await entry.getByText(type === "INCOME" ? "รายจ่าย" : "รายรับ", { exact: true }).click();
    await entry.getByLabel("หมวดหมู่", { exact: true }).click();
    await expect(page.getByRole("option", { name: "หมวดสร้างจากหน้าจอ", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await entry.getByText(type === "INCOME" ? "รายรับ" : "รายจ่าย", { exact: true }).click();
    await entry.getByLabel("หมวดหมู่", { exact: true }).click();
    await page.getByRole("option", { name: "หมวดสร้างจากหน้าจอ", exact: true }).click();
    await entry.getByLabel("จำนวนเงิน (บาท)").fill("12.34");
    await entry.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
    await expect(history(page)).toContainText("หมวดสร้างจากหน้าจอ");
    await page.getByRole("button", { name: "จัดการหมวดหมู่", exact: true }).click();
    let row = manager(page).getByRole("listitem").filter({ hasText: "หมวดสร้างจากหน้าจอ" });
    await row.getByRole("button", { name: "เปลี่ยนชื่อ", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "เปลี่ยนชื่อหมวดหมู่", exact: true });
    await rename.getByLabel("ชื่อหมวดหมู่").fill("ชื่อใหม่ย้อนหลัง");
    await rename.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
    await expect(rename).toHaveCount(0);
    row = manager(page).getByRole("listitem").filter({ hasText: "ชื่อใหม่ย้อนหลัง" });
    await row.getByRole("button", { name: "เก็บหมวด", exact: true }).click();
    await expect(row).toContainText("(เก็บแล้ว)");
    await expect(row.getByRole("button", { name: "เก็บหมวด", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("categories.png"), fullPage: true });
    await manager(page).getByRole("button", { name: "ปิด", exact: true }).click();
    await expect(entry.getByText("เลือกหมวดหมู่", { exact: true })).toBeVisible();
    await entry.getByLabel("หมวดหมู่", { exact: true }).click();
    await expect(page.getByRole("option", { name: /ชื่อใหม่ย้อนหลัง/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(history(page)).toContainText("ชื่อใหม่ย้อนหลัง");
    await history(page).getByRole("button", { name: "แก้ไข", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "แก้ไขรายการ", exact: true });
    await expect(edit.getByText("ชื่อใหม่ย้อนหลัง (เก็บแล้ว)", { exact: true })).toBeVisible();
    await edit.getByLabel("จำนวนเงิน (บาท)").fill("11.11");
    await edit.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(history(page)).toContainText("11.11 บาท");
    await page.reload();
    await expect(history(page)).toContainText("ชื่อใหม่ย้อนหลัง");
    await expect(history(page)).toContainText("11.11 บาท");
  });
}

test("browser validation, cancellation and failed mutations preserve category drafts and history", async ({ context, page }) => {
  await authenticate(context, db, users[0].id);
  const category = await create(context, "EXPENSE", "หมวดเดิม");
  await record(context, category);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "จัดการหมวดหมู่", exact: true }).click();
  await manager(page).getByRole("button", { name: "เพิ่มหมวดหมู่", exact: true }).click();
  const add = page.getByRole("dialog", { name: "เพิ่มหมวดหมู่", exact: true });
  await add.getByLabel("ชื่อหมวดหมู่").fill("   ");
  await add.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
  await expect(add.getByText("กรุณากรอกชื่อหมวดหมู่", { exact: true })).toBeVisible();
  await add.getByLabel("ชื่อหมวดหมู่").fill("ร่างที่ไม่หาย");
  await page.route("**/api/categories", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "เพิ่มไม่สำเร็จ" }) }) : route.continue());
  await add.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
  await expect(add.getByText("เพิ่มไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(add.getByLabel("ชื่อหมวดหมู่")).toHaveValue("ร่างที่ไม่หาย");
  await add.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  const row = manager(page).getByRole("listitem").filter({ hasText: "หมวดเดิม" });
  await page.route(`**/api/categories/${category.id}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "แก้หมวดไม่สำเร็จ" }) }));
  await row.getByRole("button", { name: "เปลี่ยนชื่อ", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "เปลี่ยนชื่อหมวดหมู่", exact: true });
  await rename.getByLabel("ชื่อหมวดหมู่").fill("ร่างชื่อใหม่");
  await rename.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
  await expect(rename.getByText("แก้หมวดไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(rename.getByLabel("ชื่อหมวดหมู่")).toHaveValue("ร่างชื่อใหม่");
  await rename.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await row.getByRole("button", { name: "เก็บหมวด", exact: true }).click();
  await expect(manager(page).getByText("แก้หมวดไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(row).not.toContainText("เก็บแล้ว");
  await manager(page).getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(history(page)).toContainText("หมวดเดิม");
  expect(await categories(context)).toContainEqual(category);
});

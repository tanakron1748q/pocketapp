import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";
import type { Category } from "../../src/lib/finance";

const db = createTestDatabase();
const headers = { Origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3100" };
const users = ["release-a", "release-b"];
const overview = (page: Page) => page.getByRole("region", { name: "ภาพรวมรายเดือน", exact: true });
const history = (page: Page) => page.getByRole("list", { name: "รายการรายรับและรายจ่าย", exact: true });
const budgets = (page: Page) => page.getByRole("region", { name: "งบรายเดือน", exact: true });
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ดาวน์โหลด CSV", exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, "utf8");
}
async function totals(page: Page, expense: string, net: string, remaining: string) {
  await expect(overview(page).getByRole("region", { name: "รายจ่ายสุทธิรายเดือน", exact: true })).toContainText(`รายจ่ายสุทธิ ${expense} บาท`);
  await expect(overview(page).getByRole("region", { name: "เงินเหลือประจำเดือน", exact: true })).toContainText(`${net} บาท`);
  await expect(budgets(page)).toContainText(`คงเหลือ ${remaining} บาท`);
}

test.beforeEach(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.user.createMany({ data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })) });
});
test.afterAll(async () => { await db.$disconnect(); });

test("connected journey keeps categories, favorites, refunds, budgets, comparisons, CSV and two devices consistent after corrections", async ({ context, page, browser }, testInfo) => {
  await authenticate(context, db, users[0]);
  await page.goto("/dashboard");
  await expect(history(page).getByRole("listitem")).toHaveCount(0);
  await overview(page).getByLabel("เดือน (เวลาไทย)").fill("2024-02");
  const categories: Category[] = (await (await context.request.get("/api/categories")).json()).categories;
  const income = categories.find((c) => c.type === "INCOME")!;
  // Seed known incomes through the public HTTP boundary; all corrections below use UI.
  for (const [date, amount] of [["2024-01-15", "200.00"], ["2024-02-15", "1000.10"]]) {
    expect((await context.request.post("/api/transactions", { headers, data: { type: "INCOME", categoryId: income.id, date, amount, description: "รายรับตรวจรับ" } })).status()).toBe(201);
  }
  await page.getByRole("button", { name: "จัดการหมวดหมู่", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "จัดการหมวดหมู่", exact: true });
  await manager.getByRole("button", { name: "เพิ่มหมวดหมู่", exact: true }).click();
  const categoryDialog = page.getByRole("dialog", { name: "เพิ่มหมวดหมู่", exact: true });
  await categoryDialog.getByLabel("ชื่อหมวดหมู่").fill("หมวดตรวจรับ");
  await categoryDialog.getByRole("button", { name: "บันทึกหมวดหมู่", exact: true }).click();
  await expect(categoryDialog).toHaveCount(0);
  await manager.getByRole("button", { name: "ปิด", exact: true }).click();
  const entry = page.getByRole("region", { name: "เพิ่มรายการ", exact: true });
  await entry.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("100.25");
  await entry.getByLabel("หมวดหมู่", { exact: true }).click();
  await page.getByRole("option", { name: "หมวดตรวจรับ", exact: true }).click();
  await entry.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2024-02-15");
  await entry.getByLabel("คำอธิบาย (ไม่บังคับ)").fill("ซื้อของตรวจรับ");
  await page.getByRole("button", { name: "เก็บรายละเอียดในฟอร์มเป็นรายการโปรด" }).click();
  const favorite = page.getByRole("dialog", { name: "เก็บเป็นรายการโปรด" });
  await favorite.getByLabel("ชื่อรายการโปรด").fill("โปรดตรวจรับ");
  await favorite.getByRole("button", { name: "เก็บรายการโปรด", exact: true }).click();
  await expect(favorite).not.toBeVisible();
  await entry.getByRole("button", { name: "ยกเลิกร่าง", exact: true }).click();
  await page.getByRole("button", { name: /^ใช้ โปรดตรวจรับ/ }).click();
  await expect(entry.getByLabel("จำนวนเงิน (บาท)", { exact: true })).toHaveValue("100.25");
  expect((await (await context.request.get("/api/transactions")).json()).transactions).toHaveLength(2);
  await entry.getByLabel("วันที่ (เวลาไทย)", { exact: true }).fill("2024-02-15");
  await entry.getByRole("button", { name: "บันทึกรายการ", exact: true }).click();
  const expense = history(page).getByRole("listitem").filter({ hasText: "ซื้อของตรวจรับ" });
  await expect(expense).toContainText("100.25 บาท");
  const budgetRow = budgets(page).getByRole("listitem").filter({ hasText: "หมวดตรวจรับ" });
  await budgetRow.getByRole("button", { name: "ตั้งงบ", exact: true }).click();
  const budget = page.getByRole("dialog", { name: "ตั้งงบหมวดรายจ่าย" });
  await budget.getByLabel("งบ (บาท)").fill("150.00");
  await budget.getByRole("button", { name: "บันทึกงบ", exact: true }).click();
  await expect(budget).toHaveCount(0);
  await totals(page, "100.25", "899.85", "49.75");
  await expense.getByRole("button", { name: "เงินคืน / ประวัติ", exact: true }).click();
  const refunds = page.getByRole("dialog", { name: "เงินคืนของรายจ่าย", exact: true });
  await refunds.getByLabel("จำนวนเงินคืน (บาท)").fill("20.05");
  await refunds.getByLabel("วันที่ได้รับเงินคืน (เวลาไทย)").fill("2024-02-20");
  await refunds.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
  await expect(refunds).toContainText("คืนแล้ว 20.05 บาท");
  await refunds.getByRole("button", { name: "Close", exact: true }).click();
  await totals(page, "80.20", "919.90", "69.80");
  await expect(overview(page).getByRole("region", { name: "เปรียบเทียบเงินเหลือ", exact: true })).toContainText("เพิ่มขึ้น 719.90 บาท");
  const csv = await download(page);
  expect(csv).toContain('"REFUND","หมวดตรวจรับ","20.05"');
  expect(csv).toContain('"EXPENSE","หมวดตรวจรับ","100.25"');
  const second = await browser.newContext();
  const other = await browser.newContext();
  try {
    await authenticate(second, db, users[0]);
    await authenticate(other, db, users[1]);
    expect((await (await second.request.get("/api/dashboard?month=2024-02")).json()).monthlyNet).toBe("919.90");
    expect((await (await other.request.get("/api/dashboard?month=2024-02")).json()).monthlyNet).toBe("0.00");
    expect(await (await other.request.get("/api/transactions/export")).text()).not.toContain("หมวดตรวจรับ");
    await expense.getByRole("button", { name: "แก้ไข", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "แก้ไขรายการ", exact: true });
    await edit.getByLabel("จำนวนเงิน (บาท)").fill("80.25");
    await edit.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await totals(page, "60.20", "939.90", "89.80");
    await expense.getByRole("button", { name: "เงินคืน / ประวัติ", exact: true }).click();
    await refunds.getByRole("button", { name: "แก้ไขเงินคืน", exact: true }).click();
    await refunds.getByLabel("จำนวนเงินคืน (บาท)").fill("10.05");
    await refunds.getByRole("button", { name: "บันทึกเงินคืน", exact: true }).click();
    await expect(refunds).toContainText("คืนแล้ว 10.05 บาท");
    await refunds.getByRole("button", { name: "Close", exact: true }).click();
    await totals(page, "70.20", "929.90", "79.80");
    await expense.getByRole("button", { name: "เงินคืน / ประวัติ", exact: true }).click();
    await refunds.getByRole("button", { name: "ลบเงินคืน", exact: true }).click();
    await page.getByRole("dialog", { name: "ยืนยันลบเงินคืน", exact: true }).getByRole("button", { name: "ยืนยันลบเงินคืน", exact: true }).click();
    await expect(refunds).toContainText("ยังไม่มีเงินคืน");
    await refunds.getByRole("button", { name: "Close", exact: true }).click();
    await totals(page, "80.25", "919.85", "69.75");
    await expense.getByRole("button", { name: "ลบ", exact: true }).click();
    await page.getByRole("dialog", { name: "ยืนยันการลบรายการ", exact: true }).getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
    await expect(expense).toHaveCount(0);
    await totals(page, "0.00", "1,000.10", "150.00");
    const exported = await download(page);
    expect(exported).not.toContain('"EXPENSE"');
    expect(exported).not.toContain('"REFUND"');
    expect(exported).toContain('"1000.10"');
    expect((await (await second.request.get("/api/dashboard?month=2024-02")).json()).monthlyNet).toBe("1000.10");
    await page.reload();
    await overview(page).getByLabel("เดือน (เวลาไทย)").fill("2024-02");
    await totals(page, "0.00", "1,000.10", "150.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("release-journey.png"), fullPage: true });
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await expect(page).toHaveURL(`${headers.Origin}/`);
    expect((await context.request.get("/api/dashboard")).status()).toBe(401);
    expect((await second.request.get("/api/dashboard")).status()).toBe(200);
  } finally { await second.close(); await other.close(); }
});

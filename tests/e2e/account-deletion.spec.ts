import { createHash, randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";

const db = createTestDatabase();
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const headers = { Origin: origin };
const users = ["deletion-a", "deletion-b"];
const confirmation = { confirmation: "ลบบัญชีของฉัน" };

async function start(context: BrowserContext) {
  const response = await context.request.post("/api/account/verification", { headers });
  expect(response.status()).toBe(200);
  return new URL((await response.json()).url);
}
function callback(url: URL, overrides: Record<string, unknown> = {}) {
  const code = Buffer.from(JSON.stringify({ subject: `sub-${users[0]}`, nonce: url.searchParams.get("nonce"), challenge: url.searchParams.get("code_challenge"), ...overrides })).toString("base64url");
  return `/api/account/verification/callback?${new URLSearchParams({ state: url.searchParams.get("state")!, code })}`;
}
async function verify(context: BrowserContext) {
  const url = await start(context);
  const response = await context.request.get(callback(url), { maxRedirects: 0 });
  expect(response.headers().location).toBe(`${origin}/settings`);
  expect((await (await context.request.get("/api/account/verification")).json()).verified).toBe(true);
  return url;
}
async function populatedUser(userId: string) {
  await db.user.create({ data: { id: userId, name: userId, email: `${userId}@example.test`, accounts: { create: { id: randomUUID(), providerId: "google", accountId: `sub-${userId}` } } } });
  const category = await db.category.create({ data: { userId, name: "หมวดส่วนตัว", type: "EXPENSE" } });
  const transaction = await db.transaction.create({ data: { userId, categoryId: category.id, type: "EXPENSE", amountSatang: 10000, date: new Date("2024-01-01") } });
  await db.refund.create({ data: { userId, expenseId: transaction.id, amountSatang: 1000, date: new Date("2024-02-01") } });
  await db.favoriteEntry.create({ data: { userId, categoryId: category.id, type: "EXPENSE", name: "โปรด", amountSatang: 1000 } });
  await db.budgetSetting.create({ data: { userId, categoryId: category.id, scope: "DEFAULT", month: new Date("2024-01-01"), amountSatang: 5000 } });
}

test.beforeEach(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  for (const user of users) await populatedUser(user);
});
test.afterAll(async () => { await db.$disconnect(); });

test("fresh session alone, forged proof, cross-origin and anonymous deletion cannot remove data", async ({ context, request }) => {
  await authenticate(context, db, users[0]);
  expect((await request.delete("/api/account", { headers, data: confirmation })).status()).toBe(401);
  expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
  expect((await context.request.post("/api/account/verification", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  expect((await context.request.get("/api/auth/delete-user?token=forged")).status()).not.toBe(200);
  await context.addCookies([{ name: "pocketapp-delete", value: "x".repeat(43), url: origin }]);
  expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
  expect(await db.user.count({ where: { id: { in: users } } })).toBe(2);
});

test("OAuth requests renewed consent with state, nonce, PKCE and exact callback; failures never verify", async ({ context }) => {
  await authenticate(context, db, users[0]);
  for (const override of [
    { subject: `sub-${users[1]}` }, { nonce: "wrong" }, { issuer: "https://evil.example" },
    { audience: "other-client" }, { expired: true }, { forged: true }, { failure: true },
  ]) {
    const url = await start(context);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/account/verification/callback`);
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")?.length).toBe(43);
    const response = await context.request.get(callback(url, override), { maxRedirects: 0 });
    expect(response.headers().location).toBe(`${origin}/settings?verification=failed`);
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
  }
  for (const query of ["error=access_denied", "state=forged&code=fake"]) {
    await start(context);
    await context.request.get(`/api/account/verification/callback?${query}`);
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
  }
  expect(await db.user.count({ where: { id: { in: users } } })).toBe(2);
});

test("proof expires, stays bound to its session, and cancellation invalidates callbacks and verified proof", async ({ context, browser }) => {
  await authenticate(context, db, users[0]);
  const second = await browser.newContext();
  try {
    await authenticate(second, db, users[0]);
    const url = await verify(context);
    const proofCookie = (await context.cookies()).find((c) => c.name === "pocketapp-delete")!;
    await second.addCookies([proofCookie]);
    expect((await second.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
    await db.deletionVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
    await verify(context);
    expect((await context.request.delete("/api/account/verification", { headers })).status()).toBe(200);
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
    await context.request.get(callback(url));
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
    const pending = await start(context);
    await context.request.delete("/api/account/verification", { headers });
    await context.request.get(callback(pending));
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
  } finally { await second.close(); }
});

test("cancelling an in-flight provider roundtrip cannot resurrect a deletion proof", async ({ context }) => {
  await authenticate(context, db, users[0]);
  const url = await start(context);
  const response = context.request.get(callback(url, { delay: true }), { maxRedirects: 0 });
  await expect.poll(async () => (await db.deletionVerification.findFirst({ where: { id: createHash("sha256").update(url.searchParams.get("state")!).digest("base64url") } }))?.verifier).toBe(null);
  await context.request.delete("/api/account/verification", { headers });
  expect((await response).headers().location).toContain("verification=failed");
  expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(403);
});

test("same-identity proof plus exact confirmation atomically deletes all owned data and sessions, preserving B", async ({ context, browser, request }) => {
  const replay = await authenticate(context, db, users[0]);
  const second = await browser.newContext();
  const other = await browser.newContext();
  try {
    await authenticate(second, db, users[0]);
    await authenticate(other, db, users[1]);
    await verify(context);
    expect((await context.request.delete("/api/account", { headers, data: { confirmation: "wrong" } })).status()).toBe(422);
    expect((await context.request.delete("/api/account", { headers: { Origin: "https://evil.example" }, data: confirmation })).status()).toBe(403);
    expect((await context.request.delete("/api/account", { headers, data: { ...confirmation, userId: users[1] } })).status()).toBe(422);
    const deleted = await context.request.delete("/api/account", { headers, data: confirmation });
    expect(deleted.status()).toBe(200);
    expect(deleted.headers()["cache-control"]).toBe("private, no-store");
    expect(await db.user.findUnique({ where: { id: users[0] } })).toBe(null);
    for (const userId of users) {
      const where = { userId };
      const counts = await Promise.all([
        db.account.count({ where }), db.session.count({ where }), db.category.count({ where }),
        db.transaction.count({ where }), db.refund.count({ where }), db.favoriteEntry.count({ where }), db.budgetSetting.count({ where }),
      ]);
      for (const count of counts) {
        if (userId === users[0]) expect(count).toBe(0);
        else expect(count).toBeGreaterThan(0);
      }
    }
    expect(await db.deletionVerification.count()).toBe(0);
    for (const url of ["/api/me", "/api/transactions", "/api/dashboard", "/api/budgets", "/api/transactions/export", "/api/account/verification"]) {
      expect((await second.request.get(url)).status()).toBe(401);
      expect((await request.get(url, { headers: { Cookie: replay } })).status()).toBe(401);
    }
    expect((await other.request.get("/api/me")).status()).toBe(200);
    expect((await (await other.request.get("/api/dashboard?month=2024-02")).json()).netExpense).toBe("-10.00");
  } finally { await second.close(); await other.close(); }
});

test("a database failure rolls back proof consumption and all data, allowing a safe retry", async ({ context }) => {
  await authenticate(context, db, users[0]);
  await verify(context);
  await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_account_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test deletion failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER test_reject_account_delete BEFORE DELETE ON users FOR EACH ROW WHEN (OLD.id = 'deletion-a') EXECUTE FUNCTION test_reject_account_delete()`);
  try {
    expect((await context.request.delete("/api/account", { headers, data: confirmation })).status()).toBe(503);
    expect((await context.request.get("/api/me")).status()).toBe(200);
    expect(await db.refund.count({ where: { userId: users[0] } })).toBe(1);
    expect((await (await context.request.get("/api/account/verification")).json()).verified).toBe(true);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER test_reject_account_delete ON users`);
    await db.$executeRawUnsafe(`DROP FUNCTION test_reject_account_delete()`);
  }
  const attempts = await Promise.all([1, 2].map(() => context.request.delete("/api/account", { headers, data: confirmation })));
  expect(attempts.filter((response) => response.status() === 200)).toHaveLength(1);
  expect(await db.user.findUnique({ where: { id: users[0] } })).toBe(null);
});

test("browser settings requires re-verification, validates text, recovers from failure, cancels and deletes", async ({ context, page }, testInfo) => {
  await authenticate(context, db, users[0]);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "ตั้งค่าบัญชี" }).click();
  await expect(page.getByRole("button", { name: "ลบบัญชีถาวร" })).toHaveCount(0);
  await expect(page.getByText("บัญชี Google ของคุณยังอยู่", { exact: false })).toBeVisible();
  await page.route("https://accounts.google.com/**", async (route) => { await route.fulfill({ status: 302, headers: { location: `${origin}${callback(new URL(route.request().url()))}` } }); });
  await page.getByRole("button", { name: "ยืนยัน Google เพื่อลบบัญชี" }).click();
  const button = page.getByRole("button", { name: "ลบบัญชีถาวร", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText("กรุณาพิมพ์ข้อความยืนยัน", { exact: true })).toBeVisible();
  await page.getByLabel("พิมพ์ ลบบัญชีของฉัน เพื่อยืนยัน").fill("ลบ");
  await button.click();
  await expect(page.getByText("ข้อความยืนยันไม่ตรงกัน", { exact: true })).toBeVisible();
  await page.getByLabel("พิมพ์ ลบบัญชีของฉัน เพื่อยืนยัน").fill(confirmation.confirmation);
  await page.route("**/api/account", (route) => route.fulfill({ status: 503, json: { error: "ลบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง" } }));
  await button.click();
  await expect(page.getByRole("alert").filter({ hasText: "ลบบัญชีไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByLabel("พิมพ์ ลบบัญชีของฉัน เพื่อยืนยัน")).toHaveValue(confirmation.confirmation);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("account-deletion.png"), fullPage: true });
  await page.getByRole("button", { name: "ยกเลิกและกลับ" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await db.user.findUnique({ where: { id: users[0] } })).not.toBe(null);
  await page.unroute("**/api/account");
  await page.goto("/settings");
  await page.getByRole("button", { name: "ยืนยัน Google เพื่อลบบัญชี" }).click();
  await page.getByLabel("พิมพ์ ลบบัญชีของฉัน เพื่อยืนยัน").fill(confirmation.confirmation);
  await button.click();
  await expect(page).toHaveURL(`${origin}/`);
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

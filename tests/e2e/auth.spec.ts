import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { authenticate, createTestDatabase } from "./support";

const db = createTestDatabase();
const origin = (process.env.BETTER_AUTH_URL ?? "http://localhost:3100");
const users = [
  { id: "test-google-a", name: "ผู้ใช้ ก", email: "alice@example.test" },
  { id: "test-google-b", name: "ผู้ใช้ ข", email: "bob@example.test" },
];

// Fixture injection exists only in the test process, never in application routes.
async function session(context: BrowserContext, userId: string, expiresAt?: Date) {
  return authenticate(context, db, userId, expiresAt);
}

test.beforeAll(async () => {
  await db.user.deleteMany();
  for (const user of users) {
    await db.user.create({ data: {
      ...user, emailVerified: true,
      accounts: { create: { id: randomUUID(), accountId: `google-sub-${user.id}`, providerId: "google" } },
    } });
  }
});
test.afterAll(async () => { await db.$disconnect(); });

test("anonymous visitors cannot access private pages or direct HTTP data", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบ" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  const response = await request.get("/api/me?userId=test-google-a");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain(users[0].email);
});

test("Google login uses real provider, account chooser, state and local callback", async ({ request }) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: origin },
    data: { provider: "google", callbackURL: "/dashboard", disableRedirect: true },
  });
  expect(response.ok()).toBe(true);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
  expect(url.searchParams.get("prompt")).toBe("select_account");
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  const invalid = await request.get("/api/auth/callback/google?code=forged&state=forged", { maxRedirects: 0 });
  expect(invalid.status()).toBe(302);
  expect(await (await request.get("/api/me")).json()).toHaveProperty("error");
});

test("two users and a second device see only their verified identity", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    await session(contexts[0], users[0].id);
    await session(contexts[1], users[1].id);
    await session(contexts[2], users[0].id);
    for (const [index, context] of contexts.entries()) {
      const expected = index === 1 ? users[1] : users[0];
      const response = await context.request.get(`/api/me?userId=${index === 1 ? users[0].id : users[1].id}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ user: { ...expected, image: null } });
      expect(response.headers()["cache-control"]).toContain("no-store");
      const page = await context.newPage();
      await page.goto("/dashboard");
      await expect(page.getByText(expected.email, { exact: true })).toBeVisible();
      await expect(page.getByText(index === 1 ? users[0].email : users[1].email)).toHaveCount(0);
    }
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

test("logout revokes the session including replay while another user's session survives", async ({ page, context, browser, request }) => {
  const cookie = await session(context, users[0].id);
  const other = await browser.newContext();
  try {
    await session(other, users[1].id);
    await page.goto("/dashboard");
    await expect(page.getByText(users[0].email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await expect(page).toHaveURL(origin + "/");
    expect((await request.get("/api/me", { headers: { Cookie: cookie } })).status()).toBe(401);
    expect((await other.request.get("/api/me")).status()).toBe(200);
    await page.goBack();
    await expect(page.getByText(users[0].email, { exact: true })).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  } finally { await other.close(); }
});

test("switching accounts clears old identity and revokes its cookie", async ({ page, context, request }) => {
  const cookie = await session(context, users[0].id);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "สลับบัญชี Google" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/me", { headers: { Cookie: cookie } })).status()).toBe(401);
  await session(context, users[1].id);
  await page.goto("/dashboard");
  await expect(page.getByText(users[1].email, { exact: true })).toBeVisible();
  await expect(page.getByText(users[0].email)).toHaveCount(0);
});

test("expired and tampered cookies cannot authenticate", async ({ context, page }) => {
  await session(context, users[0].id, new Date(Date.now() - 60_000));
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await session(context, users[0].id);
  const cookies = await context.cookies();
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, value: cookie.value + "tampered" })));
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("cross-origin sign-out is rejected and no password/demo login is available", async ({ context, request }) => {
  await session(context, users[0].id);
  const forbidden = await context.request.post("/api/auth/sign-out", { headers: { Origin: "https://attacker.invalid" }, data: {} });
  expect(forbidden.status()).toBe(403);
  expect((await context.request.get("/api/me")).status()).toBe(200);
  const password = await request.post("/api/auth/sign-in/email", { data: { email: users[0].email, password: "demo" } });
  expect(password.ok()).toBe(false);
  expect((await request.post("/api/auth/test-login", { data: { userId: users[0].id } })).status()).toBe(404);
});

test("logout clears the private workspace in another open tab", async ({ context, page }) => {
  await session(context, users[0].id);
  const otherTab = await context.newPage();
  await page.goto("/dashboard");
  await otherTab.goto("/dashboard");
  await expect(otherTab.getByText(users[0].email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await expect(otherTab).toHaveURL(/\/login$/);
  await expect(otherTab.getByText(users[0].email)).toHaveCount(0);
});

test("login failure allows retry and workspace fits the viewport", async ({ page, context }, testInfo) => {
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ message: "unavailable" }),
  }));
  await page.goto("/login?error=oauth");
  await expect(page.getByRole("alert").filter({ hasText: "เข้าสู่ระบบไม่สำเร็จ" })).toBeVisible();
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  await expect(page.getByText("เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" })).toBeEnabled();
  await session(context, users[0].id);
  await page.goto("/dashboard");
  await expect(page.getByText(users[0].email, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
});

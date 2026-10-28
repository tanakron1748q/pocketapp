import { defineConfig, devices } from "@playwright/test";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/missing");
if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.pathname !== "/pocketapp_test") {
  throw new Error("Run pnpm test:e2e to provision an isolated local PostgreSQL database");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

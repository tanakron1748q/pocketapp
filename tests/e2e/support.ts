import { createHmac, randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export function createTestDatabase() {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/pocketapp_test") {
    throw new Error("Test fixtures require the isolated local database");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
}

// No fixture injection endpoint is compiled into the application.
export async function authenticate(context: BrowserContext, db: PrismaClient, userId: string, expiresAt = new Date(Date.now() + 3_600_000)) {
  const token = randomUUID();
  await db.session.create({ data: { id: randomUUID(), token, userId, expiresAt } });
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  await context.addCookies([{ name: "better-auth.session_token", value, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
  return `better-auth.session_token=${value}`;
}

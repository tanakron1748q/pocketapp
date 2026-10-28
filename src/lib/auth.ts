import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { getDb } from "./db";

export function isAuthConfigured() {
  return ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
    .every((key) => Boolean(process.env[key]?.trim()));
}

function createAuth() {
  if (!isAuthConfigured()) throw new Error("Authentication environment variables are required");
  const baseURL = new URL(process.env.BETTER_AUTH_URL!);
  if (baseURL.origin !== process.env.BETTER_AUTH_URL ||
      (process.env.NODE_ENV === "production" && baseURL.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(baseURL.hostname))) {
    throw new Error("BETTER_AUTH_URL must be an exact origin; production requires HTTPS");
  }
  if (process.env.BETTER_AUTH_SECRET!.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  return betterAuth({
    appName: "Pocketapp",
    baseURL: baseURL.origin,
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: [baseURL.origin],
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account",
      },
    },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    onAPIError: { errorURL: "/login?error=oauth" },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (auth ??= createAuth());
}

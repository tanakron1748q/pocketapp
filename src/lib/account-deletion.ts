import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb } from "./db";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const lifetime = 5 * 60;
const random = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
const cookieName = () => process.env.BETTER_AUTH_URL!.startsWith("https:")
  ? "__Host-pocketapp-delete" : "pocketapp-delete";
const callbackURL = () => `${process.env.BETTER_AUTH_URL}/api/account/verification/callback`;

export async function clearDeletionCookie() {
  (await cookies()).set(cookieName(), "", { httpOnly: true, secure: process.env.BETTER_AUTH_URL!.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function deletionProof(sessionId: string) {
  const secret = (await cookies()).get(cookieName())?.value;
  if (!secret || secret.length !== 43) return null;
  return getDb().deletionVerification.findFirst({
    where: { id: hash(secret), sessionId, expiresAt: { gt: new Date() } },
  });
}

export async function beginDeletionVerification(sessionId: string, userId: string) {
  const account = await getDb().account.findFirst({ where: { userId, providerId: "google" } });
  if (!account) throw new Error("Google identity is required");
  const state = random();
  const verifier = random();
  const nonce = random();
  const proof = { id: hash(state), subject: account.accountId, verifier, nonce, verifiedAt: null, expiresAt: new Date(Date.now() + lifetime * 1000) };
  await getDb().deletionVerification.upsert({ where: { sessionId }, create: { ...proof, sessionId }, update: proof });
  (await cookies()).set(cookieName(), state, { httpOnly: true, secure: process.env.BETTER_AUTH_URL!.startsWith("https:"), sameSite: "lax", path: "/", maxAge: lifetime });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackURL(),
    response_type: "code", scope: "openid email", state, nonce,
    code_challenge: hash(verifier), code_challenge_method: "S256",
    prompt: "consent select_account",
  }).toString();
  return url.toString();
}

export async function completeDeletionVerification(sessionId: string, userId: string, url: URL) {
  const proof = await deletionProof(sessionId);
  if (!proof || !proof.verifier) return false;
  // Claim before external I/O. Keep the row so cancellation/new attempts can
  // invalidate an in-flight callback before it publishes a verified proof.
  const claimed = await getDb().deletionVerification.updateMany({ where: { id: proof.id, sessionId, verifier: proof.verifier, verifiedAt: null }, data: { verifier: null } });
  if (claimed.count !== 1 || url.searchParams.get("error") || hash(url.searchParams.get("state") ?? "") !== proof.id) return false;
  const code = url.searchParams.get("code");
  if (!code) return false;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: callbackURL(), grant_type: "authorization_code", code_verifier: proof.verifier }),
  });
  if (!response.ok) return false;
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string") return false;
  const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"], audience: process.env.GOOGLE_CLIENT_ID!,
    algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "nonce"], maxTokenAge: "5m",
  });
  if (payload.nonce !== proof.nonce || payload.sub !== proof.subject ||
      (payload.azp !== undefined && payload.azp !== process.env.GOOGLE_CLIENT_ID)) return false;
  // Recheck identity and session after the provider roundtrip. Never switch/login/create a User here.
  const account = await getDb().account.findFirst({ where: { userId, providerId: "google", accountId: payload.sub } });
  const session = await getDb().session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } } });
  if (!account || !session || proof.expiresAt <= new Date()) return false;
  const completed = await getDb().deletionVerification.updateMany({
    where: { id: proof.id, sessionId, verifiedAt: null, expiresAt: { gt: new Date() } }, data: { verifiedAt: new Date() },
  });
  return completed.count === 1;
}

export async function deleteVerifiedAccount(sessionId: string, userId: string) {
  const proof = await deletionProof(sessionId);
  if (!proof?.verifiedAt || proof.verifier) return false;
  return getDb().$transaction(async (tx) => {
    const liveSession = await tx.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } } });
    const account = await tx.account.findFirst({ where: { userId, providerId: "google", accountId: proof.subject } });
    if (!liveSession || !account) return false;
    const consumed = await tx.deletionVerification.deleteMany({ where: { id: proof.id, sessionId, verifiedAt: { not: null }, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    // PostgreSQL cascades all owned records, including every session and its proofs,
    // in this one statement. NO ACTION business references are checked afterwards.
    await tx.user.delete({ where: { id: userId } });
    return true;
  });
}

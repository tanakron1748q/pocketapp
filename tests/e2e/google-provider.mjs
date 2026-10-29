// Test-process preload only. Production never imports this module or accepts a
// provider URL/key override. Tokens are really signed; app JWT checks still run.
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const database = new URL(process.env.DATABASE_URL);
if (database.hostname !== "127.0.0.1" || database.pathname !== "/pocketapp_test" || !process.env.POCKETAPP_TEST_CLOCK_FILE) {
  throw new Error("Google fixture requires the disposable test runner");
}
const { privateKey, publicKey } = await generateKeyPair("RS256");
const key = { ...await exportJWK(publicKey), kid: "test-google", alg: "RS256", use: "sig" };
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [key] });
  if (url === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(init.body);
    let data;
    try { data = JSON.parse(Buffer.from(body.get("code"), "base64url").toString()); }
    catch { return Response.json({ error: "invalid_grant" }, { status: 400 }); }
    const challenge = createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url");
    if (challenge !== data.challenge || body.get("redirect_uri") !== `${process.env.BETTER_AUTH_URL}/api/account/verification/callback`) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (data.delay) await new Promise((resolve) => setTimeout(resolve, 400));
    if (data.failure) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const token = await new SignJWT({ nonce: data.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "test-google" })
      .setIssuer(data.issuer ?? "https://accounts.google.com")
      .setAudience(data.audience ?? process.env.GOOGLE_CLIENT_ID)
      .setSubject(data.subject).setIssuedAt().setExpirationTime(data.expired ? "-1m" : "5m").sign(privateKey);
    return Response.json({ id_token: data.forged ? `${token.slice(0, -5)}xxxxx` : token });
  }
  return nativeFetch(input, init);
};

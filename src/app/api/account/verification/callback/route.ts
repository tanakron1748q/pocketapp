import { getCurrentSession } from "@/lib/session";
import { clearDeletionCookie, completeDeletionVerification } from "@/lib/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let verified = false;
  try {
    const session = await getCurrentSession();
    if (session) verified = await completeDeletionVerification(session.session.id, session.user.id, new URL(request.url));
  } catch { /* Fail closed without exposing provider tokens or codes. */ }
  if (!verified) await clearDeletionCookie();
  return new Response(null, { status: 303, headers: {
    Location: `${process.env.BETTER_AUTH_URL}/settings${verified ? "" : "?verification=failed"}`,
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  } });
}

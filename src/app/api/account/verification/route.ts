import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson } from "@/lib/api-response";
import { beginDeletionVerification, clearDeletionCookie, deletionProof } from "@/lib/account-deletion";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const proof = await deletionProof(session.session.id);
    return privateJson({ verified: Boolean(proof?.verifiedAt), expiresAt: proof?.verifiedAt ? proof.expiresAt.toISOString() : null });
  } catch { return privateJson({ error: "ตรวจสอบการยืนยันไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const error = mutationOriginError(request);
    if (error) return error;
    return privateJson({ url: await beginDeletionVerification(session.session.id, session.user.id) });
  } catch { return privateJson({ error: "เริ่มยืนยัน Google ไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function DELETE(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const error = mutationOriginError(request);
    if (error) return error;
    await getDb().deletionVerification.deleteMany({ where: { sessionId: session.session.id } });
    await clearDeletionCookie();
    return privateJson({ cancelled: true });
  } catch { return privateJson({ error: "ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { clearDeletionCookie, deleteVerifiedAccount } from "@/lib/account-deletion";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const error = mutationOriginError(request);
    if (error) return error;
    const result = await readValidatedJson(request, z.object({ confirmation: z.literal("ลบบัญชีของฉัน") }).strict());
    if (!result.success) return result.response;
    if (!await deleteVerifiedAccount(session.session.id, session.user.id)) {
      return privateJson({ error: "กรุณายืนยัน Google บัญชีเดิมอีกครั้ง หลักฐานมีอายุ 5 นาทีและใช้ได้เฉพาะอุปกรณ์นี้" }, 403);
    }
    await clearDeletionCookie();
    const jar = await cookies();
    for (const cookie of jar.getAll()) {
      if (/^(?:__Secure-)?better-auth\./.test(cookie.name)) {
        jar.set(cookie.name, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.BETTER_AUTH_URL!.startsWith("https:"), maxAge: 0 });
      }
    }
    return privateJson({ deleted: true });
  } catch { return privateJson({ error: "ลบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

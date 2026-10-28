import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson } from "@/lib/api-response";
import { deleteOwnedFavorite, getOwnedFavorite } from "@/lib/favorites";
import { TransactionRuleError } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const { id } = await params;
    const favorite = await getOwnedFavorite(session.user.id, id);
    return favorite ? privateJson({ favorite }) : privateJson({ error: "ไม่พบรายการโปรด" }, 404);
  } catch { return privateJson({ error: "โหลดรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const { id } = await params;
    await deleteOwnedFavorite(session.user.id, id);
    return privateJson({ deleted: true });
  } catch (error) {
    return error instanceof TransactionRuleError
      ? privateJson({ error: error.message }, error.status)
      : privateJson({ error: "ลบรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

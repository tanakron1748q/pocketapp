import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { favoriteSchema } from "@/lib/favorite-schema";
import { createOwnedFavorite, listOwnedFavorites } from "@/lib/favorites";
import { TransactionRuleError } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    return privateJson({ favorites: await listOwnedFavorites(session.user.id) });
  } catch { return privateJson({ error: "โหลดรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const result = await readValidatedJson(request, favoriteSchema);
    if (!result.success) return result.response;
    return privateJson({ favorite: await createOwnedFavorite(session.user.id, result.data) }, 201);
  } catch (error) {
    return error instanceof TransactionRuleError
      ? privateJson({ error: error.message, fields: error.fields }, error.status)
      : privateJson({ error: "เก็บรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { updateCategorySchema } from "@/lib/category-schema";
import { categorySelect } from "@/lib/categories";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const result = await readValidatedJson(request, updateCategorySchema);
    if (!result.success) return result.response;
    const { id } = await params;
    const categories = await getDb().category.updateManyAndReturn({
      where: { id, userId: session.user.id }, data: result.data, select: categorySelect,
    });
    return categories.length ? privateJson({ category: categories[0] }) : privateJson({ error: "ไม่พบหมวดหมู่" }, 404);
  } catch {
    return privateJson({ error: "แก้ไขหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

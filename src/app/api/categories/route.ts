import { getCurrentSession } from "@/lib/session";
import { categorySelect, getPersonalCategories } from "@/lib/categories";
import { todayInThailand } from "@/lib/finance";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { createCategorySchema } from "@/lib/category-schema";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const categories = await getPersonalCategories(session.user.id);
    return privateJson({ categories, today: todayInThailand() });
  } catch {
    return privateJson({ error: "โหลดหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const result = await readValidatedJson(request, createCategorySchema);
    if (!result.success) return result.response;
    const category = await getDb().category.create({
      data: { ...result.data, userId: session.user.id }, select: categorySelect,
    });
    return privateJson({ category }, 201);
  } catch {
    return privateJson({ error: "เพิ่มหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

import { getCurrentSession } from "@/lib/session";
import { getPersonalCategories } from "@/lib/categories";
import { todayInThailand } from "@/lib/finance";
import { privateJson } from "@/lib/api-response";

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

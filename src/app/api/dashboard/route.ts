import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { privateJson } from "@/lib/api-response";
import { budgetMonth } from "@/lib/budget-schema";
import { dashboardReport } from "@/lib/dashboard";
import { todayInThailand } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const query = z.strictObject({ month: budgetMonth.optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return privateJson({ error: "กรุณาเลือกเดือนที่ถูกต้อง" }, 400);
    const today = todayInThailand();
    return privateJson(await dashboardReport(session.user.id, query.data.month ?? today.slice(0, 7), today));
  } catch { return privateJson({ error: "โหลดภาพรวมไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

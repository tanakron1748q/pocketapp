import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { privateJson } from "@/lib/api-response";
import { expenseSummary } from "@/lib/expense-summary";
import { isBusinessDate, todayInThailand } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const query = z.strictObject({ month: z.string().regex(/^\d{4}-\d{2}$/).refine((value) => isBusinessDate(`${value}-01`)).optional() })
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return privateJson({ error: "กรุณาเลือกเดือนที่ถูกต้อง" }, 400);
    return privateJson(await expenseSummary(session.user.id, query.data.month ?? todayInThailand().slice(0, 7)));
  } catch { return privateJson({ error: "โหลดรายจ่ายสุทธิไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

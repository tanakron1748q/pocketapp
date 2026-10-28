import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { budgetMonth, budgetSchema, parseBudgetSatang } from "@/lib/budget-schema";
import { budgetReport } from "@/lib/budgets";
import { lockAvailableCategory } from "@/lib/categories";
import { todayInThailand } from "@/lib/finance";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const query = z.strictObject({ month: budgetMonth.optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return privateJson({ error: "กรุณาเลือกเดือนที่ถูกต้อง" }, 400);
    return privateJson(await budgetReport(session.user.id, query.data.month ?? todayInThailand().slice(0, 7)));
  } catch { return privateJson({ error: "โหลดงบไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function PUT(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const result = await readValidatedJson(request, budgetSchema);
    if (!result.success) return result.response;
    const { categoryId, scope, month, amount } = result.data;
    const saved = await getDb().$transaction(async (tx) => {
      if (!await lockAvailableCategory(tx, session.user.id, "EXPENSE", categoryId)) return false;
      const key = { userId: session.user.id, categoryId, month: new Date(`${month}-01T00:00:00.000Z`), scope };
      const amountSatang = parseBudgetSatang(amount)!;
      await tx.budgetSetting.upsert({
        where: { userId_categoryId_month_scope: key }, create: { ...key, amountSatang }, update: { amountSatang },
      });
      return true;
    });
    if (!saved) return privateJson({ error: "ไม่พบหมวดรายจ่ายที่ใช้งานได้" }, 404);
    return privateJson({ saved: true });
  } catch { return privateJson({ error: "บันทึกงบไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

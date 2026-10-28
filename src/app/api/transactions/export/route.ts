import { getCurrentSession } from "@/lib/session";
import { privateJson } from "@/lib/api-response";
import { transactionFiltersSchema } from "@/lib/transaction-filters";
import { exportCsv } from "@/lib/csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const params = new URL(request.url).searchParams;
    const query = transactionFiltersSchema.safeParse(Object.fromEntries(params));
    if (!query.success || params.has("cursor")) return privateJson({ error: "พารามิเตอร์ไม่ถูกต้อง" }, 400);
    const csv = await exportCsv(session.user.id, query.data);
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pocketapp-transactions.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return privateJson({ error: "ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

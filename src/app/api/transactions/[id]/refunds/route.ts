import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { refundSchema } from "@/lib/refund-schema";
import { refundHistory, writeRefund } from "@/lib/refunds";
import { TransactionRuleError } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

function refundFailure(error: unknown) {
  return error instanceof TransactionRuleError
    ? privateJson({ error: error.message, fields: error.fields }, error.status)
    : privateJson({ error: "ดำเนินการเงินคืนไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    return privateJson(await refundHistory(session.user.id, (await params).id));
  } catch (error) { return refundFailure(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const input = await readValidatedJson(request, refundSchema);
    if (!input.success) return input.response;
    const refund = await writeRefund(session.user.id, (await params).id, null, input.data);
    return privateJson({ refund }, 201);
  } catch (error) { return refundFailure(error); }
}

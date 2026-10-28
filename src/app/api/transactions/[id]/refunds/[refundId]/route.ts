import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { refundSchema } from "@/lib/refund-schema";
import { writeRefund } from "@/lib/refunds";
import { TransactionRuleError } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; refundId: string }> };

async function mutate(request: Request, { params }: Context, deleting: boolean) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const input = deleting ? null : await readValidatedJson(request, refundSchema);
    if (input && !input.success) return input.response;
    const { id, refundId } = await params;
    const refund = await writeRefund(session.user.id, id, refundId, input?.data ?? null);
    return privateJson(deleting ? { deleted: true } : { refund });
  } catch (error) {
    return error instanceof TransactionRuleError
      ? privateJson({ error: error.message, fields: error.fields }, error.status)
      : privateJson({ error: "ดำเนินการเงินคืนไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

export async function PUT(request: Request, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, true); }

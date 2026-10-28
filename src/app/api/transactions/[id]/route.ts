import { getCurrentSession } from "@/lib/session";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { editTransactionSchema } from "@/lib/transaction-schema";
import { deleteOwnedTransaction, editOwnedTransaction, getOwnedTransaction, TransactionRuleError } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

function failure(error: unknown, message: string) {
  return error instanceof TransactionRuleError
    ? privateJson({ error: error.message, fields: error.fields }, error.status)
    : privateJson({ error: message }, 503);
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const { id } = await params;
    const transaction = await getOwnedTransaction(session.user.id, id);
    return transaction ? privateJson({ transaction }) : privateJson({ error: "ไม่พบรายการ" }, 404);
  } catch (error) { return failure(error, "โหลดรายการไม่สำเร็จ กรุณาลองอีกครั้ง"); }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const input = await readValidatedJson(request, editTransactionSchema);
    if (!input.success) return input.response;
    const { id } = await params;
    const transaction = await editOwnedTransaction(session.user.id, id, input.data);
    return privateJson({ transaction });
  } catch (error) { return failure(error, "แก้ไขไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"); }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const { id } = await params;
    await deleteOwnedTransaction(session.user.id, id);
    return privateJson({ deleted: true });
  } catch (error) { return failure(error, "ลบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"); }
}

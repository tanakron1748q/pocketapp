import "server-only";

import type { Refund as StoredRefund } from "@/generated/prisma/client";
import { getDb } from "./db";
import { parseSatang, satangToAmount, type RefundDraft } from "./finance";
import { lockOwnedTransaction, serializeTransaction, transactionInclude, TransactionRuleError } from "./transactions";

function serialize(record: StoredRefund) {
  return {
    id: record.id, expenseId: record.expenseId, amount: satangToAmount(record.amountSatang),
    date: record.date.toISOString().slice(0, 10), description: record.description,
  };
}

export async function refundHistory(userId: string, expenseId: string) {
  const record = await getDb().transaction.findFirst({
    where: { id: expenseId, userId, type: "EXPENSE" },
    include: { ...transactionInclude, refunds: { orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }] } },
  });
  if (!record) throw new TransactionRuleError("ไม่พบรายจ่ายต้นทาง", 404);
  const total = record.refunds.reduce((sum, refund) => sum + refund.amountSatang, 0);
  return {
    transaction: serializeTransaction(record), refunds: record.refunds.map(serialize),
    refunded: satangToAmount(total), remaining: satangToAmount(record.amountSatang - total),
  };
}

// Always lock the expense FIRST, including refund edits/deletes. Under READ COMMITTED
// the following reads see the last lock holder's committed totals, across devices.
// Refunds cannot move to a different expense; correct one by deleting and recreating it.
export async function writeRefund(userId: string, expenseId: string, refundId: string | null, input: RefundDraft | null) {
  return getDb().$transaction(async (tx) => {
    const expense = await lockOwnedTransaction(tx, userId, expenseId);
    if (expense.type !== "EXPENSE") throw new TransactionRuleError("ไม่พบรายจ่ายต้นทาง", 404);
    if (refundId && !await tx.refund.findFirst({ where: { id: refundId, userId, expenseId } })) {
      throw new TransactionRuleError("ไม่พบเงินคืน", 404);
    }
    if (!input) {
      await tx.refund.delete({ where: { id: refundId!, userId, expenseId } });
      return null;
    }
    const refunded = await tx.refund.aggregate({
      where: { expenseId, userId, ...(refundId ? { id: { not: refundId } } : {}) }, _sum: { amountSatang: true },
    });
    const amountSatang = parseSatang(input.amount)!;
    if ((refunded._sum.amountSatang ?? 0) + amountSatang > expense.amountSatang) {
      throw new TransactionRuleError("เงินคืนรวมต้องไม่เกินรายจ่ายต้นทาง", 422, { amount: ["เงินคืนรวมต้องไม่เกินรายจ่ายต้นทาง"] });
    }
    const data = { amountSatang, date: new Date(`${input.date}T00:00:00.000Z`), description: input.description || null };
    const record = refundId
      ? await tx.refund.update({ where: { id: refundId, userId, expenseId }, data })
      : await tx.refund.create({ data: { ...data, userId, expenseId } });
    return serialize(record);
  }, { isolationLevel: "ReadCommitted" });
}

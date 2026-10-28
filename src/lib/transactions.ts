import "server-only";

import type { Prisma, Transaction as StoredTransaction } from "@/generated/prisma/client";
import { getDb } from "./db";
import { categorySelect, lockAvailableCategory } from "./categories";
import { parseSatang, satangToAmount, type EditableTransactionDraft } from "./finance";

export const transactionInclude = { category: { select: categorySelect } } as const;
type RecordWithCategory = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export function serializeTransaction(record: RecordWithCategory) {
  return {
    id: record.id, type: record.type, amount: satangToAmount(record.amountSatang),
    date: record.date.toISOString().slice(0, 10), description: record.description, category: record.category,
  };
}

export class TransactionRuleError extends Error {
  constructor(message: string, readonly status: 404 | 422, readonly fields?: Record<string, string[]>) { super(message); }
}

type LockedTransaction = Pick<StoredTransaction, "id" | "type" | "amountSatang" | "categoryId">;

// Every expense/refund mutation acquires this row lock before reading refund totals.
export async function lockOwnedTransaction(tx: Prisma.TransactionClient, userId: string, id: string) {
  const [record] = await tx.$queryRaw<LockedTransaction[]>`
    SELECT "id", "type", "amountSatang", "categoryId" FROM "transactions"
    WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
  `;
  if (!record) throw new TransactionRuleError("ไม่พบรายการ", 404);
  return record;
}

export async function getOwnedTransaction(userId: string, id: string) {
  const record = await getDb().transaction.findFirst({ where: { id, userId }, include: transactionInclude });
  return record ? serializeTransaction(record) : null;
}

export async function editOwnedTransaction(userId: string, id: string, input: EditableTransactionDraft) {
  return getDb().$transaction(async (tx) => {
    const current = await lockOwnedTransaction(tx, userId, id);
    const refunded = await tx.refund.aggregate({ where: { expenseId: id, userId }, _sum: { amountSatang: true } });
    if (parseSatang(input.amount)! < (refunded._sum.amountSatang ?? 0)) {
      throw new TransactionRuleError("ยอดรายจ่ายต้องไม่น้อยกว่าเงินคืนสะสม", 422, { amount: ["กรุณาแก้หรือลบเงินคืนที่ขัดกันก่อนลดรายจ่าย"] });
    }
    const category = await lockAvailableCategory(tx, userId, current.type, input.categoryId, current.categoryId);
    if (!category) throw new TransactionRuleError("กรุณาเลือกหมวดหมู่ของคุณที่ตรงกับประเภท", 422, { categoryId: ["หมวดหมู่ไม่ถูกต้อง"] });
    const updated = await tx.transaction.update({
      where: { id, userId },
      data: {
        amountSatang: parseSatang(input.amount)!, date: new Date(`${input.date}T00:00:00.000Z`),
        categoryId: input.categoryId, description: input.description || null,
      },
      include: transactionInclude,
    });
    return serializeTransaction(updated);
  });
}

export async function deleteOwnedTransaction(userId: string, id: string) {
  await getDb().$transaction(async (tx) => {
    await lockOwnedTransaction(tx, userId, id);
    if (await tx.refund.count({ where: { expenseId: id, userId } })) {
      throw new TransactionRuleError("กรุณาลบเงินคืนทั้งหมดก่อนลบรายจ่ายต้นทาง", 422);
    }
    await tx.transaction.delete({ where: { id, userId } });
  });
}

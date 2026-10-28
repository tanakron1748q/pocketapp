import "server-only";

import type { Prisma, Transaction as StoredTransaction } from "@/generated/prisma/client";
import { getDb } from "./db";
import { parseSatang, satangToAmount, type EditableTransactionDraft } from "./finance";

export const transactionInclude = { category: { select: { id: true, name: true, type: true } } } as const;
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

// Refund writers must acquire this same row lock before checking/changing their totals.
// Keep future refund guards inside this transaction, before the update/delete below.
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
    const category = await tx.category.findFirst({
      where: { id: input.categoryId, userId, type: current.type }, select: { id: true },
    });
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
    await tx.transaction.delete({ where: { id, userId } });
  });
}

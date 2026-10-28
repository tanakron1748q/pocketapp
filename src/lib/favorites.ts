import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { parseSatang, satangToAmount, type FavoriteDraft } from "./finance";
import { transactionInclude, TransactionRuleError } from "./transactions";

type StoredFavorite = Prisma.FavoriteEntryGetPayload<{ include: typeof transactionInclude }>;

export function serializeFavorite(record: StoredFavorite) {
  return {
    id: record.id, name: record.name, type: record.type,
    amount: satangToAmount(record.amountSatang), description: record.description, category: record.category,
  };
}

export async function listOwnedFavorites(userId: string) {
  const entries = await getDb().favoriteEntry.findMany({
    where: { userId }, include: transactionInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return entries.map(serializeFavorite);
}

export async function getOwnedFavorite(userId: string, id: string) {
  const record = await getDb().favoriteEntry.findFirst({ where: { id, userId }, include: transactionInclude });
  return record ? serializeFavorite(record) : null;
}

export async function createOwnedFavorite(userId: string, input: FavoriteDraft) {
  const db = getDb();
  const category = await db.category.findFirst({
    where: { id: input.categoryId, userId, type: input.type }, select: { id: true },
  });
  if (!category) throw new TransactionRuleError("กรุณาเลือกหมวดหมู่ของคุณที่ตรงกับประเภท", 422, { categoryId: ["หมวดหมู่ไม่ถูกต้อง"] });
  const record = await db.favoriteEntry.create({
    data: {
      userId, name: input.name, type: input.type, categoryId: input.categoryId,
      amountSatang: parseSatang(input.amount)!, description: input.description || null,
    }, include: transactionInclude,
  });
  return serializeFavorite(record);
}

export async function deleteOwnedFavorite(userId: string, id: string) {
  const result = await getDb().favoriteEntry.deleteMany({ where: { id, userId } });
  if (!result.count) throw new TransactionRuleError("ไม่พบรายการโปรด", 404);
}

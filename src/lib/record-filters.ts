import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { TransactionFilters } from "./transaction-filters";

// Shared by history and CSV; dates are inclusive Thai business dates (SQL DATE).
function entryWhere(filters: TransactionFilters) {
  const { search, startDate, endDate } = filters;
  return {
    ...(search ? { description: { contains: search.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const } } : {}),
    ...(startDate || endDate ? { date: {
      ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T00:00:00.000Z`) } : {}),
    } } : {}),
  };
}

export function transactionWhere(userId: string, filters: TransactionFilters): Prisma.TransactionWhereInput {
  return { userId, ...entryWhere(filters), ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) };
}

export function refundWhere(userId: string, filters: TransactionFilters): Prisma.RefundWhereInput {
  return { userId, ...entryWhere(filters), expense: { userId, type: "EXPENSE",
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) } };
}

import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { satangToAmount, type ExpenseSummary } from "./finance";

export async function expenseSummary(userId: string, month: string, db: Prisma.TransactionClient = getDb()): Promise<ExpenseSummary> {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  // One statement gives a consistent snapshot. Refund category follows its original
  // expense even when that expense is edited or the category is renamed/archived.
  const rows = await db.$queryRaw<{ id: string; name: string; expense: bigint; refunded: bigint }[]>`
    WITH entries AS (
      SELECT "categoryId", "amountSatang"::bigint AS expense, 0::bigint AS refunded
      FROM transactions WHERE "userId" = ${userId} AND type = 'EXPENSE' AND date >= ${start} AND date < ${end}
      UNION ALL
      SELECT t."categoryId", 0::bigint, r."amountSatang"::bigint
      FROM refunds r JOIN transactions t ON t.id = r."expenseId" AND t."userId" = r."userId"
      WHERE r."userId" = ${userId} AND r.date >= ${start} AND r.date < ${end}
    )
    SELECT c.id, c.name, SUM(e.expense)::bigint AS expense, SUM(e.refunded)::bigint AS refunded
    FROM entries e JOIN categories c ON c.id = e."categoryId" AND c."userId" = ${userId}
    GROUP BY c.id, c.name ORDER BY c.name, c.id
  `;
  const expense = rows.reduce((sum, row) => sum + row.expense, BigInt(0));
  const refunded = rows.reduce((sum, row) => sum + row.refunded, BigInt(0));
  return {
    month, expense: satangToAmount(expense), refunded: satangToAmount(refunded), netExpense: satangToAmount(expense - refunded),
    categories: rows.map((row) => ({
      id: row.id, name: row.name, expense: satangToAmount(row.expense),
      refunded: satangToAmount(row.refunded), netExpense: satangToAmount(row.expense - row.refunded),
    })),
  };
}

import "server-only";

import { getDb } from "./db";
import { satangToAmount, type BudgetReport } from "./finance";

export async function budgetReport(userId: string, month: string): Promise<BudgetReport> {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  // One snapshot for both settings and actuals. Defaults apply forward only;
  // an override takes precedence for exactly its month, including explicit zero.
  const rows = await getDb().$queryRaw<{
    id: string; name: string; archived: boolean; defaultAmount: number | null;
    overrideAmount: number | null; defaultFrom: Date | null; net: bigint;
  }[]>`
    WITH entries AS (
      SELECT "categoryId", "amountSatang"::bigint AS amount FROM transactions
      WHERE "userId" = ${userId} AND type = 'EXPENSE' AND date >= ${start} AND date < ${end}
      UNION ALL
      SELECT t."categoryId", -r."amountSatang"::bigint FROM refunds r
      JOIN transactions t ON t.id = r."expenseId" AND t."userId" = r."userId"
      WHERE r."userId" = ${userId} AND r.date >= ${start} AND r.date < ${end}
    ), actuals AS (SELECT "categoryId", SUM(amount)::bigint AS net FROM entries GROUP BY "categoryId")
    SELECT c.id, c.name, c.archived, d."amountSatang" AS "defaultAmount", d.month AS "defaultFrom",
      o."amountSatang" AS "overrideAmount", COALESCE(a.net, 0)::bigint AS net
    FROM categories c
    LEFT JOIN LATERAL (
      SELECT b."amountSatang", b.month FROM budget_settings b
      WHERE b."userId" = ${userId} AND b."categoryId" = c.id AND b.scope = 'DEFAULT' AND b.month <= ${start}
      ORDER BY b.month DESC LIMIT 1
    ) d ON true
    LEFT JOIN budget_settings o ON o."userId" = ${userId} AND o."categoryId" = c.id AND o.scope = 'MONTH' AND o.month = ${start}
    LEFT JOIN actuals a ON a."categoryId" = c.id
    WHERE c."userId" = ${userId} AND c.type = 'EXPENSE'
      AND (NOT c.archived OR d."amountSatang" IS NOT NULL OR o."amountSatang" IS NOT NULL OR a.net IS NOT NULL)
    ORDER BY c."createdAt", c.id
  `;
  return { month, categories: rows.map((row) => {
    const amount = row.overrideAmount ?? row.defaultAmount;
    return {
      id: row.id, name: row.name, archived: row.archived,
      amount: amount === null ? null : satangToAmount(amount),
      defaultAmount: row.defaultAmount === null ? null : satangToAmount(row.defaultAmount),
      overrideAmount: row.overrideAmount === null ? null : satangToAmount(row.overrideAmount),
      defaultFrom: row.defaultFrom?.toISOString().slice(0, 7) ?? null,
      netExpense: satangToAmount(row.net), remaining: amount === null ? null : satangToAmount(BigInt(amount) - row.net),
    };
  }) };
}

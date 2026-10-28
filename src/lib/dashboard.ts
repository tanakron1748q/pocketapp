import "server-only";

import { getDb } from "./db";
import { monthlyComparison } from "./monthly-comparison";
import { expenseSummary } from "./expense-summary";
import { satangToAmount, todayInThailand, type DashboardReport } from "./finance";
import { serializeTransaction, transactionInclude } from "./transactions";

export async function dashboardReport(userId: string, month: string, today = todayInThailand()): Promise<DashboardReport> {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  // Income, signed expense categories and recent records share a single snapshot.
  return getDb().$transaction(async (tx) => {
    const [summary, [totals], recent, comparison] = await Promise.all([
      expenseSummary(userId, month, tx),
      tx.$queryRaw<{ income: bigint }[]>`
        SELECT COALESCE(SUM("amountSatang"), 0)::bigint AS income FROM transactions
        WHERE "userId" = ${userId} AND type = 'INCOME' AND date >= ${start} AND date < ${end}
      `,
      tx.transaction.findMany({
        where: { userId, date: { gte: start, lt: end } }, include: transactionInclude,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 5,
      }),
      monthlyComparison(tx, userId, month, today),
    ]);
    // Summary amounts are canonical signed decimal strings with exactly 2 places.
    const netExpenseSatang = BigInt(summary.netExpense.replace(".", ""));
    return {
      ...summary, income: satangToAmount(totals.income),
      monthlyNet: satangToAmount(totals.income - netExpenseSatang),
      recentTransactions: recent.map(serializeTransaction), comparison,
    };
  }, { isolationLevel: "RepeatableRead" });
}

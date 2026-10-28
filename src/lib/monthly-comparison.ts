import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { satangToAmount, type ComparisonPeriod, type MonthComparison } from "./finance";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const toSatang = (amount: string) => BigInt(amount.replace(".", ""));

async function periodTotals(tx: Prisma.TransactionClient, userId: string, start: Date, endInclusive: Date): Promise<ComparisonPeriod> {
  const end = new Date(endInclusive);
  end.setUTCDate(end.getUTCDate() + 1);
  const [row] = await tx.$queryRaw<{ income: bigint; expense: bigint; refunded: bigint }[]>`
    WITH totals AS (
      SELECT COALESCE(SUM("amountSatang") FILTER (WHERE type = 'INCOME'), 0)::bigint AS income,
        COALESCE(SUM("amountSatang") FILTER (WHERE type = 'EXPENSE'), 0)::bigint AS expense
      FROM transactions WHERE "userId" = ${userId} AND date >= ${start} AND date < ${end}
    ), returned AS (
      SELECT COALESCE(SUM("amountSatang"), 0)::bigint AS refunded FROM refunds
      WHERE "userId" = ${userId} AND date >= ${start} AND date < ${end}
    )
    SELECT income, expense, refunded FROM totals CROSS JOIN returned
  `;
  const net = row.expense - row.refunded;
  return {
    startDate: isoDate(start), endDate: isoDate(endInclusive), income: satangToAmount(row.income),
    expense: satangToAmount(row.expense), refunded: satangToAmount(row.refunded),
    netExpense: satangToAmount(net), monthlyNet: satangToAmount(row.income - net),
  };
}

export async function monthlyComparison(tx: Prisma.TransactionClient, userId: string, month: string, today: string): Promise<MonthComparison | null> {
  // Future planning months have no elapsed reporting period. Year 1 January has
  // no previous month representable by the application's business-date contract.
  if (month > today.slice(0, 7) || month === "0001-01") return null;
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(next);
  lastDay.setUTCDate(0);
  const previousStart = new Date(start);
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(0);
  const mode = month === today.slice(0, 7) ? "elapsed" : "full";
  const currentEnd = mode === "elapsed" ? new Date(`${today}T00:00:00.000Z`) : lastDay;
  if (mode === "elapsed") previousEnd.setUTCDate(Math.min(currentEnd.getUTCDate(), previousEnd.getUTCDate()));
  const [current, previous] = await Promise.all([
    periodTotals(tx, userId, start, currentEnd), periodTotals(tx, userId, previousStart, previousEnd),
  ]);
  return {
    mode, asOfDate: today, current, previous,
    // Signed amount differences remain meaningful for zero and negative bases.
    // No division or percentage is used for a zero/negative net baseline.
    change: {
      income: satangToAmount(toSatang(current.income) - toSatang(previous.income)),
      netExpense: satangToAmount(toSatang(current.netExpense) - toSatang(previous.netExpense)),
      monthlyNet: satangToAmount(toSatang(current.monthlyNet) - toSatang(previous.monthlyNet)),
    },
  };
}

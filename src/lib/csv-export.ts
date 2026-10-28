import "server-only";

import { getDb } from "./db";
import { satangToAmount } from "./finance";
import { refundWhere, transactionWhere } from "./record-filters";
import type { TransactionFilters } from "./transaction-filters";

function cell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
// Spreadsheet applications can execute formulas even in quoted CSV fields.
function textCell(value: string) {
  return cell(/^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value);
}

export async function exportCsv(userId: string, filters: TransactionFilters) {
  const db = getDb();
  // Both kinds come from the same snapshot, with no page-size or cursor limit.
  const [transactions, refunds] = await db.$transaction([
    db.transaction.findMany({ where: transactionWhere(userId, filters), select: {
      id: true, date: true, type: true, amountSatang: true, description: true, createdAt: true,
      category: { select: { name: true } },
    } }),
    db.refund.findMany({ where: { ...refundWhere(userId, filters), ...(filters.type === "INCOME" ? { id: { in: [] } } : {}) }, select: {
      id: true, expenseId: true, date: true, amountSatang: true, description: true, createdAt: true,
      expense: { select: { category: { select: { name: true } } } },
    } }),
  ], { isolationLevel: "RepeatableRead" });
  const entries = [
    ...transactions.map((record) => ({ ...record, category: record.category.name, refundOf: "" })),
    ...refunds.map((record) => ({ ...record, type: "REFUND", category: record.expense.category.name, refundOf: record.expenseId })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const lines = ["id,date,type,category,amount,description,refund_of", ...entries.map((record) => [
    cell(record.id), cell(record.date.toISOString().slice(0, 10)), cell(record.type), textCell(record.category),
    cell(satangToAmount(record.amountSatang)), textCell(record.description ?? ""), cell(record.refundOf),
  ].join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

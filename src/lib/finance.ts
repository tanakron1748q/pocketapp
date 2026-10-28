export type TransactionType = "INCOME" | "EXPENSE";
export type Category = { id: string; type: TransactionType; name: string; archived: boolean };
export type Transaction = {
  id: string;
  type: TransactionType;
  amount: string;
  date: string;
  description: string | null;
  category: Category;
};
export type TransactionPage = { transactions: Transaction[]; nextCursor: string | null };
export type TransactionDraft = {
  type: TransactionType;
  amount: string;
  categoryId: string;
  date: string;
  description?: string;
};
export type FavoriteDraft = Omit<TransactionDraft, "date"> & { name: string };
export type FavoriteEntry = Omit<Transaction, "date"> & { name: string };
export type EditableTransactionDraft = Omit<TransactionDraft, "type">;

export const MAX_AMOUNT_SATANG = 2_147_483_647;
export const AMOUNT_ERROR = "กรอกจำนวนเงินมากกว่า 0 ถึง 21,474,836.47 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง";

// Parse only decimal strings; never multiply a floating-point baht amount by 100.
export function parseSatang(value: string): number | null {
  const raw = value.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) return null;
  const [baht, fraction = ""] = raw.split(".");
  const satang = Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
  return satang > 0 && satang <= MAX_AMOUNT_SATANG ? satang : null;
}

export function satangToAmount(value: number | bigint) {
  const integer = BigInt(value);
  const absolute = integer < BigInt(0) ? -integer : integer;
  return `${integer < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

export function displayAmount(amount: string) {
  const [baht, satang] = amount.split(".");
  return `${Number(baht).toLocaleString("th-TH")}.${satang} บาท`;
}

export function todayInThailand(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export type RefundDraft = Pick<TransactionDraft, "amount" | "date" | "description">;
export type Refund = Omit<RefundDraft, "description"> & { id: string; expenseId: string; description: string | null };
export type RefundHistory = { transaction: Transaction; refunds: Refund[]; refunded: string; remaining: string };
export type ExpenseSummary = {
  month: string; expense: string; refunded: string; netExpense: string;
  categories: { id: string; name: string; expense: string; refunded: string; netExpense: string }[];
};

export type BudgetScope = "DEFAULT" | "MONTH";
export type BudgetDraft = { categoryId: string; month: string; scope: BudgetScope; amount: string };
export type BudgetCategory = {
  id: string; name: string; archived: boolean;
  amount: string | null; defaultAmount: string | null; overrideAmount: string | null;
  defaultFrom: string | null; netExpense: string; remaining: string | null;
};
export type BudgetReport = { month: string; categories: BudgetCategory[] };

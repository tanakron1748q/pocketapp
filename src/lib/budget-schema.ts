import { z } from "zod";
import { isBusinessDate, MAX_AMOUNT_SATANG, parseSatang } from "./finance";

export const budgetMonth = z.string().regex(/^\d{4}-\d{2}$/).refine((value) => isBusinessDate(`${value}-01`));
export const BUDGET_AMOUNT_ERROR = "กรอกงบ 0 ถึง 21,474,836.47 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง";
export function parseBudgetSatang(value: string) {
  return /^0{1,8}(\.0{1,2})?$/.test(value.trim()) ? 0 : parseSatang(value);
}
export const budgetSchema = z.strictObject({
  month: budgetMonth,
  categoryId: z.string().min(1).max(100),
  scope: z.enum(["DEFAULT", "MONTH"]),
  amount: z.string().trim().refine((value) => {
    const amount = parseBudgetSatang(value);
    return amount !== null && amount <= MAX_AMOUNT_SATANG;
  }, BUDGET_AMOUNT_ERROR),
});

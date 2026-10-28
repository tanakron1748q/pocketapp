import { z } from "zod";
import { isBusinessDate } from "./finance";

const businessDate = z.string().refine(isBusinessDate, "วันที่ไม่ถูกต้อง");

// Shared query contract for transaction history and CSV export.
export const transactionFiltersSchema = z.strictObject({
  search: z.string().trim().max(1000).optional(),
  startDate: businessDate.optional(),
  endDate: businessDate.optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  categoryId: z.string().min(1).max(100).optional(),
  cursor: z.string().min(1).max(100).optional(),
}).refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
  message: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด", path: ["endDate"],
});

export type TransactionFilters = Omit<z.infer<typeof transactionFiltersSchema>, "cursor">;

export function transactionFilterParams(filters: TransactionFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return params;
}

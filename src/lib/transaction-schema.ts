import { z } from "zod";
import { AMOUNT_ERROR, isBusinessDate, parseSatang, todayInThailand } from "./finance";

export const transactionSchema = z.strictObject({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string().max(32).refine((value) => parseSatang(value) !== null, AMOUNT_ERROR),
  categoryId: z.string().min(1, "กรุณาเลือกหมวดหมู่").max(100),
  date: z.string().refine(isBusinessDate, "กรุณากรอกวันที่ที่ถูกต้อง")
    .refine((value) => value <= todayInThailand(), "บันทึกได้เฉพาะวันนี้หรือวันที่ผ่านมา ตามเวลาไทย"),
  description: z.string().trim().max(1000, "คำอธิบายต้องไม่เกิน 1,000 ตัวอักษร").optional(),
});

// Editing preserves the original type; the server derives it from the owned row.
export const editTransactionSchema = transactionSchema.omit({ type: true });

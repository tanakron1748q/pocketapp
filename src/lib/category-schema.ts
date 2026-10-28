import { z } from "zod";

const name = z.string().trim().min(1, "กรุณากรอกชื่อหมวดหมู่").max(100, "ชื่อหมวดหมู่ต้องไม่เกิน 100 ตัวอักษร");

export const createCategorySchema = z.strictObject({ name, type: z.enum(["INCOME", "EXPENSE"]) });
// Type and ownership never change. Archiving preserves all historical relations.
export const updateCategorySchema = z.union([
  z.strictObject({ name }),
  z.strictObject({ archived: z.literal(true) }),
]);

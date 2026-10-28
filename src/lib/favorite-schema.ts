import { z } from "zod";
import { transactionSchema } from "./transaction-schema";

export const favoriteSchema = transactionSchema.omit({ date: true }).extend({
  name: z.string().trim().min(1, "กรุณาตั้งชื่อรายการโปรด").max(100, "ชื่อต้องไม่เกิน 100 ตัวอักษร"),
});

import "server-only";

import { getDb } from "./db";
import type { TransactionType } from "./finance";

const starters: { starterKey: string; name: string; type: TransactionType }[] = [
  { starterKey: "salary", name: "เงินเดือน", type: "INCOME" },
  { starterKey: "extra-income", name: "รายได้เสริม", type: "INCOME" },
  { starterKey: "other-income", name: "รายรับอื่น ๆ", type: "INCOME" },
  { starterKey: "food", name: "อาหารและเครื่องดื่ม", type: "EXPENSE" },
  { starterKey: "travel", name: "เดินทาง", type: "EXPENSE" },
  { starterKey: "home", name: "ที่อยู่อาศัย", type: "EXPENSE" },
  { starterKey: "shopping", name: "ซื้อของ", type: "EXPENSE" },
  { starterKey: "health", name: "สุขภาพ", type: "EXPENSE" },
  { starterKey: "other-expense", name: "รายจ่ายอื่น ๆ", type: "EXPENSE" },
];

export async function getPersonalCategories(userId: string) {
  const db = getDb();
  // The unique starter key makes concurrent first visits from two devices safe.
  await db.category.createMany({ data: starters.map((category) => ({ ...category, userId })), skipDuplicates: true });
  return db.category.findMany({
    where: { userId }, orderBy: [{ type: "asc" }, { createdAt: "asc" }, { starterKey: "asc" }],
    select: { id: true, name: true, type: true },
  });
}

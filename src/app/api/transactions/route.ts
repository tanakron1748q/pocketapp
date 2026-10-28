import type { Prisma } from "@/generated/prisma/client";
import { transactionFiltersSchema } from "@/lib/transaction-filters";
import { getCurrentSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { mutationOriginError, privateJson, readValidatedJson } from "@/lib/api-response";
import { parseSatang } from "@/lib/finance";
import { transactionSchema } from "@/lib/transaction-schema";
import { transactionInclude as include, serializeTransaction as serialize } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const query = transactionFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return privateJson({ error: "พารามิเตอร์ไม่ถูกต้อง" }, 400);
    const db = getDb();
    const userId = session.user.id;
    const { cursor, search, startDate, endDate, type, categoryId } = query.data;
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(search ? { description: { contains: search.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } } : {}),
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      // These are Thai business dates stored as SQL DATE, not UTC instants.
      ...(startDate || endDate ? { date: {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T00:00:00.000Z`) } : {}),
      } } : {}),
    };
    if (cursor && !await db.transaction.findFirst({ where: { ...where, id: cursor }, select: { id: true } })) {
      return privateJson({ error: "ไม่พบรายการ" }, 404);
    }
    const records = await db.transaction.findMany({
      where, include,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = records.slice(0, 20);
    return privateJson({ transactions: page.map(serialize), nextCursor: records.length > 20 ? page.at(-1)!.id : null });
  } catch {
    return privateJson({ error: "โหลดรายการไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return privateJson({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const originError = mutationOriginError(request);
    if (originError) return originError;
    const result = await readValidatedJson(request, transactionSchema);
    if (!result.success) return result.response;
    const { amount, description, date, categoryId, type } = result.data;
    const db = getDb();
    const userId = session.user.id;
    const category = await db.category.findFirst({ where: { id: categoryId, userId, type }, select: { id: true } });
    if (!category) {
      return privateJson({ error: "กรุณาเลือกหมวดหมู่ของคุณที่ตรงกับประเภท", fields: { categoryId: ["หมวดหมู่ไม่ถูกต้อง"] } }, 422);
    }
    const transaction = await db.transaction.create({
      data: {
        userId, categoryId, type, amountSatang: parseSatang(amount)!,
        date: new Date(`${date}T00:00:00.000Z`), description: description || null,
      }, include,
    });
    return privateJson({ transaction: serialize(transaction) }, 201);
  } catch {
    return privateJson({ error: "บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง" }, 503);
  }
}

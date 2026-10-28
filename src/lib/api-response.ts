import { z } from "zod";

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function mutationOriginError(request: Request) {
  return request.headers.get("origin") === process.env.BETTER_AUTH_URL
    ? null : privateJson({ error: "ไม่อนุญาตคำขอจากเว็บไซต์นี้" }, 403);
}

export async function readValidatedJson<T extends z.ZodType>(request: Request, schema: T) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return { success: false, response: privateJson({ error: "กรุณาส่งข้อมูลแบบ JSON" }, 415) } as const;
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return { success: false, response: privateJson({ error: "ข้อมูล JSON ไม่ถูกต้อง" }, 400) } as const; }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, response: privateJson({ error: "กรุณาตรวจสอบข้อมูล", fields: z.flattenError(result.error).fieldErrors }, 422) } as const;
  }
  return { success: true, data: result.data } as const;
}

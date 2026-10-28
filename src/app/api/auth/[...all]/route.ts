import { getAuth, isAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json({ error: "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const response = await getAuth().handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export { handler as GET, handler as POST };

import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  const headers = { "Cache-Control": "private, no-store" };
  if (!session) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401, headers });

  const { id, name, email, image } = session.user;
  return Response.json({ user: { id, name, email, image } }, { headers });
}

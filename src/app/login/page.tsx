import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/login-button";
import { isAuthConfigured } from "@/lib/auth";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Link href="/" className="text-sm text-blue-700">Pocketapp</Link>
      <h1 className="mt-6 text-2xl font-semibold">เข้าสู่พื้นที่ส่วนตัว</h1>
      <p className="mt-3 text-slate-600">ใช้บัญชี Google เดิมเพื่อเข้าถึงพื้นที่ของคุณบนทุกอุปกรณ์</p>
      {error && <p role="alert" className="mt-4 text-red-700">เข้าสู่ระบบไม่สำเร็จหรือถูกยกเลิก กรุณาลองอีกครั้ง</p>}
      <LoginButton configured={isAuthConfigured()} />
    </main>
  );
}

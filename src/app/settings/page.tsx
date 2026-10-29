import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { deletionProof } from "@/lib/account-deletion";
import { AccountDeletion } from "@/components/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const [proof, params] = await Promise.all([deletionProof(session.session.id), searchParams]);
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Link href="/dashboard">กลับพื้นที่ส่วนตัว</Link>
      <h1 className="mt-6 text-2xl font-semibold">ตั้งค่าบัญชี</h1>
      <p className="mt-2 break-all">{session.user.email}</p>
      <AccountDeletion verified={Boolean(proof?.verifiedAt)} expiresAt={proof?.verifiedAt ? proof.expiresAt.toISOString() : null} failed={params.verification === "failed"} />
    </main>
  );
}

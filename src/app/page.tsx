import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Pocketapp</h1>
      <p className="mt-3 text-base">พื้นที่บันทึกรายรับและรายจ่ายส่วนตัวของคุณ</p>
      <p className="mt-2 text-slate-600">เข้าสู่ระบบด้วยบัญชี Google เพื่อใช้พื้นที่เดียวกันบนมือถือและคอมพิวเตอร์</p>
      <Link className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-3 text-white" href="/login">เข้าสู่ระบบ</Link>
    </main>
  );
}

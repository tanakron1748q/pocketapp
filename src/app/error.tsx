"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">ไม่สามารถเชื่อมต่อระบบได้</h1>
      <p className="mt-3">กรุณาลองอีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแล</p>
      <button className="mt-6 rounded bg-blue-700 px-4 py-2 text-white" onClick={reset}>ลองอีกครั้ง</button>
    </main>
  );
}

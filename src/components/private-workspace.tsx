"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { authClient } from "@/lib/auth-client";
import { TransactionsPanel } from "./transactions-panel";

export function PrivateWorkspace() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isPending && !error && !data) window.location.replace("/login");
  }, [data, isPending, error]);

  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  async function leave(switchAccount: boolean) {
    setLeaving(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign-out failed");
      window.location.replace(switchAccount ? "/login" : "/");
    } catch {
      setFailed(true);
      setLeaving(false);
    }
  }

  if (isPending || leaving) return <main className="p-8" aria-label="กำลังตรวจสอบบัญชี"><Spin /></main>;
  if (error) return (
    <main className="mx-auto max-w-xl p-6">
      <Alert type="error" title="ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง" />
      <Button className="mt-4" onClick={() => refetch()}>ลองอีกครั้ง</Button>
    </main>
  );
  if (!data) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-sm text-slate-600">Pocketapp · พื้นที่ส่วนตัว</p>
      <h1 className="mt-4 text-2xl font-semibold">สวัสดี {data.user.name}</h1>
      <p className="mt-2 break-all text-slate-600">{data.user.email}</p>
      {failed && <Alert className="mt-4" type="error" showIcon title="ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง" />}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => leave(true)}>สลับบัญชี Google</Button>
        <Button onClick={() => leave(false)}>ออกจากระบบ</Button>
      </div>
      <TransactionsPanel key={data.user.id} />
    </main>
  );
}

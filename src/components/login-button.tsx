"use client";

import { useState } from "react";
import { Alert, Button } from "antd";
import { authClient } from "@/lib/auth-client";

export function LoginButton({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
        errorCallbackURL: "/login?error=oauth",
      });
      if (result.error) throw new Error("Sign-in failed");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {!configured && <Alert type="warning" showIcon title="ยังไม่พร้อมเข้าสู่ระบบ" description="ผู้ดูแลต้องตั้งค่าฐานข้อมูลและ Google Login ก่อนใช้งาน" />}
      {failed && <Alert type="error" showIcon title="เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง" />}
      <Button type="primary" size="large" block disabled={!configured} loading={pending} onClick={signIn}>
        เข้าสู่ระบบด้วย Google
      </Button>
    </div>
  );
}

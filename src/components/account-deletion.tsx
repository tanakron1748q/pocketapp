"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { readJson } from "@/lib/private-request";

export function AccountDeletion({ verified, expiresAt, failed }: { verified: boolean; expiresAt: string | null; failed: boolean }) {
  const [ready, setReady] = useState(verified);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form] = Form.useForm<{ confirmation: string }>();

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => setReady(false), Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  async function act(action: "verify" | "cancel" | "delete") {
    setBusy(action);
    setError("");
    try {
      if (action === "verify") {
        const result = await readJson<{ url: string }>("/api/account/verification", { method: "POST" });
        window.location.assign(result.url);
      } else if (action === "cancel") {
        await readJson("/api/account/verification", { method: "DELETE" });
        setReady(false);
        form.resetFields();
        window.location.replace("/dashboard");
      } else {
        await readJson("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form.getFieldsValue()) });
        window.location.replace("/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง");
      setBusy(null);
    }
  }

  return (
    <section aria-label="ลบบัญชีแอป" className="mt-8 space-y-4">
      <h2 className="text-xl font-semibold">ลบบัญชีแอปและข้อมูลทั้งหมด</h2>
      <Alert type="warning" showIcon title="ลบถาวรและกู้คืนไม่ได้" description="บัญชีแอป หมวด รายการ เงินคืน รายการโปรด งบ และเซสชันทุกอุปกรณ์จะถูกลบ บัญชี Google ของคุณยังอยู่" />
      {failed && <Alert type="error" showIcon title="ยืนยันไม่สำเร็จหรือเลือก Google คนละบัญชี ข้อมูลยังอยู่ กรุณาลองอีกครั้ง" />}
      {error && <Alert type="error" showIcon title={error} />}
      {ready ? (
        <>
          <Alert type="success" title="ยืนยัน Google บัญชีเดิมแล้ว ใช้ได้ 5 นาทีในอุปกรณ์นี้" />
          <Form form={form} layout="vertical" onFinish={() => act("delete")}>
            <Form.Item name="confirmation" label="พิมพ์ ลบบัญชีของฉัน เพื่อยืนยัน" rules={[{ required: true, message: "กรุณาพิมพ์ข้อความยืนยัน" }, { pattern: /^ลบบัญชีของฉัน$/, message: "ข้อความยืนยันไม่ตรงกัน" }]}>
              <Input autoComplete="off" disabled={busy !== null} />
            </Form.Item>
            <Button danger type="primary" htmlType="submit" loading={busy === "delete"} disabled={busy !== null}>ลบบัญชีถาวร</Button>
          </Form>
        </>
      ) : (
        <>
          <p>ยืนยัน Google บัญชีเดิมอีกครั้งก่อนพิมพ์ข้อความยืนยัน การเข้าสู่ระบบครั้งก่อนยังไม่เพียงพอ</p>
          <Button onClick={() => act("verify")} loading={busy === "verify"} disabled={busy !== null}>ยืนยัน Google เพื่อลบบัญชี</Button>
        </>
      )}
      <Button onClick={() => act("cancel")} loading={busy === "cancel"} disabled={busy !== null}>ยกเลิกและกลับ</Button>
    </section>
  );
}

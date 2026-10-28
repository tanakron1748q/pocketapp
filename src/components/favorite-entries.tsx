"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm, Spin, type FormInstance } from "antd";
import { displayAmount, type FavoriteDraft, type FavoriteEntry, type TransactionDraft } from "@/lib/finance";
import { applyFieldErrors, readJson, RequestError } from "@/lib/private-request";

export function FavoriteEntries({ form, disabled, onApply, onBusy }: {
  form: FormInstance<TransactionDraft>;
  disabled: boolean;
  onApply: (entry: FavoriteEntry) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<FavoriteDraft, "name"> | null>(null);
  const [nameForm] = Form.useForm<{ name: string }>();

  useEffect(() => {
    const controller = new AbortController();
    readJson<{ favorites: FavoriteEntry[] }>("/api/favorites", { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setFavorites(result.favorites);
      setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  function changeBusy(value: boolean) { setBusy(value); onBusy(value); }

  async function prepare() {
    try {
      const fields = await form.validateFields(["type", "amount", "categoryId", "description"]);
      // Pick only reusable details: no date, user identifier or Transaction identifier.
      setDraft({ type: fields.type, amount: fields.amount, categoryId: fields.categoryId, description: fields.description });
      nameForm.resetFields();
      setError(null);
      setNotice(null);
    } catch { /* The entry form shows its validation messages. */ }
  }

  async function save({ name }: { name: string }) {
    if (!draft) return;
    changeBusy(true);
    setError(null);
    try {
      const result = await readJson<{ favorite: FavoriteEntry }>("/api/favorites", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, name }),
      });
      setFavorites((previous) => [result.favorite, ...previous]);
      setDraft(null);
      setNotice("เก็บรายการโปรดแล้ว ยังไม่ได้บันทึกรายรับหรือรายจ่าย");
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "เก็บรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง");
      applyFieldErrors(form, error);
      if (error instanceof RequestError && error.fields?.name) nameForm.setFields([{ name: "name", errors: error.fields.name }]);
    } finally { changeBusy(false); }
  }

  async function apply(id: string) {
    changeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await readJson<{ favorite: FavoriteEntry }>(`/api/favorites/${encodeURIComponent(id)}`);
      onApply(result.favorite);
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "โหลดรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { changeBusy(false); }
  }

  async function remove(id: string) {
    changeBusy(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
      setFavorites((previous) => previous.filter((entry) => entry.id !== id));
      setNotice("ลบรายการโปรดแล้ว");
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "ลบรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { changeBusy(false); }
  }

  return (
    <section aria-labelledby="favorites-heading" className="mb-5 rounded-lg border border-slate-200 p-4" aria-busy={busy || loading}>
      <h3 id="favorites-heading" className="mb-2 font-semibold">รายการโปรด</h3>
      <p className="mb-3 text-sm text-slate-600">เลือกเพื่อเติมร่าง ตรวจวันที่และรายละเอียด แล้วกดบันทึกรายการอีกครั้ง</p>
      {loading && <Spin size="small" aria-label="กำลังโหลดรายการโปรด" />}
      {loadError && <div className="mb-3 space-y-2">
        <Alert type="error" showIcon title="โหลดรายการโปรดไม่สำเร็จ" />
        <Button disabled={disabled || busy} onClick={() => { setLoadError(false); setLoading(true); setAttempt((value) => value + 1); }}>ลองโหลดรายการโปรดอีกครั้ง</Button>
      </div>}
      {notice && <Alert className="mb-3" type="success" showIcon title={notice} />}
      {error && !draft && <Alert className="mb-3" type="error" showIcon title={error} />}
      {!loading && !loadError && favorites.length === 0 && <p className="mb-3 text-sm text-slate-600">ยังไม่มีรายการโปรด กรอกรายละเอียดในฟอร์มแล้วเก็บไว้ใช้ครั้งถัดไป</p>}
      <ul className="mb-3 space-y-2" aria-label="รายการโปรดของคุณ">
        {favorites.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-2">
          <Button className="!h-auto max-w-full !whitespace-normal !text-left [overflow-wrap:anywhere]" disabled={disabled || busy} onClick={() => apply(entry.id)}>
            ใช้ {entry.name} · {entry.type === "INCOME" ? "รายรับ" : "รายจ่าย"} · {displayAmount(entry.amount)}
          </Button>
          <Popconfirm title={`ลบรายการโปรด “${entry.name}”?`} description="รายการที่บันทึกไว้แล้วจะยังอยู่" okText="ยืนยันลบ" cancelText="ยกเลิก" onConfirm={() => remove(entry.id)} disabled={disabled || busy}>
            <Button danger disabled={disabled || busy} aria-label={`ลบรายการโปรด ${entry.name}`}>ลบ</Button>
          </Popconfirm>
        </li>)}
      </ul>
      <Button className="!h-auto max-w-full !whitespace-normal !text-left" disabled={disabled || busy || loading || loadError} onClick={prepare}>เก็บรายละเอียดในฟอร์มเป็นรายการโปรด</Button>
      <Modal title="เก็บเป็นรายการโปรด" open={draft !== null} onCancel={() => { if (!busy) { setDraft(null); setError(null); } }} footer={null} closable={!busy} maskClosable={!busy} keyboard={!busy}>
        <p className="mb-4">เก็บประเภท จำนวนเงิน หมวดหมู่ และคำอธิบาย โดยไม่เก็บวันที่และไม่สร้างรายการเงินจริง</p>
        {error && <Alert className="mb-3" type="error" showIcon title={error} />}
        <Form form={nameForm} name="favorite-name" layout="vertical" onFinish={save} disabled={busy}>
          <Form.Item name="name" label="ชื่อรายการโปรด" rules={[{ required: true, whitespace: true, message: "กรุณาตั้งชื่อรายการโปรด" }, { max: 100, message: "ชื่อต้องไม่เกิน 100 ตัวอักษร" }]}>
            <Input maxLength={100} autoComplete="off" />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => { setDraft(null); setError(null); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={busy}>เก็บรายการโปรด</Button>
          </div>
        </Form>
      </Modal>
    </section>
  );
}

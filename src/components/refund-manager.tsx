"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Spin } from "antd";
import { AMOUNT_ERROR, displayAmount, displayDate, isBusinessDate, parseSatang, todayInThailand, type TransactionDraft, type Refund, type RefundDraft, type RefundHistory } from "@/lib/finance";
import { applyFieldErrors, readJson, RequestError } from "@/lib/private-request";

export function RefundManager({ expenseId, onClose, onChanged }: { expenseId: string; onClose: () => void; onChanged: () => void }) {
  const [form] = Form.useForm<TransactionDraft>();
  const [history, setHistory] = useState<RefundHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Refund | null>(null);
  const [deleting, setDeleting] = useState<Refund | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const url = `/api/transactions/${encodeURIComponent(expenseId)}/refunds`;

  useEffect(() => {
    const controller = new AbortController();
    readJson<RefundHistory>(url, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setHistory(result); setLoading(false); setLoadError(false);
    }).catch(() => { if (!controller.signal.aborted) { setLoading(false); setLoadError(true); } });
    return () => controller.abort();
  }, [url, attempt]);

  function reset() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: todayInThailand() });
  }

  async function mutate(values: RefundDraft | null) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const target = values ? editing : deleting;
      await readJson(`${url}${target ? `/${encodeURIComponent(target.id)}` : ""}`, {
        method: values ? (editing ? "PUT" : "POST") : "DELETE",
        ...(values ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) } : {}),
      });
      reset(); setDeleting(null);
      setNotice(values ? "บันทึกเงินคืนแล้ว" : "ลบเงินคืนแล้ว");
      onChanged();
      // Save succeeded: a failed refresh must never encourage a duplicate submission.
      setLoading(true); setAttempt((value) => value + 1);
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "ดำเนินการเงินคืนไม่สำเร็จ กรุณาลองอีกครั้ง");
      applyFieldErrors(form, error);
    } finally { setBusy(false); }
  }

  return <Modal open title="เงินคืนของรายจ่าย" footer={null} onCancel={onClose} closable={!busy} keyboard={!busy} mask={{ closable: !busy }}>
    {notice && <Alert className="mb-3" type="success" showIcon title={notice} />}
    {loading ? <p role="status"><Spin /> กำลังโหลดเงินคืน…</p> : loadError ? <>
      <Alert type="error" showIcon title="โหลดเงินคืนไม่สำเร็จ" /><Button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>ลองโหลดเงินคืนอีกครั้ง</Button>
    </> : history && <>
      <div className="my-4 break-words [overflow-wrap:anywhere] rounded-lg border border-slate-200 p-3">
        <p className="font-semibold">ต้นทาง: {history.transaction.category.name} · {displayAmount(history.transaction.amount)}</p>
        <p>{displayDate(history.transaction.date)} · {history.transaction.description}</p>
        <p>คืนแล้ว {displayAmount(history.refunded)} · คืนได้อีก {displayAmount(history.remaining)}</p>
      </div>
      <p className="mb-3 text-sm text-slate-600">บันทึกวันที่ได้รับเงินจริง เงินคืนลดรายจ่ายของหมวดต้นทาง ไม่เพิ่มรายรับ</p>
      <ul className="mb-5 space-y-3" aria-label="ประวัติเงินคืน">
        {history.refunds.map((refund) => <li key={refund.id} className="rounded-lg border border-slate-200 p-3">
          <p>เงินคืน {displayAmount(refund.amount)} · {displayDate(refund.date)}</p>
          {refund.description && <p className="whitespace-pre-wrap break-words">{refund.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => { setEditing(refund); setError(null); form.setFieldsValue({ amount: refund.amount, date: refund.date, description: refund.description ?? "" }); }}>แก้ไขเงินคืน</Button>
            <Button danger disabled={busy} onClick={() => { setError(null); setDeleting(refund); }}>ลบเงินคืน</Button>
          </div>
        </li>)}
      </ul>
      {!history.refunds.length && <p className="mb-4">ยังไม่มีเงินคืน</p>}
      <h3 className="mb-3 font-semibold">{editing ? "แก้ไขเงินคืน" : "เพิ่มเงินคืน"}</h3>
      {error && !deleting && <Alert className="mb-3" type="error" showIcon title={error} />}
      <Form form={form} name="refund" layout="vertical" initialValues={{ date: todayInThailand() }} disabled={busy} onFinish={mutate} noValidate>
        <Form.Item name="amount" label="จำนวนเงินคืน (บาท)" rules={[
          { required: true, message: "กรุณากรอกจำนวนเงิน" },
          { validator: (_, value) => !value || parseSatang(value) !== null ? Promise.resolve() : Promise.reject(new Error(AMOUNT_ERROR)) },
        ]}><Input inputMode="decimal" maxLength={32} autoComplete="off" /></Form.Item>
        <Form.Item name="date" label="วันที่ได้รับเงินคืน (เวลาไทย)" rules={[
          { required: true, message: "กรุณาเลือกวันที่" },
          { validator: (_, value) => !value || (isBusinessDate(value) && value <= todayInThailand()) ? Promise.resolve() : Promise.reject(new Error("บันทึกได้เฉพาะวันที่ถูกต้อง วันนี้หรือย้อนหลัง ตามเวลาไทย")) },
        ]}><Input type="date" max={todayInThailand()} /></Form.Item>
        <Form.Item name="description" label="คำอธิบายเงินคืน (ไม่บังคับ)" rules={[{ max: 1000, message: "คำอธิบายต้องไม่เกิน 1,000 ตัวอักษร" }]}><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <div className="flex flex-wrap gap-2">
          <Button type="primary" htmlType="submit" aria-label={busy ? "กำลังบันทึกเงินคืน…" : "บันทึกเงินคืน"} loading={busy} disabled={busy}>บันทึกเงินคืน</Button>
          {editing && <Button onClick={reset}>ยกเลิกการแก้ไขเงินคืน</Button>}
        </div>
      </Form>
    </>}
    {deleting && <Modal open title="ยืนยันลบเงินคืน" okText="ยืนยันลบเงินคืน" cancelText="ยกเลิก" onOk={() => mutate(null)} onCancel={() => setDeleting(null)}
      confirmLoading={busy} okButtonProps={{ danger: true, disabled: busy }} cancelButtonProps={{ disabled: busy }} closable={!busy} keyboard={!busy} mask={{ closable: !busy }}>
      <p>ลบเงินคืน {displayAmount(deleting.amount)} วันที่ {displayDate(deleting.date)} หรือไม่?</p>
      {error && <Alert className="mt-3" type="error" showIcon title={error} />}
    </Modal>}
  </Modal>;
}

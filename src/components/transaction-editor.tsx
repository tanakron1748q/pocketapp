"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spin } from "antd";
import type { Category, EditableTransactionDraft, Transaction, TransactionDraft } from "@/lib/finance";
import { applyFieldErrors, readJson, RequestError } from "@/lib/private-request";
import { TransactionFields } from "./transaction-fields";

export function TransactionEditor({ id, categories, onClose, onSaved }: {
  id: string; categories: Category[]; onClose: () => void; onSaved: (transaction: Transaction) => void;
}) {
  const [form] = Form.useForm<TransactionDraft>();
  const [record, setRecord] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const url = `/api/transactions/${encodeURIComponent(id)}`;

  useEffect(() => {
    const controller = new AbortController();
    readJson<{ transaction: Transaction }>(url, { signal: controller.signal }).then(({ transaction }) => {
      if (controller.signal.aborted) return;
      form.setFieldsValue({
        type: transaction.type, amount: transaction.amount, date: transaction.date,
        categoryId: transaction.category.id, description: transaction.description ?? "",
      });
      setRecord(transaction);
      setLoading(false);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof RequestError ? error.message : "โหลดรายการไม่สำเร็จ กรุณาลองอีกครั้ง");
      setLoading(false);
    });
    return () => controller.abort();
  }, [url, attempt, form]);

  async function save(values: TransactionDraft) {
    setSaving(true);
    setSaveError(null);
    const input: EditableTransactionDraft = {
      amount: values.amount, date: values.date, categoryId: values.categoryId, description: values.description,
    };
    try {
      const { transaction } = await readJson<{ transaction: Transaction }>(url, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      onSaved(transaction);
    } catch (error) {
      setSaveError(error instanceof RequestError ? error.message : "แก้ไขไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      applyFieldErrors(form, error);
    } finally { setSaving(false); }
  }

  return (
    <Modal open title="แก้ไขรายการ" onCancel={onClose} onOk={() => form.submit()}
      okText={saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"} cancelText="ยกเลิก"
      confirmLoading={saving} okButtonProps={{ disabled: saving || !record || loading || Boolean(loadError), "aria-label": saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข" }}
      cancelButtonProps={{ disabled: saving }} closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
      {loading && <p className="py-8" role="status"><Spin /> กำลังโหลดรายการ…</p>}
      {loadError && <div className="space-y-3">
        <Alert type="error" showIcon title={loadError} />
        <Button onClick={() => { setLoadError(null); setLoading(true); setAttempt((value) => value + 1); }}>ลองโหลดรายการอีกครั้ง</Button>
      </div>}
      {record && !loading && !loadError && <>
        <p className="mb-4 text-sm text-slate-600">แก้ไขรายละเอียดได้ โดยคงประเภทรายการเดิม</p>
        {saveError && <Alert className="mb-4" showIcon type="error" title={saveError} />}
        <Form form={form} name="edit-transaction" layout="vertical" disabled={saving} onFinish={save} noValidate>
          <TransactionFields categories={categories} lockType originalCategoryId={record.category.id} />
        </Form>
      </>}
    </Modal>
  );
}

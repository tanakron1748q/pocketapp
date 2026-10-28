"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, Modal, Radio } from "antd";
import type { Category, TransactionType } from "@/lib/finance";
import { readJson, RequestError } from "@/lib/private-request";

type CategoryDraft = { name: string; type: TransactionType };

function CategoryEditor({ category, onClose, onSaved }: {
  category: Category | null; onClose: () => void; onSaved: (category: Category) => void;
}) {
  const [form] = Form.useForm<CategoryDraft>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(values: CategoryDraft) {
    setSaving(true);
    setError(null);
    try {
      const result = await readJson<{ category: Category }>(category ? `/api/categories/${encodeURIComponent(category.id)}` : "/api/categories", {
        method: category ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category ? { name: values.name } : values),
      });
      onSaved(result.category);
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "บันทึกหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง");
      if (error instanceof RequestError && error.fields?.name) form.setFields([{ name: "name", errors: error.fields.name }]);
    } finally { setSaving(false); }
  }

  return (
    <Modal open title={category ? "เปลี่ยนชื่อหมวดหมู่" : "เพิ่มหมวดหมู่"} onCancel={onClose} onOk={() => form.submit()}
      okText="บันทึกหมวดหมู่" cancelText="ยกเลิก" confirmLoading={saving}
      okButtonProps={{ disabled: saving }} cancelButtonProps={{ disabled: saving }}
      closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
      {error && <Alert className="mb-4" showIcon type="error" title={error} />}
      <Form form={form} name="category" layout="vertical" onFinish={save} disabled={saving} noValidate
        initialValues={{ name: category?.name ?? "", type: category?.type ?? "EXPENSE" }}>
        {category ? <p className="mb-4 text-slate-600">{category.type === "INCOME" ? "หมวดรายรับ" : "หมวดรายจ่าย"} · ชื่อใหม่จะแสดงในรายการย้อนหลังด้วย</p> : (
          <Form.Item name="type" label="ประเภทหมวดหมู่" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: "EXPENSE", label: "รายจ่าย" }, { value: "INCOME", label: "รายรับ" }]} />
          </Form.Item>
        )}
        <Form.Item name="name" label="ชื่อหมวดหมู่" rules={[
          { required: true, whitespace: true, message: "กรุณากรอกชื่อหมวดหมู่" },
          { max: 100, message: "ชื่อหมวดหมู่ต้องไม่เกิน 100 ตัวอักษร" },
        ]}>
          <Input maxLength={100} autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function CategoryManager({ categories, onChanged, onClose }: {
  categories: Category[]; onChanged: (category: Category) => void; onClose: () => void;
}) {
  const [editor, setEditor] = useState<{ category: Category | null } | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function archive(category: Category) {
    setArchiving(category.id);
    setError(null);
    setNotice(null);
    try {
      const result = await readJson<{ category: Category }>(`/api/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }),
      });
      onChanged(result.category);
      setNotice("เก็บหมวดหมู่แล้ว รายการย้อนหลังยังอยู่");
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "เก็บหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { setArchiving(null); }
  }

  return (
    <>
      <Modal open title="จัดการหมวดหมู่" onCancel={onClose} footer={<Button onClick={onClose} disabled={Boolean(archiving)}>ปิด</Button>}
        style={{ top: 24 }} styles={{ body: { maxHeight: "65dvh", overflowY: "auto" } }}
        closable={!archiving} keyboard={!archiving} mask={{ closable: !archiving }}>
        <p className="mb-4 text-slate-600">เก็บหมวดที่เลิกใช้เพื่อซ่อนจากรายการใหม่ โดยรายการย้อนหลังยังแสดงหมวดเดิม</p>
        {error && <Alert className="mb-4" showIcon type="error" title={error} />}
        {notice && <Alert className="mb-4" showIcon type="success" title={notice} />}
        <Button type="primary" disabled={Boolean(archiving)} onClick={() => { setNotice(null); setError(null); setEditor({ category: null }); }}>เพิ่มหมวดหมู่</Button>
        {(["EXPENSE", "INCOME"] as const).map((type) => (
          <section key={type} className="mt-5" aria-label={type === "INCOME" ? "หมวดรายรับ" : "หมวดรายจ่าย"}>
            <h3 className="mb-2 font-semibold">{type === "INCOME" ? "หมวดรายรับ" : "หมวดรายจ่าย"}</h3>
            <ul className="space-y-2">
              {categories.filter((category) => category.type === type).map((category) => (
                <li key={category.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="break-words [overflow-wrap:anywhere]">{category.name}{category.archived && <span className="ml-2 text-sm text-slate-500">(เก็บแล้ว)</span>}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button disabled={Boolean(archiving)} onClick={() => { setNotice(null); setError(null); setEditor({ category }); }}>เปลี่ยนชื่อ</Button>
                    {!category.archived && <Button disabled={Boolean(archiving)} loading={archiving === category.id} onClick={() => archive(category)}>เก็บหมวด</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Modal>
      {editor && <CategoryEditor category={editor.category} onClose={() => setEditor(null)} onSaved={(category) => {
        onChanged(category);
        setNotice(editor.category ? "เปลี่ยนชื่อหมวดหมู่แล้ว" : "เพิ่มหมวดหมู่แล้ว");
        setEditor(null);
      }} />}
    </>
  );
}

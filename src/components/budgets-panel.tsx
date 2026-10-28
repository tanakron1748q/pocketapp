"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Radio } from "antd";
import { displayAmount, todayInThailand, type BudgetCategory, type BudgetDraft, type BudgetReport } from "@/lib/finance";
import { BUDGET_AMOUNT_ERROR, parseBudgetSatang } from "@/lib/budget-schema";
import { readJson, RequestError } from "@/lib/private-request";

function BudgetEditor({ category, month, onClose, onSaved }: {
  category: BudgetCategory; month: string; onClose: () => void; onSaved: () => void;
}) {
  const [form] = Form.useForm<BudgetDraft>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(values: BudgetDraft) {
    setSaving(true);
    setError(null);
    try {
      await readJson("/api/budgets", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, month, categoryId: category.id }),
      });
      onSaved();
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "บันทึกงบไม่สำเร็จ กรุณาลองอีกครั้ง");
      if (error instanceof RequestError && error.fields?.amount) form.setFields([{ name: "amount", errors: error.fields.amount }]);
    } finally { setSaving(false); }
  }
  return <Modal open title="ตั้งงบหมวดรายจ่าย" onCancel={onClose} onOk={() => form.submit()} okText="บันทึกงบ" cancelText="ยกเลิก"
    confirmLoading={saving} okButtonProps={{ disabled: saving, "aria-label": "บันทึกงบ" }} cancelButtonProps={{ disabled: saving }}
    closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
    <p className="mb-3 break-words [overflow-wrap:anywhere]">{category.name} · {month}</p>
    {error && <Alert className="mb-3" showIcon type="error" title={error} />}
    <Form form={form} name="budget" layout="vertical" disabled={saving} noValidate onFinish={save}
      initialValues={{ scope: "MONTH", amount: category.amount ?? "" }}>
      <Form.Item name="scope" label="ใช้กับเดือน" rules={[{ required: true }]}>
        <Radio.Group className="flex flex-col gap-2" options={[
          { value: "MONTH", label: "เฉพาะเดือนที่เลือก" },
          { value: "DEFAULT", label: "ค่าตั้งต้นตั้งแต่เดือนนี้เป็นต้นไป" },
        ]} />
      </Form.Item>
      <p className="mb-4 text-sm text-slate-600">ค่าตั้งต้นใช้ต่อจนกว่าจะมีค่าตั้งต้นใหม่ เดือนที่ปรับเฉพาะไว้ยังใช้ค่านั้น งบเหลือไม่ทบข้ามเดือน กรอก 0 ได้</p>
      <Form.Item name="amount" label="งบ (บาท)" rules={[{ validator: async (_, value) => {
        if (typeof value !== "string" || parseBudgetSatang(value) === null) throw new Error(BUDGET_AMOUNT_ERROR);
      } }]}>
        <Input inputMode="decimal" autoComplete="off" />
      </Form.Item>
    </Form>
  </Modal>;
}

export function BudgetsPanel({ revision }: { revision: number }) {
  const [month, setMonth] = useState(() => todayInThailand().slice(0, 7));
  const [data, setData] = useState<BudgetReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<BudgetCategory | null>(null);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readJson<BudgetReport>(`/api/budgets?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [month, revision, attempt]);
  return <section className="mt-8 min-w-0 rounded-xl border border-slate-200 p-5" aria-label="งบรายเดือน">
    <h2 className="mb-3 text-xl font-semibold">งบรายเดือน</h2>
    <label htmlFor="budget-month">เดือนงบ (เวลาไทย)</label>
    <Input id="budget-month" className="mt-2" type="month" value={month} disabled={Boolean(editor)} onChange={(event) => {
      if (event.target.value) { setMonth(event.target.value); setNotice(false); }
    }} />
    <p className="my-3 text-sm text-slate-600">ใช้ไปเท่ากับรายจ่ายสุทธิ รวมเงินคืนในเดือนที่ได้รับ งบเหลือไม่ทบข้ามเดือน ใช้เกินงบยังบันทึกรายจ่ายต่อได้</p>
    {notice && <Alert className="mb-3" showIcon type="success" title="บันทึกงบแล้ว" />}
    {error ? <><Alert showIcon type="error" title="โหลดงบไม่สำเร็จ" /><Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>ลองโหลดงบอีกครั้ง</Button></>
      : data?.month === month ? <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="งบแยกหมวดรายจ่าย">
        {data.categories.map((category) => <li key={category.id} className="min-w-0 rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold break-words [overflow-wrap:anywhere]">{category.name}{category.archived ? " (เก็บแล้ว)" : ""}</h3>
          {category.amount === null ? <p className="mt-2">ยังไม่ได้ตั้งงบ</p> : <>
            <p className="mt-2">งบ {displayAmount(category.amount)}</p>
            <p className="text-sm text-slate-600">{category.overrideAmount !== null ? "ปรับเฉพาะเดือนนี้" : `ค่าตั้งต้นตั้งแต่ ${category.defaultFrom}`}</p>
          </>}
          <p className="mt-2">ใช้ไปสุทธิ {displayAmount(category.netExpense)}</p>
          {category.remaining !== null && <p className={`mt-1 font-semibold ${category.remaining.startsWith("-") ? "text-red-700" : "text-emerald-700"}`}>
            {category.remaining.startsWith("-") ? `ใช้เกินงบ ${displayAmount(category.remaining.slice(1))}` : `คงเหลือ ${displayAmount(category.remaining)}`}
          </p>}
          {!category.archived && <Button className="mt-3" onClick={() => { setEditor(category); setNotice(false); }}>ตั้งงบ</Button>}
        </li>)}
        {data.categories.length === 0 && <li>ยังไม่มีหมวดรายจ่าย เพิ่มหมวดเพื่อเริ่มตั้งงบ</li>}
      </ul> : <p role="status">กำลังโหลดงบ…</p>}
    {editor && <BudgetEditor category={editor} month={month} onClose={() => setEditor(null)} onSaved={() => {
      setEditor(null); setNotice(true); setAttempt((value) => value + 1);
    }} />}
  </section>;
}

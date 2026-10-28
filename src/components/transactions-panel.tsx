"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Spin } from "antd";
import {
  displayAmount, displayDate, todayInThailand,
  type Category, type Transaction, type TransactionDraft, type TransactionPage,
} from "@/lib/finance";

import { applyFieldErrors, readJson, RequestError } from "@/lib/private-request";
import { FavoriteEntries } from "./favorite-entries";
import { TransactionFields } from "./transaction-fields";
import { TransactionEditor } from "./transaction-editor";
import { TransactionDeleteDialog } from "./transaction-delete-dialog";
import { CategoryManager } from "./category-manager";

export function TransactionsPanel() {
  const [form] = Form.useForm<TransactionDraft>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [records, setRecords] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<Transaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);

  function categoryChanged(category: Category) {
    setCategories((previous) => previous.some((item) => item.id === category.id)
      ? previous.map((item) => item.id === category.id ? category : item) : [...previous, category]);
    setRecords((previous) => previous.map((record) => record.category.id === category.id ? { ...record, category } : record));
    if (category.archived && form.getFieldValue("categoryId") === category.id) {
      form.setFieldsValue({ categoryId: undefined });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      readJson<{ categories: Category[]; today: string }>("/api/categories", options),
      readJson<TransactionPage>("/api/transactions", options),
    ]).then(([personal, page]) => {
      if (controller.signal.aborted) return;
      setCategories(personal.categories);
      setRecords(page.transactions);
      setNextCursor(page.nextCursor);
      form.setFieldsValue({ type: "EXPENSE", date: personal.today });
      setInitialLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setInitialError(true);
      setInitialLoading(false);
    });
    return () => controller.abort();
  }, [attempt, form]);

  async function loadPage(cursor?: string) {
    setListLoading(true);
    setListError(false);
    try {
      const page = await readJson<TransactionPage>(`/api/transactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      setRecords((previous) => cursor
        ? [...previous, ...page.transactions.filter((item) => !previous.some((record) => record.id === item.id))]
        : page.transactions);
      setNextCursor(page.nextCursor);
    } catch { setListError(true); }
    finally { setListLoading(false); }
  }

  async function save(values: TransactionDraft) {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await readJson("/api/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      setSaved(true);
      setPrefilled(false);
      form.setFieldsValue({ amount: "", description: "" });
      // A refresh failure must not turn a successful save into a retryable submission.
      await loadPage();
    } catch (error) {
      setSaveError(error instanceof RequestError ? error.message : "บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      applyFieldErrors(form, error);
    } finally { setSaving(false); }
  }

  if (initialLoading) return <section className="mt-8" aria-label="กำลังโหลดรายการ"><Spin /> กำลังโหลดรายการ…</section>;
  if (initialError) return (
    <section className="mt-8 space-y-3">
      <Alert showIcon type="error" title="โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง" />
      <Button onClick={() => { setInitialError(false); setInitialLoading(true); setAttempt((value) => value + 1); }}>ลองโหลดอีกครั้ง</Button>
    </section>
  );

  return (
    <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-xl border border-slate-200 p-5 sm:p-6" aria-labelledby="entry-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="entry-heading" className="text-xl font-semibold">เพิ่มรายการ</h2>
          <Button onClick={() => setManagingCategories(true)} disabled={saving}>จัดการหมวดหมู่</Button>
        </div>
        <FavoriteEntries form={form} disabled={saving} onBusy={setFavoriteBusy} onApply={(entry) => {
          form.resetFields();
          form.setFieldsValue({ type: entry.type, amount: entry.amount, categoryId: entry.category.id, description: entry.description ?? "", date: todayInThailand() });
          setSaved(false);
          setSaveError(null);
          setPrefilled(true);
        }} />
        {prefilled && <Alert className="mb-4" showIcon type="info" title="เติมร่างจากรายการโปรดแล้ว ยังไม่ได้บันทึก กรุณาตรวจวันที่ จำนวนเงิน และรายละเอียด" />}
        {saved && <Alert className="mb-4" showIcon type="success" title="บันทึกรายการแล้ว" />}
        {saveError && <Alert className="mb-4" showIcon type="error" title={saveError} />}
        <Form form={form} name="transaction" layout="vertical" onFinish={save} disabled={saving || favoriteBusy} noValidate
          onValuesChange={(changed) => {
            setSaved(false);
            if ("type" in changed) form.setFieldsValue({ categoryId: undefined });
          }}>
          <TransactionFields categories={categories} />
          <Button type="primary" htmlType="submit" loading={saving} disabled={saving || favoriteBusy} block size="large">{saving ? "กำลังบันทึก…" : "บันทึกรายการ"}</Button>
          <Button className="mt-3" block disabled={saving || favoriteBusy} onClick={() => {
            form.resetFields();
            form.setFieldsValue({ type: "EXPENSE", date: todayInThailand() });
            setPrefilled(false);
            setSaveError(null);
            setSaved(false);
          }}>ยกเลิกร่าง</Button>
        </Form>
      </section>
      <section className="min-w-0" aria-labelledby="history-heading" aria-busy={listLoading}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="history-heading" className="text-xl font-semibold">รายการของคุณ</h2>
          <Button onClick={() => loadPage()} disabled={saving || listLoading}>โหลดรายการใหม่</Button>
        </div>
        <p className="mb-4 text-sm text-slate-600">เรียงวันที่ล่าสุดก่อน หากวันเดียวกันแสดงรายการที่บันทึกล่าสุดก่อน</p>
        {notice && <Alert className="mb-4" showIcon type="success" title={notice} />}
        {listError && <Alert className="mb-4" type="error" showIcon title="โหลดรายการไม่สำเร็จ กดโหลดรายการใหม่เพื่อลองอีกครั้ง" />}
        {records.length === 0 && !listError && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">ยังไม่มีรายการ เริ่มบันทึกรายรับหรือรายจ่ายแรกของคุณได้เลย</p>}
        <ol className="space-y-3" aria-label="รายการรายรับและรายจ่าย">
          {records.map((record) => (
            <li key={record.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{record.category.name}</span>
                <span className={`font-semibold ${record.type === "INCOME" ? "text-emerald-700" : "text-slate-900"}`}>
                  {record.type === "INCOME" ? "+" : "−"}{displayAmount(record.amount)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{record.type === "INCOME" ? "รายรับ" : "รายจ่าย"} · <time dateTime={record.date}>{displayDate(record.date)}</time></p>
              {record.description && <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{record.description}</p>}
              <div className="mt-3 flex gap-2">
                <Button disabled={saving || listLoading} onClick={() => { setNotice(null); setEditId(record.id); }}>แก้ไข</Button>
                <Button danger disabled={saving || listLoading} onClick={() => { setNotice(null); setDeleteRecord(record); }}>ลบ</Button>
              </div>
            </li>
          ))}
        </ol>
        {listLoading && <p className="mt-4" role="status">กำลังโหลดรายการ…</p>}
        {nextCursor && <Button className="mt-4" block disabled={saving || listLoading} onClick={() => loadPage(nextCursor)}>ดูรายการก่อนหน้า</Button>}
      </section>
      {editId && <TransactionEditor key={editId} id={editId} categories={categories} onClose={() => setEditId(null)}
        onSaved={(updated) => {
          setRecords((previous) => previous.map((record) => record.id === updated.id ? updated : record)
            .sort((a, b) => b.date.localeCompare(a.date)));
          setEditId(null);
          setNotice("แก้ไขรายการแล้ว");
          void loadPage();
        }} />}
      {deleteRecord && <TransactionDeleteDialog key={deleteRecord.id} transaction={deleteRecord} onClose={() => setDeleteRecord(null)}
        onDeleted={(id) => {
          setRecords((previous) => previous.filter((record) => record.id !== id));
          setDeleteRecord(null);
          setNotice("ลบรายการแล้ว");
          void loadPage();
        }} />}
      {managingCategories && <CategoryManager categories={categories} onChanged={categoryChanged} onClose={() => setManagingCategories(false)} />}
    </div>
  );
}

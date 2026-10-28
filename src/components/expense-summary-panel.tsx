"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input } from "antd";
import { displayAmount, todayInThailand, type ExpenseSummary } from "@/lib/finance";
import { readJson } from "@/lib/private-request";

export function ExpenseSummaryPanel({ revision }: { revision: number }) {
  const [month, setMonth] = useState(() => todayInThailand().slice(0, 7));
  const [data, setData] = useState<ExpenseSummary | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readJson<ExpenseSummary>(`/api/expense-summary?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [month, revision, attempt]);
  return <section className="mt-8 rounded-xl border border-slate-200 p-5" aria-label="รายจ่ายสุทธิรายเดือน">
    <h2 className="mb-3 text-xl font-semibold">รายจ่ายสุทธิรายเดือน</h2>
    <label htmlFor="expense-month">เดือน (เวลาไทย)</label>
    <Input id="expense-month" className="mt-2" type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} />
    <p className="my-3 text-sm text-slate-600">เงินคืนลดรายจ่ายของหมวดต้นทางในเดือนที่ได้รับจริง ไม่เพิ่มรายรับ และรายจ่ายสุทธิอาจติดลบได้</p>
    {error ? <><Alert type="error" showIcon title="โหลดรายจ่ายสุทธิไม่สำเร็จ" /><Button onClick={() => setAttempt((value) => value + 1)}>ลองโหลดรายจ่ายสุทธิอีกครั้ง</Button></>
      : data?.month === month ? <>
        <p>รายจ่าย {displayAmount(data.expense)} · เงินคืน {displayAmount(data.refunded)}</p>
        <p className="my-2 font-semibold">รายจ่ายสุทธิ {displayAmount(data.netExpense)}</p>
        {data.categories.length ? <ul className="space-y-1 break-words [overflow-wrap:anywhere]">{data.categories.map((category) => <li key={category.id}>{category.name} · สุทธิ {displayAmount(category.netExpense)}</li>)}</ul> : <p>ยังไม่มีรายจ่ายหรือเงินคืนในเดือนนี้</p>}
      </> : <p role="status">กำลังโหลดรายจ่ายสุทธิ…</p>}
  </section>;
}

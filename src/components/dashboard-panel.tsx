"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, Button, Input } from "antd";
import { displayAmount, displayDate, todayInThailand, type DashboardReport } from "@/lib/finance";
import { readJson } from "@/lib/private-request";
import { MonthlyComparisonPanel } from "./monthly-comparison-panel";
import { BudgetsPanel } from "./budgets-panel";

const ExpenseCategoryChart = dynamic(() => import("./expense-category-chart"), {
  ssr: false, loading: () => <p role="status">กำลังโหลดกราฟ…</p>,
});

export function DashboardPanel({ revision }: { revision: number }) {
  const [month, setMonth] = useState(() => todayInThailand().slice(0, 7));
  const [data, setData] = useState<DashboardReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readJson<DashboardReport>(`/api/dashboard?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [month, revision, attempt]);
  return <>
    <section className="mt-8 min-w-0 rounded-xl border border-slate-200 p-5" aria-label="ภาพรวมรายเดือน">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">ภาพรวมรายเดือน</h2>
        <Button onClick={() => setAttempt((value) => value + 1)}>โหลดภาพรวมใหม่</Button>
      </div>
      <label htmlFor="dashboard-month">เดือน (เวลาไทย)</label>
      <Input id="dashboard-month" className="mt-2" type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} />
      <p className="my-3 text-sm text-slate-600">เงินเหลือประจำเดือน = รายรับ − รายจ่ายสุทธิ เป็นกระแสเงินที่บันทึกในเดือนนี้ ไม่ใช่ยอดเงินธนาคารหรือกระเป๋าทั้งหมด</p>
      {error ? <><Alert type="error" showIcon title="โหลดภาพรวมไม่สำเร็จ" /><Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>ลองโหลดภาพรวมอีกครั้ง</Button></>
        : data?.month === month ? <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <section aria-label="รายรับประจำเดือน" className="min-w-0 rounded-lg bg-emerald-50 p-4">
              <h3 className="text-sm">รายรับประจำเดือน</h3>
              <p className="mt-2 break-words text-lg font-semibold">{displayAmount(data.income)}</p>
            </section>
            <section aria-label="รายจ่ายสุทธิรายเดือน" className="min-w-0 rounded-lg bg-slate-50 p-4">
              <p className="break-words font-semibold">รายจ่ายสุทธิ {displayAmount(data.netExpense)}</p>
              <p className="mt-2 text-sm">รายจ่าย {displayAmount(data.expense)} · เงินคืน {displayAmount(data.refunded)}</p>
            </section>
            <section aria-label="เงินเหลือประจำเดือน" className="min-w-0 rounded-lg bg-blue-50 p-4">
              <h3 className="text-sm">เงินเหลือประจำเดือน</h3>
              <p className={`mt-2 break-words text-lg font-semibold ${data.monthlyNet.startsWith("-") ? "text-red-700" : "text-slate-900"}`}>{displayAmount(data.monthlyNet)}</p>
            </section>
          </div>
          <MonthlyComparisonPanel comparison={data.comparison} />
          <section className="mt-5 min-w-0" aria-label="กราฟรายจ่ายสุทธิตามหมวด">
            <h3 className="font-semibold">รายจ่ายสุทธิตามหมวด</h3>
            <p className="my-2 text-sm text-slate-600">หน่วยบาท · เงินคืนลดหมวดต้นทางในเดือนที่ได้รับ ค่าติดลบแสดงซ้ายศูนย์ ค่าบวกแสดงขวาศูนย์</p>
            {data.categories.length ? <>
              <ExpenseCategoryChart categories={data.categories} />
              <ul className="mt-2 space-y-1 break-words [overflow-wrap:anywhere]" aria-label="ยอดรายจ่ายสุทธิแต่ละหมวด">
                {data.categories.map((category) => <li key={category.id}>{category.name} · สุทธิ {displayAmount(category.netExpense)}</li>)}
              </ul>
            </> : <p>ยังไม่มีรายจ่ายหรือเงินคืนในเดือนนี้</p>}
          </section>
          <section className="mt-5" aria-label="รายการล่าสุดในเดือนที่เลือก">
            <h3 className="mb-2 font-semibold">รายการล่าสุดในเดือนที่เลือก</h3>
            {data.recentTransactions.length ? <ol className="space-y-2" aria-label="รายการล่าสุดของเดือน">
              {data.recentTransactions.map((record) => <li key={record.id} className="rounded-lg border border-slate-200 p-3">
                <p className="break-words [overflow-wrap:anywhere]">{record.category.name} · {record.type === "INCOME" ? "+" : "−"}{displayAmount(record.amount)}</p>
                <p className="mt-1 text-sm text-slate-600">{record.type === "INCOME" ? "รายรับ" : "รายจ่าย"} · <time dateTime={record.date}>{displayDate(record.date)}</time></p>
              </li>)}
            </ol> : <p>ยังไม่มีรายการในเดือนนี้</p>}
          </section>
        </> : <p role="status">กำลังโหลดภาพรวม…</p>}
    </section>
    <BudgetsPanel revision={revision + attempt} month={month} onMonthChange={setMonth} />
  </>;
}

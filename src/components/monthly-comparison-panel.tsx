import { displayAmount, displayDate, type MonthComparison } from "@/lib/finance";

function changeLabel(amount: string) {
  if (amount === "0.00") return "ไม่เปลี่ยนแปลง (0.00 บาท)";
  return amount.startsWith("-") ? `ลดลง ${displayAmount(amount.slice(1))}` : `เพิ่มขึ้น ${displayAmount(amount)}`;
}

export function MonthlyComparisonPanel({ comparison }: { comparison: MonthComparison | null }) {
  return <section className="mt-5 min-w-0 rounded-lg border border-slate-200 p-4" aria-label="เปรียบเทียบกับเดือนก่อน">
    <h3 className="font-semibold">เปรียบเทียบกับเดือนก่อน</h3>
    {comparison ? <>
      <p className="mt-2 text-sm text-slate-600">{comparison.mode === "elapsed" ? "เทียบช่วงวันที่ผ่านไป" : "เทียบเต็มเดือน"} · ณ วันที่ {displayDate(comparison.asOfDate)} (เวลาไทย)</p>
      <p className="mt-2">ช่วงเดือนที่เลือก: {displayDate(comparison.current.startDate)} – {displayDate(comparison.current.endDate)}</p>
      <p>ช่วงเดือนก่อน: {displayDate(comparison.previous.startDate)} – {displayDate(comparison.previous.endDate)}</p>
      {comparison.mode === "elapsed" && comparison.previous.endDate.slice(8) < comparison.current.endDate.slice(8) && <p className="mt-2 text-sm text-slate-600">เดือนก่อนสั้นกว่า จึงใช้ถึงวันสุดท้ายของเดือนก่อน</p>}
      <p className="my-3 text-sm text-slate-600">ส่วนต่าง = ช่วงเดือนที่เลือก − ช่วงเดือนก่อน แสดงการเปลี่ยนแปลงเป็นจำนวนเงินบาท</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {([
          ["income", "เปรียบเทียบรายรับ"], ["netExpense", "เปรียบเทียบรายจ่ายสุทธิ"], ["monthlyNet", "เปรียบเทียบเงินเหลือ"],
        ] as const).map(([key, title]) => <section key={key} aria-label={title} className="min-w-0 rounded-lg bg-slate-50 p-3 break-words">
          <h4 className="mb-2 font-semibold">{title}</h4>
          <p>เดือนที่เลือก {displayAmount(comparison.current[key])}</p>
          <p>เดือนก่อน {displayAmount(comparison.previous[key])}</p>
          <p className="mt-2 font-semibold">{changeLabel(comparison.change[key])}</p>
          {comparison.previous[key] === "0.00" ? <p className="mt-2 text-sm text-slate-600">ฐานเดือนก่อนเป็นศูนย์ จึงแสดงส่วนต่างเป็นจำนวนเงิน</p>
            : comparison.previous[key].startsWith("-") ? <p className="mt-2 text-sm text-slate-600">ฐานเดือนก่อนติดลบ ส่วนต่างแสดงการเปลี่ยนแปลงเชิงจำนวนเงิน</p> : null}
        </section>)}
      </div>
    </> : <p className="mt-2 text-slate-600">ยังไม่มีช่วงเปรียบเทียบสำหรับเดือนนี้</p>}
  </section>;
}

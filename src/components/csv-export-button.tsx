"use client";

import { useState } from "react";
import { Alert, Button } from "antd";
import { RequestError } from "@/lib/private-request";
import { transactionFilterParams, type TransactionFilters } from "@/lib/transaction-filters";

export function CsvExportButton({ getFilters, disabled }: { getFilters: () => TransactionFilters; disabled: boolean }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setExporting(true);
    setError(null);
    try {
      const params = transactionFilterParams(getFilters()).toString();
      const response = await fetch(`/api/transactions/export${params ? `?${params}` : ""}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login");
        throw new RequestError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
      }
      if (!response.ok) {
        const body = await response.json();
        throw new RequestError(body.error || "ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "pocketapp-transactions.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the blob available until the browser starts reading the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { setExporting(false); }
  }
  return <div className="mb-4">
    <Button onClick={download} disabled={disabled || exporting} loading={exporting} aria-label="ดาวน์โหลด CSV">ดาวน์โหลด CSV</Button>
    <p className="mt-2 text-sm text-slate-600">ส่งออกทุกรายการที่ตรงกับตัวกรองที่ใช้แล้ว รวมเงินคืนตามวันที่ได้รับและคำอธิบายเงินคืนในหมวดต้นทาง กรองรายจ่ายรวมเงินคืนด้วย</p>
    {error && <Alert className="mt-2" showIcon type="error" title={error} />}
  </div>;
}

"use client";

import { useState } from "react";
import { Alert, Modal } from "antd";
import { displayAmount, displayDate, type Transaction } from "@/lib/finance";
import { readJson, RequestError } from "@/lib/private-request";

export function TransactionDeleteDialog({ transaction, onClose, onDeleted }: {
  transaction: Transaction; onClose: () => void; onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await readJson(`/api/transactions/${encodeURIComponent(transaction.id)}`, { method: "DELETE" });
      onDeleted(transaction.id);
    } catch (error) {
      setError(error instanceof RequestError ? error.message : "ลบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally { setDeleting(false); }
  }

  return (
    <Modal open title="ยืนยันการลบรายการ" onCancel={onClose} onOk={remove}
      okText={deleting ? "กำลังลบ…" : "ยืนยันลบรายการ"} cancelText="ยกเลิก" confirmLoading={deleting}
      okButtonProps={{ danger: true, disabled: deleting, "aria-label": deleting ? "กำลังลบ…" : "ยืนยันลบรายการ" }} cancelButtonProps={{ disabled: deleting, autoFocus: true }}
      closable={!deleting} keyboard={!deleting} mask={{ closable: !deleting }}>
      <p>ต้องการลบรายการนี้หรือไม่? เมื่อลบแล้วจะกู้คืนไม่ได้</p>
      <div className="my-4 rounded-lg border border-slate-200 p-4">
        <p className="font-medium">{transaction.category.name} · {displayAmount(transaction.amount)}</p>
        <p className="mt-1 text-sm text-slate-600">{transaction.type === "INCOME" ? "รายรับ" : "รายจ่าย"} · {displayDate(transaction.date)}</p>
        {transaction.description && <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{transaction.description}</p>}
      </div>
      {error && <Alert showIcon type="error" title={error} />}
    </Modal>
  );
}

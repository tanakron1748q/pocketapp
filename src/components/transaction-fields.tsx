"use client";

import { Form, Input, Radio, Select } from "antd";
import { AMOUNT_ERROR, isBusinessDate, parseSatang, todayInThailand, type Category, type TransactionDraft } from "@/lib/finance";

export function TransactionFields({ categories, lockType = false }: { categories: Category[]; lockType?: boolean }) {
  const form = Form.useFormInstance<TransactionDraft>();
  const type = Form.useWatch("type", form) ?? "EXPENSE";
  return (
    <>
      <Form.Item name="type" label="ประเภท" rules={[{ required: true, message: "กรุณาเลือกประเภท" }]}>
        <Radio.Group disabled={lockType || undefined} optionType="button" buttonStyle="solid" options={[{ value: "EXPENSE", label: "รายจ่าย" }, { value: "INCOME", label: "รายรับ" }]} />
      </Form.Item>
      <Form.Item name="amount" label="จำนวนเงิน (บาท)" rules={[
        { required: true, message: "กรุณากรอกจำนวนเงิน" },
        { validator: (_, value) => !value || (typeof value === "string" && parseSatang(value) !== null) ? Promise.resolve() : Promise.reject(new Error(AMOUNT_ERROR)) },
      ]}>
        <Input inputMode="decimal" placeholder="0.00" maxLength={32} autoComplete="off" />
      </Form.Item>
      <Form.Item name="categoryId" label="หมวดหมู่" rules={[{ required: true, message: "กรุณาเลือกหมวดหมู่" }]}>
        <Select placeholder="เลือกหมวดหมู่" virtual={false} options={categories.filter((category) => category.type === type).map((category) => ({ value: category.id, label: category.name }))} />
      </Form.Item>
      <Form.Item name="date" label="วันที่ (เวลาไทย)" rules={[
        { required: true, message: "กรุณาเลือกวันที่" },
        { validator: (_, value) => !value || (isBusinessDate(value) && value <= todayInThailand()) ? Promise.resolve() : Promise.reject(new Error("บันทึกได้เฉพาะวันที่ถูกต้อง วันนี้หรือย้อนหลัง ตามเวลาไทย")) },
      ]}>
        <Input type="date" max={todayInThailand()} />
      </Form.Item>
      <Form.Item name="description" label="คำอธิบาย (ไม่บังคับ)" rules={[{ max: 1000, message: "คำอธิบายต้องไม่เกิน 1,000 ตัวอักษร" }]}>
        <Input.TextArea rows={2} maxLength={1000} />
      </Form.Item>
    </>
  );
}

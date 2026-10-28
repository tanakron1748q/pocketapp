"use client";

import { Button, Form, Input, Select } from "antd";
import type { Category } from "@/lib/finance";
import { transactionFiltersSchema, type TransactionFilters as Filters } from "@/lib/transaction-filters";

export function TransactionFilters({ categories, disabled, onApply }: {
  categories: Category[]; disabled: boolean; onApply: (filters: Filters) => void;
}) {
  const [form] = Form.useForm<Filters>();
  const type = Form.useWatch("type", form);
  return (
    <Form form={form} name="history-filters" layout="vertical" disabled={disabled} noValidate
      className="mb-5 rounded-xl border border-slate-200 p-4" aria-label="ค้นหาและกรองรายการ"
      onFinish={(values) => {
        const cleaned = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
        const parsed = transactionFiltersSchema.safeParse(cleaned);
        if (parsed.success) onApply(parsed.data);
      }}>
      <Form.Item name="search" label="ค้นหาคำอธิบาย">
        <Input maxLength={1000} placeholder="คำที่ต้องการค้นหา" />
      </Form.Item>
      <div className="grid min-w-0 gap-x-3 sm:grid-cols-2">
        <Form.Item name="startDate" label="ตั้งแต่วันที่ (เวลาไทย)">
          <Input type="date" className="min-w-0" />
        </Form.Item>
        <Form.Item name="endDate" label="ถึงวันที่ (เวลาไทย)" dependencies={["startDate"]} rules={[
          { validator: (_, value) => !value || !form.getFieldValue("startDate") || form.getFieldValue("startDate") <= value
            ? Promise.resolve() : Promise.reject(new Error("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด")) },
        ]}>
          <Input type="date" className="min-w-0" />
        </Form.Item>
        <Form.Item name="type" label="กรองประเภท">
          <Select allowClear placeholder="ทุกประเภท" virtual={false}
            onChange={() => form.setFieldValue("categoryId", undefined)}
            options={[{ value: "EXPENSE", label: "รายจ่าย" }, { value: "INCOME", label: "รายรับ" }]} />
        </Form.Item>
        <Form.Item name="categoryId" label="กรองหมวดหมู่">
          <Select allowClear placeholder="ทุกหมวดหมู่" virtual={false}
            options={categories.filter((category) => !type || category.type === type).map((category) => ({
              value: category.id, label: `${category.name} (${category.type === "INCOME" ? "รายรับ" : "รายจ่าย"})`,
            }))} />
        </Form.Item>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="primary" htmlType="submit">ค้นหาและกรอง</Button>
        <Button onClick={() => { form.resetFields(); onApply({}); }}>ล้างตัวกรอง</Button>
      </div>
    </Form>
  );
}

"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ExpenseSummary } from "@/lib/finance";

export default function ExpenseCategoryChart({ categories }: { categories: ExpenseSummary["categories"] }) {
  const data = categories.map((category) => ({ ...category, value: Number(category.netExpense) }));
  const bound = Math.max(1, ...data.map((category) => Math.abs(category.value)));
  return <div role="img" aria-label="กราฟแท่งรายจ่ายสุทธิ ค่าติดลบอยู่ซ้ายศูนย์ ค่าบวกอยู่ขวาศูนย์" className="min-w-0">
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 48 + 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 12, right: 20, bottom: 8, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[-bound, bound]} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12 }} tickFormatter={(name: string) => name.length > 14 ? `${name.slice(0, 13)}…` : name} />
        <ReferenceLine x={0} stroke="#475569" strokeWidth={2} />
        <Bar dataKey="value" isAnimationActive={false}>
          {data.map((category) => <Cell key={category.id} fill={category.value < 0 ? "#047857" : "#2563eb"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

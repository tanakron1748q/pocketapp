"use client";

import type { FormInstance } from "antd";
import type { TransactionDraft } from "./finance";

export class RequestError extends Error {
  constructor(message: string, readonly fields?: Record<string, string[]>) { super(message); }
}

export async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  if (response.status === 401) {
    window.location.replace("/login");
    throw new RequestError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  }
  const body = await response.json();
  if (!response.ok) throw new RequestError(body.error || "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง", body.fields);
  return body;
}

export function applyFieldErrors(form: FormInstance<TransactionDraft>, error: unknown) {
  if (error instanceof RequestError && error.fields) {
    const names = ["type", "amount", "categoryId", "date", "description"] as const;
    form.setFields(names.filter((name) => error.fields?.[name]).map((name) => ({ name, errors: error.fields![name] })));
  }
}

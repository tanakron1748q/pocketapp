import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pocketapp",
  description: "บันทึกรายรับและรายจ่ายส่วนตัว",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <style>{"@layer theme, base, antd, components, utilities;"}</style>
      </head>
      <body>
        <AntdRegistry><Providers>{children}</Providers></AntdRegistry>
      </body>
    </html>
  );
}

"use client";

import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider } from "antd";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <StyleProvider layer>
      <ConfigProvider>{children}</ConfigProvider>
    </StyleProvider>
  );
}

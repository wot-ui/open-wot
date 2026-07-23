import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Open Wot — 让 AI 真正懂 wot-ui",
    template: "%s — Open Wot",
  },
  description:
    "Open Wot 通过 CLI、MCP 和离线 Skills，让 AI 编程工具获得准确、版本匹配的 wot-ui 组件知识。",
  authors: [{ name: "Open Wot contributors" }],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script src="/theme.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}

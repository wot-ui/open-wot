import type { Metadata } from "next";
import Script from "next/script";
import packageJson from "../../../package.json";
import landingDocument from "../landing.html?raw";

const bodyMarkup =
  landingDocument
    .replaceAll("__OPEN_WOT_VERSION_DISPLAY__", packageJson.version.toUpperCase())
    .replaceAll("__OPEN_WOT_VERSION__", packageJson.version)
    .match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?.replace(/<script src="\.\/script\.js"><\/script>/i, "") ?? "";

export const metadata: Metadata = {
  title: "Open Wot — 让 AI 真正懂 wot-ui",
  description:
    "真实组件 API、版本匹配知识，一条命令将 wot-ui 接入你的 AI 编程工具。",
  keywords: [
    "wot-ui",
    "Vue",
    "CLI",
    "MCP",
    "AI 编程",
    "组件库",
    "离线文档",
  ],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "Open Wot — 让 AI 真正懂 wot-ui",
    description:
      "真实组件 API、版本匹配知识，一条命令将 wot-ui 接入你的 AI 编程工具。",
  },
  twitter: {
    card: "summary",
    title: "Open Wot — 让 AI 真正懂 wot-ui",
    description:
      "真实组件 API、版本匹配知识，一条命令将 wot-ui 接入你的 AI 编程工具。",
  },
};

export default function Home() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: bodyMarkup }} />
      <Script src="/script.js" strategy="afterInteractive" />
    </>
  );
}

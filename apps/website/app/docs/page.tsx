import type { Metadata } from "next";
import Script from "next/script";
import packageJson from "../../../../package.json";
import readme from "../../../../README.md?raw";
import { createDocsSections, groupDocsSections } from "./docs-source";

const sections = createDocsSections(readme);
const navigation = groupDocsSections(sections);

export const metadata: Metadata = {
  title: "文档",
  description:
    "Open Wot 中文文档：快速开始、Agent 接入、CLI 命令、MCP 工具、版本解析、安全机制与开发维护。",
};

export default function Docs() {
  return (
    <>
      <div className="docs-site">
        <div className="scan-lines" aria-hidden="true" />
        <a className="skip-link" href="#docs-content">
          跳到文档正文
        </a>

        <header className="docs-topbar" data-header>
          <div className="docs-topbar-inner">
            <a className="brand cursor-pointer" href="/" aria-label="返回 Open Wot 首页">
              <span className="brand-mark" aria-hidden="true">
                <span>&gt;</span>_
              </span>
              <span>OPEN_WOT</span>
            </a>
            <div className="docs-breadcrumb">
              <span>/</span>
              <strong>文档</strong>
              <small>
                v
                {packageJson.version}
              </small>
            </div>
            <label className="docs-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                placeholder="搜索文档与命令..."
                aria-label="搜索文档"
                data-docs-search
              />
              <kbd>/</kbd>
            </label>
            <label
              className="theme-picker theme-picker-compact cursor-pointer"
              title="选择主题色"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 4.5 5 5M13 6l5 5M4 20l4.2-1.1L19 8.1a2.1 2.1 0 0 0-3-3L5.1 16 4 20Z" />
                <path d="M12 18h8" />
              </svg>
              <i className="theme-picker-swatch" aria-hidden="true" />
              <input
                type="color"
                defaultValue="#39d353"
                aria-label="选择网站主题色"
                data-theme-picker
              />
            </label>
            <a
              className="docs-github cursor-pointer"
              href="https://github.com/wot-ui/open-wot"
            >
              GITHUB
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 17 10-10M7 7h10v10" />
              </svg>
            </a>
            <button
              className="docs-menu cursor-pointer"
              type="button"
              aria-expanded="false"
              aria-controls="docs-sidebar"
              data-docs-menu
            >
              <span className="sr-only">展开文档目录</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </header>

        <div className="docs-layout">
          <aside className="docs-sidebar" id="docs-sidebar" data-docs-sidebar>
            <div className="docs-sidebar-scroll">
              <div className="docs-nav-group">
                <span>文档</span>
                <a className="is-active" href="#overview">
                  概览
                </a>
              </div>
              {navigation.map((group) => (
                <div className="docs-nav-group" key={group.label}>
                  <span>{group.label}</span>
                  {group.items.map((section) => (
                    <a href={`#${section.id}`} key={section.id}>
                      {section.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <div className="docs-sidebar-meta">
              <span>
                <i className="status-dot" />
                离线知识可用
              </span>
              <a href="https://github.com/wot-ui/open-wot/issues">
                反馈文档问题 ↗
              </a>
            </div>
          </aside>

          <main className="docs-content" id="docs-content">
            <div className="docs-article">
              <section
                className="doc-hero doc-section"
                id="overview"
                data-search-section
              >
                <div className="doc-eyebrow">OPEN WOT / 文档</div>
                <h1>
                  让 AI 在写代码前，
                  <br />
                  <span>先读懂 wot-ui。</span>
                </h1>
                <p>
                  Open Wot 是 wot-ui v2 的 CLI、MCP Server
                  与离线知识库。它把组件 API、文档、示例和版本历史接入终端与 AI
                  编程工具，减少不存在的属性、混用 API 和版本不匹配的代码。
                </p>
                <div className="doc-hero-actions">
                  <a className="button button-solid cursor-pointer" href="#quick-start">
                    开始接入
                  </a>
                  <a
                    className="button button-outline cursor-pointer"
                    href="https://github.com/wot-ui/open-wot"
                  >
                    查看源码
                  </a>
                </div>
                <div className="doc-stats">
                  <div>
                    <span>8</span>
                    <small>MCP 工具</small>
                  </div>
                  <div>
                    <span>4</span>
                    <small>AI 客户端</small>
                  </div>
                  <div>
                    <span>0</span>
                    <small>文档 API Key</small>
                  </div>
                  <div>
                    <span>MIT</span>
                    <small>开源许可证</small>
                  </div>
                </div>
              </section>

              {sections.map((section) => (
                <section
                  className="doc-section"
                  id={section.id}
                  data-search-section
                  key={section.id}
                >
                  <div className="doc-section-number">{section.number}</div>
                  <div className="doc-kicker">{section.kicker}</div>
                  <h2>{section.title}</h2>
                  <div
                    className="doc-markdown"
                    dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                  />
                </section>
              ))}

              <div className="docs-empty" data-docs-empty hidden>
                <span>NO_MATCH</span>
                <h2>没有找到匹配文档</h2>
                <p>试试搜索“版本”“MCP”“Button”或具体命令。</p>
              </div>
            </div>
          </main>

          <aside className="docs-toc" aria-label="本页目录">
            <span>本页内容</span>
            <a href="#overview">概览</a>
            {sections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.title}
              </a>
            ))}
          </aside>
        </div>

        <div className="toast" role="status" aria-live="polite" data-toast>
          代码已复制
        </div>
      </div>
      <Script src="/docs-script.js" strategy="afterInteractive" />
    </>
  );
}

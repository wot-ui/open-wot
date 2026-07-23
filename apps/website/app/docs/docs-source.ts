import { marked } from "marked";

export interface DocsSection {
  bodyHtml: string;
  group: "开始使用" | "Agent 接入" | "CLI" | "MCP" | "参考";
  id: string;
  kicker: string;
  number: string;
  title: string;
}

const sectionDefinitions = [
  { match: "30 秒接入", id: "quick-start", group: "开始使用" },
  { match: "它解决什么问题", id: "how-it-works", group: "开始使用" },
  { match: "给 AI 使用", id: "agent-init", group: "Agent 接入" },
  { match: "在终端使用", id: "cli", group: "CLI" },
  { match: "只配置 MCP", id: "mcp-setup", group: "MCP" },
  { match: "完整命令速查", id: "command-reference", group: "CLI" },
  { match: "安全设计", id: "safety", group: "参考" },
  { match: "开发 open-wot", id: "development", group: "参考" },
  { match: "当前边界", id: "boundaries", group: "参考" },
] as const;

const GITHUB_BLOB_BASE = "https://github.com/wot-ui/open-wot/blob/main";

function cleanHeading(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^[^\p{L}\p{N}@]+/u, "")
    .trim();
}

function expandDetails(markdown: string): string {
  return markdown
    .replace(
      /<details>\s*<summary><strong>(.*?)<\/strong><\/summary>/g,
      "\n### $1\n",
    )
    .replace(/<\/details>/g, "");
}

function decorateHtml(html: string): string {
  return html
    .replace(
      /<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
      (_, language: string | undefined, code: string) => {
        const label =
          language === "bash"
            ? "终端"
            : language === "json"
              ? "JSON"
              : language === "console"
                ? "输出"
                : language === "mermaid"
                  ? "数据流"
                  : language?.toUpperCase() || "代码";

        return `<div class="doc-code"><div class="doc-code-head"><span>${label}</span><button type="button" class="cursor-pointer" data-copy-code>复制</button></div><pre><code${language ? ` class="language-${language}"` : ""}>${code}</code></pre></div>`;
      },
    )
    .replace(/<table>/g, '<div class="doc-table-wrap"><table class="doc-table">')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/<blockquote>/g, '<blockquote class="doc-callout doc-callout-info">')
    .replace(
      /href="\.\/(CONTRIBUTING|LICENSE)\.md"/g,
      (_, file: string) => `href="${GITHUB_BLOB_BASE}/${file}.md"`,
    );
}

export function createDocsSections(readme: string): DocsSection[] {
  const headings = [...readme.matchAll(/^##[ \t]([^\r\n]+)$/gm)];

  return headings.flatMap((heading, index) => {
    const sourceTitle = heading[1];
    const title = cleanHeading(sourceTitle);
    const definition = sectionDefinitions.find(({ match }) =>
      title.includes(match),
    );

    if (!definition) return [];

    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? readme.length;
    const markdown = expandDetails(readme.slice(start, end).trim());
    const bodyHtml = decorateHtml(
      marked.parse(markdown, { async: false, gfm: true }),
    );

    return [
      {
        bodyHtml,
        group: definition.group,
        id: definition.id,
        kicker: definition.group,
        number: String(index + 1).padStart(2, "0"),
        title,
      },
    ];
  });
}

export function groupDocsSections(sections: DocsSection[]) {
  const groupOrder: DocsSection["group"][] = [
    "开始使用",
    "Agent 接入",
    "CLI",
    "MCP",
    "参考",
  ];

  return groupOrder
    .map((label) => ({
      label,
      items: sections.filter((section) => section.group === label),
    }))
    .filter((group) => group.items.length > 0);
}

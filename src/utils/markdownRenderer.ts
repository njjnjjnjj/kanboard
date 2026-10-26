import { marked } from "marked";
import { resolveImageSrc } from "../services/attachmentService";

let initialized = false;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function getMarkedInstance() {
  if (!initialized) {
    marked.use({
      breaks: true,
      gfm: true,
      renderer: {
        image(token) {
          const resolved = resolveImageSrc(token.href);
          const title = token.title ? ` title="${escapeAttribute(token.title)}"` : "";
          const alt = token.text ? ` alt="${escapeAttribute(token.text)}"` : "";
          return `<img src="${escapeAttribute(resolved)}"${alt}${title} class="markdown-image" loading="lazy" />`;
        },
      },
    });
    initialized = true;
  }
  return marked;
}

export function renderMarkdown(content: string): string {
  if (!content?.trim()) return "";
  try {
    return getMarkedInstance().parse(content) as string;
  } catch (err) {
    console.error("Failed to parse markdown", err);
    return content;
  }
}

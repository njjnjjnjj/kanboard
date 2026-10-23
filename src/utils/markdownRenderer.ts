import { marked } from "marked";
import { resolveImageSrc } from "../services/attachmentService";

let initialized = false;

export function getMarkedInstance() {
  if (!initialized) {
    marked.use({
      breaks: true,
      gfm: true,
      renderer: {
        image(token) {
          const resolved = resolveImageSrc(token.href);
          const title = token.title ? ` title="${token.title}"` : "";
          const alt = token.text ? ` alt="${token.text}"` : "";
          return `<img src="${resolved}"${alt}${title} class="markdown-image" loading="lazy" />`;
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

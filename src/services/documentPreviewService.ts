import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

export function isLocalDocumentLink(href: string, allowRelative = false): boolean {
  if (/^(?:\/?[a-z]:[\\/]|file:)/i.test(href)) return true;
  return allowRelative && !!href && !/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href);
}

export async function openDocumentPreview(href: string): Promise<void> {
  if (!isTauri()) throw new Error("请在 Kanboard 桌面程序中预览本地文档");
  await invoke("open_document_preview", { href });
}

export function resolveDocumentImageSrc(src: string): string {
  if (!src || /^(?:https?:|data:|blob:|kanboard-document-image:)/i.test(src)) return src;
  return isTauri() ? convertFileSrc(src, "kanboard-document-image") : src;
}

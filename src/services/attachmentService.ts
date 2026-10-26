import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";

export interface AttachmentResult {
  relativePath: string;
  absolutePath: string;
  fileName: string;
  fileSize: number;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

export async function saveImageAttachment(
  file: File | Blob,
  customName?: string
): Promise<AttachmentResult> {
  const fileName = customName || (file instanceof File ? file.name : "image.png");
  const dataBase64 = await blobToBase64(file);

  if (isTauri()) {
    const result = await invoke<AttachmentResult>("save_image_attachment", {
      fileName,
      dataBase64,
    });
    return result;
  }

  // Web / Test 环境模拟
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const mockRelative = `attachments/${year}/${month}/${fileName}`;
  return {
    relativePath: mockRelative,
    absolutePath: mockRelative,
    fileName,
    fileSize: file.size,
  };
}

export function resolveImageSrc(src: string): string {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) {
    return src;
  }

  if (src.startsWith("attachments/")) {
    return isTauri() ? convertFileSrc(src, "kanboard-image") : src;
  }
  // 项目绝对路径必须先导入，不能直接交给 WebView 读取。
  return "";
}

export function normalizeAttachmentMarkdown(markdown: string): string {
  return markdown.replace(
    /(?:https?:\/\/kanboard-image\.localhost\/|kanboard-image:\/\/localhost\/)([^\s)"<>]+)/g,
    (url, path: string) => {
      try {
        const relative = decodeURIComponent(path);
        return relative.startsWith("attachments/") ? relative : url;
      } catch {
        return url;
      }
    },
  );
}

import { config } from "md-editor-v3";
import { resolveImageSrc } from "../services/attachmentService";

let configured = false;

export function setupMarkdownItConfig() {
  if (configured) return;
  config({
    markdownItConfig(md: any) {
      const defaultImageRule =
        md.renderer.rules.image ||
        function (tokens: any[], idx: number, options: any, _env: any, self: any) {
          return self.renderToken(tokens, idx, options);
        };

      md.renderer.rules.image = function (tokens: any[], idx: number, options: any, env: any, self: any) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex("src");
        if (srcIndex >= 0 && token.attrs) {
          token.attrs[srcIndex][1] = resolveImageSrc(token.attrs[srcIndex][1]);
        }
        return defaultImageRule(tokens, idx, options, env, self);
      };
    },
  });
  configured = true;
}

// 自动初始化一次
setupMarkdownItConfig();

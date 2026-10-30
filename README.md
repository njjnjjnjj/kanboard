# 看板

面向 Windows 的个人本地任务墙。数据直接保存在 SQLite 中，不需要账号、网络连接或常驻服务器。

## 开发环境

- Node.js 20 或更高版本
- Rust stable（MSVC toolchain）
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

安装依赖：

```powershell
npm install
```

启动桌面开发程序：

```powershell
npm run dev
```

`npm run dev` 会由 Tauri 启动 Vite 热更新服务和 Windows 桌面窗口，数据始终保存在本地 SQLite。界面调试使用 Tauri WebView 的开发者工具，不维护浏览器专用数据路径。

## 验证

```powershell
npm test
npm run build:web
```

正式 Windows 打包将在发布阶段通过 `npm run build` 执行。

## 默认 SOP 与验收方案

默认规范见 [SOP 正文](docs/default-sop.md) 与 [SOP 概述](docs/default-sop-summary.txt)，前后端共用同一份内容。未定制时随应用升级使用新版默认规范，已有自定义内容保留；「重置为默认」恢复为这套规范。

任务拖拽和复制辅助提示词仅包含任务信息，不再追加 SOP 概述或任务说明修订规则。Agent 通过 Kanboard 技能调用 `get_custom_sop` 读取当前规范。

Agent 使用 `submit_task_verification(task_id, content="完整 Markdown 正文")` 提测，系统保存正文并移入「待验证」，不再拼接固定章节。由 Agent 按任务自主编排，简单任务可使用简短段落，按需添加列表、表格或截图。仍须如实说明交付结果、必要核对方法、实际验证结果与未验证项，由用户决定是否完成。

旧版 `implementation`、`summary`、`test_guide` 提测参数已替换为 `content`。更新应用后需刷新 MCP 连接及 Kanboard 插件，使 Agent 使用新的工具定义与技能指引；已保存的验证方案不受影响。

## 验证方案中的图片

任务说明和验证方案支持上传图片或粘贴截图。图片保存在当前 `kanboard.db` 同级的 `attachments/年/月/` 目录，正文只保存相对引用。显示时由 Rust 的 `kanboard-image` 协议校验并读取图片，无需读取项目绝对路径。更改存储目录时，附件随数据库复制。

Agent 提交已有截图时，先调用 MCP 工具 `import_image_attachment`，参数 `file_path` 为截图的本机绝对路径。工具保留原文件，并返回 `attachment.relativePath` 和 `markdown`，将返回的 Markdown 放入 `submit_task_verification` 的方案正文即可。支持 PNG、JPEG、GIF、WebP、BMP 和 SVG，单张不超过 20 MB。

```markdown
![音量设置页面](attachments/2026/10/volume_20261026_123456.png)
```

旧方案中的项目绝对路径图片需要先导入，再替换为返回的相对引用。数据库导出仍是单独的 SQLite 文件，备份图片时应同时保存同级 `attachments` 目录。

项目内的验证文档可继续保留 Markdown 文件超链接，例如 `[验证说明](/D:/项目/doc/验证.md)`。点击后在独立的只读文档预览窗口打开，界面沿用「完整 SOP」预览样式，按 Esc 关闭。支持 UTF-8 编码的 Markdown、TXT 文档（最大 5 MB）；文档所在目录内的相对图片由 Rust 读取，预览中的相对文档链接也可继续打开。该窗口不提供文档写入功能。

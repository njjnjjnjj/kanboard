# 本地板

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

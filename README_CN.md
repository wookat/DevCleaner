# DevCleaner

[English](./README.md) | 中文

> 一站式开发工具缓存清理与维护工具，支持代码编辑器和 JetBrains IDE。

基于 **Rust + Tauri v2 + React + TailwindCSS** 构建，原生性能，跨平台设计。

---

## ✨ 功能特性

### 🔍 扫描清理
- **自动检测** — 自动识别已安装的代码编辑器和 JetBrains IDE
- **磁盘分析** — 按分类扫描缓存/日志/工作空间/扩展/全局存储，可视化占比
- **三种清理模式** — 安全（仅缓存日志）、推荐（含工作空间存储）、深度（除配置外全部清理）
- **分类选择** — 每个分类可独立勾选，显示百分比进度条
- **子项展开** — 扩展、工作空间存储、全局存储可展开查看子文件夹，支持逐项删除
- **清理前备份** — 一键创建 ZIP 备份，可随时恢复

### 💬 对话管理
- **对话提取** — 从 Cursor、Windsurf、Copilot 等 IDE 提取 AI 对话历史
- **批量删除** — 选择性清理旧对话，释放存储空间

### 🗑️ 卸载管理
- **注册表 + 文件系统双检测** — 全面识别已安装和残留的 IDE
- **多版本安装路径显示** — 显示所有版本的安装目录，可点击打开
- **旧版本清理** — 一键删除过期安装目录
- **残留数据清理** — 卸载后清理遗留配置和缓存

### ⚙️ 设置
- **中英双语** — 完整的国际化支持
- **主题切换** — 跟随系统 / 浅色 / 深色
- **备份管理** — 查看、打开、清空备份目录

---

## 🖥️ 支持的工具

### 代码编辑器（基于 VSCode）
| 工具 | 配置目录 |
|-----|---------|
| Visual Studio Code | `%APPDATA%\Code` |
| Cursor | `%APPDATA%\Cursor` |
| Windsurf | `%APPDATA%\Windsurf` |
| Kiro | `%APPDATA%\Kiro` |
| Trae / Trae CN | `%APPDATA%\Trae` / `%APPDATA%\Trae CN` |
| Antigravity | `%APPDATA%\Antigravity` |
| PearAI | `%APPDATA%\PearAI` |
| Aide | `%APPDATA%\Aide` |
| VSCodium | `%APPDATA%\VSCodium` |
| Positron | `%APPDATA%\Positron` |
| Void | `%APPDATA%\Void` |
| Qoder | `%APPDATA%\Qoder` |

### IDE（JetBrains）
| 工具 | 配置目录 |
|-----|---------|
| IntelliJ IDEA | `%APPDATA%\JetBrains\IntelliJIdea*` |
| PyCharm | `%APPDATA%\JetBrains\PyCharm*` |
| WebStorm | `%APPDATA%\JetBrains\WebStorm*` |
| GoLand | `%APPDATA%\JetBrains\GoLand*` |
| CLion | `%APPDATA%\JetBrains\CLion*` |
| Rider | `%APPDATA%\JetBrains\Rider*` |
| PhpStorm | `%APPDATA%\JetBrains\PhpStorm*` |
| RubyMine | `%APPDATA%\JetBrains\RubyMine*` |
| DataGrip | `%APPDATA%\JetBrains\DataGrip*` |
| RustRover | `%APPDATA%\JetBrains\RustRover*` |
| Android Studio | `%APPDATA%\JetBrains\AndroidStudio*` |
| Fleet | `%APPDATA%\JetBrains\Fleet*` |

---

## 🛠️ 开发

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.77
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 C++ 桌面开发工作负载）

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/wookat/dev-cleaner.git
cd dev-cleaner

# 安装依赖
npm install

# 开发模式运行
npm run tauri:dev

# 构建生产版本
npm run tauri:build
```

---

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust + Tauri v2 |
| 前端 | React 19 + TypeScript |
| 样式 | TailwindCSS v4 |
| 图表 | Recharts |
| 图标 | Lucide React |
| 国际化 | i18next + react-i18next |
| 组件 | Radix UI |

---

## 📁 项目结构

```
dev-cleaner/
├── src/                            # 前端
│   ├── components/
│   │   ├── ScanCleanPage.tsx       # 扫描清理（主功能）
│   │   ├── ConversationsPage.tsx   # 对话管理
│   │   ├── UninstallPage.tsx       # 卸载管理
│   │   ├── SettingsPage.tsx        # 设置
│   │   ├── Sidebar.tsx             # 侧边导航
│   │   └── TitleBar.tsx            # 自定义标题栏
│   ├── types/index.ts              # TypeScript 类型定义
│   ├── utils/formatters.ts         # 工具函数
│   ├── i18n/                       # 国际化配置
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                      # Rust 后端
│   └── src/
│       ├── main.rs                 # 入口
│       ├── lib.rs                  # 应用配置与命令注册
│       ├── ide_detector.rs         # IDE 检测（VSCode + JetBrains）
│       ├── scanner.rs              # 文件扫描引擎
│       ├── cleaner.rs              # 清理引擎（含安全保护）
│       ├── backup.rs               # 备份与恢复
│       ├── uninstaller.rs          # 卸载与残留清理
│       ├── conversation.rs         # 对话数据提取
│       └── commands.rs             # Tauri 命令处理
├── package.json
├── README.md                       # English documentation (primary)
└── README_CN.md                    # 中文文档
```

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 👤 作者

**wookat** — [GitHub](https://github.com/wookat) · wookat@qq.com

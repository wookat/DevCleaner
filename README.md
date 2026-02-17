# DevCleaner

English | [中文](./README_CN.md)

> All-in-one cache cleaning & maintenance tool for code editors and IDEs on Windows.

Built with **Rust + Tauri v2 + React + TailwindCSS** — native performance, modern UI.

---

## ✨ Features

### 🔍 Scan & Clean
- **Auto-Detection** — automatically discovers installed code editors and JetBrains IDEs
- **Disk Analysis** — scans cache / logs / workspace storage / extensions / global storage with visual breakdowns
- **Three Clean Modes** — Safe (cache & logs only), Recommended (+ workspace storage), Aggressive (everything except settings)
- **Per-Category Selection** — independently toggle each category with percentage progress bars
- **Sub-Item Expansion** — expand Extensions, Workspace Storage, Global Storage to view and selectively delete individual items
- **Pre-Clean Backup** — one-click ZIP backup before cleaning, restorable anytime

### 💬 Conversation Management
- **Conversation Extraction** — extract AI conversation history from Cursor, Windsurf, Copilot, and more
- **Batch Deletion** — selectively clean old conversations to free storage

### 🗑️ Uninstall Management
- **Dual Detection** — registry scanning + filesystem detection for comprehensive IDE discovery
- **Multi-Version Install Paths** — displays all versioned installation directories, clickable to open in explorer
- **Old Version Cleanup** — one-click removal of outdated installation directories
- **Residual Data Cleanup** — clean leftover config and cache after uninstallation

### ⚙️ Settings
- **Bilingual** — full English & Chinese i18n support
- **Theme Switching** — System / Light / Dark
- **Backup Management** — view, open, and clear backup directory

---

## 🖥️ Supported Tools

### Code Editors (VSCode-based)
| Tool | Config Folder |
|-----|--------------|
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

### IDEs (JetBrains)
| Tool | Config Folder |
|-----|--------------|
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

## 🛠️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.77
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (with C++ Desktop Development workload)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/wookat/dev-cleaner.git
cd dev-cleaner

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust + Tauri v2 |
| Frontend | React 19 + TypeScript |
| Styling | TailwindCSS v4 |
| Charts | Recharts |
| Icons | Lucide React |
| i18n | i18next + react-i18next |
| Components | Radix UI |

---

## 📁 Project Structure

```
dev-cleaner/
├── src/                            # Frontend
│   ├── components/
│   │   ├── ScanCleanPage.tsx       # Scan & Clean (main feature)
│   │   ├── ConversationsPage.tsx   # Conversation management
│   │   ├── UninstallPage.tsx       # Uninstall management
│   │   ├── SettingsPage.tsx        # Settings
│   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   └── TitleBar.tsx            # Custom title bar
│   ├── types/index.ts              # TypeScript type definitions
│   ├── utils/formatters.ts         # Utility functions
│   ├── i18n/                       # i18n configuration
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                      # Rust backend
│   └── src/
│       ├── main.rs                 # Entry point
│       ├── lib.rs                  # App setup & command registration
│       ├── ide_detector.rs         # IDE detection (VSCode + JetBrains)
│       ├── scanner.rs              # File scanning engine
│       ├── cleaner.rs              # Clean engine with safety rules
│       ├── backup.rs               # Backup & restore
│       ├── uninstaller.rs          # Uninstall & residual cleanup
│       ├── conversation.rs         # Conversation data extraction
│       └── commands.rs             # Tauri command handlers
├── package.json
├── README.md                       # English documentation (primary)
└── README_CN.md                    # 中文文档
```

---

## 📄 License

[MIT License](./LICENSE)

---

## 👤 Author

**wookat** — [GitHub](https://github.com/wookat) · wookat@qq.com

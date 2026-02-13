# ClawWin

**A Windows desktop app that makes running your own AI assistant dead simple.**

**一个让你在 Windows 上轻松跑自己 AI 助手的桌面应用。**

---

## What is this? / 这是啥？

ClawWin is a graphical interface for [OpenClaw](https://github.com/openclaw/openclaw) on Windows. OpenClaw is an open-source personal AI assistant that connects to your messaging apps (WhatsApp, Telegram, Slack, Discord, etc.). ClawWin wraps it up in a nice Windows app so you don't have to mess with command lines.

ClawWin 是 [OpenClaw](https://github.com/openclaw/openclaw) 的 Windows 图形界面。OpenClaw 是一个开源的个人 AI 助手，能接入你的聊天软件（微信、Telegram、Slack、Discord 等）。ClawWin 把它包装成一个 Windows 应用，让你不用折腾命令行。

## What can it do? / 能干嘛？

- **Setup Wizard** - Step-by-step guide to get everything running, no tech knowledge needed
- **Dashboard** - See your AI assistant's status, start/stop/restart it with one click
- **WSL2 Integration** - Automatically sets up Linux environment inside Windows (or runs natively)
- **Multi-channel** - Configure connections to WhatsApp, Telegram, Slack, Discord, and more
- **AI Provider Selection** - Pick your AI backend: Anthropic Claude, OpenAI, Google Gemini, Moonshot, etc.
- **System Tray** - Runs quietly in the background, always accessible from the taskbar
- **Bilingual UI** - English and Chinese interface, auto-detected from your system language

---

- **安装向导** - 一步一步引导你完成配置，不需要技术背景
- **控制面板** - 查看 AI 助手状态，一键启动 / 停止 / 重启
- **WSL2 集成** - 自动在 Windows 里搭建 Linux 环境（也可以原生运行）
- **多渠道接入** - 配置 WhatsApp、Telegram、Slack、Discord 等聊天平台
- **AI 服务商选择** - 选你喜欢的 AI：Anthropic Claude、OpenAI、Google Gemini、Moonshot 等
- **系统托盘** - 安静地在后台运行，随时从任务栏访问
- **中英双语界面** - 根据系统语言自动切换

## Requirements / 系统要求

- Windows 10/11
- Administrator privileges (for WSL2 setup) / 管理员权限（用于安装 WSL2）
- Node.js >= 22 (if building from source) / Node.js >= 22（从源码构建时需要）

## Quick Start / 快速开始

### Install from Release / 从发布版安装

Download the latest `.exe` installer from [Releases](https://github.com/wk42worldworld/clawwin/releases), run it, and follow the setup wizard.

从 [Releases](https://github.com/wk42worldworld/clawwin/releases) 下载最新的 `.exe` 安装包，运行后跟着向导走就行。

### Build from Source / 从源码构建

```bash
git clone https://github.com/wk42worldworld/clawwin.git
cd clawwin
npm install
npm start
```

To build the Windows installer:

构建 Windows 安装包：

```bash
npm run dist
```

### Development / 开发模式

```bash
npm run dev
```

## How it Works / 工作原理

```
┌─────────────────────────────────┐
│         ClawWin (Electron)      │  <-- What you see / 你看到的界面
│  ┌───────────┐  ┌────────────┐  │
│  │  Wizard   │  │ Dashboard  │  │
│  └───────────┘  └────────────┘  │
└────────────┬────────────────────┘
             │ manages / 管理
             ▼
┌─────────────────────────────────┐
│     OpenClaw Gateway            │  <-- The brain / AI 大脑
│  (runs in WSL2 or natively)     │
└────────────┬────────────────────┘
             │ connects to / 连接
             ▼
┌─────────────────────────────────┐
│  WhatsApp / Telegram / Slack    │  <-- Your chat apps / 你的聊天软件
│  Discord / Signal / ...         │
└─────────────────────────────────┘
```

ClawWin handles the Windows side of things: it sets up WSL2, installs OpenClaw inside it, and gives you a dashboard to control everything. The actual AI work is done by the OpenClaw gateway running underneath.

ClawWin 负责 Windows 端的事情：配置 WSL2、在里面安装 OpenClaw、给你一个控制面板来管理一切。实际的 AI 工作由底下运行的 OpenClaw 网关完成。

## Project Structure / 项目结构

```
src/
├── main/              # Electron main process / 主进程
│   ├── index.ts       # App entry point / 应用入口
│   ├── wsl-manager.ts # WSL2 management / WSL2 管理
│   ├── native-manager.ts # Native Windows backend / 原生后端
│   ├── ipc-handlers.ts   # Frontend-backend communication / 前后端通信
│   └── tray.ts        # System tray / 系统托盘
├── preload/           # Electron preload / 预加载脚本
└── renderer/          # Frontend UI / 前端界面
    ├── index.html     # Dashboard / 控制面板
    ├── wizard.html    # Setup wizard / 安装向导
    ├── styles.css     # Styles / 样式
    └── i18n.js        # Translations / 翻译
```

## Tech Stack / 技术栈

- **Electron** - Desktop framework / 桌面框架
- **TypeScript** - Language / 编程语言
- **Node.js** - Runtime / 运行时
- **electron-builder** - Packaging / 打包工具

## License / 许可

MIT

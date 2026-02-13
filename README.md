# ClawWin

> **One-click install OpenClaw on Windows. No command line. No hassle.**
>
> **Windows 上一键安装 OpenClaw。不用命令行，不用折腾。**

---

## Why ClawWin? / 为什么需要 ClawWin？

[OpenClaw](https://github.com/openclaw/openclaw) is a powerful open-source AI assistant that connects to WhatsApp, Telegram, Slack, Discord and more. But there's a problem:

**OpenClaw was not built for Windows.** Installing it requires Linux, a bunch of command-line steps, and manual configuration. Most Windows users give up before they even get started.

**ClawWin fixes that.** Double-click the installer, follow the wizard, done. Everything just works.

---

[OpenClaw](https://github.com/openclaw/openclaw) 是一个强大的开源 AI 助手，能接入 WhatsApp、Telegram、Slack、Discord 等聊天平台。但有个问题：

**OpenClaw 原版不支持 Windows。** 安装需要 Linux 环境，一堆命令行操作，还要手动改配置文件。大多数 Windows 用户还没开始就放弃了。

**ClawWin 解决了这个问题。** 双击安装包，跟着向导点几下，搞定。全程不需要敲一行命令。

---

## What You Get / 你能得到什么

| Without ClawWin / 没有 ClawWin | With ClawWin / 有了 ClawWin |
|---|---|
| Manually install WSL2, configure Linux / 手动装 WSL2、配 Linux | Automatic, one-click setup / 全自动一键搞定 |
| Edit config files in terminal / 在终端里改配置文件 | Friendly setup wizard / 友好的安装向导 |
| Run commands to start/stop / 敲命令启动停止 | Click a button / 点个按钮 |
| No idea if it's running / 不知道跑没跑起来 | Dashboard shows real-time status / 面板实时显示状态 |
| Google how to set up each channel / 搜索怎么配每个聊天渠道 | Built-in UI for all channels / 内置所有渠道配置界面 |

## Features / 功能一览

- **Setup Wizard** - Guides you through everything step by step, zero tech knowledge required / **安装向导** - 一步步引导，零技术门槛
- **One-click Start/Stop** - Manage your AI assistant like any other app / **一键启停** - 像管理普通软件一样管理 AI 助手
- **Channel Config UI** - Connect WhatsApp, Telegram, Slack, Discord, Signal, Feishu and more through a visual interface / **渠道配置界面** - 通过可视化界面接入 WhatsApp、Telegram、Slack、Discord、Signal、飞书等
- **AI Provider Selection** - Choose from Claude, GPT, Gemini, Kimi, Ollama (local) and more / **AI 服务商选择** - Claude、GPT、Gemini、Kimi、Ollama（本地）等随你挑
- **Skills Marketplace** - Browse and install community plugins with one click / **技能市场** - 一键浏览安装社区插件
- **System Tray** - Runs quietly in the background / **系统托盘** - 安静地在后台运行
- **Bilingual** - English & Chinese UI, auto-detected / **中英双语** - 根据系统语言自动切换

## Install / 安装

### Option 1: Download the installer (Recommended)

Download the latest `.exe` from [Releases](https://github.com/wk42worldworld/clawwin/releases), run it, follow the wizard.

### 方式一：下载安装包（推荐）

从 [Releases](https://github.com/wk42worldworld/clawwin/releases) 下载最新的 `.exe` 安装包，双击运行，跟着向导走。

### Option 2: Build from source

```bash
git clone https://github.com/wk42worldworld/clawwin.git
cd clawwin
npm install
npm start
```

### 方式二：从源码构建

```bash
git clone https://github.com/wk42worldworld/clawwin.git
cd clawwin
npm install
npm start
```

## Requirements / 系统要求

- **Windows 11 recommended** / **推荐 Windows 11**
- Windows 10 (version 2004+) also supported / Windows 10（2004 以上版本）也支持
- Administrator privileges / 管理员权限

> **⚠️ Not recommended: Cloud desktops / virtual machines**
>
> Services like AWS WorkSpaces, Azure Virtual Desktop, cloud VPS with Windows, etc. usually **do not support hardware virtualization (Hyper-V / WSL2)**, which ClawWin depends on. If you must use a cloud environment, please deploy [OpenClaw](https://github.com/openclaw/openclaw) directly on a Linux server instead.
>
> **⚠️ 不推荐：云电脑 / 虚拟机**
>
> 各类云桌面、云电脑、Windows 云服务器等通常**不支持硬件虚拟化（Hyper-V / WSL2）**，而 ClawWin 依赖此功能。如果你只有云服务器，建议直接在 Linux 上部署 [OpenClaw](https://github.com/openclaw/openclaw) 原版。

That's it. ClawWin handles the rest.

就这些。剩下的 ClawWin 全帮你搞定。

## License / 许可

MIT

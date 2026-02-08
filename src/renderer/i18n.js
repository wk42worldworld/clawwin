/**
 * OpenClaw Desktop - Internationalization (i18n)
 *
 * Supports: zh-CN (Chinese), en (English default)
 * Auto-detects Windows system language; Chinese locales show Chinese UI,
 * all others show English.
 */

var I18n = (function () {
  var translations = {
    en: {
      // ── Dashboard (index.html) ──────────────────────────
      "app.title": "ClawWin",
      "app.subtitle": "AI Assistant for Windows",
      "app.version": "ClawWin v1.0.0",
      "settings": "Settings",
      "section.status": "System Status",
      "status.wsl2": "WSL2",
      "status.openclaw": "OpenClaw Service",
      "status.checking": "Checking...",
      "status.running": "Running",
      "status.installed.stopped": "Installed (Stopped)",
      "status.not.installed": "Not Installed",
      "status.error.checking": "Error checking status",
      "status.active.port": "Active (port {port})",
      "status.stopped": "Stopped",
      "section.controls": "Controls",
      "btn.start": "Start Service",
      "btn.stop": "Stop Service",
      "btn.restart": "Restart",
      "btn.update": "Check for Updates",
      "section.logs": "Logs",
      "btn.clear": "Clear",
      "logs.waiting": "Waiting for service to start...",
      "logs.cleared": "Logs cleared.",
      "logs.starting": "Starting service...",
      "logs.started": "Service started successfully.",
      "logs.stopping": "Stopping service...",
      "logs.stopped": "Service stopped.",
      "logs.restarting": "Restarting service...",
      "logs.restarted": "Service restarted successfully.",
      "logs.checking.updates": "Checking for updates...",
      "logs.update.complete": "Update check complete.",
      "logs.error.start": "Error starting service: ",
      "logs.error.stop": "Error stopping service: ",
      "logs.error.restart": "Error restarting service: ",
      "logs.error.update": "Error checking for updates: ",
      "logs.settings.wip": "Settings panel is not yet implemented.",
      "settings.title": "Settings",
      "settings.aiconfig": "AI Provider Configuration",
      "settings.provider": "AI Provider",
      "settings.apikey": "API Key",
      "settings.apikey.placeholder": "Enter your API key...",
      "settings.model": "Default Model",
      "settings.save": "Save",
      "settings.saving": "Saving...",
      "settings.saved": "Settings saved successfully!",
      "settings.failed": "Failed to save: ",
      "settings.cancel": "Cancel",
      "settings.language.title": "Language Settings",
      "settings.gateway.title": "Gateway Settings",
      "settings.gateway.port": "Gateway Port",
      "settings.gateway.autostart": "Auto-start gateway on launch",
      "settings.gateway.token": "Gateway Token",
      "settings.about": "About",
      "settings.about.version": "Version",
      "settings.reset.wizard": "Re-run Setup Wizard",
      "chat.title": "Chat",
      "chat.new": "New Chat",
      "chat.history": "Chat History",
      "chat.input.placeholder": "Type a message...",
      "chat.send": "Send",
      "chat.empty.title": "Start a New Conversation",
      "chat.empty.subtitle": "Send a message to start chatting with AI",
      "chat.empty.suggestion1": "Explain quantum computing",
      "chat.empty.suggestion2": "Write a Python script",
      "chat.empty.suggestion3": "Help me debug code",
      "chat.empty.suggestion4": "Translate to English",
      "chat.typing": "AI is thinking...",
      "chat.error": "Error sending message",
      "chat.error.connection": "Connection lost. Reconnecting...",
      "chat.error.retry": "Retry",
      "chat.copy": "Copy",
      "chat.copied": "Copied!",
      "chat.stop": "Stop generating",
      "chat.back": "Dashboard",
      "chat.webui": "WebUI",
      "chat.connecting": "Connecting to gateway...",
      "chat.connected": "Connected",
      "chat.disconnected": "Disconnected",
      "chat.startup.loading": "Starting ClawWin...",
      "chat.startup.starting": "Starting service...",
      "chat.startup.connecting": "Connecting...",
      "chat.startup.error": "Failed to start service",
      "chat.startup.retry": "Retry",
      "footer.docs": "Documentation",
      "footer.github": "GitHub",
      "language": "Language",
      "lang.zh": "Chinese",
      "lang.en": "English",

      // ── Wizard (wizard.html) ────────────────────────────
      "wizard.title": "ClawWin Setup",
      "wizard.subtitle": "Let's get your AI assistant up and running",
      "wizard.step.welcome": "Welcome",
      "wizard.step.wsl2check": "WSL2 Check",
      "wizard.step.install": "Install",
      "wizard.step.complete": "Complete",

      // Step 1
      "wizard.welcome.title": "Welcome to ClawWin",
      "wizard.welcome.desc": "OpenClaw is a powerful AI assistant that runs locally on your machine using WSL2 (Windows Subsystem for Linux). This wizard will guide you through the setup process.",
      "wizard.welcome.whatwedo": "What this wizard will do:",
      "wizard.welcome.item1": "Verify WSL2 is installed and configured",
      "wizard.welcome.item2": "Install a Linux distribution if needed",
      "wizard.welcome.item3": "Download and configure the OpenClaw service",
      "wizard.welcome.item4": "Start the AI assistant",
      "wizard.welcome.requirements": "Requirements",
      "wizard.welcome.req1": "Windows 10 version 2004 or later (Build 19041+)",
      "wizard.welcome.req2": "At least 4 GB of available RAM",
      "wizard.welcome.req3": "Virtualization enabled in BIOS",
      "wizard.welcome.req4": "Internet connection for downloading components",
      "wizard.btn.getstarted": "Get Started",

      // Step 2
      "wizard.wsl2check.title": "Checking WSL2 Status",
      "wizard.check.wsl.feature": "Windows Subsystem for Linux feature",
      "wizard.check.vm.platform": "Virtual Machine Platform feature",
      "wizard.check.wsl.version": "WSL2 kernel version",
      "wizard.check.distro": "ClawWin environment (will be installed next)",
      "wizard.check.running": "Running checks...",
      "wizard.check.allpassed": "All checks passed. You can continue.",
      "wizard.check.failed": "Some requirements are not met. Click 'Install WSL2' to set up the required components.",
      "wizard.check.installing": "Installing WSL2... This may take several minutes.",
      "wizard.check.installed": "WSL2 installed. Re-running checks...",
      "wizard.check.install.failed": "Failed to install WSL2: ",
      "wizard.btn.back": "Back",
      "wizard.btn.continue": "Continue",
      "wizard.btn.install.wsl": "Install WSL2",

      // Restart
      "wizard.restart.title": "Restart Required",
      "wizard.restart.desc": "WSL2 has been enabled but your computer needs to restart to complete the setup. After restarting, ClawWin will automatically continue the setup.",
      "wizard.restart.btn": "Restart Now",
      "wizard.restart.status": "WSL2 enabled successfully. A restart is required to continue.",
      "wizard.restart.restarting": "Restarting...",
      "wizard.restart.failed": "Failed to restart. Please restart manually.",

      // Step 3
      "wizard.install.title": "Installing OpenClaw",
      "wizard.install.preparing": "Preparing installation...",
      "wizard.install.starting": "Starting installation process...",
      "wizard.install.wsl.env": "Preparing WSL2 environment...",
      "wizard.install.wsl.starting": "Starting WSL2 environment...",
      "wizard.install.downloading": "Configuring OpenClaw...",
      "wizard.install.downloading.components": "Configuring OpenClaw components...",
      "wizard.install.installing": "Installing OpenClaw...",
      "wizard.install.installing.service": "Installing OpenClaw service...",
      "wizard.install.configuring.gateway": "Configuring gateway service...",
      "wizard.install.starting.service": "Starting OpenClaw service...",
      "wizard.install.starting.service.log": "Starting the OpenClaw service...",
      "wizard.install.complete": "Installation complete!",
      "wizard.install.completed": "Installation completed successfully.",
      "wizard.install.failed": "Installation failed.",
      "wizard.install.distro.exists": "OpenClaw environment detected, skipping import.",

      // Step 4 - AI Config
      "wizard.step.aiconfig": "AI Config",
      "wizard.aiconfig.title": "Configure AI Provider",
      "wizard.aiconfig.desc": "Select your AI provider and enter your API key. You can change this later in Settings.",
      "wizard.aiconfig.provider": "AI Provider",
      "wizard.aiconfig.apikey": "API Key",
      "wizard.aiconfig.apikey.placeholder": "Enter your API key...",
      "wizard.aiconfig.model": "Default Model",
      "wizard.aiconfig.saving": "Saving configuration...",
      "wizard.aiconfig.saved": "Configuration saved successfully!",
      "wizard.aiconfig.failed": "Failed to save configuration: ",
      "wizard.aiconfig.skip": "Skip (use later)",
      "wizard.aiconfig.test": "Test Connection",
      "wizard.aiconfig.testing": "Testing...",
      "wizard.aiconfig.test.success": "Connection successful!",
      "wizard.aiconfig.test.failed": "Connection failed: ",

      // Step 5
      "wizard.complete.title": "Setup Complete!",
      "wizard.complete.desc": "OpenClaw has been successfully installed and configured on your system. You can now start using your AI assistant.",
      "wizard.complete.tips": "Quick Tips",
      "wizard.complete.tip1": "Use the dashboard to monitor service status",
      "wizard.complete.tip2": "ClawWin runs in the background via the system tray",
      "wizard.complete.tip3": "Check the logs panel if you encounter any issues",
      "wizard.complete.tip4": "Updates are checked automatically on startup",
      "wizard.btn.launch": "Launch ClawWin",
      "wizard.btn.launch.chat": "Start Chatting",
      "wizard.install.verifying": "Verifying connectivity...",
    },

    zh: {
      // ── Dashboard (index.html) ──────────────────────────
      "app.title": "ClawWin",
      "app.subtitle": "Windows AI \u52a9\u624b",
      "app.version": "ClawWin v1.0.0",
      "settings": "\u8bbe\u7f6e",
      "section.status": "\u7cfb\u7edf\u72b6\u6001",
      "status.wsl2": "WSL2",
      "status.openclaw": "OpenClaw \u670d\u52a1",
      "status.checking": "\u68c0\u67e5\u4e2d...",
      "status.running": "\u8fd0\u884c\u4e2d",
      "status.installed.stopped": "\u5df2\u5b89\u88c5\uff08\u5df2\u505c\u6b62\uff09",
      "status.not.installed": "\u672a\u5b89\u88c5",
      "status.error.checking": "\u72b6\u6001\u68c0\u67e5\u51fa\u9519",
      "status.active.port": "\u6d3b\u8dc3\u4e2d\uff08\u7aef\u53e3 {port}\uff09",
      "status.stopped": "\u5df2\u505c\u6b62",
      "section.controls": "\u63a7\u5236\u53f0",
      "btn.start": "\u542f\u52a8\u670d\u52a1",
      "btn.stop": "\u505c\u6b62\u670d\u52a1",
      "btn.restart": "\u91cd\u542f",
      "btn.update": "\u68c0\u67e5\u66f4\u65b0",
      "section.logs": "\u65e5\u5fd7",
      "btn.clear": "\u6e05\u7a7a",
      "logs.waiting": "\u7b49\u5f85\u670d\u52a1\u542f\u52a8...",
      "logs.cleared": "\u65e5\u5fd7\u5df2\u6e05\u7a7a\u3002",
      "logs.starting": "\u6b63\u5728\u542f\u52a8\u670d\u52a1...",
      "logs.started": "\u670d\u52a1\u542f\u52a8\u6210\u529f\u3002",
      "logs.stopping": "\u6b63\u5728\u505c\u6b62\u670d\u52a1...",
      "logs.stopped": "\u670d\u52a1\u5df2\u505c\u6b62\u3002",
      "logs.restarting": "\u6b63\u5728\u91cd\u542f\u670d\u52a1...",
      "logs.restarted": "\u670d\u52a1\u91cd\u542f\u6210\u529f\u3002",
      "logs.checking.updates": "\u6b63\u5728\u68c0\u67e5\u66f4\u65b0...",
      "logs.update.complete": "\u66f4\u65b0\u68c0\u67e5\u5b8c\u6210\u3002",
      "logs.error.start": "\u542f\u52a8\u670d\u52a1\u51fa\u9519\uff1a",
      "logs.error.stop": "\u505c\u6b62\u670d\u52a1\u51fa\u9519\uff1a",
      "logs.error.restart": "\u91cd\u542f\u670d\u52a1\u51fa\u9519\uff1a",
      "logs.error.update": "\u68c0\u67e5\u66f4\u65b0\u51fa\u9519\uff1a",
      "logs.settings.wip": "\u8bbe\u7f6e\u9762\u677f\u5c1a\u672a\u5b9e\u73b0\u3002",
      "settings.title": "\u8bbe\u7f6e",
      "settings.aiconfig": "AI \u670d\u52a1\u914d\u7f6e",
      "settings.provider": "AI \u670d\u52a1\u63d0\u4f9b\u5546",
      "settings.apikey": "API Key",
      "settings.apikey.placeholder": "\u8bf7\u8f93\u5165\u60a8\u7684 API Key...",
      "settings.model": "\u9ed8\u8ba4\u6a21\u578b",
      "settings.save": "\u4fdd\u5b58",
      "settings.saving": "\u4fdd\u5b58\u4e2d...",
      "settings.saved": "\u8bbe\u7f6e\u4fdd\u5b58\u6210\u529f\uff01",
      "settings.failed": "\u4fdd\u5b58\u5931\u8d25\uff1a",
      "settings.cancel": "\u53d6\u6d88",
      "settings.language.title": "\u8bed\u8a00\u8bbe\u7f6e",
      "settings.gateway.title": "\u7f51\u5173\u8bbe\u7f6e",
      "settings.gateway.port": "\u7f51\u5173\u7aef\u53e3",
      "settings.gateway.autostart": "\u542f\u52a8\u65f6\u81ea\u52a8\u8fd0\u884c\u7f51\u5173",
      "settings.gateway.token": "\u7f51\u5173\u4ee4\u724c",
      "settings.about": "\u5173\u4e8e",
      "settings.about.version": "\u7248\u672c",
      "settings.reset.wizard": "\u91cd\u65b0\u8fd0\u884c\u5b89\u88c5\u5411\u5bfc",
      "chat.title": "\u804a\u5929",
      "chat.new": "\u65b0\u5bf9\u8bdd",
      "chat.history": "\u804a\u5929\u8bb0\u5f55",
      "chat.input.placeholder": "\u8f93\u5165\u6d88\u606f...",
      "chat.send": "\u53d1\u9001",
      "chat.empty.title": "\u5f00\u59cb\u65b0\u5bf9\u8bdd",
      "chat.empty.subtitle": "\u53d1\u9001\u6d88\u606f\u5f00\u59cb\u4e0e AI \u804a\u5929",
      "chat.empty.suggestion1": "\u89e3\u91ca\u91cf\u5b50\u8ba1\u7b97",
      "chat.empty.suggestion2": "\u5199\u4e00\u4e2a Python \u811a\u672c",
      "chat.empty.suggestion3": "\u5e2e\u6211\u8c03\u8bd5\u4ee3\u7801",
      "chat.empty.suggestion4": "\u7ffb\u8bd1\u6210\u4e2d\u6587",
      "chat.typing": "AI \u6b63\u5728\u601d\u8003...",
      "chat.error": "\u53d1\u9001\u6d88\u606f\u51fa\u9519",
      "chat.error.connection": "\u8fde\u63a5\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u8fde...",
      "chat.error.retry": "\u91cd\u8bd5",
      "chat.copy": "\u590d\u5236",
      "chat.copied": "\u5df2\u590d\u5236\uff01",
      "chat.stop": "\u505c\u6b62\u751f\u6210",
      "chat.back": "\u63a7\u5236\u9762\u677f",
      "chat.webui": "WebUI",
      "chat.connecting": "\u6b63\u5728\u8fde\u63a5\u7f51\u5173...",
      "chat.connected": "\u5df2\u8fde\u63a5",
      "chat.disconnected": "\u672a\u8fde\u63a5",
      "chat.startup.loading": "\u6b63\u5728\u542f\u52a8 ClawWin...",
      "chat.startup.starting": "\u6b63\u5728\u542f\u52a8\u670d\u52a1...",
      "chat.startup.connecting": "\u6b63\u5728\u8fde\u63a5...",
      "chat.startup.error": "\u670d\u52a1\u542f\u52a8\u5931\u8d25",
      "chat.startup.retry": "\u91cd\u8bd5",
      "footer.docs": "\u6587\u6863",
      "footer.github": "GitHub",
      "language": "\u8bed\u8a00",
      "lang.zh": "\u4e2d\u6587",
      "lang.en": "English",

      // ── Wizard (wizard.html) ────────────────────────────
      "wizard.title": "ClawWin \u5b89\u88c5\u5411\u5bfc",
      "wizard.subtitle": "\u8ba9\u6211\u4eec\u4e00\u8d77\u8bbe\u7f6e\u60a8\u7684 AI \u52a9\u624b",
      "wizard.step.welcome": "\u6b22\u8fce",
      "wizard.step.wsl2check": "WSL2 \u68c0\u67e5",
      "wizard.step.install": "\u5b89\u88c5",
      "wizard.step.complete": "\u5b8c\u6210",

      // Step 1
      "wizard.welcome.title": "\u6b22\u8fce\u4f7f\u7528 ClawWin",
      "wizard.welcome.desc": "OpenClaw \u662f\u4e00\u4e2a\u5f3a\u5927\u7684 AI \u52a9\u624b\uff0c\u901a\u8fc7 WSL2\uff08Windows Linux \u5b50\u7cfb\u7edf\uff09\u5728\u60a8\u7684\u8ba1\u7b97\u673a\u4e0a\u672c\u5730\u8fd0\u884c\u3002\u672c\u5411\u5bfc\u5c06\u5e2e\u52a9\u60a8\u5b8c\u6210\u8bbe\u7f6e\u3002",
      "wizard.welcome.whatwedo": "\u672c\u5411\u5bfc\u5c06\u6267\u884c\u4ee5\u4e0b\u64cd\u4f5c\uff1a",
      "wizard.welcome.item1": "\u9a8c\u8bc1 WSL2 \u662f\u5426\u5df2\u5b89\u88c5\u5e76\u914d\u7f6e",
      "wizard.welcome.item2": "\u5982\u9700\u8981\uff0c\u5b89\u88c5 Linux \u53d1\u884c\u7248",
      "wizard.welcome.item3": "\u4e0b\u8f7d\u5e76\u914d\u7f6e OpenClaw \u670d\u52a1",
      "wizard.welcome.item4": "\u542f\u52a8 AI \u52a9\u624b",
      "wizard.welcome.requirements": "\u7cfb\u7edf\u8981\u6c42",
      "wizard.welcome.req1": "Windows 10 2004 \u6216\u66f4\u9ad8\u7248\u672c\uff08Build 19041+\uff09",
      "wizard.welcome.req2": "\u81f3\u5c11 4 GB \u53ef\u7528\u5185\u5b58",
      "wizard.welcome.req3": "BIOS \u4e2d\u5df2\u542f\u7528\u865a\u62df\u5316",
      "wizard.welcome.req4": "\u4e0b\u8f7d\u7ec4\u4ef6\u9700\u8981\u7f51\u7edc\u8fde\u63a5",
      "wizard.btn.getstarted": "\u5f00\u59cb\u8bbe\u7f6e",

      // Step 2
      "wizard.wsl2check.title": "\u68c0\u67e5 WSL2 \u72b6\u6001",
      "wizard.check.wsl.feature": "Windows Linux \u5b50\u7cfb\u7edf\u529f\u80fd",
      "wizard.check.vm.platform": "\u865a\u62df\u673a\u5e73\u53f0\u529f\u80fd",
      "wizard.check.wsl.version": "WSL2 \u5185\u6838\u7248\u672c",
      "wizard.check.distro": "ClawWin \u73af\u5883\uff08\u4e0b\u4e00\u6b65\u81ea\u52a8\u5b89\u88c5\uff09",
      "wizard.check.running": "\u6b63\u5728\u68c0\u67e5...",
      "wizard.check.allpassed": "\u6240\u6709\u68c0\u67e5\u5747\u5df2\u901a\u8fc7\uff0c\u53ef\u4ee5\u7ee7\u7eed\u3002",
      "wizard.check.failed": "\u90e8\u5206\u8981\u6c42\u672a\u6ee1\u8db3\u3002\u8bf7\u70b9\u51fb\u201c\u5b89\u88c5 WSL2\u201d\u6765\u8bbe\u7f6e\u6240\u9700\u7ec4\u4ef6\u3002",
      "wizard.check.installing": "\u6b63\u5728\u5b89\u88c5 WSL2... \u8fd9\u53ef\u80fd\u9700\u8981\u51e0\u5206\u949f\u3002",
      "wizard.check.installed": "WSL2 \u5df2\u5b89\u88c5\u3002\u6b63\u5728\u91cd\u65b0\u68c0\u67e5...",
      "wizard.check.install.failed": "\u5b89\u88c5 WSL2 \u5931\u8d25\uff1a",
      "wizard.btn.back": "\u4e0a\u4e00\u6b65",
      "wizard.btn.continue": "\u7ee7\u7eed",
      "wizard.btn.install.wsl": "\u5b89\u88c5 WSL2",

      // Restart
      "wizard.restart.title": "\u9700\u8981\u91cd\u542f",
      "wizard.restart.desc": "WSL2 \u5df2\u542f\u7528\uff0c\u4f46\u9700\u8981\u91cd\u65b0\u542f\u52a8\u8ba1\u7b97\u673a\u624d\u80fd\u5b8c\u6210\u8bbe\u7f6e\u3002\u91cd\u542f\u540e ClawWin \u5c06\u81ea\u52a8\u7ee7\u7eed\u5b89\u88c5\u3002",
      "wizard.restart.btn": "\u7acb\u5373\u91cd\u542f",
      "wizard.restart.status": "WSL2 \u5df2\u6210\u529f\u542f\u7528\uff0c\u9700\u8981\u91cd\u542f\u8ba1\u7b97\u673a\u624d\u80fd\u7ee7\u7eed\u3002",
      "wizard.restart.restarting": "\u6b63\u5728\u91cd\u542f...",
      "wizard.restart.failed": "\u91cd\u542f\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u91cd\u542f\u8ba1\u7b97\u673a\u3002",

      // Step 3
      "wizard.install.title": "\u6b63\u5728\u5b89\u88c5 OpenClaw",
      "wizard.install.preparing": "\u6b63\u5728\u51c6\u5907\u5b89\u88c5...",
      "wizard.install.starting": "\u5f00\u59cb\u5b89\u88c5\u8fc7\u7a0b...",
      "wizard.install.wsl.env": "\u6b63\u5728\u51c6\u5907 WSL2 \u73af\u5883...",
      "wizard.install.wsl.starting": "\u6b63\u5728\u542f\u52a8 WSL2 \u73af\u5883...",
      "wizard.install.downloading": "\u6b63\u5728\u914d\u7f6e OpenClaw...",
      "wizard.install.downloading.components": "\u6b63\u5728\u914d\u7f6e OpenClaw \u7ec4\u4ef6...",
      "wizard.install.installing": "\u6b63\u5728\u5b89\u88c5 OpenClaw...",
      "wizard.install.installing.service": "\u6b63\u5728\u5b89\u88c5 OpenClaw \u670d\u52a1...",
      "wizard.install.configuring.gateway": "\u6b63\u5728\u914d\u7f6e\u7f51\u5173\u670d\u52a1...",
      "wizard.install.starting.service": "\u6b63\u5728\u542f\u52a8 OpenClaw \u670d\u52a1...",
      "wizard.install.starting.service.log": "\u6b63\u5728\u542f\u52a8 OpenClaw \u670d\u52a1...",
      "wizard.install.complete": "\u5b89\u88c5\u5b8c\u6210\uff01",
      "wizard.install.completed": "\u5b89\u88c5\u5df2\u6210\u529f\u5b8c\u6210\u3002",
      "wizard.install.failed": "\u5b89\u88c5\u5931\u8d25\u3002",
      "wizard.install.distro.exists": "\u68c0\u6d4b\u5230 OpenClaw \u73af\u5883\u5df2\u5b58\u5728\uff0c\u8df3\u8fc7\u5bfc\u5165\u3002",

      // Step 4 - AI Config
      "wizard.step.aiconfig": "AI \u914d\u7f6e",
      "wizard.aiconfig.title": "\u914d\u7f6e AI \u670d\u52a1\u63d0\u4f9b\u5546",
      "wizard.aiconfig.desc": "\u9009\u62e9\u60a8\u7684 AI \u670d\u52a1\u63d0\u4f9b\u5546\u5e76\u8f93\u5165 API Key\u3002\u60a8\u53ef\u4ee5\u7a0d\u540e\u5728\u8bbe\u7f6e\u4e2d\u4fee\u6539\u3002",
      "wizard.aiconfig.provider": "AI \u670d\u52a1\u63d0\u4f9b\u5546",
      "wizard.aiconfig.apikey": "API Key",
      "wizard.aiconfig.apikey.placeholder": "\u8bf7\u8f93\u5165\u60a8\u7684 API Key...",
      "wizard.aiconfig.model": "\u9ed8\u8ba4\u6a21\u578b",
      "wizard.aiconfig.saving": "\u6b63\u5728\u4fdd\u5b58\u914d\u7f6e...",
      "wizard.aiconfig.saved": "\u914d\u7f6e\u4fdd\u5b58\u6210\u529f\uff01",
      "wizard.aiconfig.failed": "\u914d\u7f6e\u4fdd\u5b58\u5931\u8d25\uff1a",
      "wizard.aiconfig.skip": "\u8df3\u8fc7\uff08\u7a0d\u540e\u914d\u7f6e\uff09",
      "wizard.aiconfig.test": "\u6d4b\u8bd5\u8fde\u63a5",
      "wizard.aiconfig.testing": "\u6d4b\u8bd5\u4e2d...",
      "wizard.aiconfig.test.success": "\u8fde\u63a5\u6210\u529f\uff01",
      "wizard.aiconfig.test.failed": "\u8fde\u63a5\u5931\u8d25\uff1a",

      // Step 5
      "wizard.complete.title": "\u8bbe\u7f6e\u5b8c\u6210\uff01",
      "wizard.complete.desc": "OpenClaw \u5df2\u6210\u529f\u5b89\u88c5\u5e76\u914d\u7f6e\u5728\u60a8\u7684\u7cfb\u7edf\u4e0a\u3002\u60a8\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\u4f7f\u7528 AI \u52a9\u624b\u3002",
      "wizard.complete.tips": "\u5feb\u901f\u63d0\u793a",
      "wizard.complete.tip1": "\u4f7f\u7528\u4eea\u8868\u76d8\u76d1\u63a7\u670d\u52a1\u72b6\u6001",
      "wizard.complete.tip2": "ClawWin \u901a\u8fc7\u7cfb\u7edf\u6258\u76d8\u5728\u540e\u53f0\u8fd0\u884c",
      "wizard.complete.tip3": "\u9047\u5230\u95ee\u9898\u65f6\u8bf7\u67e5\u770b\u65e5\u5fd7\u9762\u677f",
      "wizard.complete.tip4": "\u542f\u52a8\u65f6\u4f1a\u81ea\u52a8\u68c0\u67e5\u66f4\u65b0",
      "wizard.btn.launch": "\u542f\u52a8 ClawWin",
      "wizard.btn.launch.chat": "\u5f00\u59cb\u804a\u5929",
      "wizard.install.verifying": "\u6b63\u5728\u9a8c\u8bc1\u8fde\u63a5...",
    },
  };

  var currentLang = "zh";

  /**
   * Detect language: if Windows locale starts with "zh", use Chinese.
   */
  function detectLanguage(systemLocale) {
    if (systemLocale && systemLocale.toLowerCase().indexOf("zh") === 0) {
      return "zh";
    }
    return "en";
  }

  /**
   * Get translation by key, with optional parameter substitution.
   */
  function t(key, params) {
    var dict = translations[currentLang] || translations["en"];
    var text = dict[key] || translations["en"][key] || key;
    if (params) {
      Object.keys(params).forEach(function (p) {
        text = text.replace("{" + p + "}", params[p]);
      });
    }
    return text;
  }

  /**
   * Apply translations to all elements with [data-i18n] attribute.
   */
  function applyTranslations() {
    var elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    // Also translate elements with data-i18n-title (for tooltips)
    var titleElements = document.querySelectorAll("[data-i18n-title]");
    titleElements.forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      el.title = t(key);
    });
    // Also translate elements with data-i18n-placeholder
    var placeholderElements = document.querySelectorAll("[data-i18n-placeholder]");
    placeholderElements.forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      el.placeholder = t(key);
    });
    // Update html lang attribute
    document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  }

  /**
   * Set language and apply translations.
   */
  function setLanguage(lang) {
    if (lang !== "zh" && lang !== "en") lang = "en";
    currentLang = lang;
    applyTranslations();
    // Persist the choice
    if (window.openclaw && window.openclaw.setSetting) {
      window.openclaw.setSetting("language", lang);
    }
    // Update language switcher button text if exists
    var langBtn = document.getElementById("btn-lang");
    if (langBtn) {
      langBtn.textContent = currentLang === "zh" ? "EN" : "\u4e2d\u6587";
      langBtn.title = currentLang === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587";
    }
  }

  /**
   * Initialize i18n: detect language or use saved preference.
   */
  async function init() {
    var savedLang = null;
    var systemLocale = navigator.language || "en";

    if (window.openclaw) {
      try {
        savedLang = await window.openclaw.getSetting("language");
      } catch (e) {
        // ignore
      }
      if (!savedLang) {
        try {
          systemLocale = await window.openclaw.getLocale();
        } catch (e) {
          // fallback to navigator.language
        }
      }
    }

    if (savedLang) {
      currentLang = savedLang === "zh" ? "zh" : "en";
    } else {
      currentLang = detectLanguage(systemLocale);
    }

    applyTranslations();

    // Update language switcher button
    var langBtn = document.getElementById("btn-lang");
    if (langBtn) {
      langBtn.textContent = currentLang === "zh" ? "EN" : "\u4e2d\u6587";
      langBtn.title = currentLang === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587";
      langBtn.addEventListener("click", function () {
        setLanguage(currentLang === "zh" ? "en" : "zh");
      });
    }
  }

  return {
    init: init,
    t: t,
    setLanguage: setLanguage,
    apply: applyTranslations,
    detectLanguage: detectLanguage,
    getCurrentLang: function () { return currentLang; },
  };
})();

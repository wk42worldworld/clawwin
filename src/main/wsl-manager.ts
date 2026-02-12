/**
 * WSL Manager - Manages WSL2 lifecycle for OpenClaw Desktop
 *
 * Responsibilities:
 * - Detect WSL2 availability and status
 * - Enable WSL2 features (requires admin)
 * - Import pre-built OpenClaw Linux image
 * - Start/stop OpenClaw gateway inside WSL2
 * - Health monitoring and auto-restart
 * - Execute commands inside WSL2 distro
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as http from 'http';
import * as os from 'os';
import log from 'electron-log';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export type WSLStatus =
  | 'not_installed'      // WSL2 features not enabled
  | 'no_distro'          // WSL2 enabled but OpenClaw distro not imported
  | 'stopped'            // Distro exists but not running
  | 'starting'           // Gateway is starting up
  | 'running'            // Gateway running and healthy
  | 'error';             // Something went wrong

export interface WSLCheckResult {
  wslEnabled: boolean;
  vmPlatformEnabled: boolean;
  distroExists: boolean;
  distroRunning: boolean;
  gatewayHealthy: boolean;
  wslVersion: string;
  errorMessage?: string;
}

export interface GatewayInfo {
  port: number;
  pid?: number;
  uptime?: number;
  version?: string;
}

export interface SkillInfo {
  name: string;
  icon: string;
  description: string;
  ready: boolean;
  source: string;
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  } | null;
  install: Array<{
    id: string;
    kind: string;
    label: string;
    bins: string[];
  }>;
  homepage: string;
}

export class WSLManager extends EventEmitter {
  private readonly DISTRO_NAME = 'OpenClaw';
  private readonly GATEWAY_PORT = 18789;
  private readonly GATEWAY_TOKEN = 'openclaw-desktop-local';
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10s
  private readonly STARTUP_TIMEOUT = 180000; // 180s (3 minutes - first-time gateway startup can take 2+ minutes)

  // Where bundled resources live (image/, scripts/) — set to process.resourcesPath in production
  private resourcesDir: string;
  // Where user data lives (wsl/ distro storage) — LOCALAPPDATA
  private dataDir: string;
  private serviceInstalled = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private _status: WSLStatus = 'stopped';
  private proxyServer: net.Server | null = null;
  private cachedWSLIP: string = '';
  private systemdAvailable: boolean | null = null;
  private gatewayProcess: any = null; // Child process for non-systemd mode

  constructor(resourcesDir: string, dataDir?: string) {
    super();
    this.resourcesDir = resourcesDir;
    this.dataDir = dataDir || path.join(
      process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local',
      'OpenClaw Desktop'
    );
  }

  get status(): WSLStatus {
    return this._status;
  }

  private setStatus(status: WSLStatus): void {
    if (this._status !== status) {
      const oldStatus = this._status;
      this._status = status;
      log.info(`WSL status changed: ${oldStatus} -> ${status}`);
      this.emit('status-changed', status, oldStatus);
    }
  }

  // ─── Detection & Checks ──────────────────────────────────────

  /**
   * Run a full environment check
   */
  async checkEnvironment(): Promise<WSLCheckResult> {
    const result: WSLCheckResult = {
      wslEnabled: false,
      vmPlatformEnabled: false,
      distroExists: false,
      distroRunning: false,
      gatewayHealthy: false,
      wslVersion: '',
    };

    try {
      // Check WSL features
      const features = await this.checkWindowsFeatures();
      result.wslEnabled = features.wsl;
      result.vmPlatformEnabled = features.vmPlatform;

      if (!result.wslEnabled || !result.vmPlatformEnabled) {
        return result;
      }

      // Get WSL version
      try {
        const { stdout } = await this.runWslCommand(['--version']);
        const versionMatch = stdout.match(/[\d.]+/);
        result.wslVersion = versionMatch ? versionMatch[0] : 'unknown';
      } catch {
        result.wslVersion = 'unknown';
      }

      // Check if distro exists
      const distros = await this.listDistros();
      result.distroExists = distros.some(
        (d) => d.name === this.DISTRO_NAME
      );

      if (!result.distroExists) {
        return result;
      }

      // Check if distro is running
      const runningDistro = distros.find(
        (d) => d.name === this.DISTRO_NAME
      );
      result.distroRunning = runningDistro?.state === 'Running';

      // Check gateway health
      if (result.distroRunning) {
        result.gatewayHealthy = await this.checkGatewayHealth();
      }
    } catch (err: any) {
      result.errorMessage = err.message;
      log.error('Environment check failed:', err);
    }

    return result;
  }

  /**
   * Check if required Windows features are enabled
   */
  private async checkWindowsFeatures(): Promise<{
    wsl: boolean;
    vmPlatform: boolean;
  }> {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `$wsl = (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State;` +
        `$vm = (Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform).State;` +
        `Write-Output "$wsl|$vm"`,
      ]);
      const parts = stdout.trim().split('|');
      return {
        wsl: parts[0] === 'Enabled',
        vmPlatform: parts[1] === 'Enabled',
      };
    } catch (err) {
      log.error('Failed to check Windows features:', err);
      return { wsl: false, vmPlatform: false };
    }
  }

  /**
   * List all WSL distros with their status
   */
  private async listDistros(): Promise<
    Array<{ name: string; state: string; version: number; default: boolean }>
  > {
    try {
      const { stdout } = await this.runWslCommand(['-l', '-v']);
      const lines = stdout
        .replace(/\0/g, '')  // Remove null bytes (UTF-16 encoding artifacts)
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .slice(1); // Skip header

      return lines.map((line) => {
        const isDefault = line.startsWith('*');
        const cleaned = line.replace('*', ' ').trim();
        // Parse: NAME    STATE    VERSION
        const parts = cleaned.split(/\s{2,}/);
        return {
          name: (parts[0] || '').trim(),
          state: (parts[1] || '').trim(),
          version: parseInt(parts[2] || '0', 10),
          default: isDefault,
        };
      });
    } catch {
      return [];
    }
  }

  // ─── WSL2 Setup (Offline) ────────────────────────────────────

  /**
   * Enable WSL2 features (requires admin elevation)
   * Returns true if a restart is needed
   */
  async enableWSLFeatures(): Promise<{ success: boolean; needsRestart: boolean }> {
    log.info('Enabling WSL2 features...');

    try {
      const scriptPath = path.join(this.resourcesDir, 'scripts', 'enable-wsl.ps1');
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ]);

      const needsRestart = stdout.includes('RESTART_REQUIRED');
      log.info(`WSL features enabled. Restart needed: ${needsRestart}`);
      return { success: true, needsRestart };
    } catch (err: any) {
      // PowerShell script exits with code 1 when restart is needed,
      // which causes execFileAsync to throw. Check stdout for the marker.
      if (err.stdout && err.stdout.includes('RESTART_REQUIRED')) {
        log.info('WSL features enabled but restart is required');
        return { success: true, needsRestart: true };
      }
      log.error('Failed to enable WSL features:', err);
      return { success: false, needsRestart: false };
    }
  }

  /**
   * Install WSL2 fully offline.
   * Uses PowerShell to enable Windows features + bundled kernel MSI.
   * Does NOT call `wsl --install` (which triggers Microsoft Store download).
   * Returns whether a restart is needed.
   */
  async installWSLComplete(): Promise<{ success: boolean; needsRestart: boolean }> {
    log.info('Installing WSL2 (offline mode)...');

    // Check if features are already enabled
    const features = await this.checkWindowsFeatures();
    if (features.wsl && features.vmPlatform) {
      log.info('WSL2 features already enabled');
      // Install kernel MSI just in case
      await this.installWSLKernel();
      await this.setDefaultVersion();
      return { success: true, needsRestart: false };
    }

    // Enable WSL + VirtualMachinePlatform via PowerShell (offline, built into Windows)
    const featureResult = await this.enableWSLFeatures();
    if (!featureResult.success) {
      return { success: false, needsRestart: false };
    }

    if (featureResult.needsRestart) {
      return { success: true, needsRestart: true };
    }

    // Features enabled without restart — install kernel from bundled MSI
    const kernelInstalled = await this.installWSLKernel();
    if (!kernelInstalled) {
      log.warn('WSL kernel install failed/skipped — may already be present');
    }

    await this.setDefaultVersion();
    return { success: true, needsRestart: false };
  }

  /**
   * Install WSL2 kernel from bundled MSI (offline)
   */
  async installWSLKernel(): Promise<boolean> {
    log.info('Installing WSL2 kernel update...');

    const msiPath = path.join(this.resourcesDir, 'wsl_kernel', 'wsl_update_x64.msi');
    if (!fs.existsSync(msiPath)) {
      log.error('WSL kernel MSI not found at:', msiPath);
      return false;
    }

    try {
      await execFileAsync('msiexec.exe', [
        '/i', msiPath,
        '/quiet', '/norestart',
      ]);
      log.info('WSL kernel installed successfully');
      return true;
    } catch (err: any) {
      log.error('Failed to install WSL kernel:', err);
      return false;
    }
  }

  /**
   * Set WSL default version to 2
   */
  async setDefaultVersion(): Promise<boolean> {
    try {
      await this.runWslCommand(['--set-default-version', '2']);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Distro Management ───────────────────────────────────────

  /**
   * Import pre-built OpenClaw image (offline).
   * Looks for openclaw.tar.gz first, then openclaw.tar.
   */
  async importDistro(imagePath?: string): Promise<boolean> {
    let tarPath = imagePath || '';
    if (!tarPath) {
      // Try compressed first, then uncompressed
      const gzPath = path.join(this.resourcesDir, 'image', 'openclaw.tar.gz');
      const plainPath = path.join(this.resourcesDir, 'image', 'openclaw.tar');
      if (fs.existsSync(gzPath)) {
        tarPath = gzPath;
      } else if (fs.existsSync(plainPath)) {
        tarPath = plainPath;
      } else {
        tarPath = gzPath; // Will fail below with a clear error
      }
    }
    const wslDir = path.join(this.dataDir, 'wsl');

    if (!fs.existsSync(tarPath)) {
      log.error('Image file not found:', tarPath);
      this.emit('import-error', `Image not found: ${tarPath}`);
      return false;
    }

    // Create WSL install directory
    if (!fs.existsSync(wslDir)) {
      fs.mkdirSync(wslDir, { recursive: true });
    }

    // Check if distro already exists
    const distros = await this.listDistros();
    if (distros.some((d) => d.name === this.DISTRO_NAME)) {
      log.warn('Distro already exists, skipping import');
      return true;
    }

    log.info(`Importing distro from ${tarPath} to ${wslDir}...`);
    this.emit('import-progress', 'Importing Linux image...');

    try {
      // Use shell exec with quoted paths to handle spaces in paths
      // (wsl.exe --import has known issues with spaces when using execFile array args)
      const cmd = `wsl.exe --import "${this.DISTRO_NAME}" "${wslDir}" "${tarPath}"`;
      log.info('Import command:', cmd);
      await execAsync(cmd, { timeout: 600000, windowsHide: true });
      log.info('Distro imported successfully');
      this.emit('import-progress', 'Import complete');

      // Clean up stale state from the pre-built image
      await this.cleanupAfterImport();

      return true;
    } catch (err: any) {
      log.error('Failed to import distro:', err);
      this.emit('import-error', err.message);
      return false;
    }
  }

  /**
   * Clean up stale state from pre-built image after import.
   * - Remove baked-in API keys (new user will set their own in wizard Step 4)
   * - Remove stale PID/lock files
   * - Reset systemd service state so it starts cleanly
   */
  private async cleanupAfterImport(): Promise<void> {
    log.info('Cleaning up stale state from imported image...');
    this.emit('import-progress', 'Cleaning up image...');

    const cleanupCommands = [
      // Remove any baked-in API keys from the image builder's environment
      'rm -f ~/.openclaw/env',
      // Remove systemd service override (env file reference) - will be recreated
      'rm -rf ~/.config/systemd/user/openclaw-gateway.service.d',
      // Remove stale PID/lock files (typically in tmpfs but just in case)
      'rm -f /tmp/openclaw-gateway.pid /var/run/openclaw*.pid',
      // Reset systemd user service state
      'systemctl --user daemon-reload 2>/dev/null || true',
      'systemctl --user reset-failed openclaw-gateway.service 2>/dev/null || true',
    ];

    for (const cmd of cleanupCommands) {
      try {
        await this.execInDistro(cmd, { timeout: 10000 });
      } catch {
        // Non-fatal - some commands may fail on fresh import (systemd not started yet)
      }
    }

    log.info('Post-import cleanup complete');
    this.emit('import-progress', 'Cleanup complete');
  }

  /**
   * Unregister (remove) the OpenClaw distro
   */
  async removeDistro(): Promise<boolean> {
    try {
      await this.runWslCommand(['--unregister', this.DISTRO_NAME]);
      log.info('Distro removed');
      return true;
    } catch {
      return false;
    }
  }

  // ─── Gateway Lifecycle ───────────────────────────────────────

  /**
   * Ensure gateway config (mode + token) is set before first start
   */
  private async ensureGatewayConfig(): Promise<void> {
    try {
      await this.execInDistro('openclaw config set gateway.mode local');
      await this.execInDistro('openclaw config set gateway.bind lan');
      await this.execInDistro(
        `openclaw config set gateway.auth.token ${this.GATEWAY_TOKEN}`
      );
      // Allow Electron file:// origin and any other origin for the desktop app
      // Electron file:// pages send Origin: null, so we must explicitly allow "null"
      await this.execInDistro(
        `openclaw config set gateway.controlUi.allowedOrigins '["*", "null", "file://"]'`
      );
      // Configure workspace to access Windows Desktop via WSL2 mount
      await this.configureDesktopWorkspace();
    } catch (err) {
      log.warn('Failed to set gateway config defaults:', err);
    }
  }

  /**
   * Pre-warm WSL2 distro to avoid cold-boot delays.
   * Cold boot takes ~15-20s; warm boot is instant.
   */
  private async warmupWSL(): Promise<void> {
    log.info('Pre-warming WSL2 distro...');
    try {
      await this.execInDistro('echo READY', { timeout: 60000 });
      log.info('WSL2 distro is warm');
    } catch (err) {
      log.warn('WSL warmup failed:', err);
    }
  }

  /**
   * Check if systemd is available and working in WSL
   */
  private async checkSystemdAvailable(): Promise<boolean> {
    if (this.systemdAvailable !== null) {
      return this.systemdAvailable;
    }

    try {
      const { stdout } = await this.execInDistro('systemctl --user is-system-running 2>&1', { timeout: 10000 });
      // If systemd is available, it will return status like "running", "degraded", etc.
      // If not available, it will error with "Failed to connect to bus"
      this.systemdAvailable = !stdout.includes('Failed to connect to bus');
      log.info(`Systemd availability check: ${this.systemdAvailable ? 'available' : 'not available'}`);
      return this.systemdAvailable;
    } catch (err) {
      log.warn('Systemd not available, will use direct gateway run mode');
      this.systemdAvailable = false;
      return false;
    }
  }

  /**
   * Install the gateway as a systemd service (idempotent).
   * Creates ~/.config/systemd/user/openclaw-gateway.service
   */
  private async installGatewayService(): Promise<boolean> {
    if (this.serviceInstalled) return true;

    log.info('Installing gateway systemd service...');
    try {
      await this.execInDistro(
        `openclaw gateway install --port ${this.GATEWAY_PORT} --bind lan --token ${this.GATEWAY_TOKEN}`,
        { timeout: 30000 }
      );
      this.serviceInstalled = true;
      log.info('Gateway systemd service installed');
      return true;
    } catch (err) {
      log.warn('Failed to install gateway service:', err);
      return false;
    }
  }

  /**
   * Get the WSL2 VM's IP address
   */
  private async getWSLIP(): Promise<string> {
    try {
      const { stdout } = await this.execInDistro('hostname -I');
      const ip = stdout.trim().split(/\s+/)[0];
      if (ip) return ip;
    } catch { /* fall through */ }
    return '127.0.0.1';
  }

  /**
   * Set up Windows port forwarding: 127.0.0.1:port -> WSL2_IP:port
   * Uses a Node.js TCP proxy in the main process, which does NOT require admin.
   * Falls back to netsh portproxy if the TCP proxy cannot bind (e.g. port conflict).
   */
  private async setupPortProxy(): Promise<void> {
    const wslIP = await this.getWSLIP();
    this.cachedWSLIP = wslIP;
    log.info(`WSL2 IP resolved to: ${wslIP}`);

    // First try: Node.js TCP proxy (no admin needed)
    const proxyStarted = await this.startLocalProxy(wslIP);
    if (proxyStarted) {
      return;
    }

    // Fallback: netsh portproxy (needs admin, may fail silently)
    log.info(`Falling back to netsh portproxy: 127.0.0.1:${this.GATEWAY_PORT} -> ${wslIP}:${this.GATEWAY_PORT}`);
    try {
      // Remove old rule
      await execFileAsync('netsh', [
        'interface', 'portproxy', 'delete', 'v4tov4',
        `listenport=${this.GATEWAY_PORT}`, 'listenaddress=127.0.0.1',
      ], { windowsHide: true }).catch(() => {});
      // Add new rule
      await execFileAsync('netsh', [
        'interface', 'portproxy', 'add', 'v4tov4',
        `listenport=${this.GATEWAY_PORT}`, 'listenaddress=127.0.0.1',
        `connectport=${this.GATEWAY_PORT}`, `connectaddress=${wslIP}`,
      ], { windowsHide: true });
      log.info('Port proxy configured successfully via netsh');
    } catch (err) {
      log.warn('Failed to set up port proxy via netsh (may need admin):', err);
    }
  }

  /**
   * Start a Node.js TCP proxy on 127.0.0.1:GATEWAY_PORT that forwards
   * all connections to WSL2_IP:GATEWAY_PORT. This runs entirely in user space
   * and does not require administrator privileges.
   */
  private async startLocalProxy(wslIP: string): Promise<boolean> {
    await this.stopLocalProxy();

    return new Promise((resolve) => {
      const server = net.createServer((clientSocket) => {
        const targetSocket = net.connect(
          { host: wslIP, port: this.GATEWAY_PORT },
          () => {
            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);
          }
        );

        targetSocket.on('error', (err) => {
          log.debug(`Proxy target connection error: ${err.message}`);
          clientSocket.destroy();
        });

        clientSocket.on('error', () => {
          targetSocket.destroy();
        });

        clientSocket.on('close', () => targetSocket.destroy());
        targetSocket.on('close', () => clientSocket.destroy());
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          log.warn(`Port ${this.GATEWAY_PORT} already in use, TCP proxy cannot bind`);
        } else {
          log.error('TCP proxy server error:', err);
        }
        resolve(false);
      });

      server.listen(this.GATEWAY_PORT, '127.0.0.1', () => {
        log.info(`Local TCP proxy listening on 127.0.0.1:${this.GATEWAY_PORT} -> ${wslIP}:${this.GATEWAY_PORT}`);
        this.proxyServer = server;
        resolve(true);
      });
    });
  }

  /**
   * Stop the local TCP proxy server if running.
   */
  private async stopLocalProxy(): Promise<void> {
    if (!this.proxyServer) return;
    return new Promise((resolve) => {
      this.proxyServer!.close(() => {
        this.proxyServer = null;
        log.info('Local TCP proxy stopped');
        resolve();
      });
      // Destroy all existing connections immediately
      this.proxyServer!.unref();
    });
  }

  /**
   * Check gateway reachability from the Windows side (through the proxy/port forwarding).
   * This verifies the full connection path that the renderer's WebSocket will use.
   */
  async checkWindowsSideConnectivity(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.GATEWAY_PORT}/`,
        { timeout: 5000 },
        (res) => {
          res.resume(); // Drain response
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // ─── Model Provider Configuration ──────────────────────────

  /**
   * Read the current AI model configuration from inside WSL2.
   * Returns the provider, model, and whether an API key env var is set.
   */
  async getModelConfig(): Promise<{
    provider: string;
    model: string;
    hasApiKey: boolean;
  }> {
    const defaults = { provider: '', model: '', hasApiKey: false };
    try {
      // Read the current model
      const { stdout: modelOut } = await this.execInDistro(
        'openclaw config get agents.defaults.model.primary',
        { timeout: 10000 }
      );
      const model = modelOut.trim();
      const provider = model.includes('/') ? model.split('/')[0] : model;

      // Check if an API key env var is set in the env file
      let hasApiKey = false;
      try {
        const { stdout: envOut } = await this.execInDistro(
          'cat ~/.openclaw/env 2>/dev/null || echo ""',
          { timeout: 5000 }
        );
        hasApiKey = envOut.trim().length > 0 && envOut.includes('_API_KEY=');
      } catch {}

      return { provider, model, hasApiKey };
    } catch {
      return defaults;
    }
  }

  /**
   * Map of provider -> environment variable name for the API key.
   */
  private static readonly PROVIDER_ENV_VARS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    'kimi-coding': 'KIMI_API_KEY',
    google: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    zai: 'ZAI_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    qianfan: 'QIANFAN_API_KEY',
    groq: 'GROQ_API_KEY',
    ollama: 'OLLAMA_API_KEY',
    xai: 'XAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
  };

  /**
   * Configure the AI model provider, API key, and default model.
   * 1. Sets the environment variable for the API key in the systemd service
   * 2. Sets the default model via `openclaw config set`
   * 3. Restarts the gateway to pick up changes
   */
  async configureModelProvider(config: {
    provider: string;
    apiKey: string;
    model: string;
  }): Promise<boolean> {
    log.info(`Configuring model provider: ${config.provider}, model: ${config.model}`);

    try {
      const envVar = WSLManager.PROVIDER_ENV_VARS[config.provider] || `${config.provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;

      // Write API key to environment file that systemd service reads
      if (config.apiKey) {
        // Remove existing entry for this var, then append the new one
        await this.execInDistro(
          `mkdir -p ~/.openclaw && touch ~/.openclaw/env && sed -i '/^${envVar}=/d' ~/.openclaw/env && echo '${envVar}=${config.apiKey}' >> ~/.openclaw/env`,
          { timeout: 10000 }
        );

        // Ensure the systemd service loads this env file
        await this.execInDistro(
          `mkdir -p ~/.config/systemd/user/openclaw-gateway.service.d && printf '[Service]\\nEnvironmentFile=-/root/.openclaw/env\\n' > ~/.config/systemd/user/openclaw-gateway.service.d/env.conf && systemctl --user daemon-reload`,
          { timeout: 15000 }
        );
      }

      // Set the default model
      await this.execInDistro(
        `openclaw config set agents.defaults.model.primary ${config.model}`,
        { timeout: 10000 }
      );

      log.info('Model provider configured successfully');

      // Restart gateway if running to pick up new config
      if (this._status === 'running') {
        log.info('Restarting gateway to apply model configuration...');
        await this.restartGateway();
      }

      return true;
    } catch (err: any) {
      log.error('Failed to configure model provider:', err);
      return false;
    }
  }

  /**
   * Start OpenClaw gateway inside WSL2 via systemd service or direct run.
   *
   * Flow:
   * 1. Pre-warm WSL2 (avoid cold-boot timeout)
   * 2. Set config (mode + token)
   * 3. Check systemd availability
   * 4. Start via systemd service OR direct run
   * 5. Set up port forwarding (WSL2 localhost forwarding is unreliable)
   * 6. Wait for health check
   * 7. Auto-approve pending local devices
   */
  async startGateway(): Promise<boolean> {
    if (this._status === 'running') {
      log.info('Gateway already running');
      return true;
    }

    this.setStatus('starting');
    log.info('Starting OpenClaw gateway...');

    try {
      // Step 1: Pre-warm WSL to avoid cold-boot delays
      await this.warmupWSL();

      // Step 2: Ensure gateway config
      await this.ensureGatewayConfig();

      // Step 3: Check systemd availability
      const systemdAvailable = await this.checkSystemdAvailable();

      // Step 4: Start the gateway
      if (systemdAvailable) {
        // Systemd mode: install and start service
        await this.installGatewayService();
        log.info('Starting gateway service via systemd...');
        await this.execInDistro('openclaw gateway start', { timeout: 60000 });
      } else {
        // Direct run mode: spawn gateway as background process
        log.info('Starting gateway in direct run mode (systemd not available)...');
        await this.startGatewayDirect();
      }

      // Step 5: Set up port forwarding (TCP proxy or netsh fallback)
      await this.setupPortProxy();

      // Step 6: Wait for gateway to become healthy (from inside WSL)
      const healthy = await this.waitForHealthy(this.STARTUP_TIMEOUT);
      if (healthy) {
        // Step 6b: Verify Windows-side connectivity (through proxy/port forwarding)
        const reachable = await this.checkWindowsSideConnectivity();
        if (!reachable) {
          log.warn('Gateway healthy inside WSL but NOT reachable from Windows — port forwarding may have failed');
          this.emit('gateway-error', 'Gateway is running but not reachable from Windows. Try running the app as administrator.');
        }

        this.setStatus('running');
        this.startHealthChecks();
        // Step 7: Auto-approve pending local devices (non-blocking)
        this.autoApproveLocalDevices();
        return true;
      } else {
        this.setStatus('error');
        this.emit('gateway-error', 'Gateway failed to start within timeout');
        return false;
      }
    } catch (err: any) {
      log.error('Failed to start gateway:', err);
      this.setStatus('error');
      return false;
    }
  }

  /**
   * Start gateway directly without systemd (for older WSL versions).
   * Runs `openclaw gateway run` as a background process.
   */
  private async startGatewayDirect(): Promise<void> {
    // Kill any existing gateway process first
    try {
      await this.execInDistro('pkill -f "openclaw gateway" || true', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 2000)); // Wait for process to die
    } catch {}

    // Start gateway as background process using nohup with --allow-unconfigured flag
    const command = `nohup openclaw gateway run --port ${this.GATEWAY_PORT} --bind lan --token ${this.GATEWAY_TOKEN} --allow-unconfigured > ~/.openclaw/gateway.log 2>&1 &`;

    try {
      await this.execInDistro(command, { timeout: 10000 });
      log.info('Gateway process started in background');
      // Give it more time to start
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      log.error('Failed to start gateway in direct mode:', err);
      throw err;
    }
  }

  /**
   * Stop the OpenClaw gateway service or process
   */
  async stopGateway(): Promise<void> {
    log.info('Stopping OpenClaw gateway...');
    this.stopHealthChecks();
    await this.stopLocalProxy();

    try {
      if (this.systemdAvailable) {
        // Stop systemd service
        await this.execInDistro('openclaw gateway stop', { timeout: 30000 });
      } else {
        // Kill direct run process
        await this.execInDistro('pkill -f "openclaw gateway run" || true', { timeout: 10000 });
      }
    } catch (err) {
      log.warn('Failed to stop gateway:', err);
    }

    this.gatewayProcess = null;
    this.setStatus('stopped');
  }

  /**
   * Restart the gateway service or process
   */
  async restartGateway(): Promise<boolean> {
    log.info('Restarting OpenClaw gateway...');
    this.stopHealthChecks();
    await this.stopLocalProxy();

    try {
      if (this.systemdAvailable) {
        // Restart systemd service
        await this.execInDistro('openclaw gateway restart', { timeout: 60000 });
      } else {
        // Stop and start direct run process
        await this.execInDistro('pkill -f "openclaw gateway run" || true', { timeout: 10000 });
        await new Promise(r => setTimeout(r, 1000));
        await this.startGatewayDirect();
      }

      // Re-establish port forwarding (WSL IP may have changed)
      await this.setupPortProxy();
      const healthy = await this.waitForHealthy(this.STARTUP_TIMEOUT);
      if (healthy) {
        this.setStatus('running');
        this.startHealthChecks();
        return true;
      }
    } catch (err) {
      log.warn('Restart command failed, falling back to stop+start:', err);
    }

    // Fallback: stop + start
    await this.stopGateway();
    return this.startGateway();
  }

  // ─── Health Monitoring ───────────────────────────────────────

  /**
   * Check if gateway is responding.
   * Runs the check from inside WSL2 to avoid unreliable Windows ↔ WSL2 networking.
   */
  async checkGatewayHealth(): Promise<boolean> {
    try {
      const { stdout } = await this.execInDistro(
        `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${this.GATEWAY_PORT}/`,
        { timeout: 10000 }
      );
      const code = parseInt(stdout.trim(), 10);
      return code >= 200 && code < 400;
    } catch {
      return false;
    }
  }

  /**
   * Wait for gateway to become healthy
   */
  private async waitForHealthy(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkGatewayHealth()) {
        return true;
      }
      await new Promise((r) => setTimeout(r, checkInterval));
    }

    return false;
  }

  private startHealthChecks(): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.checkGatewayHealth();
      if (!healthy && this._status === 'running') {
        log.warn('Gateway health check failed, attempting restart...');
        this.emit('gateway-unhealthy');
        this.setStatus('error');
        // Auto-restart
        setTimeout(() => this.restartGateway(), 3000);
      }
      // Auto-approve pending local devices on each health cycle
      if (this._status === 'running') {
        this.approveAllPendingDevices();
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ─── Auto-approve Local Devices ────────────────────────────

  /**
   * Approve all pending device pairing requests.
   * Since this is a local desktop app, all devices connecting through
   * the gateway token are trusted. This eliminates manual CLI approval.
   */
  private async approveAllPendingDevices(): Promise<void> {
    try {
      const { stdout } = await this.execInDistro(
        'cat ~/.openclaw/devices/pending.json',
        { timeout: 10000 }
      );
      const pending = JSON.parse(stdout.trim() || '{}');
      const requestIds = Object.keys(pending);
      if (requestIds.length === 0) return;

      for (const requestId of requestIds) {
        const device = pending[requestId];
        log.info(`Auto-approving device: ${device.clientId || 'unknown'} (${device.remoteIp || 'no-ip'})`);
        try {
          await this.execInDistro(
            `openclaw devices approve ${requestId}`,
            { timeout: 15000 }
          );
          log.info(`Device approved: ${requestId}`);
        } catch (err: any) {
          log.warn(`Failed to approve device ${requestId}:`, err.message);
        }
      }
    } catch {
      // pending.json may not exist yet or be empty — not an error
    }
  }

  /**
   * Kick off auto-approve immediately after gateway start, then
   * the health check loop continues approving on each cycle.
   */
  private autoApproveLocalDevices(): void {
    // Run a few early checks to catch the first browser connection quickly
    const delays = [0, 2000, 5000];
    for (const delay of delays) {
      setTimeout(() => {
        if (this._status === 'running') {
          this.approveAllPendingDevices();
        }
      }, delay);
    }
  }

  // ─── Command Execution ───────────────────────────────────────

  /**
   * Execute a command inside the OpenClaw WSL2 distro
   */
  async execInDistro(
    command: string,
    options?: { timeout?: number; user?: string }
  ): Promise<{ stdout: string; stderr: string }> {
    const args = ['-d', this.DISTRO_NAME];

    if (options?.user) {
      args.push('-u', options.user);
    }

    args.push('--', 'bash', '-lc', command);

    const { stdout, stderr } = await execFileAsync('wsl.exe', args, {
      timeout: options?.timeout || 30000,
      windowsHide: true,
    });

    return { stdout, stderr };
  }

  /**
   * Run a wsl.exe command
   */
  private async runWslCommand(
    args: string[],
    options?: { timeout?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('wsl.exe', args, {
      timeout: options?.timeout || 30000,
      windowsHide: true,
      encoding: 'utf16le' as BufferEncoding,
    });
    return { stdout, stderr };
  }

  // ─── Configuration ──────────────────────────────────────────

  /**
   * Configure OpenClaw inside WSL2 (API keys, model, etc.)
   */
  async configureOpenClaw(config: {
    provider: string;
    apiKey: string;
    model?: string;
  }): Promise<boolean> {
    try {
      // Use openclaw config set for each setting
      await this.execInDistro('openclaw setup');
      await this.execInDistro(
        `openclaw config set ai.provider ${config.provider}`
      );
      await this.execInDistro(
        `openclaw config set ai.apiKey ${config.apiKey}`
      );
      if (config.model) {
        await this.execInDistro(
          `openclaw config set ai.model ${config.model}`
        );
      }
      // Ensure gateway defaults
      await this.ensureGatewayConfig();

      log.info('OpenClaw configured successfully');
      return true;
    } catch (err: any) {
      log.error('Failed to configure OpenClaw:', err);
      return false;
    }
  }

  /**
   * Convert a Windows path to its WSL2 mount equivalent.
   * e.g. C:\Users\wangkai\Desktop -> /mnt/c/Users/wangkai/Desktop
   */
  private windowsPathToWSL(winPath: string): string {
    // Handle drive letter: C:\... -> /mnt/c/...
    const normalized = winPath.replace(/\\/g, '/');
    const match = normalized.match(/^([A-Za-z]):\/(.*)/);
    if (match) {
      return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
    }
    return normalized;
  }

  /**
   * Configure workspace to point to the Windows user home directory via WSL2 mount.
   * Using the home directory (e.g. /mnt/c/Users/wangkai) gives the AI agent access
   * to Desktop, Documents, Downloads, etc. without polluting the Desktop directly.
   * Called automatically during gateway startup.
   */
  private async configureDesktopWorkspace(): Promise<void> {
    try {
      const homePath = os.homedir();
      const wslPath = this.windowsPathToWSL(homePath);
      log.info(`Configuring workspace to Windows home: ${wslPath}`);
      await this.execInDistro(
        `openclaw config set agents.defaults.workspace '${wslPath}'`
      );
      log.info('Workspace configured');
    } catch (err) {
      log.warn('Failed to configure workspace:', err);
    }
  }

  /**
   * Configure OpenClaw workspace to a specific Windows path.
   * Converts the Windows path to WSL mount path automatically.
   */
  async configureWorkspace(windowsPath?: string): Promise<boolean> {
    try {
      const targetPath = windowsPath || os.homedir();
      const wslPath = this.windowsPathToWSL(targetPath);
      log.info(`Configuring workspace to: ${wslPath}`);
      await this.execInDistro(
        `openclaw config set agents.defaults.workspace '${wslPath}'`
      );
      return true;
    } catch (err: any) {
      log.error('Failed to configure workspace:', err);
      return false;
    }
  }

  /**
   * Get gateway info
   */
  async getGatewayInfo(): Promise<GatewayInfo | null> {
    try {
      const { stdout } = await this.execInDistro(
        `curl -s http://127.0.0.1:${this.GATEWAY_PORT}/`,
        { timeout: 10000 }
      );
      const data = JSON.parse(stdout.trim());
      return {
        port: this.GATEWAY_PORT,
        ...data,
      };
    } catch {
      // Gateway not responding or returned non-JSON
    }
    return null;
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  /**
   * Full shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.stopHealthChecks();
    await this.stopLocalProxy();
    await this.stopGateway();
    // Terminate WSL distro
    try {
      await this.runWslCommand(['--terminate', this.DISTRO_NAME]);
    } catch {
      // Ignore errors during shutdown
    }
  }

  /**
   * Get the gateway web UI URL
   */
  getWebUIUrl(): string {
    return `http://127.0.0.1:${this.GATEWAY_PORT}/?token=${this.GATEWAY_TOKEN}`;
  }

  // ─── Channel Configuration ──────────────────────────────────

  /**
   * Configure a chat channel with credentials and policies.
   * Saves configuration to OpenClaw via WSL commands.
   */
  async configureChannel(config: {
    channel: string;
    token?: string;
    appToken?: string;
    appId?: string;
    appSecret?: string;
    appPassword?: string;
    tenantId?: string;
    account?: string;
    cliPath?: string;
    serviceAccount?: string;
    dmPolicy?: string;
    allowFrom?: string[];
  }): Promise<boolean> {
    try {
      const { channel } = config;
      log.info(`Configuring channel: ${channel}`);

      // Enable the channel
      await this.execInDistro(
        `openclaw config set channels.${channel}.enabled true`,
        { timeout: 10000 }
      );

      // Set DM policy
      if (config.dmPolicy) {
        await this.execInDistro(
          `openclaw config set channels.${channel}.dmPolicy ${config.dmPolicy}`,
          { timeout: 10000 }
        );
      }

      // Set allowFrom list
      if (config.allowFrom && config.allowFrom.length > 0) {
        const allowFromJson = JSON.stringify(config.allowFrom);
        await this.execInDistro(
          `openclaw config set channels.${channel}.allowFrom '${allowFromJson}'`,
          { timeout: 10000 }
        );
      }

      // Platform-specific credential configuration
      switch (channel) {
        case 'telegram':
        case 'discord':
          if (config.token) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.token '${config.token}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'slack':
          if (config.token) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.botToken '${config.token}'`,
              { timeout: 10000 }
            );
          }
          if (config.appToken) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.appToken '${config.appToken}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'feishu':
          if (config.appId && config.appSecret) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.appId '${config.appId}'`,
              { timeout: 10000 }
            );
            await this.execInDistro(
              `openclaw config set channels.${channel}.appSecret '${config.appSecret}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'msteams':
          if (config.appId && config.appPassword && config.tenantId) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.appId '${config.appId}'`,
              { timeout: 10000 }
            );
            await this.execInDistro(
              `openclaw config set channels.${channel}.appPassword '${config.appPassword}'`,
              { timeout: 10000 }
            );
            await this.execInDistro(
              `openclaw config set channels.${channel}.tenantId '${config.tenantId}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'googlechat':
          if (config.serviceAccount) {
            // Escape quotes in JSON
            const escapedJson = config.serviceAccount.replace(/'/g, "'\\''");
            await this.execInDistro(
              `openclaw config set channels.${channel}.serviceAccount '${escapedJson}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'signal':
          if (config.account) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.account '${config.account}'`,
              { timeout: 10000 }
            );
          }
          if (config.cliPath) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.cliPath '${config.cliPath}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'imessage':
          if (config.cliPath) {
            await this.execInDistro(
              `openclaw config set channels.${channel}.cliPath '${config.cliPath}'`,
              { timeout: 10000 }
            );
          }
          break;

        case 'whatsapp':
          // WhatsApp uses QR code authentication, no credentials to save
          log.info('WhatsApp will use QR code authentication on first connection');
          break;

        default:
          log.warn(`Unknown channel: ${channel}, basic config applied`);
      }

      log.info(`Channel ${channel} configured successfully`);
      return true;
    } catch (err: any) {
      log.error(`Failed to configure channel ${config.channel}:`, err);
      throw err;
    }
  }

  /**
   * Get the configuration status for a specific channel.
   */
  async getChannelStatus(channel: string): Promise<any> {
    try {
      const { stdout } = await this.execInDistro(
        `openclaw config get channels.${channel}`,
        { timeout: 10000 }
      );
      const config = JSON.parse(stdout.trim());
      return config;
    } catch (err: any) {
      log.warn(`Failed to get channel status for ${channel}:`, err);
      return null;
    }
  }

  /**
   * List all available skills with their status (ready vs missing).
   */
  private readonly FALLBACK_SKILLS: SkillInfo[] = [
    { name: 'coding-agent', icon: '🧩', description: 'Run Codex CLI, Claude Code, or Pi Coding Agent', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'healthcheck', icon: '📦', description: 'Host security hardening and risk-tolerance configuration', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'skill-creator', icon: '📦', description: 'Create or update AgentSkills', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'tmux', icon: '🧵', description: 'Remote-control tmux sessions', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'weather', icon: '🌤️', description: 'Get current weather and forecasts', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'windows-path', icon: '🪟', description: 'Automatically detect and convert Windows paths to WSL paths', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' }
  ];

  /**
   * Try to extract a JSON array from stdout that may contain MOTD/profile noise before the actual JSON.
   */
  private extractJsonFromOutput(stdout: string): any | null {
    // Try direct parse first
    try {
      return JSON.parse(stdout.trim());
    } catch {
      // ignore
    }

    // Look for the first '[' or '{' — skip MOTD/profile output before JSON
    const arrStart = stdout.indexOf('[');
    const objStart = stdout.indexOf('{');
    const start = arrStart === -1 ? objStart : objStart === -1 ? arrStart : Math.min(arrStart, objStart);

    if (start > 0) {
      try {
        return JSON.parse(stdout.substring(start).trim());
      } catch {
        // ignore
      }
    }

    return null;
  }

  async listSkills(): Promise<SkillInfo[]> {
    try {
      const { stdout } = await this.execInDistro(
        'openclaw skills list --json || openclaw skills list',
        { timeout: 30000 }
      );

      log.info('Skills list output length:', stdout.length);
      log.info('Skills list raw output (first 500 chars):', stdout.substring(0, 500));

      // Try to parse as JSON first (handles MOTD prefix)
      const jsonData = this.extractJsonFromOutput(stdout);
      if (jsonData) {
        // Handle both array format and object-with-skills-property format
        const skillsArray = Array.isArray(jsonData) ? jsonData : Array.isArray(jsonData.skills) ? jsonData.skills : null;
        if (skillsArray && skillsArray.length > 0) {
          log.info('Parsed skills as JSON, count:', skillsArray.length);
          return skillsArray.map((skill: any) => ({
            name: skill.name || skill.skill || '',
            icon: skill.emoji || skill.icon || '📦',
            description: skill.description || '',
            ready: skill.eligible === true || skill.status === 'ready' || skill.ready === true,
            source: skill.source || 'openclaw-bundled',
            missing: skill.missing || null,
            install: Array.isArray(skill.install) ? skill.install : [],
            homepage: skill.homepage || ''
          }));
        }
        log.info('JSON parsed but resulted in empty or invalid skills array');
      }

      // If JSON parsing fails or returns empty, try table format
      log.info('Trying table format parsing');
      const parsed = this.parseSkillsTable(stdout);
      log.info('Parsed skills from table, count:', parsed.length);
      if (parsed.length > 0) {
        return parsed;
      }

      // Both parsers returned empty — use fallback
      log.warn('Both JSON and table parsing returned empty, using fallback skills');
      return [...this.FALLBACK_SKILLS];
    } catch (err: any) {
      log.error('Failed to list skills:', err);
      return [...this.FALLBACK_SKILLS];
    }
  }

  /**
   * Parse skills list from table format output.
   */
  private parseSkillsTable(output: string): SkillInfo[] {
    const skills: Array<any> = [];
    const lines = output.split('\n');
    log.info('Parsing table with', lines.length, 'lines');

    // Log first 10 lines for debugging
    log.info('First 10 lines of output:');
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      log.info(`Line ${i}: "${lines[i]}"`);
      if (i < 3 && lines[i].length > 0) {
        // Log character codes for first 20 chars
        const chars = lines[i].substring(0, 20).split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ');
        log.info(`  Char codes: ${chars}`);
      }
    }

    for (const line of lines) {
      // Try to match lines that contain pipe characters and look like data rows
      // Look for pattern: pipe, status (ready/missing or checkmark/x), pipe, name, pipe, description, pipe, source, pipe

      // First try with Unicode box-drawing characters
      let match = line.match(/│\s*(✓|✗)\s+(ready|missing)\s*│\s*(.+?)\s*│\s*(.+?)\s*│\s*(.+?)\s*│/);

      // If that doesn't work, try with regular pipe character |
      if (!match) {
        match = line.match(/\|\s*(✓|✗|ready|missing)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      }

      // If still no match, try splitting by any pipe-like character
      if (!match && (line.includes('│') || line.includes('|'))) {
        const parts = line.split(/[│|]/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length >= 4) {
          log.info('Trying to parse line with', parts.length, 'parts:', parts);

          // Check if first part is a status indicator
          const firstPart = parts[0];
          const isReady = firstPart.includes('✓') || firstPart.toLowerCase().includes('ready');
          const isMissing = firstPart.includes('✗') || firstPart.toLowerCase().includes('missing');

          if (isReady || isMissing) {
            const nameWithIcon = parts[1];
            const description = parts[2];
            const source = parts[3];

            // Extract icon and name
            const nameMatch = nameWithIcon.trim().match(/^(\S+)\s+(.+)$/);
            const icon = nameMatch ? nameMatch[1] : '📦';
            const name = nameMatch ? nameMatch[2] : nameWithIcon.trim();

            log.info('Parsed skill:', name, 'ready:', isReady);

            skills.push({
              name,
              icon,
              description: description.trim(),
              ready: isReady,
              source: source.trim(),
              missing: null,
              install: [],
              homepage: ''
            });
          }
        }
      } else if (match) {
        const statusSymbol = match[1];
        const ready = statusSymbol === '✓' || statusSymbol.toLowerCase() === 'ready';
        const nameWithIcon = match[2] || match[3];
        const description = match[3] || match[4];
        const source = match[4] || match[5];

        // Extract icon and name (format: "🔐 1password")
        const nameMatch = nameWithIcon.trim().match(/^(\S+)\s+(.+)$/);
        const icon = nameMatch ? nameMatch[1] : '📦';
        const name = nameMatch ? nameMatch[2] : nameWithIcon.trim();

        log.info('Parsed skill:', name, 'ready:', ready);

        skills.push({
          name,
          icon,
          description: description.trim(),
          ready,
          source: source.trim(),
          missing: null,
          install: [],
          homepage: ''
        });
      }
    }

    log.info('Total skills parsed:', skills.length);
    return skills;
  }
}

export default WSLManager;

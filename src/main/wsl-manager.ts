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

import { execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as http from 'http';
import * as os from 'os';
import log from 'electron-log';

const execFileAsync = promisify(execFile);

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

export class WSLManager extends EventEmitter {
  private readonly DISTRO_NAME = 'OpenClaw';
  private readonly GATEWAY_PORT = 18789;
  private readonly GATEWAY_TOKEN = 'openclaw-desktop-local';
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10s
  private readonly STARTUP_TIMEOUT = 30000; // 30s

  // Where bundled resources live (image/, scripts/) — set to process.resourcesPath in production
  private resourcesDir: string;
  // Where user data lives (wsl/ distro storage) — LOCALAPPDATA
  private dataDir: string;
  private serviceInstalled = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private _status: WSLStatus = 'stopped';
  private proxyServer: net.Server | null = null;
  private cachedWSLIP: string = '';

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
      log.error('Failed to enable WSL features:', err);
      return { success: false, needsRestart: false };
    }
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
   * Import pre-built OpenClaw image (offline)
   */
  async importDistro(imagePath?: string): Promise<boolean> {
    const tarPath = imagePath || path.join(this.resourcesDir, 'image', 'openclaw.tar.gz');
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
      await this.runWslCommand(
        ['--import', this.DISTRO_NAME, wslDir, tarPath],
        { timeout: 300000 } // 5 min timeout for large images
      );
      log.info('Distro imported successfully');
      this.emit('import-progress', 'Import complete');
      return true;
    } catch (err: any) {
      log.error('Failed to import distro:', err);
      this.emit('import-error', err.message);
      return false;
    }
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
   * Start OpenClaw gateway inside WSL2 via systemd service.
   *
   * Flow:
   * 1. Pre-warm WSL2 (avoid cold-boot timeout)
   * 2. Set config (mode + token)
   * 3. Install systemd service if needed
   * 4. Start the service
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

      // Step 3: Install systemd service (idempotent)
      await this.installGatewayService();

      // Step 4: Start the service
      log.info('Starting gateway service...');
      await this.execInDistro('openclaw gateway start', { timeout: 15000 });

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
   * Stop the OpenClaw gateway service
   */
  async stopGateway(): Promise<void> {
    log.info('Stopping OpenClaw gateway...');
    this.stopHealthChecks();
    await this.stopLocalProxy();

    try {
      await this.execInDistro('openclaw gateway stop', { timeout: 15000 });
    } catch (err) {
      log.warn('Failed to stop gateway service:', err);
    }

    this.setStatus('stopped');
  }

  /**
   * Restart the gateway service
   */
  async restartGateway(): Promise<boolean> {
    log.info('Restarting OpenClaw gateway...');
    this.stopHealthChecks();
    await this.stopLocalProxy();

    try {
      await this.execInDistro('openclaw gateway restart', { timeout: 15000 });
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
   * Configure workspace to point to the Windows Desktop via WSL2 mount.
   * Called automatically during gateway startup.
   */
  private async configureDesktopWorkspace(): Promise<void> {
    try {
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const wslPath = this.windowsPathToWSL(desktopPath);
      log.info(`Configuring workspace to Windows Desktop: ${wslPath}`);
      await this.execInDistro(
        `openclaw config set agents.defaults.workspace '${wslPath}'`
      );
      log.info('Desktop workspace configured');
    } catch (err) {
      log.warn('Failed to configure desktop workspace:', err);
    }
  }

  /**
   * Configure OpenClaw workspace to a specific Windows path.
   * Converts the Windows path to WSL mount path automatically.
   */
  async configureWorkspace(windowsPath?: string): Promise<boolean> {
    try {
      const targetPath = windowsPath || path.join(os.homedir(), 'Desktop');
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
    return `http://127.0.0.1:${this.GATEWAY_PORT}`;
  }
}

export default WSLManager;

/**
 * NativeManager - Runs OpenClaw directly on Windows (no WSL).
 *
 * Instead of delegating to a WSL2 Linux distro, this manager spawns
 * the openclaw Node.js binary that lives in resources/openclaw_native/.
 * No port forwarding, no VM, no path translation — everything is localhost.
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import log from 'electron-log';
import {
  BackendManager,
  BackendStatus,
  EnvCheckResult,
  GatewayInfo,
  ModelConfig,
  ChannelConfig,
  SkillInfo,
} from './backend-manager';

const execAsync = promisify(exec);

export class NativeManager extends BackendManager {
  private readonly GATEWAY_PORT = 18789;
  private readonly GATEWAY_TOKEN = 'openclaw-desktop-local';
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10s
  private readonly STARTUP_TIMEOUT = 120000; // 120s

  private resourcesDir: string;
  private dataDir: string;
  private openclawDir: string;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private _status: BackendStatus = 'stopped';
  private gatewayProcess: ChildProcess | null = null;

  constructor(resourcesDir: string, dataDir?: string) {
    super();
    this.resourcesDir = resourcesDir;
    this.dataDir = dataDir || path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'OpenClaw Desktop',
    );
    this.openclawDir = path.join(this.resourcesDir, 'openclaw_native');
  }

  get status(): BackendStatus {
    return this._status;
  }

  private setStatus(status: BackendStatus): void {
    if (this._status !== status) {
      const oldStatus = this._status;
      this._status = status;
      log.info(`[NativeManager] status changed: ${oldStatus} -> ${status}`);
      this.emit('status-changed', status, oldStatus);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Resolve the path to the openclaw binary (.cmd on Windows).
   */
  private getOpenclawBin(): string {
    const cmdPath = path.join(
      this.openclawDir, 'node_modules', '.bin',
      process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw',
    );
    return cmdPath;
  }

  /**
   * Check whether the openclaw package is installed locally.
   */
  private isPackageInstalled(): boolean {
    return fs.existsSync(path.join(this.openclawDir, 'node_modules', '.bin'));
  }

  /**
   * Resolve the openclaw data directory (~/.openclaw on Windows).
   */
  private getOpenclawHome(): string {
    return path.join(os.homedir(), '.openclaw');
  }

  /**
   * Resolve the env file path used to persist API keys.
   */
  private getEnvFilePath(): string {
    return path.join(this.getOpenclawHome(), 'env');
  }

  // ─── Command Execution ────────────────────────────────────────

  /**
   * Execute a command in the openclaw_native directory.
   * Commands are run directly on Windows — no WSL indirection.
   */
  async execCommand(
    command: string,
    options?: { timeout?: number },
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options?.timeout || 30000;

    // Inject env vars from the env file so openclaw picks up API keys
    const env = { ...process.env };
    try {
      const envFile = this.getEnvFilePath();
      if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, 'utf-8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
          }
        }
      }
    } catch {
      // Non-fatal — env file may not exist yet
    }

    log.debug(`[NativeManager] exec: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
      cwd: this.openclawDir,
      timeout,
      windowsHide: true,
      env,
    });
    return { stdout, stderr };
  }

  /**
   * Run an openclaw CLI command. Automatically resolves the binary path.
   */
  private async runOpenclawCmd(
    args: string,
    options?: { timeout?: number },
  ): Promise<{ stdout: string; stderr: string }> {
    const bin = this.getOpenclawBin();
    const cmd = `"${bin}" ${args}`;
    return this.execCommand(cmd, options);
  }

  // ─── Environment ──────────────────────────────────────────────

  async checkEnvironment(): Promise<EnvCheckResult> {
    const result: EnvCheckResult = {
      nativeMode: true,
      wslEnabled: false,
      vmPlatformEnabled: false,
      virtualizationEnabled: false,
      distroExists: false,
      distroRunning: false,
      gatewayHealthy: false,
      wslVersion: 'native',
    };

    try {
      // In native mode "distroExists" means the openclaw package is installed
      result.distroExists = this.isPackageInstalled();

      if (!result.distroExists) {
        log.info('[NativeManager] openclaw package not installed');
        return result;
      }

      // distroRunning = gateway process is alive
      result.distroRunning = this.gatewayProcess !== null && this.gatewayProcess.exitCode === null;

      // Check gateway health via HTTP
      result.gatewayHealthy = await this.checkGatewayHealth();
    } catch (err: any) {
      result.errorMessage = err.message;
      log.error('[NativeManager] Environment check failed:', err);
    }

    return result;
  }

  // ─── Installation ─────────────────────────────────────────────

  /**
   * Install the openclaw npm package into the openclaw_native directory.
   * Skips if node_modules already exists.
   */
  async installNative(): Promise<boolean> {
    if (this.isPackageInstalled()) {
      log.info('[NativeManager] openclaw package already installed');
      return true;
    }

    log.info('[NativeManager] Installing openclaw package...');
    this.emit('install-progress', 'Installing openclaw...');

    try {
      // Ensure the directory exists
      fs.mkdirSync(this.openclawDir, { recursive: true });

      // Initialize a minimal package.json if missing
      const pkgJsonPath = path.join(this.openclawDir, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'openclaw-native', private: true }, null, 2));
      }

      await this.execCommand('npm install openclaw', { timeout: 300000 });

      const installed = this.isPackageInstalled();
      if (installed) {
        log.info('[NativeManager] openclaw package installed successfully');
        this.emit('install-progress', 'Installation complete');
      } else {
        log.error('[NativeManager] npm install succeeded but binary not found');
        this.emit('install-progress', 'Installation failed — binary not found');
      }
      return installed;
    } catch (err: any) {
      log.error('[NativeManager] Failed to install openclaw:', err);
      this.emit('install-error', err.message);
      return false;
    }
  }

  // ─── Gateway Lifecycle ────────────────────────────────────────

  /**
   * Ensure gateway config defaults are set before first start.
   */
  private async ensureGatewayConfig(): Promise<void> {
    try {
      await this.runOpenclawCmd('config set gateway.mode local');
      await this.runOpenclawCmd('config set gateway.bind lan');
      await this.runOpenclawCmd(`config set gateway.auth.token ${this.GATEWAY_TOKEN}`);
      await this.runOpenclawCmd(
        `config set gateway.controlUi.allowedOrigins '["*", "null", "file://"]'`,
      );
      // Set workspace to the Windows user home directory
      const homePath = os.homedir();
      await this.runOpenclawCmd(`config set agents.defaults.workspace "${homePath}"`);
    } catch (err) {
      log.warn('[NativeManager] Failed to set gateway config defaults:', err);
    }
  }

  async startGateway(): Promise<boolean> {
    if (this._status === 'running') {
      log.info('[NativeManager] Gateway already running');
      return true;
    }

    this.setStatus('starting');
    log.info('[NativeManager] Starting gateway...');

    try {
      // Ensure the package is installed
      if (!this.isPackageInstalled()) {
        log.error('[NativeManager] openclaw not installed, cannot start gateway');
        this.setStatus('error');
        this.emit('gateway-error', 'OpenClaw is not installed. Run installNative() first.');
        return false;
      }

      // Set config defaults
      await this.ensureGatewayConfig();

      // Kill any stale gateway process
      await this.killStaleGateway();

      // Build env with API keys
      const env = { ...process.env };
      try {
        const envFile = this.getEnvFilePath();
        if (fs.existsSync(envFile)) {
          const content = fs.readFileSync(envFile, 'utf-8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
            }
          }
        }
      } catch {
        // Non-fatal
      }

      // Spawn the gateway as a child process
      const bin = this.getOpenclawBin();
      const args = [
        'gateway', 'run',
        '--port', String(this.GATEWAY_PORT),
        '--bind', 'lan',
        '--token', this.GATEWAY_TOKEN,
        '--allow-unconfigured',
      ];

      log.info(`[NativeManager] Spawning: ${bin} ${args.join(' ')}`);

      this.gatewayProcess = spawn(bin, args, {
        cwd: this.openclawDir,
        env,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
      });

      // Capture stdout/stderr for logging
      this.gatewayProcess.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) log.debug(`[gateway:stdout] ${msg}`);
      });

      this.gatewayProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) log.warn(`[gateway:stderr] ${msg}`);
      });

      this.gatewayProcess.on('error', (err) => {
        log.error('[NativeManager] Gateway process error:', err);
        this.setStatus('error');
        this.emit('gateway-error', `Gateway process error: ${err.message}`);
      });

      this.gatewayProcess.on('exit', (code, signal) => {
        log.info(`[NativeManager] Gateway process exited: code=${code}, signal=${signal}`);
        this.gatewayProcess = null;
        if (this._status === 'running') {
          // Unexpected exit — mark as error and attempt restart
          this.setStatus('error');
          this.emit('gateway-error', `Gateway exited unexpectedly (code ${code})`);
        }
      });

      // Wait for the gateway to become healthy
      const healthy = await this.waitForHealthy(this.STARTUP_TIMEOUT);
      if (healthy) {
        this.setStatus('running');
        this.startHealthChecks();
        // Auto-approve pending local devices (non-blocking)
        this.autoApproveLocalDevices();
        return true;
      } else {
        log.error('[NativeManager] Gateway did not become healthy within timeout');
        this.setStatus('error');
        this.emit('gateway-error', 'Gateway failed to start within timeout');
        // Clean up the process
        this.killGatewayProcess();
        return false;
      }
    } catch (err: any) {
      log.error('[NativeManager] Failed to start gateway:', err);
      this.setStatus('error');
      return false;
    }
  }

  async stopGateway(): Promise<void> {
    log.info('[NativeManager] Stopping gateway...');
    this.stopHealthChecks();
    this.killGatewayProcess();
    this.setStatus('stopped');
  }

  async restartGateway(): Promise<boolean> {
    log.info('[NativeManager] Restarting gateway...');
    await this.stopGateway();
    // Brief pause to let the port release
    await new Promise((r) => setTimeout(r, 1500));
    return this.startGateway();
  }

  async shutdown(): Promise<void> {
    log.info('[NativeManager] Shutting down...');
    this.stopHealthChecks();
    this.killGatewayProcess();
    this.setStatus('stopped');
  }

  /**
   * Kill the stored gateway child process.
   */
  private killGatewayProcess(): void {
    if (!this.gatewayProcess) return;

    try {
      const pid = this.gatewayProcess.pid;
      if (pid) {
        // On Windows, child_process.kill() doesn't always kill the tree.
        // Use taskkill /T to kill the process tree.
        try {
          exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true }, (err) => {
            if (err) log.debug(`[NativeManager] taskkill fallback error (non-fatal): ${err.message}`);
          });
        } catch {
          // Fallback: signal-based kill
          this.gatewayProcess.kill('SIGTERM');
        }
      }
    } catch (err: any) {
      log.warn('[NativeManager] Error killing gateway process:', err.message);
    }

    this.gatewayProcess = null;
  }

  /**
   * Kill any stale openclaw gateway processes from a previous run.
   */
  private async killStaleGateway(): Promise<void> {
    try {
      await execAsync(
        `taskkill /F /IM openclaw.cmd /T 2>nul & taskkill /F /FI "WINDOWTITLE eq openclaw*" /T 2>nul`,
        { windowsHide: true, timeout: 10000 },
      ).catch(() => {});
      // Also try to kill node processes listening on our port
      await execAsync(
        `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${this.GATEWAY_PORT} ^| findstr LISTENING') do taskkill /F /PID %a 2>nul`,
        { windowsHide: true, timeout: 10000, shell: 'cmd.exe' },
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Best-effort cleanup
    }
  }

  // ─── Health Monitoring ────────────────────────────────────────

  /**
   * HTTP health check against the local gateway.
   */
  private async checkGatewayHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.GATEWAY_PORT}/`,
        { timeout: 5000 },
        (res) => {
          res.resume();
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Poll until the gateway responds or timeout expires.
   */
  private async waitForHealthy(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      // Bail early if the process died
      if (this.gatewayProcess && this.gatewayProcess.exitCode !== null) {
        log.warn('[NativeManager] Gateway process exited during startup');
        return false;
      }
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
        log.warn('[NativeManager] Gateway health check failed, attempting restart...');
        this.emit('gateway-unhealthy');
        this.setStatus('error');
        setTimeout(() => this.restartGateway(), 3000);
      }
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

  // ─── Auto-approve Local Devices ───────────────────────────────

  private async approveAllPendingDevices(): Promise<void> {
    try {
      const pendingPath = path.join(this.getOpenclawHome(), 'devices', 'pending.json');
      if (!fs.existsSync(pendingPath)) return;

      const content = fs.readFileSync(pendingPath, 'utf-8');
      const pending = JSON.parse(content.trim() || '{}');
      const requestIds = Object.keys(pending);
      if (requestIds.length === 0) return;

      for (const requestId of requestIds) {
        const device = pending[requestId];
        log.info(`[NativeManager] Auto-approving device: ${device.clientId || 'unknown'} (${device.remoteIp || 'no-ip'})`);
        try {
          await this.runOpenclawCmd(`devices approve ${requestId}`, { timeout: 15000 });
          log.info(`[NativeManager] Device approved: ${requestId}`);
        } catch (err: any) {
          log.warn(`[NativeManager] Failed to approve device ${requestId}:`, err.message);
        }
      }
    } catch {
      // pending.json may not exist yet — not an error
    }
  }

  private autoApproveLocalDevices(): void {
    const delays = [0, 2000, 5000];
    for (const delay of delays) {
      setTimeout(() => {
        if (this._status === 'running') {
          this.approveAllPendingDevices();
        }
      }, delay);
    }
  }

  // ─── Gateway Info ─────────────────────────────────────────────

  async getGatewayInfo(): Promise<GatewayInfo | null> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.GATEWAY_PORT}/`,
        { timeout: 5000 },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve({
                port: this.GATEWAY_PORT,
                pid: this.gatewayProcess?.pid,
                ...data,
              });
            } catch {
              resolve({ port: this.GATEWAY_PORT, pid: this.gatewayProcess?.pid });
            }
          });
        },
      );
      req.on('error', () => resolve({ port: this.GATEWAY_PORT, pid: this.gatewayProcess?.pid }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ port: this.GATEWAY_PORT, pid: this.gatewayProcess?.pid });
      });
    });
  }

  getWebUIUrl(): string {
    return `http://127.0.0.1:${this.GATEWAY_PORT}/?token=${this.GATEWAY_TOKEN}`;
  }

  async checkWindowsSideConnectivity(): Promise<boolean> {
    return this.checkGatewayHealth();
  }

  // ─── Model Provider Configuration ─────────────────────────────

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

  async configureModelProvider(config: ModelConfig): Promise<boolean> {
    log.info(`[NativeManager] Configuring model provider: ${config.provider}, model: ${config.model}`);

    try {
      const envVar =
        NativeManager.PROVIDER_ENV_VARS[config.provider] ||
        `${config.provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;

      // Persist the API key in ~/.openclaw/env
      if (config.apiKey) {
        const openclawHome = this.getOpenclawHome();
        fs.mkdirSync(openclawHome, { recursive: true });

        const envFile = this.getEnvFilePath();
        let lines: string[] = [];
        if (fs.existsSync(envFile)) {
          lines = fs.readFileSync(envFile, 'utf-8')
            .split(/\r?\n/)
            .filter((l) => !l.startsWith(`${envVar}=`));
        }
        lines.push(`${envVar}=${config.apiKey}`);
        fs.writeFileSync(envFile, lines.filter((l) => l.trim()).join('\n') + '\n');
      }

      // Set the default model
      await this.runOpenclawCmd(
        `config set agents.defaults.model.primary ${config.model}`,
        { timeout: 10000 },
      );

      log.info('[NativeManager] Model provider configured successfully');

      // Restart gateway if running to pick up new env
      if (this._status === 'running') {
        log.info('[NativeManager] Restarting gateway to apply model configuration...');
        await this.restartGateway();
      }

      return true;
    } catch (err: any) {
      log.error('[NativeManager] Failed to configure model provider:', err);
      return false;
    }
  }

  async getModelConfig(): Promise<{ provider: string; model: string; hasApiKey: boolean }> {
    const defaults = { provider: '', model: '', hasApiKey: false };
    try {
      const { stdout } = await this.runOpenclawCmd(
        'config get agents.defaults.model.primary',
        { timeout: 10000 },
      );
      const model = stdout.trim();
      const provider = model.includes('/') ? model.split('/')[0] : model;

      let hasApiKey = false;
      try {
        const envFile = this.getEnvFilePath();
        if (fs.existsSync(envFile)) {
          const content = fs.readFileSync(envFile, 'utf-8');
          hasApiKey = content.includes('_API_KEY=');
        }
      } catch {}

      return { provider, model, hasApiKey };
    } catch {
      return defaults;
    }
  }

  // ─── Workspace Configuration ──────────────────────────────────

  /**
   * Configure the workspace directory. Uses Windows paths directly — no
   * WSL path translation needed.
   */
  async configureWorkspace(windowsPath?: string): Promise<boolean> {
    try {
      const targetPath = windowsPath || os.homedir();
      log.info(`[NativeManager] Configuring workspace to: ${targetPath}`);
      await this.runOpenclawCmd(
        `config set agents.defaults.workspace "${targetPath}"`,
        { timeout: 10000 },
      );
      return true;
    } catch (err: any) {
      log.error('[NativeManager] Failed to configure workspace:', err);
      return false;
    }
  }

  // ─── Channel Configuration ────────────────────────────────────

  async configureChannel(config: ChannelConfig): Promise<boolean> {
    try {
      const { channel } = config;
      log.info(`[NativeManager] Configuring channel: ${channel}`);

      // Enable the channel
      await this.runOpenclawCmd(
        `config set channels.${channel}.enabled true`,
        { timeout: 10000 },
      );

      // DM policy
      if (config.dmPolicy) {
        await this.runOpenclawCmd(
          `config set channels.${channel}.dmPolicy ${config.dmPolicy}`,
          { timeout: 10000 },
        );
      }

      // allowFrom list
      if (config.allowFrom && config.allowFrom.length > 0) {
        const allowFromJson = JSON.stringify(config.allowFrom);
        await this.runOpenclawCmd(
          `config set channels.${channel}.allowFrom "${allowFromJson.replace(/"/g, '\\"')}"`,
          { timeout: 10000 },
        );
      }

      // Platform-specific credentials
      const setConfig = async (key: string, value: string) => {
        await this.runOpenclawCmd(
          `config set channels.${channel}.${key} "${value.replace(/"/g, '\\"')}"`,
          { timeout: 10000 },
        );
      };

      switch (channel) {
        case 'telegram':
        case 'discord':
          if (config.token) await setConfig('token', config.token);
          break;

        case 'slack':
          if (config.token) await setConfig('botToken', config.token);
          if (config.appToken) await setConfig('appToken', config.appToken);
          break;

        case 'feishu':
          if (config.appId) await setConfig('appId', config.appId);
          if (config.appSecret) await setConfig('appSecret', config.appSecret);
          break;

        case 'msteams':
          if (config.appId) await setConfig('appId', config.appId);
          if (config.appPassword) await setConfig('appPassword', config.appPassword);
          if (config.tenantId) await setConfig('tenantId', config.tenantId);
          break;

        case 'googlechat':
          if (config.serviceAccount) await setConfig('serviceAccount', config.serviceAccount);
          break;

        case 'signal':
          if (config.account) await setConfig('account', config.account);
          if (config.cliPath) await setConfig('cliPath', config.cliPath);
          break;

        case 'imessage':
          if (config.cliPath) await setConfig('cliPath', config.cliPath);
          break;

        case 'whatsapp':
          log.info('[NativeManager] WhatsApp uses QR code authentication');
          break;

        default:
          log.warn(`[NativeManager] Unknown channel: ${channel}, basic config applied`);
      }

      log.info(`[NativeManager] Channel ${channel} configured successfully`);
      return true;
    } catch (err: any) {
      log.error(`[NativeManager] Failed to configure channel ${config.channel}:`, err);
      throw err;
    }
  }

  async getChannelStatus(channel: string): Promise<any> {
    try {
      const { stdout } = await this.runOpenclawCmd(
        `config get channels.${channel}`,
        { timeout: 10000 },
      );
      return JSON.parse(stdout.trim());
    } catch (err: any) {
      log.warn(`[NativeManager] Failed to get channel status for ${channel}:`, err);
      return null;
    }
  }

  // ─── Skills ───────────────────────────────────────────────────

  private readonly FALLBACK_SKILLS: SkillInfo[] = [
    { name: 'coding-agent', icon: '🧩', description: 'Run Codex CLI, Claude Code, or Pi Coding Agent', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'healthcheck', icon: '📦', description: 'Host security hardening and risk-tolerance configuration', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'skill-creator', icon: '📦', description: 'Create or update AgentSkills', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
    { name: 'weather', icon: '🌤️', description: 'Get current weather and forecasts', ready: true, source: 'openclaw-bundled', missing: null, install: [], homepage: '' },
  ];

  /**
   * Try to extract a JSON array/object from stdout that may contain noise before the actual JSON.
   */
  private extractJsonFromOutput(stdout: string): any | null {
    try {
      return JSON.parse(stdout.trim());
    } catch {
      // ignore
    }

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
      const { stdout } = await this.runOpenclawCmd(
        'skills list --json || skills list',
        { timeout: 30000 },
      );

      log.info('[NativeManager] Skills list output length:', stdout.length);

      const jsonData = this.extractJsonFromOutput(stdout);
      if (jsonData) {
        const skillsArray = Array.isArray(jsonData)
          ? jsonData
          : Array.isArray(jsonData.skills)
            ? jsonData.skills
            : null;

        if (skillsArray && skillsArray.length > 0) {
          log.info('[NativeManager] Parsed skills as JSON, count:', skillsArray.length);
          return skillsArray.map((skill: any) => ({
            name: skill.name || skill.skill || '',
            icon: skill.emoji || skill.icon || '📦',
            description: skill.description || '',
            ready: skill.eligible === true || skill.status === 'ready' || skill.ready === true,
            source: skill.source || 'openclaw-bundled',
            missing: skill.missing || null,
            install: Array.isArray(skill.install) ? skill.install : [],
            homepage: skill.homepage || '',
          }));
        }
      }

      log.warn('[NativeManager] Could not parse skills output, using fallback');
      return [...this.FALLBACK_SKILLS];
    } catch (err: any) {
      log.error('[NativeManager] Failed to list skills:', err);
      return [...this.FALLBACK_SKILLS];
    }
  }

  async installSkill(
    skillName: string,
    installMethod: { id: string; kind: string; label: string; bins: string[] },
  ): Promise<{ success: boolean; message: string }> {
    log.info(`[NativeManager] Installing skill: ${skillName} via ${installMethod.id}`);
    try {
      const { stdout, stderr } = await this.runOpenclawCmd(
        `skills install ${skillName} --method ${installMethod.id}`,
        { timeout: 120000 },
      );
      const output = (stdout + stderr).trim();
      log.info(`[NativeManager] Skill install output: ${output.substring(0, 500)}`);
      return { success: true, message: output || `Skill ${skillName} installed` };
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || 'Unknown error';
      log.error(`[NativeManager] Failed to install skill ${skillName}:`, msg);
      return { success: false, message: msg };
    }
  }

  async openSkillsDir(): Promise<{ success: boolean; message: string }> {
    try {
      const skillsDir = path.join(this.getOpenclawHome(), 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      // Use electron shell.openPath if available, otherwise fall back to explorer
      try {
        const { shell } = require('electron');
        await shell.openPath(skillsDir);
      } catch {
        await execAsync(`explorer "${skillsDir}"`, { windowsHide: true });
      }

      return { success: true, message: skillsDir };
    } catch (err: any) {
      log.error('[NativeManager] Failed to open skills directory:', err);
      return { success: false, message: err.message };
    }
  }

  async searchCommunitySkills(query: string): Promise<{
    items: Array<{
      name: string; slug: string; description: string; author: string;
      stars: number; downloads: number; version: string; url: string;
      cloneUrl: string; updatedAt: string; tags: string[];
    }>;
    error?: string;
  }> {
    try {
      const { stdout } = await this.runOpenclawCmd(
        `skills search "${query.replace(/"/g, '\\"')}" --json`,
        { timeout: 30000 },
      );

      const data = this.extractJsonFromOutput(stdout);
      if (data && Array.isArray(data)) {
        return { items: data };
      }
      if (data && Array.isArray(data.items)) {
        return { items: data.items };
      }

      return { items: [], error: 'Could not parse search results' };
    } catch (err: any) {
      log.error('[NativeManager] Failed to search community skills:', err);
      return { items: [], error: err.message };
    }
  }

  async installSkillFromUrl(url: string): Promise<{ success: boolean; message: string; name?: string }> {
    log.info(`[NativeManager] Installing skill from URL: ${url}`);
    try {
      const { stdout, stderr } = await this.runOpenclawCmd(
        `skills install-url "${url.replace(/"/g, '\\"')}"`,
        { timeout: 120000 },
      );
      const output = (stdout + stderr).trim();
      log.info(`[NativeManager] Skill install-url output: ${output.substring(0, 500)}`);

      // Try to extract the skill name from the output
      const nameMatch = output.match(/installed[:\s]+(\S+)/i);
      return {
        success: true,
        message: output || 'Skill installed from URL',
        name: nameMatch ? nameMatch[1] : undefined,
      };
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || 'Unknown error';
      log.error('[NativeManager] Failed to install skill from URL:', msg);
      return { success: false, message: msg };
    }
  }

  async uninstallCommunitySkill(name: string): Promise<{ success: boolean; message: string }> {
    log.info(`[NativeManager] Uninstalling skill: ${name}`);
    try {
      const { stdout, stderr } = await this.runOpenclawCmd(
        `skills uninstall ${name}`,
        { timeout: 30000 },
      );
      const output = (stdout + stderr).trim();
      return { success: true, message: output || `Skill ${name} uninstalled` };
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || 'Unknown error';
      log.error(`[NativeManager] Failed to uninstall skill ${name}:`, msg);
      return { success: false, message: msg };
    }
  }
}

export default NativeManager;

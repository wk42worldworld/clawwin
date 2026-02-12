/**
 * OpenClaw Desktop - IPC Handlers
 *
 * Registers all IPC (Inter-Process Communication) handlers that bridge
 * the renderer process to the WSL Manager. Each handler corresponds to
 * an `ipcRenderer.invoke()` call made from the preload/renderer.
 */

import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import * as path from 'path';
import { execFile } from 'child_process';
import * as https from 'https';
import log from 'electron-log';
import Store from 'electron-store';
import { WSLManager, WSLCheckResult, WSLStatus, GatewayInfo, SkillInfo } from './wsl-manager';
import { StoreSchema } from './store-schema';

export function registerIPCHandlers(
  wslManager: WSLManager,
  store: Store<StoreSchema>,
  getMainWindow: () => BrowserWindow | null
): void {

  // ─── Environment & Status ──────────────────────────────────

  /**
   * check-env: Performs a full WSL2 environment check.
   * Returns a WSLCheckResult with booleans for each component.
   */
  ipcMain.handle('check-env', async (): Promise<WSLCheckResult> => {
    log.info('IPC: check-env');
    try {
      return await wslManager.checkEnvironment();
    } catch (err: any) {
      log.error('IPC: check-env failed:', err);
      return {
        wslEnabled: false,
        vmPlatformEnabled: false,
        distroExists: false,
        distroRunning: false,
        gatewayHealthy: false,
        wslVersion: '',
        errorMessage: err.message,
      };
    }
  });

  /**
   * get-status: Returns the current WSL gateway status and optional info.
   */
  ipcMain.handle('get-status', async (): Promise<{
    status: WSLStatus;
    info: GatewayInfo | null;
  }> => {
    const status = wslManager.status;
    let info: GatewayInfo | null = null;

    if (status === 'running') {
      try {
        info = await wslManager.getGatewayInfo();
      } catch {
        // Gateway may be temporarily unreachable
      }
    }

    return { status, info };
  });

  // ─── Gateway Lifecycle ────────────────────────────────────

  /**
   * start-gateway: Starts the OpenClaw gateway inside WSL2.
   */
  ipcMain.handle('start-gateway', async (): Promise<boolean> => {
    log.info('IPC: start-gateway');
    try {
      const success = await wslManager.startGateway();
      log.info(`IPC: start-gateway result: ${success}`);
      return success;
    } catch (err: any) {
      log.error('IPC: start-gateway error:', err);
      return false;
    }
  });

  /**
   * stop-gateway: Stops the OpenClaw gateway.
   */
  ipcMain.handle('stop-gateway', async (): Promise<void> => {
    log.info('IPC: stop-gateway');
    try {
      await wslManager.stopGateway();
      log.info('IPC: gateway stopped');
    } catch (err: any) {
      log.error('IPC: stop-gateway error:', err);
      throw err;
    }
  });

  /**
   * restart-gateway: Restarts the OpenClaw gateway.
   */
  ipcMain.handle('restart-gateway', async (): Promise<boolean> => {
    log.info('IPC: restart-gateway');
    try {
      return await wslManager.restartGateway();
    } catch (err: any) {
      log.error('IPC: restart-gateway error:', err);
      return false;
    }
  });

  // ─── Configuration ────────────────────────────────────────

  /**
   * configure: Applies AI provider configuration (provider, API key, platform).
   * Saves settings to the local store and writes config inside WSL2.
   */
  ipcMain.handle('configure', async (_event, config: {
    provider: string;
    apiKey: string;
    model?: string;
    platform?: string;
  }): Promise<boolean> => {
    log.info('IPC: configure, provider:', config.provider);
    try {
      // Persist to local settings store
      store.set('provider', config.provider);
      store.set('apiKey', config.apiKey);
      if (config.platform) {
        store.set('platform', config.platform);
      }

      // Write configuration inside the WSL2 distro
      const success = await wslManager.configureOpenClaw({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      });

      log.info(`IPC: configure result: ${success}`);
      return success;
    } catch (err: any) {
      log.error('IPC: configure error:', err);
      return false;
    }
  });

  /**
   * configure-model: Sets the AI provider, API key, and default model
   * inside the WSL2 OpenClaw config. Uses environment variables for the
   * API key and `openclaw config set` for the model.
   */
  ipcMain.handle('configure-model', async (_event, config: {
    provider: string;
    apiKey: string;
    model: string;
  }): Promise<boolean> => {
    log.info('IPC: configure-model, provider:', config.provider);
    try {
      const success = await wslManager.configureModelProvider(config);
      log.info(`IPC: configure-model result: ${success}`);
      return success;
    } catch (err: any) {
      log.error('IPC: configure-model error:', err);
      return false;
    }
  });

  /**
   * get-model-config: Returns the current AI model configuration from WSL2.
   */
  ipcMain.handle('get-model-config', async (): Promise<{
    provider: string;
    model: string;
    hasApiKey: boolean;
  }> => {
    log.info('IPC: get-model-config');
    try {
      return await wslManager.getModelConfig();
    } catch (err: any) {
      log.error('IPC: get-model-config error:', err);
      return { provider: '', model: '', hasApiKey: false };
    }
  });

  /**
   * reset-wizard: Resets firstLaunch flag and reloads the wizard page.
   */
  ipcMain.handle('reset-wizard', async (): Promise<void> => {
    log.info('IPC: reset-wizard');
    store.set('firstLaunch', true);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const wizardPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'wizard.html');
      await mainWindow.loadFile(wizardPath);
    }
  });

  // ─── Setup Wizard ─────────────────────────────────────────

  /**
   * complete-wizard: Marks the first-launch wizard as complete.
   * Navigation to the next page is handled by the renderer.
   */
  ipcMain.handle('complete-wizard', async (): Promise<void> => {
    log.info('IPC: complete-wizard');
    store.set('firstLaunch', false);
  });

  /**
   * is-first-launch: Returns whether this is the first time the app has run.
   */
  ipcMain.handle('is-first-launch', async (): Promise<boolean> => {
    return store.get('firstLaunch') as boolean;
  });

  // ─── WSL Setup Actions ────────────────────────────────────

  /**
   * enable-wsl: Enables WSL2 Windows features (may require admin elevation).
   */
  ipcMain.handle('enable-wsl', async (): Promise<{
    success: boolean;
    needsRestart: boolean;
  }> => {
    log.info('IPC: enable-wsl');
    try {
      return await wslManager.enableWSLFeatures();
    } catch (err: any) {
      log.error('IPC: enable-wsl error:', err);
      return { success: false, needsRestart: false };
    }
  });

  /**
   * install-wsl-complete: Full WSL2 installation (features + kernel).
   * Tries `wsl --install --no-distribution` first, falls back to manual approach.
   */
  ipcMain.handle('install-wsl-complete', async (): Promise<{
    success: boolean;
    needsRestart: boolean;
  }> => {
    log.info('IPC: install-wsl-complete');
    try {
      return await wslManager.installWSLComplete();
    } catch (err: any) {
      log.error('IPC: install-wsl-complete error:', err);
      return { success: false, needsRestart: false };
    }
  });

  /**
   * restart-computer: Restarts the computer. Used after WSL2 feature enable.
   */
  ipcMain.handle('restart-computer', async (): Promise<void> => {
    log.info('IPC: restart-computer - Initiating system restart...');
    try {
      // Schedule restart in 5 seconds to give the app time to close
      execFile('shutdown', ['/r', '/t', '5', '/c', 'ClawWin: Restarting to complete WSL2 setup'], { windowsHide: true }, (err) => {
        if (err) log.error('Failed to schedule restart:', err);
      });
      // Quit the app
      setTimeout(() => app.quit(), 1000);
    } catch (err: any) {
      log.error('IPC: restart-computer error:', err);
      throw err;
    }
  });

  /**
   * import-distro: Imports the OpenClaw Linux distro from the bundled image.
   */
  ipcMain.handle('import-distro', async (): Promise<boolean> => {
    log.info('IPC: import-distro');
    try {
      return await wslManager.importDistro();
    } catch (err: any) {
      log.error('IPC: import-distro error:', err);
      return false;
    }
  });

  // ─── Settings ─────────────────────────────────────────────

  /**
   * get-setting: Reads a value from the persistent settings store.
   */
  ipcMain.handle('get-setting', async (_event, key: string): Promise<unknown> => {
    return store.get(key);
  });

  /**
   * set-setting: Writes a value to the persistent settings store.
   */
  ipcMain.handle('set-setting', async (_event, key: string, value: unknown): Promise<void> => {
    store.set(key, value);
  });

  /**
   * get-webui-url: Returns the URL for the OpenClaw gateway web UI.
   */
  ipcMain.handle('get-webui-url', async (): Promise<string> => {
    return wslManager.getWebUIUrl();
  });

  /**
   * get-gateway-ws-url: Returns the WebSocket URL for the chat interface.
   * Uses 127.0.0.1 (through the local TCP proxy or netsh port forwarding).
   */
  ipcMain.handle('get-gateway-ws-url', async (): Promise<string> => {
    return `ws://127.0.0.1:18789`;
  });

  /**
   * check-gateway-connectivity: Verifies the gateway is reachable from Windows
   * through the port proxy. Returns true if the full connection path works.
   */
  ipcMain.handle('check-gateway-connectivity', async (): Promise<boolean> => {
    try {
      return await wslManager.checkWindowsSideConnectivity();
    } catch {
      return false;
    }
  });

  /**
   * configure-workspace: Sets OpenClaw's workspace to a Windows path.
   * Defaults to the user's Desktop if no path is provided.
   */
  ipcMain.handle('configure-workspace', async (_event, windowsPath?: string): Promise<boolean> => {
    log.info('IPC: configure-workspace', windowsPath || '(default: Desktop)');
    try {
      return await wslManager.configureWorkspace(windowsPath);
    } catch (err: any) {
      log.error('IPC: configure-workspace error:', err);
      return false;
    }
  });

  /**
   * browse-folder: Opens a native folder picker dialog.
   */
  ipcMain.handle('browse-folder', async (): Promise<string | null> => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ─── Channel Configuration ───────────────────────────────────

  /**
   * configure-channel: Configures a chat channel (WhatsApp, Telegram, etc.)
   * with credentials, DM policy, and allowFrom list.
   */
  ipcMain.handle('configure-channel', async (_event, config: {
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
  }): Promise<boolean> => {
    log.info('IPC: configure-channel', config.channel);
    try {
      return await wslManager.configureChannel(config);
    } catch (err: any) {
      log.error('IPC: configure-channel error:', err);
      return false;
    }
  });

  /**
   * get-channel-status: Retrieves the configuration status for a channel.
   */
  ipcMain.handle('get-channel-status', async (_event, channel: string): Promise<any> => {
    log.info('IPC: get-channel-status', channel);
    try {
      return await wslManager.getChannelStatus(channel);
    } catch (err: any) {
      log.error('IPC: get-channel-status error:', err);
      return null;
    }
  });

  /**
   * get-locale: Returns the system locale (e.g., "zh-CN", "en-US").
   */
  ipcMain.handle('get-locale', async (): Promise<string> => {
    return app.getLocale();
  });

  /**
   * list-skills: Returns all available skills with their status.
   */
  ipcMain.handle('list-skills', async (): Promise<SkillInfo[]> => {
    log.info('IPC: list-skills called');
    try {
      const skills = await wslManager.listSkills();
      log.info('IPC: list-skills returned', skills.length, 'skills');
      return skills;
    } catch (err: any) {
      log.error('IPC: list-skills error:', err?.message, err?.stack);
      return [];
    }
  });

  /**
   * install-skill: Installs dependencies for a skill inside WSL2.
   */
  ipcMain.handle('install-skill', async (_event, skillName: string, installMethod: {
    id: string;
    kind: string;
    label: string;
    bins: string[];
  }): Promise<{ success: boolean; message: string }> => {
    log.info('IPC: install-skill called for', skillName, 'method:', installMethod.kind);
    try {
      let command: string;
      const bins = installMethod.bins.join(' ');
      switch (installMethod.kind) {
        case 'brew':
          command = `brew install ${bins}`;
          break;
        case 'apt':
          command = `sudo apt-get install -y ${bins}`;
          break;
        case 'pip':
        case 'pip3':
          command = `pip3 install ${bins}`;
          break;
        case 'npm':
          command = `npm install -g ${bins}`;
          break;
        case 'go':
          command = `go install ${bins}`;
          break;
        case 'cargo':
          command = `cargo install ${bins}`;
          break;
        default:
          command = `${installMethod.kind} install ${bins}`;
          break;
      }

      log.info('install-skill running command:', command);
      const { stdout, stderr } = await wslManager.execInDistro(command, { timeout: 120000 });
      log.info('install-skill stdout:', stdout.substring(0, 500));
      if (stderr) log.warn('install-skill stderr:', stderr.substring(0, 500));
      return { success: true, message: 'Installation completed successfully' };
    } catch (err: any) {
      log.error('install-skill error:', err?.message);
      return { success: false, message: err?.message || 'Installation failed' };
    }
  });

  /**
   * open-skills-dir: Opens the WSL skills directory in Windows Explorer.
   */
  ipcMain.handle('open-skills-dir', async (): Promise<{ success: boolean; message: string }> => {
    log.info('IPC: open-skills-dir called');
    try {
      await wslManager.execInDistro('mkdir -p /root/.openclaw/skills', { timeout: 10000 });
      const windowsPath = '\\\\wsl$\\OpenClaw\\root\\.openclaw\\skills';
      execFile('explorer.exe', [windowsPath], { windowsHide: false }, (err) => {
        if (err) log.warn('open-skills-dir explorer error:', err.message);
      });
      return { success: true, message: 'Opened skills directory' };
    } catch (err: any) {
      log.error('open-skills-dir error:', err?.message);
      return { success: false, message: err?.message || 'Failed to open skills directory' };
    }
  });

  // ─── Community Marketplace (ClawdHub) ──────────────────────

  /**
   * search-community-skills: Search ClawdHub for community skills.
   * API: GET https://clawhub.ai/api/v1/skills?q={query}
   */
  ipcMain.handle('search-community-skills', async (_event, query: string): Promise<{
    items: Array<{
      name: string;
      slug: string;
      description: string;
      author: string;
      stars: number;
      downloads: number;
      version: string;
      url: string;
      cloneUrl: string;
      updatedAt: string;
      tags: string[];
    }>;
    error?: string;
  }> => {
    log.info('IPC: search-community-skills (ClawdHub), query:', query);
    return new Promise((resolve) => {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const apiUrl = `https://clawhub.ai/api/v1/skills${params}`;

      const options = {
        headers: {
          'User-Agent': 'OpenClaw-Desktop',
          'Accept': 'application/json'
        }
      };

      https.get(apiUrl, options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const skillsArray = json.items || json.skills || (Array.isArray(json) ? json : []);
            const items = skillsArray.map((skill: any) => ({
              name: skill.displayName || skill.name || skill.slug || '',
              slug: skill.slug || '',
              description: skill.summary || skill.description || '',
              author: skill.owner?.handle || skill.owner?.displayName || skill.author || '',
              stars: skill.stats?.stars || 0,
              downloads: skill.stats?.downloads || 0,
              version: skill.latestVersion?.version || '',
              url: `https://clawhub.ai/skills/${skill.slug || ''}`,
              cloneUrl: skill.repository || skill.cloneUrl || '',
              updatedAt: skill.updatedAt || '',
              tags: skill.tags?.latest || skill.tags || []
            }));
            log.info('search-community-skills (ClawdHub) found', items.length, 'results');
            resolve({ items });
          } catch (err: any) {
            log.error('search-community-skills parse error:', err.message);
            log.error('search-community-skills raw response:', data.substring(0, 500));
            resolve({ items: [], error: 'Failed to parse ClawdHub response' });
          }
        });
      }).on('error', (err) => {
        log.error('search-community-skills network error:', err.message);
        resolve({ items: [], error: 'Network error: ' + err.message });
      });
    });
  });

  /**
   * install-skill-from-url: Clone a Git repo into the managed skills directory.
   */
  ipcMain.handle('install-skill-from-url', async (_event, url: string): Promise<{ success: boolean; message: string; name?: string }> => {
    log.info('IPC: install-skill-from-url, url:', url);
    try {
      // Extract skill name from URL (last path segment, strip .git)
      const urlPath = url.replace(/\.git$/, '').replace(/\/$/, '');
      const name = urlPath.split('/').pop() || '';
      if (!name || /[^a-zA-Z0-9_\-.]/.test(name)) {
        return { success: false, message: 'Invalid skill name derived from URL: ' + name };
      }

      // Ensure skills directory exists
      await wslManager.execInDistro('mkdir -p /root/.openclaw/skills', { timeout: 10000 });

      // Check if already installed
      const { stdout: checkOut } = await wslManager.execInDistro(
        `test -d /root/.openclaw/skills/${name} && echo EXISTS || echo OK`,
        { timeout: 5000 }
      );
      if (checkOut.trim() === 'EXISTS') {
        return { success: false, message: 'Skill "' + name + '" is already installed' };
      }

      // Clone the repo
      const { stdout, stderr } = await wslManager.execInDistro(
        `git clone --depth 1 ${url} /root/.openclaw/skills/${name}`,
        { timeout: 60000 }
      );
      log.info('install-skill-from-url stdout:', stdout.substring(0, 300));
      if (stderr) log.info('install-skill-from-url stderr:', stderr.substring(0, 300));

      return { success: true, message: 'Skill "' + name + '" installed successfully', name };
    } catch (err: any) {
      log.error('install-skill-from-url error:', err?.message);
      return { success: false, message: err?.message || 'Installation failed' };
    }
  });

  /**
   * uninstall-community-skill: Remove a community-installed skill.
   */
  ipcMain.handle('uninstall-community-skill', async (_event, name: string): Promise<{ success: boolean; message: string }> => {
    log.info('IPC: uninstall-community-skill, name:', name);
    try {
      // Safety: only allow alphanumeric, dash, dot, underscore
      if (!name || /[^a-zA-Z0-9_\-.]/.test(name)) {
        return { success: false, message: 'Invalid skill name' };
      }

      // Only delete from managed skills dir
      const skillPath = `/root/.openclaw/skills/${name}`;
      const { stdout: checkOut } = await wslManager.execInDistro(
        `test -d ${skillPath} && echo EXISTS || echo NOTFOUND`,
        { timeout: 5000 }
      );
      if (checkOut.trim() !== 'EXISTS') {
        return { success: false, message: 'Skill "' + name + '" not found in community skills' };
      }

      await wslManager.execInDistro(`rm -rf ${skillPath}`, { timeout: 10000 });
      log.info('uninstall-community-skill removed:', name);
      return { success: true, message: 'Skill "' + name + '" uninstalled' };
    } catch (err: any) {
      log.error('uninstall-community-skill error:', err?.message);
      return { success: false, message: err?.message || 'Uninstall failed' };
    }
  });

  log.info('All IPC handlers registered');
}

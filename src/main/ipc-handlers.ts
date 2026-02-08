/**
 * OpenClaw Desktop - IPC Handlers
 *
 * Registers all IPC (Inter-Process Communication) handlers that bridge
 * the renderer process to the WSL Manager. Each handler corresponds to
 * an `ipcRenderer.invoke()` call made from the preload/renderer.
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import Store from 'electron-store';
import { WSLManager, WSLCheckResult, WSLStatus, GatewayInfo } from './wsl-manager';
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
   * get-locale: Returns the system locale (e.g., "zh-CN", "en-US").
   */
  ipcMain.handle('get-locale', async (): Promise<string> => {
    return app.getLocale();
  });

  log.info('All IPC handlers registered');
}

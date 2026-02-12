/**
 * OpenClaw Desktop - Preload Script
 *
 * Exposes a safe, typed API to the renderer process via Electron's
 * contextBridge. The renderer accesses this API as `window.openclaw`.
 * No Node.js or Electron internals are directly accessible.
 */

import { contextBridge, ipcRenderer } from 'electron';

const openclawAPI = {

  // ─── Environment & Status ──────────────────────────────────

  checkEnv: (): Promise<{
    wslEnabled: boolean;
    vmPlatformEnabled: boolean;
    distroExists: boolean;
    distroRunning: boolean;
    gatewayHealthy: boolean;
    wslVersion: string;
    errorMessage?: string;
  }> => ipcRenderer.invoke('check-env'),

  getStatus: (): Promise<{
    status: string;
    info: {
      port: number;
      pid?: number;
      uptime?: number;
      version?: string;
    } | null;
  }> => ipcRenderer.invoke('get-status'),

  // ─── Gateway Lifecycle ────────────────────────────────────

  startGateway: (): Promise<boolean> =>
    ipcRenderer.invoke('start-gateway'),

  stopGateway: (): Promise<void> =>
    ipcRenderer.invoke('stop-gateway'),

  restartGateway: (): Promise<boolean> =>
    ipcRenderer.invoke('restart-gateway'),

  // ─── Configuration ────────────────────────────────────────

  configure: (config: {
    provider: string;
    apiKey: string;
    model?: string;
    platform?: string;
  }): Promise<boolean> =>
    ipcRenderer.invoke('configure', config),

  configureModel: (config: {
    provider: string;
    apiKey: string;
    model: string;
  }): Promise<boolean> =>
    ipcRenderer.invoke('configure-model', config),

  getModelConfig: (): Promise<{
    provider: string;
    model: string;
    hasApiKey: boolean;
  }> => ipcRenderer.invoke('get-model-config'),

  resetWizard: (): Promise<void> =>
    ipcRenderer.invoke('reset-wizard'),

  // ─── Setup Wizard ─────────────────────────────────────────

  completeWizard: (): Promise<void> =>
    ipcRenderer.invoke('complete-wizard'),

  isFirstLaunch: (): Promise<boolean> =>
    ipcRenderer.invoke('is-first-launch'),

  // ─── WSL Setup ────────────────────────────────────────────

  enableWSL: (): Promise<{ success: boolean; needsRestart: boolean }> =>
    ipcRenderer.invoke('enable-wsl'),

  installWSLComplete: (): Promise<{ success: boolean; needsRestart: boolean }> =>
    ipcRenderer.invoke('install-wsl-complete'),

  restartComputer: (): Promise<void> =>
    ipcRenderer.invoke('restart-computer'),

  importDistro: (): Promise<boolean> =>
    ipcRenderer.invoke('import-distro'),

  // ─── Settings ─────────────────────────────────────────────

  getSetting: (key: string): Promise<unknown> =>
    ipcRenderer.invoke('get-setting', key),

  setSetting: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('set-setting', key, value),

  getWebUIUrl: (): Promise<string> =>
    ipcRenderer.invoke('get-webui-url'),

  getGatewayWSUrl: (): Promise<string> =>
    ipcRenderer.invoke('get-gateway-ws-url'),

  checkGatewayConnectivity: (): Promise<boolean> =>
    ipcRenderer.invoke('check-gateway-connectivity'),

  configureWorkspace: (windowsPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('configure-workspace', windowsPath),

  browseFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('browse-folder'),

  // ─── Channel Configuration ────────────────────────────────

  configureChannel: (config: {
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
  }): Promise<boolean> =>
    ipcRenderer.invoke('configure-channel', config),

  getChannelStatus: (channel: string): Promise<any> =>
    ipcRenderer.invoke('get-channel-status', channel),

  getLocale: (): Promise<string> =>
    ipcRenderer.invoke('get-locale'),

  listSkills: (): Promise<Array<{
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
  }>> => ipcRenderer.invoke('list-skills'),

  installSkill: (skillName: string, installMethod: {
    id: string;
    kind: string;
    label: string;
    bins: string[];
  }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('install-skill', skillName, installMethod),

  openSkillsDir: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('open-skills-dir'),

  searchCommunitySkills: (query: string): Promise<{
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
  }> => ipcRenderer.invoke('search-community-skills', query),

  installSkillFromUrl: (url: string): Promise<{ success: boolean; message: string; name?: string }> =>
    ipcRenderer.invoke('install-skill-from-url', url),

  uninstallCommunitySkill: (name: string): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('uninstall-community-skill', name),

  // ─── Event Listeners ──────────────────────────────────────

  onStatusChanged: (callback: (status: string) => void): void => {
    ipcRenderer.on('wsl-status-changed', (_event, status: string) => {
      callback(status);
    });
  },

  onGatewayCrashed: (callback: (exitCode: number) => void): void => {
    ipcRenderer.on('gateway-crashed', (_event, code: number) => {
      callback(code);
    });
  },

  onGatewayUnhealthy: (callback: () => void): void => {
    ipcRenderer.on('gateway-unhealthy', () => {
      callback();
    });
  },

  onImportProgress: (callback: (message: string) => void): void => {
    ipcRenderer.on('import-progress', (_event, message: string) => {
      callback(message);
    });
  },

  onImportError: (callback: (message: string) => void): void => {
    ipcRenderer.on('import-error', (_event, message: string) => {
      callback(message);
    });
  },

  removeAllListeners: (channel: string): void => {
    const allowedChannels = [
      'wsl-status-changed',
      'gateway-crashed',
      'gateway-unhealthy',
      'import-progress',
      'import-error',
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
};

contextBridge.exposeInMainWorld('openclaw', openclawAPI);

export type OpenClawAPI = typeof openclawAPI;

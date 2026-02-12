/**
 * BackendManager - Common interface for WSL and Native backend modes.
 *
 * WSLManager: runs OpenClaw inside WSL2 Linux distro
 * NativeManager: runs OpenClaw directly on Windows as a Node.js process
 */

import { EventEmitter } from 'events';

export type BackendStatus =
  | 'not_installed'
  | 'no_distro'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error';

export interface EnvCheckResult {
  wslEnabled: boolean;
  vmPlatformEnabled: boolean;
  virtualizationEnabled: boolean;
  distroExists: boolean;
  distroRunning: boolean;
  gatewayHealthy: boolean;
  wslVersion: string;
  /** native mode flag — renderer uses this to adjust UI */
  nativeMode?: boolean;
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

export interface ModelConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export interface ChannelConfig {
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
}

/**
 * Abstract base class for backend managers.
 * Both WSLManager and NativeManager extend this.
 */
export abstract class BackendManager extends EventEmitter {
  abstract get status(): BackendStatus;

  // ─── Environment ──────────────────────────────────────────
  abstract checkEnvironment(): Promise<EnvCheckResult>;

  // ─── Gateway Lifecycle ────────────────────────────────────
  abstract startGateway(): Promise<boolean>;
  abstract stopGateway(): Promise<void>;
  abstract restartGateway(): Promise<boolean>;
  abstract shutdown(): Promise<void>;

  // ─── Gateway Info ─────────────────────────────────────────
  abstract getGatewayInfo(): Promise<GatewayInfo | null>;
  abstract getWebUIUrl(): string;
  abstract checkWindowsSideConnectivity(): Promise<boolean>;

  // ─── Configuration ────────────────────────────────────────
  abstract configureModelProvider(config: ModelConfig): Promise<boolean>;
  abstract getModelConfig(): Promise<{ provider: string; model: string; hasApiKey: boolean }>;
  abstract configureWorkspace(windowsPath?: string): Promise<boolean>;
  abstract configureChannel(config: ChannelConfig): Promise<boolean>;
  abstract getChannelStatus(channel: string): Promise<any>;

  // ─── Skills ───────────────────────────────────────────────
  abstract listSkills(): Promise<SkillInfo[]>;;

  // ─── Command Execution ────────────────────────────────────
  abstract execCommand(
    command: string,
    options?: { timeout?: number }
  ): Promise<{ stdout: string; stderr: string }>;

  // ─── WSL-specific (no-op in native mode) ──────────────────
  async enableWSLFeatures(): Promise<{ success: boolean; needsRestart: boolean }> {
    return { success: false, needsRestart: false };
  }
  async installWSLComplete(): Promise<{ success: boolean; needsRestart: boolean }> {
    return { success: false, needsRestart: false };
  }
  async importDistro(): Promise<boolean> {
    return false;
  }

  // ─── Native-specific (no-op in WSL mode) ──────────────────
  async installNative(): Promise<boolean> {
    return false;
  }
}

export interface StoreSchema {
  firstLaunch: boolean;
  windowBounds: { width: number; height: number };
  minimizeToTray: boolean;
  autoStartGateway: boolean;
  provider: string;
  apiKey: string;
  platform: string;
  language: string;
}

// Shared app state to avoid circular dependencies
let _isQuitting = false;

export function setQuitting(value: boolean): void {
  _isQuitting = value;
}

export function getQuitting(): boolean {
  return _isQuitting;
}

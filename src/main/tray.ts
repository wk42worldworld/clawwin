/**
 * OpenClaw Desktop - System Tray Management
 *
 * Creates and manages the system tray icon with a context menu.
 * The tray shows current gateway status and provides quick actions
 * for controlling the gateway without opening the main window.
 */

import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import Store from 'electron-store';
import { BackendManager } from './backend-manager';
import { setQuitting, StoreSchema } from './store-schema';

let tray: Tray | null = null;
let currentStatus: string = 'stopped';
let wslManagerRef: BackendManager;
let mainWindowRef: BrowserWindow;
let storeRef: Store<StoreSchema>;

// ─── Status Display Mapping ─────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  starting: 'Starting...',
  stopped: 'Stopped',
  error: 'Error',
  not_installed: 'WSL Not Installed',
  no_distro: 'No Distro Imported',
};

// ─── Tray Icon Generation ───────────────────────────────────────

/**
 * Generate a tray icon. Tries to load a bundled PNG first, then falls
 * back to a programmatically generated SVG-based icon colored by status.
 */
function createTrayIcon(status: string): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  } catch {
    // Fall through to generated icon
  }

  let color: string;
  switch (status) {
    case 'running':
      color = '#2ECC71';
      break;
    case 'starting':
      color = '#F39C12';
      break;
    case 'error':
      color = '#E74C3C';
      break;
    default:
      color = '#95A5A6';
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="${color}" stroke="#ffffff" stroke-width="1"/>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

// ─── Context Menu Builder ───────────────────────────────────────

function buildContextMenu(): Menu {
  const label = STATUS_LABELS[currentStatus] || 'Unknown';
  const isRunning = currentStatus === 'running';
  const isStopped = currentStatus === 'stopped' || currentStatus === 'no_distro' || currentStatus === 'not_installed';
  const isStarting = currentStatus === 'starting';

  return Menu.buildFromTemplate([
    {
      label: `ClawWin: ${label}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.show();
          mainWindowRef.focus();
        }
      },
    },
    {
      label: 'Hide Window',
      click: () => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Start Gateway',
      enabled: isStopped && !isStarting,
      click: async () => {
        log.info('Tray: Starting gateway...');
        try {
          await wslManagerRef.startGateway();
        } catch (err) {
          log.error('Tray: Failed to start gateway:', err);
        }
      },
    },
    {
      label: 'Stop Gateway',
      enabled: isRunning,
      click: async () => {
        log.info('Tray: Stopping gateway...');
        try {
          await wslManagerRef.stopGateway();
        } catch (err) {
          log.error('Tray: Failed to stop gateway:', err);
        }
      },
    },
    {
      label: 'Restart Gateway',
      enabled: isRunning || currentStatus === 'error',
      click: async () => {
        log.info('Tray: Restarting gateway...');
        try {
          await wslManagerRef.restartGateway();
        } catch (err) {
          log.error('Tray: Failed to restart gateway:', err);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Auto-start Gateway',
      type: 'checkbox',
      checked: storeRef.get('autoStartGateway') as boolean,
      click: (menuItem) => {
        storeRef.set('autoStartGateway', menuItem.checked);
        log.info(`Tray: Auto-start gateway set to ${menuItem.checked}`);
      },
    },
    {
      label: 'Minimize to Tray',
      type: 'checkbox',
      checked: storeRef.get('minimizeToTray') as boolean,
      click: (menuItem) => {
        storeRef.set('minimizeToTray', menuItem.checked);
        log.info(`Tray: Minimize to tray set to ${menuItem.checked}`);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit ClawWin',
      click: () => {
        setQuitting(true);
        app.quit();
      },
    },
  ]);
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Create the system tray icon and context menu.
 */
export function createTray(
  mainWindow: BrowserWindow,
  wslManager: BackendManager,
  store: Store<StoreSchema>
): Tray {
  mainWindowRef = mainWindow;
  wslManagerRef = wslManager;
  storeRef = store;

  const icon = createTrayIcon(currentStatus);
  tray = new Tray(icon);
  tray.setToolTip('ClawWin');
  tray.setContextMenu(buildContextMenu());

  // Double-click toggles window visibility
  tray.on('double-click', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (mainWindowRef.isVisible()) {
        mainWindowRef.hide();
      } else {
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    }
  });

  log.info('System tray created');
  return tray;
}

/**
 * Update the tray icon and menu to reflect a new WSL/gateway status.
 */
export function updateTrayStatus(status: string): void {
  currentStatus = status;

  if (tray && !tray.isDestroyed()) {
    tray.setImage(createTrayIcon(status));
    tray.setContextMenu(buildContextMenu());

    const label = STATUS_LABELS[status] || 'Unknown';
    tray.setToolTip(`ClawWin - ${label}`);
  }
}

/**
 * Destroy the tray icon during app shutdown.
 */
export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

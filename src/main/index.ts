/**
 * OpenClaw Desktop - Electron Main Process
 *
 * Entry point for the Electron application. Creates the main browser window,
 * initializes WSL management, system tray, and IPC handlers. Shows the setup
 * wizard on first launch, or the main dashboard otherwise.
 */

import { app, BrowserWindow, screen, shell, session, Menu } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import Store from 'electron-store';
import { WSLManager } from './wsl-manager';
import { createTray, updateTrayStatus, destroyTray } from './tray';
import { registerIPCHandlers } from './ipc-handlers';
import { StoreSchema, setQuitting, getQuitting } from './store-schema';

// ─── Logging Configuration ──────────────────────────────────────
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('OpenClaw Desktop starting...');

// ─── Persistent Settings Store ──────────────────────────────────
const store = new Store<StoreSchema>({
  defaults: {
    firstLaunch: true,
    windowBounds: { width: 1200, height: 800 },
    minimizeToTray: true,
    autoStartGateway: true,
    provider: '',
    apiKey: '',
    platform: '',
    language: '',
  },
});

// ─── Global References ──────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let wslManager: WSLManager;

// ─── Path Helpers ───────────────────────────────────────────────

function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js');
}

function getRendererPath(file: string): string {
  return path.join(__dirname, '..', '..', 'src', 'renderer', file);
}

// ─── Window Creation ────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const savedBounds = store.get('windowBounds') as { width: number; height: number };
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(savedBounds.width, screenWidth),
    height: Math.min(savedBounds.height, screenHeight),
    minWidth: 900,
    minHeight: 600,
    title: 'OpenClaw Desktop',
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      // Allow file:// pages to connect to ws://127.0.0.1 (gateway)
      webSecurity: false,
    },
  });

  // Set CSP for page responses only — skip WebSocket upgrade (101) and other non-document responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Don't interfere with WebSocket upgrade responses — modifying 101 headers can break the handshake
    if (details.statusCode === 101 || details.resourceType === 'webSocket') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src * ws: wss: http: https:;"
        ]
      }
    });
  });

  // Decide which page to load based on whether setup has been completed
  const isFirstLaunch = store.get('firstLaunch') as boolean;
  if (isFirstLaunch) {
    win.loadFile(getRendererPath('wizard.html'));
  } else {
    win.loadFile(getRendererPath('chat.html'));
  }

  // Show window after content is ready to avoid white flash
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    // Open DevTools with F12
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        win.webContents.toggleDevTools();
      }
    });
  });

  // Persist window dimensions on resize
  win.on('resized', () => {
    if (win && !win.isMaximized() && !win.isDestroyed()) {
      const [width, height] = win.getSize();
      store.set('windowBounds', { width, height });
    }
  });

  // Minimize to tray on close instead of quitting (if enabled)
  win.on('close', (event) => {
    const minimizeToTray = store.get('minimizeToTray') as boolean;
    if (minimizeToTray && !getQuitting()) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the system default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

// ─── Application Initialization ─────────────────────────────────

async function initializeApp(): Promise<void> {
  // Enforce single instance
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    log.info('Another instance is already running. Exiting.');
    app.quit();
    return;
  }

  // If a second instance tries to launch, bring the existing window to focus
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Initialize WSL Manager with correct resource path
  const resourcesDir = app.isPackaged
    ? process.resourcesPath                         // production: <install>/resources/
    : path.join(__dirname, '..', '..');             // dev: project root
  wslManager = new WSLManager(resourcesDir);

  // Forward WSL status change events to the renderer and tray
  wslManager.on('status-changed', (newStatus: string) => {
    log.info(`WSL status changed: ${newStatus}`);
    updateTrayStatus(newStatus);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wsl-status-changed', newStatus);
    }
  });

  wslManager.on('gateway-crashed', (code: number) => {
    log.error(`Gateway process crashed with exit code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway-crashed', code);
    }
  });

  wslManager.on('gateway-unhealthy', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway-unhealthy');
    }
  });

  wslManager.on('import-progress', (message: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('import-progress', message);
    }
  });

  wslManager.on('import-error', (message: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('import-error', message);
    }
  });

  // Register IPC handlers so the renderer can communicate with the main process
  registerIPCHandlers(wslManager, store, () => mainWindow);

  // Remove default menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // Create the main browser window
  mainWindow = createMainWindow();

  // Create the system tray icon and menu
  createTray(mainWindow, wslManager, store);

  // Auto-start the gateway if configured and not on first launch
  const autoStart = store.get('autoStartGateway') as boolean;
  const isFirstLaunch = store.get('firstLaunch') as boolean;
  if (autoStart && !isFirstLaunch) {
    log.info('Auto-starting gateway...');
    try {
      await wslManager.startGateway();
    } catch (err) {
      log.error('Auto-start gateway failed:', err);
    }
  }
}

// ─── App Lifecycle Events ───────────────────────────────────────

app.whenReady().then(initializeApp).catch((err) => {
  log.error('Failed to initialize application:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  // On Windows, keep running in the system tray unless minimize-to-tray is disabled
  const minimizeToTray = store.get('minimizeToTray') as boolean;
  if (!minimizeToTray) {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', async () => {
  setQuitting(true);
  log.info('Application quitting, shutting down WSL manager...');
  destroyTray();
  try {
    if (wslManager) {
      await wslManager.shutdown();
    }
  } catch (err) {
    log.error('Error during WSL shutdown:', err);
  }
});

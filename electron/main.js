'use strict';
/**
 * Deck TV - Electron main process.
 * Starts the Next.js production server (electron/server.js) in a utilityProcess,
 * then opens a BrowserWindow pointing at http://127.0.0.1:<port>.
 */
const { app, BrowserWindow, Tray, Menu, dialog, shell, utilityProcess, clipboard, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const { runFirstLaunchImport } = require('./migrate');

const APP_NAME = 'Deck TV';
const PREFERRED_PORT = 47300;           // Fixed so localStorage/IndexedDB origin stays stable
const PORT_FALLBACK_RANGE = 20;
const SERVER_READY_TIMEOUT_MS = 90_000;
const FFMPEG_DOWNLOAD_URL = 'https://www.gyan.dev/ffmpeg/builds/';
const SMOKE_TEST = process.env.DECKTV_SMOKE_TEST === '1';

app.setAppUserModelId('com.decktv.app');

const paths = {
  appDir: app.getAppPath(),
  dataDir: app.getPath('userData'),                       // %APPDATA%\Deck TV
  dbPath: path.join(app.getPath('userData'), 'data', 'decktv.db'),
  recordingsDir: path.join(app.getPath('videos'), APP_NAME),
  logsDir: path.join(app.getPath('userData'), 'logs'),
  icon: path.join(__dirname, 'assets', 'icon.ico'),
};

let mainWindow = null;
let tray = null;
let serverProc = null;
let serverUrl = null;
let isQuitting = false;
let trayHintShown = false;

// ---------- Single instance ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(bootstrap);
}

// ---------- Logging ----------
fs.mkdirSync(paths.logsDir, { recursive: true });
const logStream = fs.createWriteStream(path.join(paths.logsDir, 'server.log'), { flags: 'a' });
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  logStream.write(line);
  if (!app.isPackaged || SMOKE_TEST) process.stdout.write(line);
}

// ---------- FFmpeg detection ----------
/** Re-read PATH from the registry so a freshly installed ffmpeg is found without restarting. */
function refreshPathFromRegistry() {
  if (process.platform !== 'win32') return;
  const read = (key) => {
    try {
      const out = execFileSync('reg', ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true });
      const m = out.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
      return m ? m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] || `%${v}%`) : '';
    } catch { return ''; }
  };
  const machine = read('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
  const user = read('HKCU\\Environment');
  const merged = [machine, user, process.env.PATH].filter(Boolean).join(';');
  process.env.PATH = [...new Set(merged.split(';').filter(Boolean))].join(';');
}

function isFfmpegAvailable() {
  const r = spawnSync('ffmpeg', ['-version'], { windowsHide: true, timeout: 10_000 });
  return !r.error && r.status === 0;
}

/** Returns true to continue launching, false to quit. */
async function ensureFfmpeg() {
  if (isFfmpegAvailable()) return true;
  if (SMOKE_TEST) { log('WARN: ffmpeg not found on PATH'); return true; }

  while (true) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: `${APP_NAME} - FFmpeg not found`,
      message: 'FFmpeg was not found on your system PATH.',
      detail:
        'Deck TV uses FFmpeg for DVR recordings and for transcoding streams your player cannot play directly.\n\n' +
        '1. Download a Windows build (e.g. "ffmpeg-release-essentials").\n' +
        '2. Extract it and add its "bin" folder to your PATH.\n' +
        '3. Click "Retry".\n\nYou can also continue without FFmpeg; live TV that plays natively will still work.',
      buttons: ['Download FFmpeg', 'Retry', 'Continue without FFmpeg', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 0) { await shell.openExternal(FFMPEG_DOWNLOAD_URL); continue; }
    if (response === 1) { refreshPathFromRegistry(); if (isFfmpegAvailable()) return true; continue; }
    if (response === 2) return true;
    return false;
  }
}

// ---------- Port selection ----------
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function findPort() {
  for (let p = PREFERRED_PORT; p < PREFERRED_PORT + PORT_FALLBACK_RANGE; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port in range ${PREFERRED_PORT}-${PREFERRED_PORT + PORT_FALLBACK_RANGE - 1}`);
}

// ---------- Network configuration ----------
function getNetworkConfig() {
  try {
    const cfgPath = path.join(paths.dataDir, 'network-settings.json');
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { allowRemote: Boolean(data.allowRemote) };
    }
  } catch (e) {
    log('Failed to read network-settings.json:', e);
  }
  return { allowRemote: false };
}

function getPrimaryLocalIp() {
  try {
    const interfaces = os.networkInterfaces();
    let primary = null;
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          if (
            net.address.startsWith('192.168.') ||
            net.address.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(net.address)
          ) {
            return net.address;
          }
          if (!primary) primary = net.address;
        }
      }
    }
    return primary;
  } catch (_) {
    return null;
  }
}

// ---------- Next.js server ----------
function startServer(port) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(paths.dbPath), { recursive: true });
    fs.mkdirSync(paths.recordingsDir, { recursive: true });

    const netConfig = getNetworkConfig();
    const hostname = netConfig.allowRemote ? '0.0.0.0' : '127.0.0.1';
    log(`Starting server on host ${hostname} (remote access: ${netConfig.allowRemote ? 'enabled' : 'disabled'})`);

    serverProc = utilityProcess.fork(path.join(__dirname, 'server.js'), [], {
      serviceName: 'Deck TV Server',
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: hostname,
        DB_PATH: paths.dbPath,
        DVR_OUTPUT: paths.recordingsDir,
        DECKTV_APP_DIR: paths.appDir,
        DECKTV_DATA_DIR: paths.dataDir,
      },
    });

    serverProc.stdout?.on('data', (d) => log('[server]', d.toString().trimEnd()));
    serverProc.stderr?.on('data', (d) => log('[server:err]', d.toString().trimEnd()));

    const timer = setTimeout(() => reject(new Error('Timed out waiting for the Next.js server to start.')), SERVER_READY_TIMEOUT_MS);

    serverProc.on('message', (msg) => {
      if (msg?.type === 'ready') { clearTimeout(timer); resolve(`http://127.0.0.1:${port}`); }
      if (msg?.type === 'error') { clearTimeout(timer); reject(new Error(msg.message)); }
      if (msg?.type === 'relaunch') {
        log('Relaunch requested from application UI');
        isQuitting = true;
        app.relaunch();
        app.exit(0);
      }
    });

    serverProc.on('exit', (code) => {
      clearTimeout(timer);
      log(`Server process exited with code ${code}`);
      if (!isQuitting) {
        reject(new Error(`Server exited unexpectedly (code ${code}).`));
        if (serverUrl) {
          dialog.showErrorBox(APP_NAME, `The Deck TV server stopped unexpectedly (code ${code}).\nSee logs in:\n${paths.logsDir}`);
          isQuitting = true;
          app.quit();
        }
      }
    });
  });
}

/** Kill the server and its whole process tree (incl. ffmpeg children). */
function stopServer() {
  if (!serverProc?.pid) return;
  try {
    execFileSync('taskkill', ['/PID', String(serverProc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } catch {
    try { serverProc.kill(); } catch (_) {}
  }
  serverProc = null;
}

async function getActiveRecordingCount() {
  try {
    const res = await fetch(`${serverUrl}/api/dvr`, { signal: AbortSignal.timeout(3000) });
    return (await res.json()).activeRecordings || 0;
  } catch { return 0; }
}

// ---------- Window & tray ----------
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Deck TV</title></head>
<body style="margin:0;background:#0b0b0f;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;user-select:none;">
<div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;">Deck TV</div>
<div style="opacity:0.6;margin-top:12px;font-size:14px;">Starting application server...</div>
</body></html>`)}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    icon: paths.icon,
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    show: !SMOKE_TEST,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(LOADING_HTML);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!serverUrl || !url.startsWith(serverUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close -> hide to tray (keeps DVR running)
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && tray) {
      tray.displayBalloon({
        title: APP_NAME,
        content: 'Deck TV is still running in the background so scheduled DVR recordings continue.',
        iconType: 'info'
      });
      trayHintShown = true;
    }
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu(networkUrl = null) {
  if (!tray) return;
  const menuItems = [
    { label: 'Open Deck TV', click: showWindow },
  ];

  if (networkUrl) {
    menuItems.push(
      { type: 'separator' },
      {
        label: `Network URL: ${networkUrl}`,
        click: () => {
          clipboard.writeText(networkUrl);
          if (tray) {
            tray.displayBalloon({
              title: APP_NAME,
              content: `Copied ${networkUrl} to clipboard!`,
              iconType: 'info',
            });
          }
        },
      }
    );
  }

  menuItems.push(
    { type: 'separator' },
    { label: 'Open Recordings Folder', click: () => shell.openPath(paths.recordingsDir) },
    { label: 'Open Data Folder', click: () => shell.openPath(paths.dataDir) },
    { label: 'Open Logs Folder', click: () => shell.openPath(paths.logsDir) },
    { type: 'separator' },
    { label: 'Quit Deck TV', click: () => requestQuit() },
  );

  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
}

function createTray() {
  tray = new Tray(paths.icon);
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on('double-click', showWindow);
}

async function requestQuit() {
  const active = await getActiveRecordingCount();
  if (active > 0) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: APP_NAME,
      message: `${active} recording(s) currently in progress.`,
      detail: 'Quitting Deck TV will terminate active recordings. Are you sure you want to quit?',
      buttons: ['Keep Running', 'Quit Anyway'],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;
  }
  isQuitting = true;
  app.quit();
}

// ---------- Dual-Tier Auto Updater ----------
const UPDATE_FEED_URL = 'https://zerosum.ca/appversions/';

function getAppTier() {
  if (process.env.NEXT_PUBLIC_APP_TIER) return process.env.NEXT_PUBLIC_APP_TIER;
  if (process.env.APP_TIER) return process.env.APP_TIER;
  return app.isPackaged ? 'exe' : 'diy';
}

const APP_TIER = getAppTier();

function setupAutoUpdater() {
  if (APP_TIER !== 'exe' || !app.isPackaged) {
    log(`AutoUpdater skipped (tier=${APP_TIER}, packaged=${app.isPackaged})`);
    return;
  }

  log(`Initializing autoUpdater for ${APP_NAME} (${UPDATE_FEED_URL})...`);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (...args) => log('[updater]', ...args),
    warn: (...args) => log('[updater:warn]', ...args),
    error: (...args) => log('[updater:error]', ...args),
  };

  autoUpdater.channel = 'latestdecktv';
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_FEED_URL,
    channel: 'latestdecktv',
  });

  const sendToRenderer = (channel, ...args) => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    log('autoUpdater: Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log(`autoUpdater: Update available (v${info?.version})`);
    sendToRenderer('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log(`autoUpdater: App is up to date (v${info?.version})`);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('update-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(`autoUpdater: Update downloaded (v${info?.version})`);
    sendToRenderer('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    log('autoUpdater error:', err?.message || err);
    sendToRenderer('update-error', err?.message || String(err));
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log('autoUpdater checkForUpdatesAndNotify error:', err?.message || err);
  });
}

// IPC Handlers
ipcMain.on('restart_app', () => {
  log('IPC restart_app received. Quitting and installing update...');
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

ipcMain.on('check_for_updates', () => {
  if (APP_TIER === 'exe' && app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log('IPC check_for_updates error:', err?.message || err);
    });
  }
});

// ---------- Bootstrap ----------
async function bootstrap() {
  log(`Starting ${APP_NAME} ${app.getVersion()} (packaged=${app.isPackaged})`);
  createWindow();
  createTray();

  try {
    if (!SMOKE_TEST) {
      await runFirstLaunchImport({ paths, parentWindow: mainWindow, log });
    }
    if (!(await ensureFfmpeg())) {
      isQuitting = true;
      return app.quit();
    }

    const port = await findPort();
    if (port !== PREFERRED_PORT) {
      log(`WARN: preferred port ${PREFERRED_PORT} busy; using ${port}`);
    }
    serverUrl = await startServer(port);
    log(`Server ready at ${serverUrl}`);

    const netConfig = getNetworkConfig();
    if (netConfig.allowRemote) {
      const ip = getPrimaryLocalIp();
      if (ip) {
        const netUrl = `http://${ip}:${port}`;
        log(`Accessible on local network at ${netUrl}`);
        updateTrayMenu(netUrl);
      }
    }

    if (SMOKE_TEST) {
      log('Running smoke tests...');
      const res = await fetch(`${serverUrl}/api/setup/status`);
      log(`SMOKE: /api/setup/status -> ${res.status}`);
      const dvr = await fetch(`${serverUrl}/api/dvr`);
      log(`SMOKE: /api/dvr -> ${dvr.status}`);
      isQuitting = true;
      app.exit(res.ok && dvr.ok ? 0 : 1);
      return;
    }

    await mainWindow.loadURL(serverUrl);
    setupAutoUpdater();
  } catch (err) {
    log('FATAL:', err.stack || err);
    if (!SMOKE_TEST) {
      dialog.showErrorBox(`${APP_NAME} failed to start`, `${err.message}\n\nLogs can be found in:\n${paths.logsDir}`);
    }
    isQuitting = true;
    app.exit(1);
  }
}

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', stopServer);
app.on('window-all-closed', () => { /* stay alive in tray */ });
process.on('exit', stopServer);

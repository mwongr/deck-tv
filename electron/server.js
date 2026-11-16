'use strict';
/**
 * Runs inside an Electron utilityProcess.
 * Boots the Next.js production server using next({ dev: false }).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const appDir = process.env.DECKTV_APP_DIR || process.cwd();
const port = Number(process.env.PORT) || 47300;
const hostname = process.env.HOSTNAME || '127.0.0.1';
const send = (msg) => process.parentPort?.postMessage(msg);

// Keep working directory as appDir so Next.js internal path resolution works normally
try {
  process.chdir(appDir);
} catch (e) {
  console.error('Failed to change directory to appDir:', e);
}

// Use the build-time config so next.config doesn't need to be transpiled at runtime.
let conf;
try {
  const reqFilesPath = path.join(appDir, '.next', 'required-server-files.json');
  if (fs.existsSync(reqFilesPath)) {
    conf = JSON.parse(fs.readFileSync(reqFilesPath, 'utf8')).config;
  }
} catch (e) {
  console.warn('Could not read required-server-files.json, falling back to Next default loading:', e);
}

let next;
try {
  next = require(require.resolve('next', { paths: [appDir] }));
} catch (e) {
  next = require('next');
}

const nextApp = next({ dev: false, dir: appDir, hostname, port, conf });
const handle = nextApp.getRequestHandler();

nextApp.prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));
    server.listen(port, hostname, async () => {
      console.log(`Next.js ready on http://${hostname}:${port}`);
      // Load /api/dvr so its built-in DVR scheduler starts immediately (use loopback 127.0.0.1).
      try {
        await fetch(`http://127.0.0.1:${port}/api/dvr`);
        console.log('DVR scheduler warmed up successfully');
      } catch (e) {
        console.error('DVR warm-up failed:', e);
      }
      send({ type: 'ready', port });
    });
    server.on('error', (err) => {
      console.error('Server error:', err);
      send({ type: 'error', message: err.stack || String(err) });
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('Next prepare error:', err);
    send({ type: 'error', message: err.stack || String(err) });
    process.exit(1);
  });

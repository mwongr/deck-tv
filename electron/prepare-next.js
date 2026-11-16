'use strict';

/**
 * Prepares the Next.js build output for Electron packaging.
 * In Next.js 16 (App Router + Turbopack), `serverExternalPackages` creates junction links
 * in `.next/node_modules/` pointing to absolute paths in the workspace `node_modules`.
 * This script replaces those junctions with small re-export shims so that packaged apps
 * find the native modules cleanly at runtime without broken absolute path links.
 */

const path = require('path');
const fs = require('fs');

const nextDir = path.join(process.cwd(), '.next');
const nextNodeModules = path.join(nextDir, 'node_modules');

if (!fs.existsSync(nextNodeModules)) {
  console.log('[prepare-next] No .next/node_modules found, skipping.');
  process.exit(0);
}

const entries = fs.readdirSync(nextNodeModules, { withFileTypes: true });

for (const entry of entries) {
  const fullPath = path.join(nextNodeModules, entry.name);
  let isLink = false;
  let targetPkgName = null;

  try {
    const stat = fs.lstatSync(fullPath);
    isLink = stat.isSymbolicLink();
  } catch (e) {
    console.error(`[prepare-next] Could not lstat ${fullPath}:`, e);
  }

  // On Windows, junctions may report isSymbolicLink or may need target read
  if (isLink || entry.isSymbolicLink()) {
    try {
      const realTarget = fs.realpathSync(fullPath);
      const targetPkgJsonPath = path.join(realTarget, 'package.json');
      if (fs.existsSync(targetPkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(targetPkgJsonPath, 'utf8'));
        targetPkgName = pkg.name;
      }
    } catch (e) {
      console.warn(`[prepare-next] Could not resolve realpath for ${entry.name}:`, e.message);
    }

    if (!targetPkgName) {
      // Fallback: extract base package name from directory name e.g. "better-sqlite3-90e2652d1716b047"
      const match = entry.name.match(/^([a-z0-9@\-_]+)-[a-f0-9]{16}$/i);
      targetPkgName = match ? match[1] : entry.name;
    }

    console.log(`[prepare-next] Replacing junction ${entry.name} -> shim for ${targetPkgName}`);

    // Remove junction
    try {
      // For Windows junctions, rmdirSync or unlinkSync removes the link without deleting target files
      if (process.platform === 'win32') {
        fs.rmdirSync(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    } catch (e) {
      // Fallback
      fs.rmSync(fullPath, { recursive: true, force: true });
    }

    // Create real folder and shim files
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(
      path.join(fullPath, 'package.json'),
      JSON.stringify({ name: entry.name, main: 'index.js' }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(fullPath, 'index.js'),
      `module.exports = require('${targetPkgName}');\n`,
      'utf8'
    );
  }
}

console.log('[prepare-next] Finished preparing .next/node_modules.');

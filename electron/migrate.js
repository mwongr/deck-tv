'use strict';

const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');

async function runFirstLaunchImport({ paths, parentWindow, log = console.log }) {
  const markerFile = path.join(paths.dataDir, '.import-done');
  const targetDb = paths.dbPath;

  // If already marked or DB already exists, skip
  if (fs.existsSync(markerFile) || fs.existsSync(targetDb)) {
    return;
  }

  fs.mkdirSync(paths.dataDir, { recursive: true });

  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    title: 'Deck TV Setup',
    message: 'Welcome to Deck TV!',
    detail: 'Would you like to import existing database channels and recordings from an existing Deck TV folder?',
    buttons: ['Import Existing Data', 'Start Fresh'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response !== 0) {
    fs.writeFileSync(markerFile, new Date().toISOString(), 'utf8');
    log('First launch: User chose to start fresh.');
    return;
  }

  // User chose to import
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select existing Deck TV directory',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    fs.writeFileSync(markerFile, new Date().toISOString(), 'utf8');
    log('First launch: Import cancelled by user, starting fresh.');
    return;
  }

  const sourceDir = result.filePaths[0];
  log(`Importing existing Deck TV data from: ${sourceDir}`);

  let dbImported = false;
  let copiedRecordings = 0;

  // 1. Database check
  let sourceDbDir = path.join(sourceDir, 'data');
  if (!fs.existsSync(path.join(sourceDbDir, 'decktv.db')) && fs.existsSync(path.join(sourceDir, 'decktv.db'))) {
    sourceDbDir = sourceDir;
  }

  const sourceDbFile = path.join(sourceDbDir, 'decktv.db');
  if (fs.existsSync(sourceDbFile)) {
    fs.mkdirSync(path.dirname(paths.dbPath), { recursive: true });
    fs.copyFileSync(sourceDbFile, paths.dbPath);
    for (const ext of ['-wal', '-shm']) {
      const companion = sourceDbFile + ext;
      if (fs.existsSync(companion)) {
        fs.copyFileSync(companion, paths.dbPath + ext);
      }
    }
    dbImported = true;
    log('Imported database files successfully.');
  } else {
    log('No decktv.db found in selected folder.');
  }

  // 2. Recordings check
  let sourceRecDir = path.join(sourceDir, 'recordings');
  if (!fs.existsSync(sourceRecDir)) {
    sourceRecDir = sourceDir;
  }

  fs.mkdirSync(paths.recordingsDir, { recursive: true });

  if (fs.existsSync(sourceRecDir)) {
    const files = fs.readdirSync(sourceRecDir);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.ts')) {
        const srcFile = path.join(sourceRecDir, file);
        const destFile = path.join(paths.recordingsDir, file);
        try {
          fs.copyFileSync(srcFile, destFile);
          copiedRecordings++;
        } catch (e) {
          log(`Failed to copy recording ${file}:`, e);
        }
      }
    }

    // Check for dvr-jobs.json
    const sourceJobsFile = fs.existsSync(path.join(sourceRecDir, 'dvr-jobs.json'))
      ? path.join(sourceRecDir, 'dvr-jobs.json')
      : (fs.existsSync(path.join(sourceDir, 'dvr-jobs.json')) ? path.join(sourceDir, 'dvr-jobs.json') : null);

    if (sourceJobsFile) {
      try {
        const jobsContent = fs.readFileSync(sourceJobsFile, 'utf8');
        const jobs = JSON.parse(jobsContent);
        if (Array.isArray(jobs)) {
          for (const job of jobs) {
            if (job.outputPath) {
              const baseName = path.basename(job.outputPath);
              job.outputPath = path.join(paths.recordingsDir, baseName);
            }
          }
          const targetJobsFile = path.join(paths.recordingsDir, 'dvr-jobs.json');
          fs.writeFileSync(targetJobsFile, JSON.stringify(jobs, null, 2), 'utf8');
          log('Updated and copied dvr-jobs.json.');
        }
      } catch (e) {
        log('Failed to parse or migrate dvr-jobs.json:', e);
      }
    }
  }

  fs.writeFileSync(markerFile, new Date().toISOString(), 'utf8');

  await dialog.showMessageBox(parentWindow, {
    type: 'info',
    title: 'Deck TV - Import Complete',
    message: 'Data import completed.',
    detail: `Database: ${dbImported ? 'Imported' : 'Not found (new will be created)'}\nRecordings: ${copiedRecordings} video file(s) copied.`,
    buttons: ['OK'],
  });
}

module.exports = { runFirstLaunchImport };

/**
 * DVR Service Entry Point
 * 
 * Run with: npx ts-node server/dvr/index.ts
 * Or compile and run: node dist/server/dvr/index.js
 */

import { DVRRecorder } from './recorder';
import { DVRScheduler } from './scheduler';

const OUTPUT_DIR = process.env.DVR_OUTPUT || './recordings';
const API_URL = process.env.DVR_API_URL || 'http://localhost:38472/api/dvr';

console.log('=================================');
console.log('  Deck TV DVR Service');
console.log('=================================');
console.log(`Output directory: ${OUTPUT_DIR}`);
console.log(`API URL: ${API_URL}`);
console.log('');

// Create recorder and scheduler
const recorder = new DVRRecorder(OUTPUT_DIR);
const scheduler = new DVRScheduler(recorder, API_URL);

// Start services
recorder.start();
scheduler.start();

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    scheduler.stop();
    recorder.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    scheduler.stop();
    recorder.stop();
    process.exit(0);
});

console.log('DVR Service is running. Press Ctrl+C to stop.');

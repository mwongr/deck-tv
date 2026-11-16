const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'decktv.db');
const db = new Database(dbPath);

console.log('--- DIAGNOSTIC V2 START ---');

// Specific check for 'kobi.us' and 'eurosport2.fi'
const problematicIds = ['kobi.us', 'eurosport2.fi'];

problematicIds.forEach(id => {
    console.log(`\nChecking for Program ID: "${id}"`);

    // 1. Is it in Channels table exact match?
    const exact = db.prepare('SELECT id, name, tvg_id FROM channels WHERE tvg_id = ?').get(id);
    if (exact) {
        console.log(`  [OK] Found Exact Match in Channels:`, exact);
    } else {
        console.log(`  [FAIL] No Exact Match in Channels table.`);
    }

    // 2. Case insensitive?
    const insensitive = db.prepare('SELECT id, name, tvg_id FROM channels WHERE LOWER(tvg_id) = ?').get(id.toLowerCase());
    if (insensitive) {
        console.log(`  [WARN] Found Case-Insensitive Match:`, insensitive);
    } else {
        console.log(`  [FAIL] No Case-Insensitive Match.`);
    }

    // 3. Is it in the Name?
    const nameMatch = db.prepare('SELECT id, name, tvg_id FROM channels WHERE name LIKE ?').get(`%${id}%`);
    if (nameMatch) {
        console.log(`  [INFO] Found similar Channel Name:`, nameMatch);
    }

    // 4. Do any programs actually use this ID?
    const progCount = db.prepare('SELECT COUNT(*) as count FROM epg_programs WHERE channel_tvg_id = ?').get(id);
    console.log(`  [INFO] Programs using this ID: ${progCount.count}`);
});

console.log('\n--- DIAGNOSTIC V2 END ---');

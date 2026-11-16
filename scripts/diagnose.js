const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'decktv.db');
const db = new Database(dbPath);

console.log('--- DIAGNOSTIC START ---');

// 1. Check a sample of Channels
const channels = db.prepare('SELECT id, name, tvg_id, tvg_name FROM channels LIMIT 5').all();
console.log('\nSample Channels:');
channels.forEach(c => console.log(JSON.stringify(c)));

// 2. Identify Orphaned Programs (sample of 5)
// Find programs where channel_tvg_id is not matching any channel.tvg_id OR name
// Simple check: join on tvg_id
const orphans = db.prepare(`
    SELECT p.id, p.title, p.channel_tvg_id 
    FROM epg_programs p
    LEFT JOIN channels c ON p.channel_tvg_id = c.tvg_id 
    WHERE c.id IS NULL 
    LIMIT 5
`).all();

console.log('\nSample Orphan Programs (mismatch on tvg_id):');
orphans.forEach(o => console.log(JSON.stringify(o)));

// 3. Check if these orphans map to channel names instead?
if (orphans.length > 0) {
    console.log('\nChecking if orphans map to channel names:');
    orphans.forEach(o => {
        const match = db.prepare('SELECT id, name FROM channels WHERE LOWER(name) = ?').get(o.channel_tvg_id.toLowerCase());
        if (match) {
            console.log(`Program "${o.title}" (channel_tvg_id: "${o.channel_tvg_id}") -> MATCHES Channel Name: "${match.name}"`);
        } else {
            console.log(`Program "${o.title}" (channel_tvg_id: "${o.channel_tvg_id}") -> NO MATCH (tried Name too)`);
        }
    });

    // 4. Also check for partial matches or cleaning issues
    console.log('\nChecking for close matches (trimmed/lowercase):');
    orphans.forEach(o => {
        const cleanId = o.channel_tvg_id.trim().toLowerCase();
        const partialMatches = db.prepare(`
            SELECT id, name, tvg_id 
            FROM channels 
            WHERE LOWER(tvg_id) = ? OR LOWER(name) = ?
        `).all(cleanId, cleanId);

        if (partialMatches.length > 0) {
            console.log(`Program "${o.title}" (channel_tvg_id: "${o.channel_tvg_id}") -> FOUND SOFT MATCH:`, partialMatches);
        } else {
            // Maybe it's totally different? Listing similar names?
            const similar = db.prepare(`
                SELECT id, name, tvg_id 
                FROM channels 
                WHERE name LIKE ? OR tvg_id LIKE ? LIMIT 3
             `).all(`%${cleanId}%`, `%${cleanId}%`);
            if (similar.length > 0) {
                console.log(`Program "${o.title}" (channel_tvg_id: "${o.channel_tvg_id}") -> POSSIBLE CANDIDATES:`, similar);
            }
        }
    });
}

console.log('\n--- DIAGNOSTIC END ---');

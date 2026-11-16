import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { schema } from './schema';
import { extractRatingFromTitle } from '@/lib/rating-utils';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'decktv.db');

// Ensure data directory exists
fs.ensureDirSync(path.dirname(DB_PATH));

// Check if we need to initialize (new DB)
const dbExists = fs.existsSync(DB_PATH);

// Singleton pattern for Next.js hot reloading
const globalForDB = global as unknown as { db: Database.Database };

export const db = globalForDB.db || new Database(DB_PATH);
db.pragma('journal_mode = WAL');

if (process.env.NODE_ENV !== 'production') {
    globalForDB.db = db;
}

// Initialize schema if new or missing tables
try {
    // Simple check - verify tables exist. 
    // In production, use migrations. For now, running schema is idempotent due to IF NOT EXISTS.
    db.exec(schema);

    // Migration helper for existing DBs
    const addColumnIfMissing = (table: string, column: string, ddl: string) => {
        try {
            const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
            if (!cols.some(c => c.name === column)) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
            }
        } catch (e) {
            console.error(`Failed to add column ${column} to ${table}:`, e);
        }
    };

    for (const t of ['channels', 'groups']) {
        addColumnIfMissing(t, 'favorite_order', 'favorite_order INTEGER DEFAULT 0');
        addColumnIfMissing(t, 'favorited_at', 'favorited_at DATETIME');
    }

    addColumnIfMissing('channels', 'rating', 'rating REAL');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_favorite ON channels(favorite)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_rating ON channels(rating)`);

    // Ensure custom group tables exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS custom_group_items (
        id TEXT PRIMARY KEY,
        custom_group_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        tvg_id TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(custom_group_id) REFERENCES custom_groups(id) ON DELETE CASCADE,
        FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_custom_group_items ON custom_group_items(custom_group_id);
    `);

    // Backfill existing favorites if favorite_order is 0
    db.exec(`UPDATE channels SET favorite_order = sort_order WHERE favorite = 1 AND (favorite_order = 0 OR favorite_order IS NULL)`);
    db.exec(`UPDATE groups SET favorite_order = sort_order WHERE favorite = 1 AND (favorite_order = 0 OR favorite_order IS NULL)`);

    // Backfill ratings from title for existing movies and series if rating is NULL
    try {
        const rows = db.prepare(`
            SELECT id, name FROM channels 
            WHERE rating IS NULL 
            AND (group_name LIKE 'VOD:%' OR group_name LIKE 'Movies:%' OR group_name LIKE 'Series:%' OR group_name LIKE 'TV Series%')
        `).all() as { id: string; name: string }[];

        if (rows.length > 0) {
            const updateRating = db.prepare('UPDATE channels SET rating = ? WHERE id = ?');
            const updateMany = db.transaction((items: { id: string; rating: number }[]) => {
                for (const item of items) {
                    updateRating.run(item.rating, item.id);
                }
            });

            const toUpdate: { id: string; rating: number }[] = [];
            for (const r of rows) {
                const rating = extractRatingFromTitle(r.name);
                if (rating != null) {
                    toUpdate.push({ id: r.id, rating });
                }
            }

            if (toUpdate.length > 0) {
                updateMany(toUpdate);
                console.log(`Backfilled rating for ${toUpdate.length} channels from titles`);
            }
        }
    } catch (e) {
        console.error('Failed to backfill ratings:', e);
    }

    console.log(`Database initialized at ${DB_PATH}`);
} catch (error) {
    console.error('Failed to initialize database schema:', error);
}

export default db;

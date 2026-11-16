import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
import { PlaylistSource } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sources } = body as { sources: PlaylistSource[] };

        if (!Array.isArray(sources)) {
            return NextResponse.json({ error: 'sources must be an array' }, { status: 400 });
        }

        console.log(`Migrating ${sources.length} sources to server...`);

        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO playlist_sources (id, name, type, url, username, password, xmltv_url, enabled, channel_count, last_sync)
            VALUES (@id, @name, @type, @url, @username, @password, @xmltvUrl, @enabled, @channelCount, @lastSync)
        `);

        const transaction = db.transaction((sources: PlaylistSource[]) => {
            for (const source of sources) {
                insertStmt.run({
                    id: source.id,
                    name: source.name,
                    type: source.type || 'M3U',
                    url: source.url || null,
                    username: source.username || null,
                    password: source.password || null,
                    xmltvUrl: source.xmltvUrl || null,
                    enabled: source.enabled ? 1 : 0,
                    channelCount: source.channelCount || 0,
                    lastSync: source.lastSync ? new Date(source.lastSync).toISOString() : null
                });
            }
        });

        transaction(sources);

        // After inserting sources, we should ideally trigger a sync for them? 
        // Or assume the client will request a refresh?
        // Let's trigger a sync for the first source if exists to populate channels immediately.
        // Actually, let's just return success and let the client UI handle the "Refund/Sync" status.

        return NextResponse.json({ success: true, count: sources.length });

    } catch (error) {
        console.error('Migration failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

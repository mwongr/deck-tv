import { NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
// Actually next.js allows importing from server/db if I configured alias or just relative path?
// My server folder is at root. src is at root.
// If I use @/server/db it might not work unless I configured tsconfig.
// Safe bet: import { db } from '../../../../../server/db' or configure alias.
// Let's check tsconfig.json.

export async function GET() {
    try {
        const playlistSourceCount = db.prepare('SELECT count(*) as count FROM playlist_sources').get() as { count: number };
        const epgSourceCount = db.prepare('SELECT count(*) as count FROM epg_sources').get() as { count: number };

        const isConfigured = playlistSourceCount.count > 0 || epgSourceCount.count > 0;

        return NextResponse.json({
            configured: isConfigured,
            metrics: {
                playlists: playlistSourceCount.count,
                epg: epgSourceCount.count
            }
        });
    } catch (error) {
        console.error('Setup status check failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

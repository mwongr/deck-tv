import { NextRequest, NextResponse } from 'next/server';
import { syncPlaylist, syncEPG } from '../../../../../server/services/sync';
import { db } from '../../../../../server/db';

export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let id = searchParams.get('id');

        if (!id) {
            try {
                const body = await req.json();
                id = body.id;
            } catch (e) {
                // Ignore json parse error if body is empty
            }
        }

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        // Check if it's a playlist source or EPG source
        const playlistSource = db.prepare('SELECT * FROM playlist_sources WHERE id = ?').get(id);

        if (playlistSource) {
            const result = await syncPlaylist(id);
            return NextResponse.json({ success: true, count: result.count });
        }

        const epgSource = db.prepare('SELECT * FROM epg_sources WHERE id = ?').get(id);
        if (epgSource) {
            const result = await syncEPG(id);
            return NextResponse.json({ success: true, count: result.count });
        }

        return NextResponse.json({ error: 'Source not found' }, { status: 404 });

    } catch (error) {
        console.error('Manual Sync Failed:', error);
        return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
}

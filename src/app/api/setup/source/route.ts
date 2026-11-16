import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
import { syncPlaylist, syncEPG } from '../../../../../server/services/sync';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');

        if (type === 'EPG') {
            const sources = db.prepare('SELECT * FROM epg_sources').all();
            const mappedSources = sources.map((s: any) => ({
                id: s.id,
                name: s.name,
                url: s.url,
                enabled: !!s.enabled,
                programCount: s.program_count,
                lastSync: s.last_sync
            }));
            return NextResponse.json({ sources: mappedSources });
        }

        const sources = db.prepare('SELECT * FROM playlist_sources').all();

        const mappedSources = sources.map((s: any) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            url: s.url,
            username: s.username,
            password: s.password,
            xmltvUrl: s.xmltv_url,
            enabled: !!s.enabled,
            channelCount: s.channel_count,
            lastSync: s.last_sync,
            server: s.url
        }));

        return NextResponse.json({ sources: mappedSources });
    } catch (error) {
        console.error('Failed to lists sources:', error);
        return NextResponse.json({ sources: [] }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, type, url, epgUrl, username, password } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Basic validation depending on type
        if (type === 'M3U' && !url) {
            return NextResponse.json({ error: 'URL is required for M3U' }, { status: 400 });
        }
        if (type === 'XTREAM' && (!url || !username || !password)) {
            return NextResponse.json({ error: 'Server, username and password are required' }, { status: 400 });
        }

        const playlistId = randomUUID();
        let epgId = null;

        // 1. Insert Playlist Source
        db.prepare(`
            INSERT INTO playlist_sources (id, name, type, url, username, password, xmltv_url, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(playlistId, name, type || 'M3U', url, username, password, epgUrl);

        // 2. Insert EPG Source if provided
        if (epgUrl) {
            epgId = randomUUID();
            db.prepare(`
                INSERT INTO epg_sources (id, name, url, enabled)
                VALUES (?, ?, ?, 1)
            `).run(epgId, `${name} EPG`, epgUrl);
        }

        // 3. Trigger Sync
        console.log('Starting initial sync...');

        let playlistResult: { count: number } = { count: 0 };
        try {
            playlistResult = await syncPlaylist(playlistId);
        } catch (syncErr) {
            console.error('Sync failed but source added:', syncErr);
        }

        let epgResult = null;

        if (epgId) {
            try {
                epgResult = await syncEPG(epgId);
            } catch (epgSyncErr) {
                console.error('EPG Sync failed:', epgSyncErr);
            }
        }

        return NextResponse.json({
            success: true,
            playlistId,
            epgId,
            stats: {
                channels: playlistResult.count,
                programs: epgResult?.count || 0
            }
        });

    } catch (error) {
        console.error('Failed to add source:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to add source'
        }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const deleteTx = db.transaction((playlistId: string) => {
            db.prepare('DELETE FROM playlist_sources WHERE id = ?').run(playlistId);
        });

        deleteTx(id);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Failed to delete source:', error);
        return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
    }
}

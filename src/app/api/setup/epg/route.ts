import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
import { syncEPG } from '../../../../../server/services/sync';
import { randomUUID } from 'crypto';

/**
 * GET /api/setup/epg - List all EPG sources
 */
export async function GET() {
    try {
        const sources = db.prepare('SELECT * FROM epg_sources ORDER BY created_at DESC').all();
        const mappedSources = sources.map((s: any) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            enabled: !!s.enabled,
            programCount: s.program_count || 0,
            lastSync: s.last_sync,
            refreshInterval: s.refresh_interval || 24,
            createdAt: s.created_at
        }));
        return NextResponse.json({ sources: mappedSources });
    } catch (error) {
        console.error('Failed to list EPG sources:', error);
        return NextResponse.json({ sources: [] }, { status: 500 });
    }
}

/**
 * POST /api/setup/epg - Add a new standalone EPG source
 * Body: { name, url, refreshInterval?, syncNow? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, url, refreshInterval = 24, syncNow = true } = body;

        if (!name || !url) {
            return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
        }

        const id = randomUUID();

        db.prepare(`
            INSERT INTO epg_sources (id, name, url, refresh_interval, enabled)
            VALUES (?, ?, ?, ?, 1)
        `).run(id, name, url, refreshInterval);

        console.log(`Added EPG source: ${name} (${id})`);

        let syncResult = null;
        if (syncNow) {
            try {
                console.log(`Starting immediate sync for EPG: ${name}`);
                syncResult = await syncEPG(id);
                console.log(`EPG sync complete: ${syncResult.count} programs`);
            } catch (syncErr) {
                console.error(`EPG sync failed for ${name}:`, syncErr);
                // Source was added, sync just failed - return partial success
                return NextResponse.json({
                    success: true,
                    id,
                    syncError: syncErr instanceof Error ? syncErr.message : 'Sync failed',
                    programCount: 0
                });
            }
        }

        return NextResponse.json({
            success: true,
            id,
            programCount: syncResult?.count || 0
        });

    } catch (error) {
        console.error('Failed to add EPG source:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to add EPG source'
        }, { status: 500 });
    }
}

/**
 * PUT /api/setup/epg - Update an EPG source
 * Body: { id, name?, url?, refreshInterval?, enabled? }
 */
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name, url, refreshInterval, enabled } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const existing = db.prepare('SELECT * FROM epg_sources WHERE id = ?').get(id);
        if (!existing) {
            return NextResponse.json({ error: 'EPG source not found' }, { status: 404 });
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (url !== undefined) { updates.push('url = ?'); values.push(url); }
        if (refreshInterval !== undefined) { updates.push('refresh_interval = ?'); values.push(refreshInterval); }
        if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }

        if (updates.length > 0) {
            values.push(id);
            db.prepare(`UPDATE epg_sources SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update EPG source:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

/**
 * DELETE /api/setup/epg - Delete an EPG source and its programs
 * Query: ?id=...
 */
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const deleteTx = db.transaction((sourceId: string) => {
            db.prepare('DELETE FROM epg_programs WHERE source_id = ?').run(sourceId);
            db.prepare('DELETE FROM epg_sources WHERE id = ?').run(sourceId);
        });

        deleteTx(id);
        console.log(`Deleted EPG source: ${id}`);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Failed to delete EPG source:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}

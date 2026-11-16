import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/db'; // Adjust path if needed
import { normalizeEPGPrograms } from '@/lib/epg-utils';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const tvgId = searchParams.get('tvgId');
    const tvgIds = searchParams.get('tvgIds'); // Comma separated list
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if ((!tvgId && !tvgIds) || !start || !end) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    try {
        let programs: any[] = [];
        if (tvgIds) {
            const ids = tvgIds.split(',').map(id => id.toLowerCase());
            const placeholders = ids.map(() => '?').join(',');
            programs = db.prepare(`
                SELECT p.* FROM epg_programs p
                JOIN epg_sources s ON s.id = p.source_id
                WHERE s.enabled = 1
                AND LOWER(p.channel_tvg_id) IN (${placeholders})
                AND p.start < ?
                AND p.end > ?
                ORDER BY p.start ASC
            `).all(...ids, end, start);
        } else if (tvgId) {
            programs = db.prepare(`
                SELECT p.* FROM epg_programs p
                JOIN epg_sources s ON s.id = p.source_id
                WHERE s.enabled = 1
                AND LOWER(p.channel_tvg_id) = ?
                AND p.start < ?
                AND p.end > ?
                ORDER BY p.start ASC
            `).all(tvgId.toLowerCase(), end, start);
        }

        // Map to API structure
        const mappedPrograms = programs.map((p: any) => ({
            id: p.id,
            channelTvgId: p.channel_tvg_id,
            title: p.title,
            description: p.description,
            start: p.start,
            end: p.end,
            icon: p.icon,
            category: p.category
        }));

        // Group by channel and normalize timeline to eliminate duplicates and overlaps
        const grouped = new Map<string, typeof mappedPrograms>();
        for (const prog of mappedPrograms) {
            const key = prog.channelTvgId.toLowerCase();
            const list = grouped.get(key) || [];
            list.push(prog);
            grouped.set(key, list);
        }

        const normalizedPrograms: typeof mappedPrograms = [];
        for (const list of grouped.values()) {
            normalizedPrograms.push(...normalizeEPGPrograms(list));
        }

        return NextResponse.json({
            programs: normalizedPrograms
        });
    } catch (e) {
        console.error('EPG Fetch Error:', e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

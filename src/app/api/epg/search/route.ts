import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';

/**
 * Search EPG programs by title/description.
 * Returns matching programs along with channel info if available.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);

    if (!query || query.length < 2) {
        return NextResponse.json({ programs: [] });
    }

    try {
        const now = new Date().toISOString();
        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const searchTerm = `%${query}%`;

        // Search programs by title or description, only future/current programs from enabled sources
        const programs = db.prepare(`
            SELECT 
                p.id, p.channel_tvg_id, p.title, p.description,
                p.start, p.end, p.icon, p.category
            FROM epg_programs p
            JOIN epg_sources s ON s.id = p.source_id
            WHERE s.enabled = 1
            AND (p.title LIKE ? OR p.description LIKE ?)
            AND p.end > ?
            AND p.start < ?
            AND EXISTS (
                SELECT 1 FROM channels c
                WHERE c.tvg_id IS NOT NULL
                AND LOWER(c.tvg_id) = LOWER(p.channel_tvg_id)
            )
            ORDER BY p.start ASC
            LIMIT ?
        `).all(searchTerm, searchTerm, now, future, limit);

        // Get matching channel info for the programs
        const tvgIds = [...new Set(programs.map((p: any) => p.channel_tvg_id))];
        const channelMap = new Map<string, any>();

        if (tvgIds.length > 0) {
            // Build channel lookup - check tvg_id, tvg_name, and name
            const lowerTvgIds = tvgIds.map(id => (id as string).toLowerCase());
            const placeholders = lowerTvgIds.map(() => '?').join(',');
            const channels = db.prepare(`
                SELECT id, name, url, logo, tvg_id, tvg_name, group_id, group_name
                FROM channels
                WHERE LOWER(tvg_id) IN (${placeholders})
            `).all(...lowerTvgIds);

            for (const ch of channels as any[]) {
                if (ch.tvg_id && !channelMap.has(ch.tvg_id.toLowerCase())) {
                    channelMap.set(ch.tvg_id.toLowerCase(), {
                        id: ch.id,
                        name: ch.name,
                        url: ch.url,
                        logo: ch.logo,
                        tvgId: ch.tvg_id,
                        tvgName: ch.tvg_name,
                        groupId: ch.group_id,
                        groupName: ch.group_name
                    });
                }
            }
        }

        const results = programs.map((p: any) => ({
            program: {
                id: p.id,
                channelTvgId: p.channel_tvg_id,
                title: p.title,
                description: p.description,
                start: p.start,
                end: p.end,
                icon: p.icon,
                category: p.category
            },
            channel: p.channel_tvg_id ? (channelMap.get(p.channel_tvg_id.toLowerCase()) || null) : null
        }));

        return NextResponse.json({ results });

    } catch (e) {
        console.error('EPG Search Error:', e);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}

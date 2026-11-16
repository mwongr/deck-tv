import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/db';
import { SQL_IS_LIVE, SQL_IS_MOVIE, SQL_IS_SERIES } from '@/lib/content-type';
import { extractRatingFromTitle } from '@/lib/rating-utils';

function mapChannel(c: any) {
    return {
        id: c.id,
        sourceId: c.source_id,
        name: c.name,
        logo: c.logo || undefined,
        url: c.url,
        groupId: c.group_id,
        groupName: c.group_name,
        tvgId: c.tvg_id || undefined,
        tvgName: c.tvg_name || undefined,
        favorite: c.favorite,
        favoriteOrder: c.favorite_order ?? 0,
        favoritedAt: c.favorited_at,
        catchupSupported: !!c.catchup_supported,
        catchupDays: c.catchup_days,
        catchupSource: c.catchup_source,
        rating: c.rating != null ? Number(c.rating) : (extractRatingFromTitle(c.name) ?? null)
    };
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim();
    const type = searchParams.get('type') || 'all'; // 'all' | 'channels' | 'movies' | 'series' | 'programs'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    if (!query || query.length < 2) {
        return NextResponse.json({
            channels: [],
            movies: [],
            series: [],
            programs: [],
            counts: { channels: 0, movies: 0, series: 0, programs: 0, total: 0 }
        });
    }

    try {
        const searchTerm = `%${query}%`;

        let channels: any[] = [];
        let movies: any[] = [];
        let series: any[] = [];
        let programs: any[] = [];

        // 1. Live channels
        if (type === 'all' || type === 'channels') {
            const chRows = db.prepare(`
                SELECT * FROM channels 
                WHERE name LIKE ? AND ${SQL_IS_LIVE}
                ORDER BY name ASC
                LIMIT ?
            `).all(searchTerm, limit);
            channels = chRows.map(mapChannel);
        }

        // 2. Movies (VOD)
        if (type === 'all' || type === 'movies') {
            const mvRows = db.prepare(`
                SELECT * FROM channels 
                WHERE name LIKE ? AND ${SQL_IS_MOVIE}
                ORDER BY name ASC
                LIMIT ?
            `).all(searchTerm, limit);
            movies = mvRows.map(mapChannel);
        }

        // 3. Series
        if (type === 'all' || type === 'series') {
            const srRows = db.prepare(`
                SELECT * FROM channels 
                WHERE name LIKE ? AND ${SQL_IS_SERIES}
                ORDER BY name ASC
                LIMIT ?
            `).all(searchTerm, limit);
            series = srRows.map(mapChannel);
        }

        // 4. EPG Programs
        if (type === 'all' || type === 'programs') {
            const now = new Date().toISOString();
            const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const pRows = db.prepare(`
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

            // Channel lookup map for EPG programs
            const tvgIds = [...new Set(pRows.map((p: any) => p.channel_tvg_id).filter(Boolean))];
            const channelMap = new Map<string, any>();

            if (tvgIds.length > 0) {
                const lowerTvgIds = tvgIds.map(id => (id as string).toLowerCase());
                const placeholders = lowerTvgIds.map(() => '?').join(',');
                const matchedChannels = db.prepare(`
                    SELECT id, source_id, name, url, logo, tvg_id, tvg_name, group_id, group_name
                    FROM channels
                    WHERE LOWER(tvg_id) IN (${placeholders})
                `).all(...lowerTvgIds);

                for (const ch of matchedChannels as any[]) {
                    if (ch.tvg_id && !channelMap.has(ch.tvg_id.toLowerCase())) {
                        channelMap.set(ch.tvg_id.toLowerCase(), mapChannel(ch));
                    }
                }
            }

            programs = pRows.map((p: any) => ({
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
        }

        const counts = {
            channels: channels.length,
            movies: movies.length,
            series: series.length,
            programs: programs.length,
            total: channels.length + movies.length + series.length + programs.length
        };

        return NextResponse.json({
            channels,
            movies,
            series,
            programs,
            counts
        });

    } catch (e) {
        console.error('Unified Search Error:', e);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}

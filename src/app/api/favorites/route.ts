import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/db';
import { getContentType } from '@/lib/content-type';

export async function GET() {
    try {
        // 1. Fetch favorited channels ordered by favorite_order ASC, then sort_order ASC
        const favChannelsRaw = db.prepare(`
            SELECT * FROM channels 
            WHERE favorite = 1 
            ORDER BY favorite_order ASC, sort_order ASC
        `).all() as any[];

        const mappedChannels = favChannelsRaw.map(c => ({
            id: c.id,
            sourceId: c.source_id,
            name: c.name,
            logo: c.logo,
            url: c.url,
            groupId: c.group_id,
            groupName: c.group_name,
            tvgId: c.tvg_id,
            tvgName: c.tvg_name,
            favorite: c.favorite,
            favoriteOrder: c.favorite_order ?? 0,
            favoritedAt: c.favorited_at,
            catchupSupported: !!c.catchup_supported,
            catchupDays: c.catchup_days,
            catchupSource: c.catchup_source
        }));

        const channels: any[] = [];
        const movies: any[] = [];
        const series: any[] = [];

        for (const item of mappedChannels) {
            const kind = getContentType(item.groupName);
            if (kind === 'movie') {
                movies.push(item);
            } else if (kind === 'series') {
                series.push(item);
            } else {
                channels.push(item);
            }
        }

        // 2. Fetch favorited groups with channel counts
        const favGroupsRaw = db.prepare(`
            SELECT groups.*, 
            (SELECT COUNT(*) FROM channels WHERE channels.group_id = groups.id) as channel_count 
            FROM groups 
            WHERE groups.favorite = 1 AND groups.id != 'favorites'
            ORDER BY groups.favorite_order ASC, groups.sort_order ASC
        `).all() as any[];

        const groups = favGroupsRaw.map(g => ({
            id: g.id,
            name: g.name,
            order: g.sort_order,
            favorite: g.favorite,
            favoriteOrder: g.favorite_order ?? 0,
            favoritedAt: g.favorited_at,
            channelCount: g.channel_count
        }));

        return NextResponse.json({
            channels,
            groups,
            movies,
            series
        });
    } catch (error) {
        console.error('Failed to fetch favorites:', error);
        return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, id, status } = body;

        if (!id || (type !== 'channel' && type !== 'group')) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
        }

        const isFav = status ? 1 : 0;
        const now = new Date().toISOString();

        if (type === 'channel') {
            if (isFav) {
                // Get current max favorite_order
                const maxRow = db.prepare('SELECT MAX(favorite_order) as maxOrder FROM channels WHERE favorite = 1').get() as { maxOrder: number | null };
                const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
                db.prepare(`
                    UPDATE channels 
                    SET favorite = 1, favorite_order = ?, favorited_at = ? 
                    WHERE id = ?
                `).run(nextOrder, now, id);
            } else {
                db.prepare(`
                    UPDATE channels 
                    SET favorite = 0, favorite_order = 0, favorited_at = NULL 
                    WHERE id = ?
                `).run(id);
            }
        } else if (type === 'group') {
            if (isFav) {
                const maxRow = db.prepare('SELECT MAX(favorite_order) as maxOrder FROM groups WHERE favorite = 1').get() as { maxOrder: number | null };
                const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
                db.prepare(`
                    UPDATE groups 
                    SET favorite = 1, favorite_order = ?, favorited_at = ? 
                    WHERE id = ?
                `).run(nextOrder, now, id);
            } else {
                db.prepare(`
                    UPDATE groups 
                    SET favorite = 0, favorite_order = 0, favorited_at = NULL 
                    WHERE id = ?
                `).run(id);
            }
        }

        return NextResponse.json({ success: true, favorite: isFav });
    } catch (error) {
        console.error('Favorite Toggle Error:', error);
        return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
    }
}

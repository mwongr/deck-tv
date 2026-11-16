import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/db';
import { SQL_IS_LIVE } from '@/lib/content-type';
import { extractRatingFromTitle } from '@/lib/rating-utils';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'channels';
    const groupId = searchParams.get('groupId');
    const favorite = searchParams.get('favorite');

    try {
        if (type === 'groups') {
            const category = searchParams.get('category'); // 'vod', 'series', 'live'
            let query = `
                SELECT groups.*, 
                (SELECT COUNT(*) FROM channels WHERE channels.group_id = groups.id) as channel_count 
                FROM groups 
            `;

            if (category === 'vod') {
                query += ` WHERE name LIKE 'VOD:%' OR name LIKE 'Movies:%' `;
            } else if (category === 'series') {
                query += ` WHERE name LIKE 'Series:%' OR name LIKE 'TV Series:%' `;
            } else if (category === 'live') {
                query += ` WHERE name NOT LIKE 'VOD:%' AND name NOT LIKE 'Series:%' AND name NOT LIKE 'Movies:%' AND name NOT LIKE 'TV Series:%' `;
            }

            query += ` ORDER BY sort_order ASC`;

            const groups = db.prepare(query).all();

            // Count only live favorite channels for the shortcut in live TV
            const favoritesCount = db.prepare(`SELECT COUNT(*) as count FROM channels WHERE favorite = 1 AND ${SQL_IS_LIVE}`).get() as { count: number };

            const mappedGroups = groups.map((g: any) => ({
                id: g.id,
                name: g.name,
                order: g.sort_order,
                favorite: g.favorite,
                favoriteOrder: g.favorite_order ?? 0,
                favoritedAt: g.favorited_at,
                channelCount: g.channel_count
            }));

            // Inject Favorite Channels group for 'Live' or generic context
            if (!category || category === 'live') {
                const favGroup = {
                    id: 'favorites',
                    name: 'Favorite Channels',
                    order: -1,
                    favorite: 0,
                    channelCount: favoritesCount.count
                };

                // Also inject user custom groups for Live
                const customLiveGroups = db.prepare(`
                    SELECT cg.*, 
                    (SELECT COUNT(*) FROM custom_group_items WHERE custom_group_items.custom_group_id = cg.id) as channel_count 
                    FROM custom_groups cg 
                    WHERE cg.type = 'live'
                    ORDER BY cg.sort_order ASC
                `).all() as any[];

                const mappedCustom = customLiveGroups.map(cg => ({
                    id: `custom:${cg.id}`,
                    name: `📁 ${cg.name}`,
                    order: -0.5,
                    favorite: 0,
                    channelCount: cg.channel_count,
                    isCustom: true
                }));

                return NextResponse.json({ groups: [favGroup, ...mappedCustom, ...mappedGroups] });
            }

            return NextResponse.json({ groups: mappedGroups });
        }

        // Channels
        let channels: any[] = [];
        if (favorite === '1' || groupId === 'favorites') {
            // Live favorites only in the live TV view
            channels = db.prepare(`
                SELECT * FROM channels 
                WHERE favorite = 1 AND ${SQL_IS_LIVE} 
                ORDER BY favorite_order ASC, sort_order ASC
            `).all();
        } else if (groupId) {
            // Channels for custom group
            if (groupId.startsWith('custom:')) {
                const customGroupId = groupId.replace('custom:', '');
                channels = db.prepare(`
                    SELECT c.* FROM custom_group_items cgi
                    JOIN channels c ON cgi.channel_id = c.id
                    WHERE cgi.custom_group_id = ?
                    ORDER BY cgi.sort_order ASC, c.name ASC
                `).all(customGroupId);
            } else {
                channels = db.prepare('SELECT * FROM channels WHERE group_id = ? ORDER BY sort_order ASC').all(groupId);
            }
        } else {
            channels = [];
        }

        const mappedChannels = channels.map((c: any) => ({
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
            catchupSource: c.catchup_source,
            rating: c.rating != null ? Number(c.rating) : (extractRatingFromTitle(c.name) ?? null)
        }));

        return NextResponse.json({ channels: mappedChannels });

    } catch (error) {
        console.error('Channels Fetch Error:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

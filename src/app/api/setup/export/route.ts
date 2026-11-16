import { NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
import { PlaylistSource, Group, Channel, EPGSource, Settings } from '@/lib/db';

export async function GET() {
    try {
        const playlistSources = db.prepare('SELECT * FROM playlist_sources').all() as PlaylistSource[];
        const epgSources = db.prepare('SELECT * FROM epg_sources').all() as EPGSource[];
        const groupsRaw = db.prepare('SELECT * FROM groups').all() as any[];
        const settings = db.prepare('SELECT * FROM settings').all() as Settings[];

        // Export channels that are favorited OR are included in custom groups
        const savedChannelsRaw = db.prepare(`
            SELECT * FROM channels 
            WHERE favorite = 1 
               OR id IN (SELECT channel_id FROM custom_group_items)
        `).all() as any[];

        const channels = savedChannelsRaw.map(c => ({
            id: c.id,
            sourceId: c.source_id,
            name: c.name,
            logo: c.logo,
            url: c.url,
            groupId: c.group_id,
            groupName: c.group_name,
            tvgId: c.tvg_id,
            tvgName: c.tvg_name,
            catchupSupported: !!c.catchup_supported,
            catchupDays: c.catchup_days,
            catchupSource: c.catchup_source,
            sortOrder: c.sort_order,
            favorite: c.favorite ? 1 : 0,
            favoriteOrder: c.favorite_order ?? 0,
            favoritedAt: c.favorited_at
        }));

        const groups = groupsRaw.map(g => ({
            id: g.id,
            name: g.name,
            channelCount: g.channel_count,
            sortOrder: g.sort_order,
            favorite: g.favorite ? 1 : 0,
            favoriteOrder: g.favorite_order ?? 0,
            favoritedAt: g.favorited_at
        }));

        const customGroupsRaw = db.prepare('SELECT * FROM custom_groups ORDER BY sort_order ASC, created_at ASC').all() as any[];
        const customGroups = customGroupsRaw.map(cg => ({
            id: cg.id,
            name: cg.name,
            type: cg.type,
            sortOrder: cg.sort_order,
            createdAt: cg.created_at
        }));

        const customGroupItemsRaw = db.prepare('SELECT * FROM custom_group_items ORDER BY sort_order ASC, created_at ASC').all() as any[];
        const customGroupItems = customGroupItemsRaw.map(cgi => ({
            id: cgi.id,
            customGroupId: cgi.custom_group_id,
            channelId: cgi.channel_id,
            tvgId: cgi.tvg_id,
            name: cgi.name,
            sortOrder: cgi.sort_order,
            createdAt: cgi.created_at
        }));

        let transcodingSettings = undefined;
        let playerSettings = undefined;
        const transcodingRow = settings.find(s => s.key === 'deck-tv-transcoding-settings');
        if (transcodingRow?.value) {
            try { transcodingSettings = JSON.parse(transcodingRow.value); } catch (e) {}
        }
        const playerRow = settings.find(s => s.key === 'deck-tv-player-settings');
        if (playerRow?.value) {
            try { playerSettings = JSON.parse(playerRow.value); } catch (e) {}
        }

        console.log(`[Export] Found ${channels.length} channels (favorites & custom group items) to export`);
        console.log(`[Export] Found ${groups.length} groups to export`);
        console.log(`[Export] Found ${customGroups.length} custom groups to export`);
        console.log(`[Export] Found ${customGroupItems.length} custom group items to export`);

        const exportData = {
            timestamp: new Date().toISOString(),
            version: 3,
            playlistSources,
            epgSources,
            groups,
            settings,
            favorites: channels,
            channels,
            customGroups,
            customGroupItems,
            ...(transcodingSettings ? { transcodingSettings } : {}),
            ...(playerSettings ? { playerSettings } : {})
        };

        return NextResponse.json(exportData);

    } catch (error) {
        console.error('Export failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

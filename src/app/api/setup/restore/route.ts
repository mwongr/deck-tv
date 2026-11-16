import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            playlistSources,
            epgSources,
            groups,
            favorites,
            channels,
            settings,
            customGroups,
            custom_groups,
            customGroupItems,
            custom_group_items,
            transcodingSettings,
            playerSettings
        } = body;

        const resolvedCustomGroups = customGroups || custom_groups || [];
        const resolvedCustomGroupItems = customGroupItems || custom_group_items || [];
        const resolvedChannels = (Array.isArray(channels) && channels.length > 0)
            ? channels
            : (Array.isArray(favorites) ? favorites : []);

        console.log(`[Restore] Received backup request`);
        console.log(`[Restore] Playlists: ${playlistSources?.length || 0}`);
        console.log(`[Restore] EPGs: ${epgSources?.length || 0}`);
        console.log(`[Restore] Groups: ${groups?.length || 0}`);
        console.log(`[Restore] Channels/Favorites: ${resolvedChannels.length}`);
        console.log(`[Restore] Custom Groups: ${resolvedCustomGroups.length}`);
        console.log(`[Restore] Custom Group Items: ${resolvedCustomGroupItems.length}`);
        console.log(`[Restore] Settings: ${settings?.length || 0}`);

        const counts = {
            playlists: 0,
            epg: 0,
            groups: 0,
            favorites: 0,
            customGroups: 0,
            customGroupItems: 0,
            settings: 0
        };

        const transaction = db.transaction(() => {
            // 0. Clear existing data to ensure exact replica of backup
            // Delete child tables first to respect foreign keys
            db.prepare('DELETE FROM custom_group_items').run();
            db.prepare('DELETE FROM custom_groups').run();
            db.prepare('DELETE FROM epg_programs').run();
            db.prepare('DELETE FROM channels').run();
            db.prepare('DELETE FROM groups').run();
            db.prepare('DELETE FROM playlist_sources').run();
            db.prepare('DELETE FROM epg_sources').run();
            db.prepare('DELETE FROM settings').run();

            // 1. Restore Playlist Sources
            if (Array.isArray(playlistSources) && playlistSources.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO playlist_sources (id, name, type, url, xmltv_url, server, username, password, last_sync, channel_count, enabled, created_at)
                    VALUES (@id, @name, @type, @url, @xmltvUrl, @server, @username, @password, @lastSync, @channelCount, @enabled, @createdAt)
                `);

                for (const source of playlistSources) {
                    stmt.run({
                        id: source.id,
                        name: source.name,
                        type: source.type || 'M3U',
                        url: source.url || null,
                        xmltvUrl: source.xmltvUrl || null,
                        server: source.server || null,
                        username: source.username || null,
                        password: source.password || null,
                        lastSync: source.lastSync ? new Date(source.lastSync).toISOString() : null,
                        channelCount: source.channelCount || 0,
                        enabled: source.enabled ? 1 : 0,
                        createdAt: source.createdAt ? new Date(source.createdAt).toISOString() : new Date().toISOString()
                    });
                    counts.playlists++;
                }
            }

            // 2. Restore EPG Sources
            if (Array.isArray(epgSources) && epgSources.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO epg_sources (id, name, url, refresh_interval, last_sync, program_count, enabled, created_at)
                    VALUES (@id, @name, @url, @refreshInterval, @lastSync, @programCount, @enabled, @createdAt)
                `);

                for (const source of epgSources) {
                    stmt.run({
                        id: source.id,
                        name: source.name,
                        url: source.url,
                        refreshInterval: source.refreshInterval || 24,
                        lastSync: source.lastSync ? new Date(source.lastSync).toISOString() : null,
                        programCount: source.programCount || 0,
                        enabled: source.enabled ? 1 : 0,
                        createdAt: source.createdAt ? new Date(source.createdAt).toISOString() : new Date().toISOString()
                    });
                    counts.epg++;
                }
            }

            // 3. Restore Groups
            if (Array.isArray(groups) && groups.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO groups (id, name, channel_count, sort_order, favorite, favorite_order, favorited_at)
                    VALUES (@id, @name, @channelCount, @sortOrder, @favorite, @favoriteOrder, @favoritedAt)
                `);

                for (const group of groups) {
                    stmt.run({
                        id: group.id,
                        name: group.name,
                        channelCount: group.channelCount ?? group.channel_count ?? 0,
                        sortOrder: group.sortOrder ?? group.sort_order ?? 0,
                        favorite: group.favorite ? 1 : 0,
                        favoriteOrder: group.favoriteOrder ?? group.favorite_order ?? 0,
                        favoritedAt: group.favoritedAt ?? group.favorited_at ?? null
                    });
                    counts.groups++;
                }
            }

            // 4. Restore Channels (Favorites & Custom Group Channels)
            if (resolvedChannels.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO channels (
                        id, source_id, name, logo, url, group_id, group_name, 
                        tvg_id, tvg_name,
                        catchup_supported, catchup_days, catchup_source, 
                        sort_order, favorite, favorite_order, favorited_at
                    )
                    VALUES (
                        @id, @sourceId, @name, @logo, @url, @groupId, @groupName,
                        @tvgId, @tvgName,
                        @catchupSupported, @catchupDays, @catchupSource,
                        @sortOrder, @favorite, @favoriteOrder, @favoritedAt
                    )
                `);

                const insertPlaceholderGroup = db.prepare(`
                    INSERT OR IGNORE INTO groups (id, name, channel_count, sort_order)
                    VALUES (?, ?, 0, 0)
                `);

                for (const channel of resolvedChannels) {
                    try {
                        const sourceId = channel.sourceId || channel.source_id;
                        const groupId = channel.groupId || channel.group_id;
                        const groupName = channel.groupName || channel.group_name || 'Unknown';
                        const tvgId = channel.tvgId || channel.tvg_id || null;
                        const tvgName = channel.tvgName || channel.tvg_name || null;
                        const catchupSupported = (channel.catchupSupported ?? channel.catchup_supported) ? 1 : 0;
                        const catchupDays = channel.catchupDays ?? channel.catchup_days ?? 0;
                        const catchupSource = channel.catchupSource || channel.catchup_source || null;
                        const sortOrder = channel.sortOrder ?? channel.sort_order ?? 0;
                        const isFav = (channel.favorite !== undefined && channel.favorite !== null)
                            ? (channel.favorite ? 1 : 0)
                            : 1;
                        const favoriteOrder = channel.favoriteOrder ?? channel.favorite_order ?? 0;
                        const favoritedAt = channel.favoritedAt || channel.favorited_at || null;

                        if (groupId) {
                            insertPlaceholderGroup.run(groupId, groupName);
                        }

                        stmt.run({
                            id: channel.id,
                            sourceId,
                            name: channel.name,
                            logo: channel.logo || null,
                            url: channel.url,
                            groupId,
                            groupName,
                            tvgId,
                            tvgName,
                            catchupSupported,
                            catchupDays,
                            catchupSource,
                            sortOrder,
                            favorite: isFav,
                            favoriteOrder,
                            favoritedAt
                        });

                        if (isFav) {
                            counts.favorites++;
                        }
                    } catch (e) {
                        console.warn(`[Restore] Failed to restore channel ${channel.name}:`, e);
                    }
                }
            }

            // 5. Restore Custom Groups
            if (resolvedCustomGroups.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO custom_groups (id, name, type, sort_order, created_at)
                    VALUES (@id, @name, @type, @sortOrder, @createdAt)
                `);

                for (const group of resolvedCustomGroups) {
                    if (!group.id || !group.name) continue;
                    try {
                        stmt.run({
                            id: group.id,
                            name: group.name,
                            type: group.type || 'live',
                            sortOrder: group.sortOrder ?? group.sort_order ?? 0,
                            createdAt: group.createdAt ?? group.created_at ?? new Date().toISOString()
                        });
                        counts.customGroups++;
                    } catch (e) {
                        console.warn(`[Restore] Failed to restore custom group ${group.name}:`, e);
                    }
                }
            }

            // 6. Restore Custom Group Items
            if (resolvedCustomGroupItems.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO custom_group_items (id, custom_group_id, channel_id, tvg_id, name, sort_order, created_at)
                    VALUES (@id, @customGroupId, @channelId, @tvgId, @name, @sortOrder, @createdAt)
                `);

                for (const item of resolvedCustomGroupItems) {
                    const customGroupId = item.customGroupId || item.custom_group_id;
                    let channelId = item.channelId || item.channel_id;
                    if (!item.id || !customGroupId || !channelId) continue;

                    // If channelId is missing from channels, try to match by tvg_id or name
                    const existingChannel = db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId);
                    if (!existingChannel) {
                        const tvgId = item.tvgId ?? item.tvg_id;
                        const name = item.name;
                        let match: any = null;
                        if (tvgId) {
                            match = db.prepare('SELECT id FROM channels WHERE tvg_id = ?').get(tvgId);
                        }
                        if (!match && name) {
                            match = db.prepare('SELECT id FROM channels WHERE name = ?').get(name);
                        }
                        if (match) {
                            channelId = match.id;
                        }
                    }

                    try {
                        stmt.run({
                            id: item.id,
                            customGroupId,
                            channelId,
                            tvgId: item.tvgId ?? item.tvg_id ?? null,
                            name: item.name || '',
                            sortOrder: item.sortOrder ?? item.sort_order ?? 0,
                            createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString()
                        });
                        counts.customGroupItems++;
                    } catch (e) {
                        console.warn(`[Restore] Failed to restore custom group item ${item.name || item.id}:`, e);
                    }
                }
            }

            // 7. Restore Settings
            if (Array.isArray(settings) && settings.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO settings (id, key, value)
                    VALUES (@id, @key, @value)
                `);

                for (const setting of settings) {
                    stmt.run({
                        id: setting.id,
                        key: setting.key,
                        value: setting.value
                    });
                    counts.settings++;
                }
            }

            // Also persist transcoding / player settings in settings table if supplied
            if (transcodingSettings) {
                db.prepare(`INSERT OR REPLACE INTO settings (id, key, value) VALUES (?, ?, ?)`)
                    .run('deck-tv-transcoding-settings', 'deck-tv-transcoding-settings', JSON.stringify(transcodingSettings));
            }
            if (playerSettings) {
                db.prepare(`INSERT OR REPLACE INTO settings (id, key, value) VALUES (?, ?, ?)`)
                    .run('deck-tv-player-settings', 'deck-tv-player-settings', JSON.stringify(playerSettings));
            }
        });

        transaction();

        console.log('[Restore] Completed successfully:', counts);

        return NextResponse.json({ success: true, counts });

    } catch (error) {
        console.error('[Restore] API Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
    }
}

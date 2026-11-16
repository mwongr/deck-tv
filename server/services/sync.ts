import { db } from '../db';
import { fetchAndParseM3U } from '@/lib/parsers';
import { fetchAndParseXMLTVStreaming } from '@/lib/parsers/xmltv-stream-parser';
import { parseXtreamRating, extractRatingFromTitle } from '@/lib/rating-utils';
import { randomUUID } from 'crypto';

export async function syncPlaylist(sourceId: string) {
    // 1. Get source details
    const source = db.prepare('SELECT * FROM playlist_sources WHERE id = ?').get(sourceId) as any;
    if (!source) throw new Error(`Source ${sourceId} not found`);

    try {
        console.log(`Syncing playlist: ${source.name} (${source.url})`);

        let channels: any[] = [];
        let groups: string[] = [];

        if (source.type === 'XTREAM') {
            console.log(`Syncing Xtream Codes: ${source.name}`);
            const { XtreamClient } = await import('@/lib/parsers/xtream-client');

            const client = new XtreamClient({
                server: source.url,
                username: source.username,
                password: source.password
            });

            // Helper to safe fetch
            const safeFetch = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
                try {
                    return await promise;
                } catch (e) {
                    console.warn('Sync partial failure:', e);
                    return fallback;
                }
            };

            // Parallel fetch of all content with error handling
            const [
                liveCategories, liveStreams,
                vodCategories, vodStreams,
                seriesCategories, seriesStreams
            ] = await Promise.all([
                safeFetch(client.getLiveCategories(), []),
                safeFetch(client.getLiveStreams(), []),
                safeFetch(client.getVodCategories(), []),
                safeFetch(client.getVodStreams(), []),
                safeFetch(client.getSeriesCategories(), []),
                safeFetch(client.getSeriesStreams(), [])
            ]);

            // Auto-detect and sync EPG for Xtream
            try {
                const xmltvUrl = client.getXMLTVUrl();
                const existingEpg = db.prepare('SELECT id FROM epg_sources WHERE url = ?').get(xmltvUrl) as any;
                let epgId = existingEpg?.id;

                if (!epgId) {
                    console.log('Auto-creating EPG source from Xtream...');
                    epgId = randomUUID();
                    db.prepare('INSERT INTO epg_sources (id, name, url, enabled) VALUES (?, ?, ?, 1)')
                        .run(epgId, `${source.name} EPG`, xmltvUrl);
                }

                // Trigger EPG sync - AWAIT it so it actually completes
                console.log('Syncing EPG from Xtream (this may take a while for large providers)...');
                try {
                    await syncEPG(epgId);
                    console.log('EPG sync completed successfully');
                } catch (epgErr) {
                    console.error('EPG sync failed (will need manual refresh):', epgErr);
                }

            } catch (e) {
                console.warn('Failed to setup Xtream EPG:', e);
            }

            // Create Group Lookup Map (ID -> Name)
            const groupLookup = new Map<string, string>();
            liveCategories.forEach(c => groupLookup.set(c.category_id, c.category_name));
            vodCategories.forEach(c => groupLookup.set(c.category_id, c.category_name));
            seriesCategories.forEach(c => groupLookup.set(c.category_id, c.category_name));

            // Process Live Streams
            const liveChannels = liveStreams.map(s => ({
                name: s.name,
                // Force m3u8 extension for HLS playback in web browser
                url: client.buildStreamUrl(s.stream_id, 'm3u8'),
                logo: s.stream_icon,
                groupTitle: groupLookup.get(s.category_id) || 'Uncategorized',
                tvgId: s.epg_channel_id || s.name,
                tvgName: s.name,
                catchup: !!s.tv_archive,
                catchupDays: s.tv_archive_duration ? parseInt(String(s.tv_archive_duration)) : 0,
                catchupSource: s.tv_archive ? client.buildCatchupUrl(s.stream_id, new Date(), 0) : undefined // Placeholder
            }));

            // Process VOD Streams
            const vodChannels = vodStreams.map(s => {
                const rating = parseXtreamRating(s.rating, s.rating_5based) ?? extractRatingFromTitle(s.name);
                return {
                    name: s.name,
                    // VOD usually uses container extension, defaulting to mp4 if missing
                    url: client.buildVodUrl(s.stream_id, s.container_extension || 'mp4'),
                    logo: s.stream_icon,
                    groupTitle: `VOD: ${groupLookup.get(s.category_id) || 'Uncategorized'}`,
                    tvgId: `vod_${s.stream_id}`,
                    tvgName: s.name,
                    catchup: false,
                    catchupDays: 0,
                    rating
                };
            });

            // Process Series Streams
            const seriesChannels = seriesStreams.map(s => {
                const rating = parseXtreamRating(s.rating, s.rating_5based) ?? extractRatingFromTitle(s.name);
                return {
                    name: s.name,
                    // Series don't have a single URL usually, but we need to store something or handle series differently.
                    // For now, storing empty URL as current schema seemingly treats them as channel entries.
                    // We might need a separate 'Series' table later, but following existing pattern:
                    url: '',
                    logo: s.cover, // Series use 'cover'
                    groupTitle: `Series: ${groupLookup.get(s.category_id) || 'Uncategorized'}`,
                    tvgId: `series_${s.series_id}`,
                    tvgName: s.name,
                    catchup: false,
                    catchupDays: 0,
                    isSeries: true, // Flag for potential future use
                    seriesId: s.series_id,
                    rating
                };
            });

            // Combine all
            channels = [...liveChannels, ...vodChannels, ...seriesChannels];

            // Extract unique groups for DB insertion
            const categorySet = new Set<string>();
            channels.forEach((c: any) => categorySet.add(c.groupTitle));
            groups = Array.from(categorySet);

        } else {
            // M3U
            const result = await fetchAndParseM3U(source.url);
            channels = result.channels.map(ch => ({
                ...ch,
                rating: ch.rating ?? extractRatingFromTitle(ch.name)
            }));
            groups = result.groups;
        }

        console.log(`Parsed ${channels.length} channels and ${groups.length} groups`);

        // 3. Transaction to update DB
        const updateTx = db.transaction(() => {
            // Backup favorites & custom group items for this source
            const existingFavorites = db.prepare('SELECT tvg_id, name, favorite_order, favorited_at FROM channels WHERE source_id = ? AND favorite = 1').all(sourceId) as any[];
            const favoritesMap = new Map<string, { order: number; at: string | null }>();
            existingFavorites.forEach(f => {
                const favData = { order: f.favorite_order ?? 0, at: f.favorited_at ?? null };
                if (f.tvg_id) favoritesMap.set(`tvg:${f.tvg_id}`, favData);
                favoritesMap.set(`name:${f.name}`, favData);
            });

            // Backup custom group items mapping
            const existingGroupItems = db.prepare(`
                SELECT cgi.id, cgi.custom_group_id, cgi.tvg_id, cgi.name, cgi.sort_order 
                FROM custom_group_items cgi
                JOIN channels c ON cgi.channel_id = c.id
                WHERE c.source_id = ?
            `).all(sourceId) as any[];

            // Delete custom group items for this source to prevent dangling / duplicate items
            db.prepare(`
                DELETE FROM custom_group_items 
                WHERE channel_id IN (SELECT id FROM channels WHERE source_id = ?)
            `).run(sourceId);

            // Clear existing channels for this source
            db.prepare('DELETE FROM channels WHERE source_id = ?').run(sourceId);

            // Prepare statements
            const insertGroup = db.prepare(`
        INSERT OR IGNORE INTO groups (id, name, sort_order) VALUES (?, ?, ?)
      `);

            const insertChannel = db.prepare(`
        INSERT INTO channels (
          id, source_id, name, logo, url, group_id, group_name, 
          tvg_id, tvg_name, catchup_supported, catchup_days, catchup_source,
          sort_order, favorite, favorite_order, favorited_at, rating
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            // 4. Process Groups
            const groupMap = new Map<string, string>();

            const existingGroups = db.prepare('SELECT id, name FROM groups').all() as any[];
            for (const g of existingGroups) {
                groupMap.set(g.name, g.id);
            }

            const uniqueGroups = new Set<string>();
            if (groups.length > 0) groups.forEach((g: string) => uniqueGroups.add(g));

            channels.forEach((c: any) => {
                if (c.groupTitle) uniqueGroups.add(c.groupTitle);
                else uniqueGroups.add('Uncategorized');
            });

            let groupOrder = existingGroups.length;
            for (const groupName of uniqueGroups) {
                if (!groupMap.has(groupName)) {
                    const newId = randomUUID();
                    insertGroup.run(newId, groupName, groupOrder++);
                    groupMap.set(groupName, newId);
                }
            }

            // 5. Insert Channels
            let channelOrder = 0;
            // Pre-fetch Uncategorized ID
            const defaultGroupId = groupMap.get('Uncategorized');

            for (const ch of channels) {
                let groupId = groupMap.get(ch.groupTitle || 'Uncategorized');
                if (!groupId && defaultGroupId) groupId = defaultGroupId;
                if (!groupId) continue;

                // Check if was favorite
                let isFavorite = 0;
                let favoriteOrder = 0;
                let favoritedAt: string | null = null;

                const match = (ch.tvgId && favoritesMap.get(`tvg:${ch.tvgId}`)) || favoritesMap.get(`name:${ch.name}`);
                if (match) {
                    isFavorite = 1;
                    favoriteOrder = match.order;
                    favoritedAt = match.at;
                }

                insertChannel.run(
                    randomUUID(),
                    sourceId,
                    ch.name,
                    ch.logo,
                    ch.url,
                    groupId,
                    ch.groupTitle || 'Uncategorized',
                    ch.tvgId,
                    ch.tvgName,
                    ch.catchup ? 1 : 0,
                    ch.catchupDays || 0,
                    ch.catchupSource,
                    channelOrder++,
                    isFavorite,
                    favoriteOrder,
                    favoritedAt,
                    ch.rating ?? null
                );
            }

            // Re-link custom group items
            if (existingGroupItems.length > 0) {
                const insertGroupItem = db.prepare(`
                    INSERT INTO custom_group_items (id, custom_group_id, channel_id, tvg_id, name, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                for (const item of existingGroupItems) {
                    let matchingChannel: any = null;
                    if (item.tvg_id) {
                        matchingChannel = db.prepare('SELECT id FROM channels WHERE source_id = ? AND tvg_id = ?').get(sourceId, item.tvg_id);
                    }
                    if (!matchingChannel && item.name) {
                        matchingChannel = db.prepare('SELECT id FROM channels WHERE source_id = ? AND name = ?').get(sourceId, item.name);
                    }
                    if (matchingChannel) {
                        insertGroupItem.run(
                            randomUUID(),
                            item.custom_group_id,
                            matchingChannel.id,
                            item.tvg_id,
                            item.name,
                            item.sort_order ?? 0
                        );
                    }
                }
            }

            // 6. Update source stats
            db.prepare('UPDATE playlist_sources SET channel_count = ?, last_sync = CURRENT_TIMESTAMP WHERE id = ?')
                .run(channels.length, sourceId);
        });

        updateTx();
        console.log(`Sync completed for ${source.name}`);
        return { success: true, count: channels.length };

    } catch (error) {
        console.error(`Failed to sync playlist ${sourceId}:`, error);
        throw error;
    }
}

export async function syncEPG(sourceId: string) {
    const source = db.prepare('SELECT * FROM epg_sources WHERE id = ?').get(sourceId) as any;
    if (!source) throw new Error(`EPG Source ${sourceId} not found`);

    try {
        console.log(`Syncing EPG: ${source.name} (${source.url})`);

        // Prepare statements
        const insertProgram = db.prepare(`
            INSERT INTO epg_programs (
                id, source_id, channel_tvg_id, title, description, 
                start, end, icon, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Clear existing programs first
        db.prepare('DELETE FROM epg_programs WHERE source_id = ?').run(sourceId);

        let totalProcessed = 0;
        let batch: any[] = [];
        const BATCH_SIZE = 1000;

        // Transaction for batch insert
        const insertBatch = db.transaction((items: any[]) => {
            for (const prog of items) {
                insertProgram.run(
                    randomUUID(),
                    sourceId,
                    prog.channelTvgId,
                    prog.title,
                    prog.description,
                    prog.start.toISOString(),
                    prog.end.toISOString(),
                    prog.icon,
                    prog.category
                );
            }
        });

        // Use streaming parser with callback
        const { channels: xmltvChannels } = await fetchAndParseXMLTVStreaming(source.url, async (prog) => {
            batch.push(prog);
            if (batch.length >= BATCH_SIZE) {
                insertBatch(batch);
                totalProcessed += batch.length;
                batch = [];
                // Update progress in DB occasionally so UI shows something (optional, but good)
                if (totalProcessed % 5000 === 0) {
                    db.prepare('UPDATE epg_sources SET program_count = ?, last_sync = CURRENT_TIMESTAMP WHERE id = ?')
                        .run(totalProcessed, sourceId);
                }
            }
        });

        // Flush remaining items
        if (batch.length > 0) {
            insertBatch(batch);
            totalProcessed += batch.length;
        }

        console.log(`Parsed ${xmltvChannels.length} channels and ${totalProcessed} programs from XMLTV`);

        // Final Update
        db.prepare('UPDATE epg_sources SET program_count = ?, last_sync = CURRENT_TIMESTAMP WHERE id = ?')
            .run(totalProcessed, sourceId);

        // Auto-link Channels: Update tvg_id of channels based on XMLTV Display Names
        // Optimized approach: O(N+M) using in-memory maps instead of O(N*M) SQL queries
        console.log('Auto-linking EPG channels (Optimized)...');

        // 1. Build lookup maps from XMLTV
        const normalize = (s: string) => s.toLowerCase().trim();
        const normalizeFuzzy = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

        const preciseMap = new Map<string, string>();
        const fuzzyMap = new Map<string, string>();

        for (const x of xmltvChannels) {
            if (!x.id) continue;
            // Map display names
            if (x.displayNames) {
                for (const d of x.displayNames) {
                    const pKey = normalize(d);
                    const fKey = normalizeFuzzy(d);
                    if (!preciseMap.has(pKey)) preciseMap.set(pKey, x.id);
                    if (!fuzzyMap.has(fKey)) fuzzyMap.set(fKey, x.id);
                }
            }
            // Map ID itself
            const idKey = normalize(x.id);
            if (!preciseMap.has(idKey)) preciseMap.set(idKey, x.id);
        }

        // 2. Fetch candidates (Unlinked channels)
        const candidates = db.prepare<unknown[], { id: string, name: string }>(
            "SELECT id, name FROM channels WHERE tvg_id IS NULL OR tvg_id = name"
        ).all();

        // 3. Find Matches
        const updates: { id: string, tvgId: string }[] = [];

        for (const ch of candidates) {
            if (!ch.name) continue;

            let matchId = preciseMap.get(normalize(ch.name));
            if (!matchId) matchId = fuzzyMap.get(normalizeFuzzy(ch.name));

            if (matchId) {
                updates.push({ id: ch.id, tvgId: matchId });
            }
        }

        // 4. Batch Update
        if (updates.length > 0) {
            console.log(`Found ${updates.length} matches. Updating DB...`);
            const updateStmt = db.prepare('UPDATE channels SET tvg_id = ? WHERE id = ?');
            const batchUpdate = db.transaction((items: { id: string, tvgId: string }[]) => {
                for (const item of items) updateStmt.run(item.tvgId, item.id);
            });
            batchUpdate(updates);
            console.log('Auto-linking complete.');
        } else {
            console.log('No new links found.');
        }
        // The original code had a db.transaction() wrapper around the auto-linking logic.
        // The new logic is self-contained and performs its own batch update within a transaction if needed.
        // So, the closing `})();` from the original transaction is removed, as the new code doesn't open one at this level.

        console.log(`EPG Sync completed for ${source.name}`);
        return { success: true, count: totalProcessed };

    } catch (error) {
        console.error(`Failed to sync EPG ${sourceId}:`, error);
        throw error;
    }
}

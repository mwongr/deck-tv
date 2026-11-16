import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { Channel, Group } from '@/lib/db/schema';

export function useServerSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sync = async () => {
        try {
            setIsSyncing(true);
            setError(null);

            // Fetch from server
            const response = await fetch('/api/channels');
            if (!response.ok) throw new Error('Failed to fetch channels');

            const data = await response.json();
            const { channels, groups } = data as { channels: Channel[], groups: Group[] };

            if (channels.length === 0) {
                setIsSyncing(false);
                return; // Nothing to sync
            }

            console.log(`Starting sync for ${channels.length} channels...`);

            // Clear existing first
            await db.channels.clear();
            await db.groups.clear();

            // Bulk Add Groups (usually small)
            if (groups.length > 0) await db.groups.bulkAdd(groups);

            // Batch Channels (critical for large lists)
            const BATCH_SIZE = 2000;
            for (let i = 0; i < channels.length; i += BATCH_SIZE) {
                const batch = channels.slice(i, i + BATCH_SIZE);
                await db.channels.bulkAdd(batch);
                console.log(`Synced batch ${i} - ${i + batch.length}`);
            }

            console.log(`Synced all ${channels.length} channels and ${groups.length} groups`);

        } catch (err) {
            console.error('Sync failed:', err);
            setError(err instanceof Error ? err.message : 'Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    // Auto-sync on mount
    useEffect(() => {
        // Only auto-sync if DB is empty
        db.channels.count().then(count => {
            if (count === 0) sync();
        });
    }, []);

    return { sync, isSyncing, error };
}

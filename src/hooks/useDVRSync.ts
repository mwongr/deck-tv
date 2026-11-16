import { useEffect } from 'react';
import { db } from '@/lib/db';

export function useDVRSync() {
    useEffect(() => {
        const sync = async () => {
            try {
                const res = await fetch('/api/dvr');
                if (res.ok) {
                    const data = await res.json();
                    const serverJobs = data.jobs || [];

                    const localJobs = await db.dvrJobs.toArray();
                    const updates: Promise<any>[] = [];

                    for (const sJob of serverJobs) {
                        const local = localJobs.find(j => j.id === sJob.id);

                        // If local doesn't exist, we could add it, but usually local initiates.
                        // However, if we utilize multiple clients, we should add.
                        // For now, let's just update existing.
                        if (local) {
                            const needsUpdate =
                                local.status !== sJob.status ||
                                local.outputPath !== sJob.outputPath ||
                                local.error !== sJob.error ||
                                local.duration !== sJob.duration;

                            if (needsUpdate) {
                                updates.push(db.dvrJobs.update(local.id, {
                                    status: sJob.status,
                                    outputPath: sJob.outputPath,
                                    error: sJob.error,
                                    duration: sJob.duration,
                                    // Make sure dates are Date objects if we update them
                                    endTime: new Date(sJob.endTime)
                                }));
                            }
                        }
                    }

                    if (updates.length > 0) {
                        await Promise.all(updates);
                    }

                    // Re-sync local scheduled jobs to server if they are missing (e.g., after server restart)
                    const serverJobIds = new Set(serverJobs.map((j: any) => j.id));
                    const missingServerJobs = localJobs.filter(
                        j => j.status === 'scheduled' && !serverJobIds.has(j.id)
                    );

                    for (const missingJob of missingServerJobs) {
                        try {
                            await fetch('/api/dvr', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(missingJob)
                            });
                        } catch (err) {
                            console.error(`Failed to push unsynced job ${missingJob.id} to server`, err);
                        }
                    }
                }
            } catch (e) {
                console.error("DVR Sync failed", e);
            }
        };

        const interval = setInterval(sync, 5000);
        sync();

        return () => clearInterval(interval);
    }, []);
}

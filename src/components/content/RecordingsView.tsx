'use client';

import { format, differenceInMinutes } from 'date-fns';
import { Circle, Play, Trash2, Clock, HardDrive, AlertCircle, Square, ExternalLink } from 'lucide-react';
import { db, type DVRJob } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDVRSync } from '@/hooks/useDVRSync';

export function RecordingsView() {
    useDVRSync(); // Sync with backend

    const jobs = useLiveQuery(
        () => db.dvrJobs.orderBy('startTime').reverse().toArray(),
        []
    );

    const handleDelete = async (jobId: string) => {
        if (!confirm('Delete this recording? This will delete the file from disk.')) return;
        
        // Delete from backend (stops process + deletes file + removes from server DB)
        await fetch(`/api/dvr?id=${jobId}&action=delete`, { method: 'DELETE' });
        
        await db.dvrJobs.delete(jobId);
    };

    const handleDeleteAll = async () => {
        if (!confirm('Clear all completed and failed recordings history? This cannot be undone.')) return;
        const allJobs = await db.dvrJobs.toArray();
        const toDelete = allJobs
            .filter(j => j.status === 'completed' || j.status === 'failed')
            .map(j => j.id);
            
        // Delete all fro backend
        await Promise.all(toDelete.map(id => 
             fetch(`/api/dvr?id=${id}&action=delete`, { method: 'DELETE' })
        ));

        await db.dvrJobs.bulkDelete(toDelete);
    };

    const handleCancelJob = async (jobId: string) => {
        if (!confirm('Cancel this scheduled recording?')) return;
        // Remove from backend storage to prevent it from starting
        await fetch(`/api/dvr?id=${jobId}&action=delete`, { method: 'DELETE' });
        await db.dvrJobs.delete(jobId);
    };

    const handleStopRecording = async (jobId: string) => {
        if (!confirm('Stop this recording?')) return;

        // Notify backend to stop process
        await fetch(`/api/dvr?id=${jobId}`, { method: 'DELETE' });

        const now = new Date();
        const job = jobs?.find(j => j.id === jobId);
        if (!job) return;

        await db.dvrJobs.update(jobId, {
            status: 'completed',
            endTime: now,
            duration: Math.round((now.getTime() - new Date(job.startTime).getTime()) / 1000)
        });
    };

    const handlePlayExternal = async (job: DVRJob) => {
        try {
            const res = await fetch('/api/dvr/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: job.id })
            });
            
            if (!res.ok) {
                const data = await res.json();
                alert(`Error: ${data.error || 'Failed to play'}`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to invoke playback');
        }
    };

    const scheduledJobs = jobs?.filter(j => j.status === 'scheduled') || [];
    const recordingJobs = jobs?.filter(j => j.status === 'recording') || [];
    const completedJobs = jobs?.filter(j => j.status === 'completed') || [];
    const failedJobs = jobs?.filter(j => j.status === 'failed') || [];

    const getStatusBadge = (status: DVRJob['status']) => {
        switch (status) {
            case 'scheduled':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-yellow-500/20 text-yellow-500">Scheduled</span>;
            case 'recording':
                return (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-500/20 text-red-500 flex items-center gap-1">
                        <Circle className="w-1.5 h-1.5 fill-current recording-indicator animate-pulse" />
                        Recording
                    </span>
                );
            case 'completed':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-green-500/20 text-green-500">Completed</span>;
            case 'failed':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-500/20 text-red-500">Failed</span>;
            case 'cancelled':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-500/20 text-gray-500">Cancelled</span>;
        }
    };

    if (!jobs || jobs.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                    <HardDrive className="w-16 h-16 text-foreground-muted/20 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No Recordings</h3>
                    <p className="text-foreground-muted">
                        Manage your recording library here. Schedule new recordings from the TV Guide.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-background">
            <div className="p-6 max-w-5xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <Circle className="w-6 h-6 text-red-500" />
                            Recordings Library
                        </h2>
                        <p className="text-foreground-muted mt-1">
                            {jobs.length} total items
                        </p>
                    </div>
                </div>

                {/* Currently Recording */}
                {recordingJobs.length > 0 && (
                    <section>
                        <h3 className="text-sm font-bold text-foreground-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Active Recordings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {recordingJobs.map(job => (
                                <div key={job.id} className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 shadow-lg shadow-red-500/5">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(job.status)}
                                        </div>
                                        <button
                                            onClick={() => handleStopRecording(job.id)}
                                            className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                            title="Stop Recording"
                                        >
                                            <Square className="w-4 h-4 fill-current" />
                                        </button>
                                    </div>
                                    <h4 className="font-semibold text-lg truncate mb-1">{job.programTitle || 'Unknown Program'}</h4>
                                    <p className="text-foreground-secondary text-sm mb-3">{job.channelName}</p>
                                    <div className="flex items-center gap-4 text-xs text-foreground-muted font-mono">
                                        <span>Started {format(job.startTime, 'HH:mm')}</span>
                                        <span>•</span>
                                        <span>Ends {format(job.endTime, 'HH:mm')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Scheduled */}
                {scheduledJobs.length > 0 && (
                    <section>
                        <h3 className="text-sm font-bold text-foreground-secondary uppercase tracking-widest mb-4">Scheduled</h3>
                        <div className="divide-y divide-border border border-border rounded-xl bg-background-secondary overflow-hidden">
                            {scheduledJobs.map(job => (
                                <div key={job.id} className="p-4 flex items-center hover:bg-white/5 transition-colors">
                                    <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0 mr-4">
                                        <Clock className="w-6 h-6 text-yellow-500" />
                                    </div>
                                    <div className="flex-1 min-w-0 mr-4">
                                        <h4 className="font-medium truncate">{job.programTitle || job.channelName}</h4>
                                        <div className="flex items-center gap-2 text-sm text-foreground-secondary mt-0.5">
                                            <span>{job.channelName}</span>
                                            <span className="text-foreground-muted">•</span>
                                            <span>{format(job.startTime, 'EEE, MMM d • HH:mm')}</span>
                                            <span className="text-foreground-muted">•</span>
                                            <span>{differenceInMinutes(job.endTime, job.startTime)} min</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCancelJob(job.id)}
                                        className="p-2 rounded-lg text-foreground-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                        title="Cancel Schedule"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Completed / Library */}
                {(completedJobs.length > 0 || failedJobs.length > 0) && (
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-foreground-secondary uppercase tracking-widest">Library</h3>
                            {completedJobs.length > 0 && (
                                <button 
                                    onClick={handleDeleteAll}
                                    className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Clear All
                                </button>
                            )}
                        </div>
                        
                        <div className="space-y-3">
                            {[...completedJobs, ...failedJobs].sort((a,b) => b.startTime.getTime() - a.startTime.getTime()).map(job => (
                                <div key={job.id} className="group p-4 rounded-xl bg-background-secondary border border-border hover:border-accent-primary/30 transition-all flex items-start gap-4">
                                    {/* Icon / Action Area */}
                                    <div className="w-16 h-16 rounded-lg bg-black/40 flex items-center justify-center shrink-0 overflow-hidden relative group-hover:ring-2 ring-accent-primary/50 transition-all">
                                        {job.status === 'failed' ? (
                                            <AlertCircle className="w-8 h-8 text-red-500" />
                                        ) : (
                                            <HardDrive className="w-8 h-8 text-foreground-muted group-hover:text-accent-primary transition-colors" />
                                        )}
                                        {/* Play Overlay */}
                                        {job.status === 'completed' && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => handlePlayExternal(job)}>
                                                <Play className="w-8 h-8 text-white fill-white" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-semibold text-lg leading-tight mb-1">{job.programTitle || job.channelName}</h4>
                                                <p className="text-sm text-accent-primary font-medium mb-1">{job.channelName}</p>
                                            </div>
                                            {job.status === 'failed' && getStatusBadge(job.status)}
                                        </div>
                                        
                                        <div className="flex items-center gap-3 text-xs text-foreground-muted mt-1">
                                            <span>{format(job.startTime, 'MMM d, yyyy')}</span>
                                            <span>•</span>
                                            <span>{format(job.startTime, 'HH:mm')} - {format(job.endTime, 'HH:mm')}</span>
                                            {job.status === 'completed' && (
                                                <>
                                                    <span>•</span>
                                                    <span>{Math.round(job.duration / 60)} min</span>
                                                </>
                                            )}
                                        </div>

                                        {/* Path / Error */}
                                        {job.outputPath && job.status === 'completed' && (
                                            <div className="mt-2 text-xs text-foreground-muted/50 font-mono truncate bg-black/20 px-2 py-1 rounded w-fit max-w-full">
                                                {job.outputPath}
                                            </div>
                                        )}
                                        {job.error && (
                                            <div className="mt-2 text-xs text-red-400 font-medium">
                                                Error: {job.error}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                        <button
                                            onClick={() => handleDelete(job.id)}
                                            className="p-2 rounded-lg bg-background-tertiary text-foreground-muted hover:bg-red-500 hover:text-white transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

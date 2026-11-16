'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DVRJob } from '@/lib/db';
import { ArrowLeft, Play, Trash2, Calendar, Clock, AlertTriangle, FileVideo } from 'lucide-react';
import Link from 'next/link';
import { VideoPlayer } from '@/components/player/VideoPlayer';

export default function DVRPage() {
    const dvrJobs = useLiveQuery(() => db.dvrJobs.orderBy('startTime').reverse().toArray()) || [];
    const [selectedJob, setSelectedJob] = useState<DVRJob | null>(null);

    // Sync status with server
    useEffect(() => {
        fetch('/api/dvr')
            .then(res => res.json())
            .then(data => {
                if (data.jobs && data.jobs.length > 0) {
                    // Update statuses
                    data.jobs.forEach(async (serverJob: any) => {
                        const local = await db.dvrJobs.get(serverJob.id);
                        if (local && local.status !== serverJob.status) {
                            db.dvrJobs.update(serverJob.id, { status: serverJob.status });
                        }
                    });
                }
            })
            .catch(console.error);
    }, []);

    const handleDelete = async (job: DVRJob) => {
        if (!confirm('Delete this recording?')) return;

        try {
            // Delete from server first (stops if running, deletes file)
            await fetch(`/api/dvr?id=${job.id}`, { method: 'DELETE' });
            // Delete from local DB
            await db.dvrJobs.delete(job.id);
            if (selectedJob?.id === job.id) setSelectedJob(null);
        } catch (e) {
            console.error('Failed to delete', e);
            alert('Failed to delete recording');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'recording': return 'text-red-500 bg-red-500/10';
            case 'completed': return 'text-green-500 bg-green-500/10';
            case 'failed': return 'text-red-400 bg-red-400/10';
            default: return 'text-yellow-500 bg-yellow-500/10';
        }
    };

    return (
        <div className="h-screen bg-background flex flex-col">
            {/* Header */}
            <header className="h-14 bg-background-secondary border-b border-border flex items-center px-4 shrink-0">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-foreground-secondary hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Guide</span>
                </Link>
                <h1 className="text-lg font-semibold ml-6">Recordings</h1>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar List */}
                <div className="w-96 border-r border-border bg-background-secondary overflow-y-auto">
                    {dvrJobs.length === 0 ? (
                        <div className="p-8 text-center text-foreground-muted">
                            <FileVideo className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No recordings found</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-2">
                            {dvrJobs.map(job => (
                                <div
                                    key={job.id}
                                    onClick={() => setSelectedJob(job)}
                                    className={`
                                        p-4 rounded-xl border cursor-pointer transition-all
                                        ${selectedJob?.id === job.id
                                            ? 'bg-accent-primary/10 border-accent-primary'
                                            : 'bg-background-tertiary border-border hover:border-foreground-muted'
                                        }
                                    `}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="font-semibold truncate pr-2">
                                            {job.programTitle || job.channelName}
                                        </div>
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getStatusColor(job.status)}`}>
                                            {job.status}
                                        </span>
                                    </div>

                                    <div className="text-xs text-foreground-secondary space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3 h-3" />
                                            {job.startTime.toLocaleString()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3 h-3" />
                                            {Math.round(job.duration / 60)} min
                                        </div>
                                        <div>{job.channelName}</div>
                                    </div>

                                    {job.status === 'failed' && job.error && (
                                        <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded flex items-start gap-2">
                                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Main Content */}
                <div className="flex-1 bg-black flex flex-col">
                    {selectedJob ? (
                        selectedJob.status === 'completed' ? (
                            <div className="flex-1 relative">
                                {/* Video Player for Recording */}
                                {/* 
                                    Note: We need to serve the file statically or stream it.
                                    Assuming the server api/dvr serves it or we access via static path if allowed.
                                    Currently Next.js doesn't auto-serve outside files.
                                    We might need a route to stream the file: /api/dvr/stream?id=JOB_ID
                                 */}
                                <VideoPlayer 
                                    channel={{
                                        id: selectedJob.id,
                                        name: selectedJob.programTitle || selectedJob.channelName,
                                        url: `/api/dvr/stream?id=${selectedJob.id}`,
                                        groupId: 'recordings',
                                        groupName: 'Recordings',
                                        catchupSupported: false,
                                        order: 0
                                    }} 
                                    className="w-full h-full bg-black"
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-foreground-muted">
                                <div className="text-center">
                                    <p className="text-xl font-semibold mb-2">Recording is {selectedJob.status}</p>
                                    <p>Playback available after completion.</p>

                                    <div className="mt-8 flex gap-4 justify-center">
                                        <button
                                            onClick={() => handleDelete(selectedJob)}
                                            className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete Recording
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-foreground-muted">
                            <p>Select a recording to watch</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

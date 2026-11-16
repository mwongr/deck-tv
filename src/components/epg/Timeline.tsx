'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { format, addHours, startOfHour, differenceInMinutes, isWithinInterval } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, Circle, Calendar, Square, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Channel, EPGProgram, DVRJob } from '@/lib/db';
import { db, getChannelPrograms } from '@/lib/db';
import { normalizeEPGPrograms } from '@/lib/epg-utils';

interface EPGTimelineProps {
    channel: Channel;
    className?: string;
}

const HOUR_WIDTH = 200; // pixels per hour
const TIMELINE_HOURS = 24; // show 24 hours

export function EPGTimeline({ channel, className = '' }: EPGTimelineProps) {
    const router = useRouter();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [programs, setPrograms] = useState<EPGProgram[]>([]);
    const [now, setNow] = useState(new Date());
    const [selectedProgram, setSelectedProgram] = useState<EPGProgram | null>(null);
    const dvrJobs = useLiveQuery(() => db.dvrJobs.toArray()) || [];

    // Load EPG programs for this channel
    useEffect(() => {
        async function loadPrograms() {
            if (!channel.tvgId) {
                setPrograms([]);
                return;
            }

            const startTime = startOfHour(new Date());
            const endTime = addHours(startTime, TIMELINE_HOURS);

            try {
                const params = new URLSearchParams({
                    tvgIds: channel.tvgId,
                    start: startTime.toISOString(),
                    end: endTime.toISOString()
                });

                const res = await fetch(`/api/epg?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    const fetchedPrograms = data.programs.map((p: any) => ({
                        ...p,
                        start: new Date(p.start),
                        end: new Date(p.end)
                    }));
                    setPrograms(normalizeEPGPrograms(fetchedPrograms));
                }
            } catch (error) {
                console.error("Failed to load timeline programs:", error);
            }
        }

        loadPrograms();
    }, [channel.tvgId]);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setNow(new Date());
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    // Scroll to current time on mount
    useEffect(() => {
        if (scrollRef.current) {
            const now = new Date();
            const startOfDay = startOfHour(now);
            const minutesSinceStart = differenceInMinutes(now, startOfDay);
            const scrollPosition = (minutesSinceStart / 60) * HOUR_WIDTH - 100;

            scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
        }
    }, [programs]);

    // Generate hour markers
    const hours = useMemo(() => {
        const startTime = startOfHour(new Date());
        return Array.from({ length: TIMELINE_HOURS }, (_, i) => addHours(startTime, i));
    }, []);

    // Calculate timeline start time
    const timelineStart = useMemo(() => startOfHour(new Date()), []);

    // Calculate position and width for a program
    const getProgramStyle = (program: EPGProgram) => {
        const startMinutes = Math.max(0, differenceInMinutes(program.start, timelineStart));
        const endMinutes = differenceInMinutes(program.end, timelineStart);
        const durationMinutes = Math.max(0, endMinutes - startMinutes);

        return {
            left: `${(startMinutes / 60) * HOUR_WIDTH}px`,
            width: `${Math.max(2, (durationMinutes / 60) * HOUR_WIDTH - 2)}px`,
        };
    };

    // Check if program is currently airing
    const isCurrentProgram = (program: EPGProgram) => {
        return isWithinInterval(now, { start: program.start, end: program.end });
    };

    // Current time indicator position
    const currentTimePosition = useMemo(() => {
        const minutes = differenceInMinutes(now, timelineStart);
        return (minutes / 60) * HOUR_WIDTH;
    }, [now, timelineStart]);

    const handleScheduleRecording = async (program: EPGProgram) => {
        const now = new Date();
        const programStart = new Date(program.start);
        const programEnd = new Date(program.end);
        const isLive = programStart < now;

        const paddingMinutes = 0;
        let startTime: Date;
        let prePadding: number;

        if (isLive) {
            startTime = now;
            prePadding = 0;
        } else {
            startTime = new Date(programStart.getTime() - paddingMinutes * 60 * 1000);
            prePadding = paddingMinutes;
        }

        const postPadding = paddingMinutes;
        const endTime = new Date(programEnd.getTime() + postPadding * 60 * 1000);

        // Create DVR job
        const job: DVRJob = {
            id: crypto.randomUUID(),
            channelId: channel.id,
            channelName: channel.name,
            channelUrl: channel.url,
            programId: program.id,
            programTitle: program.title,
            startTime,
            endTime,
            originalStartTime: programStart,
            originalEndTime: programEnd,
            prePadding,
            postPadding,
            duration: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
            status: isLive ? 'recording' : 'scheduled',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await db.dvrJobs.add(job);

        // Get output path setting
        const pathSetting = await db.settings.where('key').equals('dvrOutputPath').first();
        const outputDir = pathSetting?.value;

        // Notify backend
        await fetch('/api/dvr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...job, outputDir })
        });
        setSelectedProgram(null);

        // Show success message
        const action = isLive ? "Recording started" : "Recording scheduled";
        // alert(`${action}: ${program.title}`); // Removed alert to align with smoother UX or keep if user wanted confirmation? User didnt specify. But navigation is key. User said "take me to record tab". 
        // Actually, user said "take me to the record tab after I click on record".
        // I'll keep alert but minimal or just push.
        // Let's navigation immediately.
        router.push('/?section=recordings');
    };

    const handleStopRecording = async (job: DVRJob) => {
        if (!confirm(job.status === 'recording' ? 'Stop this recording?' : 'Cancel this scheduled recording?')) return;

        try {
            const action = job.status === 'recording' ? 'stop' : 'delete';
            await fetch(`/api/dvr?id=${job.id}&action=${action}`, { method: 'DELETE' });
            
            if (job.status === 'recording') {
                await db.dvrJobs.update(job.id, {
                    status: 'completed',
                    endTime: new Date(),
                    duration: Math.round((Date.now() - new Date(job.startTime).getTime()) / 1000)
                });
            } else {
                await db.dvrJobs.delete(job.id);
            }
            setSelectedProgram(null);
        } catch (e) {
            console.error('Failed to stop recording', e);
        }
    };

    if (!channel.tvgId) {
        return (
            <div className={`bg-background-secondary border-t border-border flex items-center justify-center ${className}`}>
                <div className="text-center py-4">
                    <Calendar className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
                    <p className="text-foreground-muted text-sm">No EPG data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-background-secondary border-t border-border flex flex-col ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-foreground-muted" />
                    <span className="text-sm text-foreground-secondary">
                        {format(now, 'EEEE, MMMM d • HH:mm')}
                    </span>
                </div>
                <span className="text-sm text-foreground-muted">
                    {programs.length} programs
                </span>
            </div>

            {/* Timeline Container */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto relative">
                {/* Timeline Grid */}
                <div
                    className="relative h-full"
                    style={{ width: `${HOUR_WIDTH * TIMELINE_HOURS}px` }}
                >
                    {/* Hour Markers */}
                    <div className="absolute top-0 left-0 right-0 h-6 flex">
                        {hours.map((hour, i) => (
                            <div
                                key={i}
                                className="shrink-0 border-l border-border/50 px-2"
                                style={{ width: `${HOUR_WIDTH}px` }}
                            >
                                <span className="text-xs text-foreground-muted">
                                    {format(hour, 'HH:mm')}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Programs */}
                    <div className="absolute top-7 left-0 right-0 bottom-0 flex items-center">
                        {programs.map(program => {
                            const job = dvrJobs?.find(j => j.programId === program.id && j.channelId === channel.id);
                            const isRecording = job?.status === 'recording';
                            const isScheduled = job?.status === 'scheduled';
                            const isCurrent = isCurrentProgram(program);

                            return (
                                <button
                                    key={program.id}
                                    onClick={() => setSelectedProgram(program)}
                                    className={`
                    epg-program absolute h-[calc(100%-16px)] rounded-lg
                    border transition-all overflow-hidden
                    ${isRecording
                                            ? 'bg-red-900/40 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                            : isScheduled
                                                ? 'bg-red-950/20 border-red-800 border-dashed'
                                                : isCurrent
                                                    ? 'current bg-[#1a2d4b] border-accent-primary'
                                                    : 'bg-background-tertiary border-border hover:border-foreground-muted'
                                        }
                  `}
                                    style={getProgramStyle(program)}
                                >
                                    <div className="p-2 h-full flex flex-col overflow-hidden min-w-0">
                                        <div className="flex items-center gap-1 min-w-0">
                                            {isRecording ? (
                                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)] animate-pulse" />
                                            ) : isScheduled ? (
                                                <div className="w-2 h-2 rounded-full border border-red-500" />
                                            ) : isCurrent ? (
                                                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                                            ) : null}
                                            <span className="text-xs font-medium text-foreground truncate min-w-0">
                                                {program.title}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-foreground-muted truncate min-w-0">
                                            {format(program.start, 'HH:mm')} - {format(program.end, 'HH:mm')}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Current Time Indicator */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{ left: `${currentTimePosition}px` }}
                    >
                        <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-red-500" />
                    </div>
                </div>
            </div>

            {/* Program Details Modal */}
            {selectedProgram && (
                <div
                    className="fixed inset-0 modal-overlay z-50 flex items-center justify-center"
                    onClick={() => setSelectedProgram(null)}
                >
                    <div
                        className="bg-background-secondary rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            {selectedProgram.title}
                        </h3>
                        <p className="text-sm text-foreground-secondary mb-2">
                            {format(selectedProgram.start, 'HH:mm')} - {format(selectedProgram.end, 'HH:mm')}
                            <span className="text-foreground-muted ml-2">
                                ({differenceInMinutes(selectedProgram.end, selectedProgram.start)} min)
                            </span>
                        </p>
                        {selectedProgram.description && (
                            <p className="text-sm text-foreground-muted mb-4">
                                {selectedProgram.description}
                            </p>
                        )}

                        <div className="flex gap-3">
                            {(() => {
                                const activeJob = dvrJobs?.find(j => 
                                    j.programId === selectedProgram.id && 
                                    j.channelId === channel.id
                                );

                                if (activeJob) {
                                    return (
                                        <button
                                            onClick={() => handleStopRecording(activeJob)}
                                            className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                                        >
                                            {activeJob.status === 'recording' ? (
                                                <>
                                                    <Square className="w-4 h-4 fill-current" />
                                                    Stop Recording
                                                </>
                                            ) : (
                                                <>
                                                    <Trash2 className="w-4 h-4" />
                                                    Cancel Schedule
                                                </>
                                            )}
                                        </button>
                                    );
                                }

                                return (
                                    <button
                                        onClick={() => handleScheduleRecording(selectedProgram)}
                                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                                    >
                                        <Circle className="w-4 h-4 fill-current" />
                                        {isCurrentProgram(selectedProgram) ? 'Record' : 'Schedule Recording'}
                                    </button>
                                );
                            })()}
                            <button
                                onClick={() => setSelectedProgram(null)}
                                className="btn-secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

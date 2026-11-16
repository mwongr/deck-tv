'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, addHours, startOfHour, differenceInMinutes, isWithinInterval, subHours, isBefore, isAfter } from 'date-fns';
import { Clock, ChevronLeft, ChevronRight, Circle, Calendar, ChevronDown, Play, CircleDot, X, Info, Star, Eye, Square, Trash2, Pin, Search } from 'lucide-react';
import { db, type Channel, type EPGProgram, type Group, type DVRJob, getChannelPrograms, generateId } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDVRSync } from '@/hooks/useDVRSync';
import { ChannelLogo } from '@/components/ui/ChannelLogo';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { PinButton } from '@/components/ui/PinButton';
import { normalizeEPGPrograms } from '@/lib/epg-utils';

interface EPGGuideProps {
    onChannelSelect: (channel: Channel) => void;
    onProgramSelect?: (program: EPGProgram, channel: Channel) => void;
    initialGroupId?: string | null;
    onGroupChange?: (groupId: string) => void;
}

const HOUR_WIDTH = 180; // pixels per hour
const CHANNEL_HEIGHT = 56; // pixels per channel row
const TIMELINE_HOURS = 24;

interface SelectedProgramInfo {
    program: EPGProgram;
    channel: Channel;
}

export function EPGGuide({ onChannelSelect, onProgramSelect, initialGroupId, onGroupChange }: EPGGuideProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const channelListRef = useRef<HTMLDivElement>(null);
    const groupDropdownRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(new Date());
    const [timelineStart, setTimelineStart] = useState(() => subHours(startOfHour(new Date()), 1));
    const [programsMap, setProgramsMap] = useState<Map<string, EPGProgram[]>>(new Map());
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId || null);
    const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);
    const [groupSearch, setGroupSearch] = useState('');
    const [selectedProgram, setSelectedProgram] = useState<SelectedProgramInfo | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // Reset preview when program selection changes
    useEffect(() => {
        setIsPreviewing(false);
    }, [selectedProgram]);


    const [groups, setGroups] = useState<Group[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(true);

    // Fetch groups
    useEffect(() => {
        async function fetchGroups() {
            try {
                const res = await fetch('/api/channels?type=groups');
                if (res.ok) {
                    const data = await res.json();
                    setGroups(data.groups || []);
                }
            } catch (e) {
                console.error("Failed to fetch groups", e);
            } finally {
                setLoadingGroups(false);
            }
        }
        fetchGroups();
    }, []);

    // Fetch channels when group changes
    useEffect(() => {
        async function fetchChannels() {
            if (!groups.length) return;

            let targetGroupId = selectedGroupId;
            if (!targetGroupId) {
                // Default to favorites if exists, else first group
                const favGroup = groups.find(g => g.id === 'favorites');
                if (favGroup) targetGroupId = 'favorites';
                else targetGroupId = groups[0].id;

                setSelectedGroupId(targetGroupId);
            }

            if (!targetGroupId) return;

            try {
                const query = targetGroupId === 'favorites' ? 'favorite=1' : `groupId=${targetGroupId}`;
                const res = await fetch(`/api/channels?${query}`);
                if (res.ok) {
                    const data = await res.json();
                    setChannels(data.channels);
                }
            } catch (e) {
                console.error("Failed to fetch channels", e);
            }
        }

        fetchChannels();
    }, [selectedGroupId, groups]);

    // Get selected group name
    const selectedGroup = useMemo(() => {
        return groups?.find((g: Group) => g.id === selectedGroupId);
    }, [groups, selectedGroupId]);

    // Filtered and partitioned groups for the dropdown: Favorites -> Pinned -> Rest
    const filteredGroups = useMemo(() => {
        if (!groupSearch.trim()) return groups;
        const q = groupSearch.toLowerCase().trim();
        return groups.filter(g => g.name.toLowerCase().includes(q));
    }, [groups, groupSearch]);

    const favGroup = useMemo(() => {
        return filteredGroups.find(g => g.id === 'favorites');
    }, [filteredGroups]);

    const pinnedGroups = useMemo(() => {
        return filteredGroups.filter(g => g.favorite && g.id !== 'favorites');
    }, [filteredGroups]);

    const otherGroups = useMemo(() => {
        return filteredGroups.filter(g => !g.favorite && g.id !== 'favorites');
    }, [filteredGroups]);

    const handleGroupPinToggle = (groupId: string, newPinned: boolean) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, favorite: newPinned ? 1 : 0 } : g));
    };

    // Auto-scroll group dropdown to selected group when opened
    useEffect(() => {
        if (isGroupSelectorOpen && groupDropdownRef.current && selectedGroupId) {
            const el = groupDropdownRef.current.querySelector(`[data-group-id="${selectedGroupId}"]`) as HTMLElement;
            if (el) {
                el.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [isGroupSelectorOpen, selectedGroupId]);

    // Load EPG programs for visible channels
    useEffect(() => {
        async function loadPrograms() {
            if (!channels || channels.length === 0) return;

            const endTime = addHours(timelineStart, TIMELINE_HOURS);
            const map = new Map<string, EPGProgram[]>();

            // Get all unique TVG IDs from channels
            const tvgIds = channels
                .filter(c => c.tvgId)
                .map(c => c.tvgId)
                .filter((id, index, self) => self.indexOf(id) === index); // unique

            if (tvgIds.length === 0) {
                setProgramsMap(new Map());
                return;
            }

            // Chunk requests to avoid URL length limits
            const chunkSize = 50;
            for (let i = 0; i < tvgIds.length; i += chunkSize) {
                const chunk = tvgIds.slice(i, i + chunkSize);
                try {
                    const params = new URLSearchParams({
                        tvgIds: chunk.join(','),
                        start: timelineStart.toISOString(),
                        end: endTime.toISOString()
                    });

                    const res = await fetch(`/api/epg?${params.toString()}`);
                    if (!res.ok) continue;

                    const data = await res.json();
                    const programs: EPGProgram[] = data.programs.map((p: any) => ({
                        ...p,
                        start: new Date(p.start),
                        end: new Date(p.end)
                    }));

                    // Distribute programs to channels
                    for (const channel of channels) {
                        const tvgId = channel.tvgId;
                        if (tvgId && chunk.includes(tvgId)) {
                            const lowerTvgId = tvgId.toLowerCase();
                            const channelPrograms = programs.filter(p => p.channelTvgId.toLowerCase() === lowerTvgId);
                            const existing = map.get(channel.id) || [];
                            map.set(channel.id, normalizeEPGPrograms([...existing, ...channelPrograms]));
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch EPG chunk", e);
                }
            }

            setProgramsMap(map);
        }

        loadPrograms();
    }, [channels, timelineStart]);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // DVR: Live Query for local jobs
    const dvrJobs = useLiveQuery(() => db.dvrJobs.toArray()) || [];

    // DVR: Sync status with server (Polls every 5s)
    useDVRSync();

    // Channel virtualizer
    const rowVirtualizer = useVirtualizer({
        count: channels?.length || 0,
        getScrollElement: () => channelListRef.current,
        estimateSize: () => CHANNEL_HEIGHT,
        overscan: 5,
    });

    // Sync scroll between channel list and program grid
    const handleScroll = () => {
        if (channelListRef.current && scrollContainerRef.current) {
            const scrollTop = scrollContainerRef.current.scrollTop;
            channelListRef.current.scrollTop = scrollTop;
        }
    };

    // Generate hour markers
    const hours = useMemo(() => {
        return Array.from({ length: TIMELINE_HOURS }, (_, i) => addHours(timelineStart, i));
    }, [timelineStart]);

    // Current time position
    const currentTimePosition = useMemo(() => {
        const minutes = differenceInMinutes(now, timelineStart);
        return (minutes / 60) * HOUR_WIDTH;
    }, [now, timelineStart]);

    // Scroll to current time on mount
    useEffect(() => {
        if (scrollContainerRef.current) {
            const scrollPosition = currentTimePosition - 200;
            scrollContainerRef.current.scrollLeft = Math.max(0, scrollPosition);
        }
    }, []);

    // Navigate time
    const navigateTime = (hoursToAdd: number) => {
        setTimelineStart(prev => addHours(prev, hoursToAdd));
    };

    // Jump to now
    const jumpToNow = () => {
        setTimelineStart(subHours(startOfHour(new Date()), 1));
        if (scrollContainerRef.current) {
            setTimeout(() => {
                const pos = differenceInMinutes(new Date(), timelineStart) / 60 * HOUR_WIDTH - 200;
                scrollContainerRef.current!.scrollLeft = Math.max(0, pos);
            }, 100);
        }
    };

    const getProgramStyle = (program: EPGProgram) => {
        const startMinutes = Math.max(0, differenceInMinutes(program.start, timelineStart));
        const endMinutes = Math.min(
            TIMELINE_HOURS * 60,
            differenceInMinutes(program.end, timelineStart)
        );
        const durationMinutes = Math.max(0, endMinutes - startMinutes);

        return {
            left: `${(startMinutes / 60) * HOUR_WIDTH}px`,
            width: `${Math.max(2, (durationMinutes / 60) * HOUR_WIDTH - 2)}px`,
        };
    };

    const isCurrentProgram = (program: EPGProgram) => {
        return isWithinInterval(now, { start: program.start, end: program.end });
    };

    const isPastProgram = (program: EPGProgram) => {
        return isBefore(program.end, now);
    };

    const isFutureProgram = (program: EPGProgram) => {
        return isAfter(program.start, now);
    };

    // Handle program click
    const handleProgramClick = (program: EPGProgram, channel: Channel) => {
        setSelectedProgram({ program, channel });
    };

    // Handle watch
    const handleWatch = () => {
        if (selectedProgram) {
            onChannelSelect(selectedProgram.channel);
            setSelectedProgram(null);
        }
    };

    // Handle record
    const handleRecord = async () => {
        if (!selectedProgram) return;

        const { program, channel } = selectedProgram;

        try {
            const job: DVRJob = {
                id: generateId(),
                channelId: channel.id,
                channelName: channel.name,
                channelUrl: channel.url,
                programId: program.id,
                programTitle: program.title,
                startTime: program.start > now ? program.start : now,
                endTime: program.end,
                duration: differenceInMinutes(program.end, program.start > now ? program.start : now) * 60,
                status: 'scheduled',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Get output path setting
            const pathSetting = await db.settings.where('key').equals('dvrOutputPath').first();
            const outputDir = pathSetting?.value;
            const jobWithDir = { ...job, outputDir };

            await db.dvrJobs.add(jobWithDir);

            // Sync to server for backend recording
            try {
                await fetch('/api/dvr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(jobWithDir)
                });
            } catch (e) {
                console.error('Failed to sync schedule to server', e);
            }

            alert(`Scheduled recording: ${program.title}`);
            setSelectedProgram(null);
        } catch (err) {
            console.error(err);
            alert('Failed to schedule recording');
        }
    };

    // Handle stop recording
    const handleStopRecording = async (job: DVRJob) => {
        if (!confirm(job.status === 'recording' ? 'Stop this recording?' : 'Cancel this scheduled recording?')) return;

        try {
            // Notify backend
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
            console.error('Failed to stop/cancel recording', e);
            alert('Failed to update recording');
        }
    };

    // Handle group selection
    const handleGroupSelect = (group: Group) => {
        setSelectedGroupId(group.id);
        onGroupChange?.(group.id);
        setIsGroupSelectorOpen(false);
        setGroupSearch('');
    };

    // Navigate to previous/next group
    const navigateGroup = (direction: 'prev' | 'next') => {
        if (!groups || !selectedGroupId) return;
        const currentIndex = groups.findIndex((g: Group) => g.id === selectedGroupId);
        if (currentIndex === -1) return;

        const newIndex = direction === 'prev'
            ? (currentIndex - 1 + groups.length) % groups.length
            : (currentIndex + 1) % groups.length;

        const newGroupId = groups[newIndex].id;
        setSelectedGroupId(newGroupId);
        onGroupChange?.(newGroupId);
    };

    if (!groups || groups.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Calendar className="w-16 h-16 text-foreground-muted mx-auto mb-4 opacity-50" />
                    <p className="text-foreground-secondary text-lg">No channels available</p>
                    <p className="text-foreground-muted text-sm mt-1">Add a playlist in Settings to view the TV Guide</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header with time controls & group selector */}
            <div className="flex items-center justify-between px-4 py-2 bg-background-secondary border-b border-border shrink-0 z-30">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                        <Clock className="w-5 h-5 text-foreground-muted" />
                        <span className="font-semibold text-lg">TV Guide</span>
                    </div>
                    <span className="text-foreground-secondary text-xs hidden xl:inline shrink-0">
                        {format(now, 'EEEE, MMMM d • HH:mm')}
                    </span>

                    <div className="h-5 w-px bg-border/60 mx-1 hidden sm:block shrink-0" />

                    {/* Group Selector Dropdown */}
                    <div className="relative flex items-center gap-1 min-w-0">
                        <button
                            onClick={() => navigateGroup('prev')}
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 hover:border-white/30 text-foreground hover:text-white transition-all shrink-0 shadow-sm"
                            title="Previous group"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => setIsGroupSelectorOpen(!isGroupSelectorOpen)}
                            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/25 hover:border-white/40 text-foreground transition-all text-left min-w-0 shadow-sm"
                            title="Choose Channel Group"
                        >
                            {selectedGroupId === 'favorites' ? (
                                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                            ) : selectedGroup?.favorite ? (
                                <Pin className="w-3.5 h-3.5 fill-accent-primary text-accent-primary shrink-0" />
                            ) : null}
                            <span className="font-semibold text-sm text-foreground max-w-[180px] sm:max-w-[240px] truncate">
                                {selectedGroup?.id === 'favorites' ? 'Favorite Channels' : (selectedGroup?.name || 'Select Group')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/15 font-semibold text-foreground shrink-0">
                                {selectedGroup?.channelCount || 0}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-accent-primary font-bold transition-transform shrink-0 ${isGroupSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <button
                            onClick={() => navigateGroup('next')}
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 hover:border-white/30 text-foreground hover:text-white transition-all shrink-0 shadow-sm"
                            title="Next group"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isGroupSelectorOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => {
                                        setIsGroupSelectorOpen(false);
                                        setGroupSearch('');
                                    }}
                                />

                                <div
                                    className="absolute top-full left-0 mt-1.5 w-80 bg-background-secondary border border-white/20 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
                                    style={{ maxHeight: '420px' }}
                                >
                                    {/* Search input */}
                                    <div className="p-2.5 border-b border-border bg-[#161618] shrink-0">
                                        <div className="relative flex items-center">
                                            <Search className="w-4 h-4 text-accent-primary absolute left-3 pointer-events-none" />
                                            <input
                                                type="text"
                                                placeholder="Search groups..."
                                                value={groupSearch}
                                                onChange={(e) => setGroupSearch(e.target.value)}
                                                className="w-full bg-[#202024] border border-white/25 focus:border-accent-primary rounded-lg pl-9 pr-8 py-2 text-xs font-medium text-foreground placeholder:text-foreground-secondary/70 focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all"
                                                autoFocus
                                            />
                                            {groupSearch && (
                                                <button
                                                    onClick={() => setGroupSearch('')}
                                                    className="absolute right-2.5 text-foreground-secondary hover:text-white p-0.5"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Group list */}
                                    <div ref={groupDropdownRef} className="flex-1 overflow-y-auto">
                                        {/* Favorites */}
                                        {favGroup && (
                                            <div
                                                data-group-id={favGroup.id}
                                                onClick={() => handleGroupSelect(favGroup)}
                                                role="button"
                                                tabIndex={0}
                                                className={`
                                                    w-full flex items-center justify-between px-3.5 py-2.5 
                                                    text-left hover:bg-background-hover transition-colors
                                                    border-b border-border/50 cursor-pointer
                                                    ${favGroup.id === selectedGroupId ? 'bg-accent-primary/10 text-accent-primary font-medium' : ''}
                                                `}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                                                    <span className="text-sm font-semibold truncate">Favorite Channels</span>
                                                </div>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 font-medium text-foreground-secondary shrink-0 ml-2">
                                                    {favGroup.channelCount}
                                                </span>
                                            </div>
                                        )}

                                        {/* Pinned Groups */}
                                        {pinnedGroups.length > 0 && (
                                            <>
                                                <div className="px-3.5 py-1.5 text-[10px] font-bold text-accent-primary uppercase tracking-wider bg-background-tertiary/80 border-b border-border/50 sticky top-0 z-10 flex items-center gap-1.5">
                                                    <Pin className="w-2.5 h-2.5 fill-accent-primary" />
                                                    <span>Pinned Groups ({pinnedGroups.length})</span>
                                                </div>
                                                {pinnedGroups.map((group: Group) => (
                                                    <div
                                                        key={`fav-${group.id}`}
                                                        data-group-id={group.id}
                                                        onClick={() => handleGroupSelect(group)}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`
                                                            w-full flex items-center justify-between px-3.5 py-2.5 
                                                            text-left hover:bg-background-hover transition-colors
                                                            border-b border-border/40 cursor-pointer
                                                            ${group.id === selectedGroupId ? 'bg-accent-primary/10 text-accent-primary font-medium' : ''}
                                                        `}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <PinButton
                                                                id={group.id}
                                                                name={group.name}
                                                                initialPinned={group.favorite}
                                                                onToggle={(pinned) => handleGroupPinToggle(group.id, pinned)}
                                                            />
                                                            <span className="text-sm truncate">{group.name}</span>
                                                        </div>
                                                        <span className="text-xs text-foreground-muted shrink-0 ml-2">
                                                            {group.channelCount}
                                                        </span>
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {/* Rest of the Groups */}
                                        {otherGroups.length > 0 && (
                                            <>
                                                <div className="px-3.5 py-1.5 text-[10px] font-bold text-foreground-muted uppercase tracking-wider bg-background-tertiary/80 border-b border-border/50 sticky top-0 z-10">
                                                    <span>{pinnedGroups.length > 0 ? 'Other Groups' : 'All Groups'} ({otherGroups.length})</span>
                                                </div>
                                                {otherGroups.map((group: Group) => (
                                                    <div
                                                        key={group.id}
                                                        data-group-id={group.id}
                                                        onClick={() => handleGroupSelect(group)}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`
                                                            w-full flex items-center justify-between px-3.5 py-2.5 
                                                            text-left hover:bg-background-hover transition-colors
                                                            border-b border-border/30 last:border-b-0 cursor-pointer
                                                            ${group.id === selectedGroupId ? 'bg-accent-primary/10 text-accent-primary font-medium' : ''}
                                                        `}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <PinButton
                                                                id={group.id}
                                                                name={group.name}
                                                                initialPinned={group.favorite}
                                                                onToggle={(pinned) => handleGroupPinToggle(group.id, pinned)}
                                                            />
                                                            <span className="text-sm truncate">{group.name}</span>
                                                        </div>
                                                        <span className="text-xs text-foreground-muted shrink-0 ml-2">
                                                            {group.channelCount}
                                                        </span>
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {/* No matching groups */}
                                        {!favGroup && pinnedGroups.length === 0 && otherGroups.length === 0 && (
                                            <div className="p-4 text-center text-xs text-foreground-muted">
                                                No groups found matching &ldquo;{groupSearch}&rdquo;
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={async () => {
                            if (confirm('Sync EPG now? This may take a moment.')) {
                                try {
                                    // Fetch EPG source ID (assuming first one for now or loop all)
                                    // Better: Create API that syncs ALL enabled sources
                                    // For now, hardcode the ID we found: '9dc7ada5-1172-40d1-84ee-6f4ef8527059'
                                    // But better to fetch sources first.
                                    // Let's just use a special ID 'all' or similar if API supports it.
                                    // API `src/app/api/setup/sync/route.ts` expects specific ID.
                                    // We'll trust the user has 1 source.

                                    // Trying to find ID from local state if possible or just fetch list
                                    const sourcesRes = await fetch('/api/setup/source?type=EPG');
                                    const sourcesData = await sourcesRes.json();
                                    const sourceId = sourcesData.sources?.[0]?.id || '9dc7ada5-1172-40d1-84ee-6f4ef8527059';

                                    await fetch('/api/setup/sync', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: sourceId })
                                    });
                                    alert('EPG Sync started. Please wait a moment and refresh.');
                                } catch (e) {
                                    alert('Failed to sync');
                                }
                            }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold transition-all mr-2 shadow-sm"
                    >
                        Sync EPG
                    </button>
                    <button
                        onClick={() => navigateTime(-6)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 hover:border-white/30 text-foreground hover:text-white transition-all shadow-sm"
                        title="Back 6 hours"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={jumpToNow}
                        className="px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white text-sm font-semibold transition-all shadow-sm"
                    >
                        Now
                    </button>
                    <button
                        onClick={() => navigateTime(6)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 hover:border-white/30 text-foreground hover:text-white transition-all shadow-sm"
                        title="Forward 6 hours"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Time header */}
            <div className="flex shrink-0 border-b border-border">
                {/* "Today" label cell */}
                <div className="w-52 shrink-0 bg-background-tertiary border-r border-border flex items-center justify-center">
                    <span className="text-sm font-semibold text-foreground-secondary">
                        {format(timelineStart, 'EEEE')}
                    </span>
                </div>

                {/* Hours */}
                <div className="flex-1 overflow-hidden">
                    <div
                        className="flex"
                        style={{ width: `${HOUR_WIDTH * TIMELINE_HOURS}px` }}
                    >
                        {hours.map((hour, i) => (
                            <div
                                key={i}
                                className="border-l border-border/50 px-2 py-2 bg-background-secondary"
                                style={{ width: `${HOUR_WIDTH}px` }}
                            >
                                <span className="text-sm font-medium text-foreground-secondary">
                                    {format(hour, 'HH:mm')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* EPG Grid */}
            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Channel List (fixed left column) */}
                <div
                    ref={channelListRef}
                    className="w-52 shrink-0 overflow-y-auto overflow-x-hidden bg-background-secondary border-r border-border"
                    style={{ scrollbarWidth: 'none' }}
                >
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const channel = channels![virtualRow.index];
                            return (
                                <div
                                    key={channel.id}
                                    onClick={() => onChannelSelect(channel)}
                                    className="absolute left-0 w-full flex items-center gap-2 px-2 border-b border-border/50 hover:bg-background-hover transition-colors cursor-pointer"
                                    style={{
                                        top: virtualRow.start,
                                        height: `${CHANNEL_HEIGHT}px`,
                                    }}
                                    role="button"
                                    tabIndex={0}
                                >
                                    {/* Logo */}
                                    <div className="w-10 h-8 rounded bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0">
                                        <ChannelLogo
                                            src={channel.logo}
                                            alt={channel.name}
                                            fallbackClassName="w-4 h-4 text-foreground-muted"
                                        />
                                    </div>
                                    {/* Name */}
                                    <span className="text-xs font-medium truncate text-left flex-1 flex items-center gap-1.5 min-w-0">
                                        <FavoriteButton
                                            id={channel.id}
                                            name={channel.name}
                                            initialFavorite={channel.favorite}
                                            size="sm"
                                        />
                                        <span className="truncate">{channel.name}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Programs Grid */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-auto"
                    onScroll={handleScroll}
                >
                    <div
                        style={{
                            width: `${HOUR_WIDTH * TIMELINE_HOURS}px`,
                            height: `${(channels?.length || 0) * CHANNEL_HEIGHT}px`,
                            position: 'relative'
                        }}
                    >
                        {/* Programs */}
                        {channels?.map((channel: Channel, index: number) => {
                            const programs = programsMap.get(channel.id) || [];

                            return (
                                <div
                                    key={channel.id}
                                    className="absolute left-0 right-0 border-b border-border/30"
                                    style={{
                                        top: `${index * CHANNEL_HEIGHT}px`,
                                        height: `${CHANNEL_HEIGHT}px`,
                                    }}
                                >
                                    {/* Programs for this channel */}
                                    <div className="relative h-full flex items-center px-0.5">
                                        {programs.map((program) => {
                                            const isCurrent = isCurrentProgram(program);
                                            const isPast = isPastProgram(program);

                                            // Check for DVR Job
                                            const job = dvrJobs?.find(j => j.programId === program.id && j.channelId === channel.id);
                                            const isRecording = job?.status === 'recording';
                                            const isScheduled = job?.status === 'scheduled';

                                            return (
                                                <button
                                                    key={program.id}
                                                    onClick={() => handleProgramClick(program, channel)}
                                                    className={`
                                                        absolute h-[calc(100%-6px)] rounded
                                                        border transition-all overflow-hidden text-left
                                                        ${isRecording
                                                            ? 'bg-red-900 border-red-500 z-20 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                                            : isScheduled
                                                                ? 'bg-red-950 border-red-800 z-20 border-dashed'
                                                                : isCurrent
                                                                    ? 'bg-[#1a2d4b] border-accent-primary z-10'
                                                                    : isPast
                                                                        ? 'bg-[#141414] border-border/30 text-foreground-secondary/70'
                                                                        : 'bg-[#1a1a1a] border-border/50 hover:border-foreground-muted hover:z-10'
                                                        }
                                                    `}
                                                    style={getProgramStyle(program)}
                                                >
                                                    <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden min-w-0">
                                                        <div className="flex items-center gap-1 min-w-0">
                                                            {isRecording ? (
                                                                <Circle className="w-2 h-2 text-red-500 fill-red-500 shrink-0 animate-pulse" />
                                                            ) : isCurrent ? (
                                                                <Circle className="w-1.5 h-1.5 text-green-500 fill-green-500 shrink-0" />
                                                            ) : null}
                                                            <span className="text-xs font-medium text-foreground truncate min-w-0">
                                                                {program.title}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-foreground-muted truncate min-w-0">
                                                            {format(program.start, 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {/* No EPG placeholder */}
                                        {programs.length === 0 && (
                                            <div className="absolute inset-x-1 inset-y-1 rounded bg-background-tertiary/50 flex items-center px-2">
                                                <span className="text-xs text-foreground-muted">(no listings)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Current time indicator */}
                        {currentTimePosition > 0 && currentTimePosition < HOUR_WIDTH * TIMELINE_HOURS && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 pointer-events-none"
                                style={{ left: `${currentTimePosition}px` }}
                            >
                                <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-green-500" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Program Detail Modal */}
            {selectedProgram && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/70 z-50"
                        onClick={() => setSelectedProgram(null)}
                    />

                    {/* Modal */}
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-background-secondary rounded-xl border border-border shadow-2xl z-50 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-start justify-between p-4 border-b border-border">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold truncate">
                                    {selectedProgram.program.title}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm text-foreground-secondary">
                                        {selectedProgram.channel.name}
                                    </p>
                                    <FavoriteButton
                                        id={selectedProgram.channel.id}
                                        name={selectedProgram.channel.name}
                                        initialFavorite={selectedProgram.channel.favorite}
                                        size="md"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedProgram(null)}
                                className="p-2 rounded-lg hover:bg-background-hover transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
                            {/* Preview Player */}
                            {isPreviewing && (
                                <div className="aspect-video w-full bg-black rounded-lg overflow-hidden ring-1 ring-border shadow-lg mb-4">
                                    <VideoPlayer 
                                        channel={selectedProgram.channel} 
                                        className="w-full h-full"
                                    />
                                </div>
                            )}

                            {/* Time info */}
                            <div className="flex items-center gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-foreground-muted" />
                                    <span>
                                        {format(selectedProgram.program.start, 'HH:mm')} - {format(selectedProgram.program.end, 'HH:mm')}
                                    </span>
                                </div>
                                <span className="text-foreground-muted">•</span>
                                <span className="text-foreground-secondary">
                                    {differenceInMinutes(selectedProgram.program.end, selectedProgram.program.start)} min
                                </span>
                                {isCurrentProgram(selectedProgram.program) && (
                                    <>
                                        <span className="text-foreground-muted">•</span>
                                        <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-500 text-xs font-medium">
                                            LIVE
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Description */}
                            {selectedProgram.program.description && (
                                <div className="text-sm text-foreground-secondary">
                                    <div className="flex items-center gap-2 text-foreground-muted mb-1">
                                        <Info className="w-4 h-4" />
                                        <span className="text-xs uppercase tracking-wide">Description</span>
                                    </div>
                                    <p className="line-clamp-4">{selectedProgram.program.description}</p>
                                </div>
                            )}

                            {/* Category */}
                            {selectedProgram.program.category && (
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 rounded bg-accent-primary/10 text-accent-primary text-xs">
                                        {selectedProgram.program.category}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-border flex gap-3">
                            {/* Preview Button */}
                            <button
                                onClick={() => setIsPreviewing(!isPreviewing)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium border transition-colors ${
                                    isPreviewing 
                                        ? 'bg-accent-secondary/10 text-accent-secondary border-accent-secondary/30 hover:bg-accent-secondary/20' 
                                        : 'bg-background-tertiary text-foreground border-border hover:bg-background-hover'
                                }`}
                            >
                                <Eye className="w-5 h-5" />
                                {isPreviewing ? 'Stop Preview' : 'Preview'}
                            </button>

                            {/* Watch button - only for current/past programs */}
                            {!isFutureProgram(selectedProgram.program) && (
                                <button
                                    onClick={handleWatch}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-primary-hover transition-colors"
                                >
                                    <Play className="w-5 h-5" />
                                    Watch Now
                                </button>
                            )}

                            {/* Record/Stop button - only for current/future programs */}
                            {!isPastProgram(selectedProgram.program) && (
                                (() => {
                                    const activeJob = dvrJobs?.find(j => 
                                        j.programId === selectedProgram.program.id && 
                                        j.channelId === selectedProgram.channel.id
                                    );
                                    
                                    if (activeJob) {
                                        return (
                                            <button
                                                onClick={() => handleStopRecording(activeJob)}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                                            >
                                                {activeJob.status === 'recording' ? (
                                                    <>
                                                        <Square className="w-5 h-5 fill-current" />
                                                        Stop Recording
                                                    </>
                                                ) : (
                                                    <>
                                                        <Trash2 className="w-5 h-5" />
                                                        Cancel Schedule
                                                    </>
                                                )}
                                            </button>
                                        );
                                    }

                                    return (
                                        <button
                                            onClick={handleRecord}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 text-red-500 font-medium border border-red-500/30 hover:bg-red-500/20 transition-colors"
                                        >
                                            <CircleDot className="w-5 h-5" />
                                            Record
                                        </button>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

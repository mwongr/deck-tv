'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Play, Clock, Calendar, Radio, Tv2, ChevronDown, Filter, Loader2, Eye } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { db, type Channel, type EPGProgram, type DVRJob, generateId } from '@/lib/db';
import { VideoPlayer } from '../player/VideoPlayer';

interface EPGSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onWatch: (channel: Channel) => void;
    onRecord?: (program: EPGProgram, channel: Channel) => void;
}

interface SearchResult {
    program: EPGProgram;
    channel: Channel | null;
}

type TimeFilter = 'all' | 'now' | 'today' | 'tomorrow' | 'week';

export function EPGSearch({ isOpen, onClose, onWatch, onRecord }: EPGSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
    const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setResults([]);
            setSelectedResult(null);
        }
    }, [isOpen]);

    // Search EPG programs
    useEffect(() => {
        if (!query.trim() || query.length < 2) {
            setResults([]);
            return;
        }

        let cancelled = false;

        async function searchEPG() {
            setIsSearching(true);

            try {
                // 1. Fetch all channels from Dexie for local lookups
                const allChannels = await db.channels.toArray();
                const channelMap = new Map<string, Channel>();

                for (const channel of allChannels) {
                    channelMap.set(channel.id, channel);
                    if (channel.tvgId) {
                        channelMap.set(channel.tvgId, channel);
                        channelMap.set(channel.tvgId.toLowerCase(), channel);
                    }
                    if (channel.name) channelMap.set(channel.name.toLowerCase(), channel);
                }

                if (cancelled) return;

                // 2. Search EPG programs via server API (EPG data lives in SQLite)
                const params = new URLSearchParams({ q: query, limit: '100' });
                const res = await fetch(`/api/epg/search?${params.toString()}`);
                if (cancelled) return;

                if (!res.ok) {
                    setResults([]);
                    return;
                }

                const data = await res.json();

                // Get time range based on filter
                const now = new Date();
                let startTime = new Date(0);
                let endTime = new Date('2100-01-01');

                switch (timeFilter) {
                    case 'now':
                        startTime = now;
                        endTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
                        break;
                    case 'today':
                        startTime = now;
                        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                        break;
                    case 'tomorrow':
                        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
                        break;
                    case 'week':
                        startTime = now;
                        endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                        break;
                }

                // Build results with channel info, applying time filter client-side
                const searchResults: SearchResult[] = (data.results || [])
                    .map((r: any) => {
                        const program: EPGProgram = {
                            ...r.program,
                            start: new Date(r.program.start),
                            end: new Date(r.program.end)
                        };

                        // Use server-provided channel, or fall back to local lookup
                        let channel = r.channel ? r.channel as Channel : null;
                        if (!channel) {
                            const rawId = r.program.channelTvgId?.trim() || '';
                            channel = channelMap.get(rawId) ||
                                channelMap.get(rawId.toLowerCase()) ||
                                null;
                        }

                        return { program, channel };
                    })
                    .filter((r: SearchResult) => {
                        // Apply time filter
                        const programStart = new Date(r.program.start);
                        const programEnd = new Date(r.program.end);
                        if (timeFilter !== 'all') {
                            if (programEnd < startTime || programStart > endTime) return false;
                        }
                        return true;
                    });

                // Sort by start time
                searchResults.sort((a: SearchResult, b: SearchResult) =>
                    new Date(a.program.start).getTime() - new Date(b.program.start).getTime()
                );

                if (!cancelled) setResults(searchResults);
            } catch (error) {
                console.error('EPG search error:', error);
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        }

        const timeoutId = setTimeout(searchEPG, 300);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [query, timeFilter]);

    // Virtualizer for results
    const rowVirtualizer = useVirtualizer({
        count: results.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => 120,
        overscan: 5,
    });

    // Format time range
    const formatTimeRange = (start: Date, end: Date) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const now = new Date();

        const isToday = startDate.toDateString() === now.toDateString();
        const isTomorrow = startDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();

        const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
        const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };

        let datePrefix = '';
        if (isToday) datePrefix = 'Today';
        else if (isTomorrow) datePrefix = 'Tomorrow';
        else datePrefix = startDate.toLocaleDateString(undefined, dateOptions);

        const startTime = startDate.toLocaleTimeString(undefined, timeOptions);
        const endTime = endDate.toLocaleTimeString(undefined, timeOptions);

        return `${datePrefix} ${startTime} - ${endTime}`;
    };

    // Calculate duration
    const getDuration = (start: Date, end: Date) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }
        return `${minutes}m`;
    };

    // Check if program is live now
    const isLive = (program: EPGProgram) => {
        const now = new Date();
        const start = new Date(program.start);
        const end = new Date(program.end);
        return start <= now && end > now;
    };

    // Handle watch
    const handleWatch = (result: SearchResult) => {
        if (result.channel) {
            onWatch(result.channel);
            onClose();
        }
    };

    // Handle record
    const handleRecord = async (result: SearchResult) => {
        if (!result.channel) return;

        setIsRecording(true);
        try {
            const job: DVRJob = {
                id: generateId(),
                channelId: result.channel.id,
                channelName: result.channel.name,
                channelUrl: result.channel.url,
                programId: result.program.id,
                programTitle: result.program.title,
                startTime: new Date(result.program.start),
                endTime: new Date(result.program.end),
                duration: Math.round(
                    (new Date(result.program.end).getTime() - new Date(result.program.start).getTime()) / 1000
                ),
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

            if (onRecord) {
                onRecord(result.program, result.channel);
            }

            // Brief visual feedback
            setSelectedResult(result);
            setTimeout(() => setSelectedResult(null), 2000);
        } catch (error) {
            console.error('Failed to schedule recording:', error);
        } finally {
            setIsRecording(false);
        }
    };

    // Handle preview
    const handlePreview = (result: SearchResult, e: React.MouseEvent) => {
        e.stopPropagation();
        if (result.channel) {
            setPreviewChannel(result.channel);
        }
    };

    // Get quality indicator from channel name
    const getQualityBadge = (channelName: string) => {
        const name = channelName.toUpperCase();
        if (name.includes('4K') || name.includes('UHD')) return { label: '4K', color: 'bg-purple-600' };
        if (name.includes('FHD') || name.includes('1080')) return { label: 'FHD', color: 'bg-blue-600' };
        if (name.includes('HD') || name.includes('720')) return { label: 'HD', color: 'bg-green-600' };
        if (name.includes('SD')) return { label: 'SD', color: 'bg-gray-600' };
        return null;
    };

    // Time filter options
    const timeFilterOptions: { value: TimeFilter; label: string }[] = [
        { value: 'all', label: 'All Times' },
        { value: 'now', label: 'Next 3 Hours' },
        { value: 'today', label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
        { value: 'week', label: 'This Week' },
    ];

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-[8vh]"
            onClick={onClose}
        >
            <div
                className="bg-background-secondary rounded-2xl border border-border w-full max-w-4xl mx-4 shadow-2xl overflow-hidden animate-fade-in"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-border">
                    {/* Search Input */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-background-tertiary rounded-xl">
                            <Search className="w-5 h-5 text-foreground-muted shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search programs (e.g., 'Real Madrid', 'Champions League', 'NFL')..."
                                className="flex-1 bg-transparent text-foreground text-lg placeholder:text-foreground-muted focus:outline-none"
                            />
                            {isSearching && <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 rounded-xl bg-background-tertiary hover:bg-background-hover transition-colors"
                        >
                            <X className="w-5 h-5 text-foreground-muted" />
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${showFilters ? 'bg-accent-primary text-white' : 'bg-background-tertiary hover:bg-background-hover'
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            <span className="text-sm">Filters</span>
                        </button>

                        {timeFilterOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => setTimeFilter(option.value)}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${timeFilter === option.value
                                    ? 'bg-accent-primary text-white'
                                    : 'bg-background-tertiary hover:bg-background-hover text-foreground-secondary'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results */}
                <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 160px)' }}>
                    {query.length > 0 && query.length < 2 ? (
                        <div className="p-8 text-center">
                            <p className="text-foreground-muted">Type at least 2 characters to search</p>
                        </div>
                    ) : query && results.length === 0 && !isSearching ? (
                        <div className="p-8 text-center">
                            <Search className="w-12 h-12 text-foreground-muted mx-auto mb-4 opacity-50" />
                            <p className="text-foreground-secondary">No programs found for &quot;{query}&quot;</p>
                            <p className="text-sm text-foreground-muted mt-1">Try a different search term or adjust filters</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                const result = results[virtualRow.index];
                                const live = isLive(result.program);
                                const quality = result.channel ? getQualityBadge(result.channel.name) : null;
                                const isSelected = selectedResult?.program.id === result.program.id;

                                return (
                                    <div
                                        key={result.program.id}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <div className={`p-4 border-b border-border/50 hover:bg-background-hover transition-colors ${isSelected ? 'bg-accent-primary/20' : ''
                                            }`}>
                                            <div className="flex gap-4">
                                                {/* Channel Logo */}
                                                <div className="w-16 h-16 shrink-0 rounded-lg bg-background-tertiary flex items-center justify-center overflow-hidden">
                                                    {result.channel?.logo ? (
                                                        <img
                                                            src={result.channel.logo}
                                                            alt=""
                                                            className="w-full h-full object-contain"
                                                        />
                                                    ) : (
                                                        <Tv2 className="w-8 h-8 text-foreground-muted" />
                                                    )}
                                                </div>

                                                {/* Program Info */}
                                                <div className="flex-1 min-w-0">
                                                    {/* Title Row */}
                                                    <div className="flex items-start gap-2 mb-1">
                                                        <h3 className="font-semibold text-foreground truncate flex-1">
                                                            {result.program.title}
                                                        </h3>
                                                        {live && (
                                                            <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold animate-pulse shrink-0">
                                                                LIVE
                                                            </span>
                                                        )}
                                                        {quality && (
                                                            <span className={`px-2 py-0.5 rounded text-white text-xs font-bold shrink-0 ${quality.color}`}>
                                                                {quality.label}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Channel & Category */}
                                                    <div className="flex items-center gap-2 mb-1 text-sm">
                                                        <span className="text-accent-primary font-medium truncate">
                                                            {result.channel?.name || result.program.channelTvgId}
                                                        </span>
                                                        {result.program.category && (
                                                            <>
                                                                <span className="text-foreground-muted">•</span>
                                                                <span className="text-foreground-muted">{result.program.category}</span>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Time & Duration */}
                                                    <div className="flex items-center gap-3 text-xs text-foreground-muted mb-2">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {formatTimeRange(result.program.start, result.program.end)}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {getDuration(result.program.start, result.program.end)}
                                                        </span>
                                                    </div>

                                                    {/* Description */}
                                                    {result.program.description && (
                                                        <p className="text-sm text-foreground-secondary line-clamp-2">
                                                            {result.program.description}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex flex-col gap-2 shrink-0">
                                                    {result.channel && (
                                                        <>

                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleWatch(result)}
                                                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium transition-colors"
                                                                >
                                                                    <Play className="w-4 h-4 fill-white" />
                                                                    Watch
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handlePreview(result, e)}
                                                                    className="flex items-center justify-center px-3 py-2 rounded-lg bg-background-tertiary hover:bg-background-hover text-foreground transition-colors"
                                                                    title="Preview Channel"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                            {!live && (
                                                                <button
                                                                    onClick={() => handleRecord(result)}
                                                                    disabled={isRecording || isSelected}
                                                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isSelected
                                                                        ? 'bg-green-600/20 text-green-500'
                                                                        : 'bg-red-600 hover:bg-red-700 text-white'
                                                                        }`}
                                                                >
                                                                    <Radio className="w-4 h-4" />
                                                                    {isSelected ? 'Scheduled' : 'Record'}
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : !query ? (
                        <div className="p-8 text-center">
                            <Search className="w-16 h-16 text-foreground-muted mx-auto mb-4 opacity-30" />
                            <p className="text-xl text-foreground-secondary mb-2">Search the TV Guide</p>
                            <p className="text-foreground-muted mb-6">
                                Find sports matches, shows, and movies across all channels
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {['Real Madrid', 'Champions League', 'NFL', 'NBA', 'Premier League'].map(suggestion => (
                                    <button
                                        key={suggestion}
                                        onClick={() => setQuery(suggestion)}
                                        className="px-3 py-1.5 rounded-lg bg-background-tertiary hover:bg-background-hover text-sm text-foreground-secondary transition-colors"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer with result count */}
                {results.length > 0 && (
                    <div className="p-3 border-t border-border bg-background-tertiary">
                        <p className="text-sm text-foreground-muted text-center">
                            Found {results.length} programs matching &quot;{query}&quot;
                        </p>
                    </div>
                )}
            </div>


            {/* Preview Modal */}
            {
                previewChannel && (
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
                        onClick={(e) => {
                            e.stopPropagation();
                            setPreviewChannel(null);
                        }}
                    >
                        <div
                            className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setPreviewChannel(null)}
                                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <VideoPlayer channel={previewChannel} />
                        </div>
                    </div>
                )
            }
        </div >
    );
}

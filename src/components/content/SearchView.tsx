'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { db, type Channel, type EPGProgram, type DVRJob, generateId } from '@/lib/db';
import {
    Play,
    Radio,
    Search as SearchIcon,
    Loader2,
    AlertCircle,
    Eye,
    X,
    Tv2,
    Film,
    Tv,
    Calendar,
    Clock,
    Info,
    LayoutGrid,
    Check
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { MovieDetailsModal, MoviePlayerOverlay } from '@/components/content/MoviesView';
import { SeriesDetailsModal, EpisodePlayerOverlay } from '@/components/content/SeriesView';

export interface SearchViewProps {
    initialQuery?: string;
    onChannelSelect: (channel: Channel) => void;
    onGroupOpen?: (group: any) => void;
    onNavigateSection?: (section: string) => void;
}

export interface ProgramResult {
    program: EPGProgram;
    channel: Channel | null;
}

export type SearchItem =
    | { type: 'channel'; data: Channel }
    | { type: 'movie'; data: Channel }
    | { type: 'series'; data: Channel }
    | { type: 'program'; data: ProgramResult };

type FilterTab = 'all' | 'channels' | 'movies' | 'series' | 'programs';

export function SearchView({
    initialQuery = '',
    onChannelSelect,
    onGroupOpen,
    onNavigateSection
}: SearchViewProps) {
    const [query, setQuery] = useState(initialQuery);
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [isSearching, setIsSearching] = useState(false);

    // Raw search data from server
    const [channelResults, setChannelResults] = useState<Channel[]>([]);
    const [movieResults, setMovieResults] = useState<Channel[]>([]);
    const [seriesResults, setSeriesResults] = useState<Channel[]>([]);
    const [programResults, setProgramResults] = useState<ProgramResult[]>([]);
    const [counts, setCounts] = useState({
        channels: 0,
        movies: 0,
        series: 0,
        programs: 0,
        total: 0
    });

    // DVR & playback state
    const [recordingPrograms, setRecordingPrograms] = useState<Set<string>>(new Set());
    const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);

    // Modal state for movies and series
    const [selectedMovie, setSelectedMovie] = useState<Channel | null>(null);
    const [playingMovie, setPlayingMovie] = useState<Channel | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<Channel | null>(null);
    const [playingEpisode, setPlayingEpisode] = useState<{ url: string; title: string } | null>(null);

    const [epgCount, setEpgCount] = useState<number | null>(null);
    const parentRef = useRef<HTMLDivElement>(null);

    // Sync initialQuery when parent updates it
    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    // Initial check for EPG data
    useEffect(() => {
        fetch('/api/setup/source?type=EPG')
            .then(r => r.json())
            .then(data => {
                const totalPrograms = (data.sources || []).reduce(
                    (sum: number, s: any) => sum + (s.programCount || 0),
                    0
                );
                setEpgCount(totalPrograms);
            })
            .catch(() => setEpgCount(0));
    }, []);

    // Column definitions & resizing
    const [columns, setColumns] = useState([
        { id: 'title', label: 'Title / Channel', width: '32%', minWidth: 160 },
        { id: 'group', label: 'Channel / Category', width: '22%', minWidth: 140 },
        { id: 'type', label: 'Type / Schedule', width: '16%', minWidth: 120 },
        { id: 'details', label: 'Details', width: '18%', minWidth: 140 },
        { id: 'actions', label: 'Actions', width: '12%', minWidth: 90 }
    ]);

    const headerRef = useRef<HTMLDivElement>(null);
    const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

    const handleResizeStart = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        const headerCell = (e.target as HTMLElement).parentElement;
        if (!headerCell) return;

        resizingRef.current = {
            index,
            startX: e.pageX,
            startWidth: headerCell.offsetWidth
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'col-resize';
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (!resizingRef.current || !headerRef.current) return;

        const { index, startX, startWidth } = resizingRef.current;
        const diff = e.pageX - startX;
        const newWidth = Math.max(columns[index].minWidth, startWidth + diff);

        const containerWidth = headerRef.current.offsetWidth;
        const newPercent = (newWidth / containerWidth) * 100;

        setColumns(prev => {
            const next = [...prev];
            next[index] = { ...next[index], width: `${newPercent}%` };
            return next;
        });
    };

    const handleResizeEnd = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };
    }, []);

    const gridTemplateColumns = columns.map(col => col.width).join(' ');

    // Unified Server Search Effect
    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setChannelResults([]);
            setMovieResults([]);
            setSeriesResults([]);
            setProgramResults([]);
            setCounts({ channels: 0, movies: 0, series: 0, programs: 0, total: 0 });
            return;
        }

        let cancelled = false;

        async function performSearch() {
            setIsSearching(true);
            try {
                const params = new URLSearchParams({
                    q: trimmed,
                    limit: '100'
                });

                const res = await fetch(`/api/search?${params.toString()}`);
                if (cancelled) return;

                if (res.ok) {
                    const data = await res.json();
                    setChannelResults(data.channels || []);
                    setMovieResults(data.movies || []);
                    setSeriesResults(data.series || []);

                    const programs: ProgramResult[] = (data.programs || []).map((p: any) => ({
                        program: {
                            ...p.program,
                            start: new Date(p.program.start),
                            end: new Date(p.program.end)
                        },
                        channel: p.channel
                    }));
                    setProgramResults(programs);

                    setCounts(data.counts || {
                        channels: data.channels?.length || 0,
                        movies: data.movies?.length || 0,
                        series: data.series?.length || 0,
                        programs: programs.length,
                        total: (data.channels?.length || 0) + (data.movies?.length || 0) + (data.series?.length || 0) + programs.length
                    });
                }
            } catch (err) {
                console.error('[Search] Failed:', err);
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        }

        const debounced = setTimeout(performSearch, 300);
        return () => {
            cancelled = true;
            clearTimeout(debounced);
        };
    }, [query]);

    // Filter results based on active tab
    const filteredResults = useMemo<SearchItem[]>(() => {
        const chItems: SearchItem[] = channelResults.map(c => ({ type: 'channel', data: c }));
        const mvItems: SearchItem[] = movieResults.map(m => ({ type: 'movie', data: m }));
        const srItems: SearchItem[] = seriesResults.map(s => ({ type: 'series', data: s }));
        const prItems: SearchItem[] = programResults.map(p => ({ type: 'program', data: p }));

        switch (activeTab) {
            case 'channels':
                return chItems;
            case 'movies':
                return mvItems;
            case 'series':
                return srItems;
            case 'programs':
                return prItems;
            case 'all':
            default:
                return [...chItems, ...mvItems, ...srItems, ...prItems];
        }
    }, [activeTab, channelResults, movieResults, seriesResults, programResults]);

    const rowVirtualizer = useVirtualizer({
        count: filteredResults.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 52,
        overscan: 10,
    });

    const formatTimeRange = (start: Date, end: Date) => {
        const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
        return `${new Intl.DateTimeFormat('en-US', timeOpts).format(start)} – ${new Intl.DateTimeFormat('en-US', timeOpts).format(end)}`;
    };

    const handleRecord = async (result: ProgramResult) => {
        if (!result.channel) return;
        const programId = result.program.id;
        setRecordingPrograms(prev => new Set(prev).add(programId));

        try {
            const job: DVRJob = {
                id: generateId(),
                channelId: result.channel.id,
                channelName: result.channel.name,
                channelUrl: result.channel.url,
                programId: programId,
                programTitle: result.program.title,
                startTime: result.program.start,
                endTime: result.program.end,
                status: 'scheduled',
                createdAt: new Date(),
                updatedAt: new Date(),
                duration: (result.program.end.getTime() - result.program.start.getTime()) / 1000
            };

            await db.dvrJobs.add(job);
        } catch (err) {
            console.error('Failed to schedule recording', err);
            setRecordingPrograms(prev => {
                const next = new Set(prev);
                next.delete(programId);
                return next;
            });
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#0f0f0f] text-[#e0e0e0]">
            {/* Header: Results Summary & Filter Tabs */}
            <div className="px-6 py-3 border-b border-[#333] flex flex-wrap items-center justify-between gap-3 bg-[#1a1a1a]">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-foreground-secondary truncate">
                        {query ? (
                            <>
                                Results for <span className="text-white font-semibold">&quot;{query}&quot;</span>
                            </>
                        ) : (
                            'Search results'
                        )}
                    </span>
                    {isSearching ? (
                        <div className="flex items-center gap-1.5 text-xs text-accent-secondary shrink-0">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Searching...</span>
                        </div>
                    ) : (
                        <span className="text-xs text-foreground-muted shrink-0">
                            ({counts.total} {counts.total === 1 ? 'match' : 'matches'})
                        </span>
                    )}
                </div>

                {/* Filter Tabs / Pills */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                            activeTab === 'all'
                                ? 'bg-accent-secondary text-black shadow-sm font-semibold'
                                : 'bg-[#262626] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>All</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'all' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'
                        }`}>
                            {counts.total}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('channels')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                            activeTab === 'channels'
                                ? 'bg-accent-primary text-white shadow-sm font-semibold'
                                : 'bg-[#262626] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                    >
                        <Tv className="w-3.5 h-3.5" />
                        <span>Channels</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'channels' ? 'bg-black/20 text-white' : 'bg-white/10 text-gray-300'
                        }`}>
                            {counts.channels}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('movies')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                            activeTab === 'movies'
                                ? 'bg-accent-primary text-white shadow-sm font-semibold'
                                : 'bg-[#262626] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                    >
                        <Film className="w-3.5 h-3.5" />
                        <span>Movies</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'movies' ? 'bg-black/20 text-white' : 'bg-white/10 text-gray-300'
                        }`}>
                            {counts.movies}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('series')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                            activeTab === 'series'
                                ? 'bg-accent-primary text-white shadow-sm font-semibold'
                                : 'bg-[#262626] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                    >
                        <Tv2 className="w-3.5 h-3.5" />
                        <span>Series</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'series' ? 'bg-black/20 text-white' : 'bg-white/10 text-gray-300'
                        }`}>
                            {counts.series}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('programs')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                            activeTab === 'programs'
                                ? 'bg-accent-primary text-white shadow-sm font-semibold'
                                : 'bg-[#262626] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Programs</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'programs' ? 'bg-black/20 text-white' : 'bg-white/10 text-gray-300'
                        }`}>
                            {counts.programs}
                        </span>
                    </button>
                </div>
            </div>

            {/* Warning if EPG is empty */}
            {epgCount === 0 && (
                <div className="bg-amber-900/20 border-b border-amber-900/40 p-2 text-center text-amber-500 text-sm">
                    <AlertCircle className="w-4 h-4 inline-block mr-2" />
                    No TV Guide data found. Program search will be empty. Go to Settings to configure EPG.
                </div>
            )}

            {/* Table Header */}
            <div
                ref={headerRef}
                className="grid gap-2 px-4 py-3 bg-[#1a1a1a] text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-[#333]"
                style={{ gridTemplateColumns }}
            >
                {columns.map((col, index) => (
                    <div key={col.id} className="relative flex items-center group/header">
                        <span className="truncate">{col.label}</span>
                        <div
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-secondary/50 group-hover/header:bg-[#333]"
                            onMouseDown={(e) => handleResizeStart(e, index)}
                        />
                    </div>
                ))}
            </div>

            {/* Results List */}
            <div ref={parentRef} className="flex-1 overflow-y-auto">
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const item = filteredResults[virtualRow.index];
                        if (!item) return null;

                        return (
                            <div
                                key={`${item.type}-${virtualRow.index}`}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className="absolute top-0 left-0 w-full grid gap-2 px-4 py-2.5 border-b border-[#222] hover:bg-[#1a1a1a] text-sm items-center transition-colors group"
                                style={{
                                    transform: `translateY(${virtualRow.start}px)`,
                                    gridTemplateColumns
                                }}
                            >
                                {item.type === 'channel' && (
                                    <>
                                        {/* Channel Title */}
                                        <div className="font-medium text-white truncate pr-2 flex items-center gap-2">
                                            <span className="shrink-0 text-accent-primary bg-accent-primary/15 border border-accent-primary/30 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                CH
                                            </span>
                                            {item.data.logo ? (
                                                <img src={item.data.logo} alt="" className="w-5 h-5 object-contain shrink-0 rounded" />
                                            ) : (
                                                <Tv className="w-4 h-4 text-gray-500 shrink-0" />
                                            )}
                                            <span className="truncate" title={item.data.name}>
                                                {item.data.name}
                                            </span>
                                        </div>

                                        {/* Channel Group */}
                                        <div className="text-gray-300 truncate pr-2 flex items-center">
                                            <span className="text-gray-300 bg-gray-800/80 px-2 py-0.5 rounded text-xs border border-white/10 truncate" title={item.data.groupName || 'Uncategorized'}>
                                                {item.data.groupName || 'Uncategorized'}
                                            </span>
                                        </div>

                                        {/* Type / Schedule */}
                                        <div className="flex items-center">
                                            <span className="text-accent-primary text-xs text-center border border-accent-primary/30 bg-accent-primary/15 rounded px-2 py-0.5 font-medium">
                                                Live
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <div className="text-gray-400 text-xs truncate">
                                            Live Stream
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                onClick={() => onChannelSelect(item.data)}
                                                className="p-1.5 rounded-lg bg-accent-primary/15 text-accent-primary hover:bg-accent-primary hover:text-white transition-colors"
                                                title="Watch Channel"
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewChannel(item.data);
                                                }}
                                                className="p-1.5 rounded-lg bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"
                                                title="Preview Channel"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </>
                                )}

                                {item.type === 'movie' && (
                                    <>
                                        {/* Movie Title */}
                                        <div className="font-medium text-white truncate pr-2 flex items-center gap-2">
                                            <span className="shrink-0 text-accent-primary bg-accent-primary/15 border border-accent-primary/30 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                MOVIE
                                            </span>
                                            {item.data.logo ? (
                                                <img src={item.data.logo} alt="" className="w-5 h-5 object-contain shrink-0 rounded" />
                                            ) : (
                                                <Film className="w-4 h-4 text-accent-primary shrink-0" />
                                            )}
                                            <span className="truncate" title={item.data.name}>
                                                {item.data.name.replace(/\s*\(\d{4}\)\s*/g, '').trim()}
                                            </span>
                                        </div>

                                        {/* Movie Group / Category */}
                                        <div className="text-gray-300 truncate pr-2 flex items-center">
                                            <span className="text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded text-xs border border-accent-primary/20 truncate" title={item.data.groupName || 'VOD'}>
                                                {item.data.groupName || 'VOD'}
                                            </span>
                                        </div>

                                        {/* Type / Year */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-accent-primary text-xs border border-accent-primary/30 bg-accent-primary/15 rounded px-2 py-0.5 font-medium">
                                                VOD
                                            </span>
                                            {(() => {
                                                const match = item.data.name.match(/\((\d{4})\)/);
                                                return match ? <span className="text-xs text-gray-400">{match[1]}</span> : null;
                                            })()}
                                        </div>

                                        {/* Details */}
                                        <div className="text-gray-400 text-xs truncate">
                                            On-Demand Movie
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                onClick={() => setPlayingMovie(item.data)}
                                                className="p-1.5 rounded-lg bg-accent-primary/15 text-accent-primary hover:bg-accent-primary hover:text-white transition-colors"
                                                title="Play Movie"
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setSelectedMovie(item.data)}
                                                className="p-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                                title="Movie Details"
                                            >
                                                <Info className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewChannel(item.data);
                                                }}
                                                className="p-1.5 rounded-lg bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"
                                                title="Preview Movie"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </>
                                )}

                                {item.type === 'series' && (
                                    <>
                                        {/* Series Title */}
                                        <div className="font-medium text-white truncate pr-2 flex items-center gap-2">
                                            <span className="shrink-0 text-blue-300 bg-blue-950/60 border border-blue-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                SERIES
                                            </span>
                                            {item.data.logo ? (
                                                <img src={item.data.logo} alt="" className="w-5 h-5 object-contain shrink-0 rounded" />
                                            ) : (
                                                <Tv2 className="w-4 h-4 text-blue-400 shrink-0" />
                                            )}
                                            <span className="truncate" title={item.data.name}>
                                                {item.data.name.replace(/\s*\(\d{4}\)\s*/g, '').trim()}
                                            </span>
                                        </div>

                                        {/* Series Group / Category */}
                                        <div className="text-gray-300 truncate pr-2 flex items-center">
                                            <span className="text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded text-xs border border-blue-500/20 truncate" title={item.data.groupName || 'Series'}>
                                                {item.data.groupName || 'Series'}
                                            </span>
                                        </div>

                                        {/* Type / Year */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-blue-400 text-xs border border-blue-500/30 bg-blue-950/30 rounded px-2 py-0.5 font-medium">
                                                TV Show
                                            </span>
                                            {(() => {
                                                const match = item.data.name.match(/\((\d{4})\)/);
                                                return match ? <span className="text-xs text-gray-400">{match[1]}</span> : null;
                                            })()}
                                        </div>

                                        {/* Details */}
                                        <div className="text-gray-400 text-xs truncate">
                                            Seasons & Episodes
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                onClick={() => setSelectedSeries(item.data)}
                                                className="px-2 py-1 rounded-lg bg-blue-900/50 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-xs font-semibold flex items-center gap-1"
                                                title="View Episodes"
                                            >
                                                <Tv2 className="w-3.5 h-3.5" />
                                                <span>Episodes</span>
                                            </button>
                                        </div>
                                    </>
                                )}

                                {item.type === 'program' && (
                                    <>
                                        {/* Program Title */}
                                        <div className="font-medium text-foreground truncate pr-2 flex items-center gap-2">
                                            <span className="shrink-0 text-accent-primary bg-accent-primary/15 border border-accent-primary/30 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                EPG
                                            </span>
                                            <span className="truncate" title={item.data.program.title}>
                                                {item.data.program.title}
                                            </span>
                                        </div>

                                        {/* Program Channel */}
                                        <div className="text-gray-300 pr-2 flex items-center gap-2" title={item.data.channel?.name || "Channel not found in playlist"}>
                                            {item.data.channel?.logo ? (
                                                <img src={item.data.channel.logo} alt="" className="w-5 h-5 object-contain shrink-0 rounded" />
                                            ) : (
                                                <Tv2 className="w-5 h-5 text-gray-600 shrink-0" />
                                            )}
                                            <div className="flex flex-col min-w-0 overflow-hidden">
                                                <span className={`text-xs truncate ${!item.data.channel ? 'text-red-400 font-bold bg-red-950/40 px-1 rounded' : ''}`}>
                                                    {item.data.channel?.name || `ID: "${item.data.program.channelTvgId}"`}
                                                </span>
                                                {item.data.channel?.groupName && (
                                                    <span className="text-[10px] text-gray-500 truncate">
                                                        {item.data.channel.groupName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Time / Schedule */}
                                        <div className="text-gray-400 text-xs flex flex-col">
                                            <span className="text-gray-200">
                                                {new Date(item.data.program.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="text-gray-500 text-[11px]">
                                                {formatTimeRange(new Date(item.data.program.start), new Date(item.data.program.end))}
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <div className="text-gray-400 text-xs truncate pr-2 flex flex-col">
                                            <span title={item.data.program.description}>{item.data.program.description || "No description."}</span>
                                            {item.data.program.category && (
                                                <span className="text-gray-500 mt-0.5 text-[10px] uppercase border border-gray-800 self-start px-1 rounded w-fit">
                                                    {item.data.program.category}
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                onClick={() => item.data.channel && onChannelSelect(item.data.channel)}
                                                disabled={!item.data.channel}
                                                className={`p-1.5 rounded-lg transition-colors ${item.data.channel
                                                    ? 'bg-accent-primary/15 text-accent-primary hover:bg-accent-primary hover:text-white'
                                                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                                                title={item.data.channel ? "Watch Channel" : "Channel not configured"}
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (item.data.channel) setPreviewChannel(item.data.channel);
                                                }}
                                                disabled={!item.data.channel}
                                                className={`p-1.5 rounded-lg transition-colors ${item.data.channel
                                                    ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white'
                                                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                                                title={item.data.channel ? "Preview Channel" : "Channel not configured"}
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleRecord(item.data)}
                                                disabled={recordingPrograms.has(item.data.program.id)}
                                                className={`p-1.5 rounded-lg transition-colors ${recordingPrograms.has(item.data.program.id)
                                                    ? 'bg-red-600 text-white cursor-default'
                                                    : 'bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white'
                                                    }`}
                                                title="Record Program"
                                            >
                                                <Radio className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {!isSearching && filteredResults.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        {query ? (
                            <>
                                <AlertCircle className="w-10 h-10 mb-4 opacity-50" />
                                <p className="text-gray-400">No results found for &quot;{query}&quot;</p>
                                {activeTab !== 'all' && (
                                    <button
                                        onClick={() => setActiveTab('all')}
                                        className="mt-3 text-xs text-accent-secondary hover:underline"
                                    >
                                        View all {counts.total} results across all categories
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <SearchIcon className="w-10 h-10 mb-4 opacity-50" />
                                <p className="text-gray-400">Use the search bar above to find channels, movies, series, or programs</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Channel / Stream Preview Modal */}
            {previewChannel && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
                    onClick={() => setPreviewChannel(null)}
                >
                    <div
                        className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewChannel(null)}
                            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <VideoPlayer channel={previewChannel} />
                    </div>
                </div>
            )}

            {/* Movie Details Modal */}
            {selectedMovie && (
                <MovieDetailsModal
                    movie={selectedMovie}
                    onClose={() => setSelectedMovie(null)}
                    onPlay={() => {
                        const m = selectedMovie;
                        setSelectedMovie(null);
                        setPlayingMovie(m);
                    }}
                />
            )}

            {/* Full Movie Player Overlay */}
            {playingMovie && (
                <MoviePlayerOverlay
                    movie={playingMovie}
                    onClose={() => setPlayingMovie(null)}
                />
            )}

            {/* Series Details Modal (Episodes & Seasons) */}
            {selectedSeries && (
                <SeriesDetailsModal
                    series={selectedSeries}
                    onClose={() => setSelectedSeries(null)}
                    onPlayEpisode={(url, title) => {
                        setSelectedSeries(null);
                        setPlayingEpisode({ url, title });
                    }}
                />
            )}

            {/* Episode Player Overlay */}
            {playingEpisode && (
                <EpisodePlayerOverlay
                    episodeUrl={playingEpisode.url}
                    episodeTitle={playingEpisode.title}
                    onClose={() => setPlayingEpisode(null)}
                />
            )}
        </div>
    );
}

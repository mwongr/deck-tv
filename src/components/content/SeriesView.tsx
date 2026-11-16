'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tv2, Play, Search, X, ChevronRight, ChevronLeft, Folder, Pause, Volume2, VolumeX, Maximize, Minimize, ArrowLeft, Loader2, Star, SlidersHorizontal } from 'lucide-react';
import { db, type Channel, type Group } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import Hls from 'hls.js';
import type { XtreamEpisode, XtreamSeriesDetails } from '@/types';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { getRatingValue, cleanMediaTitle } from '@/lib/rating-utils';

export type SeriesSortOption = 'rating-desc' | 'rating-asc' | 'name-asc' | 'name-desc' | 'year-desc' | 'year-asc' | 'default';

export interface SeriesViewProps {
    onSeriesSelect?: (series: Channel) => void;
    initialCategoryId?: string | null;
}

export interface SeriesDetailsModalProps {
    series: Channel;
    onClose: () => void;
    onPlayEpisode: (episodeUrl: string, episodeTitle: string) => void;
}

export function SeriesDetailsModal({ series, onClose, onPlayEpisode }: SeriesDetailsModalProps) {
    const [seriesDetails, setSeriesDetails] = useState<XtreamSeriesDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<number>(1);
    const [credentials, setCredentials] = useState<{ baseUrl: string; username: string; password: string } | null>(null);

    // Extract year from name if present
    const yearMatch = series.name.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : null;
    const cleanName = cleanMediaTitle(series.name);

    // Extract series_id from the channel tvg_id (format: series_123)
    // The channel.id is a UUID, but tvgId contains the actual Xtream ID
    const seriesId = series.tvgId?.replace('series_', '') || '';

    // Fetch series details
    useEffect(() => {
        const fetchSeriesInfo = async () => {
            setIsLoading(true);
            setError(null);

            try {
                if (!series.sourceId) {
                    throw new Error('Series source ID missing');
                }

                // Build API URL with sourceId
                const params = new URLSearchParams({
                    seriesId,
                    sourceId: series.sourceId,
                });

                const response = await fetch(`/api/series-info?${params}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch series info');
                }
                const data = await response.json();
                setSeriesDetails(data);
                setCredentials({
                    baseUrl: data.baseUrl,
                    username: data.username,
                    password: data.password,
                });

                // Set first available season
                if (data.seasons && data.seasons.length > 0) {
                    setSelectedSeason(data.seasons[0].season_number);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load series');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSeriesInfo();
    }, [seriesId, series.sourceId]);

    const toggleFavorite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const newStatus = !series.favorite;

        try {
            await fetch('/api/favorites', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'channel',
                    id: series.id,
                    status: newStatus
                })
            });
            series.favorite = newStatus ? 1 : 0;
            // Force re-render of this component to update icon
            setSeriesDetails(prev => ({ ...prev! }));
        } catch (err) {
            console.error(err);
        }
    };

    // Get episodes for selected season
    const episodes = useMemo(() => {
        if (!seriesDetails?.episodes) return [];
        return seriesDetails.episodes[String(selectedSeason)] || [];
    }, [seriesDetails, selectedSeason]);

    // Build episode URL
    const buildEpisodeUrl = (episode: XtreamEpisode) => {
        if (!credentials) return '';
        // Use container extension if available, otherwise fallback to mp4
        const ext = episode.container_extension || 'mp4';
        return `${credentials.baseUrl}/series/${credentials.username}/${credentials.password}/${episode.id}.${ext}`;
    };

    const handlePlayEpisode = (episode: XtreamEpisode) => {
        const url = buildEpisodeUrl(episode);
        const title = `${cleanName} - S${selectedSeason}E${episode.episode_num}: ${episode.title}`;
        onPlayEpisode(url, title);
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex items-center justify-center">
                <div className="w-full max-w-6xl h-full max-h-[90vh] bg-background-secondary rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-start gap-4 p-6 border-b border-white/10">
                        {/* Poster Thumbnail */}
                        <div className="w-24 h-36 shrink-0 rounded-lg overflow-hidden bg-gray-800">
                            {series.logo ? (
                                <img
                                    src={series.logo}
                                    alt={series.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Tv2 className="w-8 h-8 text-gray-600" />
                                </div>
                            )}
                        </div>

                        {/* Title and Info */}
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold mb-1 truncate">{cleanName}</h2>
                            <div className="flex items-center gap-3 text-sm text-foreground-muted mb-2">
                                {year && <span>{year}</span>}
                                {seriesDetails?.info?.genre && <span>{seriesDetails.info.genre}</span>}
                                {(() => {
                                    const ratingVal = seriesDetails?.info?.rating
                                        ? parseFloat(seriesDetails.info.rating)
                                        : getRatingValue(series);
                                    if (!ratingVal || isNaN(ratingVal) || ratingVal <= 0) return null;
                                    return (
                                        <span className="px-2 py-0.5 rounded bg-black/60 border border-yellow-500/40 text-yellow-400 text-xs font-bold flex items-center gap-1 shadow-sm">
                                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                            <span>{ratingVal.toFixed(1)}</span>
                                            <span className="text-[10px] text-foreground-muted font-normal ml-0.5">/ 10 (IMDb)</span>
                                        </span>
                                    );
                                })()}
                            </div>
                            {seriesDetails?.info?.plot && (
                                <p className="text-sm text-foreground-secondary line-clamp-2">
                                    {seriesDetails.info.plot}
                                </p>
                            )}
                            <FavoriteButton
                                id={series.id}
                                name={cleanName}
                                initialFavorite={series.favorite}
                                variant="pill"
                                contentType="series"
                                showGroupAdd={true}
                                className="mt-4"
                            />
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full bg-background-tertiary hover:bg-background-hover transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
                                <span className="ml-3 text-foreground-muted">Loading episodes...</span>
                            </div>
                        ) : error ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-red-400 mb-2">{error}</p>
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Season Selector */}
                                <div className="w-48 shrink-0 bg-background-tertiary p-4 overflow-y-auto border-r border-white/10">
                                    <h3 className="text-sm font-semibold text-foreground-muted mb-3 uppercase tracking-wider">Seasons</h3>
                                    <div className="space-y-1">
                                        {seriesDetails?.seasons?.map((season) => (
                                            <button
                                                key={season.season_number}
                                                onClick={() => setSelectedSeason(season.season_number)}
                                                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedSeason === season.season_number
                                                    ? 'bg-accent-primary text-white'
                                                    : 'hover:bg-white/10 text-foreground-secondary'
                                                    }`}
                                            >
                                                <span className="font-medium">Season {season.season_number}</span>
                                                <span className="text-xs block opacity-70">{season.episode_count} episodes</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Episodes List */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    <h3 className="text-sm font-semibold text-foreground-muted mb-3 uppercase tracking-wider">
                                        Season {selectedSeason} Episodes
                                    </h3>
                                    <div className="space-y-2">
                                        {episodes.length > 0 ? (
                                            episodes.map((episode) => (
                                                <button
                                                    key={episode.id}
                                                    onClick={() => handlePlayEpisode(episode)}
                                                    className="w-full flex items-center gap-4 p-3 rounded-xl bg-background-tertiary hover:bg-white/10 transition-colors text-left group"
                                                >
                                                    {/* Episode Thumbnail */}
                                                    <div className="w-32 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-800 relative">
                                                        {episode.info?.movie_image ? (
                                                            <img
                                                                src={episode.info.movie_image}
                                                                alt={episode.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Play className="w-8 h-8 text-gray-600" />
                                                            </div>
                                                        )}
                                                        {/* Play overlay */}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <div className="w-10 h-10 rounded-full bg-accent-primary flex items-center justify-center">
                                                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Episode Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-accent-primary font-semibold text-sm">
                                                                E{episode.episode_num}
                                                            </span>
                                                            <h4 className="font-medium truncate">{episode.title}</h4>
                                                        </div>
                                                        {episode.info?.plot && (
                                                            <p className="text-sm text-foreground-secondary line-clamp-2">
                                                                {episode.info.plot}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
                                                            {episode.info?.duration && <span>{episode.info.duration}</span>}
                                                            {episode.info?.releasedate && <span>{episode.info.releasedate}</span>}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 text-foreground-muted">
                                                No episodes found for this season
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}


export function SeriesView({ onSeriesSelect, initialCategoryId = null }: SeriesViewProps) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategoryId);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSeries, setSelectedSeries] = useState<Channel | null>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sortBy, setSortBy] = useState<SeriesSortOption>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('decktv:series:sort');
            if (saved) return saved as SeriesSortOption;
        }
        return 'default';
    });
    const gridRef = useRef<HTMLDivElement>(null);

    const handleSortChange = (newSort: SeriesSortOption) => {
        setSortBy(newSort);
        if (typeof window !== 'undefined') {
            localStorage.setItem('decktv:series:sort', newSort);
        }
    };

    const [seriesGroups, setSeriesGroups] = useState<Group[]>([]);
    const [allSeries, setAllSeries] = useState<Channel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch Groups
    useEffect(() => {
        async function fetchGroups() {
            try {
                const res = await fetch('/api/channels?type=groups&category=series');
                if (res.ok) {
                    const data = await res.json();
                    setSeriesGroups(data.groups || []);

                    // Auto-select first group if available
                    if (data.groups && data.groups.length > 0 && !selectedCategory) {
                        setSelectedCategory(data.groups[0].id);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        fetchGroups();
    }, []);

    // Fetch Series when category changes
    useEffect(() => {
        async function fetchSeries() {
            setIsLoading(true);
            try {
                let url = '';
                if (selectedCategory) {
                    url = `/api/channels?groupId=${selectedCategory}`;
                } else {
                    // Default to empty or maybe undefined
                    setAllSeries([]);
                    setIsLoading(false);
                    return;
                }

                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setAllSeries(data.channels || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        }
        fetchSeries();
    }, [selectedCategory]);

    // Filter and sort series
    const series = useMemo(() => {
        let filtered = allSeries ? [...allSeries] : [];

        if (selectedCategory) {
            filtered = filtered.filter((s: Channel) => s.groupId === selectedCategory);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((s: Channel) =>
                s.name.toLowerCase().includes(query)
            );
        }

        const getYear = (name: string): number => {
            const match = name.match(/\((\d{4})\)/);
            return match ? parseInt(match[1], 10) : 0;
        };

        switch (sortBy) {
            case 'rating-desc':
                return filtered.sort((a, b) => {
                    const rA = getRatingValue(a);
                    const rB = getRatingValue(b);
                    if (rB !== rA) return rB - rA;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'rating-asc':
                return filtered.sort((a, b) => {
                    const rA = getRatingValue(a);
                    const rB = getRatingValue(b);
                    if (rA === 0 && rB > 0) return 1;
                    if (rB === 0 && rA > 0) return -1;
                    if (rA !== rB) return rA - rB;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'name-asc':
                return filtered.sort((a, b) => cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name)));
            case 'name-desc':
                return filtered.sort((a, b) => cleanMediaTitle(b.name).localeCompare(cleanMediaTitle(a.name)));
            case 'year-desc':
                return filtered.sort((a, b) => {
                    const yA = getYear(a.name);
                    const yB = getYear(b.name);
                    if (yB !== yA) return yB - yA;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'year-asc':
                return filtered.sort((a, b) => {
                    const yA = getYear(a.name);
                    const yB = getYear(b.name);
                    if (yA === 0 && yB > 0) return 1;
                    if (yB === 0 && yA > 0) return -1;
                    if (yA !== yB) return yA - yB;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'default':
            default:
                return filtered;
        }
    }, [allSeries, selectedCategory, searchQuery, sortBy]);

    // Responsive columns
    const [columns, setColumns] = useState(5);
    const POSTER_WIDTH = 180;
    const GAP = 16;

    const getColumnsCount = () => {
        if (!gridRef.current) return 5;
        const width = gridRef.current.clientWidth - 48; // padding
        return Math.max(2, Math.floor(width / (POSTER_WIDTH + GAP)));
    };

    const updateColumns = () => {
        setColumns(getColumnsCount());
    };

    useEffect(() => {
        updateColumns();
        window.addEventListener('resize', updateColumns);
        return () => window.removeEventListener('resize', updateColumns);
    }, [isSidebarCollapsed]);

    const rowCount = Math.ceil((series?.length || 0) / columns);
    // Using a larger value to ensure nothing gets clipped
    const ROW_HEIGHT = 360;

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => gridRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 2,
    });

    // State for currently playing episode
    const [playingEpisode, setPlayingEpisode] = useState<{ url: string; title: string } | null>(null);

    // Handle play episode from modal
    const handlePlayEpisode = (episodeUrl: string, episodeTitle: string) => {
        setSelectedSeries(null);
        setPlayingEpisode({ url: episodeUrl, title: episodeTitle });
    };

    const handleClosePlayer = () => {
        setPlayingEpisode(null);
    };

    if (!seriesGroups || seriesGroups.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                    <Tv2 className="w-20 h-20 text-accent-primary/30 mx-auto mb-6" />
                    <h3 className="text-2xl font-bold mb-3">No Series Found</h3>
                    <p className="text-foreground-muted leading-relaxed">
                        TV Series will appear here when you add a playlist that contains Series content.
                        Xtream Codes providers typically include a Series section.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex overflow-hidden">
            {/* Sidebar - Categories */}
            <div
                className={`shrink-0 bg-background-secondary border-r border-border flex flex-col transition-all duration-200 ${isSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'
                    }`}
            >
                {/* Sidebar Header */}
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2 text-accent-primary">
                        <Folder className="w-5 h-5" />
                        <span className="font-semibold">Categories</span>
                    </div>
                </div>

                {/* Category List */}
                <div className="flex-1 overflow-y-auto">
                    {seriesGroups?.map((group: Group) => (
                        <button
                            key={group.id}
                            onClick={() => setSelectedCategory(group.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${selectedCategory === group.id
                                ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
                                : 'hover:bg-background-hover text-foreground-secondary border-l-2 border-transparent'
                                }`}
                        >
                            <span className="font-medium truncate text-sm">{group.name}</span>
                            <span className="text-xs opacity-60 shrink-0 ml-2">
                                {group.channelCount}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <div className="shrink-0 px-6 py-4 border-b border-border bg-background flex items-center gap-4">
                    {/* Toggle Sidebar */}
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="p-2 rounded-lg hover:bg-background-hover transition-colors"
                    >
                        {isSidebarCollapsed ? (
                            <ChevronRight className="w-5 h-5" />
                        ) : (
                            <ChevronLeft className="w-5 h-5" />
                        )}
                    </button>

                    {/* Title */}
                    <div className="flex items-center gap-3">
                        <Tv2 className="w-6 h-6 text-accent-primary" />
                        <h2 className="text-xl font-bold">
                            {seriesGroups?.find((g: Group) => g.id === selectedCategory)?.name || 'Series'}
                        </h2>
                        <span className="text-foreground-muted text-sm">
                            ({series?.length || 0} shows)
                        </span>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Sort Selector */}
                    <div className="flex items-center gap-2 bg-[#18181b] hover:bg-[#202024] border border-white/20 hover:border-white/35 px-3 py-2 rounded-xl text-xs transition-all shadow-inner">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                        <span className="text-foreground-secondary shrink-0 font-medium">Sort:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => handleSortChange(e.target.value as SeriesSortOption)}
                            className="bg-transparent text-foreground focus:outline-none cursor-pointer font-medium"
                        >
                            <option value="rating-desc" className="bg-[#18181b] text-white">★ Rating (Highest)</option>
                            <option value="rating-asc" className="bg-[#18181b] text-white">Rating (Lowest)</option>
                            <option value="name-asc" className="bg-[#18181b] text-white">Name (A–Z)</option>
                            <option value="name-desc" className="bg-[#18181b] text-white">Name (Z–A)</option>
                            <option value="year-desc" className="bg-[#18181b] text-white">Year (Newest)</option>
                            <option value="year-asc" className="bg-[#18181b] text-white">Year (Oldest)</option>
                            <option value="default" className="bg-[#18181b] text-white">Default</option>
                        </select>
                    </div>

                    {/* Search */}
                    <div className="relative w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-primary" />
                        <input
                            type="text"
                            placeholder="Search series..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none text-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                            >
                                <X className="w-4 h-4 text-foreground-muted hover:text-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Series Grid */}
                <div
                    ref={gridRef}
                    className="flex-1 overflow-y-auto p-6"
                >
                    {series && series.length > 0 ? (
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const startIndex = virtualRow.index * columns;
                                const rowSeries = series.slice(startIndex, startIndex + columns);

                                return (
                                    <div
                                        key={virtualRow.key}
                                        className="absolute left-0 right-0 grid gap-4"
                                        style={{
                                            top: virtualRow.start,
                                            height: ROW_HEIGHT - 16, // minus gap
                                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                        }}
                                    >
                                        {rowSeries.map((show: Channel) => {
                                            const yearMatch = show.name.match(/\((\d{4})\)/);
                                            const year = yearMatch ? yearMatch[1] : null;
                                            const cleanName = cleanMediaTitle(show.name);
                                            const showRating = getRatingValue(show);

                                            return (
                                                <button
                                                    key={show.id}
                                                    onClick={() => {
                                                        setSelectedSeries(show);
                                                    }}
                                                    className="group rounded-xl overflow-hidden bg-gray-900 hover:ring-2 hover:ring-accent-primary transition-all text-left h-full flex flex-col"
                                                >
                                                    {/* Poster Container - takes available space */}
                                                    <div className="flex-1 bg-gray-900 relative min-h-0">
                                                        {show.logo ? (
                                                            <img
                                                                src={show.logo}
                                                                alt={show.name}
                                                                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                                                <Tv2 className="w-16 h-16 text-gray-600" />
                                                            </div>
                                                        )}

                                                        {/* Rating Badge */}
                                                        {showRating > 0 ? (
                                                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-green-600 text-white text-xs font-bold shadow-lg flex items-center gap-1">
                                                                <Star className="w-3 h-3 fill-white text-white" />
                                                                <span>{showRating.toFixed(1)}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-gray-400 text-[10px] font-semibold backdrop-blur-sm shadow-md">
                                                                NR
                                                            </div>
                                                        )}

                                                        {/* Play Overlay on Hover */}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <div className="w-14 h-14 rounded-full bg-accent-primary flex items-center justify-center">
                                                                <Play className="w-7 h-7 text-white fill-white ml-0.5" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Title Bar - Fixed height at bottom */}
                                                    <div className="shrink-0 p-2 bg-gray-800/80">
                                                        <p className="text-sm font-medium text-white truncate">
                                                            {cleanName}
                                                        </p>
                                                        {year && (
                                                            <p className="text-xs text-gray-400 truncate">
                                                                {year}
                                                            </p>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <Search className="w-12 h-12 text-foreground-muted/30 mx-auto mb-4" />
                                <p className="text-foreground-secondary">
                                    {searchQuery
                                        ? `No series found for "${searchQuery}"`
                                        : 'No series in this category'
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Series Details Modal with Episode Browser */}
            {selectedSeries && (
                <SeriesDetailsModal
                    series={selectedSeries}
                    onClose={() => setSelectedSeries(null)}
                    onPlayEpisode={handlePlayEpisode}
                />
            )}

            {/* Episode Player Overlay */}
            {playingEpisode && (
                <EpisodePlayerOverlay
                    episodeUrl={playingEpisode.url}
                    episodeTitle={playingEpisode.title}
                    onClose={handleClosePlayer}
                />
            )}
        </div>
    );
}

// Inline Episode Player Component
import { VideoPlayer } from '../player/VideoPlayer';

export interface EpisodePlayerOverlayProps {
    episodeUrl: string;
    episodeTitle: string;
    onClose: () => void;
}

export function EpisodePlayerOverlay({ episodeUrl, episodeTitle, onClose }: EpisodePlayerOverlayProps) {
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastMousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

    // Create a temporary Channel object for the player
    const channel: Channel = useMemo(() => ({
        id: `episode-${Date.now()}`,
        name: episodeTitle,
        url: episodeUrl,
        groupId: 'series-playback',
        groupName: 'Series',
        catchupSupported: false,
        order: 0
    }), [episodeUrl, episodeTitle]);

    const handleShowControls = useCallback(() => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (e.clientX === lastMousePosRef.current.x && e.clientY === lastMousePosRef.current.y) {
            return;
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        handleShowControls();
    }, [handleShowControls]);

    return (
        <div
            className={`fixed inset-0 z-50 bg-black ${!showControls ? 'cursor-hidden cursor-none' : ''}`}
            onMouseMove={handleMouseMove}
            onClick={handleShowControls}
        >
            {/* Top Bar with Close Button - Overlays VideoPlayer */}
            <div className={`absolute top-0 left-0 right-0 z-[60] p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6 text-white" />
                    </button>
                    <div>
                        <h2 className="text-xl font-semibold text-white drop-shadow-md">{episodeTitle}</h2>
                        <p className="text-sm text-white/60 drop-shadow-md">Press back to return to Series</p>
                    </div>
                </div>
            </div>

            <VideoPlayer channel={channel} className="w-full h-full" />
        </div>
    );
}


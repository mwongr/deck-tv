'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Film, Play, Search, X, Star, Calendar, Clock, ChevronRight, ChevronLeft, Folder, Pause, Volume2, VolumeX, Maximize, Minimize, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { db, type Channel, type Group } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import Hls from 'hls.js';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { getRatingValue, cleanMediaTitle } from '@/lib/rating-utils';

export type MovieSortOption = 'rating-desc' | 'rating-asc' | 'name-asc' | 'name-desc' | 'year-desc' | 'year-asc' | 'default';

export interface MoviesViewProps {
    onMovieSelect?: (movie: Channel) => void;
    initialCategoryId?: string | null;
}

export interface MovieDetailsModalProps {
    movie: Channel;
    onClose: () => void;
    onPlay: () => void;
}

export function MovieDetailsModal({ movie, onClose, onPlay }: MovieDetailsModalProps) {
    // Extract year from name if present (e.g., "Movie Name (2023)")
    const yearMatch = movie.name.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : null;
    const cleanName = cleanMediaTitle(movie.name);
    const movieRating = getRatingValue(movie);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-8 lg:inset-16 z-50 flex items-center justify-center">
                <div className="w-full max-w-4xl max-h-full bg-background-secondary rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
                    {/* Poster Side */}
                    <div className="w-full md:w-2/5 shrink-0 relative">
                        <div className="aspect-[2/3] md:aspect-auto md:h-full bg-background-tertiary">
                            {movie.logo ? (
                                <img
                                    src={movie.logo}
                                    alt={movie.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Film className="w-24 h-24 text-foreground-muted/30" />
                                </div>
                            )}
                        </div>

                        {/* Gradient overlay on poster */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:bg-gradient-to-r" />
                    </div>

                    {/* Info Side */}
                    <div className="flex-1 p-6 md:p-8 flex flex-col overflow-y-auto">
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>

                        {/* Title & Year */}
                        <div className="mb-4">
                            <h2 className="text-2xl md:text-3xl font-bold">{cleanName}</h2>
                            <div className="flex items-center gap-3 mt-2 text-sm text-foreground-secondary">
                                {year && (
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        {year}
                                    </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-xs">
                                    {movie.groupName}
                                </span>
                                <FavoriteButton
                                    id={movie.id}
                                    name={cleanName}
                                    initialFavorite={movie.favorite}
                                    size="lg"
                                    contentType="movie"
                                    showGroupAdd={true}
                                    className="ml-2"
                                />
                            </div>
                        </div>

                        {/* Rating */}
                        {movieRating > 0 ? (
                            <div className="flex items-center gap-2 mb-6">
                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 font-bold text-sm shadow-sm">
                                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                    <span>{movieRating.toFixed(1)}</span>
                                    <span className="text-xs text-foreground-muted font-normal ml-0.5">/ 10 (IMDb)</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 mb-6 text-sm text-foreground-muted">
                                <span>No rating available</span>
                            </div>
                        )}

                        {/* Description placeholder */}
                        <div className="flex-1 mb-6">
                            <p className="text-foreground-secondary text-sm leading-relaxed">
                                No description available for this movie.
                                Click &quot;Watch Now&quot; to start streaming.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={onPlay}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-accent-primary text-white font-semibold hover:bg-accent-primary/90 transition-colors"
                            >
                                <Play className="w-5 h-5 fill-white" />
                                Watch Now
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export function MoviesView({ onMovieSelect, initialCategoryId = null }: MoviesViewProps) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategoryId);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMovie, setSelectedMovie] = useState<Channel | null>(null);
    const [playingMovie, setPlayingMovie] = useState<Channel | null>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sortBy, setSortBy] = useState<MovieSortOption>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('decktv:movies:sort');
            if (saved) return saved as MovieSortOption;
        }
        return 'default';
    });
    const gridRef = useRef<HTMLDivElement>(null);

    const handleSortChange = (newSort: MovieSortOption) => {
        setSortBy(newSort);
        if (typeof window !== 'undefined') {
            localStorage.setItem('decktv:movies:sort', newSort);
        }
    };

    const [movieGroups, setMovieGroups] = useState<Group[]>([]);
    const [allMovies, setAllMovies] = useState<Channel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch Groups
    useEffect(() => {
        async function fetchGroups() {
            try {
                const res = await fetch('/api/channels?type=groups&category=vod');
                if (res.ok) {
                    const data = await res.json();
                    setMovieGroups(data.groups || []);

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

    // Fetch Movies when category changes
    useEffect(() => {
        async function fetchMovies() {
            setIsLoading(true);
            try {
                let url = '';
                if (selectedCategory) {
                    url = `/api/channels?groupId=${selectedCategory}`;
                } else {
                    // "All Movies" - Dangerous to fetch all 150k. 
                    // For now, let's just return empty or maybe a limit?
                    // Better to rely on user selecting a group.
                    // Or we could fetch recent?
                    setAllMovies([]);
                    setIsLoading(false);
                    return;
                }

                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setAllMovies(data.channels || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        }
        fetchMovies();
    }, [selectedCategory]);

    // Filter and sort movies
    const movies = useMemo(() => {
        if (!allMovies) return [];
        let list = [...allMovies];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter((m: Channel) =>
                m.name.toLowerCase().includes(query)
            );
        }

        const getYear = (name: string): number => {
            const match = name.match(/\((\d{4})\)/);
            return match ? parseInt(match[1], 10) : 0;
        };

        switch (sortBy) {
            case 'rating-desc':
                return list.sort((a, b) => {
                    const rA = getRatingValue(a);
                    const rB = getRatingValue(b);
                    if (rB !== rA) return rB - rA;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'rating-asc':
                return list.sort((a, b) => {
                    const rA = getRatingValue(a);
                    const rB = getRatingValue(b);
                    // Items with no rating (0) go to the end
                    if (rA === 0 && rB > 0) return 1;
                    if (rB === 0 && rA > 0) return -1;
                    if (rA !== rB) return rA - rB;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'name-asc':
                return list.sort((a, b) => cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name)));
            case 'name-desc':
                return list.sort((a, b) => cleanMediaTitle(b.name).localeCompare(cleanMediaTitle(a.name)));
            case 'year-desc':
                return list.sort((a, b) => {
                    const yA = getYear(a.name);
                    const yB = getYear(b.name);
                    if (yB !== yA) return yB - yA;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'year-asc':
                return list.sort((a, b) => {
                    const yA = getYear(a.name);
                    const yB = getYear(b.name);
                    if (yA === 0 && yB > 0) return 1;
                    if (yB === 0 && yA > 0) return -1;
                    if (yA !== yB) return yA - yB;
                    return cleanMediaTitle(a.name).localeCompare(cleanMediaTitle(b.name));
                });
            case 'default':
            default:
                return list;
        }
    }, [allMovies, searchQuery, sortBy]);

    // Calculate grid columns based on container width
    const POSTER_WIDTH = 180;
    const GAP = 16;

    // Virtual grid with responsive columns
    const getColumnsCount = () => {
        if (!gridRef.current) return 5;
        const width = gridRef.current.clientWidth - 48; // account for padding
        return Math.max(2, Math.floor(width / (POSTER_WIDTH + GAP)));
    };

    const [columns, setColumns] = useState(5);

    // Update columns on resize
    const updateColumns = () => {
        setColumns(getColumnsCount());
    };

    useEffect(() => {
        updateColumns();
        window.addEventListener('resize', updateColumns);
        return () => window.removeEventListener('resize', updateColumns);
    }, [isSidebarCollapsed]);

    const rowCount = Math.ceil((movies?.length || 0) / columns);

    // Calculate row height: poster height + title bar height (with year) + gap
    // Using a larger value to ensure nothing gets clipped
    const ROW_HEIGHT = 360;

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => gridRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 2,
    });

    // Handle play - opens player overlay within Movies section
    const handlePlay = (movie: Channel) => {
        setSelectedMovie(null);
        setPlayingMovie(movie);
    };

    // Close player and return to browsing
    const handleClosePlayer = () => {
        setPlayingMovie(null);
    };

    if (!movieGroups || movieGroups.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                    <Film className="w-20 h-20 text-accent-primary/30 mx-auto mb-6" />
                    <h3 className="text-2xl font-bold mb-3">No Movies Found</h3>
                    <p className="text-foreground-muted leading-relaxed">
                        Movies will appear here when you add a playlist that contains VOD/Movie content.
                        Xtream Codes providers typically include a Movies section.
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
                    {movieGroups?.map((group: Group) => (
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
                        <Film className="w-6 h-6 text-accent-primary" />
                        <h2 className="text-xl font-bold">
                            {movieGroups?.find((g: Group) => g.id === selectedCategory)?.name || 'Movies'}
                        </h2>
                        <span className="text-foreground-muted text-sm">
                            ({movies?.length || 0} titles)
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
                            onChange={(e) => handleSortChange(e.target.value as MovieSortOption)}
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
                            placeholder="Search movies..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-8 py-2 rounded-xl bg-[#18181b] hover:bg-[#202024] border border-white/20 hover:border-white/35 text-foreground placeholder:text-foreground-secondary/70 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all text-sm font-medium shadow-inner"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background-hover"
                            >
                                <X className="w-4 h-4 text-foreground-muted" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Movie Grid */}
                <div
                    ref={gridRef}
                    className="flex-1 overflow-y-auto p-6"
                >
                    {movies && movies.length > 0 ? (
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const startIndex = virtualRow.index * columns;
                                const rowMovies = movies?.slice(startIndex, startIndex + columns) || [];

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
                                        {rowMovies.map((movie: Channel) => {
                                            // Extract year from name
                                            const yearMatch = movie.name.match(/\((\d{4})\)/);
                                            const year = yearMatch ? yearMatch[1] : null;
                                            const cleanName = cleanMediaTitle(movie.name);
                                            const movieRating = getRatingValue(movie);

                                            return (
                                                <button
                                                    key={movie.id}
                                                    onClick={() => setSelectedMovie(movie)}
                                                    className="group rounded-xl overflow-hidden bg-gray-900 hover:ring-2 hover:ring-accent-primary transition-all text-left h-full flex flex-col"
                                                >
                                                    {/* Poster Container - takes available space */}
                                                    <div className="flex-1 bg-gray-900 relative min-h-0">
                                                        {movie.logo ? (
                                                            <img
                                                                src={movie.logo}
                                                                alt={movie.name}
                                                                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                                                <Film className="w-16 h-16 text-gray-600" />
                                                            </div>
                                                        )}

                                                        {/* Rating Badge */}
                                                        {movieRating > 0 ? (
                                                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-green-600 text-white text-xs font-bold shadow-lg flex items-center gap-1">
                                                                <Star className="w-3 h-3 fill-white text-white" />
                                                                <span>{movieRating.toFixed(1)}</span>
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
                                        ? `No movies found for "${searchQuery}"`
                                        : 'No movies in this category'
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Movie Details Modal */}
            {
                selectedMovie && (
                    <MovieDetailsModal
                        movie={selectedMovie}
                        onClose={() => setSelectedMovie(null)}
                        onPlay={() => handlePlay(selectedMovie)}
                    />
                )
            }

            {/* Movie Player Overlay */}
            {playingMovie && (
                <MoviePlayerOverlay
                    movie={playingMovie}
                    onClose={handleClosePlayer}
                />
            )}
        </div >
    );
}

// Inline Movie Player Component
import { VideoPlayer } from '../player/VideoPlayer';

// ... (imports remain)

// Inline Movie Player Component replaced by generic wrapper around VideoPlayer
export interface MoviePlayerOverlayProps {
    movie: Channel;
    onClose: () => void;
}

export function MoviePlayerOverlay({ movie, onClose }: MoviePlayerOverlayProps) {
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastMousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

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
                        <h2 className="text-xl font-semibold text-white drop-shadow-md">{movie.name}</h2>
                        <p className="text-sm text-white/60 drop-shadow-md">Press back to return to Movies</p>
                    </div>
                </div>
            </div>

            <VideoPlayer channel={movie} className="w-full h-full" />
        </div>
    );
}


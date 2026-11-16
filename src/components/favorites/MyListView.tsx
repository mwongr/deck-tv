'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Star,
    Tv,
    Folder,
    Film,
    Clapperboard,
    SlidersHorizontal,
    Trash2,
    Check,
    X,
    Loader2,
    Plus,
    FolderPlus,
    ArrowLeft,
    LayoutGrid,
    List,
    AlignJustify,
    Search,
    ChevronsUpDown,
    Layers
} from 'lucide-react';
import { FilterChips, type FavoritesFilter } from './FilterChips';
import { ChannelFavoriteCard } from './ChannelFavoriteCard';
import { GroupFavoriteCard } from './GroupFavoriteCard';
import { PosterFavoriteCard } from './PosterFavoriteCard';
import { CustomGroupCard, type CustomGroupItem } from './CustomGroupCard';
import { CreateCustomGroupModal } from './CreateCustomGroupModal';
import { AddItemsToGroupModal } from './AddItemsToGroupModal';
import { FavoriteRow } from './FavoriteRow';
import { EmptyState } from './EmptyState';
import { useFavorites } from '@/hooks/useFavorites';
import { useToast } from '@/components/ui/Toast';
import { MovieDetailsModal, MoviePlayerOverlay } from '@/components/content/MoviesView';
import { SeriesDetailsModal, EpisodePlayerOverlay } from '@/components/content/SeriesView';
import type { Channel, Group, EPGProgram } from '@/lib/db';

interface MyListViewProps {
    onChannelSelect: (channel: Channel) => void;
    onGroupOpen: (group: Group) => void;
    onNavigateSection?: (section: string) => void;
}

type SortOption = 'custom' | 'recent' | 'name';
export type ViewMode = 'grid' | 'list' | 'compact';

export function MyListView({ onChannelSelect, onGroupOpen, onNavigateSection }: MyListViewProps) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [movies, setMovies] = useState<Channel[]>([]);
    const [series, setSeries] = useState<Channel[]>([]);
    const [customGroups, setCustomGroups] = useState<CustomGroupItem[]>([]);
    const [epgMap, setEpgMap] = useState<Map<string, EPGProgram>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    const [activeFilter, setActiveFilter] = useState<FavoritesFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('custom');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    // Custom Group Details view state
    const [activeCustomGroup, setActiveCustomGroup] = useState<CustomGroupItem | null>(null);
    const [customGroupItems, setCustomGroupItems] = useState<Channel[]>([]);
    const [isLoadingGroupItems, setIsLoadingGroupItems] = useState(false);

    // Modals
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [groupToAddItems, setGroupToAddItems] = useState<CustomGroupItem | null>(null);

    // Modals & player overlay states for movies/series
    const [selectedMovie, setSelectedMovie] = useState<Channel | null>(null);
    const [playingMovie, setPlayingMovie] = useState<Channel | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<Channel | null>(null);
    const [playingEpisode, setPlayingEpisode] = useState<{ url: string; title: string } | null>(null);

    const { toggleFavorite, reorderFavorites } = useFavorites();
    const { showToast } = useToast();

    // Load saved preferences
    useEffect(() => {
        const savedSort = localStorage.getItem('decktv:favorites_sort');
        if (savedSort === 'custom' || savedSort === 'recent' || savedSort === 'name') {
            setSortBy(savedSort as SortOption);
        }

        const savedView = localStorage.getItem('decktv:favorites_view');
        if (savedView === 'grid' || savedView === 'list' || savedView === 'compact') {
            setViewMode(savedView as ViewMode);
        }

        const savedCollapsed = localStorage.getItem('decktv:favorites_collapsed');
        if (savedCollapsed) {
            try {
                setCollapsedSections(new Set(JSON.parse(savedCollapsed)));
            } catch (e) {
                // Ignore parse errors
            }
        }
    }, []);

    const handleSortChange = (newSort: SortOption) => {
        setSortBy(newSort);
        localStorage.setItem('decktv:favorites_sort', newSort);
    };

    const handleViewModeChange = (newView: ViewMode) => {
        setViewMode(newView);
        localStorage.setItem('decktv:favorites_view', newView);
    };

    const toggleSectionCollapse = (sectionKey: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionKey)) {
                next.delete(sectionKey);
            } else {
                next.add(sectionKey);
            }
            localStorage.setItem('decktv:favorites_collapsed', JSON.stringify(Array.from(next)));
            return next;
        });
    };

    const toggleCollapseAll = () => {
        const allKeys = ['custom_groups', 'channels', 'groups', 'movies', 'series'];
        if (collapsedSections.size === allKeys.length) {
            // Expand all
            setCollapsedSections(new Set());
            localStorage.setItem('decktv:favorites_collapsed', JSON.stringify([]));
        } else {
            // Collapse all
            setCollapsedSections(new Set(allKeys));
            localStorage.setItem('decktv:favorites_collapsed', JSON.stringify(allKeys));
        }
    };

    // Fetch favorites and custom groups
    const fetchAllData = useCallback(async () => {
        try {
            const [favRes, customRes] = await Promise.all([
                fetch('/api/favorites'),
                fetch('/api/custom-groups')
            ]);

            if (favRes.ok) {
                const data = await favRes.json();
                setChannels(data.channels || []);
                setGroups(data.groups || []);
                setMovies(data.movies || []);
                setSeries(data.series || []);
            }

            if (customRes.ok) {
                const cData = await customRes.json();
                setCustomGroups(cData.groups || []);
            }
        } catch (e) {
            console.error('Failed to load favorites / custom groups:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Fetch items for active custom group if open
    const fetchActiveGroupItems = useCallback(async (groupId: string) => {
        setIsLoadingGroupItems(true);
        try {
            const res = await fetch(`/api/custom-groups/${groupId}`);
            if (res.ok) {
                const data = await res.json();
                setCustomGroupItems(data.items || []);
            }
        } catch (err) {
            console.error('Failed to fetch custom group items:', err);
        } finally {
            setIsLoadingGroupItems(false);
        }
    }, []);

    useEffect(() => {
        if (activeCustomGroup) {
            fetchActiveGroupItems(activeCustomGroup.id);
        } else {
            setCustomGroupItems([]);
        }
    }, [activeCustomGroup, fetchActiveGroupItems]);

    // Listen to global changes
    useEffect(() => {
        const handleFavoritesChanged = () => {
            fetchAllData();
            if (activeCustomGroup) {
                fetchActiveGroupItems(activeCustomGroup.id);
            }
        };

        window.addEventListener('favorites:changed', handleFavoritesChanged);
        return () => window.removeEventListener('favorites:changed', handleFavoritesChanged);
    }, [fetchAllData, activeCustomGroup, fetchActiveGroupItems]);

    // Fetch batch EPG for channels with tvgId (including custom group channels)
    const allChannelCandidates = useMemo(() => {
        return [...channels, ...customGroupItems];
    }, [channels, customGroupItems]);

    useEffect(() => {
        if (allChannelCandidates.length === 0) return;

        const tvgIds = allChannelCandidates
            .map((c) => c.tvgId)
            .filter((id): id is string => !!id && id.trim().length > 0);

        if (tvgIds.length === 0) return;

        const controller = new AbortController();

        const fetchNowPlaying = async () => {
            try {
                const now = new Date();
                const start = new Date(now.getTime() - 60 * 1000).toISOString();
                const end = new Date(now.getTime() + 60 * 1000).toISOString();

                const idsSlice = tvgIds.slice(0, 60).join(',');
                const res = await fetch(`/api/epg?tvgIds=${encodeURIComponent(idsSlice)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
                    signal: controller.signal
                });

                if (res.ok) {
                    const data = await res.json();
                    const newMap = new Map<string, EPGProgram>();
                    (data.programs || []).forEach((p: EPGProgram) => {
                        newMap.set(p.channelTvgId.toLowerCase(), p);
                    });
                    setEpgMap(newMap);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') console.error('EPG Batch fetch error:', err);
            }
        };

        fetchNowPlaying();
        const interval = setInterval(fetchNowPlaying, 60 * 1000);

        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [allChannelCandidates]);

    // Apply sorting helper
    const sortList = useCallback(
        <T extends { name: string; favoriteOrder?: number; order?: number; favoritedAt?: string; sortOrder?: number }>(items: T[]): T[] => {
            const list = [...items];
            if (sortBy === 'name') {
                return list.sort((a, b) => a.name.localeCompare(b.name));
            }
            if (sortBy === 'recent') {
                return list.sort((a, b) => {
                    const timeA = a.favoritedAt ? new Date(a.favoritedAt).getTime() : 0;
                    const timeB = b.favoritedAt ? new Date(b.favoritedAt).getTime() : 0;
                    return timeB - timeA;
                });
            }
            // 'custom' order
            return list.sort((a, b) => ((a.favoriteOrder ?? a.sortOrder ?? 0) - (b.favoriteOrder ?? b.sortOrder ?? 0)));
        },
        [sortBy]
    );

    // Filter helper based on search query
    const query = searchQuery.trim().toLowerCase();

    const filteredChannels = useMemo(() => {
        let list = channels;
        if (query) {
            list = list.filter((c) => {
                const prog = c.tvgId ? epgMap.get(c.tvgId.toLowerCase()) : null;
                return (
                    c.name.toLowerCase().includes(query) ||
                    (c.groupName && c.groupName.toLowerCase().includes(query)) ||
                    (prog?.title && prog.title.toLowerCase().includes(query))
                );
            });
        }
        return sortList(list);
    }, [channels, query, epgMap, sortList]);

    const filteredGroups = useMemo(() => {
        let list = groups;
        if (query) {
            list = list.filter((g) => g.name.toLowerCase().includes(query));
        }
        return sortList(list);
    }, [groups, query, sortList]);

    const filteredMovies = useMemo(() => {
        let list = movies;
        if (query) {
            list = list.filter((m) =>
                m.name.toLowerCase().includes(query) ||
                (m.groupName && m.groupName.toLowerCase().includes(query))
            );
        }
        return sortList(list);
    }, [movies, query, sortList]);

    const filteredSeries = useMemo(() => {
        let list = series;
        if (query) {
            list = list.filter((s) =>
                s.name.toLowerCase().includes(query) ||
                (s.groupName && s.groupName.toLowerCase().includes(query))
            );
        }
        return sortList(list);
    }, [series, query, sortList]);

    const filteredCustomGroups = useMemo(() => {
        let list = customGroups;
        if (query) {
            list = list.filter((cg) => cg.name.toLowerCase().includes(query));
        }
        return sortList(list);
    }, [customGroups, query, sortList]);

    const filteredCustomGroupItems = useMemo(() => {
        let list = customGroupItems;
        if (query) {
            list = list.filter((item) =>
                item.name.toLowerCase().includes(query) ||
                (item.groupName && item.groupName.toLowerCase().includes(query))
            );
        }
        return list;
    }, [customGroupItems, query]);

    const totalCount = channels.length + groups.length + movies.length + series.length + customGroups.length;
    const totalMatchingCount =
        filteredChannels.length +
        filteredGroups.length +
        filteredMovies.length +
        filteredSeries.length +
        filteredCustomGroups.length;

    // Selection toggle for edit mode
    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Bulk remove
    const handleBulkRemove = async () => {
        if (selectedIds.size === 0) return;

        const count = selectedIds.size;
        const idsToRemove = Array.from(selectedIds);

        // If inside active custom group, remove items from custom group
        if (activeCustomGroup) {
            try {
                await fetch(`/api/custom-groups/${activeCustomGroup.id}/items`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelIds: idsToRemove })
                });
                fetchActiveGroupItems(activeCustomGroup.id);
                fetchAllData();
                showToast({ message: `Removed ${count} item${count > 1 ? 's' : ''} from group`, type: 'info' });
            } catch (err) {
                console.error(err);
            }
            setSelectedIds(new Set());
            setIsEditMode(false);
            return;
        }

        const itemsToRevert: { id: string; name?: string; type: 'channel' | 'group' }[] = [];

        for (const id of idsToRemove) {
            const ch = channels.find((c) => c.id === id);
            if (ch) {
                itemsToRevert.push({ id, name: ch.name, type: 'channel' });
                toggleFavorite({ id, name: ch.name, favorite: 1 }, 'channel', false, false);
                continue;
            }
            const grp = groups.find((g) => g.id === id);
            if (grp) {
                itemsToRevert.push({ id, name: grp.name, type: 'group' });
                toggleFavorite({ id, name: grp.name, favorite: 1 }, 'group', false, false);
                continue;
            }
            const mov = movies.find((m) => m.id === id);
            if (mov) {
                itemsToRevert.push({ id, name: mov.name, type: 'channel' });
                toggleFavorite({ id, name: mov.name, favorite: 1 }, 'channel', false, false);
                continue;
            }
            const ser = series.find((s) => s.id === id);
            if (ser) {
                itemsToRevert.push({ id, name: ser.name, type: 'channel' });
                toggleFavorite({ id, name: ser.name, favorite: 1 }, 'channel', false, false);
            }
        }

        setSelectedIds(new Set());
        setIsEditMode(false);

        showToast({
            message: `Removed ${count} item${count > 1 ? 's' : ''} from Favorites`,
            type: 'info',
            action: {
                label: 'Undo',
                onClick: () => {
                    itemsToRevert.forEach((item) => {
                        toggleFavorite({ id: item.id, name: item.name, favorite: 0 }, item.type, true, false);
                    });
                }
            }
        });
    };

    // Custom Group deletion
    const handleDeleteCustomGroup = async (group: CustomGroupItem) => {
        if (!confirm(`Delete custom group "${group.name}"? (Channels/items will not be deleted)`)) {
            return;
        }
        try {
            const res = await fetch(`/api/custom-groups/${group.id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast({ message: `Deleted group "${group.name}"`, type: 'info' });
                if (activeCustomGroup?.id === group.id) {
                    setActiveCustomGroup(null);
                }
                fetchAllData();
            }
        } catch (err) {
            console.error('Failed to delete custom group:', err);
        }
    };

    // Drag-and-drop state & handlers
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleDragStart = (id: string) => (e: React.DragEvent) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (targetId: string, listType: 'channel' | 'group' | 'custom_group_items', currentList: { id: string }[]) => async (e: React.DragEvent) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const fromIndex = currentList.findIndex((i) => i.id === draggedId);
        const toIndex = currentList.findIndex((i) => i.id === targetId);

        if (fromIndex === -1 || toIndex === -1) return;

        const updated = [...currentList];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);

        const newIds = updated.map((i) => i.id);

        if (listType === 'custom_group_items' && activeCustomGroup) {
            await fetch(`/api/custom-groups/${activeCustomGroup.id}/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelIds: newIds })
            });
            fetchActiveGroupItems(activeCustomGroup.id);
        } else {
            await reorderFavorites(listType as any, newIds);
        }
        setDraggedId(null);
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
            </div>
        );
    }

    // RENDER: Inside an active Custom Group view
    if (activeCustomGroup) {
        return (
            <div className="h-full flex flex-col bg-background overflow-hidden">
                {/* Header */}
                <div className="shrink-0 px-6 py-4 border-b border-border bg-background-secondary/60 backdrop-blur-md flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveCustomGroup(null);
                                    setIsEditMode(false);
                                    setSelectedIds(new Set());
                                    setSearchQuery('');
                                }}
                                className="p-2 rounded-xl bg-background-tertiary hover:bg-background-hover text-foreground-muted hover:text-foreground transition-colors border border-border/60"
                                title="Back to My List"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold tracking-tight text-foreground">
                                        {activeCustomGroup.name}
                                    </h1>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full uppercase bg-background-tertiary text-foreground-muted font-bold border border-border/50">
                                        {activeCustomGroup.type} collection
                                    </span>
                                </div>
                                <p className="text-xs text-foreground-muted mt-0.5">
                                    {customGroupItems.length} {activeCustomGroup.type === 'movie' ? 'movies' : activeCustomGroup.type === 'series' ? 'series' : 'channels'} in this collection
                                </p>
                            </div>
                        </div>

                        {/* Top actions */}
                        <div className="flex items-center gap-2">
                            {/* View Switcher */}
                            <div className="flex items-center p-0.5 bg-background-tertiary border border-border/70 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => handleViewModeChange('grid')}
                                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                                        viewMode === 'grid'
                                            ? 'bg-accent-primary text-white shadow-sm'
                                            : 'text-foreground-muted hover:text-foreground'
                                    }`}
                                    title="Cards view"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleViewModeChange('list')}
                                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                                        viewMode === 'list'
                                            ? 'bg-accent-primary text-white shadow-sm'
                                            : 'text-foreground-muted hover:text-foreground'
                                    }`}
                                    title="List view"
                                >
                                    <List className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleViewModeChange('compact')}
                                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                                        viewMode === 'compact'
                                            ? 'bg-accent-primary text-white shadow-sm'
                                            : 'text-foreground-muted hover:text-foreground'
                                    }`}
                                    title="Compact view"
                                >
                                    <AlignJustify className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setGroupToAddItems(activeCustomGroup)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Items</span>
                            </button>

                            {customGroupItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditMode(!isEditMode);
                                        setSelectedIds(new Set());
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                                        isEditMode
                                            ? 'bg-accent-primary text-white border-accent-primary'
                                            : 'bg-background-tertiary text-foreground-secondary hover:text-foreground hover:bg-background-hover border-border/60'
                                    }`}
                                >
                                    {isEditMode ? (
                                        <>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Done</span>
                                        </>
                                    ) : (
                                        <span>Edit</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter bar inside custom group */}
                    {customGroupItems.length > 5 && (
                        <div className="relative max-w-sm">
                            <Search className="w-3.5 h-3.5 text-foreground-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={`Filter ${activeCustomGroup.name}...`}
                                className="w-full bg-background-tertiary/70 border border-border/70 rounded-xl pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent-primary transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Edit Mode Action Bar */}
                {isEditMode && (
                    <div className="bg-accent-primary/10 border-b border-accent-primary/30 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top-1">
                        <span className="text-foreground-secondary font-medium">
                            {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected · Drag to reorder
                        </span>
                        <div className="flex items-center gap-2">
                            {selectedIds.size > 0 && (
                                <button
                                    type="button"
                                    onClick={handleBulkRemove}
                                    className="flex items-center gap-1 px-3 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remove Selected ({selectedIds.size})</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditMode(false);
                                    setSelectedIds(new Set());
                                }}
                                className="p-1 text-foreground-muted hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Content Items */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {isLoadingGroupItems ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
                        </div>
                    ) : customGroupItems.length === 0 ? (
                        <EmptyState
                            icon={FolderPlus}
                            title="Group is empty"
                            description={`Add your favorite ${activeCustomGroup.type === 'movie' ? 'movies' : activeCustomGroup.type === 'series' ? 'TV series' : 'live channels'} to this custom group.`}
                            actionLabel="Add Items Now"
                            onAction={() => setGroupToAddItems(activeCustomGroup)}
                        />
                    ) : filteredCustomGroupItems.length === 0 ? (
                        <div className="py-12 text-center text-foreground-muted text-xs">
                            No items match &quot;{searchQuery}&quot;
                        </div>
                    ) : (
                        <div
                            className={
                                viewMode === 'grid'
                                    ? activeCustomGroup.type === 'live'
                                        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                                        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
                                    : viewMode === 'list'
                                    ? 'grid grid-cols-1 lg:grid-cols-2 gap-3'
                                    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2'
                            }
                        >
                            {filteredCustomGroupItems.map((item) => {
                                if (activeCustomGroup.type === 'live') {
                                    return (
                                        <ChannelFavoriteCard
                                            key={item.id}
                                            channel={item}
                                            currentProgram={item.tvgId ? epgMap.get(item.tvgId.toLowerCase()) : undefined}
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(item.id)}
                                            onSelectToggle={() => toggleSelect(item.id)}
                                            onClick={() => onChannelSelect(item)}
                                            onDragStart={handleDragStart(item.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop(item.id, 'custom_group_items', customGroupItems)}
                                        />
                                    );
                                }
                                return (
                                    <PosterFavoriteCard
                                        key={item.id}
                                        item={item}
                                        type={activeCustomGroup.type === 'movie' ? 'movie' : 'series'}
                                        viewMode={viewMode}
                                        isEditMode={isEditMode}
                                        isSelected={selectedIds.has(item.id)}
                                        onSelectToggle={() => toggleSelect(item.id)}
                                        onClick={() => {
                                            if (activeCustomGroup.type === 'movie') setSelectedMovie(item);
                                            else setSelectedSeries(item);
                                        }}
                                        onDragStart={handleDragStart(item.id)}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop(item.id, 'custom_group_items', customGroupItems)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {groupToAddItems && (
                    <AddItemsToGroupModal
                        isOpen={!!groupToAddItems}
                        group={groupToAddItems}
                        onClose={() => setGroupToAddItems(null)}
                        onItemsAdded={() => {
                            fetchActiveGroupItems(groupToAddItems.id);
                            fetchAllData();
                        }}
                    />
                )}
            </div>
        );
    }

    // MAIN VIEW
    return (
        <div className="h-full flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-border bg-background-secondary/60 backdrop-blur-md flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-4">
                    {/* Left: Star Logo + Title + Count */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center text-accent-primary shrink-0">
                            <Star className="w-5 h-5 fill-accent-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                <span>My List</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-background-tertiary text-foreground-muted font-normal border border-border/50">
                                    {searchQuery ? `${totalMatchingCount} of ${totalCount}` : `${totalCount} saved`}
                                </span>
                            </h1>
                        </div>
                    </div>

                    {/* Quick Search Input */}
                    <div className="relative flex-1 max-w-xs hidden sm:block">
                        <Search className="w-3.5 h-3.5 text-foreground-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter favorites..."
                            className="w-full bg-background-tertiary/70 border border-border/70 rounded-xl pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent-primary transition-colors"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Actions: View Switcher, Sort, + New Group, Edit */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* View Switcher: Cards vs List vs Compact */}
                        <div className="flex items-center p-0.5 bg-background-tertiary border border-border/70 rounded-xl">
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('grid')}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-accent-primary text-white shadow-sm'
                                        : 'text-foreground-muted hover:text-foreground'
                                }`}
                                title="Cards view"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('list')}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-accent-primary text-white shadow-sm'
                                        : 'text-foreground-muted hover:text-foreground'
                                }`}
                                title="List view"
                            >
                                <List className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('compact')}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    viewMode === 'compact'
                                        ? 'bg-accent-primary text-white shadow-sm'
                                        : 'text-foreground-muted hover:text-foreground'
                                }`}
                                title="Compact view"
                            >
                                <AlignJustify className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Sort Selector */}
                        <div className="flex items-center gap-1.5 bg-background-tertiary border border-border/70 px-2.5 py-1.5 rounded-xl text-xs">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-foreground-muted" />
                            <select
                                value={sortBy}
                                onChange={(e) => handleSortChange(e.target.value as SortOption)}
                                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                            >
                                <option value="custom" className="bg-background-secondary">My Order</option>
                                <option value="recent" className="bg-background-secondary">Recently Added</option>
                                <option value="name" className="bg-background-secondary">A–Z</option>
                            </select>
                        </div>

                        {/* Collapse All Toggle (available when showing All) */}
                        {activeFilter === 'all' && totalCount > 0 && (
                            <button
                                type="button"
                                onClick={toggleCollapseAll}
                                className="p-1.5 rounded-xl bg-background-tertiary border border-border/70 text-foreground-muted hover:text-foreground hover:bg-background-hover transition-colors"
                                title={collapsedSections.size === 5 ? 'Expand all sections' : 'Collapse all sections'}
                            >
                                <ChevronsUpDown className="w-4 h-4" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setIsCreateGroupOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New Group</span>
                        </button>

                        {/* Edit Mode Toggle */}
                        {totalCount > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditMode(!isEditMode);
                                    setSelectedIds(new Set());
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                                    isEditMode
                                        ? 'bg-accent-primary text-white border-accent-primary'
                                        : 'bg-background-tertiary text-foreground-secondary hover:text-foreground hover:bg-background-hover border-border/70'
                                }`}
                            >
                                {isEditMode ? (
                                    <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Done</span>
                                    </>
                                ) : (
                                    <span>Edit</span>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Chips Bar */}
                <FilterChips
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    counts={{
                        all: totalCount,
                        custom_groups: customGroups.length,
                        channels: channels.length,
                        groups: groups.length,
                        movies: movies.length,
                        series: series.length
                    }}
                />
            </div>

            {/* Edit Mode Action Bar */}
            {isEditMode && (
                <div className="bg-accent-primary/10 border-b border-accent-primary/30 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top-1">
                    <span className="text-foreground-secondary font-medium">
                        {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected
                        {sortBy === 'custom' && ' · Drag items to reorder'}
                    </span>
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={handleBulkRemove}
                                className="flex items-center gap-1 px-3 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove Selected ({selectedIds.size})</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setIsEditMode(false);
                                setSelectedIds(new Set());
                            }}
                            className="p-1 text-foreground-muted hover:text-foreground"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {totalCount === 0 ? (
                    <EmptyState
                        icon={Star}
                        title="Your list is empty"
                        description="Save channels, groups, movies, and TV shows or create custom groups."
                        actionLabel="Browse Live TV"
                        onAction={() => onNavigateSection?.('live')}
                    />
                ) : totalMatchingCount === 0 && searchQuery ? (
                    <div className="py-16 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-background-tertiary flex items-center justify-center mx-auto mb-3 text-foreground-muted">
                            <Search className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">No matches found</h3>
                        <p className="text-xs text-foreground-muted mt-1 max-w-sm mx-auto">
                            No favorite channels, groups, movies, or series matched &quot;{searchQuery}&quot;.
                        </p>
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-background-tertiary hover:bg-background-hover text-accent-primary transition-colors border border-border"
                        >
                            Clear search
                        </button>
                    </div>
                ) : (
                    <>
                        {/* 1. CUSTOM GROUPS SECTION */}
                        {(activeFilter === 'all' || activeFilter === 'custom_groups') && (
                            filteredCustomGroups.length > 0 ? (
                                <FavoriteRow
                                    title="My Custom Groups"
                                    icon={<FolderPlus className="w-4 h-4" />}
                                    count={filteredCustomGroups.length}
                                    themeColor="amber"
                                    viewMode={viewMode}
                                    contentType="group"
                                    isCollapsed={collapsedSections.has('custom_groups')}
                                    onToggleCollapse={() => toggleSectionCollapse('custom_groups')}
                                    onSeeAll={activeFilter === 'all' ? () => setActiveFilter('custom_groups') : undefined}
                                >
                                    {(activeFilter === 'all' && !searchQuery ? filteredCustomGroups.slice(0, 10) : filteredCustomGroups).map((cg) => (
                                        <CustomGroupCard
                                            key={cg.id}
                                            group={cg}
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(cg.id)}
                                            onSelectToggle={() => toggleSelect(cg.id)}
                                            onClick={() => setActiveCustomGroup(cg)}
                                            onAddItemsClick={() => setGroupToAddItems(cg)}
                                            onDeleteClick={() => handleDeleteCustomGroup(cg)}
                                        />
                                    ))}
                                </FavoriteRow>
                            ) : activeFilter === 'custom_groups' ? (
                                <EmptyState
                                    icon={FolderPlus}
                                    title="No custom groups created"
                                    description="Create your own custom groups specifically for Channels, Movies, or Series."
                                    actionLabel="Create Custom Group"
                                    onAction={() => setIsCreateGroupOpen(true)}
                                />
                            ) : null
                        )}

                        {/* 2. CHANNELS SECTION */}
                        {(activeFilter === 'all' || activeFilter === 'channels') && (
                            filteredChannels.length > 0 ? (
                                <FavoriteRow
                                    title="Favorite Channels"
                                    icon={<Tv className="w-4 h-4" />}
                                    count={filteredChannels.length}
                                    themeColor="blue"
                                    viewMode={viewMode}
                                    contentType="channel"
                                    isCollapsed={collapsedSections.has('channels')}
                                    onToggleCollapse={() => toggleSectionCollapse('channels')}
                                    onSeeAll={activeFilter === 'all' ? () => setActiveFilter('channels') : undefined}
                                >
                                    {(activeFilter === 'all' && !searchQuery ? filteredChannels.slice(0, 10) : filteredChannels).map((ch) => (
                                        <ChannelFavoriteCard
                                            key={ch.id}
                                            channel={ch}
                                            currentProgram={ch.tvgId ? epgMap.get(ch.tvgId.toLowerCase()) : undefined}
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(ch.id)}
                                            onSelectToggle={() => toggleSelect(ch.id)}
                                            onClick={() => onChannelSelect(ch)}
                                            onDragStart={handleDragStart(ch.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop(ch.id, 'channel', filteredChannels)}
                                        />
                                    ))}
                                </FavoriteRow>
                            ) : activeFilter === 'channels' ? (
                                <EmptyState
                                    icon={Tv}
                                    title="No favorite channels"
                                    description="Star channels from the Live TV channel list or TV Guide to see them here."
                                    actionLabel="Go to Live TV"
                                    onAction={() => onNavigateSection?.('live')}
                                />
                            ) : null
                        )}

                        {/* 3. PINNED GROUPS SECTION */}
                        {(activeFilter === 'all' || activeFilter === 'groups') && (
                            filteredGroups.length > 0 ? (
                                <FavoriteRow
                                    title="Pinned Groups"
                                    icon={<Folder className="w-4 h-4" />}
                                    count={filteredGroups.length}
                                    themeColor="emerald"
                                    viewMode={viewMode}
                                    contentType="group"
                                    isCollapsed={collapsedSections.has('groups')}
                                    onToggleCollapse={() => toggleSectionCollapse('groups')}
                                    onSeeAll={activeFilter === 'all' ? () => setActiveFilter('groups') : undefined}
                                >
                                    {(activeFilter === 'all' && !searchQuery ? filteredGroups.slice(0, 10) : filteredGroups).map((g) => (
                                        <GroupFavoriteCard
                                            key={g.id}
                                            group={g}
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(g.id)}
                                            onSelectToggle={() => toggleSelect(g.id)}
                                            onClick={() => onGroupOpen(g)}
                                            onDragStart={handleDragStart(g.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop(g.id, 'group', filteredGroups)}
                                        />
                                    ))}
                                </FavoriteRow>
                            ) : activeFilter === 'groups' ? (
                                <EmptyState
                                    icon={Folder}
                                    title="No pinned groups"
                                    description="Pin groups from the Live TV sidebar or TV Guide dropdown for fast access."
                                    actionLabel="Go to Live TV"
                                    onAction={() => onNavigateSection?.('live')}
                                />
                            ) : null
                        )}

                        {/* 4. MOVIES SECTION */}
                        {(activeFilter === 'all' || activeFilter === 'movies') && (
                            filteredMovies.length > 0 ? (
                                <FavoriteRow
                                    title="Favorite Movies"
                                    icon={<Film className="w-4 h-4" />}
                                    count={filteredMovies.length}
                                    themeColor="purple"
                                    viewMode={viewMode}
                                    contentType="poster"
                                    isCollapsed={collapsedSections.has('movies')}
                                    onToggleCollapse={() => toggleSectionCollapse('movies')}
                                    onSeeAll={activeFilter === 'all' ? () => setActiveFilter('movies') : undefined}
                                >
                                    {(activeFilter === 'all' && !searchQuery ? filteredMovies.slice(0, 12) : filteredMovies).map((m) => (
                                        <PosterFavoriteCard
                                            key={m.id}
                                            item={m}
                                            type="movie"
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(m.id)}
                                            onSelectToggle={() => toggleSelect(m.id)}
                                            onClick={() => setSelectedMovie(m)}
                                            onDragStart={handleDragStart(m.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop(m.id, 'channel', filteredMovies)}
                                        />
                                    ))}
                                </FavoriteRow>
                            ) : activeFilter === 'movies' ? (
                                <EmptyState
                                    icon={Film}
                                    title="No favorite movies"
                                    description="Open any movie and tap the star to add it to your list."
                                    actionLabel="Browse Movies"
                                    onAction={() => onNavigateSection?.('movies')}
                                />
                            ) : null
                        )}

                        {/* 5. SERIES SECTION */}
                        {(activeFilter === 'all' || activeFilter === 'series') && (
                            filteredSeries.length > 0 ? (
                                <FavoriteRow
                                    title="Favorite Series"
                                    icon={<Clapperboard className="w-4 h-4" />}
                                    count={filteredSeries.length}
                                    themeColor="rose"
                                    viewMode={viewMode}
                                    contentType="poster"
                                    isCollapsed={collapsedSections.has('series')}
                                    onToggleCollapse={() => toggleSectionCollapse('series')}
                                    onSeeAll={activeFilter === 'all' ? () => setActiveFilter('series') : undefined}
                                >
                                    {(activeFilter === 'all' && !searchQuery ? filteredSeries.slice(0, 12) : filteredSeries).map((s) => (
                                        <PosterFavoriteCard
                                            key={s.id}
                                            item={s}
                                            type="series"
                                            viewMode={viewMode}
                                            isEditMode={isEditMode}
                                            isSelected={selectedIds.has(s.id)}
                                            onSelectToggle={() => toggleSelect(s.id)}
                                            onClick={() => setSelectedSeries(s)}
                                            onDragStart={handleDragStart(s.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop(s.id, 'channel', filteredSeries)}
                                        />
                                    ))}
                                </FavoriteRow>
                            ) : activeFilter === 'series' ? (
                                <EmptyState
                                    icon={Clapperboard}
                                    title="No favorite series"
                                    description="Open any series and tap the star to add it to your list."
                                    actionLabel="Browse Series"
                                    onAction={() => onNavigateSection?.('series')}
                                />
                            ) : null
                        )}
                    </>
                )}
            </div>

            {/* Create Custom Group Modal */}
            {isCreateGroupOpen && (
                <CreateCustomGroupModal
                    isOpen={isCreateGroupOpen}
                    onClose={() => setIsCreateGroupOpen(false)}
                    onCreated={(newGroup) => {
                        fetchAllData();
                        showToast({ message: `Created group "${newGroup.name}"`, type: 'success' });
                    }}
                />
            )}

            {/* Add Items to Custom Group Modal */}
            {groupToAddItems && (
                <AddItemsToGroupModal
                    isOpen={!!groupToAddItems}
                    group={groupToAddItems}
                    onClose={() => setGroupToAddItems(null)}
                    onItemsAdded={() => {
                        fetchAllData();
                        showToast({ message: `Added items to "${groupToAddItems.name}"`, type: 'success' });
                    }}
                />
            )}

            {/* Movie Modal & Overlay Player */}
            {selectedMovie && (
                <MovieDetailsModal
                    movie={selectedMovie}
                    onClose={() => setSelectedMovie(null)}
                    onPlay={() => {
                        setPlayingMovie(selectedMovie);
                        setSelectedMovie(null);
                    }}
                />
            )}
            {playingMovie && (
                <MoviePlayerOverlay
                    movie={playingMovie}
                    onClose={() => setPlayingMovie(null)}
                />
            )}

            {/* Series Modal & Overlay Player */}
            {selectedSeries && (
                <SeriesDetailsModal
                    series={selectedSeries}
                    onClose={() => setSelectedSeries(null)}
                    onPlayEpisode={(url, title) => {
                        setPlayingEpisode({ url, title });
                        setSelectedSeries(null);
                    }}
                />
            )}
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

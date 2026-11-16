'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    X, Search, Check, Plus, Loader2, Tv, Film, Clapperboard,
    Star, Folder, CheckSquare, Square
} from 'lucide-react';
import { ChannelLogo } from '@/components/ui/ChannelLogo';
import type { Channel } from '@/lib/db';

interface AddItemsToGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: {
        id: string;
        name: string;
        type: 'live' | 'movie' | 'series';
    };
    onItemsAdded: () => void;
}

interface BrowseGroup {
    id: string;
    name: string;
    channelCount: number;
}

export function AddItemsToGroupModal({
    isOpen,
    onClose,
    group,
    onItemsAdded
}: AddItemsToGroupModalProps) {
    const [existingItemIds, setExistingItemIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Groups & Favorites browsing
    const [groups, setGroups] = useState<BrowseGroup[]>([]);
    const [favoriteItems, setFavoriteItems] = useState<Channel[]>([]);
    const [activeGroupId, setActiveGroupId] = useState<string>('favorites');
    const [groupFilter, setGroupFilter] = useState('');
    const [groupItemsCache, setGroupItemsCache] = useState<Map<string, Channel[]>>(new Map());
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    // Global search across entire playlist
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Channel[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const isGlobalSearchActive = searchQuery.trim().length >= 2;

    // Reset state & load initial data when modal opens
    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        setSelectedIds(new Set());
        setSearchQuery('');
        setSearchResults([]);
        setGroupFilter('');
        setGroupItemsCache(new Map());
        setIsLoadingGroups(true);

        const loadInitial = async () => {
            try {
                const catParam = group.type === 'live' ? 'live' : group.type === 'movie' ? 'vod' : 'series';

                const [groupRes, favRes, groupsRes] = await Promise.all([
                    fetch(`/api/custom-groups/${group.id}`),
                    fetch('/api/favorites'),
                    fetch(`/api/channels?type=groups&category=${catParam}`)
                ]);

                if (cancelled) return;

                const [groupData, favData, groupsData] = await Promise.all([
                    groupRes.json(),
                    favRes.json(),
                    groupsRes.json()
                ]);

                if (cancelled) return;

                const currentIds = new Set<string>((groupData.items || []).map((i: any) => i.id));
                setExistingItemIds(currentIds);

                const favs: Channel[] =
                    group.type === 'live'
                        ? (favData.channels || [])
                        : group.type === 'movie'
                            ? (favData.movies || [])
                            : (favData.series || []);
                setFavoriteItems(favs);

                const rawGroups: any[] = groupsData.groups || [];
                const cleanGroups: BrowseGroup[] = rawGroups
                    .filter((g) => g.id !== 'favorites' && !String(g.id).startsWith('custom:') && !g.isCustom)
                    .map((g) => ({
                        id: g.id,
                        name: g.name,
                        channelCount: g.channelCount ?? 0,
                    }));
                setGroups(cleanGroups);

                // Default to Favorites if user has any, otherwise first playlist group
                if (favs.length > 0) {
                    setActiveGroupId('favorites');
                } else if (cleanGroups.length > 0) {
                    setActiveGroupId(cleanGroups[0].id);
                } else {
                    setActiveGroupId('favorites');
                }
            } catch (err) {
                console.error('Failed to load groups for modal:', err);
            } finally {
                if (!cancelled) setIsLoadingGroups(false);
            }
        };

        loadInitial();

        return () => {
            cancelled = true;
        };
    }, [isOpen, group.id, group.type]);

    // Fetch items for the active playlist group when selected
    useEffect(() => {
        if (!isOpen || !activeGroupId || activeGroupId === 'favorites') return;
        if (groupItemsCache.has(activeGroupId)) return;

        let cancelled = false;
        setIsLoadingItems(true);

        const loadGroupItems = async () => {
            try {
                const res = await fetch(`/api/channels?groupId=${encodeURIComponent(activeGroupId)}`);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;

                setGroupItemsCache((prev) => {
                    const next = new Map(prev);
                    next.set(activeGroupId, data.channels || []);
                    return next;
                });
            } catch (err) {
                console.error('Failed to load group items:', err);
            } finally {
                if (!cancelled) setIsLoadingItems(false);
            }
        };

        loadGroupItems();

        return () => {
            cancelled = true;
        };
    }, [isOpen, activeGroupId, groupItemsCache]);

    // Global debounced search across all channels/movies/series via /api/search
    useEffect(() => {
        if (!isOpen) return;
        const trimmed = searchQuery.trim();
        if (trimmed.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        let cancelled = false;
        setIsSearching(true);

        const timer = setTimeout(async () => {
            try {
                const searchType =
                    group.type === 'live' ? 'channels' : group.type === 'movie' ? 'movies' : 'series';
                const params = new URLSearchParams({
                    q: trimmed,
                    type: searchType,
                    limit: '150',
                });
                const res = await fetch(`/api/search?${params.toString()}`);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;

                const results: Channel[] =
                    group.type === 'live'
                        ? (data.channels || [])
                        : group.type === 'movie'
                            ? (data.movies || [])
                            : (data.series || []);
                setSearchResults(results);
            } catch (err) {
                console.error('Failed to search items:', err);
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isOpen, searchQuery, group.type]);

    const filteredGroups = useMemo(() => {
        const q = groupFilter.toLowerCase().trim();
        if (!q) return groups;
        return groups.filter((g) => g.name.toLowerCase().includes(q));
    }, [groups, groupFilter]);

    // Active list of items to display in the right pane
    const visibleItems = useMemo(() => {
        const source = isGlobalSearchActive
            ? searchResults
            : activeGroupId === 'favorites'
                ? favoriteItems
                : (groupItemsCache.get(activeGroupId) || []);

        const singleCharFilter = searchQuery.trim().length === 1 ? searchQuery.trim().toLowerCase() : '';

        return source.filter((item) => {
            if (existingItemIds.has(item.id)) return false;
            if (singleCharFilter) {
                return (
                    item.name.toLowerCase().includes(singleCharFilter) ||
                    (item.groupName && item.groupName.toLowerCase().includes(singleCharFilter))
                );
            }
            return true;
        });
    }, [
        isGlobalSearchActive,
        searchResults,
        activeGroupId,
        favoriteItems,
        groupItemsCache,
        existingItemIds,
        searchQuery,
    ]);

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleSelected =
        visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));

    const toggleSelectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleItems.forEach((item) => next.delete(item.id));
            } else {
                visibleItems.forEach((item) => next.add(item.id));
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (selectedIds.size === 0) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/custom-groups/${group.id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelIds: Array.from(selectedIds) })
            });

            if (res.ok) {
                onItemsAdded();
                onClose();
            }
        } catch (err) {
            console.error('Failed to add items to group:', err);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const activeGroupName =
        activeGroupId === 'favorites'
            ? 'Favorites'
            : groups.find((g) => g.id === activeGroupId)?.name || 'Group';

    const typeLabel = group.type === 'live' ? 'channels' : group.type === 'movie' ? 'movies' : 'series';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-background-secondary border border-border rounded-2xl w-full max-w-4xl h-[82vh] flex flex-col shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0 bg-background-secondary">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
                            {group.type === 'live' && <Tv className="w-5 h-5" />}
                            {group.type === 'movie' && <Film className="w-5 h-5" />}
                            {group.type === 'series' && <Clapperboard className="w-5 h-5" />}
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                <span>Add to &quot;{group.name}&quot;</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full uppercase bg-background-tertiary text-foreground-muted font-bold">
                                    {group.type}
                                </span>
                            </h2>
                            <p className="text-xs text-foreground-muted">
                                Browse groups or search all {typeLabel} to add to this custom group
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 text-foreground-muted hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Global Search Bar */}
                <div className="p-3 border-b border-border bg-background-tertiary/50 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={`Search all ${typeLabel} across your playlists (min 2 characters)...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-9 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-accent-primary transition-colors"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-foreground-muted hover:text-foreground"
                                title="Clear search"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Two-Pane Body: Groups Sidebar + Items List */}
                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Left Pane: Groups Browser */}
                    <div className="w-56 sm:w-64 border-r border-border bg-background-tertiary/25 flex flex-col shrink-0 min-h-0">
                        <div className="p-2.5 border-b border-border/60">
                            <input
                                type="text"
                                placeholder="Filter groups..."
                                value={groupFilter}
                                onChange={(e) => setGroupFilter(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent-primary"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {isLoadingGroups ? (
                                <div className="py-8 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                                </div>
                            ) : (
                                <>
                                    {/* Favorites Shortcut */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveGroupId('favorites');
                                            if (isGlobalSearchActive) setSearchQuery('');
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                                            !isGlobalSearchActive && activeGroupId === 'favorites'
                                                ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                                                : 'text-foreground-secondary hover:bg-background-hover hover:text-foreground'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <Star className="w-3.5 h-3.5 shrink-0 fill-current text-amber-400" />
                                            <span className="truncate">Favorites</span>
                                        </span>
                                        <span className="text-[10px] text-foreground-muted ml-1 shrink-0">
                                            {favoriteItems.length}
                                        </span>
                                    </button>

                                    <div className="my-1.5 border-t border-border/50" />

                                    {/* Playlist Groups */}
                                    {filteredGroups.map((g) => {
                                        const isActive = !isGlobalSearchActive && activeGroupId === g.id;
                                        return (
                                            <button
                                                key={g.id}
                                                type="button"
                                                onClick={() => {
                                                    setActiveGroupId(g.id);
                                                    if (isGlobalSearchActive) setSearchQuery('');
                                                }}
                                                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                                                    isActive
                                                        ? 'bg-accent-primary/15 text-accent-primary font-semibold border border-accent-primary/30'
                                                        : 'text-foreground-secondary hover:bg-background-hover hover:text-foreground'
                                                }`}
                                                title={g.name}
                                            >
                                                <span className="flex items-center gap-2 truncate">
                                                    <Folder className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                                                    <span className="truncate">{g.name}</span>
                                                </span>
                                                <span className="text-[10px] text-foreground-muted ml-1 shrink-0">
                                                    {g.channelCount}
                                                </span>
                                            </button>
                                        );
                                    })}

                                    {filteredGroups.length === 0 && (
                                        <p className="text-[11px] text-foreground-muted text-center py-4">
                                            No groups match &quot;{groupFilter}&quot;
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Pane: Items List */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0">
                        {/* Context & Bulk Select Bar */}
                        <div className="px-3 py-2 border-b border-border/60 bg-background-secondary/60 flex items-center justify-between gap-2 shrink-0">
                            <span className="text-xs font-medium text-foreground-secondary truncate">
                                {isGlobalSearchActive
                                    ? `Search results for "${searchQuery.trim()}" (${visibleItems.length})`
                                    : `${activeGroupName} (${visibleItems.length} available)`}
                            </span>

                            {visibleItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleSelectAllVisible}
                                    className="flex items-center gap-1.5 text-[11px] font-medium text-accent-primary hover:underline shrink-0"
                                >
                                    {allVisibleSelected ? (
                                        <>
                                            <Square className="w-3.5 h-3.5" />
                                            <span>Deselect Visible</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckSquare className="w-3.5 h-3.5" />
                                            <span>Select All Visible</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Scrollable Items */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                            {isLoadingGroups || isLoadingItems || isSearching ? (
                                <div className="h-48 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
                                </div>
                            ) : visibleItems.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-foreground-muted">
                                    <p className="text-sm font-medium">No available items found</p>
                                    <p className="text-xs mt-1 text-foreground-muted/80">
                                        {isGlobalSearchActive
                                            ? 'Try a different search term or browse groups on the left.'
                                            : activeGroupId === 'favorites' && favoriteItems.length === 0
                                                ? 'No favorites yet — select a group on the left or use the search bar above.'
                                                : 'All items in this view are already in the group.'}
                                    </p>
                                </div>
                            ) : (
                                visibleItems.map((item) => {
                                    const isSelected = selectedIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleSelection(item.id)}
                                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-accent-primary/10 border-accent-primary'
                                                    : 'bg-background-tertiary/40 border-border/50 hover:bg-background-hover'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div
                                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                                        isSelected
                                                            ? 'bg-accent-primary border-accent-primary text-white'
                                                            : 'border-border bg-background'
                                                    }`}
                                                >
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>

                                                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                                                    <ChannelLogo
                                                        src={item.logo}
                                                        alt={item.name}
                                                        fallbackClassName="w-4 h-4 text-foreground-muted"
                                                    />
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
                                                    {item.groupName && (
                                                        <span className="text-[10px] text-foreground-muted truncate block">
                                                            {item.groupName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-background-secondary flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-foreground-muted font-medium">
                            {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected
                        </span>
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs text-foreground-muted hover:text-foreground underline"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={selectedIds.size === 0 || isSaving}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-colors shadow-md flex items-center gap-1.5"
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>Add Selected</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

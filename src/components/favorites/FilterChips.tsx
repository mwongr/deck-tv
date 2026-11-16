'use client';

import React from 'react';
import { Tv, Folder, Film, Clapperboard, Star, FolderHeart } from 'lucide-react';

export type FavoritesFilter = 'all' | 'custom_groups' | 'channels' | 'groups' | 'movies' | 'series';

interface FilterChipsProps {
    activeFilter: FavoritesFilter;
    onFilterChange: (filter: FavoritesFilter) => void;
    counts: {
        all: number;
        custom_groups: number;
        channels: number;
        groups: number;
        movies: number;
        series: number;
    };
}

export function FilterChips({ activeFilter, onFilterChange, counts }: FilterChipsProps) {
    const filters: { id: FavoritesFilter; label: string; icon: React.ElementType; count: number }[] = [
        { id: 'all', label: 'All Items', icon: Star, count: counts.all },
        { id: 'custom_groups', label: 'Custom Groups', icon: FolderHeart, count: counts.custom_groups },
        { id: 'channels', label: 'Channels', icon: Tv, count: counts.channels },
        { id: 'groups', label: 'Pinned Groups', icon: Folder, count: counts.groups },
        { id: 'movies', label: 'Movies', icon: Film, count: counts.movies },
        { id: 'series', label: 'Series', icon: Clapperboard, count: counts.series }
    ];

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filters.map((f) => {
                const Icon = f.icon;
                const isActive = activeFilter === f.id;

                return (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => onFilterChange(f.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                            isActive
                                ? 'bg-accent-primary text-white border-transparent shadow-md shadow-accent-primary/20 scale-[1.02]'
                                : 'bg-background-tertiary/90 border-border text-foreground-secondary hover:text-foreground hover:bg-background-hover hover:border-white/15'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{f.label}</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                                isActive ? 'bg-black/25 text-white' : 'bg-background-secondary text-foreground-muted'
                            }`}
                        >
                            {f.count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

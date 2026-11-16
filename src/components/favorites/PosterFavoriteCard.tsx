'use client';

import React from 'react';
import { Film, Tv2, Play, Check, GripVertical } from 'lucide-react';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import type { Channel } from '@/lib/db';

interface PosterFavoriteCardProps {
    item: Channel;
    type: 'movie' | 'series';
    viewMode?: 'grid' | 'list' | 'compact';
    isEditMode?: boolean;
    isSelected?: boolean;
    onSelectToggle?: () => void;
    onClick?: () => void;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export function PosterFavoriteCard({
    item,
    type,
    viewMode = 'grid',
    isEditMode,
    isSelected,
    onSelectToggle,
    onClick,
    onDragStart,
    onDragOver,
    onDrop
}: PosterFavoriteCardProps) {
    const yearMatch = item.name.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : null;
    const cleanName = item.name.replace(/\s*\(\d{4}\)\s*/g, '').trim();

    const hoverRing = 'hover:ring-accent-primary/60';
    const playBg = 'bg-accent-primary';
    const badgeColor = 'bg-accent-primary/15 text-accent-primary border-accent-primary/30';

    // 1. COMPACT VIEW (dense single-line row)
    if (viewMode === 'compact') {
        return (
            <div
                draggable={isEditMode}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={isEditMode ? onSelectToggle : onClick}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg border transition-all cursor-pointer select-none text-xs ${
                    isSelected
                        ? 'bg-accent-primary/15 border-accent-primary ring-1 ring-accent-primary'
                        : 'bg-background-tertiary/90 border-white/10 shadow-sm shadow-black/20 hover:border-accent-primary/60 hover:bg-background-hover'
                }`}
            >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isEditMode && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectToggle?.();
                                }}
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                    isSelected
                                        ? 'bg-accent-primary border-accent-primary text-white'
                                        : 'border-border bg-background-tertiary'
                                }`}
                            >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="cursor-grab active:cursor-grabbing text-foreground-muted hover:text-foreground">
                                <GripVertical className="w-3.5 h-3.5" />
                            </div>
                        </div>
                    )}

                    <div className="w-7 h-10 rounded bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                        {item.logo ? (
                            <img
                                src={item.logo}
                                alt={cleanName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                {type === 'movie' ? (
                                    <Film className="w-3.5 h-3.5 text-accent-primary/50" />
                                ) : (
                                    <Tv2 className="w-3.5 h-3.5 text-accent-primary/50" />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate group-hover:text-accent-primary transition-colors">
                            {cleanName}
                        </span>
                        {year && (
                            <span className="text-[10px] text-foreground-muted shrink-0">
                                ({year})
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${badgeColor} font-semibold uppercase`}>
                        {type === 'movie' ? 'Movie' : 'Series'}
                    </span>

                    {!isEditMode && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.();
                                }}
                                className={`w-6 h-6 rounded-md ${badgeColor} hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100`}
                                title="Play"
                            >
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                            </button>
                            <FavoriteButton
                                id={item.id}
                                name={cleanName}
                                initialFavorite={item.favorite}
                                size="sm"
                                contentType={type}
                                showGroupAdd={true}
                            />
                        </>
                    )}
                </div>
            </div>
        );
    }

    // 2. LIST VIEW (spacious horizontal row)
    if (viewMode === 'list') {
        return (
            <div
                draggable={isEditMode}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={isEditMode ? onSelectToggle : onClick}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    isSelected
                        ? 'bg-accent-primary/15 border-accent-primary ring-1 ring-accent-primary'
                        : 'bg-background-tertiary border-white/10 shadow-sm shadow-black/20 hover:border-accent-primary/60 hover:bg-background-hover hover:shadow-md'
                }`}
            >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {isEditMode && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectToggle?.();
                                }}
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                                    isSelected
                                        ? 'bg-accent-primary border-accent-primary text-white'
                                        : 'border-border bg-background-tertiary'
                                }`}
                            >
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="cursor-grab active:cursor-grabbing text-foreground-muted hover:text-foreground">
                                <GripVertical className="w-4 h-4" />
                            </div>
                        </div>
                    )}

                    <div className="w-12 h-16 rounded-lg bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 border border-border/50">
                        {item.logo ? (
                            <img
                                src={item.logo}
                                alt={cleanName}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                {type === 'movie' ? (
                                    <Film className="w-6 h-6 text-accent-primary/50" />
                                ) : (
                                    <Tv2 className="w-6 h-6 text-accent-primary/50" />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-accent-primary transition-colors">
                                {cleanName}
                            </h4>
                            {year && (
                                <span className="text-xs text-foreground-muted shrink-0 font-medium">
                                    ({year})
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeColor} font-semibold uppercase tracking-wider`}>
                                {type === 'movie' ? 'Movie' : 'Series'}
                            </span>
                            {item.groupName && (
                                <span className="text-xs text-foreground-muted truncate">
                                    {item.groupName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    {!isEditMode && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.();
                                }}
                                className={`w-8 h-8 rounded-lg ${badgeColor} hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-sm`}
                                title="Play"
                            >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </button>
                            <FavoriteButton
                                id={item.id}
                                name={cleanName}
                                initialFavorite={item.favorite}
                                size="sm"
                                contentType={type}
                                showGroupAdd={true}
                            />
                        </>
                    )}
                </div>
            </div>
        );
    }

    // 3. GRID VIEW (Cards / Poster View - default)
    return (
        <div
            draggable={isEditMode}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={isEditMode ? onSelectToggle : onClick}
            className={`group rounded-xl overflow-hidden bg-background-tertiary border transition-all text-left flex flex-col cursor-pointer select-none relative shadow-sm shadow-black/30 hover:shadow-md hover:-translate-y-0.5 ${
                isSelected
                    ? 'border-accent-primary ring-2 ring-accent-primary'
                    : `border-white/10 hover:border-white/20 ${hoverRing}`
            }`}
        >
            {/* Poster container */}
            <div className="aspect-[2/3] w-full bg-background-tertiary relative overflow-hidden flex items-center justify-center">
                {item.logo ? (
                    <img
                        src={item.logo}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        {type === 'movie' ? (
                            <Film className="w-12 h-12 text-accent-primary/40" />
                        ) : (
                            <Tv2 className="w-12 h-12 text-accent-primary/40" />
                        )}
                    </div>
                )}

                {/* Edit Mode Checkbox / Drag indicator */}
                {isEditMode ? (
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 rounded-md border border-white/10">
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectToggle?.();
                            }}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isSelected
                                    ? 'bg-accent-primary border-accent-primary text-white'
                                    : 'border-white/50 bg-black/40'
                            }`}
                        >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="cursor-grab active:cursor-grabbing text-white/80">
                            <GripVertical className="w-4 h-4" />
                        </div>
                    </div>
                ) : (
                    <div className="absolute top-2 right-2 z-20">
                        <FavoriteButton
                            id={item.id}
                            name={cleanName}
                            initialFavorite={item.favorite}
                            size="sm"
                            contentType={type}
                            showGroupAdd={true}
                            className="bg-black/70 backdrop-blur-md rounded-full border border-white/10"
                        />
                    </div>
                )}

                {/* Hover Play icon */}
                {!isEditMode && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className={`w-12 h-12 rounded-full ${playBg} flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform`}>
                            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                        </div>
                    </div>
                )}
            </div>

            {/* Title Bar */}
            <div className="p-2.5 bg-background-tertiary border-t border-white/10 shrink-0">
                <p className="text-sm font-semibold text-foreground truncate group-hover:text-accent-primary transition-colors">
                    {cleanName}
                </p>
                <div className="flex items-center justify-between text-xs text-foreground-muted mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded border ${badgeColor} font-medium`}>
                        {type === 'movie' ? 'Movie' : 'Series'}
                    </span>
                    {year && <span className="font-medium">{year}</span>}
                </div>
            </div>
        </div>
    );
}

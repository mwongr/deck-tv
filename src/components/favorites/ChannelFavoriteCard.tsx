'use client';

import React from 'react';
import { Play, Check, GripVertical, Radio } from 'lucide-react';
import { ChannelLogo } from '@/components/ui/ChannelLogo';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import type { Channel, EPGProgram } from '@/lib/db';

interface ChannelFavoriteCardProps {
    channel: Channel;
    currentProgram?: EPGProgram;
    viewMode?: 'grid' | 'list' | 'compact';
    isEditMode?: boolean;
    isSelected?: boolean;
    onSelectToggle?: () => void;
    onClick?: () => void;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export function ChannelFavoriteCard({
    channel,
    currentProgram,
    viewMode = 'grid',
    isEditMode,
    isSelected,
    onSelectToggle,
    onClick,
    onDragStart,
    onDragOver,
    onDrop
}: ChannelFavoriteCardProps) {
    // Calculate progress if currentProgram has start & end
    let progress = 0;
    let isLive = false;
    if (currentProgram?.start && currentProgram?.end) {
        const start = new Date(currentProgram.start).getTime();
        const end = new Date(currentProgram.end).getTime();
        const now = Date.now();
        if (end > start) {
            progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
            isLive = now >= start && now <= end;
        }
    }

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
                {/* Left: edit handle, logo, name, group */}
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

                    <div className="w-6 h-6 rounded bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                        <ChannelLogo
                            src={channel.logo}
                            alt={channel.name}
                            fallbackClassName="w-3.5 h-3.5 text-foreground-muted"
                        />
                    </div>

                    <div className="min-w-0 flex items-center gap-2">
                        <span
                            title={channel.name}
                            className="font-semibold text-foreground truncate group-hover:text-accent-primary transition-colors"
                        >
                            {channel.name}
                        </span>
                        {channel.groupName && (
                            <span className="text-[10px] text-foreground-muted truncate max-w-[100px] hidden sm:inline">
                                • {channel.groupName}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Now playing snippet, play & star */}
                <div className="flex items-center gap-3 shrink-0 ml-2">
                    {currentProgram?.title && (
                        <span className="text-[11px] text-foreground-muted truncate max-w-[140px] hidden md:inline">
                            {currentProgram.title}
                        </span>
                    )}

                    {!isEditMode && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.();
                                }}
                                className="w-6 h-6 rounded-md bg-accent-primary/10 hover:bg-accent-primary text-accent-primary hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                title="Play Channel"
                            >
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                            </button>
                            <FavoriteButton
                                id={channel.id}
                                name={channel.name}
                                initialFavorite={channel.favorite}
                                contentType="live"
                                showGroupAdd={true}
                                size="sm"
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
                <div className="flex items-center gap-3 min-w-0 flex-1">
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

                    <div className="w-10 h-10 rounded-lg bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 border border-border/50">
                        <ChannelLogo
                            src={channel.logo}
                            alt={channel.name}
                            fallbackClassName="w-5 h-5 text-foreground-muted"
                        />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h4
                                title={channel.name}
                                className="font-semibold text-sm text-foreground line-clamp-2 break-words leading-snug group-hover:text-accent-primary transition-colors"
                            >
                                {channel.name}
                            </h4>
                            {channel.groupName && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted font-medium shrink-0">
                                    {channel.groupName}
                                </span>
                            )}
                        </div>

                        {/* Current program */}
                        <div className="flex items-center gap-2 mt-1">
                            {isLive && (
                                <span className="flex items-center gap-1 text-[10px] text-red-400 font-semibold uppercase tracking-wider shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    Live
                                </span>
                            )}
                            <span className="text-xs text-foreground-muted truncate">
                                {currentProgram?.title ? currentProgram.title : 'Live Broadcast'}
                            </span>
                        </div>

                        {/* Progress bar */}
                        {progress > 0 && (
                            <div className="w-36 max-w-full h-1 bg-background-tertiary rounded-full overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-accent-primary rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    {!isEditMode && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.();
                                }}
                                className="w-8 h-8 rounded-lg bg-accent-primary/10 hover:bg-accent-primary text-accent-primary hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                title="Play Channel"
                            >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </button>
                            <FavoriteButton
                                id={channel.id}
                                name={channel.name}
                                initialFavorite={channel.favorite}
                                contentType="live"
                                showGroupAdd={true}
                                size="sm"
                            />
                        </>
                    )}
                </div>
            </div>
        );
    }

    // 3. GRID VIEW (Cards view - default)
    return (
        <div
            draggable={isEditMode}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={isEditMode ? onSelectToggle : onClick}
            className={`group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                isSelected
                    ? 'bg-accent-primary/15 border-accent-primary ring-1 ring-accent-primary'
                    : 'bg-background-tertiary border-white/10 shadow-sm shadow-black/25 hover:border-accent-primary/60 hover:bg-background-hover hover:shadow-md hover:-translate-y-0.5'
            }`}
        >
            {/* Top row: Logo, drag handle / checkbox, & favorite button */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {isEditMode && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectToggle?.();
                            }}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                                isSelected
                                    ? 'bg-accent-primary border-accent-primary text-white'
                                    : 'border-border bg-background-tertiary'
                            }`}
                        >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                    )}
                    <div className="w-11 h-11 rounded-lg bg-background-secondary flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                        <ChannelLogo
                            src={channel.logo}
                            alt={channel.name}
                            fallbackClassName="w-5 h-5 text-foreground-muted"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4
                            title={channel.name}
                            className="font-semibold text-sm text-foreground line-clamp-2 break-words leading-snug group-hover:text-accent-primary transition-colors"
                        >
                            {channel.name}
                        </h4>
                        <span className="text-[11px] text-foreground-muted truncate block mt-0.5">
                            {channel.groupName}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {isEditMode ? (
                        <div className="cursor-grab active:cursor-grabbing p-1 text-foreground-muted hover:text-foreground">
                            <GripVertical className="w-4 h-4" />
                        </div>
                    ) : (
                        <FavoriteButton
                            id={channel.id}
                            name={channel.name}
                            initialFavorite={channel.favorite}
                            contentType="live"
                            showGroupAdd={true}
                            size="sm"
                        />
                    )}
                </div>
            </div>

            {/* Now playing & progress */}
            <div className="mt-3 pt-2.5 border-t border-border/40">
                <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5 truncate max-w-[85%]">
                        {isLive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                        )}
                        <span className="text-foreground-secondary truncate font-medium">
                            {currentProgram?.title ? currentProgram.title : 'Live Broadcast'}
                        </span>
                    </div>
                    {!isEditMode && (
                        <div className="w-5 h-5 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                        </div>
                    )}
                </div>
                {/* Progress bar */}
                <div className="w-full h-1 bg-background-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-accent-primary rounded-full transition-all duration-300"
                        style={{ width: `${progress > 0 ? progress : 35}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

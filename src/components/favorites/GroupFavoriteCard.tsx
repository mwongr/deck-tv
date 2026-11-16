'use client';

import React from 'react';
import { Folder, ChevronRight, Check, GripVertical } from 'lucide-react';
import { PinButton } from '@/components/ui/PinButton';
import { cleanCategoryName, getContentType } from '@/lib/content-type';
import type { Group } from '@/lib/db';

interface GroupFavoriteCardProps {
    group: Group;
    viewMode?: 'grid' | 'list' | 'compact';
    isEditMode?: boolean;
    isSelected?: boolean;
    onSelectToggle?: () => void;
    onClick?: () => void;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export function GroupFavoriteCard({
    group,
    viewMode = 'grid',
    isEditMode,
    isSelected,
    onSelectToggle,
    onClick,
    onDragStart,
    onDragOver,
    onDrop
}: GroupFavoriteCardProps) {
    const kind = getContentType(group.name);
    const cleanName = cleanCategoryName(group.name);

    const kindColor = 'text-accent-primary bg-accent-primary/15 border-accent-primary/30';

    const itemLabel = kind === 'movie' ? 'movies' : kind === 'series' ? 'shows' : 'channels';

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

                    <div className={`w-6 h-6 rounded flex items-center justify-center border shrink-0 ${kindColor}`}>
                        <Folder className="w-3.5 h-3.5" />
                    </div>

                    <span
                        title={cleanName}
                        className="font-semibold text-foreground truncate group-hover:text-accent-primary transition-colors"
                    >
                        {cleanName}
                    </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-background-tertiary text-foreground-muted font-medium">
                        {group.channelCount} {itemLabel}
                    </span>
                    {!isEditMode && (
                        <PinButton id={group.id} name={group.name} initialPinned={group.favorite} size="sm" />
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

                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${kindColor}`}>
                        <Folder className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h4
                            title={cleanName}
                            className="font-semibold text-sm text-foreground line-clamp-2 break-words leading-snug group-hover:text-accent-primary transition-colors"
                        >
                            {cleanName}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-foreground-muted">
                                {group.channelCount} {itemLabel}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${kindColor} font-semibold uppercase`}>
                                {kind}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                    {!isEditMode ? (
                        <>
                            <PinButton id={group.id} name={group.name} initialPinned={group.favorite} size="md" />
                            <ChevronRight className="w-4 h-4 text-foreground-muted group-hover:text-foreground transition-colors" />
                        </>
                    ) : (
                        <div className="cursor-grab active:cursor-grabbing p-1 text-foreground-muted hover:text-foreground">
                            <GripVertical className="w-4 h-4" />
                        </div>
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
            className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                isSelected
                    ? 'bg-accent-primary/15 border-accent-primary ring-1 ring-accent-primary'
                    : 'bg-background-tertiary border-white/10 shadow-sm shadow-black/25 hover:border-accent-primary/60 hover:bg-background-hover hover:shadow-md hover:-translate-y-0.5'
            }`}
        >
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
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

                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${kindColor}`}>
                    <Folder className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                    <h4
                        title={cleanName}
                        className="font-semibold text-sm text-foreground line-clamp-2 break-words leading-snug group-hover:text-accent-primary transition-colors"
                    >
                        {cleanName}
                    </h4>
                    <span className="text-xs text-foreground-muted mt-0.5 block">
                        {group.channelCount} {itemLabel}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {isEditMode ? (
                    <div className="cursor-grab active:cursor-grabbing p-1 text-foreground-muted hover:text-foreground">
                        <GripVertical className="w-4 h-4" />
                    </div>
                ) : (
                    <>
                        <PinButton id={group.id} name={group.name} initialPinned={group.favorite} size="md" />
                        <ChevronRight className="w-4 h-4 text-foreground-muted group-hover:text-foreground transition-colors" />
                    </>
                )}
            </div>
        </div>
    );
}

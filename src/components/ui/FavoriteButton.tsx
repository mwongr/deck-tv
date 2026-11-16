'use client';

import React, { useState, useEffect } from 'react';
import { Star, FolderPlus } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { AddToGroupPopover } from '@/components/favorites/AddToGroupPopover';
import type { ContentType } from '@/lib/content-type';

interface FavoriteButtonProps {
    id: string;
    name?: string;
    initialFavorite?: boolean | number;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'icon' | 'pill';
    className?: string;
    contentType?: ContentType;
    showGroupAdd?: boolean;
    onToggle?: (newStatus: boolean) => void;
}

export function FavoriteButton({
    id,
    name,
    initialFavorite = false,
    size = 'md',
    variant = 'icon',
    className = '',
    contentType = 'live',
    showGroupAdd = false,
    onToggle
}: FavoriteButtonProps) {
    const [isFavorite, setIsFavorite] = useState(!!initialFavorite);
    const [isGroupPopoverOpen, setIsGroupPopoverOpen] = useState(false);
    const { toggleFavorite } = useFavorites();

    useEffect(() => {
        setIsFavorite(!!initialFavorite);
    }, [initialFavorite]);

    // Listen to global favorite events to keep identical IDs in sync
    useEffect(() => {
        const handleFavoriteChange = (e: Event) => {
            const customEvent = e as CustomEvent<{ type: string; id: string; status: number }>;
            if (customEvent.detail && customEvent.detail.type === 'channel' && customEvent.detail.id === id) {
                setIsFavorite(customEvent.detail.status === 1);
            }
        };

        window.addEventListener('favorites:changed', handleFavoriteChange);
        return () => window.removeEventListener('favorites:changed', handleFavoriteChange);
    }, [id]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const next = !isFavorite;
        setIsFavorite(next); // Immediate optimistic UI
        onToggle?.(next);
        await toggleFavorite({ id, name, favorite: isFavorite ? 1 : 0 }, 'channel', next);
    };

    const handleOpenGroupPopover = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsGroupPopoverOpen(true);
    };

    const iconSizes = {
        sm: 'w-3.5 h-3.5',
        md: 'w-4 h-4',
        lg: 'w-5 h-5'
    };

    return (
        <>
            <div className={`inline-flex items-center gap-1 ${className}`}>
                {variant === 'pill' ? (
                    <button
                        type="button"
                        onClick={handleClick}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                            isFavorite
                                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                                : 'bg-white/5 text-foreground-secondary hover:bg-white/10 hover:text-foreground'
                        }`}
                        title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    >
                        <Star className={`${iconSizes[size]} ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                        <span className="text-sm font-medium">{isFavorite ? 'Favorited' : 'Add to Favorites'}</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleClick}
                        className={`p-1.5 rounded-full transition-colors ${
                            isFavorite
                                ? 'text-yellow-500 hover:bg-yellow-500/10'
                                : 'text-foreground-muted hover:text-foreground hover:bg-white/10'
                        }`}
                        title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    >
                        <Star className={`${iconSizes[size]} ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                    </button>
                )}

                {showGroupAdd && (
                    <button
                        type="button"
                        onClick={handleOpenGroupPopover}
                        className="p-1.5 rounded-full text-foreground-muted hover:text-accent-primary hover:bg-white/10 transition-colors"
                        title="Add to Custom Group"
                    >
                        <FolderPlus className={iconSizes[size]} />
                    </button>
                )}
            </div>

            {isGroupPopoverOpen && (
                <AddToGroupPopover
                    channelId={id}
                    channelName={name || 'Item'}
                    contentType={contentType}
                    isOpen={isGroupPopoverOpen}
                    onClose={() => setIsGroupPopoverOpen(false)}
                />
            )}
        </>
    );
}

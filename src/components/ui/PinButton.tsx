'use client';

import React, { useState, useEffect } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';

interface PinButtonProps {
    id: string;
    name?: string;
    initialPinned?: boolean | number;
    size?: 'sm' | 'md';
    className?: string;
    onToggle?: (newStatus: boolean) => void;
}

export function PinButton({
    id,
    name,
    initialPinned = false,
    size = 'sm',
    className = '',
    onToggle
}: PinButtonProps) {
    const [isPinned, setIsPinned] = useState(!!initialPinned);
    const { toggleFavorite } = useFavorites();

    useEffect(() => {
        setIsPinned(!!initialPinned);
    }, [initialPinned]);

    useEffect(() => {
        const handleFavoriteChange = (e: Event) => {
            const customEvent = e as CustomEvent<{ type: string; id: string; status: number }>;
            if (customEvent.detail && customEvent.detail.type === 'group' && customEvent.detail.id === id) {
                setIsPinned(customEvent.detail.status === 1);
            }
        };

        window.addEventListener('favorites:changed', handleFavoriteChange);
        return () => window.removeEventListener('favorites:changed', handleFavoriteChange);
    }, [id]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const next = !isPinned;
        setIsPinned(next);
        onToggle?.(next);
        await toggleFavorite({ id, name, favorite: isPinned ? 1 : 0 }, 'group', next);
    };

    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`p-1 rounded transition-colors ${
                isPinned
                    ? 'text-accent-primary hover:bg-accent-primary/10'
                    : 'text-foreground-muted hover:text-foreground hover:bg-white/10'
            } ${className}`}
            title={isPinned ? 'Unpin Group' : 'Pin Group'}
        >
            {isPinned ? (
                <Pin className={`${iconSize} fill-accent-primary text-accent-primary`} />
            ) : (
                <Pin className={`${iconSize}`} />
            )}
        </button>
    );
}

'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

export interface FavoriteChangeEvent {
    type: 'channel' | 'group';
    id: string;
    status: number;
    name?: string;
}

export function useFavorites() {
    const { showToast } = useToast();

    const notify = useCallback((detail: FavoriteChangeEvent) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('favorites:changed', { detail }));
        }
    }, []);

    const toggleFavorite = useCallback(
        async (
            item: { id: string; name?: string; favorite?: number },
            type: 'channel' | 'group',
            explicitStatus?: boolean,
            showToastMessage = true
        ): Promise<boolean> => {
            const nextStatus = explicitStatus !== undefined ? explicitStatus : !item.favorite;
            const statusNumber = nextStatus ? 1 : 0;
            const previousStatus = item.favorite ? 1 : 0;

            // Optimistic event
            notify({ type, id: item.id, status: statusNumber, name: item.name });

            try {
                const res = await fetch('/api/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type,
                        id: item.id,
                        status: statusNumber
                    })
                });

                if (!res.ok) {
                    throw new Error('Failed to update favorite');
                }

                if (showToastMessage) {
                    const actionLabel = type === 'group' ? (nextStatus ? 'Pinned' : 'Unpinned') : (nextStatus ? 'Added to Favorites' : 'Removed from Favorites');
                    const itemName = item.name ? ` "${item.name}"` : '';

                    showToast({
                        message: `${actionLabel}${itemName}`,
                        type: 'success',
                        action: {
                            label: 'Undo',
                            onClick: () => {
                                toggleFavorite(item, type, !nextStatus, false);
                            }
                        }
                    });
                }

                return nextStatus;
            } catch (err) {
                console.error('Failed to toggle favorite:', err);
                // Revert event
                notify({ type, id: item.id, status: previousStatus, name: item.name });
                showToast({
                    message: 'Failed to update favorite',
                    type: 'error'
                });
                return !nextStatus;
            }
        },
        [notify, showToast]
    );

    const reorderFavorites = useCallback(
        async (type: 'channel' | 'group', ids: string[]): Promise<boolean> => {
            try {
                const res = await fetch('/api/favorites/order', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, ids })
                });

                if (!res.ok) throw new Error('Failed to reorder');

                notify({ type, id: 'all', status: 1 });
                return true;
            } catch (err) {
                console.error('Failed to update order:', err);
                showToast({ message: 'Failed to save new order', type: 'error' });
                return false;
            }
        },
        [notify, showToast]
    );

    return {
        toggleFavorite,
        reorderFavorites,
        notify
    };
}

'use client';

import React, { useState, useEffect } from 'react';
import { FolderPlus, Check, X, Loader2 } from 'lucide-react';
import type { ContentType } from '@/lib/content-type';

interface AddToGroupPopoverProps {
    channelId: string;
    channelName: string;
    contentType: ContentType;
    isOpen: boolean;
    onClose: () => void;
}

export function AddToGroupPopover({
    channelId,
    channelName,
    contentType,
    isOpen,
    onClose
}: AddToGroupPopoverProps) {
    const [groups, setGroups] = useState<any[]>([]);
    const [memberGroupIds, setMemberGroupIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [busyGroupId, setBusyGroupId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setIsLoading(true);

        const fetchGroups = async () => {
            try {
                // Fetch custom groups of this content type
                const res = await fetch(`/api/custom-groups?type=${contentType}`);
                const data = await res.json();
                const fetchedGroups = data.groups || [];

                if (!isMounted) return;
                setGroups(fetchedGroups);

                // Check which groups currently contain this channel
                const memberIds = new Set<string>();
                for (const g of fetchedGroups) {
                    try {
                        const detailRes = await fetch(`/api/custom-groups/${g.id}`);
                        const detailData = await detailRes.json();
                        if ((detailData.items || []).some((i: any) => i.id === channelId)) {
                            memberIds.add(g.id);
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                if (isMounted) setMemberGroupIds(memberIds);
            } catch (err) {
                console.error('Failed to fetch custom groups for popover:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchGroups();

        return () => {
            isMounted = false;
        };
    }, [isOpen, channelId, contentType]);

    if (!isOpen) return null;

    const handleToggleGroup = async (groupId: string) => {
        const isMember = memberGroupIds.has(groupId);
        setBusyGroupId(groupId);

        try {
            const method = isMember ? 'DELETE' : 'POST';
            const res = await fetch(`/api/custom-groups/${groupId}/items`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelIds: [channelId] })
            });

            if (res.ok) {
                setMemberGroupIds((prev) => {
                    const next = new Set(prev);
                    if (isMember) next.delete(groupId);
                    else next.add(groupId);
                    return next;
                });
                window.dispatchEvent(new CustomEvent('favorites:changed', { detail: { type: 'custom-group' } }));
            }
        } catch (err) {
            console.error('Failed to toggle group member:', err);
        } finally {
            setBusyGroupId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100">
            <div className="bg-background-secondary border border-border rounded-2xl w-full max-w-sm p-4 shadow-2xl relative">
                <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                    <div className="flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-accent-primary" />
                        <h3 className="text-sm font-bold text-foreground">Add to Custom Group</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-white/10 text-foreground-muted hover:text-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-xs text-foreground-muted mb-3 truncate">
                    Target: <span className="font-semibold text-foreground">{channelName}</span>
                </p>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {isLoading ? (
                        <div className="py-6 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="py-4 text-center text-xs text-foreground-muted">
                            No custom groups for {contentType === 'live' ? 'channels' : contentType === 'movie' ? 'movies' : 'series'} yet.
                        </div>
                    ) : (
                        groups.map((group) => {
                            const isMember = memberGroupIds.has(group.id);
                            const isBusy = busyGroupId === group.id;

                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => handleToggleGroup(group.id)}
                                    disabled={isBusy}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all ${
                                        isMember
                                            ? 'bg-accent-primary/10 border-accent-primary/60 text-foreground font-semibold'
                                            : 'bg-background-tertiary border-border/50 text-foreground-secondary hover:text-foreground hover:bg-background-hover'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                                isMember
                                                    ? 'bg-accent-primary border-accent-primary text-white'
                                                    : 'border-border bg-background'
                                            }`}
                                        >
                                            {isMember && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <span className="truncate">{group.name}</span>
                                    </div>
                                    {isBusy && <Loader2 className="w-3 h-3 animate-spin text-foreground-muted shrink-0" />}
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="pt-3 mt-3 border-t border-border flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

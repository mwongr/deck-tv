'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Radio, Star, ExternalLink } from 'lucide-react';
import type { Channel, EPGProgram } from '@/lib/db';
import { ChannelLogo } from '@/components/ui/ChannelLogo';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import Link from 'next/link';

interface ChannelListProps {
    channels: Channel[];
    selectedChannelId: string | null;
    onChannelSelect: (channel: Channel) => void;
    onFavoriteToggle?: () => void;
    selectedGroupId?: string | null;
}

interface ChannelWithEPG extends Channel {
    currentProgram?: EPGProgram;
}

export function ChannelList({ channels, selectedChannelId, onChannelSelect, selectedGroupId }: ChannelListProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [epgMap, setEpgMap] = useState<Map<string, EPGProgram>>(new Map());

    // Tooltip state for hovering over channels with long names / inspecting details
    const [hoveredChannel, setHoveredChannel] = useState<{
        channel: ChannelWithEPG;
        rect: DOMRect;
    } | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setIsMounted(true);
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

    const isFavoritesView = selectedGroupId === 'favorites';

    // Load current EPG from /api/epg for channels with tvgId
    useEffect(() => {
        const uniqueTvgIds = Array.from(
            new Set(
                channels
                    .map((c) => c.tvgId?.trim())
                    .filter((id): id is string => !!id && id.length > 0)
            )
        );

        if (uniqueTvgIds.length === 0) {
            setEpgMap(new Map());
            return;
        }

        const controller = new AbortController();

        const loadEPG = async () => {
            const now = new Date();
            const nowIso = now.toISOString();
            const chunkSize = 50;
            const accumulated = new Map<string, EPGProgram>();

            for (let i = 0; i < uniqueTvgIds.length; i += chunkSize) {
                if (controller.signal.aborted) return;
                const chunk = uniqueTvgIds.slice(i, i + chunkSize);

                try {
                    const params = new URLSearchParams({
                        tvgIds: chunk.join(','),
                        start: nowIso,
                        end: nowIso,
                    });
                    const res = await fetch(`/api/epg?${params.toString()}`, {
                        signal: controller.signal,
                    });
                    if (!res.ok) continue;

                    const data = await res.json();
                    let updated = false;
                    for (const raw of data.programs || []) {
                        const start = new Date(raw.start);
                        const end = new Date(raw.end);
                        if (start <= now && end > now) {
                            accumulated.set(raw.channelTvgId.toLowerCase(), {
                                ...raw,
                                start,
                                end,
                            });
                            updated = true;
                        }
                    }

                    if (updated && !controller.signal.aborted) {
                        setEpgMap(new Map(accumulated));
                    }
                } catch (err: any) {
                    if (err?.name === 'AbortError') return;
                    console.error('ChannelList EPG fetch error:', err);
                }
            }

            if (!controller.signal.aborted && accumulated.size === 0) {
                setEpgMap(new Map());
            }
        };

        loadEPG();
        const interval = setInterval(loadEPG, 60 * 1000);

        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [channels]);

    const channelsWithEPG = useMemo<ChannelWithEPG[]>(() => {
        return channels.map((channel) => {
            const currentProgram = channel.tvgId
                ? epgMap.get(channel.tvgId.toLowerCase())
                : undefined;
            return currentProgram ? { ...channel, currentProgram } : channel;
        });
    }, [channels, epgMap]);

    const rowVirtualizer = useVirtualizer({
        count: channelsWithEPG.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 10,
    });

    const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowDown' && index < channelsWithEPG.length - 1) {
            e.preventDefault();
            onChannelSelect(channelsWithEPG[index + 1]);
        } else if (e.key === 'ArrowUp' && index > 0) {
            e.preventDefault();
            onChannelSelect(channelsWithEPG[index - 1]);
        } else if (e.key === 'Enter') {
            onChannelSelect(channelsWithEPG[index]);
        }
    }, [channelsWithEPG, onChannelSelect]);

    const handleChannelMouseEnter = (channel: ChannelWithEPG, e: React.MouseEvent<HTMLDivElement>) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        const rect = e.currentTarget.getBoundingClientRect();
        // If tooltip is already showing from an adjacent item, switch immediately; otherwise, add subtle delay
        if (hoveredChannel) {
            setHoveredChannel({ channel, rect });
        } else {
            hoverTimeoutRef.current = setTimeout(() => {
                setHoveredChannel({ channel, rect });
            }, 200);
        }
    };

    const handleChannelMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredChannel(null);
        }, 100);
    };

    const handleScroll = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (hoveredChannel) setHoveredChannel(null);
    };

    if (channels.length === 0) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center">
                    <Radio className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
                    <p className="text-foreground-secondary font-medium">
                        {isFavoritesView ? 'No favorite channels yet' : 'No channels in this group'}
                    </p>
                    <p className="text-sm text-foreground-muted mt-1">
                        {isFavoritesView ? 'Star channels while watching or browsing to add them here' : 'Select a different category'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-h-0 bg-background">
            <div className="p-3 border-b border-border shrink-0 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                        {isFavoritesView && <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />}
                        <span>{isFavoritesView ? 'Favorite Channels' : 'Channels'}</span>
                    </h2>
                    <p className="text-xs text-foreground-muted mt-0.5">
                        {channels.length} available
                    </p>
                </div>
                {isFavoritesView && (
                    <Link
                        href="/?section=favorites"
                        className="flex items-center gap-1 text-xs text-accent-primary hover:text-accent-primary/80 font-medium"
                    >
                        <span>Manage My List</span>
                        <ExternalLink className="w-3 h-3" />
                    </Link>
                )}
            </div>

            <div
                ref={parentRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto min-h-0"
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const channel = channelsWithEPG[virtualRow.index];
                        const isSelected = channel.id === selectedChannelId;

                        let progress = 0;
                        if (channel.currentProgram?.start && channel.currentProgram?.end) {
                            const start = new Date(channel.currentProgram.start).getTime();
                            const end = new Date(channel.currentProgram.end).getTime();
                            const now = Date.now();
                            if (end > start && now >= start && now <= end) {
                                progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
                            }
                        }

                        return (
                            <div
                                key={channel.id}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className="group relative"
                                onMouseEnter={(e) => handleChannelMouseEnter(channel, e)}
                                onMouseLeave={handleChannelMouseLeave}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onChannelSelect(channel)}
                                    onKeyDown={(e) => handleKeyDown(e, virtualRow.index)}
                                    className={`
                                        channel-item w-full flex items-center gap-3 px-3 py-2.5
                                        text-left border-b border-border/50 transition-colors
                                        ${isSelected ? 'active' : ''}
                                    `}
                                    title={channel.name}
                                >
                                    {/* Channel Logo with Active Playing Badge */}
                                    <div className="relative w-12 h-12 rounded-lg bg-background-tertiary flex items-center justify-center shrink-0">
                                        <div className="w-full h-full rounded-lg overflow-hidden flex items-center justify-center">
                                            <ChannelLogo
                                                src={channel.logo}
                                                alt={channel.name}
                                                fallbackClassName="w-6 h-6 text-foreground-muted"
                                            />
                                        </div>
                                        {isSelected && (
                                            <div
                                                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent-primary ring-2 ring-background flex items-center justify-center shadow-md animate-in fade-in zoom-in-75 duration-200"
                                                title="Currently Playing"
                                            >
                                                <Play className="w-2.5 h-2.5 text-white fill-white ml-0.5" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Channel Info */}
                                    <div className="flex-1 min-w-0 pr-16">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={`block text-sm leading-snug line-clamp-2 break-words transition-colors ${
                                                    isSelected
                                                        ? 'text-accent-primary font-semibold'
                                                        : 'text-foreground font-medium group-hover:text-accent-primary'
                                                }`}
                                            >
                                                {channel.name}
                                            </span>
                                        </div>
                                        <span className="block truncate text-xs text-foreground-muted mt-0.5">
                                            {channel.currentProgram?.title || 'No program info'}
                                        </span>
                                        {progress > 0 && (
                                            <div className="w-full max-w-[160px] h-1 bg-background-tertiary rounded-full overflow-hidden mt-1">
                                                <div
                                                    className="h-full bg-accent-primary rounded-full transition-all duration-300"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </button>

                                {/* Favorite & Add to Group Button - Clear of any obstruction */}
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                                    <FavoriteButton
                                        id={channel.id}
                                        name={channel.name}
                                        initialFavorite={channel.favorite}
                                        contentType="live"
                                        showGroupAdd={true}
                                        size="md"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Floating Inspection Tooltip Portal for Full Channel Name & Details */}
            {isMounted && hoveredChannel && typeof document !== 'undefined' && createPortal(
                (() => {
                    const { channel, rect } = hoveredChannel;
                    const tooltipWidth = 320;
                    const tooltipHeight = 120;

                    // Place tooltip floating to the right of the middle pane
                    let left = rect.right + 12;
                    let top = rect.top;

                    // Ensure tooltip stays vertically within viewport
                    if (top + tooltipHeight > window.innerHeight - 20) {
                        top = Math.max(20, window.innerHeight - tooltipHeight - 20);
                    }

                    // If screen right edge is too close, show inside/above channel item instead
                    if (left + tooltipWidth > window.innerWidth - 20) {
                        left = Math.max(20, rect.left);
                        top = Math.max(20, rect.top - tooltipHeight - 8);
                    }

                    return (
                        <div
                            style={{
                                position: 'fixed',
                                top: `${top}px`,
                                left: `${left}px`,
                                zIndex: 99999,
                                width: `${tooltipWidth}px`,
                            }}
                            className="pointer-events-none animate-in fade-in zoom-in-95 duration-150 p-3 bg-background-secondary/95 backdrop-blur-md border border-border/80 shadow-2xl rounded-xl text-foreground text-left"
                        >
                            <div className="flex items-start gap-2.5">
                                <div className="w-9 h-9 rounded-md bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                                    <ChannelLogo
                                        src={channel.logo}
                                        alt={channel.name}
                                        fallbackClassName="w-4 h-4 text-foreground-muted"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-sm font-semibold text-foreground leading-snug break-words">
                                        {channel.name}
                                    </h4>
                                    {channel.groupName && (
                                        <span className="inline-block px-1.5 py-0.5 mt-1 text-[10px] font-medium rounded bg-background-tertiary text-foreground-muted border border-border/40">
                                            {channel.groupName}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Program Info */}
                            <div className="mt-2.5 pt-2 border-t border-border/40 text-xs">
                                <div className="text-foreground-secondary font-medium">
                                    {channel.currentProgram?.title ? (
                                        <>
                                            <span className="text-[10px] uppercase font-bold text-accent-primary mr-1.5 tracking-wider">Now</span>
                                            <span className="text-foreground">{channel.currentProgram.title}</span>
                                        </>
                                    ) : (
                                        <span className="text-foreground-muted italic">No program information</span>
                                    )}
                                </div>
                                {channel.currentProgram?.description && (
                                    <p className="text-[11px] text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
                                        {channel.currentProgram.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
        </div>
    );
}

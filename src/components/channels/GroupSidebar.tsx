import { useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronDown, Star, Pin } from 'lucide-react';
import { PinButton } from '@/components/ui/PinButton';
import type { Group } from '@/lib/db';

interface GroupSidebarProps {
    groups: Group[];
    selectedGroupId: string | null;
    onGroupSelect: (group: Group) => void;
    onGroupFavorite?: (group: Group) => void;
}

export function GroupSidebar({ groups, selectedGroupId, onGroupSelect }: GroupSidebarProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Separate special shortcut from normal groups
    const favChannelsGroup = groups.find(g => g.id === 'favorites');
    const regularGroups = groups.filter(g => g.id !== 'favorites');
    const pinnedGroups = regularGroups.filter(g => g.favorite);

    // Pinned section expanded by default for discoverability
    const [isPinnedExpanded, setIsPinnedExpanded] = useState(true);

    const rowVirtualizer = useVirtualizer({
        count: regularGroups.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
    });

    const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowDown' && index < regularGroups.length - 1) {
            e.preventDefault();
            onGroupSelect(regularGroups[index + 1]);
        } else if (e.key === 'ArrowUp' && index > 0) {
            e.preventDefault();
            onGroupSelect(regularGroups[index - 1]);
        } else if (e.key === 'Enter') {
            onGroupSelect(regularGroups[index]);
        }
    }, [regularGroups, onGroupSelect]);

    return (
        <div className="h-full flex flex-col min-h-0 bg-background-secondary/20">
            {/* Top Fixed Shortcut: ⭐ Favorite Channels */}
            {favChannelsGroup && (
                <div className="shrink-0 p-2 border-b border-border/60 bg-background-secondary/40">
                    <button
                        type="button"
                        onClick={() => onGroupSelect(favChannelsGroup)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                            selectedGroupId === 'favorites'
                                ? 'bg-accent-primary border-accent-primary text-white font-semibold shadow-md shadow-accent-primary/25'
                                : 'bg-accent-primary/15 border-accent-primary/35 text-foreground font-medium hover:bg-accent-primary/25 hover:border-accent-primary/50 shadow-sm'
                        }`}
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Star className={`w-4 h-4 shrink-0 ${selectedGroupId === 'favorites' ? 'fill-white text-white' : 'fill-accent-primary/25 text-accent-primary'}`} />
                            <span className="truncate text-sm">Favorite Channels</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                            selectedGroupId === 'favorites'
                                ? 'bg-black/25 text-white'
                                : 'bg-accent-primary/20 text-accent-primary'
                        }`}>
                            {favChannelsGroup.channelCount}
                        </span>
                    </button>
                </div>
            )}

            {/* Pinned Section (Collapsible, open by default) */}
            {pinnedGroups.length > 0 && (
                <div className="shrink-0 border-b border-border bg-background-secondary/40 flex flex-col max-h-[35%]">
                    <div className="p-2 sticky top-0 z-10 bg-background-secondary/95 backdrop-blur-sm">
                        <button 
                            type="button"
                            onClick={() => setIsPinnedExpanded(!isPinnedExpanded)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border bg-background-tertiary border-white/15 text-foreground font-medium hover:bg-background-hover hover:border-white/25 transition-all shadow-sm"
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <Pin className="w-4 h-4 shrink-0 text-accent-primary fill-accent-primary/25" />
                                <span className="truncate text-sm">Pinned</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-white/10 text-foreground-secondary">
                                    {pinnedGroups.length}
                                </span>
                                {isPinnedExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-foreground-muted" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-foreground-muted" />
                                )}
                            </div>
                        </button>
                    </div>
                    
                    {isPinnedExpanded && (
                        <div className="overflow-y-auto">
                            {pinnedGroups.map((group) => {
                                const isSelected = group.id === selectedGroupId;
                                return (
                                    <div
                                        key={`pinned-${group.id}`}
                                        className={`
                                            w-full flex items-center gap-2 px-2 py-2
                                            transition-all duration-150 border-l-2
                                            ${isSelected
                                                ? 'bg-accent-primary/10 border-accent-primary'
                                                : 'hover:bg-background-hover border-transparent'
                                            }
                                        `}
                                    >
                                        <PinButton id={group.id} name={group.name} initialPinned={group.favorite} />
                                        
                                        <button 
                                            type="button"
                                            onClick={() => onGroupSelect(group)}
                                            className="flex-1 flex items-center gap-2 min-w-0 text-left"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <span className={`block truncate text-sm font-medium ${isSelected ? 'text-foreground font-semibold' : 'text-foreground-secondary'}`}>
                                                    {group.name}
                                                </span>
                                                <span className="text-[11px] text-foreground-muted">
                                                    {group.channelCount} channels
                                                </span>
                                            </div>
                                            {isSelected && (
                                                <ChevronRight className="w-4 h-4 text-accent-primary shrink-0" />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* All Groups Header */}
            <div className="px-3 py-1.5 text-[10px] font-bold text-foreground-muted uppercase tracking-wider bg-background-secondary/60 border-b border-border/50 shrink-0">
                All Groups
            </div>

            {/* Virtualized List for regular groups */}
            <div ref={parentRef} className="flex-1 overflow-y-auto min-h-0">
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const group = regularGroups[virtualRow.index];
                        const isSelected = group.id === selectedGroupId;

                        return (
                            <div
                                key={group.id}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <div
                                    className={`
                                        w-full flex items-center gap-2 px-2 py-2.5
                                        transition-all duration-150 border-l-2
                                        ${isSelected
                                            ? 'bg-accent-primary/10 border-accent-primary'
                                            : 'hover:bg-background-hover border-transparent'
                                        }
                                    `}
                                >
                                    <PinButton id={group.id} name={group.name} initialPinned={group.favorite} />
                                    
                                    <button 
                                        type="button"
                                        onClick={() => onGroupSelect(group)}
                                        onKeyDown={(e) => handleKeyDown(e, virtualRow.index)}
                                        className="flex-1 flex items-center gap-2 min-w-0 text-left"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className={`block truncate text-sm font-medium ${isSelected ? 'text-foreground font-semibold' : 'text-foreground-secondary'}`}>
                                                {group.name}
                                            </span>
                                            <span className="text-[11px] text-foreground-muted">
                                                {group.channelCount} channels
                                            </span>
                                        </div>
                                        {isSelected && (
                                            <ChevronRight className="w-4 h-4 text-accent-primary shrink-0" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

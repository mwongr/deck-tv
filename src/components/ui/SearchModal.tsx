'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Radio, Folder, Film, Tv2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { db, type Channel, type Group } from '@/lib/db';

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (channel: Channel) => void;
}

interface SearchResult {
    type: 'channel' | 'group' | 'movie' | 'series';
    item: Channel | Group;
}

export function SearchModal({ isOpen, onClose, onSelect }: SearchModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Search logic
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const searchQuery = query.toLowerCase();

        async function search() {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=30`);
                if (res.ok) {
                    const data = await res.json();
                    const chs = (data.channels || []).map((c: Channel) => ({ type: 'channel' as const, item: c }));
                    const mvs = (data.movies || []).map((m: Channel) => ({ type: 'movie' as const, item: m }));
                    const srs = (data.series || []).map((s: Channel) => ({ type: 'series' as const, item: s }));

                    // Search local groups if available
                    const groups = await db.groups
                        .filter(group => group.name.toLowerCase().includes(searchQuery))
                        .limit(10)
                        .toArray();

                    const searchResults: SearchResult[] = [
                        ...groups.map(g => ({ type: 'group' as const, item: g })),
                        ...chs,
                        ...mvs,
                        ...srs
                    ];

                    setResults(searchResults);
                    setSelectedIndex(0);
                    return;
                }
            } catch (e) {
                console.error('[SearchModal] Server search error, falling back:', e);
            }

            // Fallback: Search channels locally
            const channels = await db.channels
                .filter(channel =>
                    channel.name.toLowerCase().includes(searchQuery) ||
                    channel.groupName.toLowerCase().includes(searchQuery)
                )
                .limit(50)
                .toArray();

            // Search groups
            const groups = await db.groups
                .filter(group => group.name.toLowerCase().includes(searchQuery))
                .limit(10)
                .toArray();

            const searchResults: SearchResult[] = [
                ...groups.map(g => ({ type: 'group' as const, item: g })),
                ...channels.map(c => ({ type: 'channel' as const, item: c })),
            ];

            setResults(searchResults);
            setSelectedIndex(0);
        }

        const timeoutId = setTimeout(search, 200);
        return () => clearTimeout(timeoutId);
    }, [query]);

    // Virtualizer for results
    const rowVirtualizer = useVirtualizer({
        count: results.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => 56,
        overscan: 5,
    });

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                const cur = results[selectedIndex];
                if (cur && cur.type !== 'group') {
                    onSelect(cur.item as Channel);
                }
                break;
            case 'Escape':
                onClose();
                break;
        }
    }, [results, selectedIndex, onSelect, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        if (selectedIndex >= 0) {
            rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
        }
    }, [selectedIndex, rowVirtualizer]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 modal-overlay z-50 flex items-start justify-center pt-[15vh]"
            onClick={onClose}
        >
            <div
                className="bg-background-secondary rounded-xl border border-white/20 w-full max-w-2xl mx-4 shadow-2xl overflow-hidden animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                    <Search className="w-5 h-5 text-accent-primary shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search channels, movies, series, groups..."
                        className="flex-1 bg-transparent text-foreground text-lg placeholder:text-foreground-secondary/70 focus:outline-none font-medium"
                    />
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-background-hover transition-colors"
                    >
                        <X className="w-5 h-5 text-foreground-secondary hover:text-white" />
                    </button>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
                    {query && results.length === 0 ? (
                        <div className="p-8 text-center">
                            <Search className="w-12 h-12 text-foreground-muted mx-auto mb-4 opacity-50" />
                            <p className="text-foreground-secondary">No results found</p>
                            <p className="text-sm text-foreground-muted mt-1">Try a different search term</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                const result = results[virtualRow.index];
                                const isSelected = virtualRow.index === selectedIndex;
                                const isGroup = result.type === 'group';
                                const item = result.item;

                                return (
                                    <div
                                        key={`${result.type}-${item.id}`}
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
                                        <button
                                            onClick={() => {
                                                if (!isGroup) {
                                                    onSelect(item as Channel);
                                                }
                                            }}
                                            onMouseEnter={() => setSelectedIndex(virtualRow.index)}
                                            className={`
                        w-full flex items-center gap-3 px-4 py-3
                        text-left transition-colors
                        ${isSelected ? 'bg-accent-primary/10' : 'hover:bg-background-hover'}
                      `}
                                        >
                                            {/* Icon */}
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-background-tertiary">
                                                {isGroup ? (
                                                    <Folder className="w-5 h-5 text-accent-primary" />
                                                ) : (item as Channel).logo ? (
                                                    <img
                                                        src={(item as Channel).logo}
                                                        alt=""
                                                        className="w-full h-full object-contain rounded-lg"
                                                    />
                                                ) : result.type === 'movie' ? (
                                                    <Film className="w-5 h-5 text-accent-primary" />
                                                ) : result.type === 'series' ? (
                                                    <Tv2 className="w-5 h-5 text-accent-primary" />
                                                ) : (
                                                    <Radio className="w-5 h-5 text-accent-primary" />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate font-medium text-foreground">
                                                        {isGroup ? (item as Group).name : (item as Channel).name}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-accent-primary/15 text-accent-primary border border-accent-primary/30">
                                                        {result.type}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-foreground-muted">
                                                    {isGroup
                                                        ? `${(item as Group).channelCount} items`
                                                        : (item as Channel).groupName
                                                    }
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-8 text-center">
                            <Search className="w-12 h-12 text-foreground-muted mx-auto mb-4 opacity-30" />
                            <p className="text-foreground-muted">Type to search channels, movies, and series</p>
                            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-foreground-muted">
                                <span><kbd className="px-1.5 py-0.5 bg-background rounded border border-border">↑↓</kbd> Navigate</span>
                                <span><kbd className="px-1.5 py-0.5 bg-background rounded border border-border">Enter</kbd> Select</span>
                                <span><kbd className="px-1.5 py-0.5 bg-background rounded border border-border">Esc</kbd> Close</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

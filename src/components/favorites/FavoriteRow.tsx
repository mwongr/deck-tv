'use client';

import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export type SectionThemeColor = 'amber' | 'blue' | 'emerald' | 'purple' | 'rose' | 'default';

interface FavoriteRowProps {
    title: string;
    icon?: React.ReactNode;
    count: number;
    themeColor?: SectionThemeColor;
    viewMode?: 'grid' | 'list' | 'compact';
    contentType?: 'poster' | 'channel' | 'group';
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onSeeAll?: () => void;
    children: React.ReactNode;
}

const brandTheme = {
    iconBg: 'bg-accent-primary/15 text-accent-primary border-accent-primary/30',
    border: 'hover:border-accent-primary/40'
};

export function FavoriteRow({
    title,
    icon,
    count,
    themeColor = 'default',
    viewMode = 'grid',
    contentType = 'channel',
    isCollapsed = false,
    onToggleCollapse,
    onSeeAll,
    children
}: FavoriteRowProps) {
    if (count === 0) return null;

    const theme = brandTheme;

    // Grid layout styling according to viewMode & content type
    let gridClasses = '';
    if (viewMode === 'grid') {
        if (contentType === 'poster') {
            gridClasses = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4';
        } else {
            gridClasses = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4';
        }
    } else if (viewMode === 'list') {
        gridClasses = 'grid grid-cols-1 lg:grid-cols-2 gap-3 p-4';
    } else {
        // compact
        gridClasses = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-3.5';
    }

    return (
        <section
            className={`rounded-2xl border border-white/15 bg-background-secondary overflow-hidden transition-all shadow-xl shadow-black/40 ${theme.border}`}
        >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-background-tertiary/60">
                <div
                    onClick={onToggleCollapse}
                    className="flex items-center gap-3 cursor-pointer group select-none min-w-0"
                >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105 ${theme.iconBg}`}>
                        {icon}
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                        <h3 className="text-base font-bold text-foreground tracking-tight truncate group-hover:text-accent-primary transition-colors">
                            {title}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-background-tertiary text-foreground-secondary border border-border/60 shrink-0">
                            {count}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {onSeeAll && count > 5 && (
                        <button
                            type="button"
                            onClick={onSeeAll}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-accent-primary hover:text-white hover:bg-accent-primary/20 transition-all"
                        >
                            <span>See all</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {onToggleCollapse && (
                        <button
                            type="button"
                            onClick={onToggleCollapse}
                            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                            title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                            <ChevronDown
                                className={`w-4 h-4 transition-transform duration-200 ${
                                    isCollapsed ? '-rotate-90' : 'rotate-0'
                                }`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* Section body */}
            {!isCollapsed && (
                <div className={gridClasses}>
                    {children}
                </div>
            )}
        </section>
    );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Star, Tv, Film, Clapperboard, Calendar, Circle, Settings,
    ChevronLeft, ChevronRight
} from 'lucide-react';

interface NavRailProps {
    isExpanded: boolean;
    onToggle: () => void;
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const navItems = [
    { id: 'favorites', label: 'My List', icon: Star, color: 'text-accent-primary' },
    { id: 'live', label: 'Live TV', icon: Tv, color: 'text-accent-primary' },
    { id: 'movies', label: 'Movies', icon: Film, color: 'text-accent-primary' },
    { id: 'series', label: 'Series', icon: Clapperboard, color: 'text-accent-primary' },
    { id: 'epg', label: 'TV Guide', icon: Calendar, color: 'text-accent-primary' },
    { id: 'recordings', label: 'Recordings', icon: Circle, color: 'text-accent-primary' },
];

export function NavRail({ isExpanded, onToggle, activeSection, onSectionChange, children }: NavRailProps & { children?: React.ReactNode }) {
    return (
        <nav
            className={`
        h-full bg-background-secondary border-r border-border
        flex flex-col transition-all duration-300 ease-in-out shrink-0
        ${isExpanded ? 'w-64' : 'w-16'}
      `}
        >
            {/* Logo Section */}
            <div className="h-14 flex items-center px-4 border-b border-border shrink-0 overflow-hidden">
                {isExpanded ? (
                    <img
                        src="/logo.svg"
                        alt="Deck TV"
                        className="h-7 w-auto max-w-[190px] object-contain object-left select-none"
                    />
                ) : (
                    <img
                        src="/logo-icon.svg"
                        alt="Deck TV"
                        className="w-7 h-7 object-contain mx-auto select-none"
                    />
                )}
            </div>

            {/* Scrollable Container for Nav + Groups */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* Section Navigation */}
                <div className="py-2 shrink-0">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeSection === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => onSectionChange(item.id)}
                                className={`
                    w-full flex items-center gap-3 px-4 py-3
                    transition-all duration-150 group relative
                    ${isActive
                                        ? 'bg-accent-primary/10 text-foreground'
                                        : 'text-foreground-secondary hover:bg-background-hover hover:text-foreground'
                                    }
                  `}
                            >
                                {/* Active Indicator */}
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-accent-primary rounded-r-full" />
                                )}

                                <Icon className={`w-5 h-5 shrink-0 ${isActive ? item.color : ''}`} />

                                {isExpanded && (
                                    <span className="text-sm font-medium truncate">
                                        {item.label}
                                    </span>
                                )}

                                {/* Tooltip when collapsed */}
                                {!isExpanded && (
                                    <div className="
                      absolute left-full ml-2 px-2 py-1 rounded-md
                      bg-background-tertiary border border-border
                      text-sm text-foreground whitespace-nowrap
                      opacity-0 group-hover:opacity-100 pointer-events-none
                      transition-opacity z-50
                    ">
                                        {item.label}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Contextual Groups (Categories) */}
                {isExpanded && children && (
                    <div className="flex-1 flex flex-col border-t border-border/50 bg-background/20">
                        {children}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="shrink-0">
                {/* Settings */}
                <div className="border-t border-border py-2.5">
                    <div className={isExpanded ? 'px-3' : 'px-2 flex justify-center'}>
                        <Link
                            href="/settings"
                            className={`
                                flex items-center gap-3 rounded-xl
                                bg-background-tertiary/80 hover:bg-background-hover
                                border border-border hover:border-foreground-muted/30
                                text-foreground transition-all duration-150 shadow-sm group relative
                                ${isExpanded ? 'w-full px-3.5 py-2.5' : 'p-2.5 justify-center'}
                            `}
                        >
                            <Settings className="w-5 h-5 shrink-0 text-accent-primary" />
                            {isExpanded && (
                                <span className="text-sm font-medium">Settings</span>
                            )}
                            {!isExpanded && (
                                <div className="
                      absolute left-full ml-2 px-2 py-1 rounded-md
                      bg-background-tertiary border border-border
                      text-sm text-foreground whitespace-nowrap
                      opacity-0 group-hover:opacity-100 pointer-events-none
                      transition-opacity z-50
                    ">
                                    Settings
                                </div>
                            )}
                        </Link>
                    </div>
                </div>

                {/* Toggle Button */}
                <div className="border-t border-border p-2">
                    <button
                        onClick={onToggle}
                        title={isExpanded ? 'Collapse Menu' : 'Expand Menu'}
                        aria-label={isExpanded ? 'Collapse Menu' : 'Expand Menu'}
                        className="
                            w-full py-2 px-2.5 rounded-xl relative group
                            bg-background-tertiary/50 hover:bg-background-hover
                            border border-transparent hover:border-border
                            text-foreground-secondary hover:text-foreground
                            transition-all flex items-center justify-center
                        "
                    >
                        {isExpanded ? (
                            <div className="flex items-center gap-2 text-xs font-medium">
                                <ChevronLeft className="w-4 h-4" />
                                <span>Collapse Menu</span>
                            </div>
                        ) : (
                            <>
                                <ChevronRight className="w-5 h-5 text-accent-primary" />
                                <div className="
                                    absolute left-full ml-2 px-2 py-1 rounded-md
                                    bg-background-tertiary border border-border
                                    text-sm text-foreground whitespace-nowrap
                                    opacity-0 group-hover:opacity-100 pointer-events-none
                                    transition-opacity z-50
                                ">
                                    Expand Menu
                                </div>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </nav>
    );
}

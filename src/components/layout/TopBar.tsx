'use client';

import { useState, useEffect } from 'react';
import { Search, Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import Link from 'next/link';

interface TopBarProps {
    searchQuery?: string;
    onSearchSubmit?: (query: string) => void;
    onToggleSidebar: () => void;
    isSidebarCollapsed: boolean;
}

export function TopBar({ searchQuery = '', onSearchSubmit, onToggleSidebar, isSidebarCollapsed }: TopBarProps) {
    const [inputValue, setInputValue] = useState(searchQuery);

    useEffect(() => {
        setInputValue(searchQuery);
    }, [searchQuery]);

    return (
        <header className="h-14 bg-background-secondary border-b border-border flex items-center justify-between px-4 shrink-0">
            {/* Left Section - Sidebar Toggle */}
            <div className="flex items-center">
                <button
                    onClick={onToggleSidebar}
                    title={isSidebarCollapsed ? 'Expand left sidebar' : 'Collapse left sidebar'}
                    aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background-tertiary/80 hover:bg-background-hover border border-border hover:border-accent-primary/50 text-foreground-secondary hover:text-foreground transition-all text-xs font-medium mr-2"
                >
                    {isSidebarCollapsed ? (
                        <>
                            <PanelLeft className="w-4 h-4 text-accent-primary" />
                            <span className="hidden sm:inline">Expand</span>
                        </>
                    ) : (
                        <>
                            <PanelLeftClose className="w-4 h-4" />
                            <span className="hidden sm:inline">Collapse</span>
                        </>
                    )}
                </button>
            </div>

            {/* Center Section - Main Search */}
            <div className="flex items-center flex-1 max-w-xl mx-4">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (inputValue.trim() && onSearchSubmit) {
                            onSearchSubmit(inputValue.trim());
                        }
                    }}
                    className="flex-1 relative"
                >
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-primary" />
                    <input
                        name="search"
                        type="search"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Search programs, channels, movies, series..."
                        className="w-full bg-[#18181b] hover:bg-[#202024] border border-white/20 hover:border-white/35 rounded-xl py-2 pl-10 pr-14 text-sm text-foreground placeholder:text-foreground-secondary/70 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all shadow-inner"
                    />
                    <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium px-2 py-0.5 bg-white/10 rounded-md border border-white/15 text-foreground-secondary pointer-events-none">
                        Enter
                    </kbd>
                </form>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2">
                <Link
                    href="/settings"
                    className="p-2 rounded-lg hover:bg-background-hover transition-colors"
                    aria-label="Settings"
                >
                    <Settings className="w-5 h-5 text-foreground-secondary hover:text-white" />
                </Link>
            </div>
        </header>
    );
}

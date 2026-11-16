'use client';

import { Beer } from 'lucide-react';

interface KofiButtonProps {
    collapsed?: boolean;
    variant?: 'card' | 'subtle';
    className?: string;
}

const KOFI_URL = 'https://ko-fi.com/mwongr';

/**
 * Reusable Ko-fi donation button with card and subtle variants.
 */
export function KofiButton({ collapsed = false, variant = 'card', className = '' }: KofiButtonProps) {
    const isSubtle = variant === 'subtle';

    return (
        <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy me a beer on Ko-fi"
            className={`
                group relative inline-flex items-center gap-2.5
                transition-all duration-150
                ${isSubtle
                    ? 'rounded-lg text-foreground-muted hover:text-foreground-secondary hover:bg-background-hover/50'
                    : 'rounded-xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-slate-600/80 text-slate-200 hover:text-white shadow-sm'
                }
                ${collapsed
                    ? 'justify-center p-2'
                    : isSubtle
                        ? 'justify-start px-3.5 py-1.5 text-xs font-normal'
                        : 'justify-center px-4 py-2.5 text-sm font-medium'
                }
                ${className}
            `}
        >
            <Beer
                className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                    isSubtle ? 'text-foreground-muted group-hover:text-amber-400/80' : 'text-amber-400'
                }`}
            />
            {!collapsed && <span className="truncate">Buy me a beer</span>}

            {collapsed && (
                <div
                    className="
                        absolute left-full ml-2 px-2 py-1 rounded-md
                        bg-background-tertiary border border-border
                        text-sm text-foreground whitespace-nowrap
                        opacity-0 group-hover:opacity-100 pointer-events-none
                        transition-opacity z-50
                    "
                >
                    Buy me a beer
                </div>
            )}
        </a>
    );
}

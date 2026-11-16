'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-border bg-background-secondary/30 text-center my-2">
            <div className="w-12 h-12 rounded-xl bg-background-tertiary flex items-center justify-center text-foreground-muted mb-3">
                <Icon className="w-6 h-6 text-foreground-muted" />
            </div>
            <h4 className="text-base font-semibold text-foreground mb-1">{title}</h4>
            <p className="text-xs text-foreground-muted max-w-sm mb-4 leading-relaxed">{description}</p>
            {actionLabel && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    className="px-4 py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold hover:bg-accent-primary/90 transition-colors shadow-sm"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
}

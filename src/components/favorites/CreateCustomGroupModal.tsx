'use client';

import React, { useState } from 'react';
import { X, FolderPlus, Tv, Film, Clapperboard } from 'lucide-react';
import type { ContentType } from '@/lib/content-type';

interface CreateCustomGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (group: any) => void;
    initialType?: ContentType;
}

export function CreateCustomGroupModal({
    isOpen,
    onClose,
    onCreated,
    initialType = 'live'
}: CreateCustomGroupModalProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<ContentType>(initialType);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Please enter a group name');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/custom-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create group');
            }

            const data = await res.json();
            onCreated(data.group);
            setName('');
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-background-secondary border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-foreground-muted hover:text-foreground transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary">
                        <FolderPlus className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Create Custom Group</h2>
                        <p className="text-xs text-foreground-muted">Build a personalized group for your chosen content</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Content Type Picker */}
                    <div>
                        <label className="block text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
                            Content Type (Single Type Only)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setType('live')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                                    type === 'live'
                                        ? 'bg-blue-500/15 border-blue-500 text-blue-400 font-semibold'
                                        : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground hover:bg-background-hover'
                                }`}
                            >
                                <Tv className="w-4 h-4" />
                                <span>Channels</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setType('movie')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                                    type === 'movie'
                                        ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-semibold'
                                        : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground hover:bg-background-hover'
                                }`}
                            >
                                <Film className="w-4 h-4" />
                                <span>Movies</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setType('series')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                                    type === 'series'
                                        ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-semibold'
                                        : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground hover:bg-background-hover'
                                }`}
                            >
                                <Clapperboard className="w-4 h-4" />
                                <span>Series</span>
                            </button>
                        </div>
                    </div>

                    {/* Group Name Input */}
                    <div>
                        <label className="block text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
                            Group Name
                        </label>
                        <input
                            type="text"
                            placeholder={
                                type === 'live'
                                    ? 'e.g., Sunday Football, News Favs'
                                    : type === 'movie'
                                    ? 'e.g., Movie Night, Action Hits'
                                    : 'e.g., Weekend Binges, Sci-Fi Shows'
                            }
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            maxLength={50}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-background-tertiary border border-border text-sm text-foreground focus:outline-none focus:border-accent-primary transition-colors"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 font-medium">{error}</p>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim()}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-colors shadow-md"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

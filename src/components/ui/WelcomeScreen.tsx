'use client';

import { useState, useEffect } from 'react';
import { Tv, Upload, Globe, Server, ArrowRight, Loader2, HardDrive, Check, X } from 'lucide-react';
import Link from 'next/link';
import { db, generateId, type Channel, type Group, type PlaylistSource, type EPGProgram } from '@/lib/db';
import { parseM3U, fetchAndParseM3U } from '@/lib/parsers';
import { addHours, startOfHour, subHours } from 'date-fns';

interface WelcomeScreenProps {
    onSuccess?: () => void;
}

export function WelcomeScreen({ onSuccess }: WelcomeScreenProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>('');
    const [showM3UInput, setShowM3UInput] = useState(false);

    // Check if server is already configured
    useEffect(() => {
        let mounted = true;
        const checkServer = async () => {
            try {
                const res = await fetch('/api/setup/status');
                if (res.ok && mounted) {
                    const status = await res.json();
                    if (status.configured) {
                        setProgress('Syncing with server...');
                        if (onSuccess) {
                            await onSuccess();
                        }
                        // Do NOT reload here, let the parent handle the view switch
                        return;
                    }
                }
            } catch (e) {
                console.error("Failed to check server status", e);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        checkServer();
        return () => { mounted = false; };
    }, [onSuccess]);

    const [activeMethod, setActiveMethod] = useState<'M3U' | 'XTREAM' | 'RESTORE' | null>(null);
    const [m3uUrl, setM3UUrl] = useState('');
    const [playlistName, setPlaylistName] = useState('My Playlist');

    // XC State
    const [xcServer, setXcServer] = useState('');
    const [xcUsername, setXcUsername] = useState('');
    const [xcPassword, setXcPassword] = useState('');

    // Restore State
    const [restoreFile, setRestoreFile] = useState<File | null>(null);

    const handleAddSource = async () => {
        setIsLoading(true);
        setError(null);
        setProgress('Connecting & Syncing...');

        try {
            const payload: any = {
                name: playlistName,
                type: activeMethod
            };

            if (activeMethod === 'M3U') {
                payload.url = m3uUrl;
            } else {
                // Construct basic URL for reference, but backend uses server/user/pass
                // Ensure server has protocol
                let server = xcServer.trim();
                if (!server.startsWith('http')) server = `http://${server}`;

                payload.url = server;
                payload.username = xcUsername;
                payload.password = xcPassword;
            }

            const res = await fetch('/api/setup/source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to add source');
            }

            const result = await res.json();
            setProgress(`Sync success! Found ${result.stats.channels} channels.`);

            // Wait a moment then reload
            setTimeout(() => {
                if (onSuccess) onSuccess();
                else window.location.reload();
            }, 1000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add source');
            setIsLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreFile) {
            setError("Please select a backup file");
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgress('Reading backup file...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let json;
                try {
                    json = JSON.parse(e.target?.result as string);
                } catch {
                    throw new Error('Invalid JSON file');
                }

                if (!json.playlistSources && !json.settings && !json.customGroups && !json.favorites) {
                    throw new Error('Backup file appears to be empty or invalid format');
                }

                setProgress('Restoring configuration to server...');

                const res = await fetch('/api/setup/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(json)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Failed to restore backup');
                }

                const counts = data.counts || {};
                const parts: string[] = [];
                if (counts.playlists !== undefined) parts.push(`${counts.playlists} Playlists`);
                if (counts.favorites !== undefined) parts.push(`${counts.favorites} Favorites`);
                if (counts.customGroups !== undefined) parts.push(`${counts.customGroups} Custom Groups`);
                if (counts.customGroupItems !== undefined) parts.push(`${counts.customGroupItems} Group Items`);
                if (counts.settings !== undefined) parts.push(`${counts.settings} Settings`);
                const msg = parts.length > 0 ? parts.join(', ') : 'All configurations';
                // Restore client-side preferences
                try {
                    const transcoding = json.transcodingSettings || json.clientSettings?.transcodingSettings;
                    if (transcoding) {
                        localStorage.setItem('deck-tv-transcoding-settings', JSON.stringify(transcoding));
                    }

                    const player = json.playerSettings || json.clientSettings?.playerSettings;
                    if (player) {
                        localStorage.setItem('deck-tv-player-settings', JSON.stringify(player));
                    }

                    const sort = json.favoritesSort || json.clientSettings?.favoritesSort;
                    if (sort) {
                        localStorage.setItem('decktv:favorites_sort', sort);
                    }

                    // Reset client IndexedDB cache to force clean re-fetch of channels & groups
                    await db.channels.clear();
                    await db.groups.clear();

                    const dexieSettings = json.dexieSettings || json.clientSettings?.dexieSettings;
                    if (Array.isArray(dexieSettings)) {
                        for (const s of dexieSettings) {
                            if (s.key) {
                                const existing = await db.settings.where('key').equals(s.key).first();
                                if (existing) {
                                    await db.settings.update(existing.id, { value: s.value });
                                } else {
                                    await db.settings.add({ id: s.id || generateId(), key: s.key, value: s.value });
                                }
                            }
                        }
                    }
                } catch (clientErr) {
                    console.warn('Failed to restore client-side preferences in WelcomeScreen:', clientErr);
                }

                setProgress(`Success! ${msg} Reloading...`);

                setTimeout(() => {
                    window.location.reload();
                }, 2000);

            } catch (err) {
                console.error("Restore failed", err);
                setError(err instanceof Error ? err.message : 'Failed to parse backup file');
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
            setError("Failed to read file");
            setIsLoading(false);
        };
        reader.readAsText(restoreFile);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-8">
            <div className="max-w-2xl w-full">
                {/* Logo & Title */}
                <div className="text-center mb-12">
                    <img src="/logo.svg" alt="Deck TV" className="h-16 w-auto max-w-sm object-contain mx-auto mb-6 select-none drop-shadow-lg" />
                    <h1 className="text-4xl font-bold gradient-text mb-3">Welcome to Deck TV</h1>
                    <p className="text-foreground-secondary text-lg">
                        Server-Connected IPTV Player
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-center">
                        {error}
                    </div>
                )}

                {/* Loading State */}
                {isLoading ? (
                    <div className="mb-6 p-8 rounded-xl bg-background-secondary border border-border text-center">
                        <Loader2 className="w-10 h-10 text-accent-primary animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-medium text-foreground mb-2">{progress}</h3>
                        <p className="text-foreground-muted text-sm">This might take a moment.</p>
                    </div>
                ) : (
                    <>
                        {/* Selection Menu */}
                        {!activeMethod && (
                            <div className="grid gap-4">
                                <button
                                    onClick={() => setActiveMethod('XTREAM')}
                                    className="group flex items-center gap-6 p-6 rounded-xl bg-background-secondary border border-border hover:border-accent-primary/50 hover:bg-background-tertiary transition-all text-left"
                                >
                                    <div className="w-14 h-14 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                                        <Server className="w-7 h-7 text-purple-400" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-foreground mb-1">Xtream Codes API</h3>
                                        <p className="text-foreground-muted text-sm">
                                            Connect using Server URL, Username, and Password
                                        </p>
                                    </div>
                                    <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-purple-400 transition-colors" />
                                </button>

                                <button
                                    onClick={() => setActiveMethod('M3U')}
                                    className="group flex items-center gap-6 p-6 rounded-xl bg-background-secondary border border-border hover:border-accent-primary/50 hover:bg-background-tertiary transition-all text-left"
                                >
                                    <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                        <Globe className="w-7 h-7 text-blue-400" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-foreground mb-1">M3U Playlist</h3>
                                        <p className="text-foreground-muted text-sm">
                                            Import directly via M3U/M3U8 URL
                                        </p>
                                    </div>
                                    <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-blue-400 transition-colors" />
                                </button>

                                <button
                                    onClick={() => setActiveMethod('RESTORE')}
                                    className="group flex items-center gap-6 p-6 rounded-xl bg-background-secondary border border-border hover:border-accent-primary/50 hover:bg-background-tertiary transition-all text-left"
                                >
                                    <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                                        <HardDrive className="w-7 h-7 text-green-400" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-foreground mb-1">Restore Backup</h3>
                                        <p className="text-foreground-muted text-sm">
                                            Restore from a previous backup file (.json)
                                        </p>
                                    </div>
                                    <ArrowRight className="w-5 h-5 text-foreground-muted group-hover:text-green-400 transition-colors" />
                                </button>
                            </div>
                        )}

                        {/* Input Forms */}
                        {activeMethod && (
                            <div className="bg-background-secondary p-8 rounded-xl border border-border shadow-2xl">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                    {activeMethod === 'XTREAM' && <Server className="w-6 h-6 text-purple-400" />}
                                    {activeMethod === 'M3U' && <Globe className="w-6 h-6 text-blue-400" />}
                                    {activeMethod === 'RESTORE' && <HardDrive className="w-6 h-6 text-green-400" />}

                                    {activeMethod === 'XTREAM' && 'Configure Xtream Codes'}
                                    {activeMethod === 'M3U' && 'Configure M3U Playlist'}
                                    {activeMethod === 'RESTORE' && 'Restore Backup'}
                                </h3>

                                <div className="space-y-4">
                                    {activeMethod === 'RESTORE' ? (
                                        <div className="space-y-4">
                                            <p className="text-sm text-foreground-secondary mb-4">
                                                Select your backup file (.json) to restore settings, playlists, favorites, custom groups, and configurations.
                                                Existing data on this server will be overwritten.
                                            </p>

                                            <label className="block border-2 border-dashed border-border rounded-xl p-8 hover:border-accent-primary/50 transition-colors text-center cursor-pointer relative bg-background-tertiary">
                                                <input
                                                    type="file"
                                                    accept=".json"
                                                    className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                                                    onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                                                />
                                                {restoreFile ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                                                            <Check className="w-6 h-6 text-green-500" />
                                                        </div>
                                                        <div className="font-medium text-green-500">{restoreFile.name}</div>
                                                        <div className="text-xs text-foreground-muted">{(restoreFile.size / 1024).toFixed(1)} KB</div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Upload className="w-8 h-8 text-foreground-muted" />
                                                        <div className="font-medium text-foreground">Click to upload backup file</div>
                                                        <div className="text-xs text-foreground-muted">Supports .json files</div>
                                                    </div>
                                                )}
                                            </label>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium mb-1 text-foreground-secondary">Playlist Name</label>
                                                <input
                                                    type="text"
                                                    value={playlistName}
                                                    onChange={(e) => setPlaylistName(e.target.value)}
                                                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-accent-primary outline-none transition-colors"
                                                />
                                            </div>

                                            {activeMethod === 'XTREAM' ? (
                                                <>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1 text-foreground-secondary">Server URL</label>
                                                        <input
                                                            type="text"
                                                            value={xcServer}
                                                            onChange={(e) => setXcServer(e.target.value)}
                                                            placeholder="http://example-iptv.com:8080"
                                                            className="w-full bg-background border border-border rounded-lg p-3 focus:border-accent-primary outline-none transition-colors"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-foreground-secondary">Username</label>
                                                            <input
                                                                type="text"
                                                                value={xcUsername}
                                                                onChange={(e) => setXcUsername(e.target.value)}
                                                                className="w-full bg-background border border-border rounded-lg p-3 focus:border-accent-primary outline-none transition-colors"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-foreground-secondary">Password</label>
                                                            <input
                                                                type="password"
                                                                value={xcPassword}
                                                                onChange={(e) => setXcPassword(e.target.value)}
                                                                className="w-full bg-background border border-border rounded-lg p-3 focus:border-accent-primary outline-none transition-colors"
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div>
                                                    <label className="block text-sm font-medium mb-1 text-foreground-secondary">M3U URL</label>
                                                    <input
                                                        type="text"
                                                        value={m3uUrl}
                                                        onChange={(e) => setM3UUrl(e.target.value)}
                                                        placeholder="http://example.com/playlist.m3u"
                                                        className="w-full bg-background border border-border rounded-lg p-3 focus:border-accent-primary outline-none transition-colors"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <div className="flex gap-4 pt-4">
                                        <button
                                            onClick={() => {
                                                setActiveMethod(null);
                                                setRestoreFile(null);
                                                setError(null);
                                            }}
                                            className="px-6 py-3 rounded-lg border border-border hover:bg-background-tertiary transition-colors font-medium"
                                        >
                                            Back
                                        </button>

                                        {activeMethod === 'RESTORE' ? (
                                            <button
                                                onClick={handleRestore}
                                                disabled={!restoreFile}
                                                className="flex-1 px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-bold shadow-lg shadow-green-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Restore Backup
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleAddSource}
                                                className="flex-1 px-6 py-3 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors font-bold shadow-lg shadow-accent-primary/20"
                                            >
                                                Connect & Sync
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, HardDrive, CornerLeftUp, X, Check, Loader2, ChevronRight, Home } from 'lucide-react';

interface FolderPickerProps {
    value: string;
    onChange: (path: string) => void;
    placeholder?: string;
}

interface FileSystemItem {
    name: string;
    path: string;
    isDirectory: boolean;
    isDrive?: boolean;
}

export function FolderPicker({ value, onChange, placeholder }: FolderPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <div className="flex gap-2 w-full">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder || 'Select a folder...'}
                    className="flex-1 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm focus:outline-none focus:border-accent-primary transition-colors"
                />
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="px-4 py-2 bg-background-tertiary hover:bg-background-hover border border-border rounded-lg text-foreground-secondary hover:text-foreground transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                >
                    <Folder className="w-4 h-4" />
                    Browse
                </button>
            </div>

            {isOpen && (
                <BrowserModal
                    initialPath={value}
                    onSelect={(path) => {
                        onChange(path);
                        setIsOpen(false);
                    }}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
}

function BrowserModal({ initialPath, onSelect, onClose }: { initialPath: string, onSelect: (p: string) => void, onClose: () => void }) {
    const [currentPath, setCurrentPath] = useState(initialPath || '');
    const [items, setItems] = useState<FileSystemItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drives, setDrives] = useState<FileSystemItem[]>([]);

    // Fetch drives on mount
    useEffect(() => {
        fetchDrives();
    }, []);

    // Fetch directory when path changes
    useEffect(() => {
        if (currentPath) {
            fetchDirectory(currentPath);
        } else {
            // If no path, show drives or home
            fetchDrives();
        }
    }, [currentPath]);

    const fetchDrives = async () => {
        setLoading(true);
        setError(null);
        try {
            // Try to get drives, if API supports it (Windows)
            const res = await fetch('/api/system/filesystem?action=drives');
            const data = await res.json();
            if (data.items) {
                setDrives(data.items);
                if (!currentPath) {
                    setItems(data.items); // Show drives initially if no path
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchDirectory = async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/system/filesystem?path=${encodeURIComponent(path)}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to read directory');
            }
            const data = await res.json();
            // Up level navigation
            setItems(data.items || []);
            // Update current path to canonical path returned by server
             if (data.path) {
                 // Don't set currentPath here loop, just visual? 
                 // Actually setting it is fine as long as it doesn't cause loop if same.
             }
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : 'Error reading folder');
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleUp = () => {
        if (!currentPath) return; // Already at root/drives
        // Check if we are at a drive root (e.g. C:\)
        if (currentPath.endsWith(':\\') || currentPath === '/') {
             setCurrentPath(''); // Go to Drive selection
             setItems(drives);
             return;
        }
        
        // Go up one level
        // Remove trailing slash if present (except root)
        let clean = currentPath.replace(/[\\/]$/, '');
        const lastSep = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
        if (lastSep > -1) {
            const parent = clean.substring(0, lastSep) || (clean.startsWith('/') ? '/' : ''); 
            // If parent becomes empty string on Windows (e.g. C: -> empty?), handle drive
            if (!parent && clean.includes(':')) {
                 // C: case
                 setCurrentPath(clean + '\\'); // Keep C:\
            } else {
                 setCurrentPath(parent || (process.platform === 'win32' ? '' : '/'));
            }
        } else {
            // Top level
            setCurrentPath('');
            setItems(drives);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-background-secondary rounded-t-xl">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Folder className="w-5 h-5 text-accent-primary" />
                        Select Folder
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Path Bar */}
                <div className="p-4 border-b border-border bg-background-tertiary flex gap-2">
                    <button 
                        onClick={handleUp} 
                        disabled={!currentPath}
                        className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30"
                        title="Go Up"
                    >
                        <CornerLeftUp className="w-5 h-5" />
                    </button>
                    <div className="flex-1 flex items-center px-3 bg-background border border-border rounded-lg text-sm font-mono overflow-hidden">
                        {currentPath || 'Computer'}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-foreground-muted gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
                            <p>Reading contents...</p>
                        </div>
                    ) : error ? (
                        <div className="h-full flex flex-col items-center justify-center text-red-500 gap-2">
                            <p className="font-semibold">{error}</p>
                            <button onClick={handleUp} className="btn-secondary text-sm">Go Up</button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-foreground-muted">
                            <Folder className="w-12 h-12 mb-2 opacity-20" />
                            <p>Empty Folder</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1">
                            {!currentPath && drives.length > 0 && (
                                <div className="text-xs font-bold text-foreground-muted uppercase px-2 py-1 mb-1 mt-2">Drives</div>
                            )}
                            {items.map((item) => (
                                <button
                                    key={item.name}
                                    onClick={() => handleNavigate(item.path)}
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent-primary/10 hover:text-accent-primary text-left group transition-all"
                                >
                                    {item.isDrive ? (
                                        <HardDrive className="w-5 h-5 text-foreground-muted group-hover:text-accent-primary" />
                                    ) : (
                                        <Folder className="w-5 h-5 text-yellow-500/80 group-hover:text-yellow-500" />
                                    )}
                                    <span className="truncate flex-1">{item.name}</span>
                                    <ChevronRight className="w-4 h-4 text-foreground-muted opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-background-secondary rounded-b-xl flex justify-between items-center">
                    <div className="text-xs text-foreground-muted">
                        {currentPath ? 'Checking permissions...' : 'Select a drive to start'}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSelect(currentPath)}
                            disabled={!currentPath || loading}
                            className="px-6 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Select This Folder
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

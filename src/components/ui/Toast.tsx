'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface Toast {
    id: string;
    message: string;
    type?: 'success' | 'error' | 'info';
    action?: {
        label: string;
        onClick: () => void;
    };
    duration?: number;
}

interface ToastContextType {
    showToast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    const removeToast = useCallback((id: string) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback(({ message, type = 'success', action, duration = 4000 }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, message, type, action, duration };

        setToasts((prev) => [...prev.slice(-4), newToast]);

        const timer = setTimeout(() => {
            removeToast(id);
        }, duration);

        timersRef.current.set(id, timer);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-border shadow-2xl text-foreground text-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                            {toast.type === 'info' && <Info className="w-4 h-4 text-accent-primary shrink-0" />}
                            <span className="truncate">{toast.message}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {toast.action && (
                                <button
                                    onClick={() => {
                                        toast.action?.onClick();
                                        removeToast(toast.id);
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors"
                                >
                                    {toast.action.label}
                                </button>
                            )}
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        return {
            showToast: () => {}
        };
    }
    return ctx;
}

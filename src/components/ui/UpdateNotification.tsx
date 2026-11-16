'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { ArrowDownCircle, CheckCircle2, GitPullRequest, Loader2, X, RefreshCw } from 'lucide-react';
import packageInfo from '../../../package.json';

type UpdateState = 'idle' | 'downloading' | 'downloaded' | 'diy-available' | 'error';

interface DIYUpdateResponse {
  latest_version: string;
  release_date?: string;
  release_notes?: string;
  github_url?: string;
}

/**
 * Compare two semantic version strings (e.g. "0.2.0" vs "0.1.0").
 * Returns true if latest is strictly newer than current.
 */
function isVersionNewer(latest: string, current: string): boolean {
  if (!latest || !current) return false;
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const l = parse(latest);
  const c = parse(current);
  const len = Math.max(l.length, c.length);

  for (let i = 0; i < len; i++) {
    const lPart = l[i] || 0;
    const cPart = c[i] || 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }
  return false;
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [githubUrl, setGithubUrl] = useState<string>('https://github.com/zerosum/deck-tv');
  const [visible, setVisible] = useState<boolean>(false);

  const tier = (process.env.NEXT_PUBLIC_APP_TIER || 'diy').toLowerCase();
  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || packageInfo.version || '1.0.0';

  useEffect(() => {
    // ----------------------------------------------------
    // TIER 1: Paid Tier (EXE) via electron-updater IPC
    // ----------------------------------------------------
    if (tier === 'exe') {
      if (typeof window === 'undefined' || !window.electronUpdater) {
        return;
      }

      const unsubAvailable = window.electronUpdater.onUpdateAvailable((info) => {
        setVersion(info.version);
        setState('downloading');
        setVisible(true);
      });

      const unsubProgress = window.electronUpdater.onUpdateProgress((prog) => {
        setProgress(Math.round(prog.percent || 0));
      });

      const unsubDownloaded = window.electronUpdater.onUpdateDownloaded((info) => {
        setVersion(info.version);
        setState('downloaded');
        setVisible(true);
      });

      const unsubError = window.electronUpdater.onUpdateError((err) => {
        console.warn('[electron-updater] Update error:', err);
      });

      return () => {
        unsubAvailable();
        unsubProgress();
        unsubDownloaded();
        unsubError();
      };
    }

    // ----------------------------------------------------
    // TIER 2: Open-source (DIY) Tier via remote JSON check
    // ----------------------------------------------------
    if (tier === 'diy') {
      let isMounted = true;
      const timestamp = Date.now();

      // Helper to process response data
      const handleData = (data: DIYUpdateResponse) => {
        if (!isMounted || !data?.latest_version) return;
        console.log(`[UpdateNotification] Checking version: current=${currentVersion}, remote=${data.latest_version}`);

        if (isVersionNewer(data.latest_version, currentVersion)) {
          console.log(`[UpdateNotification] New version detected! Showing toast for v${data.latest_version}`);
          setVersion(data.latest_version);
          if (data.github_url) setGithubUrl(data.github_url);
          setState('diy-available');
          setVisible(true);
        } else {
          console.log(`[UpdateNotification] App is up to date.`);
        }
      };

      // Try internal Next.js API route first (avoids browser CORS restrictions)
      fetch(`/api/updates/check?t=${timestamp}`, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
          return res.json() as Promise<DIYUpdateResponse>;
        })
        .then(handleData)
        .catch((apiErr) => {
          console.debug('[UpdateNotification] Internal proxy check failed, trying direct:', apiErr.message);
          // Fallback to direct fetch
          return fetch(`https://zerosum.ca/appversions/updatedecktv.json?t=${timestamp}`, { cache: 'no-store' })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json() as Promise<DIYUpdateResponse>;
            })
            .then(handleData);
        })
        .catch((err) => {
          console.warn('[UpdateNotification] Update check error:', err?.message || err);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [tier, currentVersion]);

  if (!visible || state === 'idle') {
    return null;
  }

  const handleRestart = () => {
    if (window.electronUpdater?.restartApp) {
      window.electronUpdater.restartApp();
    }
  };

  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-[9999] pointer-events-auto max-w-sm w-full p-4 rounded-xl border border-border/80 bg-background-secondary/95 backdrop-blur-md shadow-2xl text-foreground text-sm transition-all animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Status Icon */}
        <div className="pt-0.5 shrink-0">
          {state === 'downloading' && (
            <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
          )}
          {state === 'downloaded' && (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
          {state === 'diy-available' && (
            <GitPullRequest className="w-5 h-5 text-accent-primary" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {state === 'downloading' && (
            <div>
              <p className="font-semibold text-foreground">Downloading Update</p>
              <p className="text-xs text-foreground-muted mt-0.5">
                Deck TV v{version} is downloading in the background...
              </p>
              {progress > 0 && (
                <div className="mt-2">
                  <div className="w-full bg-background-tertiary h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-accent-primary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-foreground-muted mt-1 block text-right">
                    {progress}%
                  </span>
                </div>
              )}
            </div>
          )}

          {state === 'downloaded' && (
            <div>
              <p className="font-semibold text-foreground">Update Ready to Install</p>
              <p className="text-xs text-foreground-muted mt-0.5">
                Deck TV v{version} has been downloaded. Restart to apply updates.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleRestart}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary-hover active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Restart to Update
                </button>
              </div>
            </div>
          )}

          {state === 'diy-available' && (
            <div>
              <p className="font-semibold text-foreground">Update Available</p>
              <p className="text-xs text-foreground-muted mt-0.5 leading-relaxed">
                A new version (v{version}) is available on GitHub. Run{' '}
                <code className="px-1.5 py-0.5 rounded bg-background-tertiary text-accent-primary font-mono text-[11px]">
                  git pull
                </code>{' '}
                to update.
              </p>
              {githubUrl && (
                <div className="mt-2.5">
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-accent-primary hover:underline"
                  >
                    View on GitHub &rarr;
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          onClick={() => setVisible(false)}
          className="text-foreground-muted hover:text-foreground p-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default UpdateNotification;

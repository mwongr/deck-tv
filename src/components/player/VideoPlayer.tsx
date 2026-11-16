'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    Settings, Loader2, Languages, Repeat, Copy, ExternalLink, Radio,
    Check, X, Cpu, Film, Network, Sliders, RefreshCw
} from 'lucide-react';
import { db, type Channel, type DVRJob, generateId } from '@/lib/db';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type TranscodingSettings, DEFAULT_TRANSCODING_SETTINGS } from '@/types';

interface VideoPlayerProps {
    channel: Channel | null;
    className?: string;
}

interface PlayerState {
    isPlaying: boolean;
    isPaused: boolean;
    isLoading: boolean;
    isMuted: boolean;
    volume: number;
    isFullscreen: boolean;
    qualities: { height: number; bitrate: number; level: number }[];
    currentQuality: number; // -1 for Auto, or index in qualities
    audioTracks: { id: number; name: string; lang?: string }[];
    currentAudioTrack: number;
    subtitleTracks: any[];
    currentSubtitleTrack: number; // -1 for disabled
    error: string | null;
    showControls: boolean;
    showSettings: boolean;
}

function getProxyTranscodeQuery(settings: TranscodingSettings): string {
    const params = new URLSearchParams();
    if (settings.forceAudioTranscode || (settings.audioMixPreset !== 'passthrough' && settings.audioMixPreset !== 'auto')) {
        params.set('transcode', 'true');
    }
    if (settings.forceVideoTranscode) {
        params.set('videoTranscode', 'true');
    }
    if (settings.forceRemux) {
        params.set('remux', 'true');
    }
    if (settings.hwEncoder !== 'auto') {
        params.set('hw', settings.hwEncoder);
    }
    if (settings.maxResolution !== '1080p') {
        params.set('res', settings.maxResolution);
    }
    if (settings.qualityPreset !== 'medium') {
        params.set('quality', settings.qualityPreset);
    }
    if (settings.audioMixPreset !== 'auto') {
        params.set('audioMix', settings.audioMixPreset);
    }
    const qs = params.toString();
    return qs ? `&${qs}` : '';
}

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function VideoPlayer({ channel, className = '' }: VideoPlayerProps) {
    const router = useRouter();
    const [isRecording, setIsRecording] = useState(false);
    // ... refs ...
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fallbackLevel = useRef(0);
    const hlsProxyRetried = useRef(false);

    const [state, setState] = useState<PlayerState>({
        isPlaying: false,
        isPaused: false,
        isLoading: true,
        isMuted: false,
        volume: 1,
        isFullscreen: false,
        currentQuality: -1,
        qualities: [],
        audioTracks: [],
        currentAudioTrack: -1,
        subtitleTracks: [],
        currentSubtitleTrack: -1,
        error: null,
        showControls: true,
        showSettings: false,
    });

    // Persistent Transcoding Settings
    const [transcodingSettings, setTranscodingSettings] = useState<TranscodingSettings>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('deck-tv-transcoding-settings');
                if (saved) return { ...DEFAULT_TRANSCODING_SETTINGS, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to load transcoding settings', e);
            }
        }
        return DEFAULT_TRANSCODING_SETTINGS;
    });

    useEffect(() => {
        localStorage.setItem('deck-tv-transcoding-settings', JSON.stringify(transcodingSettings));
    }, [transcodingSettings]);

    // Persistent Player Settings
    const [playerSettings, setPlayerSettings] = useState<{
        enableWorker: boolean;
        forceStereo: boolean;
        transcodeAudio: boolean;
        externalPlayer: string;
    }>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('deck-tv-player-settings');
                if (saved) return { transcodeAudio: false, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to strict player settings', e);
            }
        }
        return { enableWorker: true, forceStereo: false, transcodeAudio: false, externalPlayer: 'browser' };
    });

    // Save settings
    useEffect(() => {
        localStorage.setItem('deck-tv-player-settings', JSON.stringify(playerSettings));
    }, [playerSettings]);

    const [activeSettingsTab, setActiveSettingsTab] = useState<'video' | 'audio' | 'network'>('video');
    const [copiedNotice, setCopiedNotice] = useState(false);
    const [statusNotice, setStatusNotice] = useState<string | null>(null);

    // Channel-specific settings overrides (channelId -> Partial<TranscodingSettings>)
    const [channelOverrides, setChannelOverrides] = useState<Record<string, Partial<TranscodingSettings>>>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('deck-tv-channel-settings');
                if (saved) return JSON.parse(saved);
                // Backward compatibility: migrate legacy audio-only overrides if present
                const oldAudio = localStorage.getItem('deck-tv-channel-audio-overrides');
                if (oldAudio) {
                    const parsed = JSON.parse(oldAudio);
                    const migrated: Record<string, Partial<TranscodingSettings>> = {};
                    for (const [id, val] of Object.entries(parsed)) {
                        migrated[id] = { forceAudioTranscode: Boolean(val) };
                    }
                    return migrated;
                }
            } catch (e) {
                console.error('Failed to load channel settings overrides', e);
            }
        }
        return {};
    });

    // Effective settings combining global defaults with any channel-specific preferences
    const effectiveSettings: TranscodingSettings = useMemo(() => {
        const channelOverride = channel?.id ? channelOverrides[channel.id] : undefined;
        return {
            ...transcodingSettings,
            ...(channelOverride || {})
        };
    }, [channel?.id, channelOverrides, transcodingSettings]);

    const hasChannelOverrides = Boolean(
        channel?.id &&
        channelOverrides[channel.id] &&
        Object.keys(channelOverrides[channel.id] || {}).length > 0
    );

    const resetChannelOverrides = useCallback(() => {
        if (!channel?.id) return;
        setChannelOverrides(prev => {
            const next = { ...prev };
            delete next[channel.id];
            try {
                localStorage.setItem('deck-tv-channel-settings', JSON.stringify(next));
                const legacy = JSON.parse(localStorage.getItem('deck-tv-channel-audio-overrides') || '{}');
                delete legacy[channel.id];
                localStorage.setItem('deck-tv-channel-audio-overrides', JSON.stringify(legacy));
            } catch (e) { }
            return next;
        });

        setStatusNotice('Settings reset');
        setTimeout(() => setStatusNotice(null), 2000);
    }, [channel?.id]);

    const updateTranscodingSetting = useCallback(<K extends keyof TranscodingSettings>(key: K, value: TranscodingSettings[K]) => {
        if (channel?.id) {
            // Save as channel override
            setChannelOverrides(prev => {
                const current = prev[channel.id] || {};
                const nextChannel = { ...current, [key]: value };
                const next = { ...prev, [channel.id]: nextChannel };
                try {
                    localStorage.setItem('deck-tv-channel-settings', JSON.stringify(next));
                } catch (e) { }
                return next;
            });
        } else {
            // Global base settings fallback
            setTranscodingSettings(prev => {
                const next = { ...prev, [key]: value };
                try {
                    localStorage.setItem('deck-tv-transcoding-settings', JSON.stringify(next));
                } catch (e) { }
                return next;
            });
        }

        if (key === 'forceAudioTranscode') {
            setPlayerSettings(s => ({ ...s, transcodeAudio: value as boolean }));
        } else if (key === 'enableWorker') {
            setPlayerSettings(s => ({ ...s, enableWorker: value as boolean }));
        } else if (key === 'externalPlayer') {
            setPlayerSettings(s => ({ ...s, externalPlayer: value as string }));
        }

        setStatusNotice('Applying changes...');
        setTimeout(() => setStatusNotice(null), 2000);
    }, [channel?.id]);

    // Initialize Player
    useEffect(() => {
        if (!channel || !videoRef.current) return;

        const video = videoRef.current;
        let hlsInstance: Hls | null = null;
        let isActive = true; // cleanup guard

        // Reset state
        setState(prev => ({ ...prev, isLoading: true, error: null, qualities: [] }));
        setProgress(0);
        setDuration(0);

        // Reset retry counters
        hlsProxyRetried.current = false;
        fallbackLevel.current = 0;

        // Cleanup previous HLS
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        // Functions defined as declarations to allow hoisting/circular calls
        function handleFallback(failedUrl: string, errorMsg?: string) {
            if (!isActive) return;

            console.warn(`Playback failed (Level ${fallbackLevel.current}): ${failedUrl}. Error: ${errorMsg}`);

            if (fallbackLevel.current >= 2) {
                // We tried everything.
                setState(prev => ({
                    ...prev,
                    error: `Playback failed: ${errorMsg || 'Stream not found'}`,
                    isLoading: false
                }));
                return;
            }

            fallbackLevel.current++;
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            if (fallbackLevel.current === 1) {
                let nextUrl = failedUrl;
                // If HLS failed on an Xtream/live channel, try the direct MPEG-TS stream with remuxing
                if (nextUrl.includes('.m3u8')) {
                    if (nextUrl.includes('/live/')) {
                        nextUrl = nextUrl.replace(/\.m3u8/i, '.ts');
                        console.log(`Fallback Level 1: HLS failed, trying direct stream with remuxing (${nextUrl})`);
                        initDirect(nextUrl, true);
                        return;
                    }
                } else if (nextUrl.match(/\.(ts|mp4|mkv|avi|mov|wmv)$/i)) {
                    // Direct stream failed, try HLS playlist
                    nextUrl = nextUrl.replace(/\.(ts|mp4|mkv|avi|mov|wmv)$/i, '.m3u8');
                } else if (!nextUrl.includes('.m3u8')) {
                    nextUrl += '.m3u8';
                }

                console.log(`Fallback Level 1: Trying HLS (${nextUrl})`);
                initHls(nextUrl);
            } else if (fallbackLevel.current === 2) {
                // Level 2: Try Direct Stream with Forced Remux & Transcode
                console.log(`Fallback Level 2: Trying Direct Stream with Remuxing (${channel?.url})`);
                if (channel?.url) {
                    let directUrl = channel.url;
                    if (directUrl.includes('/live/') && directUrl.toLowerCase().includes('.m3u8')) {
                        directUrl = directUrl.replace(/\.m3u8/i, '.ts');
                    }
                    initDirect(directUrl, true);
                }
            }
        }

        function initHls(url: string) {
            if (!Hls.isSupported()) {
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                } else {
                    handleFallback(url, 'HLS not supported');
                }
                return;
            }

            const hls = new Hls({
                enableWorker: effectiveSettings.enableWorker,
                lowLatencyMode: false,
                xhrSetup: (xhr, requestUrl) => {
                    // Do not re-proxy if already a proxy URL
                    if (requestUrl.includes('/api/video-proxy')) return;

                    const useProxy = effectiveSettings.forceBackendProxy || hlsProxyRetried.current;
                    if (useProxy) {
                        const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(requestUrl)}`;
                        xhr.open('GET', proxyUrl);
                    }
                }
            });

            hlsRef.current = hls;
            hlsInstance = hls;

            hls.loadSource(url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                if (!isActive) return;
                const qualities = data.levels.map((level, index) => ({
                    height: level.height,
                    bitrate: level.bitrate,
                    level: index,
                }));
                qualities.sort((a, b) => b.height - a.height);
                setState(prev => ({ ...prev, qualities, isLoading: false }));
                video.play().catch(() => { });
                if (hls.audioTracks && hls.audioTracks.length > 0) {
                    const tracks = hls.audioTracks.map(t => ({ id: t.id, name: t.name, lang: t.lang }));
                    setState(prev => ({ ...prev, audioTracks: tracks, currentAudioTrack: hls.audioTrack }));
                }
            });

            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
                if (!isActive) return;
                const tracks = data.audioTracks.map(t => ({ id: t.id, name: t.name, lang: t.lang }));
                setState(prev => ({ ...prev, audioTracks: tracks, currentAudioTrack: hls.audioTrack }));
            });

            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
                if (!isActive) return;
                setState(prev => ({ ...prev, currentAudioTrack: data.id }));
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (!isActive) return;
                if (data.fatal) {
                    // Check for ANY network error (Manifest or Fragment) that implies we might need a proxy
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        const isProxyAlreadyInUse = url.includes('/api/video-proxy') || hlsProxyRetried.current;

                        // If we haven't tried proxying yet, try it now for ANY network error (CORS, 404, etc)
                        if (!isProxyAlreadyInUse) {
                            console.log(`HLS Network Error (${data.details}), retrying with proxy...`);
                            hlsProxyRetried.current = true;
                            // We need to reload the source. Since hlsProxyRetried is true, 
                            // xhrSetup will now rewrite ALL requests (manifest and segments) to use the proxy.
                            // CRITICAL: We must load the ORIGINAL URL, not the proxy URL, so that HLS.js 
                            // resolves relative segment paths against the original host, not localhost.
                            hls.loadSource(url);
                            return;
                        }

                        // If already proxied and still failing, it's fatal
                        hls.destroy();
                        handleFallback(url, 'HLS Network Error (Proxied)');
                        return;
                    }
                    hls.destroy();
                    handleFallback(url, `HLS Fatal Error: ${data.details}`);
                }
            });
        }

        function initDirect(url: string, forceRemuxAndTranscode: boolean = false) {
            video.pause();
            video.removeAttribute('src');
            video.load();

            let targetUrl = url;
            // For Xtream live streams, the raw .ts endpoint is the fastest continuous feed for FFmpeg
            if (targetUrl.includes('/live/') && targetUrl.toLowerCase().includes('.m3u8')) {
                targetUrl = targetUrl.replace(/\.m3u8/i, '.ts');
            }

            const transcodeQuery = getProxyTranscodeQuery(effectiveSettings);
            let transcodeParam = transcodeQuery;

            // Non-MP4 containers (MPEG-TS, MKV, AVI, etc.) or forced transcoding require remuxing to fragmented MP4
            const targetLower = targetUrl.toLowerCase();
            const isNonMp4 = targetLower.includes('.ts') || targetLower.includes('.mkv') || targetLower.includes('.avi') || targetLower.includes('.wmv') || targetLower.includes('.flv') || targetLower.includes('.m3u8');
            if (forceRemuxAndTranscode || isNonMp4) {
                if (!transcodeParam.includes('remux=')) transcodeParam += '&remux=true';
                if (!transcodeParam.includes('transcode=') && effectiveSettings.forceAudioTranscode) {
                    transcodeParam += '&transcode=true';
                }
            }

            const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(targetUrl)}${transcodeParam}`;
            video.src = proxyUrl;

            const handleCanPlay = () => {
                if (!isActive) return;
                video.play().catch(e => {
                    if (e.name !== 'AbortError') handleFallback(url, e.message);
                });
                video.removeEventListener('loadeddata', handleCanPlay);
            };

            const handleError = (e: Event) => {
                if (!isActive) return;
                const target = e.target as HTMLVideoElement;
                const errCode = target.error?.code;
                const errMsg = target.error?.message;

                // Detect unsupported formats based on file extension and error
                const isUnsupportedFormat = url.match(/\.(mkv|avi|wmv|flv)$/i);

                if (errCode === 4 && isUnsupportedFormat) {
                    // MEDIA_ERR_SRC_NOT_SUPPORTED
                    handleFallback(url, `Browser cannot play this file format (${isUnsupportedFormat[1].toUpperCase()}). Please use External Player.`);
                    return;
                }

                if (errCode !== 1) {
                    handleFallback(url, `Direct Play Error ${errCode}: ${errMsg}`);
                }
                video.removeEventListener('error', handleError);
            };

            video.addEventListener('loadeddata', handleCanPlay);
            video.addEventListener('error', handleError);
            video.load();
        }

        async function determineAndInit() {
            let url = channel?.url || '';
            if (!url) return;

            const needsTranscode = effectiveSettings.forceAudioTranscode ||
                                   effectiveSettings.forceVideoTranscode ||
                                   effectiveSettings.forceRemux ||
                                   (effectiveSettings.audioMixPreset !== 'auto' && effectiveSettings.audioMixPreset !== 'passthrough');

            if (effectiveSettings.streamOutputFormat === 'ts' && url.includes('/live/') && url.toLowerCase().includes('.m3u8')) {
                url = url.replace(/\.m3u8/i, '.ts');
            }
            const urlLower = url.toLowerCase();

            // Auto-rewrite unsupported extensions to .mp4 first (Optimistic attempt)
            if (urlLower.match(/\.(mkv|avi|wmv|flv|mov)$/)) {
                console.log("Rewriting unsupported extension to .mp4");
                url = url.replace(/\.(mkv|avi|wmv|flv|mov)$/i, '.mp4');
            }

            const isHls = urlLower.includes('.m3u8');

            if (needsTranscode) {
                // When audio/video transcoding or remuxing is requested, play via single continuous FFmpeg stream
                console.log("Transcoding/remuxing active: launching direct stream pipeline");
                initDirect(url, true);
            } else if (isHls) {
                // Standard HLS: play via Hls.js with native client demuxing
                initHls(url);
            } else {
                // Direct stream (MPEG-TS, MP4, etc.)
                initDirect(url);
            }
        }


        // Watchdog for stalled playback
        let stalledTimeout: NodeJS.Timeout;

        const handleWaiting = () => {
            setState(prev => ({ ...prev, isLoading: true }));
            if (stalledTimeout) clearTimeout(stalledTimeout);

            // If we're already error'd out, don't set another timeout
            if (fallbackLevel.current >= 2 && state.error) return;

            stalledTimeout = setTimeout(() => {
                if (isActive) {
                    handleFallback(channel?.url || '', 'Playback stalled / timed out');
                }
            }, 15000); // 15 seconds timeout
        };

        const handleCanPlay = () => {
            setState(prev => ({ ...prev, isLoading: false }));
            if (stalledTimeout) clearTimeout(stalledTimeout);
        };

        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('canplay', handleCanPlay);
        // Also listen for loadeddata as a "success" signal
        video.addEventListener('loadeddata', handleCanPlay);

        determineAndInit();

        return () => {
            isActive = false;
            if (stalledTimeout) clearTimeout(stalledTimeout);

            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('loadeddata', handleCanPlay);

            if (hlsInstance) {
                hlsInstance.destroy();
                hlsRef.current = null;
            }
            video.pause();
            video.removeAttribute('src');
            video.load();
        };
    }, [channel?.id, channel?.url, effectiveSettings]);

    // Video progress state
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    // Volume Drag Logic
    const volumeTrackRef = useRef<HTMLDivElement>(null);
    const [isVolumeDragging, setIsVolumeDragging] = useState(false);
    const isVolumeDraggingRef = useRef(false);

    const handleVolumeChange = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!volumeTrackRef.current || !videoRef.current) return;
        const rect = volumeTrackRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;

        videoRef.current.volume = percentage;
        videoRef.current.muted = percentage === 0;
        // State update happens via 'volumechange' event listener on video
    }, []);

    // Controls visibility
    const lastMousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

    const showControls = useCallback(() => {
        setState(prev => {
            if (!prev.showControls) {
                return { ...prev, showControls: true };
            }
            return prev;
        });

        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        controlsTimeoutRef.current = setTimeout(() => {
            setState(prev => {
                const isPlaying = videoRef.current ? !videoRef.current.paused : (prev.isPlaying && !prev.isPaused);
                if (isPlaying && !prev.showSettings && !isVolumeDraggingRef.current) {
                    return { ...prev, showControls: false };
                }
                return prev;
            });
        }, 3000);
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Ignore synthetic mousemove events where cursor did not actually move (prevents continuous timer resets in Electron)
        if (e.clientX === lastMousePosRef.current.x && e.clientY === lastMousePosRef.current.y) {
            return;
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        showControls();
    }, [showControls]);

    // Cleanup controls timeout on unmount
    useEffect(() => {
        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, []);

    // Reset auto-hide timer when settings modal closes
    useEffect(() => {
        if (!state.showSettings) {
            showControls();
        }
    }, [state.showSettings, showControls]);

    useEffect(() => {
        if (!isVolumeDragging) return;

        const onMouseMove = (e: MouseEvent) => {
            showControls();
            handleVolumeChange(e);
        };
        const onMouseUp = () => {
            setIsVolumeDragging(false);
            isVolumeDraggingRef.current = false;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [isVolumeDragging, handleVolumeChange, showControls]);

    // Video event handlers
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => {
            setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
            showControls();
        };
        const handlePause = () => setState(prev => ({ ...prev, isPlaying: false, isPaused: true, showControls: true }));

        const handleTimeUpdate = () => {
            setProgress(video.currentTime);
            setDuration(video.duration || 0);
        };
        const handleVolumeChangeUpdate = () => setState(prev => ({
            ...prev,
            volume: video.volume,
            isMuted: video.muted
        }));

        video.addEventListener('play', handlePlay);
        video.addEventListener('playing', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('volumechange', handleVolumeChangeUpdate);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('playing', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('volumechange', handleVolumeChangeUpdate);
        };
    }, [channel?.id, showControls]);

    // Fullscreen change handler
    useEffect(() => {
        const handleFullscreenChange = () => {
            setState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
            showControls();
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [showControls]);

    // Player controls
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            videoRef.current.play();
        } else {
            videoRef.current.pause();
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
    }, []);

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await containerRef.current.requestFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen toggle failed:', err);
        }
        showControls();
    }, [showControls]);

    const setQuality = useCallback((levelIndex: number) => {
        if (hlsRef.current) {
            hlsRef.current.currentLevel = levelIndex; // -1 is auto
            setState(prev => ({ ...prev, currentQuality: levelIndex, showSettings: false }));
        }
    }, []);

    const setAudioTrack = useCallback((trackId: number) => {
        if (hlsRef.current) {
            hlsRef.current.audioTrack = trackId;
            setState(prev => ({ ...prev, currentAudioTrack: trackId, showSettings: false }));
        }
    }, []);

    // Subtitle state and events
    useEffect(() => {
        if (!hlsRef.current) return;

        const onSubtitleTracksUpdated = (_: any, data: { subtitleTracks: any[] }) => {
            setState(prev => ({
                ...prev,
                subtitleTracks: data.subtitleTracks,
                currentSubtitleTrack: hlsRef.current?.subtitleTrack || -1
            }));
        };

        const onSubtitleTrackSwitch = (_: any, data: { id: number }) => {
            setState(prev => ({ ...prev, currentSubtitleTrack: data.id }));
        };

        hlsRef.current.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, onSubtitleTracksUpdated);
        hlsRef.current.on(Hls.Events.SUBTITLE_TRACK_SWITCH, onSubtitleTrackSwitch);

        return () => {
            hlsRef.current?.off(Hls.Events.SUBTITLE_TRACKS_UPDATED, onSubtitleTracksUpdated);
            hlsRef.current?.off(Hls.Events.SUBTITLE_TRACK_SWITCH, onSubtitleTrackSwitch);
        };
    }, [state.isLoading]);

    const toggleSubtitles = useCallback(() => {
        if (!hlsRef.current || state.subtitleTracks.length === 0) return;

        // If currently disabled (-1), switch to first track (0), else disable (-1)
        const newTrack = state.currentSubtitleTrack === -1 ? 0 : -1;
        hlsRef.current.subtitleTrack = newTrack;
        setState(prev => ({ ...prev, currentSubtitleTrack: newTrack }));
    }, [state.subtitleTracks, state.currentSubtitleTrack]);

    const handleCatchup = useCallback(() => {
        alert("Catch-up for " + channel?.name + " coming soon!");
    }, [channel]);

    const handleRecordLive = async () => {
        if (!channel || isRecording) return;
        setIsRecording(true);
        try {
            const duration = 4 * 60 * 60; // 4 hours default
            const startTime = new Date();
            const endTime = new Date(Date.now() + duration * 1000);

            const job: DVRJob = {
                id: generateId(),
                channelId: channel.id,
                channelName: channel.name,
                channelUrl: channel.url,
                programId: 'manual-' + Date.now(),
                programTitle: `${channel.name} - Manual Recording`,
                startTime,
                endTime,
                duration,
                status: 'scheduled',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const pathSetting = await db.settings.where('key').equals('dvrOutputPath').first();
            const jobWithDir = { ...job, outputDir: pathSetting?.value };

            await db.dvrJobs.add(jobWithDir);

            // Sync to server for backend recording
            await fetch('/api/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jobWithDir)
            });

            // Navigate to recordings view
            router.push('/?section=recordings');
        } catch (error) {
            console.error('Failed to start manual recording:', error);
            setIsRecording(false);
        }
    };


    // No channel selected
    if (!channel) {
        return (
            <div className={`relative bg-black flex items-center justify-center ${className}`}>
                <div className="text-center">
                    <Play className="w-16 h-16 text-foreground-muted mx-auto mb-4 opacity-50" />
                    <p className="text-foreground-secondary text-lg">Select a channel to start watching</p>
                    <p className="text-foreground-muted text-sm mt-2">Choose from the channel list on the left</p>
                </div>
            </div>
        );
    }




    return (
        <div
            ref={containerRef}
            className={`player-container relative bg-black overflow-hidden ${!state.showControls ? 'cursor-hidden cursor-none' : ''} ${className}`}
            onMouseMove={handleMouseMove}
            onClick={showControls}
            onDoubleClick={(e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('button') && !target.closest('input')) {
                    toggleFullscreen();
                }
            }}
            onMouseLeave={() => {
                lastMousePosRef.current = { x: -1, y: -1 };
                setState(prev => {
                    const isPlaying = videoRef.current ? !videoRef.current.paused : (prev.isPlaying && !prev.isPaused);
                    if (isPlaying && !prev.showSettings) {
                        return { ...prev, showControls: false };
                    }
                    return prev;
                });
            }}
        >
            {/* Video Element */}
            <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                crossOrigin="anonymous"
                disablePictureInPicture // Explicitly disable PiP as requested
                onError={(e) => {
                    const video = e.currentTarget;
                    const error = video.error;
                    if (error) {
                        // Don't show error if source is being changed
                        if (!video.src || video.src === window.location.href) return;
                        setState(prev => ({
                            ...prev,
                            error: `Video error: ${error.message || 'Unable to load video'}`,
                            isLoading: false
                        }));
                    }
                }}
            />

            {/* Loading Overlay */}
            {state.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-12 h-12 text-accent-primary animate-spin" />
                </div>
            )}

            {/* Error Overlay */}
            {state.error && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
                    <div className="text-center p-6">
                        <p className="text-red-500 text-lg mb-4">{state.error}</p>

                        <div className="flex flex-col gap-3 mt-4">
                            <button
                                onClick={() => channel && (hlsRef.current ? hlsRef.current.loadSource(channel.url) : window.location.reload())}
                                className="bg-accent-primary hover:bg-accent-secondary text-white px-6 py-2 rounded-lg transition-colors font-medium"
                            >
                                Retry Playback
                            </button>

                            <div className="text-sm text-foreground-muted my-2"> - OR - </div>

                            <button
                                onClick={() => {
                                    if (!channel) return;
                                    const url = new URL(channel.url, window.location.origin).href;
                                    const player = playerSettings.externalPlayer || 'browser';

                                    // External player logic...
                                    if (player === 'vlc') window.location.href = `vlc://${url}`;
                                    else if (player === 'potplayer') window.location.href = `potplayer://${url}`;
                                    else if (player === 'iina') window.location.href = `iina://weblink?url=${url}`;
                                    else if (player === 'download_m3u') {
                                        const blob = new Blob([`#EXTM3U\n#EXTINF:-1,${channel.name}\n${url}`], { type: 'audio/x-mpegurl' });
                                        const link = document.createElement('a');
                                        link.href = URL.createObjectURL(blob);
                                        link.download = `${channel.name.replace(/[^a-z0-9]/gi, '_')}.m3u`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    } else window.open(url, '_blank');
                                }}
                                className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 w-full"
                                title={`Open with ${playerSettings.externalPlayer === 'browser' ? 'Browser' : playerSettings.externalPlayer}`}
                            >
                                <Play className="w-4 h-4" />
                                {playerSettings.externalPlayer === 'download_m3u' ? 'Download Playlist' : 'Play in External Player'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls Overlay */}
            <div
                className={`
          player-controls absolute inset-0 flex flex-col justify-end
          bg-gradient-to-t from-black/80 via-transparent to-transparent
          transition-opacity duration-300
          ${state.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'}
        `}
                style={{
                    opacity: state.showControls ? 1 : 0,
                    pointerEvents: state.showControls ? 'auto' : 'none',
                    visibility: state.showControls ? 'visible' : 'hidden',
                    transition: 'opacity 300ms ease, visibility 300ms ease',
                }}
            >
                {/* Channel Info */}
                <div className="absolute top-4 left-4">
                    <h3 className="text-lg font-semibold text-white drop-shadow-lg">
                        {channel.name}
                    </h3>
                </div>

                {/* Progress Bar (Only for VOD) */}
                {duration > 0 && isFinite(duration) && (
                    <div className="px-4 pb-2 w-full flex items-center gap-3">
                        <span className="text-xs text-white font-medium drop-shadow-md">
                            {formatTime(progress)}
                        </span>
                        <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden relative cursor-pointer group/progress">
                            <input
                                type="range"
                                min="0"
                                max={duration}
                                value={progress || 0}
                                onChange={(e) => {
                                    const time = parseFloat(e.target.value);
                                    if (videoRef.current) {
                                        videoRef.current.currentTime = time;
                                        setProgress(time);
                                    }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div
                                className="h-full bg-accent-primary transition-all duration-100 relative"
                                style={{ width: `${(progress / duration) * 100}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/progress:scale-100 transition-transform shadow-md" />
                            </div>
                        </div>
                        <span className="text-xs text-white font-medium drop-shadow-md">
                            {formatTime(duration)}
                        </span>
                    </div>
                )}

                {/* Bottom Controls */}
                <div className="p-4 flex items-center gap-4">
                    {/* Play/Pause */}
                    <button
                        onClick={togglePlay}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                        title={state.isPlaying ? "Pause" : "Play"}
                    >
                        {state.isPaused || !state.isPlaying ? (
                            <Play className="w-5 h-5 text-white fill-white" />
                        ) : (
                            <Pause className="w-5 h-5 text-white" />
                        )}
                    </button>

                    {/* Catch-up Rewind Button (if supported) */}
                    {channel.catchupSupported && (
                        <button
                            onClick={handleCatchup}
                            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                            title="Catch-up / Rewind"
                        >
                            <Repeat className="w-4 h-4 text-white" />
                        </button>
                    )}

                    {/* Volume Control - Custom Slider */}
                    <div
                        className="flex items-center gap-2 group/volume bg-white/10 backdrop-blur-sm rounded-full pl-3 pr-4 py-1.5 hover:bg-white/20 transition-colors"
                        onMouseEnter={() => { /* Optional: Expand or show effects */ }}
                    >
                        <button
                            onClick={toggleMute}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors shrink-0"
                        >
                            {state.isMuted || state.volume === 0 ? (
                                <VolumeX className="w-4 h-4 text-white" />
                            ) : (
                                <Volume2 className="w-4 h-4 text-white" />
                            )}
                        </button>

                        <div
                            className="h-6 flex items-center w-24 cursor-pointer relative"
                            ref={volumeTrackRef}
                            onMouseDown={(e) => {
                                setIsVolumeDragging(true);
                                isVolumeDraggingRef.current = true;
                                handleVolumeChange(e);
                            }}
                        >
                            {/* Track Background */}
                            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                {/* Fill Bar */}
                                <div
                                    className="h-full bg-white transition-none"
                                    style={{ width: `${(state.isMuted ? 0 : state.volume) * 100}%` }}
                                />
                            </div>

                            {/* Thumb (only visible on hover or dragging) */}
                            <div
                                className={`
                                    absolute h-3 w-3 bg-white rounded-full shadow-sm top-1/2 -translate-y-1/2 -ml-1.5 pointer-events-none transition-transform duration-100
                                    ${isVolumeDragging ? 'scale-125' : 'scale-0 group-hover/volume:scale-100'}
                                `}
                                style={{ left: `${(state.isMuted ? 0 : state.volume) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Right Side Controls */}
                    <div className="flex items-center gap-2">

                        {/* Record Button */}
                        <button
                            onClick={handleRecordLive}
                            disabled={isRecording}
                            className={`
                                flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all
                                ${isRecording ? 'bg-red-600/50 text-white cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}
                            `}
                            title="Record manual stream (4 Hours)"
                        >
                            <Radio className={`w-3 h-3 ${isRecording ? 'animate-pulse' : ''}`} />
                            {isRecording ? 'STARTING...' : 'REC'}
                        </button>

                        {/* CC Button */}
                        {state.subtitleTracks.length > 0 && (
                            <button
                                onClick={toggleSubtitles}
                                className={`
                                    px-2 py-1.5 rounded-md text-xs font-bold border transform transition-all
                                    ${state.currentSubtitleTrack !== -1
                                        ? 'bg-white text-black border-white'
                                        : 'bg-transparent text-white border-white/50 hover:border-white'
                                    }
                                `}
                                title={state.currentSubtitleTrack !== -1 ? "Disable Captions" : "Enable Captions"}
                            >
                                CC
                            </button>
                        )}

                        {/* Settings Menu */}
                        <div className="relative">
                            <button
                                className={`p-2 rounded-lg transition-colors ${state.showSettings ? 'bg-accent-primary text-white' : 'hover:bg-white/10 text-white'}`}
                                onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
                                title="Playback & Transcoding Settings"
                            >
                                <Settings className="w-5 h-5" />
                            </button>

                            {/* In-Player Settings Flyout Panel */}
                            {state.showSettings && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                                        onClick={() => setState(prev => ({ ...prev, showSettings: false }))}
                                    />
                                    <div
                                        className="absolute bottom-14 right-0 w-[92vw] sm:w-[390px] max-h-[75vh] bg-neutral-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl z-50 text-white flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Panel Header */}
                                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/30">
                                            <div className="flex items-center gap-2">
                                                <Sliders className="w-4 h-4 text-accent-primary" />
                                                <h4 className="text-sm font-semibold text-white">Stream & Transcoding</h4>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hasChannelOverrides && (
                                                    <button
                                                        onClick={resetChannelOverrides}
                                                        className="text-xs text-foreground-muted hover:text-white underline transition-colors cursor-pointer"
                                                        title="Reset channel settings"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setState(prev => ({ ...prev, showSettings: false }))}
                                                    className="p-1 rounded-lg hover:bg-white/10 text-foreground-muted hover:text-white transition-colors"
                                                    title="Close"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Active Feed Status */}
                                        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs">
                                            <span className="text-foreground-muted truncate max-w-[210px] font-medium" title={channel.name}>
                                                {channel.name}
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary font-semibold text-[11px]">
                                                {effectiveSettings.forceVideoTranscode
                                                    ? 'Transcoded H.264'
                                                    : (effectiveSettings.forceRemux ? 'Remuxed MP4' : (effectiveSettings.streamOutputFormat === 'ts' ? 'MPEG-TS' : 'HLS'))}
                                            </span>
                                        </div>

                                        {/* Tabs */}
                                        <div className="flex border-b border-white/10 bg-black/20 text-xs font-semibold">
                                            <button
                                                onClick={() => setActiveSettingsTab('video')}
                                                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeSettingsTab === 'video' ? 'border-accent-primary text-accent-primary bg-white/5' : 'border-transparent text-foreground-muted hover:text-white'}`}
                                            >
                                                <Film className="w-3.5 h-3.5" />
                                                <span>Video</span>
                                            </button>
                                            <button
                                                onClick={() => setActiveSettingsTab('audio')}
                                                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeSettingsTab === 'audio' ? 'border-accent-primary text-accent-primary bg-white/5' : 'border-transparent text-foreground-muted hover:text-white'}`}
                                            >
                                                <Volume2 className="w-3.5 h-3.5" />
                                                <span>Audio</span>
                                            </button>
                                            <button
                                                onClick={() => setActiveSettingsTab('network')}
                                                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeSettingsTab === 'network' ? 'border-accent-primary text-accent-primary bg-white/5' : 'border-transparent text-foreground-muted hover:text-white'}`}
                                            >
                                                <Network className="w-3.5 h-3.5" />
                                                <span>Stream</span>
                                            </button>
                                        </div>

                                        {/* Tab Content */}
                                        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                                            {/* VIDEO TAB */}
                                            {activeSettingsTab === 'video' && (
                                                <div className="space-y-4">
                                                    {/* Intelligent Transcoding */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white flex items-center gap-1.5">
                                                                Intelligent Transcoding
                                                                <span className="text-[10px] bg-accent-primary/20 text-accent-primary font-semibold px-1.5 py-0.5 rounded">Auto</span>
                                                            </div>
                                                            <div className="text-foreground-muted mt-0.5">Auto-converts unsupported browser formats</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('autoTranscode', !effectiveSettings.autoTranscode)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.autoTranscode ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.autoTranscode ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Full Video Re-encoding */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Full Video Re-encoding</div>
                                                            <div className="text-foreground-muted mt-0.5">Force H.264 video conversion via FFmpeg</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('forceVideoTranscode', !effectiveSettings.forceVideoTranscode)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.forceVideoTranscode ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.forceVideoTranscode ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Direct Container Remuxing */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Direct Container Remuxing</div>
                                                            <div className="text-foreground-muted mt-0.5">Repackage TS/MKV into MP4 with zero quality loss</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('forceRemux', !effectiveSettings.forceRemux)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.forceRemux ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.forceRemux ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Resolution Ceiling */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Resolution Ceiling</div>
                                                            <div className="text-foreground-muted mt-0.5">Max output resolution cap</div>
                                                        </div>
                                                        <select
                                                            value={effectiveSettings.maxResolution}
                                                            onChange={(e) => updateTranscodingSetting('maxResolution', e.target.value as any)}
                                                            className="bg-black/50 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-primary"
                                                        >
                                                            <option value="4k">Original / 4K</option>
                                                            <option value="1080p">1080p Full HD</option>
                                                            <option value="720p">720p Standard HD</option>
                                                            <option value="480p">480p SD</option>
                                                        </select>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Acceleration Engine */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Acceleration Engine</div>
                                                            <div className="text-foreground-muted mt-0.5">Hardware GPU device</div>
                                                        </div>
                                                        <select
                                                            value={effectiveSettings.hwEncoder}
                                                            onChange={(e) => updateTranscodingSetting('hwEncoder', e.target.value as any)}
                                                            className="bg-black/50 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-primary"
                                                        >
                                                            <option value="auto">Auto (Recommended)</option>
                                                            <option value="nvenc">NVIDIA NVENC</option>
                                                            <option value="amf">AMD Radeon (AMF)</option>
                                                            <option value="qsv">Intel QuickSync (QSV)</option>
                                                            <option value="vaapi">VAAPI (Linux)</option>
                                                            <option value="software">CPU Software</option>
                                                        </select>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Encoding Profile */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Encoding Profile</div>
                                                            <div className="text-foreground-muted mt-0.5">Speed vs visual fidelity</div>
                                                        </div>
                                                        <select
                                                            value={effectiveSettings.qualityPreset}
                                                            onChange={(e) => updateTranscodingSetting('qualityPreset', e.target.value as any)}
                                                            className="bg-black/50 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-primary"
                                                        >
                                                            <option value="high">High Fidelity</option>
                                                            <option value="medium">Balanced</option>
                                                            <option value="low">High Performance</option>
                                                        </select>
                                                    </div>

                                                    {/* HLS Multi-Bitrate Qualities */}
                                                    {state.qualities.length > 0 && (
                                                        <div className="pt-2 border-t border-white/10 space-y-2">
                                                            <div className="font-semibold text-foreground-muted uppercase tracking-wider text-[11px]">HLS Quality Stream</div>
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                <button
                                                                    onClick={() => setQuality(-1)}
                                                                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${state.currentQuality === -1 ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-semibold' : 'border-white/10 hover:bg-white/10 text-white'}`}
                                                                >
                                                                    Auto (Adaptive)
                                                                </button>
                                                                {state.qualities.map((q) => (
                                                                    <button
                                                                        key={q.level}
                                                                        onClick={() => setQuality(q.level)}
                                                                        className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${state.currentQuality === q.level ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-semibold' : 'border-white/10 hover:bg-white/10 text-white'}`}
                                                                    >
                                                                        {q.height ? `${q.height}p` : `${Math.round(q.bitrate / 1000)}k`}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* AUDIO TAB */}
                                            {activeSettingsTab === 'audio' && (
                                                <div className="space-y-4">
                                                    {/* Convert Audio to Stereo AAC */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Convert Audio to Stereo AAC</div>
                                                            <div className="text-foreground-muted mt-0.5">Downmixes multi-channel audio (AC3/DTS) to stereo AAC</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('forceAudioTranscode', !effectiveSettings.forceAudioTranscode)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.forceAudioTranscode ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.forceAudioTranscode ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Surround Sound Mode */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-sm font-medium text-white">Surround Sound Mode</div>
                                                            <span className="text-[10px] text-accent-primary font-semibold">Downmix Filter</span>
                                                        </div>
                                                        <select
                                                            value={effectiveSettings.audioMixPreset}
                                                            onChange={(e) => updateTranscodingSetting('audioMixPreset', e.target.value as any)}
                                                            className="w-full bg-black/50 border border-white/20 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-accent-primary"
                                                        >
                                                            <option value="auto">Adaptive Stereo (Recommended)</option>
                                                            <option value="itu">Standard Balanced (ITU BS.775)</option>
                                                            <option value="night">Clear Dialogue / Night Mode</option>
                                                            <option value="cinematic">Expanded Soundstage (Cinema)</option>
                                                            <option value="passthrough">Raw Passthrough (Direct)</option>
                                                        </select>
                                                        <p className="text-[11px] text-foreground-muted">
                                                            {effectiveSettings.audioMixPreset === 'auto' && 'Blends surround channels into clean 2-channel sound.'}
                                                            {effectiveSettings.audioMixPreset === 'itu' && 'Natural studio-standard downmixing coefficients.'}
                                                            {effectiveSettings.audioMixPreset === 'night' && 'Amplifies dialogue clarity and compresses loud transients.'}
                                                            {effectiveSettings.audioMixPreset === 'cinematic' && 'Widens spatial dynamics and boosts movie soundstage.'}
                                                            {effectiveSettings.audioMixPreset === 'passthrough' && 'Passes raw audio stream directly to receiver without filters.'}
                                                        </p>
                                                    </div>

                                                    {/* Audio Streams list */}
                                                    {state.audioTracks.length > 0 && (
                                                        <div className="pt-2 border-t border-white/10 space-y-2">
                                                            <div className="font-semibold text-foreground-muted uppercase tracking-wider text-[11px]">Stream Audio Tracks</div>
                                                            <div className="space-y-1">
                                                                {state.audioTracks.map((track) => (
                                                                    <button
                                                                        key={track.id}
                                                                        onClick={() => setAudioTrack(track.id)}
                                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${state.currentAudioTrack === track.id ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40 font-semibold' : 'hover:bg-white/10 text-white'}`}
                                                                    >
                                                                        <span>{track.name} {track.lang && `(${track.lang.toUpperCase()})`}</span>
                                                                        {state.currentAudioTrack === track.id && <Check className="w-3.5 h-3.5" />}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* NETWORK & STREAM TAB */}
                                            {activeSettingsTab === 'network' && (
                                                <div className="space-y-4">
                                                    {/* Stream Output Format */}
                                                    <div className="space-y-2">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Live Stream Delivery Protocol</div>
                                                            <div className="text-foreground-muted mt-0.5">Switch protocol for Xtream IPTV streams</div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => updateTranscodingSetting('streamOutputFormat', 'm3u8')}
                                                                className={`px-3 py-2 rounded-lg border text-center transition-colors ${effectiveSettings.streamOutputFormat === 'm3u8' ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-semibold' : 'border-white/15 text-white hover:bg-white/10'}`}
                                                            >
                                                                HLS (.m3u8)
                                                            </button>
                                                            <button
                                                                onClick={() => updateTranscodingSetting('streamOutputFormat', 'ts')}
                                                                className={`px-3 py-2 rounded-lg border text-center transition-colors ${effectiveSettings.streamOutputFormat === 'ts' ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-semibold' : 'border-white/15 text-white hover:bg-white/10'}`}
                                                            >
                                                                MPEG-TS (.ts)
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Relay Through Local Server Proxy */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Relay Through Local Server Proxy</div>
                                                            <div className="text-foreground-muted mt-0.5">Injects CORS headers and bypasses provider firewall blocks</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('forceBackendProxy', !effectiveSettings.forceBackendProxy)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.forceBackendProxy ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.forceBackendProxy ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* HLS Web Worker */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">HLS Web Worker</div>
                                                            <div className="text-foreground-muted mt-0.5">Demuxes video stream on background thread</div>
                                                        </div>
                                                        <button
                                                            onClick={() => updateTranscodingSetting('enableWorker', !effectiveSettings.enableWorker)}
                                                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${effectiveSettings.enableWorker ? 'bg-accent-primary' : 'bg-white/20'}`}
                                                        >
                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${effectiveSettings.enableWorker ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    <div className="h-px bg-white/10" />

                                                    {/* Stream Tools */}
                                                    <div className="space-y-2 pt-1">
                                                        <div className="font-semibold text-foreground-muted uppercase tracking-wider text-[11px]">Stream Tools</div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-foreground-muted">External App:</span>
                                                            <select
                                                                value={effectiveSettings.externalPlayer || 'browser'}
                                                                onChange={(e) => updateTranscodingSetting('externalPlayer', e.target.value)}
                                                                className="bg-black/50 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-primary"
                                                            >
                                                                <option value="browser">Browser</option>
                                                                <option value="vlc">VLC</option>
                                                                <option value="potplayer">PotPlayer</option>
                                                                <option value="iina">IINA</option>
                                                                <option value="download_m3u">Download M3U</option>
                                                            </select>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                                            <button
                                                                onClick={() => {
                                                                    if (channel?.url) {
                                                                        navigator.clipboard.writeText(channel.url);
                                                                        setCopiedNotice(true);
                                                                        setTimeout(() => setCopiedNotice(false), 2000);
                                                                    }
                                                                }}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                                            >
                                                                {copiedNotice ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                                <span>{copiedNotice ? 'Copied!' : 'Copy URL'}</span>
                                                            </button>

                                                            <button
                                                                onClick={() => {
                                                                    if (!channel) return;
                                                                    const url = new URL(channel.url, window.location.origin).href;
                                                                    const player = effectiveSettings.externalPlayer || 'browser';

                                                                    if (player === 'vlc') window.location.href = `vlc://${url}`;
                                                                    else if (player === 'potplayer') window.location.href = `potplayer://${url}`;
                                                                    else if (player === 'iina') window.location.href = `iina://weblink?url=${url}`;
                                                                    else if (player === 'download_m3u') {
                                                                        const blob = new Blob([`#EXTM3U\n#EXTINF:-1,${channel.name}\n${url}`], { type: 'audio/x-mpegurl' });
                                                                        const link = document.createElement('a');
                                                                        link.href = URL.createObjectURL(blob);
                                                                        link.download = `${channel.name.replace(/[^a-z0-9]/gi, '_')}.m3u`;
                                                                        document.body.appendChild(link);
                                                                        link.click();
                                                                        document.body.removeChild(link);
                                                                    } else window.open(url, '_blank');

                                                                    setState(prev => ({ ...prev, showSettings: false }));
                                                                }}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                <span>Launch Player</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer / Status bar */}
                                        <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs">
                                            {statusNotice ? (
                                                <span className="flex items-center gap-1.5 text-accent-primary font-medium animate-pulse">
                                                    <Check className="w-3.5 h-3.5" /> {statusNotice}
                                                </span>
                                            ) : (
                                                <span className="text-foreground-muted">Changes apply directly to stream</span>
                                            )}
                                            <Link
                                                href="/settings"
                                                onClick={() => setState(prev => ({ ...prev, showSettings: false }))}
                                                className="text-accent-primary hover:underline font-medium"
                                            >
                                                Settings Tab →
                                            </Link>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Fullscreen */}
                        <button
                            onClick={toggleFullscreen}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            title="Fullscreen"
                        >
                            {state.isFullscreen ? (
                                <Minimize className="w-5 h-5 text-white" />
                            ) : (
                                <Maximize className="w-5 h-5 text-white" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

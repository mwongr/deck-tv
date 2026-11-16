'use client';

import { useState, useEffect } from 'react';
import {
    ArrowLeft, Globe, Server, Calendar, HardDrive, Save,
    Loader2, Check, X, Plus, Trash2, RefreshCw, Tv, Edit, Play,
    Cpu, Volume2, Video, Network, Github, ExternalLink, Database,
    Layers, Radio, Film, ShieldCheck, Heart, Sparkles,
    Copy, Wifi, Smartphone, Laptop, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { db, generateId, type PlaylistSource, type Channel, type Group } from '@/lib/db';
import { fetchAndParseM3U, XtreamClient } from '@/lib/parsers';
import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPicker } from '@/components/ui/FolderPicker';
import { KofiButton } from '@/components/ui/KofiButton';
import { type TranscodingSettings, DEFAULT_TRANSCODING_SETTINGS } from '@/types';
import packageInfo from '../../../package.json';

type Tab = 'playlists' | 'transcoding' | 'player' | 'dvr' | 'network' | 'backup' | 'about';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('playlists');

    return (
        <div className="h-screen flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <header className="h-14 bg-background-secondary border-b border-border flex items-center px-4 shrink-0">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-foreground-secondary hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Player</span>
                </Link>
                <h1 className="text-lg font-semibold ml-6">Settings</h1>
            </header>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto p-6 pb-36">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {(['playlists', 'transcoding', 'player', 'dvr', 'network', 'backup', 'about'] as Tab[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`
                    px-4 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap
                    ${activeTab === tab
                                        ? 'text-accent-primary border-accent-primary'
                                        : 'text-foreground-muted border-transparent hover:text-foreground'
                                    }
                  `}
                            >
                                {tab === 'playlists' ? 'Playlists & EPG' : tab === 'network' ? 'Network & Sharing' : tab === 'dvr' ? 'DVR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'playlists' && <PlaylistsTab />}
                    {activeTab === 'transcoding' && <TranscodingTab />}
                    {activeTab === 'player' && <PlayerTab />}
                    {activeTab === 'dvr' && <DVRTab />}
                    {activeTab === 'network' && <NetworkTab />}
                    {activeTab === 'backup' && <BackupTab />}
                    {activeTab === 'about' && <AboutTab />}
                </div>
            </div>
        </div>
    );
}

function TranscodingTab() {
    const [settings, setSettings] = useState<TranscodingSettings>(DEFAULT_TRANSCODING_SETTINGS);
    const [savedNotice, setSavedNotice] = useState(false);
    const [overrideCount, setOverrideCount] = useState<number>(0);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('deck-tv-transcoding-settings');
            if (saved) {
                setSettings({ ...DEFAULT_TRANSCODING_SETTINGS, ...JSON.parse(saved) });
            } else {
                const oldPlayerSettings = localStorage.getItem('deck-tv-player-settings');
                if (oldPlayerSettings) {
                    const parsed = JSON.parse(oldPlayerSettings);
                    if (parsed.transcodeAudio) {
                        setSettings(s => ({ ...s, forceAudioTranscode: true }));
                    }
                }
            }

            const channelSettings = JSON.parse(localStorage.getItem('deck-tv-channel-settings') || '{}');
            const oldAudio = JSON.parse(localStorage.getItem('deck-tv-channel-audio-overrides') || '{}');
            const allChannelIds = new Set([...Object.keys(channelSettings), ...Object.keys(oldAudio)]);
            setOverrideCount(allChannelIds.size);
        } catch (e) { }
    }, []);

    const clearAllChannelOverrides = () => {
        try {
            localStorage.removeItem('deck-tv-channel-settings');
            localStorage.removeItem('deck-tv-channel-audio-overrides');
            setOverrideCount(0);
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 2000);
        } catch (e) { }
    };

    const updateSetting = <K extends keyof TranscodingSettings>(key: K, value: TranscodingSettings[K]) => {
        const next = { ...settings, [key]: value };
        setSettings(next);
        localStorage.setItem('deck-tv-transcoding-settings', JSON.stringify(next));

        try {
            const oldPlayerSettings = JSON.parse(localStorage.getItem('deck-tv-player-settings') || '{}');
            localStorage.setItem('deck-tv-player-settings', JSON.stringify({
                ...oldPlayerSettings,
                enableWorker: next.enableWorker,
                transcodeAudio: next.forceAudioTranscode,
                externalPlayer: next.externalPlayer
            }));
        } catch (e) { }

        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
    };

    return (
        <div className="space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Stream Optimization & Transcoding</h2>
                    <p className="text-foreground-muted text-sm mt-1">
                        Configure real-time media encoding, audio downmixing, and compatibility processing for Deck TV.
                    </p>
                </div>
                {savedNotice && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full transition-all">
                        <Check className="w-3.5 h-3.5" />
                        <span>Saved</span>
                    </div>
                )}
            </div>

            {/* Hardware Acceleration / GPU Card */}
            <div className="rounded-xl bg-background-secondary border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-black/20 flex items-center gap-2.5">
                    <Cpu className="w-5 h-5 text-accent-primary" />
                    <h3 className="font-semibold text-white">GPU & Hardware Acceleration</h3>
                </div>

                <div className="p-6 space-y-6">
                    {/* Acceleration Engine */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Acceleration Engine</div>
                            <p className="text-sm text-foreground-muted mt-0.5">
                                Select which hardware device handles video processing. Auto mode chooses your primary graphics card.
                            </p>
                        </div>
                        <select
                            value={settings.hwEncoder}
                            onChange={(e) => updateSetting('hwEncoder', e.target.value as any)}
                            className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                        >
                            <option value="auto">Auto (Recommended)</option>
                            <option value="nvenc">NVIDIA NVENC</option>
                            <option value="amf">AMD Radeon (AMF)</option>
                            <option value="qsv">Intel QuickSync (QSV)</option>
                            <option value="vaapi">VAAPI (Linux)</option>
                            <option value="software">CPU Only (Software)</option>
                        </select>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Target Resolution Ceiling */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Resolution Ceiling</div>
                            <p className="text-sm text-foreground-muted mt-0.5">
                                Cap playback resolution when re-encoding is active to conserve bandwidth and processing power.
                            </p>
                        </div>
                        <select
                            value={settings.maxResolution}
                            onChange={(e) => updateSetting('maxResolution', e.target.value as any)}
                            className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                        >
                            <option value="4k">Original / 4K Ultra HD</option>
                            <option value="1080p">1080p Full HD</option>
                            <option value="720p">720p Standard HD</option>
                            <option value="480p">480p Standard Definition</option>
                        </select>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Encoding Profile */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Encoding Profile</div>
                            <p className="text-sm text-foreground-muted mt-0.5">
                                Balance between visual sharpness and encoding speed. Higher quality requires more network throughput.
                            </p>
                        </div>
                        <select
                            value={settings.qualityPreset}
                            onChange={(e) => updateSetting('qualityPreset', e.target.value as any)}
                            className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                        >
                            <option value="high">High Fidelity (Higher Bitrate)</option>
                            <option value="medium">Balanced (Standard)</option>
                            <option value="low">High Performance (Low Bandwidth)</option>
                        </select>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Surround Sound Mode */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Surround Sound Mode</div>
                            <p className="text-sm text-foreground-muted mt-0.5">
                                Choose how multi-channel audio tracks (5.1 or 7.1) are mixed down for stereo speakers.
                            </p>
                        </div>
                        <select
                            value={settings.audioMixPreset}
                            onChange={(e) => updateSetting('audioMixPreset', e.target.value as any)}
                            className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                        >
                            <option value="auto">Adaptive Stereo (Recommended)</option>
                            <option value="itu">Standard Balanced (ITU BS.775)</option>
                            <option value="night">Clear Dialogue / Night Mode</option>
                            <option value="cinematic">Expanded Soundstage (Cinema)</option>
                            <option value="passthrough">Raw Passthrough (Direct)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Audio Profile Breakdown */}
            <div className="rounded-xl bg-background-secondary border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-black/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Volume2 className="w-5 h-5 text-accent-primary" />
                        <h3 className="font-semibold text-white">Audio Profiles Guide</h3>
                    </div>
                    <span className="text-xs text-foreground-muted">Downmix Reference</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-black/30 text-xs uppercase text-foreground-muted font-semibold border-b border-border">
                            <tr>
                                <th className="px-5 py-3 w-48">Profile</th>
                                <th className="px-5 py-3">Acoustic Profile & Behavior</th>
                                <th className="px-5 py-3 w-28 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {[
                                { key: 'auto', name: 'Adaptive Stereo', desc: 'Retains original stereo audio without alteration; automatically blends surround channels into clean 2-channel sound.' },
                                { key: 'itu', name: 'Standard Balanced', desc: 'Conforms to studio mixing coefficients for natural speaker and headphone listening.' },
                                { key: 'night', name: 'Clear Dialogue', desc: 'Amplifies voice clarity and limits explosive low frequencies for comfortable low-volume listening.' },
                                { key: 'cinematic', name: 'Expanded Soundstage', desc: 'Widens spatial dynamics and enriches depth for movies and action sequences.' },
                                { key: 'passthrough', name: 'Raw Passthrough', desc: 'Bypasses processing filters. Best when sending audio directly to an external surround receiver.' },
                            ].map((preset) => {
                                const isSelected = settings.audioMixPreset === preset.key;
                                return (
                                    <tr
                                        key={preset.key}
                                        onClick={() => updateSetting('audioMixPreset', preset.key as any)}
                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-primary/10' : 'hover:bg-white/5'}`}
                                    >
                                        <td className="px-5 py-3.5 font-medium text-white flex items-center gap-2">
                                            {preset.name}
                                        </td>
                                        <td className="px-5 py-3.5 text-foreground-secondary">
                                            {preset.desc}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            {isSelected ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
                                                    <Check className="w-3 h-3" /> Active
                                                </span>
                                            ) : (
                                                <span className="text-xs text-foreground-muted hover:text-white">
                                                    Select
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Stream Compatibility & Processing */}
            <div className="rounded-xl bg-background-secondary border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-black/20 flex items-center gap-2.5">
                    <Video className="w-5 h-5 text-accent-primary" />
                    <h3 className="font-semibold text-white">Stream Compatibility & Processing</h3>
                </div>

                <div className="p-6 space-y-6">
                    {/* Intelligent Transcoding */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">
                                Intelligent Transcoding
                            </div>
                            <p className="text-sm text-foreground-muted mt-1">
                                Automatically inspects incoming feeds and only invokes conversion when your browser cannot decode the format natively.
                            </p>
                        </div>
                        <button
                            onClick={() => updateSetting('autoTranscode', !settings.autoTranscode)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.autoTranscode ? 'bg-accent-primary' : 'bg-white/10'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.autoTranscode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Convert Audio to Stereo AAC */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">
                                Convert Audio to Stereo AAC
                            </div>
                            <p className="text-sm text-foreground-muted mt-1">
                                Solves silent audio on channels that broadcast Dolby AC3, EAC3, or DTS by converting sound to standard AAC.
                            </p>
                            {overrideCount > 0 && (
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                    <span className="text-foreground-muted">
                                        {overrideCount} channel{overrideCount === 1 ? '' : 's'} with custom settings
                                    </span>
                                    <span>•</span>
                                    <button
                                        onClick={clearAllChannelOverrides}
                                        className="text-accent-primary hover:underline cursor-pointer"
                                    >
                                        Reset all channels
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => updateSetting('forceAudioTranscode', !settings.forceAudioTranscode)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${settings.forceAudioTranscode ? 'bg-accent-primary' : 'bg-white/10'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.forceAudioTranscode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Full Video Re-encoding */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Full Video Re-encoding</div>
                            <p className="text-sm text-foreground-muted mt-1">
                                Converts feeds to universal H.264 video. Enable if HEVC (H.265) or legacy MPEG-2 sources show a blank screen.
                            </p>
                        </div>
                        <button
                            onClick={() => updateSetting('forceVideoTranscode', !settings.forceVideoTranscode)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.forceVideoTranscode ? 'bg-accent-primary' : 'bg-white/10'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.forceVideoTranscode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Direct Container Remuxing */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Direct Container Remuxing</div>
                            <p className="text-sm text-foreground-muted mt-1">
                                Restructures MPEG-TS and MKV streams into fragmented MP4 instantly with zero quality loss and near-zero CPU usage.
                            </p>
                        </div>
                        <button
                            onClick={() => updateSetting('forceRemux', !settings.forceRemux)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.forceRemux ? 'bg-accent-primary' : 'bg-white/10'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.forceRemux ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Live Stream Delivery Protocol */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Live Stream Delivery Protocol</div>
                            <p className="text-sm text-foreground-muted mt-0.5">
                                Select stream format for Xtream IPTV channels. Try MPEG-TS if HLS causes buffering or repeating loops.
                            </p>
                        </div>
                        <select
                            value={settings.streamOutputFormat}
                            onChange={(e) => updateSetting('streamOutputFormat', e.target.value as any)}
                            className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                        >
                            <option value="m3u8">HLS Playlist (.m3u8)</option>
                            <option value="ts">MPEG-TS Stream (.ts)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Network Tunneling */}
            <div className="rounded-xl bg-background-secondary border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-black/20 flex items-center gap-2.5">
                    <Network className="w-5 h-5 text-accent-primary" />
                    <h3 className="font-semibold text-white">Network Tunneling</h3>
                </div>

                <div className="p-6">
                    {/* Relay Through Local Server Proxy */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="max-w-lg">
                            <div className="font-medium text-white">Relay Through Local Server Proxy</div>
                            <p className="text-sm text-foreground-muted mt-1">
                                Routes media segment requests through the Deck TV local server to inject CORS headers and bypass provider firewall blocks.
                            </p>
                        </div>
                        <button
                            onClick={() => updateSetting('forceBackendProxy', !settings.forceBackendProxy)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.forceBackendProxy ? 'bg-accent-primary' : 'bg-white/10'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.forceBackendProxy ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Generous bottom spacing */}
            <div className="h-16" aria-hidden="true" />
        </div>
    );
}

function PlayerTab() {
    // Shared state with VideoPlayer via localStorage
    const [settings, setSettings] = useState<{
        enableWorker: boolean;
        externalPlayer: string;
    }>({
        enableWorker: true,
        externalPlayer: 'browser'
    });

    useEffect(() => {
        try {
            const saved = localStorage.getItem('deck-tv-player-settings');
            if (saved) setSettings(JSON.parse(saved));
        } catch (e) { }
    }, []);

    const saveSettings = (newSettings: typeof settings) => {
        setSettings(newSettings);
        localStorage.setItem('deck-tv-player-settings', JSON.stringify(newSettings));
    };

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h2 className="text-xl font-semibold">Player Configuration</h2>
                <p className="text-foreground-muted text-sm">Fine-tune video playback performance and external integrations</p>
            </div>

            <div className="p-6 rounded-xl bg-background-secondary border border-border space-y-6">
                {/* Hardware Acceleration / Worker */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                            Hardware Acceleration
                            <span className="text-xs bg-accent-primary/20 text-accent-primary px-2 py-0.5 rounded">Recommended</span>
                        </div>
                        <p className="text-sm text-foreground-muted mt-1 max-w-lg">
                            Enables HLS Web Worker to offload stream processing from the main thread.
                            This allows smoother playback and helps the browser utilize hardware decoding more effectively.
                        </p>
                    </div>
                    <button
                        onClick={() => saveSettings({ ...settings, enableWorker: !settings.enableWorker })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.enableWorker ? 'bg-accent-primary' : 'bg-white/10'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enableWorker ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="h-px bg-border/50" />

                {/* External Player Configuration */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold text-white">External Player Integration</div>
                        <p className="text-sm text-foreground-muted mt-1 max-w-lg">
                            Choose how the "Play in External Player" button behaves.
                            Depending on your OS, protocol links (vlc://, potplayer://) may require manual registration or specific player versions.
                        </p>
                    </div>
                    <select
                        value={settings.externalPlayer || 'browser'}
                        onChange={(e) => saveSettings({ ...settings, externalPlayer: e.target.value })}
                        className="bg-background-tertiary border border-border text-white text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block p-2.5 min-w-[200px]"
                    >
                        <option value="browser">Open URL (Default)</option>
                        <option value="vlc">VLC (vlc://)</option>
                        <option value="potplayer">PotPlayer (potplayer://)</option>
                        <option value="iina">IINA (iina://)</option>
                        <option value="download_m3u">Download Playlist (.m3u)</option>
                    </select>
                </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200">
                <p className="font-semibold mb-1">Note on External Players:</p>
                <p>
                    If protocol links don't work, ensure your player is installed and associated with the protocol, or use the "Download Playlist" option which works universally.
                </p>
            </div>

            <div className="h-16" aria-hidden="true" />
        </div>
    );
}


function PlaylistsTab() {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [formType, setFormType] = useState<'M3U' | 'XTREAM'>('M3U');
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [xmltvUrl, setXmltvUrl] = useState('');
    const [server, setServer] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [playlists, setPlaylists] = useState<PlaylistSource[]>([]);

    // Fetch playlists from server
    const fetchPlaylists = async () => {
        try {
            const res = await fetch('/api/setup/source');
            const data = await res.json();
            if (data.sources) {
                setPlaylists(data.sources);
            }
        } catch (e) {
            console.error("Failed to fetch playlists from server", e);
        }
    };

    useEffect(() => {
        fetchPlaylists();
    }, []);

    // const playlists = useLiveQuery(() => db.playlistSources.toArray()); // Removed Dexie query

    const refreshPlaylist = async (source: PlaylistSource) => {
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        setProgress(`Refreshing ${source.name}...`);

        try {
            const res = await fetch(`/api/setup/sync?id=${source.id}`, { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');

            const data = await res.json();

            // Re-fetch list to get latest stats
            await fetchPlaylists();
            setSuccess(`Playlist refreshed! Found ${data.count} channels.`);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        } finally {
            setIsLoading(false);
            setProgress('');
        }
    };


    const handleEdit = (playlist: PlaylistSource) => {
        setEditingId(playlist.id);
        setFormType(playlist.type);
        setName(playlist.name);

        if (playlist.type === 'M3U') {
            setUrl(playlist.url || '');
            setXmltvUrl(playlist.xmltvUrl || '');
        } else {
            setServer(playlist.server || '');
            setUsername(playlist.username || '');
            setPassword(playlist.password || '');
        }
        setShowAddForm(true);
        setError(null);
        setSuccess(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setShowAddForm(false);
        setName('');
        setUrl('');
        setXmltvUrl('');
        setServer('');
        setUsername('');
        setPassword('');
        setError(null);
        setSuccess(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        setProgress('Saving playlist to server...');

        try {
            const body: any = {
                name,
                type: formType,
            };

            if (formType === 'M3U') {
                if (!url) throw new Error('URL is required');
                body.url = url;
                body.epgUrl = xmltvUrl || undefined;
            } else {
                if (!server || !username || !password) throw new Error('All fields are required');
                body.server = server;
                body.username = username;
                body.password = password;
                // Construct URL for Xtream if needed by server, or server handles it from fields
                // The current API expects 'url' to be the M3U url or generic? 
                // Let's check API route: it expects 'url', 'username', 'password'.
                // Ideally for Xtream, 'url' field typically stores the server base URL.
                body.url = server;
            }

            if (editingId) {
                // If editing, we currently don't have a specific update endpoint that preserves ID easily in provided code
                // But we can add a 'id' field to body and handle it in backend if we update backend.
                // For now, let's treat it as a new add or handle update if supported.
                // Re-adding might be safest for "start fresh".
                body.id = editingId; // Pass ID to help backend potentially
            }

            const res = await fetch('/api/setup/source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save playlist');

            setSuccess(`Playlist saved! Synced ${data.stats?.channels || 0} channels.`);
            setShowAddForm(false);
            setEditingId(null);

            // Trigger local refresh (if we still need local state, but we really don't want local state anymore!)
            // We should reload page or refetch list?
            // "playlists" variable comes from useLiveQuery(db.playlistSources).
            // BUT db.playlistSources is client side Dexie! 
            // If we save to Server, Dexie won't see it!
            // WE MUST ALSO SYNC TO LOCAL DEXIE JUST FOR SETTINGS VIEW? 
            // OR change Settings View to fetch from Server?

            // Ideally, Settings View should fetch list from server.
            // But for now, to keep UI consistent without rewriting entire page in one go:
            // We can just reload window to see if anything updates (it won't).
            // Request to Fetch sources from server?

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save playlist');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this playlist and all its channels? This will clear it from the Server.')) return;

        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch(`/api/setup/source?id=${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }

            // Re-fetch list
            await fetchPlaylists();
            setSuccess('Playlist deleted from server');

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to delete playlist');
        } finally {
            setIsLoading(false);
        }
    };

    // Favorites Sync Logic
    const [localFavCount, setLocalFavCount] = useState(0);
    const [isSyncingFavs, setIsSyncingFavs] = useState(false);

    // Migration Logic (Restore from Local to Server)
    const [isMigrating, setIsMigrating] = useState(false);
    // const playlists = useLiveQuery(() => db.playlistSources.toArray()); // Removed duplicate

    useEffect(() => {
        db.channels.where('favorite').equals(1).count().then(setLocalFavCount);
    }, []);

    const syncFavoritesToServer = async () => {
        setIsSyncingFavs(true);
        setError(null);
        setSuccess(null);
        try {
            const favorites = await db.channels.where('favorite').equals(1).toArray();
            const channelIds = favorites.map(c => c.id);

            const res = await fetch('/api/channels/favorites/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelIds })
            });

            if (!res.ok) throw new Error('Failed to sync favorites');

            setSuccess(`Successfully synced ${channelIds.length} favorites to server!`);

        } catch (err) {
            setError('Failed to sync favorites to server');
            console.error(err);
        } finally {
            setIsSyncingFavs(false);
        }
    };

    const migrateToServer = async () => {
        if (!playlists || playlists.length === 0) return;
        if (!confirm('This will upload all your local playlist configurations to the server. Continue?')) return;

        setIsMigrating(true);
        setError(null);
        setSuccess(null);
        setProgress('Restoring playlists to server...');

        try {
            const res = await fetch('/api/setup/migrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sources: playlists })
            });

            if (!res.ok) throw new Error('Failed to migrate playlists');

            setSuccess('Successfully restored playlists to server! Please wait while the server processes them...');

            // Trigger a refresh/sync on the server for each source?
            // For now, let's just ask the user to refresh or re-sync individual playlists if needed.
            // But ideally, the server should auto-sync.

        } catch (err) {
            setError('Failed to restore playlists');
            console.error(err);
        } finally {
            setIsMigrating(false);
            setProgress('');
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold mb-1">Playlist Sources</h2>
                    <p className="text-foreground-secondary text-sm">
                        Manage your IPTV playlists (M3U or Xtream Codes)
                    </p>
                </div>
                {/* ... Add Playlist Button ... */}
                <button
                    onClick={() => {
                        cancelEdit();
                        setShowAddForm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary-hover transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Playlist
                </button>
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm flex items-center gap-2">
                    <X className="w-4 h-4" />
                    {error}
                </div>
            )}

            {success && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {success}
                </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-background-secondary p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
                        <Loader2 className="w-12 h-12 text-accent-primary animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Processing Playlist</h3>
                        <p className="text-foreground-secondary">{progress}</p>
                    </div>
                </div>
            )}

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="bg-background-secondary p-6 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold">
                            {editingId ? 'Edit Playlist' : 'Add New Playlist'}
                        </h3>
                        <button onClick={cancelEdit} className="p-2 hover:bg-background-tertiary rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Type Selection */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <button
                                type="button"
                                onClick={() => setFormType('M3U')}
                                className={`p-4 rounded-xl border-2 transition-all text-center ${formType === 'M3U'
                                    ? 'border-accent-primary bg-accent-primary/5 text-accent-primary'
                                    : 'border-border hover:border-foreground-muted'
                                    }`}
                            >
                                <Globe className="w-6 h-6 mx-auto mb-2" />
                                <div className="font-semibold">M3U List</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormType('XTREAM')}
                                className={`p-4 rounded-xl border-2 transition-all text-center ${formType === 'XTREAM'
                                    ? 'border-accent-primary bg-accent-primary/5 text-accent-primary'
                                    : 'border-border hover:border-foreground-muted'
                                    }`}
                            >
                                <Server className="w-6 h-6 mx-auto mb-2" />
                                <div className="font-semibold">Xtream Codes</div>
                            </button>
                        </div>

                        {/* Common Fields */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Playlist Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="My IPTV"
                                className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                required
                            />
                        </div>

                        {/* M3U Specific */}
                        {formType === 'M3U' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium mb-1">M3U URL</label>
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="http://example.com/playlist.m3u"
                                        className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">XMLTV URL (Optional)</label>
                                    <input
                                        type="url"
                                        value={xmltvUrl}
                                        onChange={(e) => setXmltvUrl(e.target.value)}
                                        placeholder="http://example.com/epg.xml"
                                        className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                    />
                                    <p className="text-xs text-foreground-muted mt-1">
                                        If your provider supplies a separate EPG URL, enter it here.
                                    </p>
                                </div>
                            </>
                        )}

                        {/* Xtream Specific */}
                        {formType === 'XTREAM' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Server URL</label>
                                    <input
                                        type="url"
                                        value={server}
                                        onChange={(e) => setServer(e.target.value)}
                                        placeholder="http://server-address:port"
                                        className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg bg-background-tertiary border border-border focus:border-accent-primary focus:outline-none"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-4 py-2 rounded-lg bg-background-tertiary hover:bg-background-hover transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex items-center gap-2 px-6 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary-hover transition-colors disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {editingId ? 'Update Playlist' : 'Add Playlist'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Playlists Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {playlists?.map((playlist) => (
                    <div
                        key={playlist.id}
                        className="bg-background-secondary p-4 rounded-xl border border-border group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-background-tertiary flex items-center justify-center">
                                    {playlist.type === 'M3U' ? (
                                        <Globe className="w-5 h-5 text-accent-primary" />
                                    ) : (
                                        <Server className="w-5 h-5 text-accent-primary" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-semibold">{playlist.name}</h3>
                                    <span className="text-xs text-foreground-secondary px-2 py-0.5 rounded bg-white/5">
                                        {playlist.type}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => refreshPlaylist(playlist)}
                                    className="p-2 text-foreground-muted hover:text-accent-primary hover:bg-white/5 rounded-lg transition-colors"
                                    title="Refresh Playlist"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleEdit(playlist)}
                                    className="p-2 text-foreground-muted hover:text-blue-500 hover:bg-white/5 rounded-lg transition-colors"
                                    title="Edit Playlist"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(playlist.id)}
                                    className="p-2 text-foreground-muted hover:text-red-500 hover:bg-white/5 rounded-lg transition-colors"
                                    title="Delete Playlist"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-foreground-secondary mb-4">
                            <div className="flex items-center gap-2">
                                <Tv className="w-4 h-4 text-foreground-muted" />
                                <span>{playlist.channelCount || 0} Channels</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-foreground-muted" />
                                <span>
                                    Synced: {playlist.lastSync ? new Date(playlist.lastSync).toLocaleDateString() : 'Never'}
                                </span>
                            </div>
                        </div>

                        {playlist.url && (
                            <div className="text-xs text-foreground-muted truncate">
                                {playlist.url}
                            </div>
                        )}
                        {playlist.server && (
                            <div className="text-xs text-foreground-muted truncate">
                                Server: {playlist.server}
                            </div>
                        )}
                    </div>
                ))}

                {(!playlists || playlists.length === 0) && !showAddForm && (
                    <div className="col-span-full py-12 text-center text-foreground-muted border-2 border-dashed border-border rounded-xl">
                        <p>No playlists added yet.</p>
                        <p className="text-sm mt-1">Click "Add Playlist" to get started.</p>
                    </div>
                )}
            </div>

            {/* EPG Sources Section */}
            <div className="border-t border-border pt-8">
                <EPGTab />
            </div>

            {/* Local Sync & Server Restore Utilities */}
            {((localFavCount > 0) || (playlists && playlists.length > 0)) && (
                <div className="border-t border-border pt-8 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                            Sync &amp; Server Recovery
                        </h3>
                        <p className="text-xs text-foreground-muted mt-0.5">
                            Tools for pushing locally cached favorites or playlist configurations back to the server database.
                        </p>
                    </div>

                    <div className="flex gap-4 flex-wrap">
                        {/* Favorites Sync */}
                        {localFavCount > 0 && (
                            <div className="flex-1 min-w-[300px] p-4 bg-accent-primary/10 border border-accent-primary/30 rounded-xl flex items-center justify-between gap-4">
                                <div>
                                    <h4 className="font-semibold text-accent-primary">Local Favorites Found</h4>
                                    <p className="text-sm text-foreground-secondary mt-0.5">
                                        {localFavCount} favorites found in your browser&apos;s local storage. Sync them to the server so they persist across devices.
                                    </p>
                                </div>
                                <button
                                    onClick={syncFavoritesToServer}
                                    disabled={isSyncingFavs}
                                    className="shrink-0 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 font-medium text-sm"
                                >
                                    {isSyncingFavs ? 'Syncing...' : 'Sync to Server'}
                                </button>
                            </div>
                        )}

                        {/* Full Restore/Migration */}
                        {playlists && playlists.length > 0 && (
                            <div className="flex-1 min-w-[300px] p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between gap-4">
                                <div>
                                    <h4 className="font-semibold text-blue-500">Restore Configuration</h4>
                                    <p className="text-sm text-foreground-secondary mt-0.5">
                                        Re-uploads your current playlist source URLs and credentials to the server database. Useful if your server database was reset or you are migrating to a new server.
                                    </p>
                                </div>
                                <button
                                    onClick={migrateToServer}
                                    disabled={isMigrating}
                                    className="shrink-0 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium text-sm"
                                >
                                    {isMigrating ? 'Restoring...' : 'Restore to Server'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

}

function EPGTab() {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [refreshInterval, setRefreshInterval] = useState(6);

    // EPG sources from server
    const [epgSources, setEpgSources] = useState<any[]>([]);

    // Fetch EPG sources from server
    const fetchSources = async () => {
        try {
            const res = await fetch('/api/setup/epg');
            if (res.ok) {
                const data = await res.json();
                setEpgSources(data.sources || []);
            }
        } catch (err) {
            console.error('Failed to fetch EPG sources:', err);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    const refreshSource = async (source: any) => {
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        setProgress(`Syncing ${source.name}... This may take a few minutes for large EPG files.`);

        try {
            const res = await fetch('/api/setup/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: source.id })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Sync failed');
            }

            setSuccess(`Synced ${source.name}: ${data.count || 0} programs loaded`);
            await fetchSources(); // Refresh the list

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to sync EPG');
        } finally {
            setIsLoading(false);
            setProgress('');
        }
    };

    const handleEdit = (source: any) => {
        setEditingId(source.id);
        setName(source.name);
        setUrl(source.url);
        setRefreshInterval(source.refreshInterval || 6);
        setShowAddForm(true);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setShowAddForm(false);
        setName('');
        setUrl('');
        setRefreshInterval(6);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (editingId) {
                // Update existing source via server API
                setProgress('Updating EPG source...');
                const res = await fetch('/api/setup/epg', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editingId, name, url, refreshInterval })
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to update');
                }

                setSuccess('EPG source updated. Click refresh to load new data.');
                cancelEdit();
                await fetchSources();
            } else {
                // Add new source via server API (will auto-sync)
                setProgress('Adding EPG source and starting sync... This may take a few minutes.');
                const res = await fetch('/api/setup/epg', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name || 'XMLTV EPG', url, refreshInterval, syncNow: true })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Failed to add EPG source');
                }

                if (data.syncError) {
                    setSuccess(`EPG source added but sync failed: ${data.syncError}. Try refreshing manually.`);
                } else {
                    setSuccess(`EPG source added with ${data.programCount} programs`);
                }

                cancelEdit();
                await fetchSources();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsLoading(false);
            setProgress('');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this EPG source and all its programs?')) return;
        try {
            const res = await fetch(`/api/setup/epg?id=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }
            setSuccess('EPG source deleted');
            await fetchSources();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete source');
        }
    };

    const formatSyncDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold mb-1">EPG Sources</h2>
                    <p className="text-sm text-foreground-muted">Add XMLTV or EPG URLs for the program guide.</p>
                </div>
                <button
                    onClick={() => {
                        cancelEdit();
                        setShowAddForm(!showAddForm);
                    }}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white font-medium transition-colors text-sm"
                >
                    {showAddForm ? 'Cancel' : '+ Add EPG'}
                </button>
            </div>
            {/* Status Messages */}
            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
            )}
            {success && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{success}</div>
            )}
            {progress && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {progress}
                </div>
            )}
            {/* Add/Edit Form */}
            {showAddForm && (
                <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-background-secondary border border-border space-y-4">
                    <h3 className="font-medium">{editingId ? 'Edit EPG Source' : 'Add EPG Source'}</h3>
                    <div>
                        <label className="block text-sm font-medium mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., MyEPG.top"
                            className="w-full bg-background-tertiary border border-border rounded-lg py-2 px-3 text-foreground focus:outline-none focus:border-accent-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">XMLTV URL</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="http://example.com/epg.xml"
                            required
                            className="w-full bg-background-tertiary border border-border rounded-lg py-2 px-3 text-foreground focus:outline-none focus:border-accent-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Refresh Interval (hours)</label>
                        <input
                            type="number"
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 6)}
                            min={1}
                            max={72}
                            className="w-32 bg-background-tertiary border border-border rounded-lg py-2 px-3 text-foreground focus:outline-none focus:border-accent-primary"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={isLoading || !url}
                            className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white font-medium transition-colors text-sm disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : editingId ? 'Save Changes' : 'Add & Sync'}
                        </button>
                        <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-4 py-2 rounded-lg bg-background-tertiary hover:bg-background-hover text-foreground font-medium transition-colors text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* EPG Sources List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {epgSources.map(source => (
                    <div
                        key={source.id}
                        className="flex items-center gap-4 p-4 rounded-xl bg-background-secondary border border-border"
                    >
                        <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-accent-primary" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <div className="font-medium truncate">{source.name}</div>
                            <div className="text-xs text-foreground-muted truncate">
                                {source.programCount.toLocaleString()} programs â€¢ Every {source.refreshInterval}h
                            </div>
                            <div className="text-xs text-foreground-muted mt-0.5">
                                Synced: {formatSyncDate(source.lastSync)}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => refreshSource(source)}
                                disabled={isLoading}
                                className="p-2 text-foreground-muted hover:text-accent-primary hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={() => handleEdit(source)}
                                className="p-2 text-foreground-muted hover:text-blue-500 hover:bg-white/5 rounded-lg transition-colors"
                                title="Edit"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleDelete(source.id)}
                                className="p-2 text-foreground-muted hover:text-red-500 hover:bg-white/5 rounded-lg transition-colors"
                                title="Delete"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {epgSources.length === 0 && !showAddForm && (
                    <div className="col-span-full py-12 text-center text-foreground-muted border-2 border-dashed border-border rounded-xl">
                        <p>No EPG sources added yet.</p>
                        <p className="text-sm mt-1">Add a source to populate the guide.</p>
                    </div>
                )}
            </div>
        </div>
    );
}


function DVRTab() {
    // Load recording path setting
    const pathSetting = useLiveQuery(
        () => db.settings.where('key').equals('dvrOutputPath').first()
    );

    const [recordingPath, setRecordingPath] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (pathSetting) {
            setRecordingPath(pathSetting.value);
        }
    }, [pathSetting]);

    const handleSavePath = async () => {
        setIsSaving(true);
        try {
            const existing = await db.settings.where('key').equals('dvrOutputPath').first();
            if (existing) {
                await db.settings.update(existing.id, { value: recordingPath });
            } else {
                await db.settings.add({
                    id: generateId(),
                    key: 'dvrOutputPath',
                    value: recordingPath
                });
            }
        } catch (e) {
            console.error("Failed to save path", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">DVR Configuration</h2>
                <p className="text-foreground-muted text-sm">Configure recording settings</p>
            </div>

            <div className="p-6 rounded-xl bg-background-secondary border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <HardDrive className="w-6 h-6 text-accent-primary" />
                    <div>
                        <div className="font-medium">Recording Output</div>
                        <div className="text-sm text-foreground-muted">Configure where recordings are saved</div>
                    </div>
                </div>
                <p className="text-sm text-foreground-muted mb-4">
                    Recordings require FFmpeg to be installed on your system. The DVR backend will save
                    recordings to your configured output folder.
                </p>
                <div className="flex gap-2 items-start">
                    <div className="flex-1">
                        <FolderPicker
                            value={recordingPath}
                            onChange={(path) => setRecordingPath(path)}
                            placeholder="Select output folder..."
                        />
                    </div>
                    <button
                        onClick={handleSavePath}
                        disabled={isSaving}
                        className="btn-primary whitespace-nowrap h-[38px]"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
                <p className="text-xs text-foreground-muted mt-2">
                    Note: Ensure the backend process has write permissions to this folder.
                </p>
            </div>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200">
                <p className="font-semibold mb-1">Looking for your recordings?</p>
                <p>
                    Go to the <strong>Recordings</strong> tab in the main player application to view, manage, and play your recordings.
                </p>
            </div>
        </div>
    );
}


function BackupTab() {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleExport = async () => {
        setIsExporting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/setup/export');
            if (!res.ok) throw new Error('Failed to fetch backup data from server');

            const data = await res.json();

            // Include client-side preferences and Dexie settings
            try {
                const transcodingSettingsStr = localStorage.getItem('deck-tv-transcoding-settings');
                if (transcodingSettingsStr) {
                    data.transcodingSettings = JSON.parse(transcodingSettingsStr);
                }

                const playerSettingsStr = localStorage.getItem('deck-tv-player-settings');
                if (playerSettingsStr) {
                    data.playerSettings = JSON.parse(playerSettingsStr);
                }

                const favoritesSort = localStorage.getItem('decktv:favorites_sort');
                if (favoritesSort) {
                    data.favoritesSort = favoritesSort;
                }

                const dexieSettings = await db.settings.toArray();
                if (dexieSettings && dexieSettings.length > 0) {
                    data.dexieSettings = dexieSettings;
                }
            } catch (err) {
                console.warn('Failed to attach client settings to export:', err);
            }

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `deck-tv-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage({ type: 'success', text: 'Backup exported successfully!' });
        } catch (error) {
            console.error('Export failed:', error);
            setMessage({ type: 'error', text: 'Failed to create backup.' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setIsImporting(true);
        setMessage(null);

        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);

                // Call server restore endpoint
                const res = await fetch('/api/setup/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(json)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Failed to restore backup');
                }

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
                    console.warn('Failed to restore client-side preferences:', clientErr);
                }

                const counts = data.counts || {};
                const parts: string[] = [];
                if (counts.playlists !== undefined) parts.push(`${counts.playlists} Playlists`);
                if (counts.favorites !== undefined) parts.push(`${counts.favorites} Favorites`);
                if (counts.customGroups !== undefined) parts.push(`${counts.customGroups} Custom Groups`);
                if (counts.customGroupItems !== undefined) parts.push(`${counts.customGroupItems} Group Items`);
                if (counts.settings !== undefined) parts.push(`${counts.settings} Settings`);

                const msg = parts.length > 0 ? parts.join(', ') : 'All configurations';

                setMessage({ type: 'success', text: `Success! Restored: ${msg}. Refreshing...` });
                setTimeout(() => window.location.reload(), 2000);

            } catch (error) {
                console.error('Import failed:', error);
                setMessage({ type: 'error', text: 'Failed to restore backup. Invalid file?' });
            } finally {
                setIsImporting(false);
            }
        };

        reader.readAsText(file);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Backup & Restore</h2>
                <p className="text-foreground-muted text-sm">Save and restore your playlists, favorites, custom groups, player settings, and configurations</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export Card */}
                <div className="p-6 rounded-xl bg-background-secondary border border-border flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-accent-primary/10 flex items-center justify-center">
                        <Save className="w-8 h-8 text-accent-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Export Backup</h3>
                        <p className="text-sm text-foreground-muted mt-1">
                            Download a JSON file containing playlists, favorites, custom groups, and player/stream configurations.
                        </p>
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="btn-primary w-full flex items-center justify-center gap-2 mt-auto"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Download Backup
                    </button>
                </div>

                {/* Import Card */}
                <div className="p-6 rounded-xl bg-background-secondary border border-border flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <HardDrive className="w-8 h-8 text-blue-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Restore Backup</h3>
                        <p className="text-sm text-foreground-muted mt-1">
                            Upload a previously exported JSON file to restore all playlists, favorites, custom groups, and configurations.
                        </p>
                    </div>
                    <label className="btn-primary w-full flex items-center justify-center gap-2 mt-auto cursor-pointer bg-blue-600 hover:bg-blue-700">
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                        <span>Restore from File</span>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleImport}
                            className="hidden"
                            disabled={isImporting}
                        />
                    </label>
                </div>
            </div>

            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                    {message.text}
                </div>
            )}
        </div>
    );
}

interface NetworkStatus {
    allowRemote: boolean;
    currentHost: string;
    isListeningAll: boolean;
    port: number;
    localIp: string | null;
    allIps: { name: string; address: string; family: string }[];
    networkUrl: string | null;
    localUrl: string;
    isElectron: boolean;
    requiresRestart: boolean;
}

function NetworkTab() {
    const [status, setStatus] = useState<NetworkStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isRelaunching, setIsRelaunching] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAllIps, setShowAllIps] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/system/network');
            if (!res.ok) throw new Error('Failed to load network configuration');
            const data = await res.json();
            setStatus(data);
        } catch (e: any) {
            setError(e.message || 'Error loading network status');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleToggle = async () => {
        if (!status || isSaving) return;
        const targetValue = !status.allowRemote;
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/system/network', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowRemote: targetValue }),
            });
            if (!res.ok) throw new Error('Failed to update network setting');
            const updated = await res.json();
            setStatus(prev => prev ? {
                ...prev,
                allowRemote: updated.allowRemote,
                requiresRestart: updated.requiresRestart,
                networkUrl: updated.networkUrl || prev.networkUrl
            } : null);
        } catch (e: any) {
            setError(e.message || 'Error saving setting');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRelaunch = async () => {
        setIsRelaunching(true);
        setError(null);
        try {
            const res = await fetch('/api/system/network', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'relaunch' }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to restart application');
            }
        } catch (e: any) {
            setError(e.message || 'Failed to restart');
            setIsRelaunching(false);
        }
    };

    const handleCopy = (url: string) => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-foreground-muted">
                <Loader2 className="w-8 h-8 animate-spin text-accent-primary mb-3" />
                <p>Loading network configuration...</p>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300">
                <p className="font-semibold mb-1">Failed to load network settings</p>
                <p className="text-sm">{error || 'Unknown error occurred.'}</p>
                <button
                    onClick={fetchStatus}
                    className="mt-4 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white text-sm"
                >
                    Retry
                </button>
            </div>
        );
    }

    const isLiveOnNetwork = status.allowRemote && status.isListeningAll;
    const isPendingRestart = status.requiresRestart;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Network className="w-6 h-6 text-accent-primary" />
                    Network & Remote Sharing
                </h2>
                <p className="text-foreground-muted text-sm mt-0.5">
                    Stream live TV and access your DVR from phones, tablets, or smart TVs across your home Wi-Fi.
                </p>
            </div>

            {/* Restart Banner if Required */}
            {isPendingRestart && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-amber-300">Restart Required to Apply Network Changes</div>
                            <div className="text-xs text-amber-200/80 mt-0.5">
                                Changing network listener addresses requires the application server to rebind.
                                {status.isElectron
                                    ? ' Click the button to restart Deck TV and apply changes immediately.'
                                    : ' Please restart your terminal/batch script to apply changes.'}
                            </div>
                        </div>
                    </div>
                    {status.isElectron && (
                        <button
                            onClick={handleRelaunch}
                            disabled={isRelaunching}
                            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm transition-colors whitespace-nowrap flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
                        >
                            {isRelaunching ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Restarting...</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4" />
                                    <span>Restart Deck TV Now</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Error Notice */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Main Toggle Card */}
            <div className="p-6 rounded-xl bg-background-secondary border border-border space-y-5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${status.allowRemote ? 'bg-accent-primary/20 text-accent-primary' : 'bg-white/5 text-foreground-muted'}`}>
                            <Wifi className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-medium flex items-center gap-2">
                                <span>Allow Local Network Access</span>
                                {isLiveOnNetwork ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        Active on LAN
                                    </span>
                                ) : isPendingRestart ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                        Pending Restart
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-foreground-muted border border-white/10">
                                        Localhost Only
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
                                When enabled, Deck TV listens on all network interfaces (<code className="text-xs bg-black/40 px-1 py-0.5 rounded">0.0.0.0</code>) so any phone, tablet, or browser on your local Wi-Fi can connect.
                                When disabled, it binds exclusively to <code className="text-xs bg-black/40 px-1 py-0.5 rounded">127.0.0.1</code> for maximum privacy with zero network exposure.
                            </p>
                        </div>
                    </div>

                    {/* Switch */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={status.allowRemote}
                        disabled={isSaving}
                        onClick={handleToggle}
                        className={`
                            relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50
                            ${status.allowRemote ? 'bg-accent-primary' : 'bg-background-tertiary border-border'}
                        `}
                    >
                        <span
                            aria-hidden="true"
                            className={`
                                pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out
                                ${status.allowRemote ? 'translate-x-5' : 'translate-x-0'}
                            `}
                        />
                    </button>
                </div>

                {/* Connection Box when Remote is Allowed */}
                {status.allowRemote && (
                    <div className="pt-4 border-t border-border/60 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
                                Network Access Address
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                <div className="flex-1 flex items-center bg-background-tertiary border border-border rounded-lg px-3 py-2 text-foreground font-mono text-sm overflow-hidden">
                                    <Globe className="w-4 h-4 text-accent-primary mr-2 shrink-0" />
                                    <span className="truncate select-all">{status.networkUrl || `http://<your-local-ip>:${status.port}`}</span>
                                </div>
                                {status.networkUrl && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleCopy(status.networkUrl!)}
                                            className="px-3 py-2 rounded-lg bg-background-tertiary hover:bg-background-hover border border-border text-foreground text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="w-4 h-4 text-emerald-400" />
                                                    <span className="text-emerald-400">Copied!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-4 h-4 text-foreground-muted" />
                                                    <span>Copy URL</span>
                                                </>
                                            )}
                                        </button>
                                        <a
                                            href={status.networkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-background-tertiary hover:bg-background-hover border border-border text-foreground text-sm font-medium transition-colors flex items-center gap-1.5"
                                            title="Open in new browser tab"
                                        >
                                            <ExternalLink className="w-4 h-4 text-foreground-muted" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Extra network interfaces */}
                        {status.allIps && status.allIps.length > 1 && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowAllIps(!showAllIps)}
                                    className="text-xs text-accent-primary hover:underline flex items-center gap-1"
                                >
                                    {showAllIps ? 'Hide other network adapters' : `View all ${status.allIps.length} network adapters...`}
                                </button>

                                {showAllIps && (
                                    <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-background-tertiary/60 border border-border/50 text-xs">
                                        {status.allIps.map(ip => (
                                            <div key={ip.name + ip.address} className="flex items-center justify-between font-mono">
                                                <span className="text-foreground-muted">{ip.name}:</span>
                                                <span className="text-foreground select-all">http://{ip.address}:{status.port}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Quick Connection Guide */}
                        <div className="p-4 rounded-xl bg-background-tertiary/40 border border-border/60">
                            <h4 className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Smartphone className="w-4 h-4 text-accent-primary" />
                                How to connect other devices
                            </h4>
                            <ol className="text-xs text-foreground-muted space-y-1.5 list-decimal list-inside leading-relaxed">
                                <li>Ensure your phone, tablet, or smart TV is connected to the <strong>same Wi-Fi or LAN</strong> as this PC.</li>
                                <li>Open any web browser (Chrome, Safari, Firefox, Edge) on your device.</li>
                                <li>Type in the address: <code className="bg-black/50 px-1 py-0.5 rounded text-white font-mono select-all">{status.networkUrl || `http://<your-ip>:${status.port}`}</code></li>
                                <li>Channels, guide, and recordings will sync automatically!</li>
                            </ol>
                        </div>
                    </div>
                )}
            </div>

            {/* Performance & Security Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                        <Cpu className="w-5 h-5 text-accent-primary" />
                        <span>Performance & Resource Usage</span>
                    </div>
                    <ul className="text-xs text-foreground-muted space-y-1.5 leading-relaxed">
                        <li><strong>Idle State:</strong> Zero extra CPU/RAM overhead when listening on network.</li>
                        <li><strong>UI Navigation:</strong> Very lightweight; minimal impact on system performance.</li>
                        <li><strong>Active Streaming:</strong> Concurrent video streams consume Wi-Fi bandwidth. If video transcoding is required for player compatibility, FFmpeg will use host CPU/GPU power.</li>
                    </ul>
                </div>

                <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                        <ShieldCheck className="w-5 h-5 text-accent-primary" />
                        <span>Security & Privacy</span>
                    </div>
                    <ul className="text-xs text-foreground-muted space-y-1.5 leading-relaxed">
                        <li><strong>Zero Configuration:</strong> Designed for effortless streaming on private home networks.</li>
                        <li><strong>No Authentication:</strong> Anyone connected to your local Wi-Fi who opens the URL can view channels and DVR recordings.</li>
                        <li><strong>Recommendation:</strong> Keep disabled when connected to untrusted public Wi-Fi (e.g. coffee shops, hotels, airports).</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

function AboutTab() {
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || packageInfo.version || '1.0.0';
    const appTier = (process.env.NEXT_PUBLIC_APP_TIER || 'diy').toLowerCase();

    return (
        <div className="space-y-8 pb-16">
            {/* Hero Header */}
            <div className="text-center py-6 px-4 rounded-2xl bg-gradient-to-b from-accent-primary/10 via-background-secondary to-background-secondary border border-border">
                <img src="/logo.svg" alt="Deck TV" className="h-16 w-auto max-w-sm object-contain mx-auto mb-4 select-none drop-shadow-md" />
                <p className="text-foreground-secondary text-base max-w-xl mx-auto leading-relaxed">
                    A centralized IPTV server, background DVR scheduler, and modern media player built for high-performance home streaming.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-primary/20 text-accent-primary border border-accent-primary/30 font-mono">
                        <Sparkles className="w-3.5 h-3.5" /> v{appVersion}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-foreground-secondary border border-white/10 uppercase tracking-wide">
                        {appTier === 'exe' ? 'Desktop App' : 'DIY Edition'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-foreground-secondary border border-white/10">
                        Next.js 16
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-foreground-secondary border border-white/10">
                        React 19
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-foreground-secondary border border-white/10">
                        FFmpeg Watchdog
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-foreground-secondary border border-white/10">
                        SQLite + Dexie
                    </span>
                </div>
            </div>

            {/* GitHub Repository Card */}
            <div className="p-6 rounded-2xl bg-background-secondary border border-border/80 hover:border-accent-primary/50 transition-all shadow-md group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Github className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-white">GitHub Repository</h3>
                                <span className="text-xs bg-white/10 text-foreground-secondary px-2 py-0.5 rounded-full font-mono">
                                    mwongr/deck-tv
                                </span>
                            </div>
                            <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
                                Star the project, view source code, report issues, and follow release updates on GitHub.
                            </p>
                        </div>
                    </div>

                    <a
                        href="https://github.com/mwongr/deck-tv"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl font-medium shrink-0 bg-white text-black hover:bg-neutral-200 transition-colors shadow-sm"
                    >
                        <Github className="w-4 h-4 text-black" />
                        <span>Visit Repository</span>
                        <ExternalLink className="w-4 h-4 opacity-70" />
                    </a>
                </div>
            </div>

            {/* Core Capabilities Grid */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted px-1">
                    System Architecture & Capabilities
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <HardDrive className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">Centralized DVR & Background Scheduler</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            A robust background engine that monitors, schedules, and captures recordings via FFmpeg even when you aren&apos;t watching. Includes watchdog automatic recovery and custom storage directory selection.
                        </p>
                    </div>

                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Cpu className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">Hardware-Accelerated Transcoding</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            On-the-fly stream transcoding supporting NVIDIA NVENC, AMD AMF, Intel QuickSync, and VAAPI. Features adaptive dialogue boost and multi-channel downmixing (ITU, Cinema, Night Mode).
                        </p>
                    </div>

                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">My List & Custom Groups</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            Create tailored single-content or multi-channel custom groups across live TV, movies, and series with custom sorting, drag-and-drop reordering, and unified global search.
                        </p>
                    </div>

                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Radio className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">Interactive 24-Hour TV Guide</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            Multi-source XMLTV EPG synchronization paired with a responsive 24-hour visual guide timeline, program detail popovers, search, and instant one-click schedule recording.
                        </p>
                    </div>

                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Film className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">VOD Movie & Series Explorer</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            Dedicated movie and TV show library interfaces with rich metadata, poster cards, seasons/episodes browsing, and external player launching (VLC, MPC-HC, MPV).
                        </p>
                    </div>

                    <div className="p-5 rounded-xl bg-background-secondary border border-border space-y-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Database className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h4 className="font-semibold text-white">Dual-Layer Database & Full Backup</h4>
                        <p className="text-xs text-foreground-muted leading-relaxed">
                            Better-SQLite3 handles persistent server state, while Dexie IndexedDB powers lightning-fast client caching. Complete JSON export and restore keeps all playlists, favorites, custom groups, and settings intact.
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center space-y-2 pt-2 text-sm text-foreground-muted">
                <p className="flex items-center justify-center gap-1.5">
                    Developed with <Heart className="w-4 h-4 text-red-500 fill-red-500 inline" /> by{' '}
                    <a
                        href="https://github.com/mwongr/deck-tv"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-accent-primary font-medium underline underline-offset-4 transition-colors"
                    >
                        Mike
                    </a>
                </p>
                <p className="text-xs text-foreground-muted/70">
                    Deck TV is an open-source project intended for home and personal media streaming.
                </p>
                <div className="pt-2 flex justify-center">
                    <KofiButton />
                </div>
            </div>
        </div>
    );
}

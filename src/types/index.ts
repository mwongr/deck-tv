// Re-export database types
export type {
    Channel,
    Group,
    EPGProgram,
    DVRJob,
    PlaylistSource,
    EPGSource,
    Settings
} from '@/lib/db/schema';

// M3U Parser types
export interface M3UChannel {
    name: string;
    url: string;
    logo?: string;
    groupTitle?: string;
    tvgId?: string;
    tvgName?: string;
    catchup?: string;
    catchupDays?: number;
    catchupSource?: string;
    rating?: number | null;
}

export interface M3UParseResult {
    channels: M3UChannel[];
    groups: string[];
    totalLines: number;
    parseTime: number;
}

// Xtream Codes types
export interface XtreamCredentials {
    server: string;
    username: string;
    password: string;
}

export interface XtreamServerInfo {
    url: string;
    port: string;
    serverProtocol: string;
    userInfo: {
        username: string;
        password: string;
        status: string;
        expDate: string;
        isTrial: string;
        activeCons: string;
        createdAt: string;
        maxConnections: string;
        allowedOutputFormats: string[];
    };
}

export interface XtreamCategory {
    category_id: string;
    category_name: string;
    parent_id: number;
}

export interface XtreamLiveStream {
    num: number;
    name: string;
    stream_type: string;
    stream_id: number;
    stream_icon: string;
    epg_channel_id: string;
    added: string;
    category_id: string;
    category_name?: string; // Often included in get_live_streams response
    custom_sid: string;
    tv_archive: number;
    direct_source: string;
    tv_archive_duration: number | string; // Can be string in JSON
}

export interface XtreamVodStream {
    num: number;
    name: string;
    stream_type: string;
    stream_id: number;
    stream_icon: string;
    rating: string;
    rating_5based: number;
    added: string;
    category_id: string;
    container_extension: string;
    custom_sid: string;
    direct_source: string;
    // Movie specific fields
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    duration?: string;
    duration_secs?: number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    tmdb_id?: string;
}

export interface XtreamSeriesInfo {
    series_id: number;
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    last_modified: string;
    rating: string;
    rating_5based: number;
    backdrop_path: string[];
    youtube_trailer: string;
    episode_run_time: string;
    category_id: string;
}

// Episode info from get_series_info API
export interface XtreamEpisode {
    id: string;
    episode_num: number;
    title: string;
    container_extension: string;
    info: {
        name?: string;
        plot?: string;
        releasedate?: string;
        rating?: string;
        duration_secs?: number;
        duration?: string;
        movie_image?: string;
        bitrate?: number;
    };
    custom_sid: string;
    added: string;
    season: number;
    direct_source: string;
}

// Detailed series info including seasons and episodes
export interface XtreamSeriesDetails {
    seasons: {
        season_number: number;
        name: string;
        episode_count: number;
        cover?: string;
        air_date?: string;
    }[];
    info: {
        name: string;
        cover: string;
        plot: string;
        cast: string;
        director: string;
        genre: string;
        releaseDate: string;
        rating: string;
        rating_5based: number;
        backdrop_path: string[];
        youtube_trailer: string;
        episode_run_time: string;
        category_id: string;
    };
    episodes: {
        [seasonNumber: string]: XtreamEpisode[];
    };
}

// XMLTV types
export interface XMLTVChannel {
    id: string;
    displayName: string;
    displayNames: string[];
    icon?: string;
}

export interface XMLTVProgramme {
    channel: string;
    start: string;
    stop: string;
    title: string;
    desc?: string;
    category?: string;
    icon?: string;
}

// Player types
export interface PlayerState {
    isPlaying: boolean;
    isPaused: boolean;
    isLoading: boolean;
    isMuted: boolean;
    volume: number;
    currentTime: number;
    duration: number;
    quality: string;
    availableQualities: string[];
    error?: string;
}

// UI State types
export interface UIState {
    selectedGroupId: string | null;
    selectedChannelId: string | null;
    isSearchOpen: boolean;
    searchQuery: string;
    isSidebarCollapsed: boolean;
    isFullscreen: boolean;
}

// Worker message types
export interface WorkerMessage {
    type: 'PARSE_M3U' | 'PARSE_XMLTV' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
    payload?: unknown;
}

export interface ParseProgress {
    stage: 'downloading' | 'parsing' | 'saving';
    current: number;
    total: number;
    message: string;
}

// Transcoding Settings types
export type HardwareEncoder = 'auto' | 'nvenc' | 'amf' | 'qsv' | 'vaapi' | 'software';
export type MaxResolution = '4k' | '1080p' | '720p' | '480p';
export type QualityPreset = 'high' | 'medium' | 'low';
export type AudioMixPreset = 'auto' | 'itu' | 'night' | 'cinematic' | 'passthrough';
export type StreamOutputFormat = 'm3u8' | 'ts';

export interface TranscodingSettings {
    // Hardware Encoder
    hwEncoder: HardwareEncoder;
    maxResolution: MaxResolution;
    qualityPreset: QualityPreset;
    audioMixPreset: AudioMixPreset;
    // Stream Processing
    autoTranscode: boolean;
    forceAudioTranscode: boolean;
    forceVideoTranscode: boolean;
    forceRemux: boolean;
    streamOutputFormat: StreamOutputFormat;
    // Network & Player
    forceBackendProxy: boolean;
    enableWorker: boolean;
    externalPlayer: string;
}

export const DEFAULT_TRANSCODING_SETTINGS: TranscodingSettings = {
    hwEncoder: 'auto',
    maxResolution: '1080p',
    qualityPreset: 'medium',
    audioMixPreset: 'auto',
    autoTranscode: true,
    forceAudioTranscode: true,
    forceVideoTranscode: false,
    forceRemux: true,
    streamOutputFormat: 'm3u8',
    forceBackendProxy: false,
    enableWorker: true,
    externalPlayer: 'browser'
};

// Custom Group & Backup types
export interface CustomGroup {
    id: string;
    name: string;
    type: 'live' | 'movie' | 'series';
    sortOrder: number;
    createdAt?: string;
}

export interface CustomGroupItemRecord {
    id: string;
    customGroupId: string;
    channelId: string;
    tvgId?: string | null;
    name: string;
    sortOrder: number;
    createdAt?: string;
}

export interface BackupData {
    timestamp: string;
    version: number;
    playlistSources: any[];
    epgSources: any[];
    groups: any[];
    settings: any[];
    favorites: any[];
    channels?: any[];
    customGroups?: CustomGroup[];
    customGroupItems?: CustomGroupItemRecord[];
    transcodingSettings?: TranscodingSettings;
    playerSettings?: {
        enableWorker: boolean;
        externalPlayer: string;
    };
    favoritesSort?: string;
    dexieSettings?: Array<{ id: string; key: string; value: string }>;
}

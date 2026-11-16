import type {
    XtreamCredentials,
    XtreamServerInfo,
    XtreamCategory,
    XtreamLiveStream,
    XtreamVodStream,
    XtreamSeriesInfo,
    XtreamSeriesDetails
} from '@/types';

/**
 * Xtream Codes API Client
 * Handles authentication and data fetching from Xtream Codes servers
 */
export class XtreamClient {
    private credentials: XtreamCredentials;
    private baseUrl: string;

    constructor(credentials: XtreamCredentials) {
        this.credentials = credentials;
        // Normalize server URL
        let server = credentials.server.trim();
        if (!server.startsWith('http://') && !server.startsWith('https://')) {
            server = `http://${server}`;
        }
        if (server.endsWith('/')) {
            server = server.slice(0, -1);
        }
        this.baseUrl = server;
    }

    /**
     * Internal fetch wrapper to handle CORS via proxy
     */
    private async fetch(url: string): Promise<Response> {
        // If running in browser, use proxy to avoid CORS
        if (typeof window !== 'undefined') {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            return fetch(proxyUrl);
        }

        // Server-side: fetch directly with headers to mimic a player/browser
        const headers = {
            'User-Agent': 'IPTVSmartersPro/1.1.1 (iPad; iOS 12.2; Scale/2.00)',
            'Accept': '*/*'
        };

        return fetch(url, { headers });
    }

    /**
     * Build API URL with authentication
     */
    private buildUrl(action?: string): string {
        const { username, password } = this.credentials;
        let url = `${this.baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        if (action) {
            url += `&action=${action}`;
        }
        return url;
    }

    /**
     * Get server info and validate credentials
     */
    async getServerInfo(): Promise<XtreamServerInfo> {
        const url = this.buildUrl();
        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.user_info?.auth === 0) {
            throw new Error('Authentication failed: Invalid credentials');
        }

        return {
            url: data.server_info?.url || this.baseUrl,
            port: data.server_info?.port || '80',
            serverProtocol: data.server_info?.server_protocol || 'http',
            userInfo: {
                username: data.user_info?.username || '',
                password: data.user_info?.password || '',
                status: data.user_info?.status || '',
                expDate: data.user_info?.exp_date || '',
                isTrial: data.user_info?.is_trial || '0',
                activeCons: data.user_info?.active_cons || '0',
                createdAt: data.user_info?.created_at || '',
                maxConnections: data.user_info?.max_connections || '1',
                allowedOutputFormats: data.user_info?.allowed_output_formats || ['m3u8', 'ts'],
            },
        };
    }

    /**
     * Get live stream categories
     */
    async getLiveCategories(): Promise<XtreamCategory[]> {
        const url = this.buildUrl('get_live_categories');
        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch categories: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get all live streams
     */
    async getLiveStreams(categoryId?: string): Promise<XtreamLiveStream[]> {
        let url = this.buildUrl('get_live_streams');
        if (categoryId) {
            url += `&category_id=${categoryId}`;
        }

        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch streams: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    /**
     * Build stream URL for a live channel
     */
    buildStreamUrl(streamId: number, extension: string = 'm3u8'): string {
        const { username, password } = this.credentials;
        const url = `${this.baseUrl}/live/${username}/${password}/${streamId}.${extension}`;

        // If in browser, we might need to proxy playback too, but usually players handle this differently.
        // For now, return direct URL. HLS.js usually needs CORS or proxy.
        // But the user issue is about Adding Playlist (fetching metadata).
        return url;
    }

    /**
     * Build VOD/Movie stream URL
     */
    buildVodUrl(streamId: number, extension: string = 'mp4'): string {
        const { username, password } = this.credentials;
        return `${this.baseUrl}/movie/${username}/${password}/${streamId}.${extension}`;
    }

    /**
     * Build catchup/timeshift URL
     */
    buildCatchupUrl(
        streamId: number,
        startTime: Date,
        duration: number, // in minutes
        extension: string = 'm3u8'
    ): string {
        const { username, password } = this.credentials;
        const start = Math.floor(startTime.getTime() / 1000);
        return `${this.baseUrl}/timeshift/${username}/${password}/${duration}/${start}/${streamId}.${extension}`;
    }

    /**
     * Get VOD categories
     */
    async getVodCategories(): Promise<XtreamCategory[]> {
        const url = this.buildUrl('get_vod_categories');
        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch VOD categories: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get VOD streams (movies)
     */
    async getVodStreams(categoryId?: string): Promise<XtreamVodStream[]> {
        let url = this.buildUrl('get_vod_streams');
        if (categoryId) {
            url += `&category_id=${categoryId}`;
        }

        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch VOD streams: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        // Some XUI versions return an object/dictionary instead of an array
        if (typeof data === 'object' && data !== null) {
            return Object.values(data);
        }
        return [];
    }

    /**
     * Get series categories
     */
    async getSeriesCategories(): Promise<XtreamCategory[]> {
        const url = this.buildUrl('get_series_categories');
        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch series categories: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get all series
     */
    async getSeriesStreams(categoryId?: string): Promise<XtreamSeriesInfo[]> {
        let url = this.buildUrl('get_series');
        if (categoryId) {
            url += `&category_id=${categoryId}`;
        }

        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch series: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        // Some XUI versions return an object/dictionary instead of an array
        if (typeof data === 'object' && data !== null) {
            return Object.values(data);
        }
        return [];
    }

    /**
     * Build series stream URL (for episode playback)
     */
    buildSeriesUrl(streamId: number, extension: string = 'mp4'): string {
        const { username, password } = this.credentials;
        return `${this.baseUrl}/series/${username}/${password}/${streamId}.${extension}`;
    }

    /**
     * Build episode stream URL
     */
    buildEpisodeUrl(episodeId: string, extension: string = 'mp4'): string {
        const { username, password } = this.credentials;
        return `${this.baseUrl}/series/${username}/${password}/${episodeId}.${extension}`;
    }

    /**
     * Get detailed series info including seasons and episodes
     */
    async getSeriesInfo(seriesId: number): Promise<XtreamSeriesDetails | null> {
        const url = this.buildUrl('get_series_info') + `&series_id=${seriesId}`;

        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch series info: ${response.status}`);
        }

        const data = await response.json();
        return data || null;
    }

    /**
     * Get EPG for specific streams
     */
    async getShortEPG(streamId: number, limit: number = 4): Promise<unknown> {
        const url = `${this.buildUrl('get_short_epg')}&stream_id=${streamId}&limit=${limit}`;
        const response = await this.fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch EPG: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get full EPG URL (XMLTV format)
     */
    getXMLTVUrl(): string {
        const { username, password } = this.credentials;
        return `${this.baseUrl}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    }
}

/**
 * Validate Xtream credentials by attempting to connect
 */
export async function validateXtreamCredentials(
    credentials: XtreamCredentials
): Promise<{ valid: boolean; error?: string; info?: XtreamServerInfo }> {
    try {
        const client = new XtreamClient(credentials);
        const info = await client.getServerInfo();
        return { valid: true, info };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

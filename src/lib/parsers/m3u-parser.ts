import type { M3UChannel, M3UParseResult } from '@/types';
import { fetchWithProxyFallback } from './fetch-utils';

/**
 * Parse M3U/M3U8 playlist content
 * Handles extended M3U format with EXTINF tags
 */
export function parseM3U(content: string): M3UParseResult {
    const startTime = performance.now();
    const lines = content.split(/\r?\n/);
    const channels: M3UChannel[] = [];
    const groupsSet = new Set<string>();

    let currentChannel: Partial<M3UChannel> = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and comments (except EXTINF)
        if (!line || (line.startsWith('#') && !line.startsWith('#EXTINF'))) {
            // Check for #EXTM3U header
            if (line.startsWith('#EXTM3U')) continue;
            continue;
        }

        // Parse EXTINF line
        if (line.startsWith('#EXTINF')) {
            currentChannel = parseExtInf(line);
            if (currentChannel.groupTitle) {
                groupsSet.add(currentChannel.groupTitle);
            }
            continue;
        }

        // This is a URL line
        if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://')) {
            if (currentChannel.name || Object.keys(currentChannel).length > 0) {
                channels.push({
                    name: currentChannel.name || `Channel ${channels.length + 1}`,
                    url: line,
                    logo: currentChannel.logo,
                    groupTitle: currentChannel.groupTitle || 'Uncategorized',
                    tvgId: currentChannel.tvgId,
                    tvgName: currentChannel.tvgName,
                    catchup: currentChannel.catchup,
                    catchupDays: currentChannel.catchupDays,
                    catchupSource: currentChannel.catchupSource,
                });
            }
            currentChannel = {};
        }
    }

    const parseTime = performance.now() - startTime;

    return {
        channels,
        groups: Array.from(groupsSet).sort(),
        totalLines: lines.length,
        parseTime,
    };
}

/**
 * Parse EXTINF line to extract channel metadata
 * Format: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
 */
function parseExtInf(line: string): Partial<M3UChannel> {
    const channel: Partial<M3UChannel> = {};

    // Extract the channel name (after the last comma)
    const commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1) {
        channel.name = line.substring(commaIndex + 1).trim();
    }

    // Extract attributes
    const attrString = line.substring(0, commaIndex !== -1 ? commaIndex : line.length);

    // Pattern to match key="value" or key=value
    const attrRegex = /([a-zA-Z_-]+)=["']?([^"'\s]+(?:\s+[^"'\s=]+)*?)["']?(?=\s+[a-zA-Z_-]+=|,|$)/g;
    let match;

    // More robust attribute parsing
    const tvgId = extractAttribute(attrString, 'tvg-id');
    const tvgName = extractAttribute(attrString, 'tvg-name');
    const tvgLogo = extractAttribute(attrString, 'tvg-logo');
    const groupTitle = extractAttribute(attrString, 'group-title');
    const catchup = extractAttribute(attrString, 'catchup');
    const catchupDays = extractAttribute(attrString, 'catchup-days');
    const catchupSource = extractAttribute(attrString, 'catchup-source');

    if (tvgId) channel.tvgId = tvgId;
    if (tvgName) channel.tvgName = tvgName;
    if (tvgLogo) channel.logo = tvgLogo;
    if (groupTitle) channel.groupTitle = groupTitle;
    if (catchup) channel.catchup = catchup;
    if (catchupDays) channel.catchupDays = parseInt(catchupDays, 10);
    if (catchupSource) channel.catchupSource = catchupSource;

    return channel;
}

/**
 * Extract attribute value from EXTINF string
 */
function extractAttribute(str: string, attrName: string): string | undefined {
    // Try quoted value first
    const quotedRegex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
    const quotedMatch = str.match(quotedRegex);
    if (quotedMatch) {
        return quotedMatch[1];
    }

    // Try unquoted value
    const unquotedRegex = new RegExp(`${attrName}=([^\\s"']+)`, 'i');
    const unquotedMatch = str.match(unquotedRegex);
    if (unquotedMatch) {
        return unquotedMatch[1];
    }

    return undefined;
}

/**
 * Fetch and parse M3U from URL
 */
export async function fetchAndParseM3U(url: string): Promise<M3UParseResult> {
    const content = await fetchWithProxyFallback(url);
    return parseM3U(content);
}

/**
 * Validate M3U content
 */
export function isValidM3U(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('#EXTM3U') ||
        trimmed.includes('#EXTINF') ||
        (trimmed.includes('http://') || trimmed.includes('https://'));
}

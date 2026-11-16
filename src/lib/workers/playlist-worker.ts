/**
 * Playlist Parser Web Worker
 * 
 * Handles parsing of large M3U files in the background
 * to prevent UI freezing.
 */

// Worker message types
interface WorkerRequest {
    type: 'PARSE_M3U' | 'PARSE_XMLTV';
    payload: {
        content?: string;
        url?: string;
    };
}

interface WorkerResponse {
    type: 'PROGRESS' | 'COMPLETE' | 'ERROR';
    payload: unknown;
}

// Simple M3U parser (duplicated to work in worker context)
function parseM3UContent(content: string) {
    const lines = content.split(/\r?\n/);
    const channels: Array<{
        name: string;
        url: string;
        logo?: string;
        groupTitle?: string;
        tvgId?: string;
        tvgName?: string;
    }> = [];
    const groupsSet = new Set<string>();

    let currentChannel: Record<string, string> = {};
    let processedLines = 0;
    const totalLines = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        processedLines++;

        // Report progress every 1000 lines
        if (processedLines % 1000 === 0) {
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    stage: 'parsing',
                    current: processedLines,
                    total: totalLines,
                    message: `Parsing line ${processedLines} of ${totalLines}...`,
                },
            });
        }

        if (!line || line.startsWith('#EXTM3U')) continue;

        if (line.startsWith('#EXTINF')) {
            currentChannel = parseExtInf(line);
            if (currentChannel.groupTitle) {
                groupsSet.add(currentChannel.groupTitle);
            }
            continue;
        }

        if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://')) {
            if (currentChannel.name || Object.keys(currentChannel).length > 0) {
                channels.push({
                    name: currentChannel.name || `Channel ${channels.length + 1}`,
                    url: line,
                    logo: currentChannel.logo,
                    groupTitle: currentChannel.groupTitle || 'Uncategorized',
                    tvgId: currentChannel.tvgId,
                    tvgName: currentChannel.tvgName,
                });
            }
            currentChannel = {};
        }
    }

    return {
        channels,
        groups: Array.from(groupsSet).sort(),
        totalLines,
    };
}

function parseExtInf(line: string): Record<string, string> {
    const result: Record<string, string> = {};

    const commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1) {
        result.name = line.substring(commaIndex + 1).trim();
    }

    const attrString = line.substring(0, commaIndex !== -1 ? commaIndex : line.length);

    const extractAttr = (str: string, attrName: string): string | undefined => {
        const quotedRegex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
        const quotedMatch = str.match(quotedRegex);
        if (quotedMatch) return quotedMatch[1];

        const unquotedRegex = new RegExp(`${attrName}=([^\\s"']+)`, 'i');
        const unquotedMatch = str.match(unquotedRegex);
        if (unquotedMatch) return unquotedMatch[1];

        return undefined;
    };

    const tvgId = extractAttr(attrString, 'tvg-id');
    const tvgName = extractAttr(attrString, 'tvg-name');
    const tvgLogo = extractAttr(attrString, 'tvg-logo');
    const groupTitle = extractAttr(attrString, 'group-title');

    if (tvgId) result.tvgId = tvgId;
    if (tvgName) result.tvgName = tvgName;
    if (tvgLogo) result.logo = tvgLogo;
    if (groupTitle) result.groupTitle = groupTitle;

    return result;
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { type, payload } = event.data;

    try {
        if (type === 'PARSE_M3U') {
            let content = payload.content;

            // Fetch if URL provided
            if (payload.url && !content) {
                self.postMessage({
                    type: 'PROGRESS',
                    payload: {
                        stage: 'downloading',
                        current: 0,
                        total: 100,
                        message: 'Downloading playlist...',
                    },
                });

                const response = await fetch(payload.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.status}`);
                }
                content = await response.text();
            }

            if (!content) {
                throw new Error('No content to parse');
            }

            // Parse the content
            const result = parseM3UContent(content);

            self.postMessage({
                type: 'COMPLETE',
                payload: {
                    channels: result.channels,
                    groups: result.groups,
                    totalLines: result.totalLines,
                },
            });
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            payload: {
                message: error instanceof Error ? error.message : 'Unknown error',
            },
        });
    }
};

// Export empty object for TypeScript
export { };

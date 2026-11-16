import type { XMLTVChannel, XMLTVProgramme } from '@/types';
import type { EPGProgram } from '@/lib/db/schema';
import { generateId } from '@/lib/db/schema';
import { fetchWithProxyFallback } from './fetch-utils';

// Simple XML parsing regex patterns
const CHANNEL_REGEX = /<channel\s+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/gi;
const PROGRAMME_REGEX = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
const TAG_REGEX = /<(\w+)[^>]*>([^<]*)<\/\1>/gi;

/**
 * Parse XMLTV content to extract channels and programmes
 */
export function parseXMLTV(content: string): {
    channels: XMLTVChannel[];
    programmes: XMLTVProgramme[];
} {
    const channels: XMLTVChannel[] = [];
    const programmes: XMLTVProgramme[] = [];

    // Parse channels
    let channelMatch;
    while ((channelMatch = CHANNEL_REGEX.exec(content)) !== null) {
        const channelId = channelMatch[1];
        const channelContent = channelMatch[2];

        // Extract all display names
        const displayNames: string[] = [];
        const displayNameRegex = /<display-name[^>]*>([^<]*)<\/display-name>/gi;
        let dnMatch;
        while ((dnMatch = displayNameRegex.exec(channelContent)) !== null) {
            displayNames.push(decodeXMLEntities(dnMatch[1].trim()));
        }

        const displayName = displayNames.length > 0 ? displayNames[0] : (extractTagContent(channelContent, 'display-name') || channelId);
        const icon = extractAttribute(channelContent, 'icon', 'src');

        channels.push({
            id: channelId,
            displayName,
            displayNames,
            icon,
        });
    }

    // Reset regex
    PROGRAMME_REGEX.lastIndex = 0;

    // Parse programmes
    let progMatch;
    while ((progMatch = PROGRAMME_REGEX.exec(content)) !== null) {
        const attributes = progMatch[1];
        const progContent = progMatch[2];

        const channel = extractAttributeValue(attributes, 'channel');
        const start = extractAttributeValue(attributes, 'start');
        const stop = extractAttributeValue(attributes, 'stop');

        if (!channel || !start || !stop) continue;

        const title = extractTagContent(progContent, 'title');
        const desc = extractTagContent(progContent, 'desc');
        const category = extractTagContent(progContent, 'category');
        const icon = extractAttribute(progContent, 'icon', 'src');

        if (title) {
            programmes.push({
                channel,
                start,
                stop,
                title,
                desc,
                category,
                icon,
            });
        }
    }

    return { channels, programmes };
}

/**
 * Extract content of a specific tag
 */
function extractTagContent(content: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i');
    const match = content.match(regex);
    return match ? decodeXMLEntities(match[1].trim()) : undefined;
}

/**
 * Extract attribute value from tag content
 */
function extractAttribute(content: string, tagName: string, attrName: string): string | undefined {
    const tagRegex = new RegExp(`<${tagName}\\s+([^>]+)/?>`, 'i');
    const tagMatch = content.match(tagRegex);
    if (!tagMatch) return undefined;

    const attrRegex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
    const attrMatch = tagMatch[1].match(attrRegex);
    return attrMatch ? attrMatch[1] : undefined;
}

/**
 * Extract attribute value from attributes string
 */
function extractAttributeValue(attributes: string, name: string): string | undefined {
    const regex = new RegExp(`${name}=["']([^"']+)["']`, 'i');
    const match = attributes.match(regex);
    return match ? match[1] : undefined;
}

/**
 * Decode common XML entities
 */
function decodeXMLEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Parse XMLTV datetime format: YYYYMMDDHHmmss +0000
 */
export function parseXMLTVDate(dateStr: string): Date {
    // Format: 20240115120000 +0100
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);

    if (!match) {
        return new Date(dateStr); // Fallback to default parsing
    }

    const [, year, month, day, hour, minute, second, timezone] = match;

    // Build ISO string
    let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    if (timezone) {
        // Convert +0100 to +01:00
        isoString += `${timezone.slice(0, 3)}:${timezone.slice(3)}`;
    } else {
        isoString += 'Z';
    }

    return new Date(isoString);
}

/**
 * Convert XMLTV programmes to EPGProgram format
 */
export function convertToEPGPrograms(programmes: XMLTVProgramme[]): EPGProgram[] {
    return programmes.map(prog => ({
        id: generateId(),
        channelTvgId: prog.channel,
        title: prog.title,
        description: prog.desc,
        start: parseXMLTVDate(prog.start),
        end: parseXMLTVDate(prog.stop),
        icon: prog.icon,
        category: prog.category,
    }));
}

/**
 * Fetch and parse XMLTV from URL
 */
export async function fetchAndParseXMLTV(url: string): Promise<{
    channels: XMLTVChannel[];
    programs: EPGProgram[];
}> {
    const content = await fetchWithProxyFallback(url);
    const { channels, programmes } = parseXMLTV(content);
    const programs = convertToEPGPrograms(programmes);

    return { channels, programs };
}

/**
 * Validate XMLTV content
 */
export function isValidXMLTV(content: string): boolean {
    return content.includes('<tv') &&
        (content.includes('<channel') || content.includes('<programme'));
}

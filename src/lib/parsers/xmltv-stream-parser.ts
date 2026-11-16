/**
 * Streaming XMLTV Parser for large files
 * Uses chunk-based processing instead of loading the entire file into memory
 */
import type { XMLTVChannel } from '@/types';
import type { EPGProgram } from '@/lib/db/schema';
import { generateId } from '@/lib/db/schema';

/**
 * Parse XMLTV datetime format: YYYYMMDDHHmmss +0000
 */
function parseXMLTVDate(dateStr: string): Date {
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);

    if (!match) {
        return new Date(dateStr);
    }

    const [, year, month, day, hour, minute, second, timezone] = match;
    let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    if (timezone) {
        isoString += `${timezone.slice(0, 3)}:${timezone.slice(3)}`;
    } else {
        isoString += 'Z';
    }

    return new Date(isoString);
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

interface StreamingParseResult {
    channels: XMLTVChannel[];
    programs: EPGProgram[];
}

/**
 * Fetch XMLTV via Node.js native http/https with no timeout issues.
 * Returns a promise that resolves to the full text content.
 * Uses streaming internally but collects into a string since we need regex parsing.
 */
/**
 * Get a readable stream from a URL (handling redirects)
 */
/**
 * Get a readable stream from a URL (handling redirects and GZIP detection)
 */
async function getStream(url: string): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('https');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require('zlib');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PassThrough } = require('stream');

    const client = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(url, {
            headers: {
                'User-Agent': 'IPTVSmartersPro/1.1.1 (iPad; iOS 12.2; Scale/2.00)',
                'Accept': '*/*'
            },
            timeout: 60 * 60 * 1000, // 1 hour
        }, (res: any) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                getStream(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`XMLTV stream failed: ${res.statusCode}`));
                return;
            }

            const outputStream = new PassThrough();

            // 1. Check Headers for Gzip
            const isGzipHeader =
                res.headers['content-encoding'] === 'gzip' ||
                url.endsWith('.gz') ||
                (res.headers['content-type'] && (
                    res.headers['content-type'].includes('gzip') ||
                    res.headers['content-type'].includes('application/x-gzip')
                )) ||
                (res.headers['content-disposition'] && res.headers['content-disposition'].includes('.gz'));

            if (isGzipHeader) {
                const gunzip = zlib.createGunzip();
                gunzip.on('error', (err: any) => {
                    console.warn('[XMLTV-Stream] Gunzip error (header), trying raw stream:', err.message);
                });
                res.pipe(gunzip).pipe(outputStream);
                resolve(outputStream);
                return;
            }

            // 2. Peek at first chunk for Magic Bytes (0x1f 0x8b)
            // We use 'once' so we can hook up the correct pipeline for the rest of the stream
            res.once('data', (chunk: Buffer) => {
                const isGzipMagic = chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b;

                if (isGzipMagic) {
                    console.log('[XMLTV-Stream] Auto-detected GZIP content (magic bytes). Decompressing...');
                    const gunzip = zlib.createGunzip();

                    // Handle decompression errors
                    gunzip.on('error', (err: any) => {
                        console.error('[XMLTV-Stream] Auto-detect Gunzip failed:', err.message);
                        outputStream.emit('error', err);
                    });

                    // Pipe gunzip -> output
                    gunzip.pipe(outputStream);

                    // Write the first chunk we just consumed
                    gunzip.write(chunk);

                    // Pipe the rest of the response
                    res.pipe(gunzip);
                } else {
                    // Not Gzip, just direct pipe
                    outputStream.write(chunk);
                    res.pipe(outputStream);
                }
            });

            // Handle empty response or error before data
            res.once('end', () => {
                // If data never fired (empty body), we should end the output stream
                // (Note: if data fired, the pipes handle end)
                if (outputStream.writable && !outputStream.writableEnded) {
                    outputStream.end();
                }
            });

            res.on('error', (e: any) => outputStream.emit('error', e));

            resolve(outputStream);
        });

        req.on('error', (err: Error) => reject(new Error(`Request error: ${err.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Fetch and parse XMLTV from URL using streaming line-by-line processing.
 * Accepts optional onProgram callback to process programs as they are parsed (streaming mode).
 * If onProgram is provided, the returned 'programs' array will be empty to save memory.
 */
/**
 * Fetch and parse XMLTV from URL using Chunk-Based Streaming.
 * Reads stream chunks, buffers them, finds complete tags, processes them, and flushes memory.
 * This works for both minified XML (one huge line) and formatted XML.
 */
export async function fetchAndParseXMLTVStreaming(
    url: string,
    onProgram?: (prog: EPGProgram) => Promise<void> | void
): Promise<StreamingParseResult> {
    console.log('[XMLTV-Stream] Connecting to:', url);

    // 1. Get the stream
    const stream = await getStream(url);
    stream.setEncoding('utf8');

    const channels: XMLTVChannel[] = [];
    const programs: EPGProgram[] = [];
    let programsCount = 0;

    // 2. Buffer state
    let buffer = '';
    const BUFFER_LIMIT = 50 * 1024 * 1024; // 50MB safety limit to prevent OOM if no tags found

    // Regex to find ONE tag at start of string (or close to it)
    // We use match logic inside the loop

    // We need to track if we are "inside" the root <tv> tag or looking for items
    let tagsFound = 0;

    console.log('[XMLTV-Stream] Parsing stream...');

    for await (const chunk of stream) {
        buffer += chunk;

        // 3. Identification Loop
        // We look for <channel>...</channel> OR <programme>...</programme>
        // We loop until no more COMPLETE tags are found in the buffer

        let processed = true;
        while (processed) {
            processed = false;

            // Optimization: Only search if buffer has enough data
            if (buffer.length < 50) break; // <channel id="x"></channel> is ~25 chars min

            // Find first occurrence of <channel or <programme
            const chanIdx = buffer.indexOf('<channel');
            const progIdx = buffer.indexOf('<programme');

            // Determine which comes first
            let startIdx = -1;
            let tagType = '';

            if (chanIdx !== -1 && (progIdx === -1 || chanIdx < progIdx)) {
                startIdx = chanIdx;
                tagType = 'channel';
            } else if (progIdx !== -1) {
                startIdx = progIdx;
                tagType = 'programme';
            }

            // If no start tag found yet, we can discard prefix (but be careful of partial tags at end)
            if (startIdx === -1) {
                // Keep last 20 chars just in case <progra is at the end
                if (buffer.length > 200) {
                    buffer = buffer.slice(buffer.length - 50);
                }
                break;
            }

            // We found a start. Look for the corresponding end.
            const endTag = tagType === 'channel' ? '</channel>' : '</programme>';
            const endIdx = buffer.indexOf(endTag, startIdx);

            if (endIdx !== -1) {
                // We have a complete block!
                const blockEnd = endIdx + endTag.length;
                const block = buffer.substring(startIdx, blockEnd);

                // Process it
                if (tagType === 'channel') {
                    parseChannel(block, channels);
                    tagsFound++;
                } else {
                    const prog = parseProgram(block);
                    if (prog) {
                        programsCount++;
                        if (onProgram) {
                            await onProgram(prog);
                        } else {
                            programs.push(prog);
                        }
                    }
                    tagsFound++;
                }

                if (tagsFound % 10000 === 0) console.log(`[XMLTV-Stream] Parsed ${tagsFound} items (${programsCount} programs)...`);

                // Advance buffer: discard everything up to the end of this block
                buffer = buffer.slice(blockEnd);
                processed = true; // Loop again, maybe there's another tag in the buffer
            } else {
                // Tag is incomplete (spans across chunks). Wait for next chunk.

                // Safety check: If buffer is huge and we STILL haven't found the end, something is wrong.
                if (buffer.length > BUFFER_LIMIT) {
                    console.warn('[XMLTV-Stream] Buffer exceeded limit without finding closing tag. Truncating to avoid crash.');
                    // Discard up to startIdx + 1000 to unblock
                    buffer = buffer.slice(startIdx + 1000);
                }
                break;
            }
        }
    }

    console.log(`[XMLTV-Stream] Finished: ${channels.length} channels, ${programsCount} programs`);
    return { channels, programs };
}

function parseChannel(xml: string, channels: XMLTVChannel[]) {
    // Regex parsing for the buffered block
    const idMatch = xml.match(/id=["']([^"']+)["']/);
    if (!idMatch) return;

    const id = idMatch[1];

    const displayNames: string[] = [];
    const dnRegex = /<display-name[^>]*>([^<]*)<\/display-name>/gi;
    let match;
    while ((match = dnRegex.exec(xml)) !== null) {
        displayNames.push(decodeXMLEntities(match[1].trim()));
    }

    const iconMatch = xml.match(/<icon\s+[^>]*src=["']([^"']+)["']/);
    const icon = iconMatch ? iconMatch[1] : undefined;

    channels.push({
        id,
        displayName: displayNames[0] || id,
        displayNames,
        icon
    });
}

function parseProgram(xml: string): EPGProgram | null {
    const chanMatch = xml.match(/channel=["']([^"']+)["']/);
    const startMatch = xml.match(/start=["']([^"']+)["']/);
    const stopMatch = xml.match(/stop=["']([^"']+)["']/);

    if (!chanMatch || !startMatch || !stopMatch) return null;

    const titleMatch = xml.match(/<title[^>]*>([^<]*)<\/title>/);
    const descMatch = xml.match(/<desc[^>]*>([^<]*)<\/desc>/);
    const catMatch = xml.match(/<category[^>]*>([^<]*)<\/category>/);
    const iconMatch = xml.match(/<icon\s+[^>]*src=["']([^"']+)["']/);

    const title = titleMatch ? decodeXMLEntities(titleMatch[1].trim()) : undefined;

    if (!title) return null;

    return {
        id: generateId(),
        channelTvgId: chanMatch[1],
        title,
        description: descMatch ? decodeXMLEntities(descMatch[1].trim()) : undefined,
        start: parseXMLTVDate(startMatch[1]),
        end: parseXMLTVDate(stopMatch[1]),
        icon: iconMatch ? iconMatch[1] : undefined,
        category: catMatch ? decodeXMLEntities(catMatch[1].trim()) : undefined,
    };
}


/**
 * Helper utilities for fetching and decoding content
 * Handles GZIP decompression automatically
 */

/**
 * Fetch content from a URL, automatically handling GZIP compression and falling back to a proxy if needed.
 */
export async function fetchWithProxyFallback(url: string): Promise<string> {
    const isServer = typeof window === 'undefined';
    const isDropbox = url.includes('dropbox.com');

    // On server, always try direct fetch first provided we aren't blocked
    // The proxy is only needed for CORS in the browser
    if (isServer) {
        try {
            const headers: HeadersInit = {
                'User-Agent': 'IPTVSmartersPro/1.1.1 (iPad; iOS 12.2; Scale/2.00)',
                'Accept': '*/*'
            };

            const response = await fetch(url, { headers });

            if (!response.ok) {
                // Some providers might block specific user agents or need specific headers
                // Just throw for now, the caller can handle or we can add retry logic
                throw new Error(`Server fetch failed: ${response.status} ${response.statusText}`);
            }

            return await decodeResponse(response);
        } catch (e) {
            console.error(`Server-side fetch failed for ${url}:`, e);
            throw e;
        }
    }

    // Client-side logic (Browser)
    // 1. Try direct fetch (skip if Dropbox or known CORS issues)
    if (!isDropbox) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return await decodeResponse(response);
            }
        } catch (e) {
            console.warn('Direct fetch failed, trying proxy...', e);
        }
    }

    // 2. Try via proxy
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    return await decodeResponse(response);
}

/**
 * Decode response content, handling GZIP compression if detected
 */
async function decodeResponse(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type');
    const url = response.url;

    // Check for GZIP based on URL or Content-Type
    const isGzipHint = url.toLowerCase().endsWith('.gz') ||
        contentType?.includes('gzip') ||
        contentType === 'application/x-gzip';

    // Clone the response so we can read the buffer
    // (Actually we don't need to clone if we just read it once, but we need to read header first)
    // We already read headers. Now read body.

    const buffer = await response.arrayBuffer();
    const view = new Uint8Array(buffer);

    // Check for GZIP magic number: 1F 8B
    const hasGzipMagic = view.length > 2 && view[0] === 0x1F && view[1] === 0x8B;

    if (hasGzipMagic || isGzipHint) {
        try {
            // Server-side (Node.js) - Use zlib for reliable decompression
            if (typeof window === 'undefined') {
                const { gunzipSync } = await import('zlib');
                const decompressed = gunzipSync(view);
                return new TextDecoder().decode(decompressed);
            }

            // Client-side (Browser) - Use DecompressionStream
            if (typeof DecompressionStream !== 'undefined') {
                const ds = new DecompressionStream('gzip');
                const stream = new Response(buffer).body;

                if (stream) {
                    const decompressedStream = stream.pipeThrough(ds);
                    return await new Response(decompressedStream).text();
                }
            } else {
                console.warn('DecompressionStream not supported in this environment');
            }
        } catch (e) {
            console.error('Failed to decompress GZIP content:', e);
            // Fallback to plain text decoding if decompression fails
            // (Use the original buffer)
        }
    }

    // Default: decode as text
    return new TextDecoder().decode(buffer);
}

import { NextRequest, NextResponse } from 'next/server';
import { spawn, type ChildProcess } from 'child_process';
import {
    buildFfmpegArgs,
    type FfmpegBuildOptions
} from '@/lib/server/transcoder';
import type {
    HardwareEncoder,
    MaxResolution,
    QualityPreset,
    AudioMixPreset
} from '@/types';

export const dynamic = 'force-dynamic';

// Singleton tracker for active transcode stream process
let activeFfmpegProcess: ChildProcess | null = null;

function killProcessTree(proc: ChildProcess | null | undefined) {
    if (!proc || proc.killed) return;
    const pid = proc.pid;
    try {
        proc.kill('SIGKILL');
    } catch { }
    if (process.platform === 'win32' && pid) {
        try {
            spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], {
                windowsHide: true,
                stdio: 'ignore'
            });
        } catch { }
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    const transcode = searchParams.get('transcode') === 'true';
    const videoTranscode = searchParams.get('videoTranscode') === 'true';
    const remux = searchParams.get('remux') === 'true';
    const hw = (searchParams.get('hw') || 'auto') as HardwareEncoder;
    const res = (searchParams.get('res') || '1080p') as MaxResolution;
    const quality = (searchParams.get('quality') || 'medium') as QualityPreset;
    const audioMix = (searchParams.get('audioMix') || 'auto') as AudioMixPreset;
    const containerFormat = searchParams.get('format'); // 'mp4' | 'mpegts'

    if (!url) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    try {
        // Unwrap any nested /api/video-proxy URLs to prevent recursive proxy loops
        let decodedUrl = url;
        while (decodedUrl.includes('/api/video-proxy')) {
            try {
                const parsed = new URL(decodedUrl, 'http://localhost:38472');
                const innerUrl = parsed.searchParams.get('url');
                if (innerUrl && innerUrl !== decodedUrl) {
                    decodedUrl = innerUrl;
                } else {
                    break;
                }
            } catch {
                break;
            }
        }
        const decodedUrlLower = decodedUrl.toLowerCase();

        // Build query string to propagate to HLS sub-manifests (never to segments)
        const forwardParams = new URLSearchParams();
        if (transcode) forwardParams.set('transcode', 'true');
        if (videoTranscode) forwardParams.set('videoTranscode', 'true');
        if (remux) forwardParams.set('remux', 'true');
        if (hw !== 'auto') forwardParams.set('hw', hw);
        if (res !== '1080p') forwardParams.set('res', res);
        if (quality !== 'medium') forwardParams.set('quality', quality);
        if (audioMix !== 'auto') forwardParams.set('audioMix', audioMix);
        const forwardQuery = forwardParams.toString() ? `&${forwardParams.toString()}` : '';

        // Check if this is an HLS manifest
        const isM3u8Url = decodedUrlLower.includes('.m3u8');

        // Check if this is a segment of an HLS stream (e.g. .ts segment)
        // Segments must ALWAYS be raw passthrough and NEVER run through FFmpeg!
        const isSegment = searchParams.get('is_segment') === 'true' ||
                          decodedUrl.includes('is_segment=true') ||
                          (decodedUrlLower.includes('.ts') && !decodedUrlLower.includes('/live/') && !transcode && !videoTranscode && !remux);

        // Prepare request headers for upstream fetch
        const headers = new Headers();
        const incomingReferer = request.headers.get('referer');
        if (incomingReferer && !incomingReferer.includes('localhost') && !incomingReferer.includes('127.0.0.1')) {
            headers.set('Referer', incomingReferer);
        } else {
            try {
                const urlObj = new URL(decodedUrl);
                headers.set('Referer', `${urlObj.protocol}//${urlObj.host}/`);
                headers.set('Origin', `${urlObj.protocol}//${urlObj.host}`);
            } catch (e) { }
        }

        const userAgent = request.headers.get('user-agent');
        if (userAgent) headers.set('User-Agent', userAgent);
        else headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        ['accept', 'accept-language', 'range'].forEach(headerName => {
            const headerValue = request.headers.get(headerName);
            if (headerValue) headers.set(headerName, headerValue);
        });

        ['authorization', 'cookie'].forEach(headerName => {
            const headerValue = request.headers.get(headerName);
            if (headerValue) headers.set(headerName, headerValue);
        });

        // If FFmpeg transcoding or remuxing is needed on a direct stream
        const needsFfmpegProcessing = transcode || videoTranscode || remux;

        // Standalone streams that require FFmpeg processing (e.g. raw live streams, MKV, or explicit transcode/remux)
        const isMkv = decodedUrlLower.includes('.mkv');
        const isDirectTs = decodedUrlLower.includes('.ts') && !isSegment && !isM3u8Url;
        const isOtherUnsupported = decodedUrlLower.includes('.avi') || decodedUrlLower.includes('.wmv') || decodedUrlLower.includes('.flv');
        const requiresRemux = (!isSegment) && (needsFfmpegProcessing || isMkv || isDirectTs || isOtherUnsupported);

        if (requiresRemux) {
            // Terminate any previous FFmpeg process to prevent orphan process pile-ups
            if (activeFfmpegProcess && !activeFfmpegProcess.killed) {
                console.log('[Proxy] Terminating previous active FFmpeg process:', activeFfmpegProcess.pid);
                killProcessTree(activeFfmpegProcess);
                activeFfmpegProcess = null;
            }

            // Determine output container
            // For direct playback in <video>, output fragmented mp4 by default!
            const outputContainer: 'mp4' | 'mpegts' = containerFormat === 'mpegts' ? 'mpegts' : 'mp4';
            const contentType = outputContainer === 'mp4' ? 'video/mp4' : 'video/MP2T';

            const ffmpegHeaders: Record<string, string> = {};
            if (headers.get('Referer')) ffmpegHeaders['Referer'] = headers.get('Referer')!;
            if (headers.get('Origin')) ffmpegHeaders['Origin'] = headers.get('Origin')!;
            if (headers.get('Cookie')) ffmpegHeaders['Cookie'] = headers.get('Cookie')!;

            const ffmpegOpts: FfmpegBuildOptions = {
                inputUrl: decodedUrl,
                outputContainer,
                forceAudioTranscode: transcode || (audioMix !== 'passthrough' && audioMix !== 'auto'),
                forceVideoTranscode: videoTranscode,
                forceRemux: remux || isMkv || isDirectTs || isOtherUnsupported,
                hwEncoder: hw,
                maxResolution: res,
                qualityPreset: quality,
                audioMixPreset: audioMix,
                userAgent: headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                headers: ffmpegHeaders,
            };

            const ffmpegArgs = buildFfmpegArgs(ffmpegOpts);
            console.log(`[Proxy] Spawning FFmpeg (${outputContainer}): ffmpeg ${ffmpegArgs.join(' ')}`);

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            activeFfmpegProcess = ffmpegProcess;

            ffmpegProcess.on('close', () => {
                if (activeFfmpegProcess === ffmpegProcess) {
                    activeFfmpegProcess = null;
                }
            });

            const responseHeaders = new Headers();
            responseHeaders.set('Content-Type', contentType);
            responseHeaders.set('Access-Control-Allow-Origin', '*');
            responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

            let isClosed = false;
            const cleanup = () => {
                if (!isClosed) {
                    isClosed = true;
                    killProcessTree(ffmpegProcess);
                    if (activeFfmpegProcess === ffmpegProcess) {
                        activeFfmpegProcess = null;
                    }
                }
            };

            request.signal.addEventListener('abort', cleanup);

            ffmpegProcess.on('error', (err) => {
                console.error('[Proxy] FFmpeg spawn error:', err);
                cleanup();
            });

            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Error') || msg.includes('fatal')) {
                    console.warn(`[FFmpeg] ${msg.trim()}`);
                }
            });

            const stream = new ReadableStream({
                start(controller) {
                    ffmpegProcess.stdout.on('data', (chunk) => {
                        if (!isClosed) {
                            try {
                                controller.enqueue(chunk);
                            } catch (e) {
                                cleanup();
                            }
                        }
                    });

                    ffmpegProcess.stdout.on('end', () => {
                        if (!isClosed) {
                            isClosed = true;
                            try {
                                controller.close();
                            } catch (e) { }
                        }
                    });

                    ffmpegProcess.stdout.on('error', (err) => {
                        cleanup();
                    });
                },
                cancel() {
                    cleanup();
                }
            });

            return new NextResponse(stream, {
                status: 200,
                headers: responseHeaders
            });
        }

        // Standard upstream fetch (for HLS manifests, passthrough streams, or direct segments)
        const response = await fetch(decodedUrl, {
            headers: headers,
            cache: 'no-store',
            redirect: 'follow',
        });

        if (!response.ok) {
            console.error(`Upstream fetch failed for ${decodedUrl}: ${response.status} ${response.statusText}`);
            return NextResponse.json(
                { error: `Failed to fetch video: ${response.status}` },
                { status: response.status }
            );
        }

        const responseHeaders = new Headers();
        const headersToForward = [
            'Content-Type',
            'Content-Length',
            'Content-Range',
            'Accept-Ranges',
            'Last-Modified',
            'ETag'
        ];

        headersToForward.forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                responseHeaders.set(header, value);
            }
        });

        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        responseHeaders.set('Cache-Control', 'no-cache');

        const contentType = response.headers.get('content-type') || '';
        const isM3u8 = contentType.includes('mpegurl') || isM3u8Url;

        if (isM3u8) {
            const text = await response.text();
            const lines = text.split('\n');

            const rewrittenLines = lines.map(line => {
                const trimmed = line.trim();

                if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
                    const uriMatch = trimmed.match(/URI="([^"]+)"/);
                    if (uriMatch) {
                        const uri = uriMatch[1];
                        try {
                            const absoluteUrlObj = new URL(uri, decodedUrl);
                            const origUrlObj = new URL(decodedUrl);

                            origUrlObj.searchParams.forEach((val, key) => {
                                if (!absoluteUrlObj.searchParams.has(key)) {
                                    absoluteUrlObj.searchParams.append(key, val);
                                }
                            });

                            const absoluteUrl = absoluteUrlObj.href;
                            const isSubManifest = absoluteUrl.toLowerCase().includes('.m3u8');
                            const proxyWrapped = isSubManifest
                                ? `/api/video-proxy?url=${encodeURIComponent(absoluteUrl)}${forwardQuery}`
                                : `/api/video-proxy?url=${encodeURIComponent(absoluteUrl)}&is_segment=true`;
                            return line.replace(`URI="${uri}"`, `URI="${proxyWrapped}"`);
                        } catch (e) { }
                    }
                    return line;
                }

                if (!trimmed || trimmed.startsWith('#')) {
                    return line;
                }

                try {
                    const absoluteUrlObj = new URL(trimmed, decodedUrl);
                    const origUrlObj = new URL(decodedUrl);

                    origUrlObj.searchParams.forEach((val, key) => {
                        if (!absoluteUrlObj.searchParams.has(key)) {
                            absoluteUrlObj.searchParams.append(key, val);
                        }
                    });

                    const absoluteUrl = absoluteUrlObj.href;
                    const isSubManifest = absoluteUrl.toLowerCase().includes('.m3u8');
                    // Forward transcoding options only to sub-manifests (variant streams).
                    // Individual segments must be fetched directly as raw segments and never run through FFmpeg!
                    const proxyWrapped = isSubManifest
                        ? `/api/video-proxy?url=${encodeURIComponent(absoluteUrl)}${forwardQuery}`
                        : `/api/video-proxy?url=${encodeURIComponent(absoluteUrl)}&is_segment=true`;
                    return line.replace(trimmed, proxyWrapped);
                } catch (e) { }

                return line;
            });

            const newText = rewrittenLines.join('\n');
            responseHeaders.set('Content-Length', Buffer.byteLength(newText, 'utf8').toString());

            return new NextResponse(newText, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
            });
        }

        // Direct stream pass-through
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        console.error('Video proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to proxy video stream' },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
        },
    });
}

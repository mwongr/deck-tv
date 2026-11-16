import { execSync, spawn } from 'child_process';
import type {
    HardwareEncoder,
    MaxResolution,
    QualityPreset,
    AudioMixPreset
} from '@/types';

let cachedSupportedEncoders: Set<string> | null = null;

export function getSupportedEncoders(): Set<string> {
    if (cachedSupportedEncoders) {
        return cachedSupportedEncoders;
    }

    const encoders = new Set<string>();
    try {
        const output = execSync('ffmpeg -encoders', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        if (output.includes('h264_nvenc')) encoders.add('nvenc');
        if (output.includes('h264_qsv')) encoders.add('qsv');
        if (output.includes('h264_amf')) encoders.add('amf');
        if (output.includes('h264_vaapi')) encoders.add('vaapi');
        if (output.includes('libx264')) encoders.add('libx264');
    } catch (e) {
        // Fallback to software
        encoders.add('libx264');
    }

    cachedSupportedEncoders = encoders;
    return encoders;
}

export function resolveHardwareEncoder(preferred: HardwareEncoder): { codec: string; type: string } {
    const supported = getSupportedEncoders();

    if (preferred === 'nvenc' && supported.has('nvenc')) return { codec: 'h264_nvenc', type: 'nvenc' };
    if (preferred === 'qsv' && supported.has('qsv')) return { codec: 'h264_qsv', type: 'qsv' };
    if (preferred === 'amf' && supported.has('amf')) return { codec: 'h264_amf', type: 'amf' };
    if (preferred === 'vaapi' && supported.has('vaapi')) return { codec: 'h264_vaapi', type: 'vaapi' };
    if (preferred === 'software') return { codec: 'libx264', type: 'software' };

    // Auto detection hierarchy
    if (supported.has('nvenc')) return { codec: 'h264_nvenc', type: 'nvenc' };
    if (supported.has('qsv')) return { codec: 'h264_qsv', type: 'qsv' };
    if (supported.has('amf')) return { codec: 'h264_amf', type: 'amf' };
    if (supported.has('vaapi')) return { codec: 'h264_vaapi', type: 'vaapi' };

    return { codec: 'libx264', type: 'software' };
}

export function getAudioFilterArgs(preset: AudioMixPreset): string[] {
    switch (preset) {
        case 'itu':
            return ['-af', 'pan=stereo|FL=FL+0.707*FC+0.707*BL|FR=FR+0.707*FC+0.707*BR', '-ac', '2'];
        case 'night':
            return [
                '-af',
                'pan=stereo|FL=0.5*FL+1.0*FC+0.3*BL|FR=0.5*FR+1.0*FC+0.3*BR,acompressor=threshold=-20dB:ratio=4:attack=20:release=250',
                '-ac', '2'
            ];
        case 'cinematic':
            return [
                '-af',
                'pan=stereo|FL=FL+0.5*FC+0.8*BL+0.5*LFE|FR=FR+0.5*FC+0.8*BR+0.5*LFE,extrastereo=m=1.3',
                '-ac', '2'
            ];
        case 'auto':
            return ['-ac', '2'];
        case 'passthrough':
        default:
            return [];
    }
}

export function getResolutionScaleFilter(resolution: MaxResolution): string | null {
    switch (resolution) {
        case '480p':
            return "scale='min(854,iw)':-2";
        case '720p':
            return "scale='min(1280,iw)':-2";
        case '1080p':
            return "scale='min(1920,iw)':-2";
        case '4k':
        default:
            return null; // Keep source or scale only if above 4k
    }
}

export interface FfmpegBuildOptions {
    inputUrl: string;
    outputContainer: 'mp4' | 'mpegts';
    forceAudioTranscode?: boolean;
    forceVideoTranscode?: boolean;
    forceRemux?: boolean;
    hwEncoder?: HardwareEncoder;
    maxResolution?: MaxResolution;
    qualityPreset?: QualityPreset;
    audioMixPreset?: AudioMixPreset;
    userAgent?: string;
    headers?: Record<string, string>;
}

export function buildFfmpegArgs(options: FfmpegBuildOptions): string[] {
    const {
        inputUrl,
        outputContainer,
        forceAudioTranscode = false,
        forceVideoTranscode = false,
        hwEncoder = 'auto',
        maxResolution = '1080p',
        qualityPreset = 'medium',
        audioMixPreset = 'auto',
        userAgent,
        headers,
    } = options;

    const args: string[] = [
        '-hide_banner',
        '-loglevel', 'warning',
    ];

    // Optimize probe and analyze time so stream starts in < 300ms instead of 10s
    args.push(
        '-probesize', '1000000',
        '-analyzeduration', '1000000',
        '-fflags', '+nobuffer+genpts+flush_packets'
    );

    // Pass custom User-Agent and HTTP headers before -i to satisfy CDN protection (e.g. 403 Forbidden checks)
    if (userAgent) {
        args.push('-user_agent', userAgent);
    }

    if (headers && Object.keys(headers).length > 0) {
        const headerEntries = Object.entries(headers)
            .filter(([k, v]) => Boolean(v) && k.toLowerCase() !== 'user-agent')
            .map(([k, v]) => `${k}: ${v}`);
        if (headerEntries.length > 0) {
            args.push('-headers', headerEntries.join('\r\n') + '\r\n');
        }
    }

    args.push(
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '10',
        '-i', inputUrl,
    );

    // Map first video track and first audio track; ignore subtitle and data streams that break MP4 muxing
    args.push('-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn');

    // Video processing
    if (forceVideoTranscode) {
        const { codec, type } = resolveHardwareEncoder(hwEncoder);
        args.push('-c:v', codec);

        const scaleFilter = getResolutionScaleFilter(maxResolution);
        if (scaleFilter) {
            args.push('-vf', scaleFilter);
        }

        if (type === 'nvenc') {
            if (qualityPreset === 'high') {
                args.push('-preset', 'p6', '-cq', '20', '-b:v', '6M', '-maxrate', '8M', '-bufsize', '12M');
            } else if (qualityPreset === 'low') {
                args.push('-preset', 'p2', '-cq', '26', '-b:v', '2.5M', '-maxrate', '4M', '-bufsize', '5M');
            } else {
                args.push('-preset', 'p4', '-cq', '23', '-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M');
            }
        } else if (type === 'qsv' || type === 'amf') {
            const q = qualityPreset === 'high' ? 'quality' : qualityPreset === 'low' ? 'speed' : 'balanced';
            args.push('-quality', q, '-b:v', qualityPreset === 'high' ? '6M' : qualityPreset === 'low' ? '2.5M' : '4M');
        } else {
            // libx264
            const presetMap = { high: 'fast', medium: 'veryfast', low: 'ultrafast' };
            const crfMap = { high: '20', medium: '23', low: '26' };
            args.push('-preset', presetMap[qualityPreset], '-crf', crfMap[qualityPreset]);
        }
    } else {
        args.push('-c:v', 'copy');
    }

    // Audio processing
    const needsAudioTranscode = forceAudioTranscode || audioMixPreset !== 'passthrough';
    if (needsAudioTranscode) {
        args.push('-c:a', 'aac', '-b:a', '192k');
        const filterArgs = getAudioFilterArgs(audioMixPreset);
        args.push(...filterArgs);
    } else {
        args.push('-c:a', 'copy');
    }

    // Output container & flags
    if (outputContainer === 'mp4') {
        args.push(
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-flush_packets', '1',
            'pipe:1'
        );
    } else {
        args.push(
            '-f', 'mpegts',
            '-flush_packets', '1',
            'pipe:1'
        );
    }

    return args;
}

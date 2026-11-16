/**
 * DVR Recorder Service
 * 
 * This Node.js service handles FFmpeg-based stream recording.
 * Run separately from the Next.js app: `node server/dvr/recorder.js`
 * 
 * Requirements:
 * - FFmpeg installed and available in PATH
 * - Node.js 18+
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

interface RecordingJob {
    id: string;
    channelId: string;
    channelName: string;
    streamUrl: string;
    programTitle?: string;
    startTime: Date;
    endTime: Date;
    duration: number; // seconds
    outputPath: string;
    status: 'pending' | 'recording' | 'completed' | 'failed';
    process?: ChildProcess;
    error?: string;
}

class DVRRecorder {
    private jobs: Map<string, RecordingJob> = new Map();
    private outputDir: string;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(outputDir: string = './recordings') {
        this.outputDir = outputDir;

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    /**
     * Start the scheduler that checks for jobs to start/stop
     */
    start() {
        console.log('DVR Recorder Service started');
        console.log(`Output directory: ${this.outputDir}`);

        // Check every minute for jobs to start
        this.checkInterval = setInterval(() => {
            this.checkJobs();
        }, 60000);

        // Initial check
        this.checkJobs();
    }

    /**
     * Stop the scheduler and all active recordings
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Stop all active recordings
        for (const job of this.jobs.values()) {
            if (job.status === 'recording' && job.process) {
                this.stopRecording(job.id);
            }
        }

        console.log('DVR Recorder Service stopped');
    }

    /**
     * Schedule a new recording
     */
    scheduleRecording(
        channelId: string,
        channelName: string,
        streamUrl: string,
        startTime: Date,
        endTime: Date,
        programTitle?: string,
        jobId?: string
    ): string {
        const id = jobId || crypto.randomUUID();

        // If job already exists, return its ID
        if (this.jobs.has(id)) {
            console.log(`Job ${id} already scheduled, skipping duplicate`);
            return id;
        }

        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

        // Generate output filename
        const timestamp = startTime.toISOString().replace(/[:.]/g, '-');
        const safeName = (programTitle || channelName).replace(/[^a-zA-Z0-9]/g, '_');
        const outputPath = path.join(this.outputDir, `${safeName}_${timestamp}.ts`);

        const job: RecordingJob = {
            id,
            channelId,
            channelName,
            streamUrl,
            programTitle,
            startTime,
            endTime,
            duration,
            outputPath,
            status: 'pending',
        };

        this.jobs.set(id, job);
        console.log(`Scheduled recording: ${programTitle || channelName} at ${startTime} (ID: ${id})`);

        return id;
    }

    /**
     * Cancel a scheduled or active recording
     */
    cancelRecording(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        if (job.status === 'recording' && job.process) {
            this.stopRecording(jobId);
        }

        this.jobs.delete(jobId);
        console.log(`Cancelled recording: ${jobId}`);
        return true;
    }

    /**
     * Get all jobs
     */
    getJobs(): RecordingJob[] {
        return Array.from(this.jobs.values());
    }

    /**
     * Check and manage job states
     */
    private checkJobs() {
        const now = new Date();

        for (const job of this.jobs.values()) {
            // Start recordings that should begin now
            if (job.status === 'pending' && job.startTime <= now && job.endTime > now) {
                this.startRecording(job.id);
            }

            // Stop recordings that have reached their end time
            if (job.status === 'recording' && job.endTime <= now) {
                this.stopRecording(job.id);
            }
        }
    }

    /**
     * Start FFmpeg recording
     */
    private startRecording(jobId: string) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const remainingSeconds = Math.max(0, Math.floor((job.endTime.getTime() - Date.now()) / 1000));

        if (remainingSeconds <= 0) {
            console.log(`[${jobId}] Job duration already elapsed. Marking completed.`);
            job.status = 'completed';
            return;
        }

        console.log(`Starting recording: ${job.programTitle || job.channelName}`);

        // FFmpeg command for live HLS recording
        // -reconnect* flags: survive brief HLS gaps (commercials, segment rollovers) without exiting
        // -live_start_index -1: always record from the live edge, not the beginning of the playlist
        // -t is placed AFTER -i so it limits OUTPUT duration (not input read time)
        const ffmpegArgs = [
            '-live_start_index', '-1',          // Record from live edge
            '-reconnect', '1',                  // Auto-reconnect on disconnect
            '-reconnect_streamed', '1',         // Reconnect even on streamed (non-seekable) sources
            '-reconnect_delay_max', '30',       // Wait up to 30s between reconnect attempts
            '-i', job.streamUrl,                // Input stream
            '-t', String(remainingSeconds),     // Output duration limit (after -i)
            '-c', 'copy',                       // Copy codecs (no re-encoding)
            '-map', '0',                        // Capture all streams
            '-f', 'mpegts',                     // Force MPEG-TS format
            'pipe:1',                           // Pipe to stdout
        ];

        console.log(`FFmpeg args: ffmpeg ${ffmpegArgs.join(' ')} >> ${job.outputPath} (appending)`);
        console.log(`Recording until: ${job.endTime.toISOString()} (~${Math.round(remainingSeconds / 60)} min remaining)`);

        try {
            const process = spawn('ffmpeg', ffmpegArgs);
            // Append by default: allows for process restarts to concat to the same stream file!
            const writeStream = fs.createWriteStream(job.outputPath, { flags: 'a' });

            process.stdout.pipe(writeStream);

            process.stderr.on('data', (data) => {
                const line = data.toString().trim();
                // Only log meaningful lines (skip progress frames which are very noisy)
                if (line && !line.startsWith('frame=')) {
                    console.log(`FFmpeg [${jobId}] ${line}`);
                }
            });

            process.on('close', (code) => {
                writeStream.end();
                const job = this.jobs.get(jobId);

                if (job) {
                    // Stop explicitly requested
                    if (job.status === 'completed') {
                        return;
                    }

                    const now = new Date();

                    // If FFmpeg exited but we still have more than 10 seconds of scheduled time...
                    if (now.getTime() < job.endTime.getTime() - 10000) {
                        console.log(`[${jobId}] Stream exited prematurely (code ${code}). Watchdog restarting in 5s...`);

                        // Retry after 5-second delay to avoid thrashing
                        setTimeout(() => {
                            if (this.jobs.has(jobId)) {
                                const currentJob = this.jobs.get(jobId)!;
                                // Only restart if still marked as recording
                                if (currentJob.status === 'recording') {
                                    this.startRecording(jobId);
                                }
                            }
                        }, 5000);

                    } else {
                        // Naturally reached the end, or close enough
                        job.status = 'completed';
                        console.log(`Recording completed naturally: ${job.outputPath}`);
                    }
                }
            });

            process.on('error', (err) => {
                const job = this.jobs.get(jobId);
                if (job) {
                    job.status = 'failed';
                    job.error = err.message;
                    console.error(`Recording error: ${err.message}`);
                }
            });

            job.process = process;
            job.status = 'recording';
        } catch (error) {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to start recording: ${job.error}`);
        }
    }

    /**
     * Stop an active recording
     */
    private stopRecording(jobId: string) {
        const job = this.jobs.get(jobId);
        if (!job || !job.process) return;

        console.log(`Stopping recording: ${job.programTitle || job.channelName}`);

        // Send SIGINT to FFmpeg for graceful shutdown
        job.process.kill('SIGINT');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (job.process && !job.process.killed) {
                console.log(`Force killing recording process: ${jobId}`);
                job.process.kill('SIGKILL');
            }
        }, 5000);

        job.status = 'completed';
    }
}

// Export for use as a module
export { DVRRecorder };

// If run directly
if (require.main === module) {
    const outputDir = process.env.DVR_OUTPUT || './recordings';
    const recorder = new DVRRecorder(outputDir);

    // Handle shutdown
    process.on('SIGINT', () => {
        recorder.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        recorder.stop();
        process.exit(0);
    });

    recorder.start();
}

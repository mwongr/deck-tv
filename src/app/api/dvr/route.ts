import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

// Use global to persist across hot reloads in dev
const globalForDVR = global as unknown as {
    dvrProcesses: Map<string, ChildProcess>;
    schedulerInterval?: NodeJS.Timeout;
    restartingJobs: Set<string>;
    retryCounts: Map<string, number>;
};

const activeProcesses = globalForDVR.dvrProcesses || new Map<string, ChildProcess>();
if (!globalForDVR.dvrProcesses) globalForDVR.dvrProcesses = activeProcesses;

const restartingJobs = globalForDVR.restartingJobs || new Set<string>();
if (!globalForDVR.restartingJobs) globalForDVR.restartingJobs = restartingJobs;

const retryCounts = globalForDVR.retryCounts || new Map<string, number>();
if (!globalForDVR.retryCounts) globalForDVR.retryCounts = retryCounts;

const MAX_RETRIES = 12; // About an hour of total downtime given exponential backoff
const BASE_RETRY_DELAY = 5000;

const OUTPUT_DIR = process.env.DVR_OUTPUT || './recordings';

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
    try {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    } catch (e) {
        console.error("Failed to create recordings dir", e);
    }
}

// Helper to managing jobs file
const JOBS_FILE = path.join(OUTPUT_DIR, 'dvr-jobs.json');

function getStoredJobs(): any[] {
    if (!fs.existsSync(JOBS_FILE)) return [];
    try {
        const data = fs.readFileSync(JOBS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to read jobs file", e);
        return [];
    }
}

function saveStoredJobs(jobs: any[]) {
    try {
        fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
    } catch (e) {
        console.error("Failed to write jobs file", e);
    }
}

function saveJob(job: any) {
    const jobs = getStoredJobs();
    const existingIndex = jobs.findIndex(j => j.id === job.id);

    if (existingIndex >= 0) {
        jobs[existingIndex] = job;
    } else {
        jobs.push(job);
    }
    saveStoredJobs(jobs);
}

// Internal scheduler
if (!globalForDVR.schedulerInterval) {
    console.log("Starting internal DVR scheduler...");
    globalForDVR.schedulerInterval = setInterval(checkScheduledJobs, 30000); // Check every 30s
    // Initial check
    setTimeout(checkScheduledJobs, 5000);
}

function checkScheduledJobs() {
    try {
        const jobs = getStoredJobs();
        const now = new Date();

        for (const job of jobs) {
            if (activeProcesses.has(job.id)) continue;
            if (restartingJobs.has(job.id)) {
                console.log(`[Scheduler] Skipping job ${job.id} as it is currently in watchdog restart delay.`);
                continue;
            }
            if (job.status === 'completed' || job.status === 'failed') continue;

            const startTime = new Date(job.startTime);
            const endTime = new Date(job.endTime);

            // Check if should be recording: started in past, ends in future
            if (startTime <= now && endTime > now) {
                console.log(`Starting scheduled recording: ${job.programTitle || job.channelName}`);
                startRecordingProcess(job);
            }
        }
    } catch (e) {
        console.error("Scheduler error:", e);
    }
}

function spawnFfmpeg(id: string, channelUrl: string, outputPath: string, endTime: string, job: any) {
    const now = new Date();
    let durationSeconds = 0;

    if (endTime) {
        const end = new Date(endTime);
        if (!isNaN(end.getTime())) {
            durationSeconds = Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));
        }
    }

    if (durationSeconds <= 0) {
        console.log(`[${id}] Recording window already elapsed, skipping spawn.`);
        return;
    }

    console.log(`[${id}] FFmpeg duration: ${durationSeconds}s (until ${endTime})`);

    const spawnedAt = Date.now();

    // -reconnect* flags keep ffmpeg alive through brief HLS gaps (commercials, segment rollovers)
    // -t is placed AFTER -i so it limits OUTPUT duration, not input read time
    const args = [
        '-live_start_index', '-1',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '30',
        '-i', channelUrl,
        '-t', String(durationSeconds),  // Output duration limit (after -i)
        '-c', 'copy',
        '-map', '0',
        '-f', 'mpegts',
        'pipe:1',
    ];

    console.log(`Spawning ffmpeg: ffmpeg ${args.join(' ')} (appending to ${outputPath})`);
    const ffmpeg = spawn('ffmpeg', args);
    
    // Append to file to allow restarts to concatenate seamlessly
    const writeStream = fs.createWriteStream(outputPath, { flags: 'a' });
    ffmpeg.stdout.pipe(writeStream);
    
    activeProcesses.set(id, ffmpeg);

    ffmpeg.stderr.on('data', (data) => {
        const line = data.toString().trim();
        // Log errors/warnings but skip noisy progress lines
        if (line && !line.startsWith('frame=') && !line.startsWith('size=')) {
            console.log(`FFmpeg [${id}]: ${line}`);
        }
    });

    ffmpeg.on('close', (code, signal) => {
        writeStream.end();
        console.log(`FFmpeg [${id}] exited with code ${code} signal ${signal}`);
        activeProcesses.delete(id);

        const runtimeMs = Date.now() - spawnedAt;
        if (runtimeMs > 60000) {
            // If it ran continuously for > 1 minute, it was making real progress.
            // Reset the retry counter so occasional brief outages don't exhaust the limit.
            if (retryCounts.has(id)) {
                console.log(`[${id}] Recording successfully ran for >60s. Resetting retry backoff counter.`);
                retryCounts.delete(id);
            }
        }

        const remainingMs = new Date(endTime).getTime() - Date.now();

        // If there's still >15 seconds left on the schedule, this was a premature exit — restart
        if (remainingMs > 15000 && signal !== 'SIGINT' && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
            const retries = (retryCounts.get(id) || 0) + 1;

            if (retries > MAX_RETRIES) {
                console.error(`[${id}] Max retries (${MAX_RETRIES}) exceeded. Stream might be dead. Marking failed.`);
                // Clean up tracking
                restartingJobs.delete(id);
                retryCounts.delete(id);
                const failedJob = { ...job, status: 'failed', error: 'Max retries exceeded due to repeated upstream disconnects' };
                saveJob(failedJob);
                return;
            }

            retryCounts.set(id, retries);

            // Exponential backoff: 5s, 10s, 20s, 40s... capped at 2 minutes
            const delayMs = Math.min(BASE_RETRY_DELAY * Math.pow(2, retries - 1), 120000);

            console.log(`[${id}] Premature exit with ${Math.round(remainingMs / 1000)}s scheduled time remaining.`);
            console.log(`[${id}] Watchdog scheduling restart (Attempt ${retries}/${MAX_RETRIES}) in ${delayMs / 1000}s...`);

            restartingJobs.add(id);
            setTimeout(() => {
                restartingJobs.delete(id);
                // Only restart if still scheduled (not manually cancelled)
                const currentJobs = getStoredJobs();
                const currentJob = currentJobs.find((j: any) => j.id === id);
                if (currentJob && currentJob.status === 'recording') {
                    console.log(`[${id}] Watchdog executing restart NOW.`);
                    spawnFfmpeg(id, channelUrl, outputPath, endTime, job);
                } else {
                    console.log(`[${id}] Job no longer "recording" status, aborting watchdog restart.`);
                }
            }, delayMs);
            return;
        }

        // Reached end or stopped manually — mark completed
        // Clean up tracking state
        restartingJobs.delete(id);
        retryCounts.delete(id);

        const isSuccess = code === 0 || code === 255 || signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGKILL';
        const completedJob = {
            ...job,
            status: isSuccess ? 'completed' : 'failed',
            error: isSuccess ? undefined : `Exited with code ${code} signal ${signal}`,
        };
        saveJob(completedJob);
    });

    ffmpeg.on('error', (err) => {
        console.error(`FFmpeg [${id}] failed to start:`, err);
        activeProcesses.delete(id);
        restartingJobs.delete(id);
        const failedJob = { ...job, status: 'failed', error: err.message };
        saveJob(failedJob);
    });

    // Failsafe: hard-kill 3 minutes after scheduled end
    setTimeout(() => {
        const proc = activeProcesses.get(id);
        if (proc && !proc.killed) {
            console.log(`Failsafe: hard-stopping recording [${id}]`);
            proc.kill('SIGINT');
            setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 5000);
        }
    }, (durationSeconds + 180) * 1000);
}

function startRecordingProcess(job: any) {
    const { id, channelName, channelUrl, endTime, programTitle, outputDir } = job;

    // Update status to recording
    job.status = 'recording';
    saveJob(job);

    // Determine output directory
    let targetDir = OUTPUT_DIR;
    if (outputDir && typeof outputDir === 'string' && outputDir.trim()) {
        targetDir = outputDir.trim();
    }

    if (!fs.existsSync(targetDir)) {
        try {
            fs.mkdirSync(targetDir, { recursive: true });
        } catch (e) {
            console.error("Failed to create recordings dir", e);
        }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (programTitle || channelName || 'recording').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_${timestamp}.ts`;
    const outputPath = path.join(targetDir, filename);

    // Save outputPath to job so it persists across potential restarts
    job.outputPath = outputPath;
    saveJob(job);

    spawnFfmpeg(id, channelUrl, outputPath, endTime, job);

    return outputPath;
}

export async function GET() {
    const jobs = getStoredJobs();
    return NextResponse.json({
        activeRecordings: activeProcesses.size,
        jobs: jobs, // Return stored jobs for the scheduler
        message: 'DVR API is running'
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, channelName, channelUrl, programTitle, status } = body;

        // If it's a scheduled job (not recording yet), save it. 
        // Logic: activeJobs loop will pick it up if it's time.
        if (status !== 'recording') {
            console.log(`Scheduling recording: ${programTitle || channelName} (${id})`);
            saveJob(body);
            // Run check immediately in case it's due
            checkScheduledJobs();

            // Set precise timeout if starting in the future
            if (body.startTime) {
                const start = new Date(body.startTime);
                const timeUntilStart = start.getTime() - Date.now();
                if (timeUntilStart > 0 && timeUntilStart < 2147483647) { // within safe setTimeout limit
                    setTimeout(() => {
                        console.log(`Precise timer reached for ${id}, checking jobs...`);
                        checkScheduledJobs();
                    }, timeUntilStart + Math.random() * 2000); // Add slight random jitter 0-2s
                }
            }

            return NextResponse.json({ success: true, message: 'Scheduled', job: body });
        }

        if (!channelUrl) {
            console.error("Missing URL for recording", channelName);
            return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
        }

        console.log(`Starting recording immediately via API: ${programTitle || channelName} (${id})`);

        // Also save the job as "recording" status for persistence
        saveJob(body);
        const outputPath = startRecordingProcess(body);

        return NextResponse.json({
            success: true,
            message: 'Recording started',
            outputPath
        });

    } catch (error) {
        console.error("DVR API Error", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const action = searchParams.get('action') || 'stop'; // 'stop' or 'delete'

        if (id && activeProcesses.has(id)) {
            const proc = activeProcesses.get(id);
            console.log(`Stopping recording [${id}] (Action: ${action})`);
            proc?.kill('SIGINT'); // Try graceful first

            // Force kill if still running after 2s
            setTimeout(() => {
                if (activeProcesses.has(id)) {
                    const p = activeProcesses.get(id);
                    if (p && !p.killed) p.kill('SIGKILL');
                    activeProcesses.delete(id);
                }
            }, 2000);

            // Remove from map immediately to avoid double handling
            activeProcesses.delete(id);
        }

        // If action is delete, remove from file system and database
        if (action === 'delete') {
            const jobs = getStoredJobs();
            const jobIndex = jobs.findIndex(j => j.id === id);

            // Clean up backoff tracking state
            if (id) {
                restartingJobs.delete(id);
                retryCounts.delete(id);
            }

            if (jobIndex >= 0) {
                const job = jobs[jobIndex];

                // Delete video file
                if (job.outputPath && fs.existsSync(job.outputPath)) {
                    try {
                        fs.unlinkSync(job.outputPath);
                        console.log(`Deleted file: ${job.outputPath}`);
                    } catch (e) {
                        console.error(`Failed to delete file: ${job.outputPath}`, e);
                    }
                }

                // Remove from local DB file
                jobs.splice(jobIndex, 1);
                saveStoredJobs(jobs);

                return NextResponse.json({ success: true, message: 'Recording deleted' });
            } else {
                // Even if job not found in DB, just return success if it was stopped.
                // Or maybe it was already deleted.
            }
        }

        return NextResponse.json({ success: true, message: 'Stopped' });
    } catch (e) {
        console.error("Delete Error", e);
        return NextResponse.json({ error: 'Error processing request' }, { status: 500 });
    }
}


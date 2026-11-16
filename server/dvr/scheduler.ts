/**
 * DVR Scheduler Service
 * 
 * Polls the database for scheduled recordings and triggers them at the right time.
 * Works in conjunction with the recorder service.
 */

import { DVRRecorder } from './recorder';

interface ScheduledJob {
    id: string;
    channelId: string;
    channelName: string;
    channelUrl: string;
    programId?: string;
    programTitle?: string;
    startTime: Date;
    endTime: Date;
    status: string;
}

class DVRScheduler {
    private recorder: DVRRecorder;
    private pollInterval: NodeJS.Timeout | null = null;
    private apiUrl: string;

    constructor(recorder: DVRRecorder, apiUrl: string = 'http://localhost:38472/api/dvr') {
        this.recorder = recorder;
        this.apiUrl = apiUrl;
    }

    /**
     * Start polling for new jobs
     */
    start() {
        console.log('DVR Scheduler started');

        // Poll every minute
        this.pollInterval = setInterval(() => {
            this.pollJobs();
        }, 60000);

        // Initial poll
        this.pollJobs();
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        console.log('DVR Scheduler stopped');
    }

    /**
     * Poll the API for pending jobs
     */
    private async pollJobs() {
        try {
            const response = await fetch(this.apiUrl).catch(err => {
                throw new Error(`Connection failed: ${err.message}`);
            });
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const scheduledJobs = data.jobs.filter(
                (job: ScheduledJob) => job.status === 'scheduled'
            );

            for (const job of scheduledJobs) {
                // Check if this job should start soon (within the next minute)
                const startTime = new Date(job.startTime);
                const endTime = new Date(job.endTime);
                const now = new Date();
                const timeUntilStart = startTime.getTime() - now.getTime();

                // Schedule if it starts soon (within 60s) OR if it should be running (started in past, hasn't ended)
                // This handles cases where the scheduler might have been down when the recording was supposed to start.
                if ((timeUntilStart <= 60000) && (now < endTime)) {
                    // Schedule with the recorder
                    // Pass the job.id as the external ID to prevent duplicates if we poll again
                    this.recorder.scheduleRecording(
                        job.channelId,
                        job.channelName,
                        job.channelUrl,
                        startTime,
                        endTime,
                        job.programTitle,
                        job.id
                    );
                }
            }
        } catch (error) {
            console.error('Failed to poll jobs:', error);
        }
    }
}

export { DVRScheduler };

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

// Replicating logic from dvr/route.ts to locate the job file
// ideally this should be a shared utility
const OUTPUT_DIR = process.env.DVR_OUTPUT || './recordings';
const JOBS_FILE = path.join(OUTPUT_DIR, 'dvr-jobs.json');

function getStoredJobs(): any[] {
    if (!fs.existsSync(JOBS_FILE)) return [];
    try {
        const data = fs.readFileSync(JOBS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { id } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        }

        const jobs = getStoredJobs();
        const job = jobs.find((j: any) => j.id === id);

        if (!job || !job.outputPath) {
            return NextResponse.json({ error: 'Recording not found or no output path' }, { status: 404 });
        }

        const filePath = job.outputPath;
        
        // Verify existence
        if (!fs.existsSync(filePath)) {
            // Try relative to OUTPUT_DIR if absolute path fails?
            // Usually outputPath is absolute or relative to cwd.
            const relativePath = path.resolve(filePath);
            if (!fs.existsSync(relativePath)) {
                 return NextResponse.json({ error: 'File not found on server disk' }, { status: 404 });
            }
        }

        console.log(`Request to open file externally: ${filePath}`);
        
        let command;
        // Construct command based on platform
        if (process.platform === 'win32') {
            // Windows: start "" "path"
            command = `start "" "${filePath}"`;
        } else if (process.platform === 'darwin') {
            // MacOS
            command = `open "${filePath}"`;
        } else {
            // Linux/Other
            command = `xdg-open "${filePath}"`;
        }

        exec(command, (error) => {
            if (error) {
                console.error(`Failed to open file: ${error}`);
                // We don't return 500 here because the request was processed, 
                // and exec might fail if no default app is associated, etc.
            }
        });

        return NextResponse.json({ success: true, message: 'Opening in default player' });

    } catch (e) {
        console.error('Play API Error', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

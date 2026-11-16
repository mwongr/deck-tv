
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    try {
        // Read jobs file to find file path
        const jobsFile = path.join(process.env.DVR_OUTPUT || './recordings', 'dvr-jobs.json');
        if (!fs.existsSync(jobsFile)) return NextResponse.json({ error: 'No recordings' }, { status: 404 });

        const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
        const job = jobs.find((j: any) => j.id === id);

        if (!job || !job.outputPath) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        const filePath = job.outputPath;
        if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = request.headers.get('range');

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head: Record<string, string> = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(chunksize),
                'Content-Type': 'video/mp2t', // Assuming .ts file from ffmpeg copy
            };

            return new NextResponse(file as any, { status: 206, headers: head });
        } else {
            const head: Record<string, string> = {
                'Content-Length': String(fileSize),
                'Content-Type': 'video/mp2t',
            };
            const file = fs.createReadStream(filePath);
            return new NextResponse(file as any, { status: 200, headers: head });
        }
    } catch (e) {
        console.error("Stream error", e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

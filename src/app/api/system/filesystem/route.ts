import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export const runtime = 'nodejs';

interface FileItem {
    name: string;
    path: string;
    isDirectory: boolean;
    isDrive?: boolean;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');
        let currentPath = searchParams.get('path');

        // Action: List Drives
        if (action === 'drives') {
            if (process.platform === 'win32') {
                try {
                    const { stdout } = await execAsync('wmic logicaldisk get name');
                    const drives = stdout.split('\r\n')
                        .slice(1) // Skip header
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .map(drive => ({
                            name: drive,
                            path: drive + '\\',
                            isDirectory: true,
                            isDrive: true
                        }));
                    return NextResponse.json({ items: drives, path: '' });
                } catch (e) {
                    console.error('Failed to list drives via wmic', e);
                    return NextResponse.json({ items: [{ name: 'C:', path: 'C:\\', isDirectory: true, isDrive: true }], path: '' });
                }
            } else {
                return NextResponse.json({ items: [{ name: 'Root', path: '/', isDirectory: true, isDrive: true }], path: '/' });
            }
        }

        // Action: List Directory
        if (!currentPath) {
             currentPath = process.cwd();
        }

        // Fix path separators for Windows
        currentPath = path.normalize(currentPath);

        if (!fs.existsSync(currentPath)) {
            return NextResponse.json({ error: 'Path does not exist', path: currentPath }, { status: 404 });
        }
        
        const stats = fs.statSync(currentPath);
        if (!stats.isDirectory()) {
             return NextResponse.json({ error: 'Path is not a directory', path: currentPath }, { status: 400 });
        }

        let items: FileItem[] = [];
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            
            items = entries
                .filter(entry => entry.isDirectory())
                .map(entry => ({
                    name: entry.name,
                    path: path.join(currentPath!, entry.name),
                    isDirectory: true
                }))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        } catch (e: any) {
            if (e.code === 'EPERM' || e.code === 'EACCES') {
                return NextResponse.json({ error: 'Access Denied', items: [], path: currentPath }, { status: 403 });
            }
            throw e;
        }

        return NextResponse.json({ 
            path: currentPath,
            items
        });

    } catch (e: any) {
        console.error('Filesystem API Error', e);
        return NextResponse.json({ error: e.message || 'Unknown Error' }, { status: 500 });
    }
}

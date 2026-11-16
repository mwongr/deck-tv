import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { db } from '../../../../../server/db';

export const runtime = 'nodejs';

interface NetworkAddressInfo {
    name: string;
    address: string;
    family: string;
}

function getNetworkInterfaces(): { primaryIp: string | null; allIps: NetworkAddressInfo[] } {
    const interfaces = os.networkInterfaces();
    const allIps: NetworkAddressInfo[] = [];
    let primaryIp: string | null = null;

    for (const [name, netList] of Object.entries(interfaces)) {
        if (!netList) continue;
        for (const net of netList) {
            // Only IPv4, ignore internal loopback addresses
            if (net.family === 'IPv4' && !net.internal) {
                allIps.push({
                    name,
                    address: net.address,
                    family: net.family,
                });

                // Prioritize standard local private subnets
                if (!primaryIp) {
                    if (
                        net.address.startsWith('192.168.') ||
                        net.address.startsWith('10.') ||
                        /^172\.(1[6-9]|2\d|3[01])\./.test(net.address)
                    ) {
                        primaryIp = net.address;
                    }
                }
            }
        }
    }

    // If no private subnet matched, fallback to first non-internal IPv4
    if (!primaryIp && allIps.length > 0) {
        primaryIp = allIps[0].address;
    }

    return { primaryIp, allIps };
}

function getDataDir(): string {
    return process.env.DECKTV_DATA_DIR || path.join(process.cwd(), 'data');
}

function getConfigFile(): string {
    return path.join(getDataDir(), 'network-settings.json');
}

function readAllowRemoteSetting(): boolean {
    // 1. Try file first
    try {
        const configFile = getConfigFile();
        if (fs.existsSync(configFile)) {
            const data = fs.readJsonSync(configFile);
            if (typeof data?.allowRemote === 'boolean') {
                return data.allowRemote;
            }
        }
    } catch (e) {
        console.warn('Failed to read network-settings.json:', e);
    }

    // 2. Fallback to SQLite settings table
    try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'allow_remote_access'").get() as
            | { value: string }
            | undefined;
        if (row) {
            return row.value === 'true' || row.value === '1';
        }
    } catch (e) {
        console.warn('Failed to read setting from database:', e);
    }

    return false;
}

function saveAllowRemoteSetting(allowRemote: boolean): void {
    // 1. Save to SQLite
    try {
        db.prepare(`
            INSERT INTO settings (id, key, value)
            VALUES ('allow_remote_access', 'allow_remote_access', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(allowRemote ? 'true' : 'false');
    } catch (e) {
        console.error('Failed to save network setting to database:', e);
    }

    // 2. Save to file
    try {
        const dataDir = getDataDir();
        fs.ensureDirSync(dataDir);
        fs.writeJsonSync(
            getConfigFile(),
            {
                allowRemote,
                updatedAt: new Date().toISOString(),
            },
            { spaces: 2 }
        );
    } catch (e) {
        console.error('Failed to write network-settings.json:', e);
    }
}

export async function GET() {
    try {
        const allowRemote = readAllowRemoteSetting();
        const { primaryIp, allIps } = getNetworkInterfaces();
        const port = Number(process.env.PORT) || 38472;
        const currentHost = process.env.HOSTNAME || '127.0.0.1';
        const isListeningAll = currentHost === '0.0.0.0';
        const isElectron = Boolean(
            process.env.DECKTV_APP_DIR ||
            (process as any).versions?.electron ||
            (process as any).parentPort
        );

        const networkUrl = primaryIp ? `http://${primaryIp}:${port}` : null;
        const localUrl = `http://127.0.0.1:${port}`;
        const requiresRestart = isListeningAll !== allowRemote;

        return NextResponse.json({
            allowRemote,
            currentHost,
            isListeningAll,
            port,
            localIp: primaryIp,
            allIps,
            networkUrl,
            localUrl,
            isElectron,
            requiresRestart,
        });
    } catch (error: any) {
        console.error('Failed to get network status:', error);
        return NextResponse.json({ error: error.message || 'Failed to get network status' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Handle relaunch action
        if (body?.action === 'relaunch') {
            if ((process as any).parentPort) {
                console.log('Posting relaunch request to Electron parent process');
                (process as any).parentPort.postMessage({ type: 'relaunch' });
                return NextResponse.json({ success: true, relaunched: true });
            }
            return NextResponse.json(
                { success: false, error: 'Automatic relaunch is only supported in the desktop app. Please restart the server manually.' },
                { status: 400 }
            );
        }

        if (typeof body?.allowRemote !== 'boolean') {
            return NextResponse.json({ error: 'Missing or invalid allowRemote boolean' }, { status: 400 });
        }

        const allowRemote = body.allowRemote;
        saveAllowRemoteSetting(allowRemote);

        const { primaryIp } = getNetworkInterfaces();
        const port = Number(process.env.PORT) || 38472;
        const currentHost = process.env.HOSTNAME || '127.0.0.1';
        const isListeningAll = currentHost === '0.0.0.0';
        const requiresRestart = isListeningAll !== allowRemote;

        return NextResponse.json({
            success: true,
            allowRemote,
            requiresRestart,
            networkUrl: allowRemote && primaryIp ? `http://${primaryIp}:${port}` : null,
        });
    } catch (error: any) {
        console.error('Failed to update network settings:', error);
        return NextResponse.json({ error: error.message || 'Failed to update network settings' }, { status: 500 });
    }
}

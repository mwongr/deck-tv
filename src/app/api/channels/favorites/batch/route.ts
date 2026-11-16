import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../../server/db';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { channelIds } = body as { channelIds: string[] };

        if (!Array.isArray(channelIds)) {
            return NextResponse.json({ error: 'channelIds must be an array' }, { status: 400 });
        }

        const updateStmt = db.prepare('UPDATE channels SET favorite = 1 WHERE id = ?');

        const transaction = db.transaction((ids: string[]) => {
            ids.forEach(id => updateStmt.run(id));
        });

        transaction(channelIds);

        return NextResponse.json({ success: true, count: channelIds.length });

    } catch (error) {
        console.error('Failed to migrate favorites:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

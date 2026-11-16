import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, ids } = body as { type: 'channel' | 'group'; ids: string[] };

        if (!Array.isArray(ids) || (type !== 'channel' && type !== 'group')) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
        }

        const table = type === 'channel' ? 'channels' : 'groups';
        const updateStmt = db.prepare(`UPDATE ${table} SET favorite_order = ? WHERE id = ?`);

        const transaction = db.transaction((idList: string[]) => {
            idList.forEach((id, index) => {
                updateStmt.run(index + 1, id);
            });
        });

        transaction(ids);

        return NextResponse.json({ success: true, count: ids.length });
    } catch (error) {
        console.error('Failed to update favorite order:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}

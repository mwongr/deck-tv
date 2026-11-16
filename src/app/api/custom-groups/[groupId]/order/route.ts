import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../../server/db';

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const body = await req.json();
        const { channelIds } = body as { channelIds: string[] };

        if (!Array.isArray(channelIds)) {
            return NextResponse.json({ error: 'channelIds must be an array' }, { status: 400 });
        }

        const updateStmt = db.prepare('UPDATE custom_group_items SET sort_order = ? WHERE custom_group_id = ? AND channel_id = ?');

        const tx = db.transaction((ids: string[]) => {
            ids.forEach((id, index) => {
                updateStmt.run(index + 1, groupId, id);
            });
        });

        tx(channelIds);

        return NextResponse.json({ success: true, count: channelIds.length });
    } catch (error) {
        console.error('Failed to reorder custom group items:', error);
        return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
    }
}

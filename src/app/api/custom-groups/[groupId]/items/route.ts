import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../../server/db';
import { randomUUID } from 'crypto';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const body = await req.json();
        const { channelIds } = body as { channelIds: string[] };

        if (!Array.isArray(channelIds) || channelIds.length === 0) {
            return NextResponse.json({ error: 'channelIds array required' }, { status: 400 });
        }

        const group = db.prepare('SELECT * FROM custom_groups WHERE id = ?').get(groupId) as any;
        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        const maxRow = db.prepare('SELECT MAX(sort_order) as maxOrder FROM custom_group_items WHERE custom_group_id = ?').get(groupId) as { maxOrder: number | null };
        let nextOrder = (maxRow?.maxOrder ?? 0) + 1;

        const checkExisting = db.prepare('SELECT id FROM custom_group_items WHERE custom_group_id = ? AND channel_id = ?');
        const insertStmt = db.prepare(`
            INSERT INTO custom_group_items (id, custom_group_id, channel_id, tvg_id, name, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const channelLookup = db.prepare('SELECT id, tvg_id, name FROM channels WHERE id = ?');

        const tx = db.transaction((ids: string[]) => {
            let insertedCount = 0;
            for (const chId of ids) {
                const exists = checkExisting.get(groupId, chId);
                if (exists) continue;

                const chInfo = channelLookup.get(chId) as any;
                if (!chInfo) continue;

                insertStmt.run(
                    randomUUID(),
                    groupId,
                    chInfo.id,
                    chInfo.tvg_id,
                    chInfo.name,
                    nextOrder++
                );
                insertedCount++;
            }
            return insertedCount;
        });

        const count = tx(channelIds);

        return NextResponse.json({ success: true, added: count });
    } catch (error) {
        console.error('Failed to add items to custom group:', error);
        return NextResponse.json({ error: 'Failed to add items' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const body = await req.json();
        const { channelIds } = body as { channelIds: string[] };

        if (!Array.isArray(channelIds) || channelIds.length === 0) {
            return NextResponse.json({ error: 'channelIds array required' }, { status: 400 });
        }

        const deleteStmt = db.prepare('DELETE FROM custom_group_items WHERE custom_group_id = ? AND channel_id = ?');

        const tx = db.transaction((ids: string[]) => {
            ids.forEach(id => deleteStmt.run(groupId, id));
        });

        tx(channelIds);

        return NextResponse.json({ success: true, removed: channelIds.length });
    } catch (error) {
        console.error('Failed to remove items from custom group:', error);
        return NextResponse.json({ error: 'Failed to remove items' }, { status: 500 });
    }
}

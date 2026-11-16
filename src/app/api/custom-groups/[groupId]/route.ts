import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';
import { randomUUID } from 'crypto';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;

        const group = db.prepare('SELECT * FROM custom_groups WHERE id = ?').get(groupId) as any;
        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        // Fetch channel items assigned to this group
        const items = db.prepare(`
            SELECT c.*, cgi.id as group_item_id, cgi.sort_order as group_sort_order
            FROM custom_group_items cgi
            JOIN channels c ON cgi.channel_id = c.id
            WHERE cgi.custom_group_id = ?
            ORDER BY cgi.sort_order ASC, c.name ASC
        `).all(groupId) as any[];

        const mappedItems = items.map(c => ({
            id: c.id,
            groupItemId: c.group_item_id,
            sourceId: c.source_id,
            name: c.name,
            logo: c.logo,
            url: c.url,
            groupId: c.group_id,
            groupName: c.group_name,
            tvgId: c.tvg_id,
            tvgName: c.tvg_name,
            favorite: c.favorite,
            catchupSupported: !!c.catchup_supported,
            catchupDays: c.catchup_days,
            catchupSource: c.catchup_source
        }));

        return NextResponse.json({
            group: {
                id: group.id,
                name: group.name,
                type: group.type,
                sortOrder: group.sort_order,
                itemCount: items.length
            },
            items: mappedItems
        });
    } catch (error) {
        console.error('Failed to get custom group details:', error);
        return NextResponse.json({ error: 'Failed to get custom group' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const body = await req.json();
        const { name } = body;

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
        }

        db.prepare('UPDATE custom_groups SET name = ? WHERE id = ?').run(name.trim(), groupId);

        return NextResponse.json({ success: true, name: name.trim() });
    } catch (error) {
        console.error('Failed to update custom group:', error);
        return NextResponse.json({ error: 'Failed to update custom group' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;

        db.prepare('DELETE FROM custom_groups WHERE id = ?').run(groupId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete custom group:', error);
        return NextResponse.json({ error: 'Failed to delete custom group' }, { status: 500 });
    }
}

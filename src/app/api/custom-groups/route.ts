import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/db';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type'); // optional filter: 'live', 'movie', 'series'

        let query = `
            SELECT cg.*, 
            (SELECT COUNT(*) FROM custom_group_items WHERE custom_group_items.custom_group_id = cg.id) as item_count 
            FROM custom_groups cg
        `;
        const params: any[] = [];

        if (type) {
            query += ' WHERE cg.type = ?';
            params.push(type);
        }

        query += ' ORDER BY cg.sort_order ASC, cg.created_at ASC';

        const rows = db.prepare(query).all(...params) as any[];

        const groups = rows.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            sortOrder: r.sort_order,
            itemCount: r.item_count,
            createdAt: r.created_at
        }));

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Failed to fetch custom groups:', error);
        return NextResponse.json({ error: 'Failed to fetch custom groups' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, type } = body;

        if (!name || typeof name !== 'string' || !['live', 'movie', 'series'].includes(type)) {
            return NextResponse.json({ error: 'Invalid name or type (must be live, movie, or series)' }, { status: 400 });
        }

        const maxRow = db.prepare('SELECT MAX(sort_order) as maxOrder FROM custom_groups WHERE type = ?').get(type) as { maxOrder: number | null };
        const sortOrder = (maxRow?.maxOrder ?? 0) + 1;

        const id = randomUUID();
        db.prepare(`
            INSERT INTO custom_groups (id, name, type, sort_order)
            VALUES (?, ?, ?, ?)
        `).run(id, name.trim(), type, sortOrder);

        return NextResponse.json({
            group: {
                id,
                name: name.trim(),
                type,
                sortOrder,
                itemCount: 0
            }
        });
    } catch (error) {
        console.error('Failed to create custom group:', error);
        return NextResponse.json({ error: 'Failed to create custom group' }, { status: 500 });
    }
}

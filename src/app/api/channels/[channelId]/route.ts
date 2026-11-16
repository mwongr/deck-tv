import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../server/db';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ channelId: string }> }
) {
    try {
        const { channelId } = await params;
        const body = await request.json();

        if (typeof body.favorite !== 'number') {
            return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
        }

        const isFav = body.favorite ? 1 : 0;
        const now = new Date().toISOString();

        let result;
        if (isFav) {
            const maxRow = db.prepare('SELECT MAX(favorite_order) as maxOrder FROM channels WHERE favorite = 1').get() as { maxOrder: number | null };
            const nextOrder = (maxRow?.maxOrder ?? 0) + 1;
            result = db.prepare(`
                UPDATE channels 
                SET favorite = 1, favorite_order = ?, favorited_at = ? 
                WHERE id = ?
            `).run(nextOrder, now, channelId);
        } else {
            result = db.prepare(`
                UPDATE channels 
                SET favorite = 0, favorite_order = 0, favorited_at = NULL 
                WHERE id = ?
            `).run(channelId);
        }

        if (result.changes === 0) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, favorite: isFav });
    } catch (error) {
        console.error('Failed to update channel:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { XtreamClient } from '@/lib/parsers/xtream-client';
import { db } from '../../../../server/db';
import { PlaylistSource } from '@/lib/db';

export async function GET(request: NextRequest) {
    const seriesId = request.nextUrl.searchParams.get('seriesId');
    const sourceId = request.nextUrl.searchParams.get('sourceId');

    if (!seriesId || !sourceId) {
        return NextResponse.json({ error: 'Missing parameters: seriesId and sourceId required' }, { status: 400 });
    }

    try {
        const source = db.prepare('SELECT * FROM playlist_sources WHERE id = ?').get(sourceId) as any;

        if (!source || source.type !== 'XTREAM') {
            return NextResponse.json({ error: 'Source not found or invalid type' }, { status: 404 });
        }

        const client = new XtreamClient({
            server: source.url || source.server, // handle schema variations
            username: source.username,
            password: source.password,
        });

        const seriesInfo = await client.getSeriesInfo(parseInt(seriesId));

        if (!seriesInfo) {
            return NextResponse.json({ error: 'Series not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...seriesInfo,
            // Return base URL components for client to build stream URLs if needed, 
            // but ideally client shouldn't need credentials. 
            // For now, mirroring previous behavior but source comes from DB.
            baseUrl: source.url || source.server,
            username: source.username,
            password: source.password,
        });

    } catch (error) {
        console.error('Series info error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch series info' },
            { status: 500 }
        );
    }
}

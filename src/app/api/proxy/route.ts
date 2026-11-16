
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch resource: ${response.statusText}` },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // Return stream directly to preserve binary data (e.g. GZIP)
        return new NextResponse(response.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch resource' },
            { status: 500 }
        );
    }
}

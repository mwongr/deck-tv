import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/mwongr/deck-tv/releases/latest';

export async function GET() {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Deck-TV-App',
      },
    });

    if (res.status === 404) {
      // No published releases yet
      return NextResponse.json({ latest_version: '' });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API responded with ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const latestVersion = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/i, '') : '';

    return NextResponse.json({
      latest_version: latestVersion,
      release_date: data.published_at || undefined,
      release_notes: data.body || undefined,
      github_url: data.html_url || 'https://github.com/mwongr/deck-tv/releases',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

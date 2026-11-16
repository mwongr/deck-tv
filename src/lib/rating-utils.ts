/**
 * Rating Utilities for Movies & Series
 * Supports parsing ratings from Xtream Codes API data and playlist media titles.
 */

/**
 * Extracts a rating (out of 10) from a media title string.
 * Common formats in IPTV playlists:
 * - [IMDb 8.2], (IMDB: 7.9), [Rating: 8.0], IMDb 7.5
 * - ⭐ 8.2, ★ 7.5
 * - (8.4/10), [7.9/10], 8.2/10
 * - [7.8], [8.0] (bracketed decimal ratings, avoiding 4-digit years like [2022])
 */
export function extractRatingFromTitle(title: string): number | null {
    if (!title || typeof title !== 'string') return null;

    // Pattern 1: Explicit IMDb / Rating tag: e.g. [IMDb 7.8], (IMDb: 8.2), IMDb: 7.5, IMDb 8, [IMDB: 9]
    const imdbMatch = title.match(/(?:IMDb|IMDB|Rating)\s*[:=]?\s*[★⭐]?\s*(\d{1,2}(?:\.\d{1,2})?)(?:\s*\/\s*10)?/i);
    if (imdbMatch) {
        const val = parseFloat(imdbMatch[1]);
        if (!isNaN(val) && val > 0 && val <= 10) {
            return Math.round(val * 10) / 10;
        }
    }

    // Pattern 2: Star rating: e.g. ★ 8.2, ⭐ 7.5
    const starMatch = title.match(/[★⭐]\s*(\d{1,2}(?:\.\d{1,2})?)(?:\s*\/\s*10)?/);
    if (starMatch) {
        const val = parseFloat(starMatch[1]);
        if (!isNaN(val) && val > 0 && val <= 10) {
            return Math.round(val * 10) / 10;
        }
    }

    // Pattern 3: Number over 10: e.g. (7.8/10), [8.5/10], 8.5/10
    const outOfTenMatch = title.match(/(\d{1,2}(?:\.\d{1,2})?)\s*\/\s*10/);
    if (outOfTenMatch) {
        const val = parseFloat(outOfTenMatch[1]);
        if (!isNaN(val) && val > 0 && val <= 10) {
            return Math.round(val * 10) / 10;
        }
    }

    // Pattern 4: Square brackets containing a decimal rating: e.g. [7.8] or [8.4] (avoids year [2022])
    const bracketMatch = title.match(/\[\s*(\d\.\d{1,2})\s*\]/);
    if (bracketMatch) {
        const val = parseFloat(bracketMatch[1]);
        if (!isNaN(val) && val > 0 && val <= 10) {
            return Math.round(val * 10) / 10;
        }
    }

    return null;
}

/**
 * Parses and normalizes Xtream Codes API rating fields.
 * Xtream gives `rating` (string, e.g. "7.5", "0") and `rating_5based` (number, e.g. 3.75).
 */
export function parseXtreamRating(
    rating?: string | number | null,
    rating5Based?: number | null
): number | null {
    if (rating !== undefined && rating !== null && rating !== '') {
        const val = typeof rating === 'number' ? rating : parseFloat(String(rating));
        if (!isNaN(val) && val > 0 && val <= 10) {
            return Math.round(val * 10) / 10;
        }
    }

    if (rating5Based !== undefined && rating5Based !== null) {
        const num5 = Number(rating5Based);
        if (!isNaN(num5) && num5 > 0 && num5 <= 5) {
            const val = num5 * 2;
            if (val > 0 && val <= 10) {
                return Math.round(val * 10) / 10;
            }
        }
    }

    return null;
}

/**
 * Returns the effective numeric rating (0 if unrated) for sorting and display.
 */
export function getRatingValue(item: { rating?: number | string | null; name: string }): number {
    if (item.rating != null && item.rating !== '') {
        const num = typeof item.rating === 'number' ? item.rating : parseFloat(String(item.rating));
        if (!isNaN(num) && num > 0) {
            return Math.round(num * 10) / 10;
        }
    }
    const fromTitle = extractRatingFromTitle(item.name);
    return fromTitle ?? 0;
}

/**
 * Strips year, resolution tags, and rating tags from a title for clean alphabetical sorting and display.
 */
export function cleanMediaTitle(title: string): string {
    if (!title) return '';
    return title
        .replace(/\s*\(\d{4}\)\s*/g, ' ')
        .replace(/\s*\[\d{4}\]\s*/g, ' ')
        .replace(/\[\s*(?:IMDb|IMDB|Rating)?\s*[:=]?\s*[★⭐]?\s*\d+(?:\.\d+)?(?:\s*\/\s*10)?\s*\]/gi, ' ')
        .replace(/\(\s*(?:IMDb|IMDB|Rating)\s*[:=]?\s*[★⭐]?\s*\d+(?:\.\d+)?(?:\s*\/\s*10)?\s*\)/gi, ' ')
        .replace(/[★⭐]\s*\d+(?:\.\d+)?/g, ' ')
        .replace(/\[\s*\d\.\d+\s*\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

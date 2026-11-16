/**
 * Utility functions for EPG (Electronic Program Guide) data processing,
 * deduplication, and timeline conflict resolution.
 */

/**
 * Normalizes an array of EPG programs for a channel timeline:
 * 1. Filters out invalid programs (inverted or NaN timestamps)
 * 2. Deduplicates concurrent listings (e.g. from multiple EPG sources) by picking the most informative one
 * 3. Resolves overlapping intervals by clamping earlier programs so they end cleanly when the next program begins
 * 4. Ensures chronological non-overlapping slots for layout rendering
 */
export function normalizeEPGPrograms<T extends {
    start: Date | string;
    end: Date | string;
    title?: string;
    description?: string;
    icon?: string;
    category?: string;
}>(programs: T[]): T[] {
    if (!programs || programs.length === 0) return [];

    const getTime = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

    // 1. Filter out invalid programs
    const valid = programs.filter(p => {
        if (!p || !p.start || !p.end) return false;
        const s = getTime(p.start);
        const e = getTime(p.end);
        return !isNaN(s) && !isNaN(e) && e > s;
    });

    if (valid.length === 0) return [];

    // Helper to evaluate completeness/quality of program info
    const getScore = (p: T) => {
        let score = (p.title?.length || 0) + (p.description?.length || 0);
        const t = (p.title || '').toLowerCase();
        if (t.includes('live') || t.includes('ᴸᶦᵛᵉ')) score += 50;
        if (p.icon) score += 10;
        if (p.category) score += 5;
        return score;
    };

    // 2. Sort by start time ASC, then quality score DESC
    const sorted = [...valid].sort((a, b) => {
        const diff = getTime(a.start) - getTime(b.start);
        if (diff !== 0) return diff;
        return getScore(b) - getScore(a);
    });

    // 3. Sequentially process and resolve overlaps
    const result: T[] = [];

    for (const prog of sorted) {
        const progStart = getTime(prog.start);

        if (result.length === 0) {
            result.push({ ...prog });
            continue;
        }

        const prevIndex = result.length - 1;
        const prev = result[prevIndex];
        const prevStart = getTime(prev.start);
        const prevEnd = getTime(prev.end);

        // A. Same or nearly same start time (within 60 seconds) -> Duplicate conflict
        if (Math.abs(progStart - prevStart) < 60000) {
            if (getScore(prog) > getScore(prev)) {
                result[prevIndex] = { ...prog };
            }
            continue;
        }

        // B. Previous program overlaps into current program
        if (prevEnd > progStart) {
            // Shorten previous program to end cleanly when current starts
            const newPrevEnd = (prev.end instanceof Date)
                ? new Date(progStart)
                : new Date(progStart).toISOString();

            prev.end = newPrevEnd as any;

            // If shortening made previous program invalid (start >= end), remove it
            if (getTime(prev.end) <= getTime(prev.start)) {
                result.pop();
            }
        }

        result.push({ ...prog });
    }

    return result.filter(p => getTime(p.end) > getTime(p.start));
}

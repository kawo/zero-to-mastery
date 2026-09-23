// Chapters ------------------------------------- //
// Chapters come from a Podcasting 2.0 chapters file when the episode has one
// (<podcast:chapters> in the feed, chaptersUrl from Podcast Index), and
// otherwise from timestamps written in the show notes ("12:34 Interview").
// Both sources are messy, so every list is cleaned before it's used.
const Chapters = (() => {
    const cache = new Map(); // chapters file URL -> parsed chapters

    // "1:02:03", "62:03" or "3:05" -> seconds; null if it isn't a real time
    function parseTime(text) {
        const parts = String(text).trim().split(':');
        if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return null;
        const numbers = parts.map(Number);
        const seconds = numbers[numbers.length - 1];
        if (seconds > 59) return null;
        if (numbers.length === 3 && numbers[1] > 59) return null;
        return numbers.reduce((total, part) => total * 60 + part, 0);
    }

    function formatTime(totalSeconds) {
        const time = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = String(time % 60).padStart(2, '0');
        return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
    }

    function safeUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
        } catch (error) {
            return '';
        }
    }

    // Drops entries without a usable start time, sorts them, and keeps one
    // chapter per second
    function clean(list) {
        const seen = new Set();
        return list
            .filter(chapter => Number.isFinite(chapter.startTime) && chapter.startTime >= 0)
            .map(chapter => ({
                startTime: chapter.startTime,
                title: (chapter.title || '').trim() || `Chapter at ${formatTime(chapter.startTime)}`,
                url: chapter.url ? safeUrl(chapter.url) : ''
            }))
            .sort((a, b) => a.startTime - b.startTime)
            .filter(chapter => {
                const second = Math.floor(chapter.startTime);
                if (seen.has(second)) return false;
                seen.add(second);
                return true;
            });
    }

    // Podcasting 2.0 JSON chapters: { chapters: [{ startTime, title, url, toc }] }
    function fromJson(data) {
        const list = data && Array.isArray(data.chapters) ? data.chapters : [];
        return clean(list
            // toc: false marks a chapter meant for artwork/links only, not the list
            .filter(chapter => chapter && typeof chapter === 'object' && chapter.toc !== false)
            .map(chapter => ({
                startTime: typeof chapter.startTime === 'string' ? Number(chapter.startTime) : chapter.startTime,
                title: typeof chapter.title === 'string' ? chapter.title : '',
                url: typeof chapter.url === 'string' ? chapter.url : ''
            })));
    }

    const TIME = '((?:\\d{1,2}:)?\\d{1,3}:\\d{2})';
    // "12:34 Title", "[12:34] - Title", "(1:02:03) Title"
    const LEADING = new RegExp(`^\\s*[(\\[]?${TIME}[)\\]]?\\s*(?:[-–—:|.]\\s*)?(.*)$`);
    // "Title - 12:34", "Title (12:34)"
    const TRAILING = new RegExp(`^(.*?)\\s*[-–—:(\\[]?\\s*${TIME}[)\\]]?\\s*$`);

    // Show notes as plain text, one line per paragraph, list item or <br>
    function notesToText(html) {
        const withBreaks = String(html || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|li|div|h[1-6])>/gi, '\n');
        const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
        return doc.body.textContent || '';
    }

    // A timestamp list needs at least two entries, in order; anything out of
    // order is a stray time in the text ("recorded at 10:30"), not a chapter
    function fromNotes(html) {
        const found = [];
        notesToText(html).split('\n').forEach(line => {
            const leading = LEADING.exec(line);
            const trailing = !leading && TRAILING.exec(line);
            const match = leading ? { time: leading[1], title: leading[2] } : trailing ? { time: trailing[2], title: trailing[1] } : null;
            if (!match) return;
            const startTime = parseTime(match.time);
            if (startTime === null) return;
            const previous = found[found.length - 1];
            if (previous && startTime <= previous.startTime) return;
            found.push({ startTime, title: match.title.replace(/^[-–—:|.\s]+|[-–—:|.\s]+$/g, '') });
        });
        return found.length >= 2 ? clean(found) : [];
    }

    async function fetchFile(url) {
        if (cache.has(url)) return cache.get(url);
        const response = await fetch(`/api/chapters?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error(`Chapters file unavailable (${response.status})`);
        const chapters = fromJson(JSON.parse(await response.text()));
        cache.set(url, chapters);
        return chapters;
    }

    // Returns { chapters, source } where source is 'file', 'notes' or 'none'.
    // A chapters file that's missing, offline or broken falls back to the notes.
    async function load(episode) {
        if (episode.chaptersUrl) {
            try {
                const chapters = await fetchFile(episode.chaptersUrl);
                if (chapters.length) return { chapters, source: 'file' };
            } catch (error) {
                console.warn('Could not load chapters file, using show notes instead:', error.message);
            }
        }
        const chapters = fromNotes(episode.description);
        return { chapters, source: chapters.length ? 'notes' : 'none' };
    }

    // Index of the chapter playing at a given time, or -1 before the first one
    function indexAt(chapters, time) {
        let index = -1;
        for (let i = 0; i < chapters.length && chapters[i].startTime <= time + 0.25; i++) index = i;
        return index;
    }

    return { load, fromJson, fromNotes, parseTime, formatTime, indexAt };
})();

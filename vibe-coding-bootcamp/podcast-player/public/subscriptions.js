// Subscriptions -------------------------------- //
// A library of RSS/Atom feeds the listener subscribed to, stored in IndexedDB
// with their episodes so the library still opens offline. Feeds are fetched
// through the server's /api/feed proxy and parsed here.
const Subscriptions = (() => {
    const DB_NAME = 'podcast-library';
    const STALE_AFTER_MS = 60 * 60 * 1000; // refresh feeds older than an hour
    const IMPORT_CONCURRENCY = 4;
    let dbPromise;

    // IndexedDB helpers
    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('feeds', { keyPath: 'url' });
                    const episodes = request.result.createObjectStore('episodes', { keyPath: 'id' });
                    episodes.createIndex('feedUrl', 'feedUrl');
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return dbPromise;
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function transactionDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }

    async function get(url) {
        const db = await openDb();
        return requestResult(db.transaction('feeds').objectStore('feeds').get(url));
    }

    async function list() {
        const db = await openDb();
        const feeds = await requestResult(db.transaction('feeds').objectStore('feeds').getAll());
        return feeds.sort((a, b) => a.title.localeCompare(b.title));
    }

    async function episodes(feedUrl) {
        const db = await openDb();
        const index = db.transaction('episodes').objectStore('episodes').index('feedUrl');
        const items = await requestResult(index.getAll(feedUrl));
        return items.sort((a, b) => (b.datePublished || 0) - (a.datePublished || 0));
    }

    // Feed parsing
    function normalizeUrl(input) {
        let text = String(input || '').trim();
        if (/^(feed|pcast|itpc|podcast):\/\//i.test(text)) text = text.replace(/^[a-z]+:\/\//i, 'https://');
        if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
        const url = new URL(text);
        return url.href;
    }

    // HTML entities feeds use most, as character codes
    const HTML_ENTITIES = {
        nbsp: 160, copy: 169, reg: 174, trade: 8482, hellip: 8230,
        ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221
    };

    function parseXml(text) {
        const parse = source => {
            const doc = new DOMParser().parseFromString(source, 'application/xml');
            return doc.getElementsByTagName('parsererror').length ? null : doc;
        };
        // The most common feed errors are a bare "&" and HTML entities like
        // &nbsp; that XML doesn't define; escape those and try again
        return parse(text) || parse(text
            .replace(/&([a-z]+);/gi, (match, name) => (HTML_ENTITIES[name] ? `&#${HTML_ENTITIES[name]};` : match))
            .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;'));
    }

    // Matches elements by local name, whatever namespace prefix a feed uses
    function children(parent, name) {
        return Array.from(parent ? parent.children : []).filter(el => el.localName === name);
    }

    // With attr, takes the first match that has it: feeds often carry both
    // <image> and <itunes:image>, which share a local name
    function child(parent, name, attr) {
        const matches = children(parent, name);
        if (attr) {
            const el = matches.find(match => match.hasAttribute(attr));
            return el ? el.getAttribute(attr).trim() : '';
        }
        return matches[0] ? (matches[0].textContent || '').trim() : '';
    }

    function toSeconds(dateText) {
        const time = Date.parse(dateText);
        return Number.isNaN(time) ? 0 : Math.floor(time / 1000);
    }

    function parseDuration(text) {
        if (!text) return 0;
        if (/^\d+$/.test(text)) return Number(text);
        return text.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
    }

    function absolute(link, base) {
        try {
            return link ? new URL(link, base).href : '';
        } catch (error) {
            return '';
        }
    }

    function parseRss(channel, feedUrl) {
        const image = absolute(child(channel, 'image', 'href') || child(children(channel, 'image')[0], 'url'), feedUrl);
        const feed = {
            title: child(channel, 'title') || feedUrl,
            description: child(channel, 'summary') || child(channel, 'description'),
            author: child(channel, 'author'),
            image
        };
        const items = children(channel, 'item').map(item => {
            const enclosure = children(item, 'enclosure')[0];
            const audioUrl = absolute(enclosure && enclosure.getAttribute('url'), feedUrl);
            if (!audioUrl) return null;
            const guid = child(item, 'guid') || audioUrl;
            return {
                guid,
                title: child(item, 'title') || 'Untitled episode',
                description: child(item, 'encoded') || child(item, 'description') || child(item, 'summary'),
                datePublished: toSeconds(child(item, 'pubDate')),
                enclosureUrl: audioUrl,
                enclosureLength: Number(enclosure.getAttribute('length')) || null,
                duration: parseDuration(child(item, 'duration')),
                image: absolute(child(item, 'image', 'href'), feedUrl),
                // Podcasting 2.0 <podcast:chapters url="...">
                chaptersUrl: absolute(child(item, 'chapters', 'url'), feedUrl)
            };
        });
        return { feed, items };
    }

    function parseAtom(root, feedUrl) {
        const logo = child(root, 'logo') || child(root, 'icon') || child(root, 'image', 'href');
        const feed = {
            title: child(root, 'title') || feedUrl,
            description: child(root, 'subtitle'),
            author: child(children(root, 'author')[0], 'name'),
            image: absolute(logo, feedUrl)
        };
        const items = children(root, 'entry').map(entry => {
            const enclosure = children(entry, 'link').find(link => link.getAttribute('rel') === 'enclosure');
            const audioUrl = absolute(enclosure && enclosure.getAttribute('href'), feedUrl);
            if (!audioUrl) return null;
            return {
                guid: child(entry, 'id') || audioUrl,
                title: child(entry, 'title') || 'Untitled episode',
                description: child(entry, 'content') || child(entry, 'summary'),
                datePublished: toSeconds(child(entry, 'published') || child(entry, 'updated')),
                enclosureUrl: audioUrl,
                enclosureLength: Number(enclosure.getAttribute('length')) || null,
                duration: parseDuration(child(entry, 'duration')),
                image: ''
            };
        });
        return { feed, items };
    }

    function parseFeed(text, feedUrl) {
        const doc = parseXml(text);
        if (!doc) throw new Error("This feed's XML is broken and can't be read");

        const root = doc.documentElement;
        let parsed;
        if (root.localName === 'rss' || root.localName === 'RDF') {
            const channel = children(root, 'channel')[0];
            if (!channel) throw new Error('This feed has no channel');
            // RSS 1.0 (RDF) puts items beside the channel rather than inside it
            parsed = parseRss(root.localName === 'RDF' ? root : channel, feedUrl);
            if (root.localName === 'RDF') Object.assign(parsed.feed, parseRss(channel, feedUrl).feed);
        } else if (root.localName === 'feed') {
            parsed = parseAtom(root, feedUrl);
        } else if (root.localName === 'html') {
            throw new Error("That's a web page, not a podcast feed. Look for the RSS link on the podcast's site.");
        } else {
            throw new Error("That URL isn't an RSS or Atom feed");
        }

        parsed.items = parsed.items.filter(Boolean);
        if (parsed.items.length === 0) throw new Error('This feed has no episodes with audio');
        return parsed;
    }

    async function fetchFeed(url) {
        let response;
        try {
            response = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
        } catch (error) {
            throw new Error("Couldn't reach the server. Check your connection.");
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Couldn't load the feed (${response.status})`);
        }
        const text = await response.text();
        // A parsed HTML page has no root <html> in XML mode, so catch it here
        if (/^\s*(<!doctype html|<html)/i.test(text)) {
            throw new Error("That's a web page, not a podcast feed. Look for the RSS link on the podcast's site.");
        }
        return parseFeed(text, url);
    }

    // Library
    async function save(url, parsed, existing) {
        const db = await openDb();
        const tx = db.transaction(['feeds', 'episodes'], 'readwrite');
        const feed = {
            ...existing,
            ...parsed.feed,
            url,
            addedAt: existing ? existing.addedAt : Date.now(),
            lastChecked: Date.now(),
            error: '',
            episodeCount: parsed.items.length
        };
        tx.objectStore('feeds').put(feed);
        const episodeStore = tx.objectStore('episodes');
        parsed.items.forEach(item => {
            episodeStore.put({
                ...item,
                id: `${url}#${item.guid}`,
                feedUrl: url,
                feedTitle: feed.title,
                feedImage: feed.image
            });
        });
        await transactionDone(tx);
        return feed;
    }

    async function subscribe(input) {
        const url = normalizeUrl(input);
        const existing = await get(url);
        if (existing) return { feed: existing, added: false };
        const parsed = await fetchFeed(url);
        return { feed: await save(url, parsed, null), added: true };
    }

    async function unsubscribe(url) {
        const db = await openDb();
        const tx = db.transaction(['feeds', 'episodes'], 'readwrite');
        tx.objectStore('feeds').delete(url);
        const episodeStore = tx.objectStore('episodes');
        const keys = episodeStore.index('feedUrl').getAllKeys(url);
        keys.onsuccess = () => keys.result.forEach(key => episodeStore.delete(key));
        await transactionDone(tx);
    }

    // A failed refresh keeps the episodes already saved and records the error
    async function refresh(url) {
        const existing = await get(url);
        if (!existing) return null;
        try {
            return await save(url, await fetchFeed(url), existing);
        } catch (error) {
            const db = await openDb();
            const tx = db.transaction('feeds', 'readwrite');
            const feed = { ...existing, lastChecked: Date.now(), error: error.message };
            tx.objectStore('feeds').put(feed);
            await transactionDone(tx);
            return feed;
        }
    }

    async function runLimited(items, limit, task) {
        const queue = [...items];
        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
            while (queue.length) await task(queue.shift());
        });
        await Promise.all(workers);
    }

    async function refreshStale(force = false) {
        const feeds = await list();
        const stale = feeds.filter(feed => force || Date.now() - feed.lastChecked > STALE_AFTER_MS);
        await runLimited(stale, IMPORT_CONCURRENCY, feed => refresh(feed.url));
        return stale.length;
    }

    // OPML
    function escapeXml(text) {
        return String(text || '').replace(/[<>&"']/g, ch => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
        })[ch]);
    }

    async function exportOpml() {
        const feeds = await list();
        const outlines = feeds.map(feed =>
            `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />`
        ).join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Podcast Player subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
    }

    // Returns counts plus each feed that failed and why
    async function importOpml(text, onProgress) {
        const doc = parseXml(text);
        if (!doc || doc.documentElement.localName !== 'opml') {
            throw new Error("That file isn't a valid OPML file");
        }
        // Outlines can be nested in folders, so search the whole document
        const urls = [...new Set(Array.from(doc.getElementsByTagName('outline'))
            .map(outline => outline.getAttribute('xmlUrl') || outline.getAttribute('xmlurl'))
            .filter(Boolean)
            .map(url => {
                try {
                    return normalizeUrl(url);
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean))];
        if (urls.length === 0) throw new Error('That OPML file has no feeds in it');

        const result = { total: urls.length, added: 0, existing: 0, failed: [] };
        let done = 0;
        await runLimited(urls, IMPORT_CONCURRENCY, async url => {
            try {
                const { added } = await subscribe(url);
                result[added ? 'added' : 'existing']++;
            } catch (error) {
                result.failed.push({ url, error: error.message });
            }
            done++;
            if (onProgress) onProgress(done, urls.length);
        });
        return result;
    }

    return {
        list, get, episodes, subscribe, unsubscribe, refresh, refreshStale,
        exportOpml, importOpml, parseFeed, normalizeUrl
    };
})();

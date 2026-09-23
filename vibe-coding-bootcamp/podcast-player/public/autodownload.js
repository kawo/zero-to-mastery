// Auto-download & auto-prune ------------------- //
// For podcasts with auto-download on, new episodes are downloaded while the
// app is open: at startup, every 30 minutes, when the tab comes back into
// view, and when the connection returns. Old auto-downloads are pruned by
// age and by a storage limit. Nothing runs while the app is closed.
//
// Only downloads this module started (record.auto) are ever pruned; episodes
// downloaded by hand, the one playing and anything queued are left alone.
const AutoDownload = (() => {
    const SETTINGS_KEY = 'autoDownloadSettings';
    const DEFAULTS = {
        keepDays: 7,         // 0 = keep until the storage limit needs the space
        maxStorageMB: 2048,  // 0 = no limit
        perFeed: 2,          // newest new episodes fetched per podcast per check
        wifiOnly: true
    };
    const CHECK_EVERY_MS = 30 * 60 * 1000;
    const FEED_STALE_MS = 30 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const MB = 1024 * 1024;
    const listeners = new Set();
    let running = null;
    let lastResult = null;

    function getSettings() {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
        } catch (error) {
            return { ...DEFAULTS };
        }
    }

    function saveSettings(patch) {
        const settings = { ...getSettings(), ...patch };
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('Could not save auto-download settings:', error);
        }
        return settings;
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function notify(result) {
        lastResult = result;
        listeners.forEach(listener => listener(result));
    }

    // Battery and data: these APIs exist only in some browsers (Chromium,
    // mostly on Android). Where they don't, nothing is blocked.
    async function whyNotDownload(settings) {
        if (!navigator.onLine) return 'offline';
        const connection = navigator.connection;
        if (connection) {
            if (connection.saveData) return 'Data Saver is on';
            if (settings.wifiOnly && connection.type === 'cellular') return 'on mobile data (Wi-Fi only is on)';
        }
        if (navigator.getBattery) {
            try {
                const battery = await navigator.getBattery();
                if (!battery.charging && battery.level < 0.2) return 'battery is below 20%';
            } catch (error) {
                // Battery status unavailable; don't block on it
            }
        }
        return '';
    }

    // Deletes auto-downloads past their age, then oldest-first until the total
    // is under the storage limit. Returns how many were removed.
    async function prune(settings, protectedIds) {
        const records = await Downloads.list();
        const now = Date.now();
        const prunable = record => record.auto && record.status === 'complete' && !protectedIds.has(record.id);
        const removed = new Set();

        if (settings.keepDays > 0) {
            const cutoff = now - settings.keepDays * DAY_MS;
            for (const record of records) {
                if (prunable(record) && (record.completedAt || record.createdAt) < cutoff) {
                    await Downloads.remove(record.id);
                    removed.add(record.id);
                }
            }
        }

        if (settings.maxStorageMB > 0) {
            const limit = settings.maxStorageMB * MB;
            let total = records.filter(record => !removed.has(record.id)).reduce((sum, record) => sum + (record.bytes || 0), 0);
            const oldestFirst = records
                .filter(record => prunable(record) && !removed.has(record.id))
                .sort((a, b) => (a.completedAt || a.createdAt) - (b.completedAt || b.createdAt));
            for (const record of oldestFirst) {
                if (total <= limit) break;
                await Downloads.remove(record.id);
                removed.add(record.id);
                total -= record.bytes || 0;
            }
        }
        return removed.size;
    }

    async function storageUsed() {
        const records = await Downloads.list();
        return records.reduce((sum, record) => sum + (record.bytes || 0), 0);
    }

    // Episodes published after the feed's autoDownloadSince, newest first,
    // at most perFeed of them
    async function newEpisodes(feed, settings) {
        const episodes = await Subscriptions.episodes(feed.url);
        return episodes
            .filter(episode => (episode.datePublished || 0) > (feed.autoDownloadSince || 0))
            .slice(0, settings.perFeed);
    }

    async function check(protectedIds) {
        const settings = getSettings();
        const result = { at: Date.now(), downloaded: 0, pruned: 0, skipped: '' };

        result.pruned = await prune(settings, protectedIds);

        const feeds = (await Subscriptions.list()).filter(feed => feed.autoDownload);
        if (feeds.length === 0) return result;

        result.skipped = await whyNotDownload(settings);
        if (result.skipped) return result;

        for (const feed of feeds) {
            let current = feed;
            if (Date.now() - feed.lastChecked > FEED_STALE_MS) {
                current = (await Subscriptions.refresh(feed.url)) || feed;
            }
            const candidates = await newEpisodes(current, settings);
            if (candidates.length === 0) continue;

            // Oldest of the batch first, so they finish in publishing order
            for (const episode of candidates.slice().reverse()) {
                const existing = await Downloads.get(Downloads.key(episode));
                if (existing) continue;

                const limit = settings.maxStorageMB * MB;
                if (limit > 0 && (await storageUsed()) + (episode.enclosureLength || 0) > limit) {
                    result.skipped = 'storage limit reached';
                    return result;
                }
                const stopReason = await whyNotDownload(settings);
                if (stopReason) {
                    result.skipped = stopReason;
                    return result;
                }
                await Downloads.start(episode, { auto: true });
                const record = await Downloads.get(Downloads.key(episode));
                if (record && record.status === 'complete') result.downloaded++;
            }

            // Everything up to the newest candidate has been handled, including
            // older new episodes beyond perFeed, which are skipped on purpose
            await Subscriptions.updateFeed(feed.url, { autoDownloadSince: candidates[0].datePublished });
        }
        return result;
    }

    // With several tabs open only one checks at a time (Web Locks), so two
    // tabs never download the same episode at once
    async function checkInOneTab(protectedIds) {
        if (!navigator.locks) return check(protectedIds);
        return navigator.locks.request('podcast-auto-download', { ifAvailable: true }, lock => (
            lock ? check(protectedIds) : { at: Date.now(), downloaded: 0, pruned: 0, skipped: 'another tab is already checking' }
        ));
    }

    // Runs one check at a time; a second call while one is running shares it
    function run(getProtectedIds) {
        if (!running) {
            running = (async () => {
                try {
                    const protectedIds = new Set(await getProtectedIds());
                    const result = await checkInOneTab(protectedIds);
                    notify(result);
                    return result;
                } catch (error) {
                    console.error('Auto-download check failed:', error);
                    const result = { at: Date.now(), downloaded: 0, pruned: 0, skipped: '', error: error.message };
                    notify(result);
                    return result;
                } finally {
                    running = null;
                }
            })();
        }
        return running;
    }

    // Turning auto-download on also fetches the latest episode, not the back catalogue
    async function setEnabled(feedUrl, enabled) {
        const patch = { autoDownload: enabled };
        if (enabled) {
            const episodes = await Subscriptions.episodes(feedUrl);
            patch.autoDownloadSince = episodes[1] ? episodes[1].datePublished : 0;
        }
        return Subscriptions.updateFeed(feedUrl, patch);
    }

    // Wires up the automatic checks
    function start(getProtectedIds) {
        const maybeRun = () => {
            if (!lastResult || Date.now() - lastResult.at > CHECK_EVERY_MS) run(getProtectedIds);
        };
        run(getProtectedIds);
        setInterval(() => run(getProtectedIds), CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') maybeRun();
        });
        window.addEventListener('online', () => run(getProtectedIds));
    }

    return {
        DEFAULTS, getSettings, saveSettings, subscribe, run, start, setEnabled, prune,
        isRunning: () => Boolean(running),
        lastResult: () => lastResult
    };
})();

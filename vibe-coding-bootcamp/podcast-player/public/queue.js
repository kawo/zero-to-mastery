// Playback queue ------------------------------- //
// The queue is one ordered list in IndexedDB. Every change is a single
// read-modify-write transaction, so edits from two tabs can't overwrite each
// other. Entries are addressed by episode, never by position, so a change
// worked out from an out-of-date view can't land in the wrong place.
const Queue = (() => {
    const DB_NAME = 'podcast-queue';
    const RECORD_ID = 'main';
    const listeners = new Set();
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('podcast-player-queue') : null;
    let dbPromise;

    function key(episode) {
        return String(episode.id || episode.enclosureUrl);
    }

    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('queue', { keyPath: 'id' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return dbPromise;
    }

    function transactionDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }

    async function items() {
        const db = await openDb();
        const tx = db.transaction('queue');
        const request = tx.objectStore('queue').get(RECORD_ID);
        await transactionDone(tx);
        return request.result ? request.result.items : [];
    }

    function notify(list) {
        listeners.forEach(listener => listener(list));
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    // Another tab changed the queue
    if (channel) {
        channel.addEventListener('message', () => {
            items().then(notify).catch(error => console.error('Could not reload queue:', error));
        });
    }

    // change() gets the current list and returns the new one. It must be
    // synchronous, so the read and the write stay in one transaction.
    async function mutate(change) {
        const db = await openDb();
        const tx = db.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');
        let next;
        const request = store.get(RECORD_ID);
        request.onsuccess = () => {
            const current = request.result ? request.result.items : [];
            next = change(current.slice());
            store.put({ id: RECORD_ID, items: next, updatedAt: Date.now() });
        };
        await transactionDone(tx);
        notify(next);
        if (channel) channel.postMessage('changed');
        return next;
    }

    function without(list, id) {
        return list.filter(entry => key(entry) !== id);
    }

    // Adds to the end. Returns false if the episode was already queued.
    async function add(episode) {
        let added = false;
        await mutate(list => {
            if (list.some(entry => key(entry) === key(episode))) return list;
            added = true;
            return [...list, episode];
        });
        return added;
    }

    // Puts the episode first, moving it if it was already queued
    function playNext(episode) {
        return mutate(list => [episode, ...without(list, key(episode))]);
    }

    function remove(id) {
        return mutate(list => without(list, id));
    }

    // Moves an entry before another one (or to the end when beforeId is null).
    // If either entry has gone, say removed in another tab, nothing moves.
    function move(id, beforeId) {
        return mutate(list => {
            const entry = list.find(item => key(item) === id);
            if (!entry || id === beforeId) return list;
            const rest = without(list, id);
            if (!beforeId) return [...rest, entry];
            const index = rest.findIndex(item => key(item) === beforeId);
            if (index === -1) return list;
            rest.splice(index, 0, entry);
            return rest;
        });
    }

    // Moves an entry up (negative) or down (positive) by a number of places,
    // counted from where it is now in the stored list, not where the page
    // last drew it, so quick repeated key presses each take effect
    function moveBy(id, delta) {
        return mutate(list => {
            const index = list.findIndex(item => key(item) === id);
            if (index === -1) return list;
            const target = Math.max(0, Math.min(list.length - 1, index + delta));
            if (target === index) return list;
            const [entry] = list.splice(index, 1);
            list.splice(target, 0, entry);
            return list;
        });
    }

    // Takes the first entry off the queue and returns it
    async function shift() {
        let first = null;
        await mutate(list => {
            first = list[0] || null;
            return list.slice(1);
        });
        return first;
    }

    // Earlier versions kept the queue in localStorage
    async function importLegacy() {
        let legacy;
        try {
            legacy = JSON.parse(localStorage.getItem('queue'));
        } catch (error) {
            legacy = null;
        }
        if (Array.isArray(legacy) && legacy.length) {
            await mutate(list => {
                const seen = new Set(list.map(key));
                return [...list, ...legacy.filter(episode => episode && !seen.has(key(episode)) && seen.add(key(episode)))];
            });
        }
        localStorage.removeItem('queue');
    }

    return { key, items, subscribe, add, playNext, remove, move, moveBy, shift, importLegacy };
})();

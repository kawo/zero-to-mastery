// Offline downloads ---------------------------- //
// Episode audio is saved to IndexedDB in chunks as it arrives, so a download
// that stops part way can resume from the last saved byte instead of
// starting over. Audio comes through the server's /api/audio proxy, because
// most podcast hosts don't allow cross-origin fetches.
const Downloads = (() => {
    const DB_NAME = 'podcast-downloads';
    const CHUNK_SIZE = 1024 * 1024; // save to disk every 1 MB
    const active = new Map(); // id -> { controller, promise }
    const listeners = new Set();
    let dbPromise;

    function key(episode) {
        return String(episode.id || episode.enclosureUrl);
    }

    // IndexedDB helpers
    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('downloads', { keyPath: 'id' });
                    request.result.createObjectStore('chunks', { keyPath: ['id', 'index'] });
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

    function chunkRange(id) {
        return IDBKeyRange.bound([id, 0], [id, Infinity]);
    }

    async function get(id) {
        const db = await openDb();
        return requestResult(db.transaction('downloads').objectStore('downloads').get(id));
    }

    async function list() {
        const db = await openDb();
        const records = await requestResult(db.transaction('downloads').objectStore('downloads').getAll());
        return records.sort((a, b) => b.createdAt - a.createdAt);
    }

    async function putRecord(record) {
        const db = await openDb();
        const tx = db.transaction('downloads', 'readwrite');
        tx.objectStore('downloads').put(record);
        await transactionDone(tx);
    }

    // The chunk and the byte count are saved together, so they can't disagree
    // after a crash
    async function appendChunk(record, blob) {
        const db = await openDb();
        const tx = db.transaction(['chunks', 'downloads'], 'readwrite');
        const next = { ...record, bytes: record.bytes + blob.size, nextIndex: record.nextIndex + 1 };
        tx.objectStore('chunks').put({ id: record.id, index: record.nextIndex, blob });
        tx.objectStore('downloads').put(next);
        await transactionDone(tx);
        Object.assign(record, next);
    }

    async function deleteChunks(id) {
        const db = await openDb();
        const tx = db.transaction('chunks', 'readwrite');
        tx.objectStore('chunks').delete(chunkRange(id));
        await transactionDone(tx);
    }

    // Change notifications for the UI
    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function notify(record, removed = false) {
        listeners.forEach(listener => listener({ ...record }, removed));
    }

    // Storage checks
    function formatBytes(bytes) {
        if (!bytes) return '0 MB';
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function checkSpace(needed) {
        if (!needed || !navigator.storage?.estimate) return;
        const { quota, usage } = await navigator.storage.estimate();
        const free = quota - usage;
        if (free < needed) {
            throw new Error(`Not enough storage: needs ${formatBytes(needed)}, ${formatBytes(free)} free`);
        }
    }

    function describeError(error) {
        if (error?.name === 'QuotaExceededError') return 'Not enough storage space';
        if (error instanceof TypeError) return 'Network error';
        return error?.message || 'Download failed';
    }

    function totalSize(response, offset) {
        const contentRange = response.headers.get('content-range');
        const rangeTotal = contentRange && contentRange.split('/')[1];
        if (rangeTotal && rangeTotal !== '*') return Number(rangeTotal);
        const length = Number(response.headers.get('content-length'));
        return length ? offset + length : null;
    }

    // Downloading
    async function fetchInto(record, signal) {
        const headers = record.bytes > 0 ? { Range: `bytes=${record.bytes}-` } : {};
        const response = await fetch(`/api/audio?url=${encodeURIComponent(record.episode.enclosureUrl)}`, { headers, signal });

        // Everything was already saved before the download was interrupted
        if (response.status === 416 && record.bytes > 0) return;
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Download failed (${response.status})`);
        }

        if (record.bytes > 0 && response.status !== 206) {
            // The host ignored the range request, so start again from the beginning
            await deleteChunks(record.id);
            Object.assign(record, { bytes: 0, nextIndex: 0 });
        }

        record.type = response.headers.get('content-type') || record.type || 'audio/mpeg';
        // Feeds often misstate episode size, so only the host's answer counts
        const expected = totalSize(response, record.bytes);
        record.total = expected || record.total;
        await checkSpace(record.total && record.total - record.bytes);
        notify(record);

        const reader = response.body.getReader();
        let buffer = [];
        let buffered = 0;

        const flush = async () => {
            if (!buffered) return;
            const blob = new Blob(buffer, { type: record.type });
            buffer = [];
            buffered = 0;
            await appendChunk(record, blob);
            notify(record);
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer.push(value);
            buffered += value.byteLength;
            if (buffered >= CHUNK_SIZE) await flush();
        }
        await flush();

        if (expected && record.bytes < expected) {
            throw new Error('Download ended early');
        }
    }

    async function run(record, controller) {
        try {
            await fetchInto(record, controller.signal);
            Object.assign(record, { status: 'complete', total: record.bytes });
        } catch (error) {
            if (controller.signal.reason === 'delete') return;
            if (controller.signal.aborted) {
                record.status = 'paused';
            } else {
                console.error('Download failed:', error);
                Object.assign(record, { status: 'error', error: describeError(error) });
            }
        } finally {
            active.delete(record.id);
        }

        try {
            await putRecord(record);
        } catch (error) {
            console.error('Could not save download state:', error);
        }
        notify(record);
    }

    async function start(episode) {
        const id = key(episode);
        if (active.has(id)) return;

        let record = await get(id);
        if (record?.status === 'complete') return;
        if (!record) {
            record = {
                id,
                episode: {
                    id: episode.id,
                    title: episode.title,
                    image: episode.image,
                    feedImage: episode.feedImage,
                    feedTitle: episode.feedTitle,
                    datePublished: episode.datePublished,
                    enclosureUrl: episode.enclosureUrl
                },
                bytes: 0,
                total: episode.enclosureLength || null,
                nextIndex: 0,
                type: '',
                createdAt: Date.now()
            };
        }
        Object.assign(record, { status: 'downloading', error: '' });

        // Ask the browser not to clear downloads when space runs low
        navigator.storage?.persist?.().catch(() => {});

        const controller = new AbortController();
        const entry = { controller };
        active.set(id, entry);
        await putRecord(record);
        notify(record);
        entry.promise = run(record, controller);
        return entry.promise;
    }

    function pause(id) {
        active.get(id)?.controller.abort('pause');
    }

    async function remove(id) {
        const entry = active.get(id);
        if (entry) {
            entry.controller.abort('delete');
            await entry.promise?.catch(() => {});
        }
        const db = await openDb();
        const tx = db.transaction(['chunks', 'downloads'], 'readwrite');
        tx.objectStore('chunks').delete(chunkRange(id));
        tx.objectStore('downloads').delete(id);
        await transactionDone(tx);
        notify({ id }, true);
    }

    // Builds a playable URL from the saved chunks, or null if not downloaded
    async function getPlaybackUrl(id) {
        const record = await get(id);
        if (record?.status !== 'complete') return null;
        const db = await openDb();
        const chunks = await requestResult(db.transaction('chunks').objectStore('chunks').getAll(chunkRange(id)));
        return URL.createObjectURL(new Blob(chunks.map(chunk => chunk.blob), { type: record.type }));
    }

    // A download that was running when the page closed can't still be running
    async function markInterrupted() {
        const records = await list();
        await Promise.all(records
            .filter(record => record.status === 'downloading' && !active.has(record.id))
            .map(record => putRecord({ ...record, status: 'paused' })));
    }

    return { key, get, list, start, pause, remove, getPlaybackUrl, subscribe, markInterrupted, formatBytes };
})();

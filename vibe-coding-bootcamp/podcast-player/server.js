const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const CryptoJS = require('crypto-js');
const fetch = require('node-fetch');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const { pipeline } = require('stream');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const authKey = process.env.AUTH_KEY;
const secretKey = process.env.SECRET_KEY;
const userAgent = process.env.USER_AGENT;
const apiEndpoint = process.env.API_ENDPOINT;

app.use(express.static(path.join(__dirname, 'public')));

// Shared authentication function
function generateAuthHeaders() {
    const apiHeaderTime = Math.floor(new Date().getTime() / 1000);
    const hash = CryptoJS.SHA1(authKey + secretKey + apiHeaderTime).toString(CryptoJS.enc.Hex);

    return {
        'User-Agent': userAgent,
        'X-Auth-Key': authKey,
        'X-Auth-Date': apiHeaderTime.toString(),
        'Authorization': hash
    };
}

// Search for podcasts
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    const headers = generateAuthHeaders();

    try {
        const response = await fetch(`${apiEndpoint}/search/byterm?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: headers
        });

        if (response.ok && response.headers.get('content-type').includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const rawText = await response.text();
            console.log('Raw response:', rawText);
            res.status(500).json({ error: 'Invalid response from API', rawText });
        }
    } catch (error) {
        console.error('Error fetching API:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Look up a podcast (and its feed URL) by iTunes ID
app.get('/api/podcast', async (req, res) => {
    const itunesId = req.query.itunesId;
    if (!itunesId) {
        return res.status(400).json({ error: 'iTunes ID parameter is required' });
    }

    try {
        const response = await fetch(`${apiEndpoint}/podcasts/byitunesid?id=${encodeURIComponent(itunesId)}`, {
            method: 'GET',
            headers: generateAuthHeaders()
        });

        if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
            res.json(await response.json());
        } else {
            const rawText = await response.text();
            console.log('Raw response:', rawText);
            res.status(500).json({ error: 'Invalid response from API', rawText });
        }
    } catch (error) {
        console.error('Error fetching API:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch episodes by podcast ID
app.get('/api/episodes', async (req, res) => {
    const feedId = req.query.feedId;
    const max = req.query.max;
    if (!feedId) {
        return res.status(400).json({ error: 'Feed ID parameter is required' });
    }

    const headers = generateAuthHeaders();

    try {
        const response = await fetch(`${apiEndpoint}/episodes/byitunesid?id=${encodeURIComponent(feedId)}&max=${max}`, {
            method: 'GET',
            headers: headers
        });

        if (response.ok && response.headers.get('content-type').includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const rawText = await response.text();
            console.log('Raw response:', rawText);
            res.status(500).json({ error: 'Invalid response from API', rawText });
        }
    } catch (error) {
        console.error('Error fetching API:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Proxies for audio downloads and RSS feeds ----- //
// Podcast hosts rarely allow cross-origin fetches, so the browser downloads
// episode audio and reads feeds through here. Because these routes fetch URLs
// they are handed, they only talk to public addresses.

function isPrivateAddress(address) {
    if (net.isIPv4(address)) {
        const [a, b] = address.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168);
    }
    const lower = address.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return lower === '::' || lower === '::1' ||
        lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

// Checked at connect time, so a hostname can't pass a check and then resolve
// somewhere private when the request is actually made
function publicOnlyLookup(hostname, options, callback) {
    dns.lookup(hostname, options, (error, address, family) => {
        if (error) return callback(error);
        const addresses = Array.isArray(address) ? address : [{ address }];
        if (addresses.some(entry => isPrivateAddress(entry.address))) {
            return callback(new Error(`Refusing to connect to a private address for ${hostname}`));
        }
        callback(null, address, family);
    });
}

const httpAgent = new http.Agent({ lookup: publicOnlyLookup });
const httpsAgent = new https.Agent({ lookup: publicOnlyLookup });

// IP literals skip DNS lookup entirely, so they're checked here instead
function checkPublicUrl(rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateAddress(host)) {
        throw new Error('Private addresses are not allowed');
    }
    return url;
}

// Fetch a public URL, following redirects by hand so every hop gets the same checks
async function fetchPublic(rawUrl, { headers = {}, signal, size = 0 } = {}) {
    let url = checkPublicUrl(rawUrl);
    for (let hops = 0; ; hops++) {
        const response = await fetch(url.href, {
            headers: { 'User-Agent': userAgent || 'podcast-player', ...headers },
            redirect: 'manual',
            agent: target => (target.protocol === 'https:' ? httpsAgent : httpAgent),
            signal,
            size
        });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) return response;
        if (hops >= 5) throw new Error('Too many redirects');
        url = checkPublicUrl(new URL(location, url).href);
    }
}

function isAudioType(contentType) {
    return !contentType ||
        /^(audio|video)\//i.test(contentType) ||
        /octet-stream/i.test(contentType);
}

app.get('/api/audio', async (req, res) => {
    const range = req.get('range');
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
        const upstream = await fetchPublic(req.query.url, {
            headers: range && /^bytes=\d+-\d*$/.test(range) ? { Range: range } : {},
            signal: controller.signal
        });

        if (!upstream.ok && upstream.status !== 416) {
            return res.status(502).json({ error: `Audio host responded ${upstream.status}` });
        }
        if (!isAudioType(upstream.headers.get('content-type'))) {
            return res.status(415).json({ error: 'That URL is not an audio file' });
        }

        res.status(upstream.status);
        res.set('X-Content-Type-Options', 'nosniff');
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(header => {
            const value = upstream.headers.get(header);
            if (value) res.set(header, value);
        });
        pipeline(upstream.body, res, () => {});
    } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Audio proxy error:', error.message);
        if (!res.headersSent) res.status(400).json({ error: error.message });
    }
});

// Long-running daily shows publish feeds of 20 MB and more
const MAX_FEED_BYTES = 50 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20000;

// Feeds declare their encoding in the Content-Type header or the XML
// declaration; plenty still use something other than UTF-8
function decodeFeed(buffer, contentType) {
    const head = buffer.subarray(0, 200).toString('latin1');
    const charset = (/charset=["']?([\w-]+)/i.exec(contentType || '') ||
        /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head) || [])[1];
    try {
        return new TextDecoder(charset || 'utf-8').decode(buffer);
    } catch (error) {
        return new TextDecoder('utf-8').decode(buffer);
    }
}

// Returns the feed as plain text for the browser to parse. Served as
// text/plain with nosniff so feed content can never run as a page on this site
app.get('/api/feed', async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    res.on('close', () => controller.abort());

    try {
        const upstream = await fetchPublic(req.query.url, {
            headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5' },
            signal: controller.signal,
            size: MAX_FEED_BYTES
        });

        if (upstream.status === 401 || upstream.status === 403) {
            return res.status(401).json({
                error: 'This feed needs a login. Use the private feed URL from your podcast provider, which includes an access token.'
            });
        }
        if (upstream.status === 404 || upstream.status === 410) {
            return res.status(404).json({ error: 'No feed found at that URL' });
        }
        if (!upstream.ok) {
            return res.status(502).json({ error: `Feed host responded ${upstream.status}` });
        }

        const text = decodeFeed(await upstream.buffer(), upstream.headers.get('content-type'));
        res.set('X-Content-Type-Options', 'nosniff');
        res.type('text/plain; charset=utf-8').send(text);
    } catch (error) {
        if (res.writableEnded || res.destroyed) return;
        const message = error.type === 'max-size' ? 'That feed is too large (over 50 MB)'
            : controller.signal.aborted ? 'The feed took too long to respond'
            : error.message;
        // Private feed URLs carry access tokens, so the URL itself isn't logged
        console.error('Feed proxy error:', error.type || error.name);
        if (!res.headersSent) res.status(400).json({ error: message });
    } finally {
        clearTimeout(timeout);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

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

// Audio proxy for offline downloads -------------- //
// Podcast hosts rarely allow cross-origin fetches, so the browser downloads
// episode audio through here. Because it fetches URLs it is handed, it only
// talks to public addresses and only passes audio through.

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
function checkAudioUrl(rawUrl) {
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
        let url = checkAudioUrl(req.query.url);
        let upstream;

        // Follow redirects by hand so every hop gets the same checks
        for (let hops = 0; ; hops++) {
            upstream = await fetch(url.href, {
                headers: {
                    'User-Agent': userAgent || 'podcast-player',
                    ...(range && /^bytes=\d+-\d*$/.test(range) ? { Range: range } : {})
                },
                redirect: 'manual',
                agent: target => (target.protocol === 'https:' ? httpsAgent : httpAgent),
                signal: controller.signal
            });
            const location = upstream.headers.get('location');
            if (upstream.status < 300 || upstream.status >= 400 || !location) break;
            if (hops >= 5) throw new Error('Too many redirects');
            url = checkAudioUrl(new URL(location, url).href);
        }

        if (!upstream.ok && upstream.status !== 416) {
            return res.status(502).json({ error: `Audio host responded ${upstream.status}` });
        }
        if (!isAudioType(upstream.headers.get('content-type'))) {
            return res.status(415).json({ error: 'That URL is not an audio file' });
        }

        res.status(upstream.status);
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

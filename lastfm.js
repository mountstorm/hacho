// api/lastfm.js
// Vercel serverless function — proxies Last.fm calls
// API key lives in env var LASTFM_API_KEY (set in Vercel dashboard, never in code)

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

// Methods we allow the client to call. Locked-down whitelist so a malicious
// client can't proxy arbitrary Last.fm methods through our key.
const ALLOWED_METHODS = new Set([
  'track.getInfo',
  'artist.getTopTags',
  'artist.getInfo'
]);

// ---- Rate limiting ---------------------------------------------------------
// In-memory sliding window per IP. Best-effort: serverless functions can spawn
// multiple instances. For viral-but-not-massive traffic this is fine.
// Swap to Vercel KV if you outgrow it.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;   // 30/min/IP — accommodates the artist-tags fallback
const GLOBAL_DAILY_MAX = 5000;        // global ceiling protects your Last.fm quota

const ipBuckets = new Map();
let globalDayBucket = { day: null, count: 0 };

function checkRateLimit(ip) {
  const now = Date.now();

  // Per-IP sliding window
  const bucket = ipBuckets.get(ip) || [];
  const recent = bucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    return { ok: false, reason: 'too many requests, slow down', retryAfter: 60 };
  }
  recent.push(now);
  ipBuckets.set(ip, recent);

  // Janitor — keep the map from growing forever
  if (ipBuckets.size > 1000) {
    for (const [k, v] of ipBuckets) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) ipBuckets.delete(k);
    }
  }

  // Global daily cap
  const today = new Date().toISOString().slice(0, 10);
  if (globalDayBucket.day !== today) {
    globalDayBucket = { day: today, count: 0 };
  }
  if (globalDayBucket.count >= GLOBAL_DAILY_MAX) {
    return { ok: false, reason: 'daily limit reached, try tomorrow', retryAfter: 3600 };
  }
  globalDayBucket.count += 1;

  return { ok: true };
}

// ---- Handler ---------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  // Validate inputs
  const { method, track, artist } = req.query;

  if (!method) return res.status(400).json({ error: 'missing method' });
  if (!ALLOWED_METHODS.has(method)) {
    return res.status(400).json({ error: 'method not permitted' });
  }
  if (!artist) return res.status(400).json({ error: 'missing artist' });
  if (method === 'track.getInfo' && !track) {
    return res.status(400).json({ error: 'missing track' });
  }
  if ((track && track.length > 200) || artist.length > 200) {
    return res.status(400).json({ error: 'inputs too long' });
  }

  // Rate limit
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: limit.reason });
  }

  // Build Last.fm URL
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.error('LASTFM_API_KEY env var not set');
    return res.status(500).json({ error: 'server not configured' });
  }

  const params = new URLSearchParams({
    method,
    api_key: apiKey,
    artist,
    format: 'json',
    autocorrect: '1'
  });
  if (track) params.set('track', track);

  // Call Last.fm
  try {
    const r = await fetch(`${LASTFM_BASE}?${params}`);
    const data = await r.json();

    if (data.error) {
      return res.status(404).json({ error: data.message || 'not found' });
    }

    // Cache successful responses for an hour at the edge — popular tracks barely cost anything
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (err) {
    console.error('lastfm fetch failed:', err);
    return res.status(502).json({ error: 'upstream failed' });
  }
}

/**
 * Novelas360 provider for Nuvio Local Scrapers.
 *
 * Ported from the "Latino" Stremio addon (src/scrapers/novelas360.js +
 * src/unpacker.js + src/http.js + src/concurrency.js, plus the TMDB lookup
 * from src/tmdb.js since Nuvio hands this file a tmdbId rather than an
 * already-resolved title). That addon ran as an Express server and used
 * Node's `http`/`crypto`/`Buffer` plus several sibling modules loaded with
 * `require`. Nuvio's local-scraper sandbox instead:
 *   - loads exactly this one file and calls `getStreams(...)` on it
 *   - has no Node built-ins (no `crypto`, no `Buffer`, no `fs`)
 *   - has no `async`/`await` support, so everything here is Promise chains
 *
 * The generic player unpacker below (shared verbatim with the other providers
 * in this repository, since Nuvio's sandbox can't `require('../unpacker')`
 * across files) stubs out three resolvers that depend on Node's `crypto`
 * module for real cryptography (AES-GCM / AES-CBC / SHA-256) not reasonably
 * reimplementable by hand here:
 *   - Filemoon (AES-128/256-GCM playback payloads) — also captcha-gated on
 *     effectively every file per the original code's own findings.
 *   - Pelisplus mirrors (AES-128-CBC API responses)
 *   - embed69 (AES-256-CBC + a SHA-256 proof-of-work)
 * Novelas360's own episode lookup and player extraction need none of that —
 * they port without any stubbing. Everything else from the original unpacker
 * — Dean Edwards `eval(function(p,a,c,k,e,d)` unpacking, VOE, Dood,
 * Streamtape, Nupload, MediaFire, VidGuard, Xupalace multi-server pages, JS
 * redirects and iframe chasing — is ported faithfully.
 *
 * Verified against the live site: search, episode matching and player-URL
 * extraction all work correctly, but as of this port novelas360.com's episode
 * pages route their (only) player through novelas360.cyou, a netu/hqq-family
 * host whose actual video comes from a client-side AJAX call signed with a
 * server-issued `md5`/`time` pair (see its `embed_player.php` response) —
 * there is nothing in the page HTML for a static resolver to extract. This is
 * the same category of gap as the crypto-gated stubs above, not a defect in
 * this file; it would need that handshake reverse-engineered to fix.
 */

// Nuvio's sandbox provides `cheerio-without-node-native` (alongside `fetch`),
// not plain `cheerio` -- requiring the wrong name here silently left cheerio
// undefined and broke every scrape. Falls back to `cheerio` so the file can
// also be run/tested under plain Node.
let cheerio;
try {
  cheerio = require('cheerio-without-node-native');
} catch {
  try {
    cheerio = require('cheerio');
  } catch {
    cheerio = typeof global !== 'undefined' ? global.cheerio : undefined;
  }
}

// ---------------------------------------------------------------------------
// base64 helpers (replacement for Node's Buffer, which isn't available here)
// ---------------------------------------------------------------------------

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes a base64 string into an array of byte values (0-255). */
function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (c === '=') break;
    const val = BASE64_CHARS.indexOf(c);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return bytes;
}

/** Encodes a JS string (treated byte-for-byte, i.e. latin1) as base64. */
function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 63];
  }
  return out;
}

/** Decodes base64 into a "binary string" (one char per byte, like Buffer's 'binary'/'latin1'). */
function base64ToBinaryString(b64) {
  return base64ToBytes(b64).map((byte) => String.fromCharCode(byte)).join('');
}

/** Decodes a UTF-8 byte sequence (as produced by base64ToBytes) into a JS string. */
function bytesToUtf8String(bytes) {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i < bytes.length) {
      const b1 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 1 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else if (b0 >= 0xf0 && i + 2 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      let codepoint = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      codepoint -= 0x10000;
      out += String.fromCharCode(0xd800 + (codepoint >> 10), 0xdc00 + (codepoint & 0x3ff));
    } else {
      out += String.fromCharCode(b0);
    }
  }
  return out;
}

function base64ToUtf8String(b64) {
  return bytesToUtf8String(base64ToBytes(b64));
}

// ---------------------------------------------------------------------------
// http helpers (fetch + timeout/abort, no Node `http` module)
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 6000;

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeUrl(value, baseUrl) {
  if (!value) return null;
  let url = decodeHtmlEntities(value).trim();
  url = url.replace(/\\\//g, '/');
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

// Nuvio's sandbox provides NO timer functions -- a bare `setTimeout` call
// there throws "'setTimeout' is not defined" (confirmed on-device). Since
// getStreams swallows errors into an empty array, any helper that reached
// for a timer failed silently and the provider returned zero streams, which
// is exactly what every timeout-using provider here was doing. Plain Node,
// used for local testing, does have timers and keeps the original
// deadline behaviour; without them the work simply runs to completion.
const HAS_TIMERS = typeof setTimeout === 'function';

function safeSetTimeout(fn, ms) {
  return HAS_TIMERS ? setTimeout(fn, ms) : null;
}

function safeClearTimeout(id) {
  if (HAS_TIMERS && id !== null && id !== undefined) clearTimeout(id);
}

/**
 * Promise-chain equivalent of the original addon's fetchWithDeadline.
 *
 * The deadline and any caller-supplied abort signal are raced against the
 * request rather than wired into fetch via `signal`: React Native's fetch,
 * which is what Nuvio runs, does not honour an AbortSignal the way Node's
 * does. Racing can't cancel the underlying request, so a timed-out or
 * abandoned fetch runs to completion in the background; that's an
 * acceptable trade for a request that actually completes, and callers
 * already treat these rejections as "move on to the next candidate".
 *
 * With no timers available there is nothing to enforce a deadline with, so
 * the request is simply returned as-is (still honouring an external abort
 * signal if one was supplied).
 */
function fetchWithDeadline(url, options, timeoutMs, consume) {
  const externalSignal = options.signal;
  const { signal, ...fetchOptions } = options;

  const request = fetch(url, fetchOptions).then((res) => Promise.resolve(consume(res)));

  if (!HAS_TIMERS && !externalSignal) return request;

  let timeoutId = null;
  let onExternalAbort = null;

  const deadline = new Promise((_resolve, reject) => {
    timeoutId = safeSetTimeout(() => {
      reject(new Error(`Fetch timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    if (externalSignal) {
      if (externalSignal.aborted) {
        reject(new Error(`Fetch aborted: ${url}`));
      } else {
        onExternalAbort = () => reject(new Error(`Fetch aborted: ${url}`));
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
  });

  function cleanup() {
    safeClearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  return Promise.race([request, deadline]).then(
    (result) => {
      cleanup();
      return result;
    },
    (error) => {
      cleanup();
      throw error;
    }
  );
}

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return fetchWithDeadline(url, options, timeoutMs, (res) => res);
}

function fetchTextWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return fetchWithDeadline(url, options, timeoutMs, (res) => res.text().then((text) => ({ res, text })));
}

function fetchJsonWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return fetchTextWithTimeout(url, options, timeoutMs).then(({ res, text }) => {
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, text, data };
  });
}

// ---------------------------------------------------------------------------
// small TTL cache (sync; ported unchanged from src/ttl-cache.js)
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = 30 * 1000;

function createTtlCache({ maxEntries = 500 } = {}) {
  const entries = new Map();
  let lastSweptAt = 0;

  function sweepExpired(now) {
    lastSweptAt = now;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  function enforceMaxEntries() {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function pruneOnWrite() {
    const now = Date.now();
    if (entries.size > maxEntries || now - lastSweptAt >= SWEEP_INTERVAL_MS) {
      sweepExpired(now);
    }
    enforceMaxEntries();
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      pruneOnWrite();
      return value;
    }
  };
}

// ---------------------------------------------------------------------------
// concurrency helpers (Promise-chain ports of src/concurrency.js + common.js)
// ---------------------------------------------------------------------------

/**
 * Runs `worker` over `items` with at most `concurrency` in flight and resolves
 * to the result of the *earliest* item that produced a truthy result, not
 * whichever settles first.
 */
function firstResultInOrder(items, concurrency, worker) {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve(null);
      return;
    }

    const results = new Array(items.length);
    const done = new Array(items.length).fill(false);
    let cursor = 0;
    let settledIndex = -1;
    let stopped = false;

    function checkOrder() {
      while (settledIndex + 1 < items.length && done[settledIndex + 1]) {
        settledIndex += 1;
        if (results[settledIndex]) {
          stopped = true;
          resolve(results[settledIndex]);
          return true;
        }
      }
      if (settledIndex === items.length - 1) {
        resolve(null);
        return true;
      }
      return false;
    }

    function runNext() {
      if (stopped) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      Promise.resolve()
        .then(() => worker(items[index], index))
        .catch(() => null)
        .then((outcome) => {
          results[index] = outcome;
          done[index] = true;
          if (!checkOrder()) runNext();
        });
    }

    const runners = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < runners; i += 1) runNext();
  });
}

/** Runs `worker` over `items` with bounded concurrency, collecting truthy results. */
function mapWithConcurrency(items, concurrency, worker) {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve([]);
      return;
    }

    const results = [];
    let cursor = 0;
    let doneCount = 0;

    function runNext() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        Promise.resolve()
          .then(() => worker(items[index], index))
          .catch(() => null)
          .then((result) => {
            if (result) results.push(result);
            doneCount += 1;
            if (doneCount === items.length) resolve(results);
            else runNext();
          });
        return;
      }
    }

    const runners = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < runners; i += 1) runNext();
  });
}

/**
 * Searches every title in `titles`, preferring the match belonging to the
 * earliest title even though the requests are fired concurrently.
 */
function raceTitleSearches(titles, search) {
  const attempts = titles.map((title) =>
    Promise.resolve()
      .then(() => search(title))
      .then((match) => ({ match }), (error) => ({ error }))
  );

  function checkIndex(i) {
    if (i >= attempts.length) return Promise.resolve(null);
    return attempts[i].then(({ match, error }) => {
      if (error) throw error;
      if (match) return match;
      return checkIndex(i + 1);
    });
  }

  return checkIndex(0);
}

function cleanText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * A short target title can be a coincidental substring of a long, unrelated
 * candidate title once whitespace is stripped by cleanText. Requiring the
 * shorter string to cover a reasonable share of the longer one keeps
 * genuine (if imperfectly-formatted) matches while rejecting titles that
 * only happen to contain the target somewhere in the middle.
 */
function looseIncludes(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.includes(shorter)) return false;
  return shorter.length / longer.length >= 0.5;
}

function extractCandidateYears(...values) {
  const years = new Set();
  for (const value of values) {
    const matches = String(value || '').match(/\b(?:19|20)\d{2}\b/g) || [];
    for (const match of matches) years.add(match);
  }
  return years;
}

// ---------------------------------------------------------------------------
// TMDB lookup (Nuvio hands us a tmdbId, not a title, so this replaces the
// addon's own /stream route which received the title already resolved)
// ---------------------------------------------------------------------------

const TMDB_API_KEY = 'af3fa2d2239e9d0e6c04a1076d3df76f';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 5000;
const tmdbCache = createTtlCache({ maxEntries: 200 });

function fetchFromTmdb(path, params = {}) {
  const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
  const url = `${TMDB_BASE_URL}${path}?${queryParams.toString()}`;

  const cached = tmdbCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  return fetchJsonWithTimeout(url, {}, TMDB_TIMEOUT_MS).then(({ res, data }) => {
    if (!res.ok || data === null) {
      throw new Error(`TMDB API error ${res.status} at ${path}`);
    }
    return tmdbCache.set(url, data, 6 * 60 * 60 * 1000);
  });
}

function fetchTmdbDetails(tmdbId, mediaType) {
  const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
  return fetchFromTmdb(`/${tmdbType}/${tmdbId}`, { language: 'es-MX' })
    .then((data) => {
      const title = data.title || data.name || data.original_title || data.original_name;
      const originalTitle = data.original_title || data.original_name;
      const year = (data.release_date || data.first_air_date || '').substring(0, 4) || null;
      return { title, originalTitle, year: year ? Number(year) : null };
    })
    .catch((error) => {
      console.error(`Novelas360: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
      return null;
    });
}

function getAlternativeTitles(mediaType, tmdbId) {
  const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
  return fetchFromTmdb(`/${tmdbType}/${tmdbId}/translations`)
    .then((data) => {
      const entries = data.translations || [];
      const titles = new Set();
      for (const entry of entries) {
        if (entry.iso_639_1 !== 'es') continue;
        const value = (entry.data?.name || entry.data?.title || '').trim();
        if (value) titles.add(value);
      }
      return [...titles];
    })
    .catch(() => []);
}

// ---------------------------------------------------------------------------
// generic iframe/player unpacking (ported from src/unpacker.js, minus the
// three AES-gated resolvers noted at the top of this file)
// ---------------------------------------------------------------------------

const PLAYER_FETCH_TIMEOUT_MS = 5000;
const MAX_RESOLVE_DEPTH = 5;
const DOOD_DIRECT_TIMEOUT_MS = 1800;
const EMBED_RESOLVE_CONCURRENCY = 3;
const MAX_EMBED69_ATTEMPTS = 5;
const MAX_VOE_PAYLOADS = 6;

function unpack(p, a, c, k) {
  const e_func = function (c) {
    return (c < a ? '' : e_func(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
  };
  c = Math.min(Number(c) || 0, k.length);
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + e_func(c) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

function* iterUnpackedScripts(html) {
  const packerRegex = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/gi;
  let match;
  while ((match = packerRegex.exec(html || '')) !== null) {
    try {
      const p = match[2].trim();
      const a = parseInt(match[3]);
      const c = parseInt(match[4]);
      const k = match[6].trim().split('|');
      yield unpack(p, a, c, k);
    } catch (err) {
      console.error('Novelas360 unpacker: failed to decode script block:', err.message);
    }
  }
}

const NON_STREAM_MARKERS = ['google-analytics', 'analytics.js', 'tagmanager', 'test-videos.co.uk', 'big_buck_bunny'];
const AD_SEGMENT_PATTERN = /(?:^|[/.])(?:ads?|advert(?:s|ising)?|adserver|doubleclick)(?:[/.]|$)/;

function cleanEscapedStreamUrl(link) {
  return String(link || '')
    .replace(/\\+u0026/gi, '&')
    .replace(/\\+u003[dD]/g, '=')
    .replace(/\\+u002[fF]/g, '/')
    .replace(/\\+u003[fF]/g, '?')
    .replace(/\\+$/, '');
}

function isPlausibleStreamUrl(link) {
  const lower = String(link || '').toLowerCase();
  if (NON_STREAM_MARKERS.some((marker) => lower.includes(marker))) return false;
  try {
    const parsed = new URL(lower);
    return !AD_SEGMENT_PATTERN.test(`${parsed.hostname}${parsed.pathname}`);
  } catch {
    return !AD_SEGMENT_PATTERN.test(lower);
  }
}

function extractDirectStream(html, baseUrl) {
  if (!html) return null;

  const normalizedHtml = decodeHtmlEntities(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\\//g, '/');

  const directRegex = /(https?:[^\s'"`<>]+?\.(?:m3u8|mp4|mkv)[^\s'"`<>]*)/gi;
  const protocolRelativeRegex = /(\/\/[^\s'"`<>]+?\.(?:m3u8|mp4|mkv)[^\s'"`<>]*)/gi;
  const relativeRegex = /((?:\/|\.\/|\.\.\/)[^\s'"`<>]+?\.(?:m3u8|mp4|mkv)[^\s'"`<>]*)/gi;
  const directMatches = normalizedHtml.match(directRegex) || [];
  const protocolRelativeMatches = normalizedHtml.match(protocolRelativeRegex) || [];
  const relativeMatches = normalizedHtml.match(relativeRegex) || [];

  const configuredMatches = [];
  const configPatterns = [
    /(?:file|source|src|url)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4|mkv)[^'"]*)['"]/gi,
    /["'](?:file|source|src|url)["']\s*:\s*["']([^"']+\.(?:m3u8|mp4|mkv)[^"']*)["']/gi,
    /playerjs\.file\s*=\s*['"]([^'"]+)['"]/gi
  ];
  for (const pattern of configPatterns) {
    let configMatch;
    while ((configMatch = pattern.exec(normalizedHtml)) !== null) {
      configuredMatches.push(configMatch[1]);
    }
  }

  const base64Regex = /['"]([A-Za-z0-9+/=]{40,})['"]/g;
  let encodedMatch;
  while ((encodedMatch = base64Regex.exec(normalizedHtml)) !== null) {
    try {
      const decoded = base64ToUtf8String(encodedMatch[1]).replace(/\\\//g, '/');
      if (!decoded.includes('.m3u8') && !decoded.includes('.mp4') && !decoded.includes('.mkv')) continue;
      configuredMatches.push(...(decoded.match(directRegex) || []));
      configuredMatches.push(...(decoded.match(protocolRelativeRegex) || []));
      configuredMatches.push(...(decoded.match(relativeRegex) || []));
    } catch {
      // Ignore non-base64 player config strings.
    }
  }

  const validDirect = [...directMatches, ...protocolRelativeMatches, ...relativeMatches, ...configuredMatches]
    .map(cleanEscapedStreamUrl)
    .map((link) => normalizeUrl(link, baseUrl))
    .filter(Boolean)
    .filter(isPlausibleStreamUrl);

  if (validDirect.length > 0) return [...new Set(validDirect)][0];

  for (const unpacked of iterUnpackedScripts(normalizedHtml)) {
    const streamMatches = unpacked.match(directRegex) || [];
    const validStreams = streamMatches
      .map(cleanEscapedStreamUrl)
      .map((link) => normalizeUrl(link, baseUrl))
      .filter(Boolean)
      .filter(isPlausibleStreamUrl);
    if (validStreams.length > 0) return [...new Set(validStreams)][0];
  }

  return null;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isDoodHost(value) {
  const host = getHostname(value);
  return /(^|\.)dood\.(?:li|to|stream|watch|so|pm|ws|re|yt|video)$/i.test(host)
    || /(^|\.)(?:d0{2,4}d|d0o0d|dooood|all3do|doply|vide0)\.(?:com|net|to)$/i.test(host)
    || /(^|\.)(?:doodstream|ds2play|ds2video)\.(?:com|co|net)$/i.test(host)
    || /(^|\.)playmogo\.com$/i.test(host);
}

function isVoeHost(value) {
  const host = getHostname(value);
  return /(^|\.)voe(?:-?un-?bl?o?ck)?\.[a-z]{2,}$/i.test(host) || host.includes('pamelachangemission.com');
}

function isNetuFamilyHost(value) {
  const host = getHostname(value);
  return /(^|\.)(?:waaw\d?|netu|netuplayer|hqq\d?)\.(?:to|tv|ac|watch|com|net)$/i.test(host)
    || /(^|\.)novelas360\.cyou$/i.test(host);
}

const DEFUNCT_HOST_PATTERN = /^(?:www\.)?(?:fembed\.com|gounlimited\.to)$/i;
function isDefunctHost(value) {
  return DEFUNCT_HOST_PATTERN.test(getHostname(value));
}

function isNuploadHost(value) {
  const host = getHostname(value);
  return /(^|\.)n(?:u)?upload\.(?:top|me)$/i.test(host);
}

function isXupalaceHost(value) {
  return /(^|\.)xupalace\.org$/i.test(getHostname(value));
}

function isStreamtapeHost(value) {
  return /(^|\.)(?:streamtape|streamadblockplus|stape|tapewithadblock|streamta)\.(?:com|net|to|xyz|cc|site)$/i.test(getHostname(value));
}

function extractStreamtapeStream(html, baseUrl) {
  if (!html) return null;
  const assignment = html.match(
    /getElementById\(\s*['"]robotlink['"]\s*\)\s*\.innerHTML\s*=\s*['"]([^'"]*)['"]\s*\+\s*\(\s*['"]([^'"]*)['"]\s*\)\s*\.substring\(\s*(\d+)\s*\)/i
  );
  if (!assignment) return null;
  const [, head, tail, offset] = assignment;
  const combined = `${head}${tail.substring(Number(offset))}`;
  if (!combined.includes('get_video')) return null;
  const absolute = combined.startsWith('//') ? `https:${combined}` : normalizeUrl(combined, baseUrl);
  return absolute && isHttpUrl(absolute) ? absolute : null;
}

const VIDGUARD_HOST_PATTERN = /(^|\.)(?:vidguard\.to|vid-guard\.com|listeamed\.net|bembed\.net|v6embed\.xyz|vgembed\.com|vgfplay\.com|embedv\.net|fslinks\.org|818ing\.com|moviesm4u\.com)$/i;
function isVidguardHost(value) {
  return VIDGUARD_HOST_PATTERN.test(getHostname(value));
}

function isMediafireHost(value) {
  return /(^|\.)mediafire\.com$/i.test(getHostname(value));
}

const EMBED_PATH_HOST_PATTERNS = [
  /(^|\.)(?:ahvsh|streamhide|guccihide|movhide)\.(?:com|to|net|pro)$/i,
  /(^|\.)(?:luluvdo|lulustream|lulu)\.(?:com|st|to|net)$/i,
  /(^|\.)vudeo\.(?:io|net|co)$/i,
  VIDGUARD_HOST_PATTERN
];
function isEmbedPathHost(value) {
  const host = getHostname(value);
  return EMBED_PATH_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function toEmbedPathUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(?:v|f|d|file|download|embed)\/([^/?#]+)/i);
    if (!match) return url;
    parsed.pathname = `/e/${match[1]}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

const FILE_LOCKER_SERVERS = ['1fichier', 'fichier', 'mega', 'uptobox', 'drive', 'gofile', 'wetransfer', 'terabox', 'pixeldrain', 'zippyshare'];
function isFileLockerServer(server) {
  const name = (server || '').toLowerCase().trim();
  if (!name) return false;
  return FILE_LOCKER_SERVERS.some((locker) => name.includes(locker));
}

function scoreXupalaceServer(server) {
  const s = (server || '').toLowerCase();
  if (s.includes('streamwish') || s.includes('hlswish') || s.includes('vidhide')) return 0;
  if (s.includes('vidguard') || s.includes('listeamed')) return 4;
  if (s.includes('waaw') || s.includes('netu') || s.includes('hqq')) return 5;
  if (s.includes('lulu') || s.includes('vudeo') || s.includes('ahvsh') || s.includes('streamhide')) return 5;
  if (s.includes('filemoon') || s.includes('voe') || s.includes('dood') || s.includes('playmogo')) return 6;
  return 3;
}

function extractXupalaceServers(html, baseUrl) {
  const $ = cheerio.load(html || '');
  const results = [];
  const seen = new Set();

  $('[onclick*="go_to_playerVast"]').each((_, el) => {
    const onclick = $(el).attr('onclick') || '';
    const match = onclick.match(/go_to_playerVast\(\s*['"]([^'"]+)['"]/);
    if (!match) return;
    const url = normalizeUrl(decodeHtmlEntities(match[1]), baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const imgName = ($(el).find('img').attr('src') || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    const label = ($(el).find('span').first().text() || imgName || '').trim().toLowerCase();
    results.push({ url, server: label });
  });

  return results;
}

function resolveXupalaceServers(html, baseUrl, userAgent, options) {
  const { depth, visited, signal } = options;
  const servers = extractXupalaceServers(html, baseUrl)
    .filter((entry) => !isFileLockerServer(entry.server))
    .sort((a, b) => scoreXupalaceServer(a.server) - scoreXupalaceServer(b.server));

  return firstResultInOrder(servers, EMBED_RESOLVE_CONCURRENCY, (entry) =>
    resolvePlayerStream(entry.url, userAgent, baseUrl, { depth: depth + 1, visited, signal }).catch((e) => {
      console.warn(`Novelas360 unpacker: Xupalace server ${entry.server || entry.url} failed: ${e.message}`);
      return null;
    })
  );
}

function normalizeNetuEmbedUrl(url, referer) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/f\/([^/?#]+)/i);
    if (!match) return url;
    const embedUrl = new URL(`/e/${match[1]}`, parsed.origin);
    embedUrl.searchParams.set('http_referer', referer || '');
    return embedUrl.toString();
  } catch {
    return url;
  }
}

function normalizeEmbedUrl(url, referer) {
  if (isNetuFamilyHost(url)) return normalizeNetuEmbedUrl(url, referer);
  if (isEmbedPathHost(url)) return toEmbedPathUrl(url);
  return url;
}

function extractNetuDirectStream(html, baseUrl) {
  const directUrl = extractDirectStream(html, baseUrl);
  if (!directUrl) return null;
  const lower = directUrl.toLowerCase();
  if (lower.startsWith('data:') || lower.includes('/hls-vod-s03/flv/api/files/videos/2018/08/01/')) return null;
  return directUrl;
}

function rot13(value) {
  return String(value || '').replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function decodeVoePayload(encoded, options = {}) {
  try {
    let value = rot13(encoded);
    for (const marker of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) {
      value = value.split(marker).join('_');
    }
    value = value.split('_').join('');

    const firstDecodedBytes = base64ToBytes(value);
    const firstDecoded = firstDecodedBytes.map((b) => String.fromCharCode(b)).join('');

    let shifted = '';
    for (let index = 0; index < firstDecoded.length; index += 1) {
      shifted += String.fromCharCode(firstDecoded.charCodeAt(index) - 3);
    }

    const reversed = shifted.split('').reverse().join('');
    const json = base64ToUtf8String(reversed);
    return JSON.parse(json);
  } catch (error) {
    if (!options.quiet) console.warn(`Novelas360 unpacker: VOE payload decode failed: ${error.message}`);
    return null;
  }
}

function collectVoeEncodedPayloads(html) {
  const payloads = [];
  let match;

  const scriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while (payloads.length < MAX_VOE_PAYLOADS && (match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const encoded = Array.isArray(parsed) ? parsed.find((item) => typeof item === 'string' && item.length > 0) : null;
      if (encoded) payloads.push(encoded);
    } catch {
      // Ignore unrelated JSON script tags.
    }
  }

  const varRegex = /(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*["']([A-Za-z0-9+/=_@$^~%*!#&-]{120,})["']/g;
  while (payloads.length < MAX_VOE_PAYLOADS && (match = varRegex.exec(html)) !== null) {
    payloads.push(match[1]);
  }

  return payloads;
}

function normalizeVoeCandidate(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const decoded = base64ToUtf8String(value);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {
    // Not base64; nothing usable here.
  }
  return null;
}

function extractVoeDirectStream(html, baseUrl, options = {}) {
  if (!html) return null;
  for (const encoded of collectVoeEncodedPayloads(html)) {
    const data = decodeVoePayload(encoded, options);
    if (!data) continue;
    const fallback = Array.isArray(data.fallback) ? data.fallback.map((item) => item?.file) : [];
    const candidates = [data.source, data.file, data.hls, ...fallback, data.direct_access_allowed ? data.direct_access_url : null]
      .map(normalizeVoeCandidate)
      .filter(Boolean);
    const direct = candidates.find((candidate) => /\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(candidate));
    if (direct) return normalizeUrl(direct, baseUrl);
  }
  return null;
}

function extractMediafireDirectUrl(html, baseUrl) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const button = $('#downloadButton').first();

  const href = normalizeUrl(button.attr('href'), baseUrl);
  if (href && !/(^|\.)mediafire\.com\/file\//i.test(href) && isHttpUrl(href)) return href;

  const scrambled = button.attr('data-scrambled-url');
  if (scrambled) {
    try {
      const decoded = base64ToUtf8String(scrambled);
      if (isHttpUrl(decoded)) return decoded;
    } catch {
      // Not base64; fall through to the page scan.
    }
  }

  const match = html.match(/https?:\/\/download[^"'`\s<>\\]+\.mediafire\.com\/[^"'`\s<>\\]+/i);
  return match ? normalizeUrl(match[0], baseUrl) : null;
}

function extractNuploadDirectStream(html, baseUrl) {
  if (!html) return null;
  try {
    const fileVarMatch = html.match(/file\s*:\s*([A-Za-z_$][\w$]*)\s*\+/);
    const fileVarName = fileVarMatch?.[1];
    const loopRegex = fileVarName
      ? new RegExp(`var\\s+${fileVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*"";\\s*([A-Za-z_$][\\w$]*)\\.forEach[\\s\\S]{0,500}?-\\s*(\\d+)`)
      : null;
    const loopMatch = loopRegex ? html.match(loopRegex) : null;
    const loopMatches = loopMatch ? [loopMatch] : [];

    if (loopMatches.length === 0) {
      const fallbackRegex = /var\s+([A-Za-z_$][\w$]*)\s*=\s*"";\s*([A-Za-z_$][\w$]*)\.forEach[\s\S]{0,500}?-\s*(\d+)/g;
      let fallbackMatch;
      while ((fallbackMatch = fallbackRegex.exec(html)) !== null) loopMatches.push(fallbackMatch);
    }

    for (const candidateMatch of loopMatches) {
      const arrayName = fileVarName ? candidateMatch[1] : candidateMatch[2];
      const subtractValue = parseInt(fileVarName ? candidateMatch[2] : candidateMatch[3], 10);
      const arrayPattern = new RegExp(`var\\s+${arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
      const arrayMatch = html.match(arrayPattern);
      if (!arrayMatch) continue;

      const encodedParts = JSON.parse(arrayMatch[1]);
      const streamUrl = encodedParts
        .map((part) => {
          const digits = base64ToUtf8String(part).replace(/\D/g, '');
          return String.fromCharCode(parseInt(digits, 10) - subtractValue);
        })
        .join('');

      if (!/\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(streamUrl)) continue;

      const sessionMatch = html.match(/\bsesz\s*=\s*["']([^"']+)["']/);
      const directUrl = normalizeUrl(streamUrl, baseUrl);
      if (!directUrl || !sessionMatch) return directUrl;

      const parsed = new URL(directUrl);
      if (!parsed.searchParams.has('s')) parsed.searchParams.set('s', sessionMatch[1]);
      return parsed.toString();
    }
  } catch (error) {
    console.warn(`Novelas360 unpacker: Nupload decode failed: ${error.message}`);
  }
  return null;
}

/**
 * VidGuard obfuscates its stream URL's `sig` parameter (hex XOR -> base64 ->
 * byte reversal/swap). This is plain byte math, not AES, so it ports without
 * Node's `crypto` module — only the base64 helpers above are needed.
 */
function decodeVidguardSignature(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    const sig = parsed.searchParams.get('sig');
    if (!sig || sig.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(sig)) return streamUrl;

    let deobfuscated = '';
    for (let index = 0; index < sig.length; index += 2) {
      deobfuscated += String.fromCharCode(parseInt(sig.slice(index, index + 2), 16) ^ 2);
    }

    const bytes = base64ToBytes(deobfuscated);
    if (bytes.length <= 10) return streamUrl;

    const characters = bytes.slice(0, bytes.length - 5).reverse().map((byte) => String.fromCharCode(byte));
    for (let index = 0; index + 1 < characters.length; index += 2) {
      const swap = characters[index];
      characters[index] = characters[index + 1];
      characters[index + 1] = swap;
    }

    parsed.searchParams.set('sig', characters.join('').slice(0, -5));
    return parsed.toString();
  } catch (error) {
    console.warn(`Novelas360 unpacker: VidGuard signature decode failed: ${error.message}`);
    return streamUrl;
  }
}

function extractVidguardStream(html, baseUrl) {
  for (const source of [html, ...iterUnpackedScripts(html)]) {
    if (!source) continue;
    const normalized = source.replace(/\\\//g, '/');
    const configMatch =
      normalized.match(/["'](?:stream|hls|file)["']\s*:\s*["']([^"']+)["']/i)
      || normalized.match(/(https?:\/\/[^\s'"`<>]+[?&]sig=[^\s'"`<>]+)/i);
    const candidate = normalizeUrl(configMatch?.[1], baseUrl);
    if (candidate) return decodeVidguardSignature(candidate);
  }
  return null;
}

function extractAssignedRedirect(html, baseUrl) {
  const linkMatch = html.match(/\b(?:var|let|const)\s+redirect_link\s*=\s*['"]([^'"]+)['"]/i);
  if (!linkMatch) return null;
  const fallbackMatch = html.match(/redirect\(\s*['"]([^'"]+)['"]\s*\)/);
  return normalizeUrl(`${linkMatch[1]}${fallbackMatch?.[1] || 'fp=-7'}`, baseUrl);
}

/** Dood's /pass_md5/ handshake. */
function resolveDood(html, url, userAgent, signal, pageUrl = url) {
  if (!isDoodHost(url) && !isDoodHost(pageUrl)) return Promise.resolve(null);

  const passMatch = html.match(/(["'])(\/pass_md5\/[^"'<>]+)\1/i) || html.match(/(["'])(https?:\/\/[^"'<>]+\/pass_md5\/[^"'<>]+)\1/i);
  const passUrl = normalizeUrl(passMatch?.[2], pageUrl);
  if (!passUrl) return Promise.resolve(null);

  return fetchTextWithTimeout(
    passUrl,
    { headers: { 'User-Agent': userAgent, Referer: pageUrl, 'X-Requested-With': 'XMLHttpRequest' }, signal },
    DOOD_DIRECT_TIMEOUT_MS
  )
    .then(({ res, text }) => {
      if (!res.ok) return null;
      const direct = text.trim().replace(/\\\//g, '/');
      return /^https?:\/\/.+\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(direct) ? direct : null;
    })
    .catch(() => null);
}

/**
 * Filemoon (AES-GCM playback payload), Pelisplus mirrors (AES-CBC API
 * response) and embed69 (AES-CBC + SHA-256 proof-of-work) all need real
 * cryptographic primitives that Node's `crypto` provided in the original
 * addon. Nuvio's sandbox has no `crypto` module, and hand-rolling AES/SHA-256
 * in this file was judged not worth it for this first port — especially
 * since the original code's own comments note Filemoon is captcha-gated on
 * effectively every file anyway. These stubs keep resolvePlayerStream's
 * control flow intact; they just never produce a stream for these three.
 */
function resolveFilemoon() {
  return Promise.resolve(null);
}
function resolvePelisplus() {
  return Promise.resolve(null);
}
function decryptEmbed69() {
  return null;
}
function isFilemoonHost(value) {
  return /(^|\.)filemoon\.(?:sx|to|in|nl|wt|eu|art)$/i.test(getHostname(value))
    || /(^|\.)bysejikuar\.com$/i.test(getHostname(value))
    || /(^|\.)q8y5z\.com$/i.test(getHostname(value));
}
const PELISPLUS_HOST_PATTERN = /(^|\.)(?:pelisplus[a-z0-9-]*\.[a-z0-9.-]+|4meplayer\.pro|upns\.pro|strp2p\.com|rpmstream\.live)$/i;
function isPelisplusHost(value) {
  if (!PELISPLUS_HOST_PATTERN.test(getHostname(value))) return false;
  try {
    return new URL(value).hash.length > 1;
  } catch {
    return false;
  }
}

/**
 * Advanced recursive player resolver: handles known external players to
 * extract a final direct .m3u8/.mp4 URL. Ported from src/unpacker.js's
 * resolvePlayerStream with async/await replaced by Promise chains.
 */
function resolvePlayerStream(url, userAgent, referer, options = {}) {
  const depth = options.depth || 0;
  const visited = options.visited || new Set();
  const signal = options.signal;
  const normalizedInputUrl = normalizeUrl(url, referer);
  if (!normalizedInputUrl || depth > MAX_RESOLVE_DEPTH || visited.has(normalizedInputUrl)) {
    return Promise.resolve(null);
  }
  visited.add(normalizedInputUrl);
  url = normalizeEmbedUrl(normalizedInputUrl, referer);
  if (visited.has(url) && url !== normalizedInputUrl) return Promise.resolve(null);
  visited.add(url);

  if (isDefunctHost(url)) {
    console.log(`Novelas360 unpacker: skipping ${getHostname(url)}, which accepts no connections`);
    return Promise.resolve(null);
  }

  let step = Promise.resolve(null);

  if (isPelisplusHost(url)) {
    step = resolvePelisplus(url, userAgent, referer, signal);
  }

  return step
    .then((result) => {
      if (result) return result;
      if (isFilemoonHost(url)) return resolveFilemoon(url, userAgent, referer, signal);
      return null;
    })
    .then((result) => {
      if (result || isFilemoonHost(url)) return result;
      return fetchTextWithTimeout(url, { headers: { 'User-Agent': userAgent, Referer: referer }, signal }, PLAYER_FETCH_TIMEOUT_MS).then(
        ({ res, text: html }) => {
          if (!res.ok) return null;
          return resolveFromPage(url, html, res, userAgent, referer, depth, visited, signal);
        }
      );
    })
    .catch((e) => {
      console.warn(`Novelas360 unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
      return null;
    });
}

function resolveFromPage(url, html, res, userAgent, referer, depth, visited, signal) {
  let chain = Promise.resolve(null);

  if (isXupalaceHost(url) || html.includes('go_to_playerVast')) {
    chain = chain.then((result) => result || resolveXupalaceServers(html, url, userAgent, { depth, visited, signal }));
  }

  chain = chain.then((result) => {
    if (result) return result;
    if (isVoeHost(url)) return extractVoeDirectStream(html, url);
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (isNetuFamilyHost(url)) {
      const netuDirectUrl = extractNetuDirectStream(html, url);
      if (netuDirectUrl) return netuDirectUrl;
      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      const iframeUrl = normalizeUrl(iframeMatch?.[1], url);
      if (iframeUrl && iframeUrl !== url && isNetuFamilyHost(iframeUrl)) {
        return resolvePlayerStream(iframeUrl, userAgent, url, { depth: depth + 1, visited, signal });
      }
      return NETU_TERMINAL;
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result === NETU_TERMINAL) return null;
    if (result) return result;
    if (isVidguardHost(url)) return extractVidguardStream(html, url);
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (isMediafireHost(url)) return extractMediafireDirectUrl(html, url);
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (isNuploadHost(url)) return extractNuploadDirectStream(html, url);
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (isStreamtapeHost(url)) return extractStreamtapeStream(html, url);
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (url.includes('emturbovid') || url.includes('turbovidhls') || url.includes('turboviplay')) {
      const dataHash = html.match(/data-hash=["']([^"']+\.m3u8[^"']*)/);
      if (dataHash) return normalizeUrl(dataHash[1], url);
      const urlPlay = html.match(/var\s+urlPlay\s*=\s*["']([^"']+\.m3u8[^"']*)/);
      if (urlPlay) return normalizeUrl(urlPlay[1], url);
    }
    return null;
  });

  chain = chain.then((result) => (result ? result : resolveDood(html, url, userAgent, signal, res.url || url)));

  chain = chain.then((result) => {
    if (result) return result;
    if (url.includes('embed69') || (html.includes('POW_CHALLENGE') && html.includes('dataLink'))) {
      // AES-gated; see decryptEmbed69 stub above.
      const embed69Links = decryptEmbed69(html);
      if (embed69Links && embed69Links.length > 0) {
        const attemptedEmbeds = embed69Links
          .filter((embed) => !isFileLockerServer(embed.server))
          .slice(0, MAX_EMBED69_ATTEMPTS);
        return firstResultInOrder(attemptedEmbeds, EMBED_RESOLVE_CONCURRENCY, (embed) =>
          resolvePlayerStream(embed.url, userAgent, url, { depth: depth + 1, visited, signal })
        );
      }
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (!isVoeHost(url)) {
      const voeMirrorUrl = extractVoeDirectStream(html, url, { quiet: true });
      if (voeMirrorUrl) {
        console.log(`Novelas360 unpacker: recognised ${getHostname(url)} as a VOE mirror by payload`);
        return voeMirrorUrl;
      }
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const jsRedirectMatch = html.match(
      /(?:(?:window|self)\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]|(?:(?:window|self)\.)?location\.(?:replace|assign)\s*\(\s*['"]([^'"]+)['"]\s*\)/
    );
    const redirectUrl = normalizeUrl(jsRedirectMatch?.[1] || jsRedirectMatch?.[2], url);
    if (redirectUrl && redirectUrl !== url && isHttpUrl(redirectUrl)) {
      console.log(`Novelas360 unpacker: following JS redirect to ${redirectUrl}`);
      return resolvePlayerStream(redirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const assignedRedirectUrl = extractAssignedRedirect(html, url);
    if (assignedRedirectUrl && assignedRedirectUrl !== url && isHttpUrl(assignedRedirectUrl)) {
      console.log(`Novelas360 unpacker: following assigned redirect to ${assignedRedirectUrl}`);
      return resolvePlayerStream(assignedRedirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    const iframeUrl = normalizeUrl(iframeMatch?.[1], url);
    if (iframeUrl && iframeUrl !== url && isHttpUrl(iframeUrl)) {
      return resolvePlayerStream(iframeUrl, userAgent, url, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const directUrl = extractDirectStream(html, url);
    return directUrl ? normalizeUrl(directUrl, url) : null;
  });

  return chain;
}

const NETU_TERMINAL = Symbol('netu-terminal');

// ---------------------------------------------------------------------------
// Novelas360-specific scraping (ported from src/scrapers/novelas360.js)
// ---------------------------------------------------------------------------

const NOVELAS360_BASE_URL = 'https://novelas360.com';
const NOVELAS360_SEARCH_TIMEOUT_MS = 5000;
const NOVELAS360_PAGE_TIMEOUT_MS = 6500;
const NOVELAS360_PLAYER_CONCURRENCY = 3;
// Guessed URLs are cheap when they miss (the site 404s promptly) but the whole
// lookup has ten seconds, and a stalling host must not spend all of it before the
// search path is ever tried.
const MAX_DIRECT_PROBES = 4;

function novelas360BrowserHeaders(userAgent, extra = {}) {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    ...extra
  };
}

function novelas360SlugifyTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleHasTrailingNumber(value) {
  return /\b\d+\s*$/.test(String(value || '').trim());
}

function buildSearchTitles(title, originalTitle, season, extraTitles = []) {
  const seen = new Set();
  const candidates = [];

  function add(value) {
    const text = String(value || '').trim();
    const key = cleanText(text);
    if (!text || seen.has(key)) return;
    seen.add(key);
    candidates.push(text);
  }

  for (const value of [title, originalTitle, ...extraTitles]) {
    if (season && season > 1 && value && !titleHasTrailingNumber(value)) {
      add(`${value} ${season}`);
    }
    add(value);
  }

  return candidates;
}

function episodeNumberFromText(value) {
  const match = String(value || '').match(/cap[ií]tulo\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function titleWithoutEpisode(value) {
  return String(value || '')
    .replace(/\s+cap[ií]tulo\s*\d+[\s\S]*$/i, '')
    .trim();
}

function scoreEpisodeCandidate(result, query, originalTitle, extraTitles = []) {
  const cleanQuery = cleanText(query);
  const cleanOriginal = cleanText(originalTitle);
  const cleanResultTitle = cleanText(titleWithoutEpisode(result.title));
  const cleanSlugTitle = cleanText(titleWithoutEpisode(
    result.url.match(/\/video\/([^/?#]+)/)?.[1]?.replace(/-/g, ' ')
  ));
  const cleanExtras = extraTitles.map(cleanText).filter(Boolean);
  let score = 0;

  if (cleanQuery && cleanResultTitle === cleanQuery) score += 8;
  if (cleanQuery && cleanSlugTitle === cleanQuery) score += 8;
  if (cleanOriginal && cleanResultTitle === cleanOriginal) score += 6;
  if (cleanOriginal && cleanSlugTitle === cleanOriginal) score += 6;

  if (cleanQuery && (looseIncludes(cleanResultTitle, cleanQuery) || looseIncludes(cleanSlugTitle, cleanQuery))) score += 3;
  if (cleanOriginal && (looseIncludes(cleanResultTitle, cleanOriginal) || looseIncludes(cleanSlugTitle, cleanOriginal))) score += 2;

  for (const cleanExtra of cleanExtras) {
    if (cleanResultTitle === cleanExtra || cleanSlugTitle === cleanExtra) score += 5;
    else if (looseIncludes(cleanResultTitle, cleanExtra) || looseIncludes(cleanSlugTitle, cleanExtra)) score += 2;
  }

  return score;
}

function extractEpisodeResults(html) {
  const $ = cheerio.load(html || '');
  const results = [];
  const seen = new Set();

  $('article, .post, .video').each((_, el) => {
    const href = $(el).find('a[href*="/video/"]').first().attr('href');
    const url = normalizeUrl(href, NOVELAS360_BASE_URL);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const title = (
      $(el).find('h1,h2,h3,h4,.entry-title,.post-title').first().text()
      || $(el).find('img').attr('alt')
      || $(el).find('a[href*="/video/"]').text()
    ).trim().replace(/\s+/g, ' ');

    if (title) results.push({ url, title });
  });

  $('a[href*="/video/"]').each((_, el) => {
    const url = normalizeUrl($(el).attr('href'), NOVELAS360_BASE_URL);
    if (!url || seen.has(url)) return;

    const text = ($(el).text() || $(el).attr('title') || $(el).find('img').attr('alt') || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!text || !/cap[ií]tulo\s*\d+/i.test(`${text} ${url}`)) return;

    seen.add(url);
    results.push({ url, title: text });
  });

  return results;
}

function extractPlayerUrls(html, pageUrl) {
  const $ = cheerio.load(html || '');
  const urls = [];
  const seen = new Set();

  function addUrl(value) {
    const url = normalizeUrl(value, pageUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  }

  $('iframe[src],embed[src],video[src],source[src]').each((_, el) => addUrl($(el).attr('src')));

  const scriptText = $('script').map((_, el) => $(el).html() || '').get().join('\n');
  const patterns = [
    /\b(?:file|src|url)\s*:\s*['"]([^'"]+)['"]/g,
    /\b(?:file|src|url)\s*=\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scriptText)) !== null) {
      addUrl(match[1]);
    }
  }

  return urls;
}

/**
 * The site serves one wrapper per episode, and it appears in two shapes: the
 * embed_player.php query form on older posts and a plain /e/<id> on newer ones.
 * Pinning the check to one host and one of those paths dropped the other outright —
 * every Carrusel and Marea de Pasiones episode extracted its player and then threw
 * it away — while still admitting nothing when the host is renamed again. The path
 * is what identifies a wrapper; the domain is not.
 */
function isPlayableCandidate(url) {
  try {
    const path = new URL(url).pathname;
    return /\/player\/embed_player\.php$/i.test(path)
      || /^\/(?:e|f|v)\/[^/]+/i.test(path)
      || /\.(?:m3u8|mp4|mkv)$/i.test(path);
  } catch {
    return false;
  }
}

/** Names the wrapper a stream came from, so options are told apart by host. */
function playerLabel(url) {
  try {
    const labels = new URL(url).hostname.toLowerCase().split('.');
    const name = labels.find((label) => !['www', 'player', 'embed', 'cdn', 'play'].includes(label))
      || labels[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Opcion';
  }
}

/**
 * The episode page URLs the site is known to use. `-capitulo-N/` is the canonical
 * one; the `-1` suffix is a duplicate-slug artifact that only some novelas carry,
 * and probing solely for it missed every novela that does not (Carrusel, Marea de
 * Pasiones and the rest), sending those lookups down the slower search path.
 */
function episodeUrlCandidates(slug, episode) {
  return [
    `${NOVELAS360_BASE_URL}/video/${slug}-capitulo-${episode}/`,
    `${NOVELAS360_BASE_URL}/video/${slug}-capitulo-${episode}-1/`
  ];
}

function fetchPageOk(url, userAgent, signal) {
  return fetchTextWithTimeout(url, { headers: novelas360BrowserHeaders(userAgent), signal }, NOVELAS360_PAGE_TIMEOUT_MS)
    .then(({ res, text }) => {
      if (!res.ok || /P[aá]gina no encontrada|Esto es algo embarazoso/i.test(text)) return null;
      return text;
    })
    .catch(() => null);
}

function findEpisodeUrl(title, originalTitle, season, episode, userAgent, signal, extraTitles = []) {
  const queries = buildSearchTitles(title, originalTitle, season, extraTitles);

  const directTargets = [];
  for (const query of queries) {
    const slug = novelas360SlugifyTitle(query);
    if (!slug) continue;
    for (const url of episodeUrlCandidates(slug, episode)) {
      directTargets.push(url);
    }
  }

  function tryDirect(i, probesLeft) {
    if (i >= directTargets.length || probesLeft <= 0) return null;
    return fetchPageOk(directTargets[i], userAgent, signal).then((html) => {
      if (html) return { url: directTargets[i], html };
      return tryDirect(i + 1, probesLeft - 1);
    });
  }

  function runQuery(query) {
    const searchUrl = `${NOVELAS360_BASE_URL}/?s=${encodeURIComponent(query)}`;
    return fetchTextWithTimeout(searchUrl, { headers: novelas360BrowserHeaders(userAgent), signal }, NOVELAS360_SEARCH_TIMEOUT_MS)
      .then(({ res, text: html }) => {
        if (!res.ok) return null;

        let bestMatch = null;
        let bestScore = 0;
        for (const result of extractEpisodeResults(html)) {
          if (episodeNumberFromText(`${result.title} ${result.url}`) !== Number(episode)) continue;
          const score = scoreEpisodeCandidate(result, query, originalTitle, [title, ...extraTitles]);
          if (score > bestScore) {
            bestMatch = result;
            bestScore = score;
          }
        }

        console.log(`Novelas360 search "${query}" best episode score ${bestScore}`);
        return bestMatch?.url || null;
      })
      .catch((error) => {
        console.warn(`Novelas360: Search failed for "${query}": ${error.message}`);
        return null;
      });
  }

  return tryDirect(0, MAX_DIRECT_PROBES).then((direct) => {
    if (direct) return direct;

    return raceTitleSearches(queries.slice(0, 2), runQuery).then((racedMatch) => {
      if (racedMatch) return { url: racedMatch, html: null };

      function tryTail(i) {
        const tail = queries.slice(2);
        if (i >= tail.length) return null;
        return runQuery(tail[i]).then((match) => (match ? { url: match, html: null } : tryTail(i + 1)));
      }
      return tryTail(0);
    });
  });
}

function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  if (type !== 'series') return Promise.resolve([]);

  const { signal, extraTitles = [] } = options;
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return findEpisodeUrl(title, originalTitle, season, episode, userAgent, signal, extraTitles)
    .then((episodeMatch) => {
      if (!episodeMatch) {
        console.log(`Novelas360: No episode found for "${title}" episode ${episode}`);
        return [];
      }

      const episodeHtmlPromise = episodeMatch.html
        ? Promise.resolve(episodeMatch.html)
        : fetchPageOk(episodeMatch.url, userAgent, signal);

      return episodeHtmlPromise.then((episodeHtml) => {
        if (!episodeHtml) return [];

        const playerUrls = extractPlayerUrls(episodeHtml, episodeMatch.url).filter(isPlayableCandidate);
        console.log(`Novelas360: Found ${playerUrls.length} player URLs`);

        return mapWithConcurrency(playerUrls, NOVELAS360_PLAYER_CONCURRENCY, (playerUrl) =>
          resolvePlayerStream(playerUrl, userAgent, episodeMatch.url, { signal })
            .then((resolvedUrl) => {
              if (!resolvedUrl) return null;
              return {
                name: 'Novelas360',
                title: `🇲🇽 ${playerLabel(playerUrl)}`,
                url: resolvedUrl,
                headers: { 'User-Agent': userAgent, Referer: playerUrl }
              };
            })
            .catch((error) => {
              console.warn(`Novelas360: Player ${playerUrl} failed: ${error.message}`);
              return null;
            })
        );
      });
    })
    .catch((error) => {
      console.error(`Novelas360 scrape error for "${title}":`, error.message);
      return [];
    });
}

// ---------------------------------------------------------------------------
// Nuvio entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stream Name/Description formatting, matching the upstream Latino Stremio
// addon's src/stream-template.js layout (applied there at its HTTP boundary,
// applied here directly since Nuvio scrapers have no such boundary):
//   Name:        {indexer}
//   Description: Latino{container ? " • " + container : ""}{resolution ? " • " + resolution : ""}
// ---------------------------------------------------------------------------
const STREAM_CONTAINER_PATTERN = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
const STREAM_RESOLUTION_PATTERN = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;

function extractStreamContainer(url) {
  const match = String(url || '').match(STREAM_CONTAINER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function extractStreamResolution(quality, title, name) {
  if (quality && quality !== 'Unknown') return String(quality).toLowerCase();
  const text = `${title || ''} ${name || ''}`;
  const match = text.match(STREAM_RESOLUTION_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === '4k' ? '2160p' : match[1].toLowerCase();
}

// ---------------------------------------------------------------------------
// MediaFlow Proxy: routes header-gated CDN links through a self-hosted
// MediaFlow Proxy instance (https://github.com/mhdzumair/mediaflow-proxy)
// instead of handing Nuvio's player the raw signed CDN URL directly.
//
// This exists because Nuvio's local-scraper model has no server of its own
// (unlike the upstream Latino Stremio addon, whose src/server.js proxies
// every header-carrying stream through its own /proxy/:filename route and
// rewrites the HLS manifest so every variant/segment URI also goes back
// through it -- see rewriteHlsManifest there). Nuvio just hands the scraper's
// URL straight to its player, so if the player doesn't forward
// behaviorHints.proxyHeaders to every sub-request an HLS playback makes
// (master playlist, then each variant, then each segment), header-gated
// streams stall. Routing through /proxy/hls/manifest.m3u8 sidesteps that
// entirely: MediaFlow Proxy fetches the manifest itself with the right
// headers and rewrites every URI inside it to also route back through
// itself, so the player never needs to send a custom header at all.
// ---------------------------------------------------------------------------
const MEDIAFLOW_PROXY_BASE_URL = 'https://proxy.fl4x.com';
const MEDIAFLOW_PROXY_API_PASSWORD = '1357';
const HLS_URL_PATTERN = /\.m3u8(?:$|[?#])/i;

function toMediaflowProxyUrl(targetUrl, headers) {
  const endpoint = HLS_URL_PATTERN.test(String(targetUrl || '')) ? 'proxy/hls/manifest.m3u8' : 'proxy/stream';
  const params = new URLSearchParams();
  params.set('d', targetUrl);
  if (headers && headers['User-Agent']) params.set('h_user-agent', headers['User-Agent']);
  if (headers && headers.Referer) params.set('h_referer', headers.Referer);
  params.set('api_password', MEDIAFLOW_PROXY_API_PASSWORD);
  return `${MEDIAFLOW_PROXY_BASE_URL}/${endpoint}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Playability probe, ported (simplified) from the upstream Latino Stremio
// addon's src/scrapers/index.js isPlayableStream/probeHlsPlayback: rules out
// dead streams (expired tokens, login walls, 403s, empty manifests) before
// they're ever returned from getStreams(), instead of only being discovered
// when a viewer presses play. Probes the exact URL Nuvio will fetch (i.e.
// the MediaFlow-proxied one), with a bounded byte-range GET and, for an HLS
// manifest, one hop into the first real variant/segment it names.
// ---------------------------------------------------------------------------
const STREAM_PROBE_RANGE_BYTES = 2048;
const STREAM_PROBE_TIMEOUT_MS = 5000;
const STREAM_PROBE_CONCURRENCY = 4;
const STREAM_HLS_PROBE_MAX_DEPTH = 2;

function isHtmlProbeResponse(res, text) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) return true;
  return /^\s*<(!doctype|html)/i.test(text || '');
}

function hasPlaylistEntries(body) {
  return body.includes('#EXT-X-STREAM-INF') || body.includes('#EXTINF');
}

function firstPlaylistEntryUrl(body, manifestUrl) {
  const lines = String(body || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      return new URL(trimmed, manifestUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function probeHlsPlayback(body, manifestUrl, depth) {
  const resourceUrl = firstPlaylistEntryUrl(body, manifestUrl);
  if (!resourceUrl) return Promise.resolve(false);
  // Chased far enough to be confident this manifest actually names real
  // media rather than proving every hop is itself another playlist.
  if (depth >= STREAM_HLS_PROBE_MAX_DEPTH) return Promise.resolve(true);

  return fetchTextWithTimeout(resourceUrl, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then(({ res, text }) => {
    if (!res.ok && res.status !== 206) return false;
    if (isHtmlProbeResponse(res, text)) return false;
    if (hasPlaylistEntries(text)) return probeHlsPlayback(text, resourceUrl, depth + 1);
    return true;
  }).catch(() => false);
}

function probeStreamPlayable(streamUrl) {
  return fetchTextWithTimeout(streamUrl, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then(({ res, text }) => {
    if ([401, 403, 404, 410, 451].includes(res.status)) return false;
    if (!res.ok && res.status !== 206) return false;
    if (isHtmlProbeResponse(res, text)) return false;
    if (hasPlaylistEntries(text)) return probeHlsPlayback(text, streamUrl, 0);
    return true;
  }).catch(() => false);
}

function probeNuvioStream(nuvioStream) {
  return probeStreamPlayable(nuvioStream.url).then((playable) => (playable ? nuvioStream : null));
}

function toNuvioStream(internalStream) {
  const container = extractStreamContainer(internalStream.url);
  const resolution = extractStreamResolution(internalStream.quality, internalStream.title, internalStream.name);
  const nuvioStream = {
    name: internalStream.name,
    title: ['Latino', container, resolution].filter(Boolean).join(' • ') || ' ',
    url: toMediaflowProxyUrl(internalStream.url, internalStream.headers),
    quality: resolution || null,
    size: null,
    provider: 'novelas360'
  };

  return nuvioStream;
}

/**
 * Required Nuvio local-scraper entry point. Novelas360 only serves
 * telenovelas (series), so a movie request always resolves to an empty array.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|null} seasonNum
 * @param {number|null} episodeNum
 * @returns {Promise<Array<object>>}
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType !== 'tv') return Promise.resolve([]);

  // TMDB details and its translations are independent lookups; fetching
  // them serially cost a full extra round trip before the scrape could even
  // start.
  return Promise.all([fetchTmdbDetails(tmdbId, mediaType), getAlternativeTitles(mediaType, tmdbId)])
    .then(([details, extraTitles]) => {
      if (!details || !details.title) return [];

      return scrape(details.title, details.originalTitle, details.year, 'series', seasonNum, episodeNum, { extraTitles }).then((results) =>
        mapWithConcurrency((results || []).map((stream) => toNuvioStream(stream)), STREAM_PROBE_CONCURRENCY, (nuvioStream) => probeNuvioStream(nuvioStream))
      );
    })
    .catch((error) => {
      console.error('Novelas360 (Nuvio): getStreams failed:', error && error.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

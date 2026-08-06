/**
 * TLNovelas provider for Nuvio Local Scrapers.
 *
 * Ported from the "Latino" Stremio addon (src/scrapers/tlnovelas.js +
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
 * TLNovelas's own search, episode lookup and player-shorthand expansion need
 * none of that — they port without any stubbing. Everything else from the
 * original unpacker — Dean Edwards `eval(function(p,a,c,k,e,d)` unpacking,
 * VOE, Dood, Streamtape, Nupload, MediaFire, VidGuard, Xupalace multi-server
 * pages, JS redirects and iframe chasing — is ported faithfully.
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
      console.error(`TLNovelas: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
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
      console.error('TLNovelas unpacker: failed to decode script block:', err.message);
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
      console.warn(`TLNovelas unpacker: Xupalace server ${entry.server || entry.url} failed: ${e.message}`);
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
    if (!options.quiet) console.warn(`TLNovelas unpacker: VOE payload decode failed: ${error.message}`);
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
    console.warn(`TLNovelas unpacker: Nupload decode failed: ${error.message}`);
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
    console.warn(`TLNovelas unpacker: VidGuard signature decode failed: ${error.message}`);
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
    console.log(`TLNovelas unpacker: skipping ${getHostname(url)}, which accepts no connections`);
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
      console.warn(`TLNovelas unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
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
        console.log(`TLNovelas unpacker: recognised ${getHostname(url)} as a VOE mirror by payload`);
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
      console.log(`TLNovelas unpacker: following JS redirect to ${redirectUrl}`);
      return resolvePlayerStream(redirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const assignedRedirectUrl = extractAssignedRedirect(html, url);
    if (assignedRedirectUrl && assignedRedirectUrl !== url && isHttpUrl(assignedRedirectUrl)) {
      console.log(`TLNovelas unpacker: following assigned redirect to ${assignedRedirectUrl}`);
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
// TLNovelas-specific scraping (ported from src/scrapers/tlnovelas.js)
// ---------------------------------------------------------------------------

const TLNOVELAS_BASE_URL = 'https://ww2.tlnovelas.net';
const TLNOVELAS_SEARCH_TIMEOUT_MS = 4500;
const TLNOVELAS_PAGE_TIMEOUT_MS = 5500;
const TLNOVELAS_PLAYER_CONCURRENCY = 4;
// Player lists are short — four servers is the most any episode carries — and every
// extra entry costs a wrapper fetch inside the scraper's ten-second budget.
const MAX_PLAYER_URLS = 6;
// A trailing number this large is part of the novela's name (a year, a channel), not
// a season marker. "El Señor De Los Cielos 10" is a season; "Rubí 2020" is not.
const MAX_SEASON_NUMBER = 30;

function tlnovelasBrowserHeaders(userAgent, extra = {}) {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    ...extra
  };
}

function tlnovelasSlugifyTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The season-like number a title ends with, or null. Numbers past a plausible season
 * count are names rather than markers and are reported as absent.
 */
function seasonNumberFromTitle(value) {
  const match = String(value || '').trim().match(/(\d+)\s*$/);
  if (!match) return null;

  const number = parseInt(match[1], 10);
  return number >= 1 && number <= MAX_SEASON_NUMBER ? number : null;
}

/**
 * TLNovelas files each season as its own novela — "El Señor De Los Cielos 10" is a
 * separate page from "El señor de los cielos", with its own capítulo 1. Scoring on
 * title text alone ranked the unnumbered original *highest* for a season-10 request
 * (it matches the TMDB title exactly), so whenever the numbered search lost the race
 * or timed out, the viewer was served season 1's episode under season 10's label.
 * A candidate whose number disagrees with the season being asked for is the wrong
 * novela no matter how well its words match, so it scores nothing at all.
 */
function scoreCandidate(result, title, originalTitle, extraTitles = [], season = null) {
  const cleanTitle = cleanText(title);
  const cleanOriginal = cleanText(originalTitle);
  const cleanExtras = extraTitles.map(cleanText).filter(Boolean);
  const cleanResult = cleanText(result.title);
  const slugWords = result.url.match(/\/novela\/([^/?#]+)/)?.[1]?.replace(/-/g, ' ');
  const cleanSlug = cleanText(slugWords);
  let score = 0;

  // The season wanted: the request's, or the one the title itself already names
  // (TMDB hands back "Rosario Tijeras 5" for a show the site files under that name).
  const wantedSeason = (season && season > 1 ? season : null)
    ?? seasonNumberFromTitle(title)
    ?? seasonNumberFromTitle(originalTitle);
  const candidateSeason = seasonNumberFromTitle(result.title) ?? seasonNumberFromTitle(slugWords);

  if (candidateSeason !== wantedSeason) return 0;

  if (cleanTitle && cleanResult === cleanTitle) score += 8;
  if (cleanTitle && cleanSlug === cleanTitle) score += 8;
  if (cleanOriginal && cleanResult === cleanOriginal) score += 6;
  if (cleanOriginal && cleanSlug === cleanOriginal) score += 6;

  if (cleanTitle && (looseIncludes(cleanResult, cleanTitle) || looseIncludes(cleanSlug, cleanTitle))) score += 3;
  if (cleanOriginal && (looseIncludes(cleanResult, cleanOriginal) || looseIncludes(cleanSlug, cleanOriginal))) score += 2;

  for (const cleanExtra of cleanExtras) {
    if (cleanResult === cleanExtra || cleanSlug === cleanExtra) score += 5;
    else if (looseIncludes(cleanResult, cleanExtra) || looseIncludes(cleanSlug, cleanExtra)) score += 2;
  }

  return score;
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

function extractSearchResults(html) {
  const $ = cheerio.load(html || '');
  const results = [];
  const seen = new Set();

  $('a[href*="/novela/"]').each((_, el) => {
    const url = normalizeUrl($(el).attr('href'), TLNOVELAS_BASE_URL);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const card = $(el).closest('.vk-poster,.p-content,li,.thel');
    const title = (
      card.find('.vk-info p,.p-title,.nakama').first().text()
      || $(el).attr('title')
      || $(el).find('img').attr('alt')
      || $(el).text()
    ).replace(/^(?:Ver|Capitulos de|Ver Novela|Ver capitulos de)\s+/i, '')
      .replace(/\s+Online$/i, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (title) results.push({ url, title });
  });

  return results;
}

/** Whether a page is a real novela page rather than the site's soft-404 shell. */
function isNovelaPage(html) {
  return /href=["'][^"']*\/ver\/[^"']*["']/i.test(String(html || ''));
}

function runTlnovelasQuery(query, originalTitle, season, title, userAgent, signal, extraTitles) {
  const searchUrl = `${TLNOVELAS_BASE_URL}/buscar/?q=${encodeURIComponent(query)}`;
  return fetchTextWithTimeout(searchUrl, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_SEARCH_TIMEOUT_MS)
    .then(({ res, text: html }) => {
      if (!res.ok) return null;

      let bestMatch = null;
      let bestScore = 0;
      for (const result of extractSearchResults(html)) {
        const score = scoreCandidate(result, query, originalTitle, [title, ...extraTitles], season);
        if (score > bestScore) {
          bestMatch = result;
          bestScore = score;
        }
      }

      console.log(`TLNovelas search "${query}" best score ${bestScore}`);
      return bestMatch ? bestMatch.url : null;
    })
    .catch((error) => {
      console.warn(`TLNovelas: Search failed for "${query}": ${error.message}`);
      return null;
    });
}

function tlnovelasSearch(title, originalTitle, season, userAgent, signal, extraTitles = []) {
  const queries = buildSearchTitles(title, originalTitle, season, extraTitles);
  const runQuery = (query) => runTlnovelasQuery(query, originalTitle, season, title, userAgent, signal, extraTitles);

  return raceTitleSearches(queries.slice(0, 2), runQuery)
    .then((racedMatch) => {
      if (racedMatch) return racedMatch;

      function tryTail(i) {
        const tail = queries.slice(2);
        if (i >= tail.length) return null;
        return runQuery(tail[i]).then((match) => match || tryTail(i + 1));
      }
      return tryTail(0);
    })
    .then((match) => {
      if (match) return match;

      function tryDirectSlug(i) {
        if (i >= queries.length) return null;
        const slug = tlnovelasSlugifyTitle(queries[i]);
        if (!slug) return tryDirectSlug(i + 1);

        const url = `${TLNOVELAS_BASE_URL}/novela/${slug}/`;
        return fetchTextWithTimeout(url, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_SEARCH_TIMEOUT_MS)
          .then(({ res, text }) => {
            // The site answers 200 with a "no encontrado" shell for a novela it does not
            // have, so res.ok says nothing about whether the guess landed. A real novela
            // page lists its capítulos; that is the check worth making.
            if (res.ok && isNovelaPage(text)) return url;
            return tryDirectSlug(i + 1);
          })
          .catch(() => tryDirectSlug(i + 1));
      }
      return tryDirectSlug(0);
    });
}

// The separator is deliberately loose: the number lives in the link text on some
// layouts ("Capítulo 17") and only in the href on others ("…-capitulo-17/"), and a
// whitespace-only separator never matched the second.
function episodeNumberFromText(value) {
  const match = String(value || '').match(/cap[ií]tulo[\s._-]*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function findEpisodeUrl(html, pageUrl, episode) {
  if (!episode) return null;
  const $ = cheerio.load(html || '');
  const candidates = [];

  $('a[href*="/ver/"]').each((_, el) => {
    const url = normalizeUrl($(el).attr('href'), pageUrl);
    const text = `${$(el).attr('title') || ''} ${$(el).text() || ''} ${url || ''}`;
    if (url && episodeNumberFromText(text) === Number(episode)) {
      candidates.push(url);
    }
  });

  return candidates[0] || null;
}

/**
 * The hosts behind the site's own player shorthand. Episode pages do not always
 * carry a URL: the older layouts store `e[0]='bLLNfskCqRvm|1'`, and the page's
 * v_ideo() helper (themes/dark/js/dodo.min.js) turns the trailing digit into one of
 * these prefixes before building the iframe. Read literally, those entries resolve
 * against the episode page itself and every one of them was fetched as
 * `…/ver/<episode>/bLLNfskCqRvm|1` — a 404 on the novela site, so the episodes that
 * use this layout offered nothing at all.
 */
const PLAYER_SHORTHAND_HOSTS = {
  1: 'https://hqq.to/e/',
  2: 'https://dood.yt/e/',
  3: 'https://player.ojearanime.com/e/',
  4: 'https://player.vernovelastv.net/e/'
};

function expandPlayerEntry(value) {
  const text = String(value || '').trim();
  const match = text.match(/^([A-Za-z0-9_-]+)\|(\d)$/);
  const prefix = match ? PLAYER_SHORTHAND_HOSTS[match[2]] : null;
  // An unknown suffix is left alone, exactly as v_ideo() leaves it: the site treats
  // anything it does not recognise as a ready-made URL.
  return prefix ? `${prefix}${match[1]}` : text;
}

/** Static assets and the novela site's own pages are never players. */
function isPlayerCandidate(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/(^|\.)tlnovelas\.net$/i.test(parsed.hostname)) return false;
    return !/\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Whether a URL has the shape of a video wrapper or a stream, rather than a guess. */
function looksLikePlayer(url) {
  try {
    const path = new URL(url).pathname;
    return /\.(?:m3u8|mp4|mkv)$/i.test(path)
      || /^\/(?:e|v|f|d)\//i.test(path)
      || /\/embed/i.test(path);
  } catch {
    return false;
  }
}

function extractPlayerUrls(html, pageUrl) {
  const $ = cheerio.load(html || '');
  const urls = [];
  const seen = new Set();

  function addUrl(value) {
    const url = normalizeUrl(expandPlayerEntry(value), pageUrl);
    if (!url || seen.has(url) || !isPlayerCandidate(url)) return;
    seen.add(url);
    urls.push(url);
  }

  $('iframe[src],embed[src],video[src],source[src]').each((_, el) => addUrl($(el).attr('src')));

  const scriptText = $('script').map((_, el) => $(el).html() || '').get().join('\n');
  const patterns = [
    /\be\[\d+\]\s*=\s*['"]([^'"]+)['"]/g,
    /v_ideo\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\b(?:file|src|url)\s*:\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scriptText)) !== null) {
      addUrl(match[1]);
    }
  }

  // The last pattern is a wide net — it catches ad tags and analytics endpoints
  // alongside players — so anything that does not look like a wrapper follows the
  // ones that do instead of taking their place in the concurrency window.
  return [...urls.filter(looksLikePlayer), ...urls.filter((url) => !looksLikePlayer(url))]
    .slice(0, MAX_PLAYER_URLS);
}

/**
 * Names the wrapper a stream came from. The list is built in completion order and
 * failed players are dropped, so a positional label reads "Opcion 2, Opcion 4" for
 * two working servers and tells the viewer nothing about either.
 */
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

function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  if (type !== 'series') return Promise.resolve([]);

  const { signal, extraTitles = [] } = options;
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return tlnovelasSearch(title, originalTitle, season, userAgent, signal, extraTitles)
    .then((pageUrl) => {
      if (!pageUrl) {
        console.log(`TLNovelas: No matching content found for "${title}"`);
        return [];
      }

      return fetchTextWithTimeout(pageUrl, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_PAGE_TIMEOUT_MS)
        .then(({ res: seriesRes, text: seriesHtml }) => {
          if (!seriesRes.ok) return [];

          const episodeUrl = findEpisodeUrl(seriesHtml, pageUrl, episode);
          if (!episodeUrl) {
            console.log(`TLNovelas: No episode found for "${title}" episode ${episode}`);
            return [];
          }

          return fetchTextWithTimeout(episodeUrl, { headers: tlnovelasBrowserHeaders(userAgent, { Referer: pageUrl }), signal }, TLNOVELAS_PAGE_TIMEOUT_MS)
            .then(({ res: episodeRes, text: episodeHtml }) => {
              if (!episodeRes.ok) return [];

              const playerUrls = extractPlayerUrls(episodeHtml, episodeUrl);
              console.log(`TLNovelas: Found ${playerUrls.length} player URLs`);

              return mapWithConcurrency(playerUrls, TLNOVELAS_PLAYER_CONCURRENCY, (playerUrl) =>
                resolvePlayerStream(playerUrl, userAgent, episodeUrl, { signal })
                  .then((resolvedUrl) => {
                    if (!resolvedUrl) return null;
                    return {
                      name: 'TLNovelas',
                      title: `🇲🇽 ${playerLabel(playerUrl)}`,
                      url: resolvedUrl,
                      headers: { 'User-Agent': userAgent, Referer: playerUrl }
                    };
                  })
                  .catch((error) => {
                    console.warn(`TLNovelas: Player ${playerUrl} failed: ${error.message}`);
                    return null;
                  })
              );
            });
        });
    })
    .catch((error) => {
      console.error(`TLNovelas scrape error for "${title}":`, error.message);
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
// Depth 1, not 2: an on-device diag trace showed the manifest and its first
// variant playlist (both text/m3u8) always fetch fine, but the actual binary
// media segment this would recurse into consistently failed on-device
// (status 0, no error, ~400ms) while fetching identically from a server
// succeeded -- a JS fetch()-with-Range quirk on binary content, not a dead
// stream. Real playback never goes through this fetch() anyway (Nuvio's
// native player has its own HTTP stack), so verifying down through the
// nested media playlist is enough evidence without probing the one binary
// hop that produces false negatives here.
const STREAM_HLS_PROBE_MAX_DEPTH = 1;

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
  // Chased far enough to trust this manifest names real media without
  // downloading it -- the final hop (the binary segment) is only HEAD-
  // checked, never GET-with-Range'd: an on-device trace showed fetch()
  // consistently fails to download a binary Range response here even for
  // segments that play fine (status 0, no error), while HEAD has no body
  // to fail on. Only explicit block/gone statuses count as dead; anything
  // else (including that same status-0 quirk showing up on HEAD) is
  // trusted rather than rejected, since the goal is catching genuinely
  // expired links without reintroducing false negatives on live ones.
  if (depth >= STREAM_HLS_PROBE_MAX_DEPTH) {
    return fetchWithTimeout(resourceUrl, { method: 'HEAD' }, STREAM_PROBE_TIMEOUT_MS)
      .then((res) => !([401, 403, 404, 410, 451].includes(res.status)))
      .catch(() => true);
  }

  return fetchTextWithTimeout(resourceUrl, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then(({ res, text }) => {
    if (!res.ok && res.status !== 206) return false;
    if (isHtmlProbeResponse(res, text)) return false;
    if (hasPlaylistEntries(text)) return probeHlsPlayback(text, resourceUrl, depth + 1);
    return text.length > 0;
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
    return text.length > 0;
  }).catch(() => false);
}

// Verbose twin of probeStreamPlayable(): runs the exact same request but
// reports what actually happened (status, error, snippet) instead of
// collapsing everything to a boolean. Only invoked when every candidate
// already failed the real probe, so it doesn't add extra requests to the
// normal path.
function diagProbeOneLevel(url) {
  const startedAt = Date.now();
  return fetchTextWithTimeout(url, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then(({ res, text }) => ({
    url,
    ms: Date.now() - startedAt,
    status: res.status,
    ok: res.ok,
    bodyLength: text.length,
    isHtml: isHtmlProbeResponse(res, text),
    hasPlaylist: hasPlaylistEntries(text),
    nextUrl: hasPlaylistEntries(text) ? firstPlaylistEntryUrl(text, url) : null,
    bodySnippet: text.slice(0, 300)
  })).catch((error) => ({
    url,
    ms: Date.now() - startedAt,
    error: error && error.message
  }));
}

// Chases the exact same manifest -> variant -> segment chain
// probeStreamPlayable()/probeHlsPlayback() do, but instead of collapsing
// each hop to a boolean, records status/timing/error for every level. Only
// invoked when the real (boolean) probe already rejected every candidate,
// so it costs nothing on the normal working path.
function diagProbeStream(streamUrl) {
  const levels = [];
  function next(url, depth) {
    if (!url || depth > 2) return Promise.resolve(levels);  // traces one level deeper than the real probe, on purpose
    return diagProbeOneLevel(url).then((level) => {
      levels.push(level);
      if (level.hasPlaylist && level.nextUrl) return next(level.nextUrl, depth + 1);
      return levels;
    });
  }
  return next(streamUrl, 0);
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
    provider: 'tlnovelas'
  };

  return nuvioStream;
}

/**
 * Required Nuvio local-scraper entry point. TLNovelas only serves telenovelas
 * (series), so a movie request always resolves to an empty array.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|null} seasonNum
 * @param {number|null} episodeNum
 * @returns {Promise<Array<object>>}
 */
// Nuvio's sandbox exposes no device logs, so when getStreams() would
// otherwise silently resolve to [] -- the same "empty array, no error"
// shape a genuine no-match case produces -- there's no way to tell that
// apart from a bug from inside the app. Report a one-line trail of what
// each stage actually did as a single non-playable stream instead, so it's
// readable straight from Nuvio's own stream list.
// Only `name` renders inline in Nuvio's stream list without the user having
// to tap the card -- tapping instead tries to play the (fake) url. So the
// trail goes in `name`, not `title`.
function diagStream(text) {
  const summary = String(text).replace(/\s+/g, ' ').trim().slice(0, 320);
  return {
    name: `⚠️ ${summary}`,
    title: 'TLNovelas diag',
    url: 'https://example.com/diag-not-playable.mp4',
    quality: null,
    size: null,
    provider: 'tlnovelas'
  };
}

// One raw, minimally-processed hit at the exact search URL scrape() uses,
// so a zero-result trail can show what the device's fetch actually got back
// (blocked/interstitial page, empty body, unexpected status) instead of just
// "0 raw results" -- which looks identical whether the site said no or the
// request never reached real content.
function rawSearchProbe(query) {
  const searchUrl = `${TLNOVELAS_BASE_URL}/buscar/?q=${encodeURIComponent(query)}`;
  return fetchTextWithTimeout(searchUrl, { headers: tlnovelasBrowserHeaders('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36') }, TLNOVELAS_SEARCH_TIMEOUT_MS)
    .then(({ res, text }) => ({
      summary: `rawProbe: HTTP ${res.status}, ${text.length}b, starts "${text.slice(0, 60).replace(/\s+/g, ' ')}"`,
      status: res.status,
      bodyLength: text.length,
      bodySnippet: text.slice(0, 4000)
    }))
    .catch((error) => ({
      summary: `rawProbe: FETCH ERROR ${error && error.message}`,
      status: null,
      bodyLength: 0,
      bodySnippet: null
    }));
}

// Best-effort, fire-and-forget: POSTs the full (untruncated) diagnostic
// payload to a webhook instead of relying solely on Nuvio's stream-name
// field, which is both length-limited and only visible one screenshot at a
// time. Never allowed to affect the real getStreams() result -- always
// swallows its own errors.
const DIAG_WEBHOOK_URL = 'https://webhook.site/ad43f557-7f98-45f9-b35b-34e0b631ca5a';
function reportDiag(payload) {
  try {
    fetch(DIAG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType !== 'tv') return Promise.resolve([diagStream('mediaType is not tv (TLNovelas is series-only): ' + mediaType)]);
  const trail = [];
  let lastTitle = null;
  let unplayedNuvioStreams = null;

  return Promise.all([fetchTmdbDetails(tmdbId, mediaType), getAlternativeTitles(mediaType, tmdbId)])
    .then(([details, extraTitles]) => {
      trail.push(details && details.title ? `tmdb: title="${details.title}" year=${details.year}` : 'tmdb: no details/title');
      trail.push(`altTitles: ${extraTitles ? extraTitles.length : 0}`);
      if (!details || !details.title) return [];
      lastTitle = details.title;

      return scrape(details.title, details.originalTitle, details.year, 'series', seasonNum, episodeNum, { extraTitles }).then((results) => {
        trail.push(`scrape: ${(results || []).length} raw result(s)`);
        const rawNuvioStreams = (results || []).map((stream) => toNuvioStream(stream));
        return mapWithConcurrency(
          rawNuvioStreams,
          STREAM_PROBE_CONCURRENCY,
          (nuvioStream) => probeNuvioStream(nuvioStream)
        ).then((probed) => {
          trail.push(`probe: ${probed.length} survived of ${rawNuvioStreams.length}`);
          if (probed.length === 0 && rawNuvioStreams.length > 0) unplayedNuvioStreams = rawNuvioStreams;
          return probed;
        });
      });
    })
    .then((streams) => {
      if (streams && streams.length > 0) return streams;
      if (unplayedNuvioStreams && unplayedNuvioStreams.length > 0) {
        return diagProbeStream(unplayedNuvioStreams[0].url).then((probeDiag) => {
          trail.push(`probeDiag: ${JSON.stringify(probeDiag).slice(0, 200)}`);
          reportDiag({ provider: 'TLNovelas', tmdbId, mediaType, trail, probeDiag });
          return [diagStream(trail.join(' | '))];
        });
      }
      if (!lastTitle) {
        reportDiag({ provider: 'TLNovelas', tmdbId, mediaType, trail });
        return [diagStream(trail.join(' | '))];
      }
      return rawSearchProbe(lastTitle).then(({ summary, status, bodyLength, bodySnippet }) => {
        trail.push(summary);
        reportDiag({ provider: 'TLNovelas', tmdbId, mediaType, trail, rawProbeStatus: status, rawProbeBodyLength: bodyLength, rawProbeBody: bodySnippet });
        return [diagStream(trail.join(' | '))];
      });
    })
    .catch((error) => {
      console.error('TLNovelas (Nuvio): getStreams failed:', error && error.message);
      trail.push(`THREW: ${error && error.message}`);
      reportDiag({ provider: 'TLNovelas', tmdbId, mediaType, trail, threw: error && error.message });
      return [diagStream(trail.join(' | '))];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

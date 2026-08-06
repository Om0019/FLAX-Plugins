/**
 * PelisPedia provider for Nuvio Local Scrapers.
 *
 * Ported from the "Latino" Stremio addon (src/scrapers/pelispedia.js +
 * src/unpacker.js + src/http.js + src/concurrency.js, plus the TMDB lookup
 * from src/tmdb.js since Nuvio hands this file a tmdbId rather than an
 * already-resolved title). That addon ran as an Express server and used
 * Node's `http`/`crypto`/`Buffer` plus several sibling modules loaded with
 * `require`. Nuvio's local-scraper sandbox instead:
 *   - loads exactly this one file and calls `getStreams(...)` on it
 *   - has no Node built-ins (no `crypto`, no `Buffer`, no `fs`)
 *   - has no `async`/`await` support, so everything here is Promise chains
 *
 * The generic player unpacker below (shared verbatim with providers/sololatino.js,
 * providers/cuevana3i.js, providers/cinecalidad.js, providers/tioplus.js and
 * providers/lamovie.js, since Nuvio's sandbox can't `require('../unpacker')`
 * across files) stubs out three resolvers that depend on Node's `crypto`
 * module for real cryptography (AES-GCM / AES-CBC / SHA-256) not reasonably
 * reimplementable by hand here:
 *   - Filemoon (AES-128/256-GCM playback payloads) — also captcha-gated on
 *     effectively every file per the original code's own findings.
 *   - Pelisplus mirrors (AES-128-CBC API responses)
 *   - embed69 (AES-256-CBC + a SHA-256 proof-of-work)
 * PelisPedia's own search and iframe extraction need none of that — they port
 * without any stubbing. Everything else from the original unpacker — Dean
 * Edwards `eval(function(p,a,c,k,e,d)` unpacking, VOE, Dood, Streamtape,
 * Nupload, MediaFire, VidGuard, Xupalace multi-server pages, JS redirects and
 * iframe chasing — is ported faithfully.
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
 * A short target title (e.g. "El Origen") can be a coincidental substring of
 * a long, unrelated candidate title (e.g. "Pesadilla en Elm Street: El
 * Origen") once whitespace is stripped by cleanText -- that false positive
 * scored the same as a real match and won ties against the correct result.
 * Requiring the shorter string to cover a reasonable share of the longer one
 * keeps genuine (if imperfectly-formatted) matches while rejecting titles
 * that only happen to contain the target somewhere in the middle.
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
      console.error(`PelisPedia: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
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
      console.error('PelisPedia unpacker: failed to decode script block:', err.message);
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
      console.warn(`PelisPedia unpacker: Xupalace server ${entry.server || entry.url} failed: ${e.message}`);
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
    if (!options.quiet) console.warn(`PelisPedia unpacker: VOE payload decode failed: ${error.message}`);
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
    console.warn(`PelisPedia unpacker: Nupload decode failed: ${error.message}`);
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
    console.warn(`PelisPedia unpacker: VidGuard signature decode failed: ${error.message}`);
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
// ---------------------------------------------------------------------------
// pure-JS crypto (SHA-256 + AES-256 CBC decrypt), for embed69's proof-of-work
// gate. Nuvio's sandbox has no `crypto` module and node-forge-style libraries
// assume a Node/browser environment this sandbox doesn't provide either, so
// this is a from-scratch implementation, verified against Node's own `crypto`
// (SHA-256: empty/short/long/unicode/200 randomized strings; AES-256-CBC: 100
// randomized encrypt-with-Node/decrypt-with-this round-trips, plus the exact
// IV||ciphertext/base64 shape embed69 uses) before being wired in here.
// Ported verbatim from providers/sololatino.js.
// ---------------------------------------------------------------------------

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr32(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Encodes a JS string as UTF-8 bytes (the inverse of bytesToUtf8String). */
function stringToUtf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

function sha256Words(bytes) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const bitLenLow = (bytes.length * 8) >>> 0;
  const msg = bytes.slice();
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  msg.push(0, 0, 0, 0);
  msg.push((bitLenLow >>> 24) & 0xff, (bitLenLow >>> 16) & 0xff, (bitLenLow >>> 8) & 0xff, bitLenLow & 0xff);

  const w = new Array(64);
  for (let chunkStart = 0; chunkStart < msg.length; chunkStart += 64) {
    for (let i = 0; i < 16; i += 1) {
      const o = chunkStart + i * 4;
      w[i] = ((msg[o] << 24) | (msg[o + 1] << 16) | (msg[o + 2] << 8) | msg[o + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7];
}

function sha256Hex(str) {
  return sha256Words(stringToUtf8Bytes(str))
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/** SHA-256 digest as a 32-byte array, for use as key material (embed69's AES key). */
function sha256RawBytes(str) {
  const words = sha256Words(stringToUtf8Bytes(str));
  const bytes = [];
  for (const word of words) {
    bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }
  return bytes;
}

function gmul(a, b) {
  let p = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i += 1) {
    if (y & 1) p ^= x;
    const hiBitSet = x & 0x80;
    x = (x << 1) & 0xff;
    if (hiBitSet) x ^= 0x1b;
    y >>= 1;
  }
  return p;
}

/**
 * AES S-box/inverse S-box, generated from their algebraic definition
 * (multiplicative inverse in GF(2^8), then the standard affine map) rather
 * than hand-transcribed from a 256-entry reference table.
 */
function buildAesTables() {
  const inv = new Array(256).fill(0);
  for (let a = 1; a < 256; a += 1) {
    for (let b = 1; b < 256; b += 1) {
      if (gmul(a, b) === 1) {
        inv[a] = b;
        break;
      }
    }
  }

  const rotl8 = (v, n) => ((v << n) | (v >>> (8 - n))) & 0xff;

  const sbox = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    const x = inv[i];
    sbox[i] = x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63;
  }

  const invSbox = new Array(256);
  for (let i = 0; i < 256; i += 1) invSbox[sbox[i]] = i;

  return { sbox, invSbox };
}

const AES_TABLES = buildAesTables();
const AES_SBOX = AES_TABLES.sbox;
const AES_INV_SBOX = AES_TABLES.invSbox;
const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];

/** AES-256 key expansion: 32-byte key -> 60 round-key words (Nb*(Nr+1), Nr=14). */
function aes256KeyExpansion(key) {
  const Nk = 8, Nr = 14, Nb = 4;
  const w = [];
  for (let i = 0; i < Nk; i += 1) {
    w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  }
  for (let i = Nk; i < Nb * (Nr + 1); i += 1) {
    let temp = w[i - 1].slice();
    if (i % Nk === 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]];
      temp = temp.map((b) => AES_SBOX[b]);
      temp[0] ^= AES_RCON[i / Nk - 1];
    } else if (Nk > 6 && i % Nk === 4) {
      temp = temp.map((b) => AES_SBOX[b]);
    }
    w.push(w[i - Nk].map((b, idx) => b ^ temp[idx]));
  }
  return w;
}

function addRoundKey(state, w, round) {
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      state[r][c] ^= w[round * 4 + c][r];
    }
  }
}

function invSubBytes(state) {
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      state[r][c] = AES_INV_SBOX[state[r][c]];
    }
  }
}

function invShiftRows(state) {
  for (let r = 1; r < 4; r += 1) {
    const row = state[r];
    state[r] = row.slice(4 - r).concat(row.slice(0, 4 - r));
  }
}

function invMixColumns(state) {
  for (let c = 0; c < 4; c += 1) {
    const a0 = state[0][c], a1 = state[1][c], a2 = state[2][c], a3 = state[3][c];
    state[0][c] = gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09);
    state[1][c] = gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d);
    state[2][c] = gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b);
    state[3][c] = gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e);
  }
}

function aes256DecryptBlock(block, w) {
  const Nr = 14;
  const state = [[], [], [], []];
  for (let i = 0; i < 16; i += 1) state[i % 4][(i / 4) | 0] = block[i];

  addRoundKey(state, w, Nr);
  for (let round = Nr - 1; round >= 1; round -= 1) {
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, w, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  invSubBytes(state);
  addRoundKey(state, w, 0);

  const out = new Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = state[i % 4][(i / 4) | 0];
  return out;
}

/** AES-256-CBC decrypt. `ciphertextBytes` must be a whole number of 16-byte blocks. */
function aes256CbcDecrypt(keyBytes, ivBytes, ciphertextBytes) {
  const w = aes256KeyExpansion(keyBytes);
  const plaintext = [];
  let prevBlock = ivBytes;
  for (let offset = 0; offset < ciphertextBytes.length; offset += 16) {
    const block = ciphertextBytes.slice(offset, offset + 16);
    const decrypted = aes256DecryptBlock(block, w);
    for (let i = 0; i < 16; i += 1) plaintext.push(decrypted[i] ^ prevBlock[i]);
    prevBlock = block;
  }
  return plaintext;
}

function stripPkcs7PaddingBytes(bytes) {
  const pad = bytes[bytes.length - 1];
  if (!Number.isInteger(pad) || pad < 1 || pad > 16 || pad > bytes.length) return bytes;
  return bytes.slice(0, bytes.length - pad);
}

// embed69 states its own proof-of-work difficulty; the search costs 16^difficulty
// hashes. This is pure JS, not the native `crypto` the original addon (and
// embed69's own real-browser callers, likely via WebCrypto) relies on, so the
// time budget here is calibrated for that: ~130k-500k hashes/sec measured for
// this file's sha256Hex, so difficulty 5 (16^5 ≈ 1.05M hashes) can already cost
// several seconds, and difficulty 6 is not attempted. The search runs in chunks
// with a `Promise.resolve().then()` hop between them so it doesn't monopolise
// the single JS thread for its whole duration, and honours the same deadline/
// difficulty caps in spirit as the original addon's native-crypto version.
const EMBED69_MAX_POW_DIFFICULTY = 5;
const EMBED69_MAX_POW_MS = 8000;
const EMBED69_POW_CHUNK = 4000;

function solveEmbed69ProofOfWork(challenge, difficulty) {
  const prefix = '0'.repeat(difficulty);
  const deadline = Date.now() + EMBED69_MAX_POW_MS;
  let nonce = 0;

  function step() {
    const chunkEnd = nonce + EMBED69_POW_CHUNK;
    for (; nonce < chunkEnd; nonce += 1) {
      if (sha256Hex(challenge + nonce).startsWith(prefix)) return nonce;
    }
    if (Date.now() > deadline) {
      console.warn(`PelisPedia: embed69 proof-of-work (difficulty ${difficulty}) exceeded ${EMBED69_MAX_POW_MS}ms after ${nonce} nonces; giving up.`);
      return null;
    }
    return Promise.resolve().then(step);
  }

  return Promise.resolve().then(step);
}

function decryptEmbed69(html) {
  const powChallengeMatch = html.match(/const POW_CHALLENGE = '([^']+)';/);
  const powDifficultyMatch = html.match(/const POW_DIFFICULTY = (\d+);/);
  const powSaltMatch = html.match(/const POW_SALT = '([^']+)';/);
  const dataLinkMatch = html.match(/let dataLink = (\[.*?\]);/);

  if (!powChallengeMatch || !powDifficultyMatch || !powSaltMatch || !dataLinkMatch) {
    return Promise.resolve(null);
  }

  const challenge = powChallengeMatch[1];
  const difficulty = parseInt(powDifficultyMatch[1], 10);
  const salt = powSaltMatch[1];
  let dataLink = [];
  try {
    dataLink = JSON.parse(dataLinkMatch[1]);
  } catch {
    return Promise.resolve(null);
  }

  if (difficulty > EMBED69_MAX_POW_DIFFICULTY) {
    console.warn(`PelisPedia: refusing embed69 proof-of-work at difficulty ${difficulty} (max ${EMBED69_MAX_POW_DIFFICULTY} in this pure-JS sandbox).`);
    return Promise.resolve(null);
  }

  return Promise.resolve(solveEmbed69ProofOfWork(challenge, difficulty)).then((nonce) => {
    if (nonce === null || nonce === undefined) return null;

    const aesKey = sha256RawBytes(challenge + nonce + salt);
    const decryptedLinks = [];

    function decryptEmbedLink(embed, kind) {
      if (!embed.link || (kind === 'video' && embed.type !== 'video')) return;
      try {
        const raw = base64ToBytes(embed.link);
        const iv = raw.slice(0, 16);
        const ciphertext = raw.slice(16);
        if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) return;
        const decrypted = stripPkcs7PaddingBytes(aes256CbcDecrypt(aesKey, iv, ciphertext));
        decryptedLinks.push({ server: embed.servername, url: bytesToUtf8String(decrypted), kind });
      } catch {
        // ignore
      }
    }

    for (const file of dataLink) {
      if (Array.isArray(file.sortedEmbeds)) {
        for (const embed of file.sortedEmbeds) decryptEmbedLink(embed, 'video');
      }
      if (Array.isArray(file.downloadEmbeds)) {
        for (const embed of file.downloadEmbeds) decryptEmbedLink(embed, 'download');
      }
    }
    return decryptedLinks;
  });
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
    console.log(`PelisPedia unpacker: skipping ${getHostname(url)}, which accepts no connections`);
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
      console.warn(`PelisPedia unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
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
    if (!(url.includes('embed69') || (html.includes('POW_CHALLENGE') && html.includes('dataLink')))) {
      return null;
    }
    return decryptEmbed69(html).then((embed69Links) => {
      if (!embed69Links || embed69Links.length === 0) return null;

      // Video-kind embeds before download-only ones, and within each,
      // servers this resolver can actually answer before ones gated by a
      // captcha or challenge nothing here can solve (filemoon, voe, dood).
      const rankedEmbeds = embed69Links.slice().sort((a, b) => {
        const kindScore = (value) => (value.kind === 'video' ? 0 : 1);
        const serverScore = (value) => {
          const server = (value.server || '').toLowerCase();
          if (server === 'vidhide' || server === 'streamwish' || server === 'hlswish') return 0;
          if (server === 'rapidvideo') return 1;
          if (server === 'filemoon' || server === 'voe' || server === 'dood'
            || server === 'doodstream' || server === 'doodstreaming' || server === 'playmogo') return 8;
          return 2;
        };
        return kindScore(a) - kindScore(b) || serverScore(a) - serverScore(b);
      });

      const attemptedEmbeds = rankedEmbeds
        .filter((embed) => !isFileLockerServer(embed.server))
        .slice(0, MAX_EMBED69_ATTEMPTS);
      return firstResultInOrder(attemptedEmbeds, EMBED_RESOLVE_CONCURRENCY, (embed) =>
        resolvePlayerStream(embed.url, userAgent, url, { depth: depth + 1, visited, signal })
      );
    });
  });

  chain = chain.then((result) => {
    if (result) return result;
    if (!isVoeHost(url)) {
      const voeMirrorUrl = extractVoeDirectStream(html, url, { quiet: true });
      if (voeMirrorUrl) {
        console.log(`PelisPedia unpacker: recognised ${getHostname(url)} as a VOE mirror by payload`);
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
      console.log(`PelisPedia unpacker: following JS redirect to ${redirectUrl}`);
      return resolvePlayerStream(redirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const assignedRedirectUrl = extractAssignedRedirect(html, url);
    if (assignedRedirectUrl && assignedRedirectUrl !== url && isHttpUrl(assignedRedirectUrl)) {
      console.log(`PelisPedia unpacker: following assigned redirect to ${assignedRedirectUrl}`);
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
// PelisPedia-specific scraping (ported from src/scrapers/pelispedia.js)
// ---------------------------------------------------------------------------

const PELISPEDIA_BASE_URL = 'https://pelispedia.mov';
const PELISPEDIA_SEARCH_TIMEOUT_MS = 5000;
const PELISPEDIA_PAGE_TIMEOUT_MS = 5500;
const PELISPEDIA_PLAYER_CONCURRENCY = 4;

/** First 4-digit year (19xx/20xx) found in `value`, or null. */
function extractYear(value) {
  const match = String(value || '').match(/\b(?:19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

function pelispediaSlugifyTitle(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function scoreCandidate(result, title, originalTitle, year, extraTitles = []) {
  const cleanTitle = cleanText(title);
  const cleanOriginal = cleanText(originalTitle);
  const cleanExtras = extraTitles.map(cleanText).filter(Boolean);
  const cleanResult = cleanText(result.title);
  const cleanSlug = cleanText(result.url.split('/').pop()?.replace(/-/g, ' '));
  let score = 0;

  if (cleanTitle && (looseIncludes(cleanResult, cleanTitle) || looseIncludes(cleanSlug, cleanTitle))) score += 4;
  if (cleanOriginal && (looseIncludes(cleanResult, cleanOriginal) || looseIncludes(cleanSlug, cleanOriginal))) score += 3;
  if (cleanTitle && cleanResult === cleanTitle) score += 5;
  if (cleanOriginal && cleanSlug === cleanOriginal) score += 5;

  for (const cleanExtra of cleanExtras) {
    if (looseIncludes(cleanResult, cleanExtra) || looseIncludes(cleanSlug, cleanExtra)) score += 3;
    if (cleanResult === cleanExtra || cleanSlug === cleanExtra) score += 5;
  }

  if (year) {
    const resultYear = extractYear(`${result.title} ${result.year || ''} ${result.url}`);
    if (resultYear && resultYear !== year) return 0;
    if (resultYear === year) score += 8;
  }

  return score;
}

function buildFallbackUrls(type, title, originalTitle, year, extraTitles = []) {
  const basePath = type === 'series' ? 'serie' : 'pelicula';
  const candidates = [];
  const seen = new Set();

  for (const value of [title, originalTitle, ...extraTitles]) {
    const slug = pelispediaSlugifyTitle(value);
    if (!slug) continue;

    for (const candidateSlug of [slug, year ? `${slug}-${year}` : '']) {
      if (!candidateSlug || seen.has(candidateSlug)) continue;
      seen.add(candidateSlug);
      candidates.push(`${PELISPEDIA_BASE_URL}/${basePath}/${candidateSlug}`);
    }
  }

  return candidates;
}

function runPelispediaQuery(query, title, originalTitle, year, type, userAgent, signal, extraTitles) {
  const pathNeedle = type === 'series' ? '/serie/' : '/pelicula/';
  const searchUrl = `${PELISPEDIA_BASE_URL}/search?s=${encodeURIComponent(query)}`;

  return fetchTextWithTimeout(searchUrl, { headers: { 'User-Agent': userAgent }, signal }, PELISPEDIA_SEARCH_TIMEOUT_MS)
    .then(({ res, text: html }) => {
      if (!res.ok) return null;
      const $ = cheerio.load(html);
      const results = [];

      $('a[href]').each((_, el) => {
        const url = normalizeUrl($(el).attr('href'), PELISPEDIA_BASE_URL);
        if (!url || !url.includes(pathNeedle)) return;
        const card = $(el).closest('.movie-card');
        const titleText = (card.find('h4,h10,h3').first().text() || $(el).text()).trim().replace(/\s+/g, ' ');
        const yearText = card.find('.year').first().text().trim();
        if (titleText) results.push({ url, title: titleText, year: yearText });
      });

      let bestMatch = null;
      let bestScore = 0;
      for (const result of results) {
        const score = scoreCandidate(result, title, originalTitle, year, extraTitles);
        if (score > bestScore) {
          bestMatch = result;
          bestScore = score;
        }
      }

      return bestMatch ? bestMatch.url : null;
    })
    .catch((error) => {
      console.warn(`PelisPedia: Search failed for "${query}": ${error.message}`);
      return null;
    });
}

/**
 * The Spanish and original names are the two always worth trying, so they go out
 * together rather than one after the other; see raceTitleSearches. The
 * alternative-title tail stays sequential, followed by direct-URL fallbacks.
 */
function pelispediaSearch(title, originalTitle, year, type, userAgent, signal, extraTitles = []) {
  const queries = [...new Set([title, originalTitle, ...extraTitles].filter(Boolean))];
  const runQuery = (query) => runPelispediaQuery(query, title, originalTitle, year, type, userAgent, signal, extraTitles);

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

      const fallbackUrls = buildFallbackUrls(type, title, originalTitle, year, extraTitles);
      function tryFallback(i) {
        if (i >= fallbackUrls.length) return null;
        const candidateUrl = fallbackUrls[i];
        return fetchWithTimeout(candidateUrl, { headers: { 'User-Agent': userAgent }, signal }, PELISPEDIA_SEARCH_TIMEOUT_MS)
          .then((res) => (res.ok ? candidateUrl : tryFallback(i + 1)))
          .catch(() => tryFallback(i + 1));
      }
      return tryFallback(0);
    });
}

function extractIframeUrls(html, pageUrl) {
  const $ = cheerio.load(html);
  const urls = [];

  $('iframe[src]').each((_, el) => {
    const url = normalizeUrl($(el).attr('src'), pageUrl);
    if (url) urls.push(url);
  });

  return [...new Set(urls)];
}

function findEpisodeUrl(html, pageUrl, season, episode) {
  if (!season || !episode) return null;
  const $ = cheerio.load(html);
  const patterns = [
    new RegExp(`(?:temporada|season)[^0-9]*${season}[^0-9]+(?:episodio|episode|capitulo|capítulo)[^0-9]*${episode}`, 'i'),
    new RegExp(`\\b${season}\\s*x\\s*${episode}\\b`, 'i'),
    new RegExp(`\\bs${season}\\s*e${episode}\\b`, 'i')
  ];

  let match = null;
  $('a[href]').each((_, el) => {
    if (match) return;
    const href = normalizeUrl($(el).attr('href'), pageUrl);
    const text = `${$(el).text()} ${href}`;
    if (href && patterns.some((pattern) => pattern.test(text))) {
      match = href;
    }
  });

  return match;
}

function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  const { signal, extraTitles = [] } = options;
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return pelispediaSearch(title, originalTitle, year, type, userAgent, signal, extraTitles)
    .then((pageUrl) => {
      if (!pageUrl) {
        console.log(`PelisPedia: No matching content found for "${title}"`);
        return [];
      }

      return fetchTextWithTimeout(pageUrl, { headers: { 'User-Agent': userAgent }, signal }, PELISPEDIA_PAGE_TIMEOUT_MS)
        .then((page) => {
          if (!page.res.ok) return [];

          const moviePagePromise = type === 'series'
            ? (() => {
                const episodeUrl = findEpisodeUrl(page.text, pageUrl, season, episode);
                if (!episodeUrl) {
                  console.log(`PelisPedia: No episode found for "${title}" S${season}E${episode}`);
                  return Promise.resolve(null);
                }
                return fetchTextWithTimeout(episodeUrl, { headers: { 'User-Agent': userAgent }, signal }, PELISPEDIA_PAGE_TIMEOUT_MS)
                  .then((episodePage) => (episodePage.res.ok ? { targetUrl: episodeUrl, html: episodePage.text } : null));
              })()
            : Promise.resolve({ targetUrl: pageUrl, html: page.text });

          return moviePagePromise.then((resolved) => {
            if (!resolved) return [];
            const { targetUrl, html: pageHtml } = resolved;

            const iframeUrls = extractIframeUrls(pageHtml, targetUrl);
            console.log(`PelisPedia: Found ${iframeUrls.length} iframe players`);

            return mapWithConcurrency(iframeUrls, PELISPEDIA_PLAYER_CONCURRENCY, (iframeUrl, index) =>
              resolvePlayerStream(iframeUrl, userAgent, targetUrl, { signal }).then((resolvedUrl) => {
                if (!resolvedUrl) return null;
                return {
                  name: 'PelisPedia',
                  title: `🇲🇽 Opcion ${index + 1}`,
                  url: resolvedUrl,
                  headers: { 'User-Agent': userAgent, Referer: iframeUrl }
                };
              })
            );
          });
        });
    })
    .catch((error) => {
      console.error(`PelisPedia scrape error for "${title}":`, error.message);
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
  // Always regex-extracts just the resolution token instead of trusting
  // quality verbatim when present, matching the same fix applied to the
  // English providers -- keeps this consistent even though Latino streams
  // rarely set quality upfront today.
  const text = `${quality || ''} ${title || ''} ${name || ''}`;
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

function probeNuvioStream(nuvioStream) {
  return probeStreamPlayable(nuvioStream.url).then((playable) => (playable ? nuvioStream : null));
}

// Latino sources rarely expose a real resolution, so the quality subtitle
// (the only per-stream text Nuvio's card actually renders -- title is not
// shown) would otherwise stay blank and every stream card would be
// indistinguishable from the next except by provider name. Falls back to
// the embed server's own label (e.g. "Voe", "Streamtape") stripped of its
// leading flag/arrow emoji, so streams from the same provider can still be
// told apart.
function deriveServerLabel(internalStream) {
  const raw = String((internalStream && internalStream.title) || '').trim();
  if (!raw) return null;
  const stripped = raw.replace(/^[^\w(]+/, '').trim();
  return stripped || null;
}

// Caps each provider's own contribution to the merged stream list -- with
// nine Latino providers each returning everything they find, the combined
// list Nuvio shows can otherwise run into the dozens for one title. Known
// resolutions sort first (higher first), everything else keeps the order
// probing produced it in.
const MAX_STREAMS_PER_PROVIDER = 5;
const STREAM_RESOLUTION_RANK = { '2160p': 4, '1080p': 3, '720p': 2, '480p': 1, '360p': 0 };
function finalizeStreams(streams) {
  return (streams || [])
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => {
      const rankA = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, a.stream.quality) ? STREAM_RESOLUTION_RANK[a.stream.quality] : -1;
      const rankB = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, b.stream.quality) ? STREAM_RESOLUTION_RANK[b.stream.quality] : -1;
      if (rankA !== rankB) return rankB - rankA;
      return a.index - b.index;
    })
    .slice(0, MAX_STREAMS_PER_PROVIDER)
    .map((entry) => entry.stream);
}

function toNuvioStream(internalStream) {
  const container = extractStreamContainer(internalStream.url);
  const resolution = extractStreamResolution(internalStream.quality, internalStream.title, internalStream.name);
  const nuvioStream = {
    name: internalStream.name,
    title: ['Latino', container, resolution].filter(Boolean).join(' • ') || ' ',
    url: toMediaflowProxyUrl(internalStream.url, internalStream.headers),
    quality: resolution || deriveServerLabel(internalStream) || null,
    size: null,
    provider: 'pelispedia'
  };

  return nuvioStream;
}

/**
 * Required Nuvio local-scraper entry point.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|null} seasonNum
 * @param {number|null} episodeNum
 * @returns {Promise<Array<object>>}
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  const type = mediaType === 'tv' ? 'series' : 'movie';

  // TMDB details and its translations are independent lookups; fetching
  // them serially cost a full extra round trip before the scrape could even
  // start.
  return Promise.all([fetchTmdbDetails(tmdbId, mediaType), getAlternativeTitles(mediaType, tmdbId)])
    .then(([details, extraTitles]) => {
      if (!details || !details.title) return [];

      return scrape(details.title, details.originalTitle, details.year, type, seasonNum, episodeNum, { extraTitles }).then((results) =>
        mapWithConcurrency((results || []).map((stream) => toNuvioStream(stream)), STREAM_PROBE_CONCURRENCY, (nuvioStream) => probeNuvioStream(nuvioStream)).then(finalizeStreams)
      );
    })
    .catch((error) => {
      console.error('PelisPedia (Nuvio): getStreams failed:', error && error.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

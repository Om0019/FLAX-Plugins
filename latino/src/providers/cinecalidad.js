/**
 * Cinecalidad provider for Nuvio Local Scrapers.
 *
 * Ported from the "Latino" Stremio addon (src/scrapers/cinecalidad.js +
 * src/unpacker.js + src/http.js + src/concurrency.js, plus the TMDB lookup
 * from src/tmdb.js since Nuvio hands this file a tmdbId rather than an
 * already-resolved title). That addon ran as an Express server and used
 * Node's `http`/`crypto`/`Buffer` plus several sibling modules loaded with
 * `require`. Nuvio's local-scraper sandbox instead:
 *   - loads exactly this one file and calls `getStreams(...)` on it
 *   - has no Node built-ins (no `crypto`, no `Buffer`, no `fs`)
 *   - has no `async`/`await` support, so everything here is Promise chains
 *
 * The generic player unpacker below (shared verbatim with providers/sololatino.js
 * and providers/cuevana3i.js, since Nuvio's sandbox can't `require('../unpacker')`
 * across files) stubs out three resolvers that depend on Node's `crypto` module
 * for real cryptography (AES-GCM / AES-CBC / SHA-256) not reasonably
 * reimplementable by hand here:
 *   - Filemoon (AES-128/256-GCM playback payloads) — also captcha-gated on
 *     effectively every file per the original code's own findings.
 *   - Pelisplus mirrors (AES-128-CBC API responses)
 *   - embed69 (AES-256-CBC + a SHA-256 proof-of-work)
 * Cinecalidad's own player options and download mirrors need none of that —
 * they port without any stubbing. Everything else from the original unpacker —
 * Dean Edwards `eval(function(p,a,c,k,e,d)` unpacking, VOE, Dood, Streamtape,
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

/**
 * Promise-chain equivalent of the original addon's fetchWithDeadline.
 *
 * The deadline and any caller-supplied abort signal are raced against the
 * request, NOT wired into fetch via `signal`. Nuvio runs on React Native,
 * whose fetch does not honour an AbortSignal the way Node's does -- passing
 * `signal` makes the request fail outright, and since getStreams swallows
 * errors into an empty array, every AbortController-based provider silently
 * returned zero streams on-device while working fine under Node. (Exactly
 * the providers that avoid AbortController are the ones that were observed
 * working in the app.) Racing can't cancel the underlying request, so a
 * timed-out or abandoned fetch runs to completion in the background; that's
 * an acceptable trade for a request that actually completes, and callers
 * already treat these rejections as "move on to the next candidate".
 */
function fetchWithDeadline(url, options, timeoutMs, consume) {
  const externalSignal = options.signal;
  const { signal, ...fetchOptions } = options;

  let timeoutId;
  let onExternalAbort;

  const deadline = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
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
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  const request = fetch(url, fetchOptions).then((res) => Promise.resolve(consume(res)));

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
      console.error(`Cinecalidad: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
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
      console.error('Cinecalidad unpacker: failed to decode script block:', err.message);
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
      console.warn(`Cinecalidad unpacker: Xupalace server ${entry.server || entry.url} failed: ${e.message}`);
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
    if (!options.quiet) console.warn(`Cinecalidad unpacker: VOE payload decode failed: ${error.message}`);
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
    console.warn(`Cinecalidad unpacker: Nupload decode failed: ${error.message}`);
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
    console.warn(`Cinecalidad unpacker: VidGuard signature decode failed: ${error.message}`);
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
    console.log(`Cinecalidad unpacker: skipping ${getHostname(url)}, which accepts no connections`);
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
      console.warn(`Cinecalidad unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
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
        console.log(`Cinecalidad unpacker: recognised ${getHostname(url)} as a VOE mirror by payload`);
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
      console.log(`Cinecalidad unpacker: following JS redirect to ${redirectUrl}`);
      return resolvePlayerStream(redirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });

  chain = chain.then((result) => {
    if (result) return result;
    const assignedRedirectUrl = extractAssignedRedirect(html, url);
    if (assignedRedirectUrl && assignedRedirectUrl !== url && isHttpUrl(assignedRedirectUrl)) {
      console.log(`Cinecalidad unpacker: following assigned redirect to ${assignedRedirectUrl}`);
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
// Cinecalidad-specific scraping (ported from src/scrapers/cinecalidad.js)
// ---------------------------------------------------------------------------

const CINECALIDAD_SEARCH_TIMEOUT_MS = 4500;
const CINECALIDAD_PAGE_TIMEOUT_MS = 5500;
// Each external download link is a separate file host, so these overlap a little
// more freely than same-origin candidate probes elsewhere.
const EXTERNAL_DOWNLOAD_CONCURRENCY = 3;
const VALIDATION_TIMEOUT_MS = 2500;
const PLAYER_FAST_MIN_WAIT_MS = 1000;
const PLAYER_FAST_MIN_STREAMS = 1;
const PLAYER_COLLECTION_TIMEOUT_MS = 7500;

function extractSeriesSlug(url) {
  const match = url.match(/\/(?:ver-serie|serie)\/([^/]+)/);
  return match?.[1] || null;
}

function buildEpisodeUrlFromSeriesSlug(slug, season, episode) {
  return `https://www.cinecalidad.am/ver-el-episodio/${slug}-${season}x${episode}/`;
}

function normalizeServerName(label) {
  return (label || '')
    .replace('Recomendado', '')
    .replace(/Contraseña:.*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDownloadPageLinks(movieDoc) {
  const links = [];
  const seen = new Set();

  movieDoc('a[href*="?download="]').each((i, el) => {
    const href = movieDoc(el).attr('href');
    const serverName = normalizeServerName(movieDoc(el).text()) || `Descarga ${i + 1}`;
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({ downloadPageUrl: href, serverName });
  });

  return links;
}

function extractExternalDownloadLinks(movieDoc) {
  const links = [];
  const seen = new Set();

  movieDoc('a').each((i, el) => {
    const href = movieDoc(el).attr('href');
    const serverName = normalizeServerName(movieDoc(el).text());
    if (!href || !serverName) return;
    if (href.includes('cinecalidad.am/ver-') && href.includes('?download=')) return;
    if (!/mediafire|1fichier|megaup|fireload/i.test(serverName + ' ' + href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ downloadUrl: href, serverName });
  });

  return links;
}

function isPlayableDownloadTarget(url, userAgent, referer, signal) {
  return fetchWithTimeout(url, {
    method: 'HEAD',
    redirect: 'manual',
    headers: {
      'User-Agent': userAgent,
      'Referer': referer
    },
    signal
  }, VALIDATION_TIMEOUT_MS)
    .then((res) => {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const contentDisposition = (res.headers.get('content-disposition') || '').toLowerCase();

      if (contentType.startsWith('video/') || contentType.includes('application/vnd.apple.mpegurl')) {
        return true;
      }

      if (contentDisposition.includes('attachment') && !contentType.startsWith('text/html')) {
        return true;
      }

      if (/\.(m3u8|mp4|mkv)(?:$|[?#])/i.test(url) && !contentType.startsWith('text/html')) {
        return true;
      }

      return false;
    })
    .catch((error) => {
      console.error(`Cinecalidad: Error validating download target ${url}:`, error.message);
      return false;
    });
}

function resolveDownloadPage(downloadPageUrl, userAgent, referer, signal) {
  return fetchTextWithTimeout(downloadPageUrl, {
    headers: {
      'User-Agent': userAgent,
      'Referer': referer
    },
    signal
  }, CINECALIDAD_PAGE_TIMEOUT_MS)
    .then(({ res, text: html }) => {
      if (!res.ok) return null;
      const matches = [...new Set(html.match(/https?:[^"'`\s<>]+/g) || [])];

      return matches.find((url) => {
        if (url.includes('cinecalidad.am') || url.includes('t.me/')) return false;
        return /1fichier|megaup|mediafire|fireload/i.test(url);
      }) || null;
    })
    .catch((error) => {
      console.error(`Cinecalidad: Error resolving download page ${downloadPageUrl}:`, error.message);
      return null;
    });
}

/**
 * Resolves a download-host landing page to the file behind it. Only MediaFire
 * needs this (the others already point straight at a file); ported from
 * src/unpacker.js's resolveDownloadUrl using the MediaFire helpers already
 * defined above.
 */
function resolveDownloadUrl(url, userAgent, referer, options = {}) {
  if (!isMediafireHost(url)) return Promise.resolve(url);

  return fetchTextWithTimeout(url, {
    headers: { 'User-Agent': userAgent, Referer: referer || url },
    signal: options.signal
  }, PLAYER_FETCH_TIMEOUT_MS)
    .then(({ res, text: html }) => {
      if (!res.ok) return url;
      const directUrl = extractMediafireDirectUrl(html, url);
      if (directUrl) {
        console.log(`Cinecalidad: MediaFire resolved ${url} => ${directUrl.substring(0, 80)}...`);
        return directUrl;
      }
      return url;
    })
    .catch((error) => {
      console.warn(`Cinecalidad: MediaFire resolve failed for ${url}: ${error.message}`);
      return url;
    });
}

function scorePlayerOption(option) {
  const text = `${option.serverName || ''} ${option.playerUrl || ''}`.toLowerCase();

  if (text.includes('vimeos')) return 0;
  if (text.includes('goodstream')) return 1;
  if (text.includes('hlswish') || text.includes('streamwish')) return 2;
  if (text.includes('waaw')) return 10;
  // Filemoon gates playback behind a captcha and VOE behind a DDoS-Guard JS
  // check; no server-side resolver can answer either, so they are tried only
  // once everything else has failed.
  if (text.includes('filemoon') || text.includes('voe')) return 11;
  return 5;
}

function sortPlayerOptions(playerOptions) {
  return [...playerOptions].sort((a, b) => scorePlayerOption(a) - scorePlayerOption(b));
}

/**
 * Waits for `playerPromises` to settle, but returns early once either the
 * collection timeout elapses or (after a short grace period) enough streams
 * have already landed in `streams`. `streams` is mutated in place by each
 * promise as it resolves, same as the original async version.
 */
function waitForPlayerResolvers(playerPromises, streams) {
  return new Promise((resolve) => {
    let fastReturnEnabled = false;
    let settled = false;

    function finish(reason) {
      if (settled) return;
      settled = true;
      resolve(reason);
    }

    setTimeout(() => {
      fastReturnEnabled = true;
      if (streams.length >= PLAYER_FAST_MIN_STREAMS) finish('enough-streams');
    }, PLAYER_FAST_MIN_WAIT_MS);

    setTimeout(() => finish('timeout'), PLAYER_COLLECTION_TIMEOUT_MS);

    Promise.allSettled(
      playerPromises.map((promise) =>
        promise.finally(() => {
          if (fastReturnEnabled && streams.length >= PLAYER_FAST_MIN_STREAMS) finish('enough-streams');
        })
      )
    ).then(() => finish('complete'));
  }).then((completed) => {
    if (completed !== 'complete') {
      const reason = completed === 'enough-streams' ? 'fast player target met' : 'timeout';
      console.warn(`Cinecalidad: Returning ${streams.length} resolved player streams (${reason}); slow wrappers still pending.`);
    }
    return completed;
  });
}

/**
 * Cinecalidad Scraper (Direct Streams)
 */
function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  const { signal, extraTitles = [] } = options;
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  function performSearch(searchQuery) {
    const searchUrl = `https://www.cinecalidad.am/?s=${encodeURIComponent(searchQuery)}`;
    return fetchTextWithTimeout(searchUrl, {
      headers: { 'User-Agent': userAgent },
      signal
    }, CINECALIDAD_SEARCH_TIMEOUT_MS).then(({ res, text: html }) => {
      if (!res.ok) return null;
      const $ = cheerio.load(html);
      const results = [];

      $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        const titleAttr = $(el).attr('title') || '';

        const isMovieLink = href.includes('/ver-pelicula/') || href.includes('/pelicula/');
        const isSeriesLink = href.includes('/ver-serie/') || href.includes('/serie/');

        if (isMovieLink || isSeriesLink) {
          if ((type === 'movie' && isMovieLink) || (type === 'series' && isSeriesLink)) {
            const fullTitle = titleAttr || text;
            if (fullTitle) {
              results.push({ url: href, title: fullTitle });
            }
          }
        }
      });

      const uniqueResults = [];
      const seenUrls = new Set();
      for (const r of results) {
        if (type === 'series' && !extractSeriesSlug(r.url)) {
          continue;
        }

        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          uniqueResults.push(r);
        }
      }

      const cleanTargetTitle = cleanText(title);
      const cleanOriginalTitle = cleanText(originalTitle);
      const cleanExtraTitles = extraTitles.map(cleanText).filter(Boolean);
      let bestMatch = null;
      let bestScore = -1;

      for (const r of uniqueResults) {
        const cleanResultTitle = cleanText(r.title);
        const slug = extractSeriesSlug(r.url) || '';
        const cleanSlug = cleanText(slug.replace(/-/g, ' '));
        const matchesTitle = cleanTargetTitle && (cleanResultTitle.includes(cleanTargetTitle) || cleanTargetTitle.includes(cleanResultTitle));
        const matchesOriginal = cleanOriginalTitle && (cleanResultTitle.includes(cleanOriginalTitle) || cleanOriginalTitle.includes(cleanResultTitle));
        const matchesExtra = cleanExtraTitles.some((extra) => cleanResultTitle.includes(extra) || extra.includes(cleanResultTitle));
        const cleanSlugMatchesExtra = cleanExtraTitles.includes(cleanSlug);

        if (matchesTitle || matchesOriginal || matchesExtra || cleanSlug === cleanTargetTitle || cleanSlug === cleanOriginalTitle || cleanSlugMatchesExtra) {
          let score = 0;

          if (matchesTitle) score += 3;
          if (matchesOriginal) score += 2;
          if (matchesExtra) score += 2;
          if (cleanSlug === cleanTargetTitle || cleanSlug === cleanOriginalTitle || cleanSlugMatchesExtra) score += 4;
          if (cleanResultTitle === cleanTargetTitle || cleanResultTitle === cleanOriginalTitle || cleanExtraTitles.includes(cleanResultTitle)) score += 3;

          if (year) {
            const hasYear = r.title.includes(year.toString()) || cleanResultTitle.includes(year.toString()) || cleanSlug.includes(year.toString());
            if (hasYear) score += 2;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = r;
          }
        }
      }
      return bestMatch;
    });
  }

  const racedTitles = originalTitle && cleanText(originalTitle) !== cleanText(title)
    ? [title, originalTitle]
    : [title];

  return raceTitleSearches(racedTitles, performSearch)
    .then((bestMatch) => {
      if (bestMatch) return bestMatch;

      const triedClean = new Set([cleanText(title), cleanText(originalTitle)]);
      function tryExtras(i) {
        if (i >= extraTitles.length) return null;
        const extraTitle = extraTitles[i];
        const cleanExtra = cleanText(extraTitle);
        if (!cleanExtra || triedClean.has(cleanExtra)) return tryExtras(i + 1);
        triedClean.add(cleanExtra);
        console.log(`Cinecalidad: No match yet, trying alternative title "${extraTitle}"`);
        return performSearch(extraTitle).then((match) => match || tryExtras(i + 1));
      }
      return tryExtras(0);
    })
    .then((bestMatch) => {
      if (!bestMatch) {
        console.log(`Cinecalidad: No matching content found for "${title}"`);
        return [];
      }

      let targetPageUrl = bestMatch.url;
      if (type === 'series') {
        const slug = extractSeriesSlug(targetPageUrl);
        if (!slug) {
          console.log(`Cinecalidad: Could not extract a series slug for "${title}"`);
          return [];
        }
        targetPageUrl = buildEpisodeUrlFromSeriesSlug(slug, season, episode);
      }

      console.log(`Cinecalidad: Matched target page: ${bestMatch.title} (${targetPageUrl})`);

      return fetchTextWithTimeout(targetPageUrl, {
        headers: { 'User-Agent': userAgent },
        signal
      }, CINECALIDAD_PAGE_TIMEOUT_MS).then(({ res: movieRes, text: movieHtml }) => {
        if (!movieRes.ok) return [];
        const movieDoc = cheerio.load(movieHtml);

        const playerOptions = [];
        movieDoc('#playeroptionsul li').each((i, el) => {
          const playerUrl = movieDoc(el).attr('data-option');
          let serverName = movieDoc(el).text().trim() || `Servidor ${i + 1}`;

          if (serverName.toLowerCase().includes('trailer') || (playerUrl && playerUrl.includes('youtube.com'))) {
            return;
          }

          if (playerUrl) {
            playerOptions.push({
              playerUrl,
              serverName: normalizeServerName(serverName)
            });
          }
        });

        console.log(`Cinecalidad: Found ${playerOptions.length} player options. Fetching stream sources...`);
        const sortedPlayerOptions = sortPlayerOptions(playerOptions);

        const streams = [];
        const downloadPageLinks = extractDownloadPageLinks(movieDoc);
        const externalDownloadLinks = extractExternalDownloadLinks(movieDoc);

        const playerController = new AbortController();
        const abortPlayerResolvers = () => playerController.abort();
        if (signal) {
          if (signal.aborted) {
            playerController.abort();
          } else {
            signal.addEventListener('abort', abortPlayerResolvers, { once: true });
          }
        }

        const playerPromises = sortedPlayerOptions.map((opt) =>
          resolvePlayerStream(opt.playerUrl, userAgent, targetPageUrl, { signal: playerController.signal })
            .then((directUrl) => {
              if (directUrl) {
                streams.push({
                  name: 'Cinecalidad',
                  title: `🇲🇽 ${opt.serverName}`,
                  url: directUrl,
                  headers: { 'User-Agent': userAgent, Referer: opt.playerUrl }
                });
              }
            })
            .catch((err) => {
              console.error(`Cinecalidad: Error resolving direct stream for ${opt.serverName}:`, err.message);
            })
        );

        return waitForPlayerResolvers(playerPromises, streams).then((playerCompletion) => {
          if (playerCompletion !== 'complete') {
            playerController.abort();
          }
          if (signal) {
            signal.removeEventListener('abort', abortPlayerResolvers);
          }

          return Promise.all(
            downloadPageLinks.map((downloadLink) =>
              resolveDownloadPage(downloadLink.downloadPageUrl, userAgent, targetPageUrl, signal).then((pageUrl) => {
                if (!pageUrl) return null;
                // A download mirror's landing page is HTML and never passes the playability
                // check, so it has to be turned into the file it points at first.
                return resolveDownloadUrl(pageUrl, userAgent, targetPageUrl, { signal }).then((resolvedUrl) =>
                  isPlayableDownloadTarget(resolvedUrl, userAgent, targetPageUrl, signal).then((isPlayable) => {
                    if (!isPlayable) return null;
                    return {
                      name: 'Cinecalidad',
                      title: `⬇ ${downloadLink.serverName}`,
                      url: resolvedUrl,
                      headers: { 'User-Agent': userAgent, Referer: targetPageUrl }
                    };
                  })
                );
              })
            )
          ).then((downloadTargets) => {
            for (const stream of downloadTargets.filter(Boolean)) {
              streams.push(stream);
            }

            // Every one of these is two round trips — resolve the mirror, then probe the
            // file — and they were run one link after another while the sibling loop above
            // already resolved its own links together. Bounded rather than unbounded
            // because each link is a different file host.
            return mapWithConcurrency(externalDownloadLinks, EXTERNAL_DOWNLOAD_CONCURRENCY, (link) =>
              resolveDownloadUrl(link.downloadUrl, userAgent, targetPageUrl, { signal }).then((downloadUrl) =>
                isPlayableDownloadTarget(downloadUrl, userAgent, targetPageUrl, signal).then((isPlayable) => {
                  if (!isPlayable) return null;
                  return {
                    name: 'Cinecalidad',
                    title: `⬇ ${link.serverName}`,
                    url: downloadUrl,
                    headers: { 'User-Agent': userAgent, Referer: targetPageUrl }
                  };
                })
              )
            ).then((externalTargets) => {
              // De-duplication has to happen here rather than inside the worker: two links
              // can resolve to the same file, and concurrent workers would each see a
              // streams list that did not yet contain the other's result.
              for (const stream of externalTargets) {
                if (!streams.some((existing) => existing.url === stream.url)) {
                  streams.push(stream);
                }
              }

              console.log(`Cinecalidad: Resolved ${streams.length} stream options`);
              return [...streams];
            });
          });
        });
      });
    })
    .catch((error) => {
      console.error(`Cinecalidad scrape error for "${title}":`, error.message);
      return [];
    });
}

// ---------------------------------------------------------------------------
// Nuvio entry point
// ---------------------------------------------------------------------------

function toNuvioStream(internalStream, mediaTitle) {
  return {
    name: internalStream.name,
    title: mediaTitle ? `${internalStream.title} - ${mediaTitle}` : internalStream.title,
    url: internalStream.url,
    quality: 'Unknown',
    size: 'Unknown',
    headers: internalStream.headers,
    provider: 'cinecalidad'
  };
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

  return fetchTmdbDetails(tmdbId, mediaType)
    .then((details) => {
      if (!details || !details.title) return [];

      return getAlternativeTitles(mediaType, tmdbId).then((extraTitles) =>
        scrape(details.title, details.originalTitle, details.year, type, seasonNum, episodeNum, { extraTitles }).then((results) =>
          (results || []).map((stream) => toNuvioStream(stream, details.title))
        )
      );
    })
    .catch((error) => {
      console.error('Cinecalidad (Nuvio): getStreams failed:', error && error.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

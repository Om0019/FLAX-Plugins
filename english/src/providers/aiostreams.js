/**
 * AIOStreams provider for Nuvio Local Scrapers.
 *
 * Ported from the English Stremio addon's src/providers/aiostreams.js, which
 * replaced Torrentio as of that addon's PR #35. That version is called with
 * an IMDb id it already has at the HTTP boundary; Nuvio instead hands this
 * file a tmdbId, so a TMDB `external_ids` lookup is added here to get the
 * IMDb id AIOStreams needs. Converted from async/await to Promise chains and
 * from `Buffer.from(...).toString('base64')` to a hand-rolled base64 encoder,
 * since Nuvio's sandbox has neither.
 *
 * Hits GET {AIOSTREAMS_BASE_URL}?type=movie|series&id=<imdbId[:season:episode]>,
 * authenticated with `Authorization: Basic base64(uuid:password)`. Filtering
 * (quality, HDR, cache status, etc.) is configured on the AIOStreams instance
 * itself, not here.
 *
 * NOTE: AIOSTREAMS_UUID/AIOSTREAMS_PASSWORD below are real credentials for a
 * specific AIOStreams instance, baked in because Nuvio's local-scraper
 * sandbox has no environment-variable mechanism to keep them out of the
 * file. Anyone who can fetch this file's raw contents (e.g. wherever
 * manifest.json ends up hosted) can read them.
 */

const AIOSTREAMS_BASE_URL = 'https://aiostreamsfortheweebsstable.midnightignite.me/api/v1/search';
const AIOSTREAMS_UUID = '4b990cd7-9058-41f6-a099-224272656e63';
const AIOSTREAMS_PASSWORD = 'Jason001$';

// AIOStreams' /search endpoint aggregates results from multiple indexers
// server-side, which can take a while even on a request that's about to
// succeed; 8s was cutting off legitimate slow-but-working responses on
// real-world (non-cloud-datacenter) networks, so this is well over what a
// diagnostic run against the live instance actually measured.
const AIOSTREAMS_TIMEOUT_MS = 25000;
const TMDB_API_KEY = 'af3fa2d2239e9d0e6c04a1076d3df76f';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// base64 (replacement for Node's Buffer, which isn't available here)
// ---------------------------------------------------------------------------

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodes a plain ASCII string as base64 (byte-for-byte, i.e. latin1). */
function stringToBase64(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i) & 0xff);

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

function authHeader() {
  return `Basic ${stringToBase64(`${AIOSTREAMS_UUID}:${AIOSTREAMS_PASSWORD}`)}`;
}

// ---------------------------------------------------------------------------
// http helpers (fetch + timeout, no Node `http` module)
// ---------------------------------------------------------------------------

// Nuvio's sandbox provides NO timer functions -- a bare `setTimeout` call
// there throws "'setTimeout' is not defined" (confirmed on-device) -- and its
// fetch does not honour an AbortSignal the way Node's does. Since getStreams
// swallows errors into an empty array, reaching for either one failed
// silently and this provider returned zero streams every time. So: no
// AbortController, and the deadline is skipped entirely when there are no
// timers to arm it with. Plain Node, used for local testing, has timers and
// keeps the original timeout behaviour. A raced timeout can't cancel the
// underlying request either way, which is an acceptable trade for one that
// actually completes.
const HAS_TIMERS = typeof setTimeout === 'function';

function fetchWithTimeout(url, options, timeoutMs) {
  if (!HAS_TIMERS) return fetch(url, options);

  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Fetch timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);
  });

  return Promise.race([fetch(url, options), timeout]).then(
    (res) => {
      clearTimeout(timeoutId);
      return res;
    },
    (error) => {
      clearTimeout(timeoutId);
      throw error;
    }
  );
}

function fetchJsonWithTimeout(url, options, timeoutMs) {
  return fetchWithTimeout(url, options, timeoutMs)
    .then((res) => res.text().then((text) => ({ res, text })))
    .then(({ res, text }) => {
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return { res, data };
    });
}

// ---------------------------------------------------------------------------
// Playability probe -- AIOStreams hands back everything a configured indexer
// found, including uncached/stale debrid links that time out or 404 when
// actually opened. Mirrors the Range/HEAD-based probe every Latino provider
// already runs (see latino/src/providers/*.js) so AIOStreams cards are as
// reliable as the rest of the list instead of the least reliable part of it.
// ---------------------------------------------------------------------------

const STREAM_PROBE_RANGE_BYTES = 2048;
const STREAM_PROBE_TIMEOUT_MS = 5000;
// Was 4. Nuvio itself runs up to 3 providers concurrently, and several of
// this repo's own providers fan out 10-50+ of their own requests while
// scraping a single title -- on a real device that adds up to enough
// simultaneous open connections to be a plausible crash trigger. Lower
// per-provider probe concurrency trades a little probing speed for a
// meaningfully smaller connection/memory footprint at any given moment.
const STREAM_PROBE_CONCURRENCY = 2;

function isHtmlProbeResponse(res, text) {
  const contentType = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
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

// Some CDNs ignore the Range header entirely and respond 200 with the
// *whole* file instead of 206 with just the requested slice. Reading such a
// response as text means buffering an entire multi-hundred-MB/GB video into
// a JS string -- which is what was actually causing titles to spin forever,
// not a network hang: a probe silently trying to download the whole movie
// before it could decide whether the movie was playable. Only read the body
// when it's actually bounded: a real 206 (the Range was honoured, so the
// body is just the requested slice) or a Content-Length small enough to be
// a manifest/error page rather than a video file.
const STREAM_PROBE_MAX_BODY_BYTES = 2 * 1024 * 1024;
function shouldReadProbeBody(res) {
  if (res.status === 206) return true;
  const lengthHeader = res.headers && res.headers.get && res.headers.get('content-length');
  const length = lengthHeader ? parseInt(lengthHeader, 10) : NaN;
  return !Number.isNaN(length) && length <= STREAM_PROBE_MAX_BODY_BYTES;
}

function probeHlsPlayback(body, manifestUrl, depth) {
  const resourceUrl = firstPlaylistEntryUrl(body, manifestUrl);
  if (!resourceUrl) return Promise.resolve(false);
  if (depth >= 1) {
    return fetchWithTimeout(resourceUrl, { method: 'HEAD' }, STREAM_PROBE_TIMEOUT_MS)
      .then((res) => ![401, 403, 404, 410, 451].includes(res.status))
      .catch(() => true);
  }
  return fetchWithTimeout(resourceUrl, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then((res) => {
    if (!res.ok && res.status !== 206) return false;
    if (!shouldReadProbeBody(res)) return true;
    return res.text().then((text) => {
      if (isHtmlProbeResponse(res, text)) return false;
      if (hasPlaylistEntries(text)) return probeHlsPlayback(text, resourceUrl, depth + 1);
      return text.length > 0;
    });
  }).catch(() => false);
}

function probeStreamPlayable(streamUrl) {
  return fetchWithTimeout(streamUrl, {
    headers: { Range: `bytes=0-${STREAM_PROBE_RANGE_BYTES - 1}` }
  }, STREAM_PROBE_TIMEOUT_MS).then((res) => {
    if ([401, 403, 404, 410, 451].includes(res.status)) return false;
    if (!res.ok && res.status !== 206) return false;
    if (!shouldReadProbeBody(res)) return true;
    return res.text().then((text) => {
      if (isHtmlProbeResponse(res, text)) return false;
      if (hasPlaylistEntries(text)) return probeHlsPlayback(text, streamUrl, 0);
      return text.length > 0;
    });
  }).catch(() => false);
}

// Nuvio's sandbox has no setTimeout/clearTimeout (see README), so a probe
// fetch that never settles -- a blackholed CDN, a host that accepts the
// connection and never answers -- can't be given a real timeout. Waiting for
// every single item to settle before resolving meant one such stream stalled
// getStreams() forever, leaving the whole English list spinning with nothing
// shown. Once enough playable streams have already been found to satisfy
// maxResults (the same cap finalizeStreams applies below), stop waiting on
// the rest -- their eventual results, if any, are discarded rather than
// awaited.
function mapWithConcurrency(items, concurrency, worker, maxResults) {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve([]);
      return;
    }
    const results = [];
    let cursor = 0;
    let doneCount = 0;
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      resolve(results);
    }
    function runNext() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        Promise.resolve().then(() => worker(items[index], index)).catch(() => null).then((result) => {
          if (settled) return;
          if (result) results.push(result);
          doneCount += 1;
          if (maxResults && results.length >= maxResults) finish();
          else if (doneCount === items.length) finish();
          else runNext();
        });
        return;
      }
    }
    const runners = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < runners; i += 1) runNext();
  });
}

// Caps this provider's own contribution to the merged stream list, same as
// every other provider here -- otherwise an indexer with a lot of cached
// hits can flood the card list by itself. Cached (instantly playable, no
// debrid download wait) sorts first, then known resolution, higher first.
const MAX_STREAMS_PER_PROVIDER = 2;
const STREAM_RESOLUTION_RANK = { '2160p': 4, '1080p': 3, '720p': 2, '480p': 1, '360p': 0 };
function finalizeStreams(streams) {
  return streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => {
      const cachedA = a.stream.__cached === true ? 1 : 0;
      const cachedB = b.stream.__cached === true ? 1 : 0;
      if (cachedA !== cachedB) return cachedB - cachedA;
      const rankA = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, a.stream.quality) ? STREAM_RESOLUTION_RANK[a.stream.quality] : -1;
      const rankB = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, b.stream.quality) ? STREAM_RESOLUTION_RANK[b.stream.quality] : -1;
      if (rankA !== rankB) return rankB - rankA;
      return a.index - b.index;
    })
    .slice(0, MAX_STREAMS_PER_PROVIDER)
    .map((entry) => entry.stream);
}

// ---------------------------------------------------------------------------
// TMDB -> IMDb id lookup (Nuvio hands us a tmdbId; AIOStreams needs an IMDb id)
// ---------------------------------------------------------------------------

function findImdbId(tmdbId, mediaType) {
  const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;

  return fetchJsonWithTimeout(url, {}, TMDB_TIMEOUT_MS)
    .then(({ res, data }) => {
      if (!res.ok || !data || !data.imdb_id) {
        throw new Error(`TMDB external_ids: no imdb_id for ${tmdbType}/${tmdbId}`);
      }
      return data.imdb_id;
    });
}

// ---------------------------------------------------------------------------
// Stream Name/Description formatting, matching the upstream English Stremio
// addon's src/stream-template.js layout (applied there at its HTTP boundary,
// applied here directly since Nuvio scrapers have no such boundary):
//   Name:        {cached ? "⚡️ " : ""}{indexer}
//   Description: English{container ? " • " + container : ""}{resolution ? " • " + resolution : ""}
// ---------------------------------------------------------------------------

const STREAM_CONTAINER_PATTERN = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
const STREAM_RESOLUTION_PATTERN = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;

function extractStreamContainer(url) {
  const match = String(url || '').match(STREAM_CONTAINER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function extractStreamResolution(stream) {
  // Always regex-extracts just the resolution token instead of trusting
  // stream.quality verbatim when present -- it can be a fuller descriptive
  // string, which used to pass straight through onto the card unfiltered.
  const text = `${stream.quality || ''} ${stream.title || ''} ${stream.name || ''}`;
  const match = text.match(STREAM_RESOLUTION_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === '4k' ? '2160p' : match[1].toLowerCase();
}

// Nuvio's stream card renders `quality`/`size` directly, not this `title`
// string -- so a raw byte count in `size` (e.g. "5408443938") was showing up
// verbatim next to `quality` on every AIOStreams card instead of something
// readable like "1.6 GB". Formats it the same way every other provider's
// human-readable size already looks.
function formatByteSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${Math.round(value * 10) / 10} ${units[unitIndex]}`;
}

// Guards against a provider stuffing something other than a real file size
// (e.g. a description) into `size`; only a short "123 MB" / "1.5 GB" shaped
// string is trusted through unchanged.
const SIZE_STRING_PATTERN = /^\s*\d+(\.\d+)?\s*(B|KB|MB|GB|TB)\s*$/i;
function sanitizeSizeString(value) {
  if (typeof value !== 'string') return null;
  return SIZE_STRING_PATTERN.test(value) ? value.trim() : null;
}

function applyStreamTemplate(stream) {
  const indexer = stream.name || 'AIOStreams';
  const container = extractStreamContainer(stream.url);
  const resolution = extractStreamResolution(stream);
  const cached = stream.__cached === true;

  return {
    ...stream,
    name: cached ? `⚡️ ${indexer}` : indexer,
    quality: resolution || null,
    size: typeof stream.size === 'number' ? formatByteSize(stream.size) : sanitizeSizeString(stream.size),
    title: ['English', container, resolution].filter(Boolean).join(' • ') || ' '
  };
}

// ---------------------------------------------------------------------------
// AIOStreams search
// ---------------------------------------------------------------------------

function requestAiostreamsStreams(url) {
  return fetchJsonWithTimeout(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' }
  }, AIOSTREAMS_TIMEOUT_MS)
    .then(({ data }) => {
      const results = data && data.success ? data.data && data.data.results : null;
      if (!Array.isArray(results)) return [];

      return results
        .map((result) => ({
          name: result.addon || result.indexer || 'AIOStreams',
          title: result.filename || (result.parsedFile && result.parsedFile.title) || 'AIOStreams',
          url: result.url,
          quality: (result.parsedFile && result.parsedFile.resolution) || null,
          size: result.size || null,
          __cached: result.cached === true
        }))
        .filter((stream) => Boolean(stream.url));
    });
}

// The instance backing AIOSTREAMS_BASE_URL is observed to fail transiently
// (timeout, or a 200 with zero results because one of its upstream indexers
// timed out server-side) on an occasional single request even when an
// immediately-following request for the same id succeeds, so one retry is
// given before giving up -- both on a thrown error and on an empty result.
function fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum) {
  const type = mediaType === 'tv' ? 'series' : 'movie';
  const id = type === 'series' ? `${imdbId}:${seasonNum || 1}:${episodeNum || 1}` : imdbId;
  const url = `${AIOSTREAMS_BASE_URL}?type=${type}&id=${encodeURIComponent(id)}`;

  return requestAiostreamsStreams(url)
    .then((streams) => (streams.length > 0 ? streams : requestAiostreamsStreams(url)))
    .catch((error) => {
      console.warn(`AIOStreams request failed, retrying once: ${error.message}`);
      return requestAiostreamsStreams(url);
    })
    .catch((error) => {
      console.warn(`AIOStreams request failed: ${error.message}`);
      return [];
    });
}

/**
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number} [seasonNum]
 * @param {number} [episodeNum]
 * @returns {Promise<Array>}
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return findImdbId(tmdbId, mediaType)
    .then((imdbId) => fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum))
    .then((streams) => streams.map(applyStreamTemplate))
    .then((streams) => mapWithConcurrency(streams, STREAM_PROBE_CONCURRENCY, (stream) =>
      probeStreamPlayable(stream.url).then((playable) => (playable ? stream : null))
    , MAX_STREAMS_PER_PROVIDER))
    .then(finalizeStreams)
    .catch((error) => {
      console.warn(`AIOStreams: ${error.message}`);
      return [];
    });
}

module.exports = { getStreams };

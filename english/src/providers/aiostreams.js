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
  if (stream.quality && stream.quality !== 'Unknown') return String(stream.quality).toLowerCase();
  const text = `${stream.title || ''} ${stream.name || ''}`;
  const match = text.match(STREAM_RESOLUTION_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === '4k' ? '2160p' : match[1].toLowerCase();
}

function applyStreamTemplate(stream) {
  const indexer = stream.name || 'AIOStreams';
  const container = extractStreamContainer(stream.url);
  const resolution = extractStreamResolution(stream);
  const cached = stream.__cached === true;

  return {
    ...stream,
    name: cached ? `⚡️ ${indexer}` : indexer,
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
    .catch((error) => {
      console.warn(`AIOStreams: ${error.message}`);
      return [];
    });
}

module.exports = { getStreams };

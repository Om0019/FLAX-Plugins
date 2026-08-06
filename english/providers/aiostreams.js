var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
const AIOSTREAMS_BASE_URL = "https://aiostreamsfortheweebsstable.midnightignite.me/api/v1/search";
const AIOSTREAMS_UUID = "4b990cd7-9058-41f6-a099-224272656e63";
const AIOSTREAMS_PASSWORD = "Jason001$";
const AIOSTREAMS_TIMEOUT_MS = 25e3;
const TMDB_API_KEY = "af3fa2d2239e9d0e6c04a1076d3df76f";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TIMEOUT_MS = 1e4;
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function stringToBase64(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i) & 255);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : void 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : void 0;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[(b0 & 3) << 4 | (b1 === void 0 ? 0 : b1 >> 4)];
    out += b1 === void 0 ? "=" : BASE64_CHARS[(b1 & 15) << 2 | (b2 === void 0 ? 0 : b2 >> 6)];
    out += b2 === void 0 ? "=" : BASE64_CHARS[b2 & 63];
  }
  return out;
}
function authHeader() {
  return `Basic ${stringToBase64(`${AIOSTREAMS_UUID}:${AIOSTREAMS_PASSWORD}`)}`;
}
const HAS_TIMERS = typeof setTimeout === "function";
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
  return fetchWithTimeout(url, options, timeoutMs).then((res) => res.text().then((text) => ({ res, text }))).then(({ res, text }) => {
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = null;
    }
    return { res, data };
  });
}
const STREAM_PROBE_RANGE_BYTES = 2048;
const STREAM_PROBE_TIMEOUT_MS = 5e3;
const STREAM_PROBE_CONCURRENCY = 4;
function isHtmlProbeResponse(res, text) {
  const contentType = (res.headers && res.headers.get && res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) return true;
  return /^\s*<(!doctype|html)/i.test(text || "");
}
function hasPlaylistEntries(body) {
  return body.includes("#EXT-X-STREAM-INF") || body.includes("#EXTINF");
}
function firstPlaylistEntryUrl(body, manifestUrl) {
  const lines = String(body || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      return new URL(trimmed, manifestUrl).toString();
    } catch (e) {
      return null;
    }
  }
  return null;
}
const STREAM_PROBE_MAX_BODY_BYTES = 2 * 1024 * 1024;
function shouldReadProbeBody(res) {
  if (res.status === 206) return true;
  const lengthHeader = res.headers && res.headers.get && res.headers.get("content-length");
  const length = lengthHeader ? parseInt(lengthHeader, 10) : NaN;
  return !Number.isNaN(length) && length <= STREAM_PROBE_MAX_BODY_BYTES;
}
function probeHlsPlayback(body, manifestUrl, depth) {
  const resourceUrl = firstPlaylistEntryUrl(body, manifestUrl);
  if (!resourceUrl) return Promise.resolve(false);
  if (depth >= 1) {
    return fetchWithTimeout(resourceUrl, { method: "HEAD" }, STREAM_PROBE_TIMEOUT_MS).then((res) => ![401, 403, 404, 410, 451].includes(res.status)).catch(() => true);
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
const MAX_STREAMS_PER_PROVIDER = 2;
const STREAM_RESOLUTION_RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0 };
function finalizeStreams(streams) {
  return streams.map((stream, index) => ({ stream, index })).sort((a, b) => {
    const cachedA = a.stream.__cached === true ? 1 : 0;
    const cachedB = b.stream.__cached === true ? 1 : 0;
    if (cachedA !== cachedB) return cachedB - cachedA;
    const rankA = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, a.stream.quality) ? STREAM_RESOLUTION_RANK[a.stream.quality] : -1;
    const rankB = Object.prototype.hasOwnProperty.call(STREAM_RESOLUTION_RANK, b.stream.quality) ? STREAM_RESOLUTION_RANK[b.stream.quality] : -1;
    if (rankA !== rankB) return rankB - rankA;
    return a.index - b.index;
  }).slice(0, MAX_STREAMS_PER_PROVIDER).map((entry) => entry.stream);
}
function findImdbId(tmdbId, mediaType) {
  const tmdbType = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
  return fetchJsonWithTimeout(url, {}, TMDB_TIMEOUT_MS).then(({ res, data }) => {
    if (!res.ok || !data || !data.imdb_id) {
      throw new Error(`TMDB external_ids: no imdb_id for ${tmdbType}/${tmdbId}`);
    }
    return data.imdb_id;
  });
}
const STREAM_CONTAINER_PATTERN = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
const STREAM_RESOLUTION_PATTERN = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;
function extractStreamContainer(url) {
  const match = String(url || "").match(STREAM_CONTAINER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}
function extractStreamResolution(stream) {
  const text = `${stream.quality || ""} ${stream.title || ""} ${stream.name || ""}`;
  const match = text.match(STREAM_RESOLUTION_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === "4k" ? "2160p" : match[1].toLowerCase();
}
function formatByteSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${Math.round(value * 10) / 10} ${units[unitIndex]}`;
}
const SIZE_STRING_PATTERN = /^\s*\d+(\.\d+)?\s*(B|KB|MB|GB|TB)\s*$/i;
function sanitizeSizeString(value) {
  if (typeof value !== "string") return null;
  return SIZE_STRING_PATTERN.test(value) ? value.trim() : null;
}
function applyStreamTemplate(stream) {
  const indexer = stream.name || "AIOStreams";
  const container = extractStreamContainer(stream.url);
  const resolution = extractStreamResolution(stream);
  const cached = stream.__cached === true;
  return __spreadProps(__spreadValues({}, stream), {
    name: cached ? `\u26A1\uFE0F ${indexer}` : indexer,
    quality: resolution || null,
    size: typeof stream.size === "number" ? formatByteSize(stream.size) : sanitizeSizeString(stream.size),
    title: ["English", container, resolution].filter(Boolean).join(" \u2022 ") || " "
  });
}
function requestAiostreamsStreams(url) {
  return fetchJsonWithTimeout(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" }
  }, AIOSTREAMS_TIMEOUT_MS).then(({ data }) => {
    const results = data && data.success ? data.data && data.data.results : null;
    if (!Array.isArray(results)) return [];
    return results.map((result) => ({
      name: result.addon || result.indexer || "AIOStreams",
      title: result.filename || result.parsedFile && result.parsedFile.title || "AIOStreams",
      url: result.url,
      quality: result.parsedFile && result.parsedFile.resolution || null,
      size: result.size || null,
      __cached: result.cached === true
    })).filter((stream) => Boolean(stream.url));
  });
}
function fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum) {
  const type = mediaType === "tv" ? "series" : "movie";
  const id = type === "series" ? `${imdbId}:${seasonNum || 1}:${episodeNum || 1}` : imdbId;
  const url = `${AIOSTREAMS_BASE_URL}?type=${type}&id=${encodeURIComponent(id)}`;
  return requestAiostreamsStreams(url).then((streams) => streams.length > 0 ? streams : requestAiostreamsStreams(url)).catch((error) => {
    console.warn(`AIOStreams request failed, retrying once: ${error.message}`);
    return requestAiostreamsStreams(url);
  }).catch((error) => {
    console.warn(`AIOStreams request failed: ${error.message}`);
    return [];
  });
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return findImdbId(tmdbId, mediaType).then((imdbId) => fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum)).then((streams) => streams.map(applyStreamTemplate)).then((streams) => mapWithConcurrency(
    streams,
    STREAM_PROBE_CONCURRENCY,
    (stream) => probeStreamPlayable(stream.url).then((playable) => playable ? stream : null),
    MAX_STREAMS_PER_PROVIDER
  )).then(finalizeStreams).catch((error) => {
    console.warn(`AIOStreams: ${error.message}`);
    return [];
  });
}
module.exports = { getStreams };

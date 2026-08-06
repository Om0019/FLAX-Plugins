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
  return findImdbId(tmdbId, mediaType).then((imdbId) => fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum)).then((streams) => streams.map(applyStreamTemplate)).catch((error) => {
    console.warn(`AIOStreams: ${error.message}`);
    return [];
  });
}
module.exports = { getStreams };

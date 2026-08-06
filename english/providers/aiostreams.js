// Built from src/providers/aiostreams.js for the Hermes/es2016 runtime Nuvio's local-scraper
// sandbox targets -- do not hand-edit. Regenerate with:
//   npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/aiostreams.js > english/providers/aiostreams.js
// Edit src/providers/aiostreams.js instead, then rebuild.
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
const AIOSTREAMS_TIMEOUT_MS = 8e3;
const TMDB_API_KEY = "af3fa2d2239e9d0e6c04a1076d3df76f";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TIMEOUT_MS = 5e3;
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
function fetchJsonWithTimeout(url, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    fetch(url, __spreadProps(__spreadValues({}, options), { signal: controller.signal })).then((res) => res.text().then((text) => ({ res, text }))).then(({ res, text }) => {
      clearTimeout(timeoutId);
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      resolve({ res, data });
    }).catch((error) => {
      clearTimeout(timeoutId);
      if (error && error.name === "AbortError") {
        reject(new Error(`Fetch timeout after ${timeoutMs}ms: ${url}`));
      } else {
        reject(error);
      }
    });
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
      cached: result.cached === true
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
  return findImdbId(tmdbId, mediaType).then((imdbId) => fetchAiostreamsStreams(imdbId, mediaType, seasonNum, episodeNum)).catch((error) => {
    console.warn(`AIOStreams: ${error.message}`);
    return [];
  });
}
module.exports = { getStreams };

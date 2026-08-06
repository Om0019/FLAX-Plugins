var __defProp = Object.defineProperty;
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
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
let cheerio;
try {
  cheerio = require("cheerio-without-node-native");
} catch (e) {
  try {
    cheerio = require("cheerio");
  } catch (e2) {
    cheerio = typeof global !== "undefined" ? global.cheerio : void 0;
  }
}
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(b64) {
  const clean = String(b64 || "").replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (c === "=") break;
    const val = BASE64_CHARS.indexOf(c);
    if (val === -1) continue;
    buffer = buffer << 6 | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(buffer >> bits & 255);
    }
  }
  return bytes;
}
function bytesToBase64(bytes) {
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
function base64ToBinaryString(b64) {
  return base64ToBytes(b64).map((byte) => String.fromCharCode(byte)).join("");
}
function bytesToUtf8String(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 128) {
      out += String.fromCharCode(b0);
    } else if (b0 >= 192 && b0 < 224 && i < bytes.length) {
      const b1 = bytes[i++];
      out += String.fromCharCode((b0 & 31) << 6 | b1 & 63);
    } else if (b0 >= 224 && b0 < 240 && i + 1 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      out += String.fromCharCode((b0 & 15) << 12 | (b1 & 63) << 6 | b2 & 63);
    } else if (b0 >= 240 && i + 2 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      let codepoint = (b0 & 7) << 18 | (b1 & 63) << 12 | (b2 & 63) << 6 | b3 & 63;
      codepoint -= 65536;
      out += String.fromCharCode(55296 + (codepoint >> 10), 56320 + (codepoint & 1023));
    } else {
      out += String.fromCharCode(b0);
    }
  }
  return out;
}
function base64ToUtf8String(b64) {
  return bytesToUtf8String(base64ToBytes(b64));
}
const DEFAULT_TIMEOUT_MS = 6e3;
function decodeHtmlEntities(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function normalizeUrl(value, baseUrl) {
  if (!value) return null;
  let url = decodeHtmlEntities(value).trim();
  url = url.replace(/\\\//g, "/");
  try {
    return new URL(url, baseUrl).toString();
  } catch (e) {
    return null;
  }
}
const HAS_TIMERS = typeof setTimeout === "function";
function safeSetTimeout(fn, ms) {
  return HAS_TIMERS ? setTimeout(fn, ms) : null;
}
function safeClearTimeout(id) {
  if (HAS_TIMERS && id !== null && id !== void 0) clearTimeout(id);
}
function fetchWithDeadline(url, options, timeoutMs, consume) {
  const externalSignal = options.signal;
  const _a = options, { signal } = _a, fetchOptions = __objRest(_a, ["signal"]);
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
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }
  });
  function cleanup() {
    safeClearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
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
    } catch (e) {
      data = null;
    }
    return { res, text, data };
  });
}
const SWEEP_INTERVAL_MS = 30 * 1e3;
function createTtlCache({ maxEntries = 500 } = {}) {
  const entries = /* @__PURE__ */ new Map();
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
      if (oldestKey === void 0) break;
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
      if (!entry) return void 0;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return void 0;
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
      Promise.resolve().then(() => worker(items[index], index)).catch(() => null).then((outcome) => {
        results[index] = outcome;
        done[index] = true;
        if (!checkOrder()) runNext();
      });
    }
    const runners = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < runners; i += 1) runNext();
  });
}
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
        Promise.resolve().then(() => worker(items[index], index)).catch(() => null).then((result) => {
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
function raceTitleSearches(titles, search) {
  const attempts = titles.map(
    (title) => Promise.resolve().then(() => search(title)).then((match) => ({ match }), (error) => ({ error }))
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
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function looseIncludes(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.includes(shorter)) return false;
  return shorter.length / longer.length >= 0.5;
}
function extractCandidateYears(...values) {
  const years = /* @__PURE__ */ new Set();
  for (const value of values) {
    const matches = String(value || "").match(/\b(?:19|20)\d{2}\b/g) || [];
    for (const match of matches) years.add(match);
  }
  return years;
}
const TMDB_API_KEY = "af3fa2d2239e9d0e6c04a1076d3df76f";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TIMEOUT_MS = 5e3;
const tmdbCache = createTtlCache({ maxEntries: 200 });
function fetchFromTmdb(path, params = {}) {
  const queryParams = new URLSearchParams(__spreadValues({ api_key: TMDB_API_KEY }, params));
  const url = `${TMDB_BASE_URL}${path}?${queryParams.toString()}`;
  const cached = tmdbCache.get(url);
  if (cached !== void 0) return Promise.resolve(cached);
  return fetchJsonWithTimeout(url, {}, TMDB_TIMEOUT_MS).then(({ res, data }) => {
    if (!res.ok || data === null) {
      throw new Error(`TMDB API error ${res.status} at ${path}`);
    }
    return tmdbCache.set(url, data, 6 * 60 * 60 * 1e3);
  });
}
function fetchTmdbDetails(tmdbId, mediaType) {
  const tmdbType = mediaType === "tv" ? "tv" : "movie";
  return fetchFromTmdb(`/${tmdbType}/${tmdbId}`, { language: "es-MX" }).then((data) => {
    const title = data.title || data.name || data.original_title || data.original_name;
    const originalTitle = data.original_title || data.original_name;
    const year = (data.release_date || data.first_air_date || "").substring(0, 4) || null;
    return { title, originalTitle, year: year ? Number(year) : null };
  }).catch((error) => {
    console.error(`TLNovelas: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
    return null;
  });
}
function getAlternativeTitles(mediaType, tmdbId) {
  const tmdbType = mediaType === "tv" ? "tv" : "movie";
  return fetchFromTmdb(`/${tmdbType}/${tmdbId}/translations`).then((data) => {
    var _a, _b;
    const entries = data.translations || [];
    const titles = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (entry.iso_639_1 !== "es") continue;
      const value = (((_a = entry.data) == null ? void 0 : _a.name) || ((_b = entry.data) == null ? void 0 : _b.title) || "").trim();
      if (value) titles.add(value);
    }
    return [...titles];
  }).catch(() => []);
}
const PLAYER_FETCH_TIMEOUT_MS = 5e3;
const MAX_RESOLVE_DEPTH = 5;
const DOOD_DIRECT_TIMEOUT_MS = 1800;
const EMBED_RESOLVE_CONCURRENCY = 3;
const MAX_EMBED69_ATTEMPTS = 5;
const MAX_VOE_PAYLOADS = 6;
function unpack(p, a, c, k) {
  const e_func = function(c2) {
    return (c2 < a ? "" : e_func(Math.floor(c2 / a))) + ((c2 = c2 % a) > 35 ? String.fromCharCode(c2 + 29) : c2.toString(36));
  };
  c = Math.min(Number(c) || 0, k.length);
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp("\\b" + e_func(c) + "\\b", "g"), k[c]);
    }
  }
  return p;
}
function* iterUnpackedScripts(html) {
  const packerRegex = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/gi;
  let match;
  while ((match = packerRegex.exec(html || "")) !== null) {
    try {
      const p = match[2].trim();
      const a = parseInt(match[3]);
      const c = parseInt(match[4]);
      const k = match[6].trim().split("|");
      yield unpack(p, a, c, k);
    } catch (err) {
      console.error("TLNovelas unpacker: failed to decode script block:", err.message);
    }
  }
}
const NON_STREAM_MARKERS = ["google-analytics", "analytics.js", "tagmanager", "test-videos.co.uk", "big_buck_bunny"];
const AD_SEGMENT_PATTERN = /(?:^|[/.])(?:ads?|advert(?:s|ising)?|adserver|doubleclick)(?:[/.]|$)/;
function cleanEscapedStreamUrl(link) {
  return String(link || "").replace(/\\+u0026/gi, "&").replace(/\\+u003[dD]/g, "=").replace(/\\+u002[fF]/g, "/").replace(/\\+u003[fF]/g, "?").replace(/\\+$/, "");
}
function isPlausibleStreamUrl(link) {
  const lower = String(link || "").toLowerCase();
  if (NON_STREAM_MARKERS.some((marker) => lower.includes(marker))) return false;
  try {
    const parsed = new URL(lower);
    return !AD_SEGMENT_PATTERN.test(`${parsed.hostname}${parsed.pathname}`);
  } catch (e) {
    return !AD_SEGMENT_PATTERN.test(lower);
  }
}
function extractDirectStream(html, baseUrl) {
  if (!html) return null;
  const normalizedHtml = decodeHtmlEntities(html).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\\\//g, "/");
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
      const decoded = base64ToUtf8String(encodedMatch[1]).replace(/\\\//g, "/");
      if (!decoded.includes(".m3u8") && !decoded.includes(".mp4") && !decoded.includes(".mkv")) continue;
      configuredMatches.push(...decoded.match(directRegex) || []);
      configuredMatches.push(...decoded.match(protocolRelativeRegex) || []);
      configuredMatches.push(...decoded.match(relativeRegex) || []);
    } catch (e) {
    }
  }
  const validDirect = [...directMatches, ...protocolRelativeMatches, ...relativeMatches, ...configuredMatches].map(cleanEscapedStreamUrl).map((link) => normalizeUrl(link, baseUrl)).filter(Boolean).filter(isPlausibleStreamUrl);
  if (validDirect.length > 0) return [...new Set(validDirect)][0];
  for (const unpacked of iterUnpackedScripts(normalizedHtml)) {
    const streamMatches = unpacked.match(directRegex) || [];
    const validStreams = streamMatches.map(cleanEscapedStreamUrl).map((link) => normalizeUrl(link, baseUrl)).filter(Boolean).filter(isPlausibleStreamUrl);
    if (validStreams.length > 0) return [...new Set(validStreams)][0];
  }
  return null;
}
function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || "");
}
function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (e) {
    return "";
  }
}
function isDoodHost(value) {
  const host = getHostname(value);
  return /(^|\.)dood\.(?:li|to|stream|watch|so|pm|ws|re|yt|video)$/i.test(host) || /(^|\.)(?:d0{2,4}d|d0o0d|dooood|all3do|doply|vide0)\.(?:com|net|to)$/i.test(host) || /(^|\.)(?:doodstream|ds2play|ds2video)\.(?:com|co|net)$/i.test(host) || /(^|\.)playmogo\.com$/i.test(host);
}
function isVoeHost(value) {
  const host = getHostname(value);
  return /(^|\.)voe(?:-?un-?bl?o?ck)?\.[a-z]{2,}$/i.test(host) || host.includes("pamelachangemission.com");
}
function isNetuFamilyHost(value) {
  const host = getHostname(value);
  return /(^|\.)(?:waaw\d?|netu|netuplayer|hqq\d?)\.(?:to|tv|ac|watch|com|net)$/i.test(host) || /(^|\.)novelas360\.cyou$/i.test(host);
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
  if (!combined.includes("get_video")) return null;
  const absolute = combined.startsWith("//") ? `https:${combined}` : normalizeUrl(combined, baseUrl);
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
  } catch (e) {
    return url;
  }
}
const FILE_LOCKER_SERVERS = ["1fichier", "fichier", "mega", "uptobox", "drive", "gofile", "wetransfer", "terabox", "pixeldrain", "zippyshare"];
function isFileLockerServer(server) {
  const name = (server || "").toLowerCase().trim();
  if (!name) return false;
  return FILE_LOCKER_SERVERS.some((locker) => name.includes(locker));
}
function scoreXupalaceServer(server) {
  const s = (server || "").toLowerCase();
  if (s.includes("streamwish") || s.includes("hlswish") || s.includes("vidhide")) return 0;
  if (s.includes("vidguard") || s.includes("listeamed")) return 4;
  if (s.includes("waaw") || s.includes("netu") || s.includes("hqq")) return 5;
  if (s.includes("lulu") || s.includes("vudeo") || s.includes("ahvsh") || s.includes("streamhide")) return 5;
  if (s.includes("filemoon") || s.includes("voe") || s.includes("dood") || s.includes("playmogo")) return 6;
  return 3;
}
function extractXupalaceServers(html, baseUrl) {
  const $ = cheerio.load(html || "");
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  $('[onclick*="go_to_playerVast"]').each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const match = onclick.match(/go_to_playerVast\(\s*['"]([^'"]+)['"]/);
    if (!match) return;
    const url = normalizeUrl(decodeHtmlEntities(match[1]), baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const imgName = ($(el).find("img").attr("src") || "").split("/").pop().replace(/\.[a-z0-9]+$/i, "").toLowerCase();
    const label = ($(el).find("span").first().text() || imgName || "").trim().toLowerCase();
    results.push({ url, server: label });
  });
  return results;
}
function resolveXupalaceServers(html, baseUrl, userAgent, options) {
  const { depth, visited, signal } = options;
  const servers = extractXupalaceServers(html, baseUrl).filter((entry) => !isFileLockerServer(entry.server)).sort((a, b) => scoreXupalaceServer(a.server) - scoreXupalaceServer(b.server));
  return firstResultInOrder(
    servers,
    EMBED_RESOLVE_CONCURRENCY,
    (entry) => resolvePlayerStream(entry.url, userAgent, baseUrl, { depth: depth + 1, visited, signal }).catch((e) => {
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
    embedUrl.searchParams.set("http_referer", referer || "");
    return embedUrl.toString();
  } catch (e) {
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
  if (lower.startsWith("data:") || lower.includes("/hls-vod-s03/flv/api/files/videos/2018/08/01/")) return null;
  return directUrl;
}
function rot13(value) {
  return String(value || "").replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode((char.charCodeAt(0) - base + 13) % 26 + base);
  });
}
function decodeVoePayload(encoded, options = {}) {
  try {
    let value = rot13(encoded);
    for (const marker of ["@$", "^^", "~@", "%?", "*~", "!!", "#&"]) {
      value = value.split(marker).join("_");
    }
    value = value.split("_").join("");
    const firstDecodedBytes = base64ToBytes(value);
    const firstDecoded = firstDecodedBytes.map((b) => String.fromCharCode(b)).join("");
    let shifted = "";
    for (let index = 0; index < firstDecoded.length; index += 1) {
      shifted += String.fromCharCode(firstDecoded.charCodeAt(index) - 3);
    }
    const reversed = shifted.split("").reverse().join("");
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
      const encoded = Array.isArray(parsed) ? parsed.find((item) => typeof item === "string" && item.length > 0) : null;
      if (encoded) payloads.push(encoded);
    } catch (e) {
    }
  }
  const varRegex = /(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*["']([A-Za-z0-9+/=_@$^~%*!#&-]{120,})["']/g;
  while (payloads.length < MAX_VOE_PAYLOADS && (match = varRegex.exec(html)) !== null) {
    payloads.push(match[1]);
  }
  return payloads;
}
function normalizeVoeCandidate(value) {
  if (typeof value !== "string" || !value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const decoded = base64ToUtf8String(value);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch (e) {
  }
  return null;
}
function extractVoeDirectStream(html, baseUrl, options = {}) {
  if (!html) return null;
  for (const encoded of collectVoeEncodedPayloads(html)) {
    const data = decodeVoePayload(encoded, options);
    if (!data) continue;
    const fallback = Array.isArray(data.fallback) ? data.fallback.map((item) => item == null ? void 0 : item.file) : [];
    const candidates = [data.source, data.file, data.hls, ...fallback, data.direct_access_allowed ? data.direct_access_url : null].map(normalizeVoeCandidate).filter(Boolean);
    const direct = candidates.find((candidate) => /\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(candidate));
    if (direct) return normalizeUrl(direct, baseUrl);
  }
  return null;
}
function extractMediafireDirectUrl(html, baseUrl) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const button = $("#downloadButton").first();
  const href = normalizeUrl(button.attr("href"), baseUrl);
  if (href && !/(^|\.)mediafire\.com\/file\//i.test(href) && isHttpUrl(href)) return href;
  const scrambled = button.attr("data-scrambled-url");
  if (scrambled) {
    try {
      const decoded = base64ToUtf8String(scrambled);
      if (isHttpUrl(decoded)) return decoded;
    } catch (e) {
    }
  }
  const match = html.match(/https?:\/\/download[^"'`\s<>\\]+\.mediafire\.com\/[^"'`\s<>\\]+/i);
  return match ? normalizeUrl(match[0], baseUrl) : null;
}
function extractNuploadDirectStream(html, baseUrl) {
  if (!html) return null;
  try {
    const fileVarMatch = html.match(/file\s*:\s*([A-Za-z_$][\w$]*)\s*\+/);
    const fileVarName = fileVarMatch == null ? void 0 : fileVarMatch[1];
    const loopRegex = fileVarName ? new RegExp(`var\\s+${fileVarName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*"";\\s*([A-Za-z_$][\\w$]*)\\.forEach[\\s\\S]{0,500}?-\\s*(\\d+)`) : null;
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
      const arrayPattern = new RegExp(`var\\s+${arrayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
      const arrayMatch = html.match(arrayPattern);
      if (!arrayMatch) continue;
      const encodedParts = JSON.parse(arrayMatch[1]);
      const streamUrl = encodedParts.map((part) => {
        const digits = base64ToUtf8String(part).replace(/\D/g, "");
        return String.fromCharCode(parseInt(digits, 10) - subtractValue);
      }).join("");
      if (!/\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(streamUrl)) continue;
      const sessionMatch = html.match(/\bsesz\s*=\s*["']([^"']+)["']/);
      const directUrl = normalizeUrl(streamUrl, baseUrl);
      if (!directUrl || !sessionMatch) return directUrl;
      const parsed = new URL(directUrl);
      if (!parsed.searchParams.has("s")) parsed.searchParams.set("s", sessionMatch[1]);
      return parsed.toString();
    }
  } catch (error) {
    console.warn(`TLNovelas unpacker: Nupload decode failed: ${error.message}`);
  }
  return null;
}
function decodeVidguardSignature(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    const sig = parsed.searchParams.get("sig");
    if (!sig || sig.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(sig)) return streamUrl;
    let deobfuscated = "";
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
    parsed.searchParams.set("sig", characters.join("").slice(0, -5));
    return parsed.toString();
  } catch (error) {
    console.warn(`TLNovelas unpacker: VidGuard signature decode failed: ${error.message}`);
    return streamUrl;
  }
}
function extractVidguardStream(html, baseUrl) {
  for (const source of [html, ...iterUnpackedScripts(html)]) {
    if (!source) continue;
    const normalized = source.replace(/\\\//g, "/");
    const configMatch = normalized.match(/["'](?:stream|hls|file)["']\s*:\s*["']([^"']+)["']/i) || normalized.match(/(https?:\/\/[^\s'"`<>]+[?&]sig=[^\s'"`<>]+)/i);
    const candidate = normalizeUrl(configMatch == null ? void 0 : configMatch[1], baseUrl);
    if (candidate) return decodeVidguardSignature(candidate);
  }
  return null;
}
function extractAssignedRedirect(html, baseUrl) {
  const linkMatch = html.match(/\b(?:var|let|const)\s+redirect_link\s*=\s*['"]([^'"]+)['"]/i);
  if (!linkMatch) return null;
  const fallbackMatch = html.match(/redirect\(\s*['"]([^'"]+)['"]\s*\)/);
  return normalizeUrl(`${linkMatch[1]}${(fallbackMatch == null ? void 0 : fallbackMatch[1]) || "fp=-7"}`, baseUrl);
}
function resolveDood(html, url, userAgent, signal, pageUrl = url) {
  if (!isDoodHost(url) && !isDoodHost(pageUrl)) return Promise.resolve(null);
  const passMatch = html.match(/(["'])(\/pass_md5\/[^"'<>]+)\1/i) || html.match(/(["'])(https?:\/\/[^"'<>]+\/pass_md5\/[^"'<>]+)\1/i);
  const passUrl = normalizeUrl(passMatch == null ? void 0 : passMatch[2], pageUrl);
  if (!passUrl) return Promise.resolve(null);
  return fetchTextWithTimeout(
    passUrl,
    { headers: { "User-Agent": userAgent, Referer: pageUrl, "X-Requested-With": "XMLHttpRequest" }, signal },
    DOOD_DIRECT_TIMEOUT_MS
  ).then(({ res, text }) => {
    if (!res.ok) return null;
    const direct = text.trim().replace(/\\\//g, "/");
    return /^https?:\/\/.+\.(?:m3u8|mp4|mkv)(?:$|[?#])/i.test(direct) ? direct : null;
  }).catch(() => null);
}
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
  return /(^|\.)filemoon\.(?:sx|to|in|nl|wt|eu|art)$/i.test(getHostname(value)) || /(^|\.)bysejikuar\.com$/i.test(getHostname(value)) || /(^|\.)q8y5z\.com$/i.test(getHostname(value));
}
const PELISPLUS_HOST_PATTERN = /(^|\.)(?:pelisplus[a-z0-9-]*\.[a-z0-9.-]+|4meplayer\.pro|upns\.pro|strp2p\.com|rpmstream\.live)$/i;
function isPelisplusHost(value) {
  if (!PELISPLUS_HOST_PATTERN.test(getHostname(value))) return false;
  try {
    return new URL(value).hash.length > 1;
  } catch (e) {
    return false;
  }
}
function resolvePlayerStream(url, userAgent, referer, options = {}) {
  const depth = options.depth || 0;
  const visited = options.visited || /* @__PURE__ */ new Set();
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
  return step.then((result) => {
    if (result) return result;
    if (isFilemoonHost(url)) return resolveFilemoon(url, userAgent, referer, signal);
    return null;
  }).then((result) => {
    if (result || isFilemoonHost(url)) return result;
    return fetchTextWithTimeout(url, { headers: { "User-Agent": userAgent, Referer: referer }, signal }, PLAYER_FETCH_TIMEOUT_MS).then(
      ({ res, text: html }) => {
        if (!res.ok) return null;
        return resolveFromPage(url, html, res, userAgent, referer, depth, visited, signal);
      }
    );
  }).catch((e) => {
    console.warn(`TLNovelas unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
    return null;
  });
}
function resolveFromPage(url, html, res, userAgent, referer, depth, visited, signal) {
  let chain = Promise.resolve(null);
  if (isXupalaceHost(url) || html.includes("go_to_playerVast")) {
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
      const iframeUrl = normalizeUrl(iframeMatch == null ? void 0 : iframeMatch[1], url);
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
    if (url.includes("emturbovid") || url.includes("turbovidhls") || url.includes("turboviplay")) {
      const dataHash = html.match(/data-hash=["']([^"']+\.m3u8[^"']*)/);
      if (dataHash) return normalizeUrl(dataHash[1], url);
      const urlPlay = html.match(/var\s+urlPlay\s*=\s*["']([^"']+\.m3u8[^"']*)/);
      if (urlPlay) return normalizeUrl(urlPlay[1], url);
    }
    return null;
  });
  chain = chain.then((result) => result ? result : resolveDood(html, url, userAgent, signal, res.url || url));
  chain = chain.then((result) => {
    if (result) return result;
    if (url.includes("embed69") || html.includes("POW_CHALLENGE") && html.includes("dataLink")) {
      const embed69Links = decryptEmbed69(html);
      if (embed69Links && embed69Links.length > 0) {
        const attemptedEmbeds = embed69Links.filter((embed) => !isFileLockerServer(embed.server)).slice(0, MAX_EMBED69_ATTEMPTS);
        return firstResultInOrder(
          attemptedEmbeds,
          EMBED_RESOLVE_CONCURRENCY,
          (embed) => resolvePlayerStream(embed.url, userAgent, url, { depth: depth + 1, visited, signal })
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
    const redirectUrl = normalizeUrl((jsRedirectMatch == null ? void 0 : jsRedirectMatch[1]) || (jsRedirectMatch == null ? void 0 : jsRedirectMatch[2]), url);
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
    const iframeUrl = normalizeUrl(iframeMatch == null ? void 0 : iframeMatch[1], url);
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
const NETU_TERMINAL = /* @__PURE__ */ Symbol("netu-terminal");
const TLNOVELAS_BASE_URL = "https://ww2.tlnovelas.net";
const TLNOVELAS_SEARCH_TIMEOUT_MS = 4500;
const TLNOVELAS_PAGE_TIMEOUT_MS = 5500;
const TLNOVELAS_PLAYER_CONCURRENCY = 4;
const MAX_PLAYER_URLS = 6;
const MAX_SEASON_NUMBER = 30;
function tlnovelasBrowserHeaders(userAgent, extra = {}) {
  return __spreadValues({
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Upgrade-Insecure-Requests": "1"
  }, extra);
}
function tlnovelasSlugifyTitle(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " y ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function seasonNumberFromTitle(value) {
  const match = String(value || "").trim().match(/(\d+)\s*$/);
  if (!match) return null;
  const number = parseInt(match[1], 10);
  return number >= 1 && number <= MAX_SEASON_NUMBER ? number : null;
}
function scoreCandidate(result, title, originalTitle, extraTitles = [], season = null) {
  var _a, _b, _c, _d, _e;
  const cleanTitle = cleanText(title);
  const cleanOriginal = cleanText(originalTitle);
  const cleanExtras = extraTitles.map(cleanText).filter(Boolean);
  const cleanResult = cleanText(result.title);
  const slugWords = (_b = (_a = result.url.match(/\/novela\/([^/?#]+)/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.replace(/-/g, " ");
  const cleanSlug = cleanText(slugWords);
  let score = 0;
  const wantedSeason = (_d = (_c = season && season > 1 ? season : null) != null ? _c : seasonNumberFromTitle(title)) != null ? _d : seasonNumberFromTitle(originalTitle);
  const candidateSeason = (_e = seasonNumberFromTitle(result.title)) != null ? _e : seasonNumberFromTitle(slugWords);
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
  return /\b\d+\s*$/.test(String(value || "").trim());
}
function buildSearchTitles(title, originalTitle, season, extraTitles = []) {
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  function add(value) {
    const text = String(value || "").trim();
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
  const $ = cheerio.load(html || "");
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  $('a[href*="/novela/"]').each((_, el) => {
    const url = normalizeUrl($(el).attr("href"), TLNOVELAS_BASE_URL);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const card = $(el).closest(".vk-poster,.p-content,li,.thel");
    const title = (card.find(".vk-info p,.p-title,.nakama").first().text() || $(el).attr("title") || $(el).find("img").attr("alt") || $(el).text()).replace(/^(?:Ver|Capitulos de|Ver Novela|Ver capitulos de)\s+/i, "").replace(/\s+Online$/i, "").trim().replace(/\s+/g, " ");
    if (title) results.push({ url, title });
  });
  return results;
}
function isNovelaPage(html) {
  return /href=["'][^"']*\/ver\/[^"']*["']/i.test(String(html || ""));
}
function runTlnovelasQuery(query, originalTitle, season, title, userAgent, signal, extraTitles) {
  const searchUrl = `${TLNOVELAS_BASE_URL}/buscar/?q=${encodeURIComponent(query)}`;
  return fetchTextWithTimeout(searchUrl, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_SEARCH_TIMEOUT_MS).then(({ res, text: html }) => {
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
  }).catch((error) => {
    console.warn(`TLNovelas: Search failed for "${query}": ${error.message}`);
    return null;
  });
}
function tlnovelasSearch(title, originalTitle, season, userAgent, signal, extraTitles = []) {
  const queries = buildSearchTitles(title, originalTitle, season, extraTitles);
  const runQuery = (query) => runTlnovelasQuery(query, originalTitle, season, title, userAgent, signal, extraTitles);
  return raceTitleSearches(queries.slice(0, 2), runQuery).then((racedMatch) => {
    if (racedMatch) return racedMatch;
    function tryTail(i) {
      const tail = queries.slice(2);
      if (i >= tail.length) return null;
      return runQuery(tail[i]).then((match) => match || tryTail(i + 1));
    }
    return tryTail(0);
  }).then((match) => {
    if (match) return match;
    function tryDirectSlug(i) {
      if (i >= queries.length) return null;
      const slug = tlnovelasSlugifyTitle(queries[i]);
      if (!slug) return tryDirectSlug(i + 1);
      const url = `${TLNOVELAS_BASE_URL}/novela/${slug}/`;
      return fetchTextWithTimeout(url, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_SEARCH_TIMEOUT_MS).then(({ res, text }) => {
        if (res.ok && isNovelaPage(text)) return url;
        return tryDirectSlug(i + 1);
      }).catch(() => tryDirectSlug(i + 1));
    }
    return tryDirectSlug(0);
  });
}
function episodeNumberFromText(value) {
  const match = String(value || "").match(/cap[ií]tulo[\s._-]*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}
function findEpisodeUrl(html, pageUrl, episode) {
  if (!episode) return null;
  const $ = cheerio.load(html || "");
  const candidates = [];
  $('a[href*="/ver/"]').each((_, el) => {
    const url = normalizeUrl($(el).attr("href"), pageUrl);
    const text = `${$(el).attr("title") || ""} ${$(el).text() || ""} ${url || ""}`;
    if (url && episodeNumberFromText(text) === Number(episode)) {
      candidates.push(url);
    }
  });
  return candidates[0] || null;
}
const PLAYER_SHORTHAND_HOSTS = {
  1: "https://hqq.to/e/",
  2: "https://dood.yt/e/",
  3: "https://player.ojearanime.com/e/",
  4: "https://player.vernovelastv.net/e/"
};
function expandPlayerEntry(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([A-Za-z0-9_-]+)\|(\d)$/);
  const prefix = match ? PLAYER_SHORTHAND_HOSTS[match[2]] : null;
  return prefix ? `${prefix}${match[1]}` : text;
}
function isPlayerCandidate(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/(^|\.)tlnovelas\.net$/i.test(parsed.hostname)) return false;
    return !/\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(parsed.pathname);
  } catch (e) {
    return false;
  }
}
function looksLikePlayer(url) {
  try {
    const path = new URL(url).pathname;
    return /\.(?:m3u8|mp4|mkv)$/i.test(path) || /^\/(?:e|v|f|d)\//i.test(path) || /\/embed/i.test(path);
  } catch (e) {
    return false;
  }
}
function extractPlayerUrls(html, pageUrl) {
  const $ = cheerio.load(html || "");
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  function addUrl(value) {
    const url = normalizeUrl(expandPlayerEntry(value), pageUrl);
    if (!url || seen.has(url) || !isPlayerCandidate(url)) return;
    seen.add(url);
    urls.push(url);
  }
  $("iframe[src],embed[src],video[src],source[src]").each((_, el) => addUrl($(el).attr("src")));
  const scriptText = $("script").map((_, el) => $(el).html() || "").get().join("\n");
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
  return [...urls.filter(looksLikePlayer), ...urls.filter((url) => !looksLikePlayer(url))].slice(0, MAX_PLAYER_URLS);
}
function playerLabel(url) {
  try {
    const labels = new URL(url).hostname.toLowerCase().split(".");
    const name = labels.find((label) => !["www", "player", "embed", "cdn", "play"].includes(label)) || labels[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (e) {
    return "Opcion";
  }
}
function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  if (type !== "series") return Promise.resolve([]);
  const { signal, extraTitles = [] } = options;
  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  return tlnovelasSearch(title, originalTitle, season, userAgent, signal, extraTitles).then((pageUrl) => {
    if (!pageUrl) {
      console.log(`TLNovelas: No matching content found for "${title}"`);
      return [];
    }
    return fetchTextWithTimeout(pageUrl, { headers: tlnovelasBrowserHeaders(userAgent), signal }, TLNOVELAS_PAGE_TIMEOUT_MS).then(({ res: seriesRes, text: seriesHtml }) => {
      if (!seriesRes.ok) return [];
      const episodeUrl = findEpisodeUrl(seriesHtml, pageUrl, episode);
      if (!episodeUrl) {
        console.log(`TLNovelas: No episode found for "${title}" episode ${episode}`);
        return [];
      }
      return fetchTextWithTimeout(episodeUrl, { headers: tlnovelasBrowserHeaders(userAgent, { Referer: pageUrl }), signal }, TLNOVELAS_PAGE_TIMEOUT_MS).then(({ res: episodeRes, text: episodeHtml }) => {
        if (!episodeRes.ok) return [];
        const playerUrls = extractPlayerUrls(episodeHtml, episodeUrl);
        console.log(`TLNovelas: Found ${playerUrls.length} player URLs`);
        return mapWithConcurrency(
          playerUrls,
          TLNOVELAS_PLAYER_CONCURRENCY,
          (playerUrl) => resolvePlayerStream(playerUrl, userAgent, episodeUrl, { signal }).then((resolvedUrl) => {
            if (!resolvedUrl) return null;
            return {
              name: "TLNovelas",
              title: `\u{1F1F2}\u{1F1FD} ${playerLabel(playerUrl)}`,
              url: resolvedUrl,
              headers: { "User-Agent": userAgent, Referer: playerUrl }
            };
          }).catch((error) => {
            console.warn(`TLNovelas: Player ${playerUrl} failed: ${error.message}`);
            return null;
          })
        );
      });
    });
  }).catch((error) => {
    console.error(`TLNovelas scrape error for "${title}":`, error.message);
    return [];
  });
}
const STREAM_CONTAINER_PATTERN = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
const STREAM_RESOLUTION_PATTERN = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;
function extractStreamContainer(url) {
  const match = String(url || "").match(STREAM_CONTAINER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}
function extractStreamResolution(quality, title, name) {
  if (quality && quality !== "Unknown") return String(quality).toLowerCase();
  const text = `${title || ""} ${name || ""}`;
  const match = text.match(STREAM_RESOLUTION_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === "4k" ? "2160p" : match[1].toLowerCase();
}
const MEDIAFLOW_PROXY_BASE_URL = "https://proxy.fl4x.com";
const MEDIAFLOW_PROXY_API_PASSWORD = "1357";
const HLS_URL_PATTERN = /\.m3u8(?:$|[?#])/i;
function toMediaflowProxyUrl(targetUrl, headers) {
  const endpoint = HLS_URL_PATTERN.test(String(targetUrl || "")) ? "proxy/hls/manifest.m3u8" : "proxy/stream";
  const params = new URLSearchParams();
  params.set("d", targetUrl);
  if (headers && headers["User-Agent"]) params.set("h_user-agent", headers["User-Agent"]);
  if (headers && headers.Referer) params.set("h_referer", headers.Referer);
  params.set("api_password", MEDIAFLOW_PROXY_API_PASSWORD);
  return `${MEDIAFLOW_PROXY_BASE_URL}/${endpoint}?${params.toString()}`;
}
const STREAM_PROBE_RANGE_BYTES = 2048;
const STREAM_PROBE_TIMEOUT_MS = 5e3;
const STREAM_PROBE_CONCURRENCY = 4;
const STREAM_HLS_PROBE_MAX_DEPTH = 2;
function isHtmlProbeResponse(res, text) {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
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
function probeHlsPlayback(body, manifestUrl, depth) {
  const resourceUrl = firstPlaylistEntryUrl(body, manifestUrl);
  if (!resourceUrl) return Promise.resolve(false);
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
  return probeStreamPlayable(nuvioStream.url).then((playable) => playable ? nuvioStream : null);
}
function toNuvioStream(internalStream) {
  const container = extractStreamContainer(internalStream.url);
  const resolution = extractStreamResolution(internalStream.quality, internalStream.title, internalStream.name);
  const nuvioStream = {
    name: internalStream.name,
    title: ["Latino", container, resolution].filter(Boolean).join(" \u2022 ") || " ",
    url: toMediaflowProxyUrl(internalStream.url, internalStream.headers),
    quality: resolution || null,
    size: null,
    provider: "tlnovelas"
  };
  return nuvioStream;
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType !== "tv") return Promise.resolve([]);
  return Promise.all([fetchTmdbDetails(tmdbId, mediaType), getAlternativeTitles(mediaType, tmdbId)]).then(([details, extraTitles]) => {
    if (!details || !details.title) return [];
    return scrape(details.title, details.originalTitle, details.year, "series", seasonNum, episodeNum, { extraTitles }).then(
      (results) => mapWithConcurrency((results || []).map((stream) => toNuvioStream(stream)), STREAM_PROBE_CONCURRENCY, (nuvioStream) => probeNuvioStream(nuvioStream))
    );
  }).catch((error) => {
    console.error("TLNovelas (Nuvio): getStreams failed:", error && error.message);
    return [];
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

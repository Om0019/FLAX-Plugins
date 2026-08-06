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
const SHA256_K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
function rotr32(x, n) {
  return (x >>> n | x << 32 - n) >>> 0;
}
function stringToUtf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        code = 65536 + (code - 55296 << 10) + (next - 56320);
        i += 1;
      }
    }
    if (code < 128) {
      bytes.push(code);
    } else if (code < 2048) {
      bytes.push(192 | code >> 6, 128 | code & 63);
    } else if (code < 65536) {
      bytes.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
    } else {
      bytes.push(
        240 | code >> 18,
        128 | code >> 12 & 63,
        128 | code >> 6 & 63,
        128 | code & 63
      );
    }
  }
  return bytes;
}
function sha256Words(bytes) {
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const bitLenLow = bytes.length * 8 >>> 0;
  const msg = bytes.slice();
  msg.push(128);
  while (msg.length % 64 !== 56) msg.push(0);
  msg.push(0, 0, 0, 0);
  msg.push(bitLenLow >>> 24 & 255, bitLenLow >>> 16 & 255, bitLenLow >>> 8 & 255, bitLenLow & 255);
  const w = new Array(64);
  for (let chunkStart = 0; chunkStart < msg.length; chunkStart += 64) {
    for (let i = 0; i < 16; i += 1) {
      const o = chunkStart + i * 4;
      w[i] = (msg[o] << 24 | msg[o + 1] << 16 | msg[o + 2] << 8 | msg[o + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = h + S1 + ch + SHA256_K[i] + w[i] >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7];
}
function sha256Hex(str) {
  return sha256Words(stringToUtf8Bytes(str)).map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}
function sha256RawBytes(str) {
  const words = sha256Words(stringToUtf8Bytes(str));
  const bytes = [];
  for (const word of words) {
    bytes.push(word >>> 24 & 255, word >>> 16 & 255, word >>> 8 & 255, word & 255);
  }
  return bytes;
}
function gmul(a, b) {
  let p = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i += 1) {
    if (y & 1) p ^= x;
    const hiBitSet = x & 128;
    x = x << 1 & 255;
    if (hiBitSet) x ^= 27;
    y >>= 1;
  }
  return p;
}
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
  const rotl8 = (v, n) => (v << n | v >>> 8 - n) & 255;
  const sbox = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    const x = inv[i];
    sbox[i] = x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 99;
  }
  const invSbox = new Array(256);
  for (let i = 0; i < 256; i += 1) invSbox[sbox[i]] = i;
  return { sbox, invSbox };
}
const AES_TABLES = buildAesTables();
const AES_SBOX = AES_TABLES.sbox;
const AES_INV_SBOX = AES_TABLES.invSbox;
const AES_RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54, 108, 216, 171, 77];
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
    state[0][c] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    state[1][c] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    state[2][c] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    state[3][c] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
function aes256DecryptBlock(block, w) {
  const Nr = 14;
  const state = [[], [], [], []];
  for (let i = 0; i < 16; i += 1) state[i % 4][i / 4 | 0] = block[i];
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
  for (let i = 0; i < 16; i += 1) out[i] = state[i % 4][i / 4 | 0];
  return out;
}
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
    console.error(`SoloLatino: TMDB lookup failed for ${mediaType}/${tmdbId}:`, error.message);
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
      console.error("SoloLatino unpacker: failed to decode script block:", err.message);
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
      console.warn(`SoloLatino unpacker: Xupalace server ${entry.server || entry.url} failed: ${e.message}`);
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
    embedUrl.searchParams.set("http_referer", referer || "https://sololatino.net/");
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
    if (!options.quiet) console.warn(`SoloLatino unpacker: VOE payload decode failed: ${error.message}`);
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
    console.warn(`SoloLatino unpacker: Nupload decode failed: ${error.message}`);
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
    console.warn(`SoloLatino unpacker: VidGuard signature decode failed: ${error.message}`);
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
const EMBED69_MAX_POW_DIFFICULTY = 5;
const EMBED69_MAX_POW_MS = 8e3;
const EMBED69_POW_CHUNK = 4e3;
function solveEmbed69ProofOfWork(challenge, difficulty) {
  const prefix = "0".repeat(difficulty);
  const deadline = Date.now() + EMBED69_MAX_POW_MS;
  let nonce = 0;
  function step() {
    const chunkEnd = nonce + EMBED69_POW_CHUNK;
    for (; nonce < chunkEnd; nonce += 1) {
      if (sha256Hex(challenge + nonce).startsWith(prefix)) return nonce;
    }
    if (Date.now() > deadline) {
      console.warn(`SoloLatino: embed69 proof-of-work (difficulty ${difficulty}) exceeded ${EMBED69_MAX_POW_MS}ms after ${nonce} nonces; giving up.`);
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
  } catch (e) {
    return Promise.resolve(null);
  }
  if (difficulty > EMBED69_MAX_POW_DIFFICULTY) {
    console.warn(`SoloLatino: refusing embed69 proof-of-work at difficulty ${difficulty} (max ${EMBED69_MAX_POW_DIFFICULTY} in this pure-JS sandbox).`);
    return Promise.resolve(null);
  }
  return Promise.resolve(solveEmbed69ProofOfWork(challenge, difficulty)).then((nonce) => {
    if (nonce === null || nonce === void 0) return null;
    const aesKey = sha256RawBytes(challenge + nonce + salt);
    const decryptedLinks = [];
    function decryptEmbedLink(embed, kind) {
      if (!embed.link || kind === "video" && embed.type !== "video") return;
      try {
        const raw = base64ToBytes(embed.link);
        const iv = raw.slice(0, 16);
        const ciphertext = raw.slice(16);
        if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) return;
        const decrypted = stripPkcs7PaddingBytes(aes256CbcDecrypt(aesKey, iv, ciphertext));
        decryptedLinks.push({ server: embed.servername, url: bytesToUtf8String(decrypted), kind });
      } catch (e) {
      }
    }
    for (const file of dataLink) {
      if (Array.isArray(file.sortedEmbeds)) {
        for (const embed of file.sortedEmbeds) decryptEmbedLink(embed, "video");
      }
      if (Array.isArray(file.downloadEmbeds)) {
        for (const embed of file.downloadEmbeds) decryptEmbedLink(embed, "download");
      }
    }
    return decryptedLinks;
  });
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
    console.log(`SoloLatino unpacker: skipping ${getHostname(url)}, which accepts no connections`);
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
    console.warn(`SoloLatino unpacker: player wrapper skipped (${getHostname(url) || url}): ${e.message}`);
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
    if (!(url.includes("embed69") || html.includes("POW_CHALLENGE") && html.includes("dataLink"))) {
      return null;
    }
    return decryptEmbed69(html).then((embed69Links) => {
      if (!embed69Links || embed69Links.length === 0) return null;
      const rankedEmbeds = embed69Links.slice().sort((a, b) => {
        const kindScore = (value) => value.kind === "video" ? 0 : 1;
        const serverScore = (value) => {
          const server = (value.server || "").toLowerCase();
          if (server === "vidhide" || server === "streamwish" || server === "hlswish") return 0;
          if (server === "rapidvideo") return 1;
          if (server === "filemoon" || server === "voe" || server === "dood" || server === "doodstream" || server === "doodstreaming" || server === "playmogo") return 8;
          return 2;
        };
        return kindScore(a) - kindScore(b) || serverScore(a) - serverScore(b);
      });
      const attemptedEmbeds = rankedEmbeds.filter((embed) => !isFileLockerServer(embed.server)).slice(0, MAX_EMBED69_ATTEMPTS);
      return firstResultInOrder(
        attemptedEmbeds,
        EMBED_RESOLVE_CONCURRENCY,
        (embed) => resolvePlayerStream(embed.url, userAgent, url, { depth: depth + 1, visited, signal })
      );
    });
  });
  chain = chain.then((result) => {
    if (result) return result;
    if (!isVoeHost(url)) {
      const voeMirrorUrl = extractVoeDirectStream(html, url, { quiet: true });
      if (voeMirrorUrl) {
        console.log(`SoloLatino unpacker: recognised ${getHostname(url)} as a VOE mirror by payload`);
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
      console.log(`SoloLatino unpacker: following JS redirect to ${redirectUrl}`);
      return resolvePlayerStream(redirectUrl, userAgent, referer, { depth: depth + 1, visited, signal });
    }
    return null;
  });
  chain = chain.then((result) => {
    if (result) return result;
    const assignedRedirectUrl = extractAssignedRedirect(html, url);
    if (assignedRedirectUrl && assignedRedirectUrl !== url && isHttpUrl(assignedRedirectUrl)) {
      console.log(`SoloLatino unpacker: following assigned redirect to ${assignedRedirectUrl}`);
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
const TOKEN_CONCURRENCY = 3;
const SEARCH_TIMEOUT_MS = 4500;
const PAGE_TIMEOUT_MS = 5500;
const API_TIMEOUT_MS = 5e3;
const PROBE_TIMEOUT_MS = 2500;
const REFUSAL_STATUSES = /* @__PURE__ */ new Set([401, 403, 405, 429, 503]);
const REFUSAL_TTL_MS = 45 * 1e3;
const refusalCache = createTtlCache({ maxEntries: 4 });
const REFUSAL_KEY = "sololatino.net";
function browserHeaders(userAgent, extra = {}) {
  return __spreadValues({
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
  }, extra);
}
function noteRefusal(status, where) {
  if (!REFUSAL_STATUSES.has(status)) return false;
  if (refusalCache.get(REFUSAL_KEY) === void 0) {
    console.warn(`SoloLatino: host refused us with HTTP ${status} at ${where}; skipping this source for ${REFUSAL_TTL_MS / 1e3}s`);
  }
  refusalCache.set(REFUSAL_KEY, status, REFUSAL_TTL_MS);
  return true;
}
function slugifyTitle(str) {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " y ").replace(/\band\b/g, "y").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function extractSlug(url) {
  const match = url.match(/\/(?:pelicula|serie)\/([^/?#]+)/);
  return (match == null ? void 0 : match[1]) || "";
}
function scoreCandidate(result, targetTitle, originalTargetTitle, year, extraTitles = []) {
  const cleanTargetTitle = cleanText(targetTitle);
  const cleanOriginalTitle = cleanText(originalTargetTitle);
  const cleanExtraTitles = extraTitles.map(cleanText).filter(Boolean);
  const cleanResultTitle = cleanText(result.title);
  const slug = extractSlug(result.url);
  const cleanSlug = cleanText(slug.replace(/-/g, " "));
  let score = 0;
  if (year) {
    const yearStr = year.toString();
    const candidateYears = extractCandidateYears(result.title, slug);
    if (candidateYears.size > 0 && !candidateYears.has(yearStr)) return 0;
  }
  if (cleanTargetTitle && cleanResultTitle === cleanTargetTitle) score += 5;
  if (cleanOriginalTitle && cleanResultTitle === cleanOriginalTitle) score += 4;
  if (cleanSlug && cleanSlug === cleanTargetTitle) score += 5;
  if (cleanSlug && cleanSlug === cleanOriginalTitle) score += 4;
  if (cleanTargetTitle && looseIncludes(cleanResultTitle, cleanTargetTitle)) score += 2;
  if (cleanOriginalTitle && looseIncludes(cleanResultTitle, cleanOriginalTitle)) score += 2;
  for (const cleanExtra of cleanExtraTitles) {
    if (cleanResultTitle === cleanExtra || cleanSlug === cleanExtra) score += 4;
    else if (looseIncludes(cleanResultTitle, cleanExtra)) score += 2;
  }
  if (year) {
    const yearStr = year.toString();
    if (result.title.includes(yearStr) || cleanResultTitle.includes(yearStr) || cleanSlug.includes(yearStr)) score += 8;
  }
  return score;
}
function buildFallbackUrls(type, title, originalTitle, extraTitles = []) {
  const basePath = type === "series" ? "serie" : "pelicula";
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of [title, originalTitle, ...extraTitles]) {
    const slug = slugifyTitle(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    candidates.push({ url: `https://sololatino.net/${basePath}/${slug}`, title: value || slug });
  }
  return candidates;
}
function extractPageIdentityText(html) {
  const $ = cheerio.load(html || "");
  return [
    $("title").text(),
    $('meta[property="og:title"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $("h1").first().text(),
    $("h2").first().text()
  ].filter(Boolean).join(" ");
}
function pageHasRequestedYear(html, year) {
  if (!year) return true;
  const identityText = extractPageIdentityText(html);
  const years = extractCandidateYears(identityText);
  return years.has(year.toString());
}
function probeFallbackCandidate(candidate, year, userAgent, signal) {
  return fetchTextWithTimeout(candidate.url, { headers: browserHeaders(userAgent), signal }, PROBE_TIMEOUT_MS).then(
    ({ res: probeRes, text: html }) => {
      if (!probeRes.ok) {
        console.warn(`SoloLatino: fallback probe ${candidate.url} returned HTTP ${probeRes.status}`);
        noteRefusal(probeRes.status, "fallback probe");
        return null;
      }
      if (year && !pageHasRequestedYear(html, year)) {
        console.log(`SoloLatino: rejecting fallback ${candidate.url}; page does not contain requested year ${year}`);
        return null;
      }
      return candidate;
    }
  );
}
function scorePlayerToken(playerInfo) {
  const label = (playerInfo.name || "").toLowerCase();
  if (label.includes("latino") || label.includes("slplayer") || label.includes("servidor 1")) return 0;
  if (label.includes("premium")) return 3;
  if (label.includes("vip")) return 7;
  return 4;
}
function sortPlayerTokens(playerTokens) {
  return [...playerTokens].sort((a, b) => scorePlayerToken(a) - scorePlayerToken(b));
}
const PELISSERIESHOY_ORIGIN = "https://player.pelisserieshoy.com";
const PELISSERIESHOY_MAX_SERVERS = 4;
const PELISSERIESHOY_CONCURRENCY = 2;
function pelisserieshoyHeaders(userAgent, streamUrl) {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": userAgent,
    Referer: streamUrl,
    Origin: PELISSERIESHOY_ORIGIN
  };
}
function resolvePelisserieshoyServer(serverValue, token, userAgent, streamUrl, signal) {
  return fetchJsonWithTimeout(
    `${PELISSERIESHOY_ORIGIN}/s.php`,
    { method: "POST", headers: pelisserieshoyHeaders(userAgent, streamUrl), signal, body: new URLSearchParams({ a: "2", v: serverValue, tok: token }) },
    API_TIMEOUT_MS
  ).then(({ res: playValRes, data: playValJson }) => {
    if (!playValRes.ok || !(playValJson == null ? void 0 : playValJson.u)) return null;
    const pathUrl = `${PELISSERIESHOY_ORIGIN}${playValJson.u}`;
    return fetchWithTimeout(
      pathUrl,
      { method: "GET", headers: { "User-Agent": userAgent, Referer: streamUrl }, redirect: "manual", signal },
      API_TIMEOUT_MS
    ).then((redirectCheck) => {
      const directUrl = [301, 302].includes(redirectCheck.status) ? redirectCheck.headers.get("location") : pathUrl;
      if (!directUrl) return null;
      return directUrl.includes(".bin") ? `${directUrl}#.mp4` : directUrl;
    });
  });
}
function resolvePelisserieshoy(streamUrl, userAgent, signal) {
  return fetchTextWithTimeout(streamUrl, { headers: { "User-Agent": userAgent, Referer: "https://sololatino.net/" }, signal }, PAGE_TIMEOUT_MS).then(
    ({ res: pageRes, text: html }) => {
      var _a;
      if (!pageRes.ok) return null;
      const token = (_a = html.match(/const\s+_t\s*=\s*['"]([^'"]+)['"]/)) == null ? void 0 : _a[1];
      if (!token) return null;
      return fetchWithTimeout(
        `${PELISSERIESHOY_ORIGIN}/s.php`,
        { method: "POST", headers: pelisserieshoyHeaders(userAgent, streamUrl), signal, body: new URLSearchParams({ a: "click", tok: token }) },
        API_TIMEOUT_MS
      ).then(
        () => fetchJsonWithTimeout(
          `${PELISSERIESHOY_ORIGIN}/s.php`,
          { method: "POST", headers: pelisserieshoyHeaders(userAgent, streamUrl), signal, body: new URLSearchParams({ a: "1", tok: token }) },
          API_TIMEOUT_MS
        )
      ).then(({ res: sListRes, data: sListJson }) => {
        if (!sListRes.ok || !Array.isArray(sListJson == null ? void 0 : sListJson.s)) return null;
        const serverValues = sListJson.s.slice(0, PELISSERIESHOY_MAX_SERVERS).map((entry) => Array.isArray(entry) ? entry[1] : entry).filter(Boolean);
        return firstResultInOrder(
          serverValues,
          PELISSERIESHOY_CONCURRENCY,
          (serverValue) => resolvePelisserieshoyServer(serverValue, token, userAgent, streamUrl, signal).catch((error) => {
            console.warn(`SoloLatino: pelisserieshoy server ${serverValue} failed: ${error.message}`);
            return null;
          })
        );
      });
    }
  );
}
function scrape(title, originalTitle, year, type, season, episode, options = {}) {
  const { signal, extraTitles = [] } = options;
  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const activeRefusal = refusalCache.get(REFUSAL_KEY);
  if (activeRefusal !== void 0) {
    console.log(`SoloLatino: skipping source; host last refused us with HTTP ${activeRefusal}`);
    return Promise.resolve([]);
  }
  let hostRefused = false;
  function performSearch(searchQuery) {
    const searchUrl = `https://sololatino.net/buscar?q=${encodeURIComponent(searchQuery)}`;
    return fetchTextWithTimeout(searchUrl, { headers: browserHeaders(userAgent), signal }, SEARCH_TIMEOUT_MS).then(({ res, text: html }) => {
      console.log(`SoloLatino search HTTP status for ${searchQuery}: ${res.status}`);
      if (!res.ok) {
        if (noteRefusal(res.status, "search")) hostRefused = true;
        return null;
      }
      const $ = cheerio.load(html);
      const results = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().replace(/\s+/g, " ");
        const isMovieLink = href.includes("/pelicula/");
        const isSeriesLink = href.includes("/serie/");
        if (href && (isMovieLink || isSeriesLink)) {
          if (type === "movie" && isMovieLink || type === "series" && isSeriesLink) {
            results.push({ url: href, title: text });
          }
        }
      });
      const uniqueResults = [];
      const seenUrls = /* @__PURE__ */ new Set();
      for (const r of results) {
        if (r.url.includes("/serie/") && !/\/serie\/[^/]+\/?$/.test(r.url)) continue;
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          uniqueResults.push(r);
        }
      }
      let bestMatch = null;
      let bestScore = 0;
      for (const r of uniqueResults) {
        const score = scoreCandidate(r, title, originalTitle, year, extraTitles);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = r;
        }
      }
      console.log(`SoloLatino performSearch("${searchQuery}") found ${uniqueResults.length} candidate(s), best score ${bestScore}`);
      return bestMatch;
    });
  }
  const racedTitles = originalTitle && cleanText(originalTitle) !== cleanText(title) ? [title, originalTitle] : [title];
  return raceTitleSearches(racedTitles, performSearch).then((bestMatch) => {
    const triedClean = /* @__PURE__ */ new Set([cleanText(title), cleanText(originalTitle)]);
    function tryExtras(i, current) {
      if (current || hostRefused || i >= extraTitles.length) return Promise.resolve(current);
      const extraTitle = extraTitles[i];
      const cleanExtra = cleanText(extraTitle);
      if (!cleanExtra || triedClean.has(cleanExtra)) return tryExtras(i + 1, current);
      triedClean.add(cleanExtra);
      console.log(`SoloLatino: no match yet, trying alternative title "${extraTitle}"`);
      return performSearch(extraTitle).then((match) => tryExtras(i + 1, match));
    }
    return tryExtras(0, bestMatch);
  }).then((bestMatch) => {
    if (!bestMatch && hostRefused) {
      console.log("SoloLatino: skipping direct URL fallbacks; the host refused the search");
      return { bestMatch: null, aborted: true };
    }
    if (bestMatch) return { bestMatch, aborted: false };
    const candidates = buildFallbackUrls(type, title, originalTitle, extraTitles);
    function tryCandidates(i) {
      if (i >= candidates.length) return Promise.resolve(null);
      const candidate = candidates[i];
      return probeFallbackCandidate(candidate, year, userAgent, signal).then((probedCandidate) => {
        if (probedCandidate) {
          console.log(`SoloLatino: using direct URL fallback ${probedCandidate.url}`);
          return probedCandidate;
        }
        return tryCandidates(i + 1);
      }).catch((err) => {
        console.warn(`SoloLatino: fallback probe failed for ${candidate.url}:`, err.message);
        return tryCandidates(i + 1);
      });
    }
    return tryCandidates(0).then((bestMatch2) => ({ bestMatch: bestMatch2, aborted: false }));
  }).then(({ bestMatch, aborted }) => {
    if (aborted) return [];
    if (!bestMatch) {
      console.log(`SoloLatino: no matching content found for "${title}"`);
      return [];
    }
    let targetPageUrl = bestMatch.url;
    if (type === "series") {
      const baseUrlClean = bestMatch.url.replace(/\/$/, "");
      targetPageUrl = `${baseUrlClean}/temporada-${season}/episodio-${episode}`;
    }
    console.log(`SoloLatino: matched content URL: ${targetPageUrl}`);
    const csrfRequest = fetchWithTimeout(
      "https://sololatino.net/sanctum/csrf-cookie",
      { headers: browserHeaders(userAgent, { Accept: "application/json", "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin" }), signal },
      API_TIMEOUT_MS
    );
    const pageRequest = fetchTextWithTimeout(targetPageUrl, { headers: browserHeaders(userAgent), signal }, PAGE_TIMEOUT_MS);
    return Promise.allSettled([csrfRequest, pageRequest]).then(([csrfOutcome, pageOutcome]) => {
      if (csrfOutcome.status === "rejected") throw csrfOutcome.reason;
      if (pageOutcome.status === "rejected") throw pageOutcome.reason;
      const csrfRes = csrfOutcome.value;
      if (!csrfRes.ok) {
        console.warn(`SoloLatino: sanctum handshake failed with status ${csrfRes.status}`);
        noteRefusal(csrfRes.status, "sanctum handshake");
        return [];
      }
      const setCookies = csrfRes.headers.getSetCookie();
      let xsrfCookieVal = "";
      let sessionCookieVal = "";
      for (const cookie of setCookies) {
        if (cookie.startsWith("XSRF-TOKEN=")) xsrfCookieVal = cookie.split(";")[0].substring("XSRF-TOKEN=".length);
        else if (cookie.startsWith("sololatinonet-session=")) sessionCookieVal = cookie.split(";")[0].substring("sololatinonet-session=".length);
      }
      if (!xsrfCookieVal) {
        console.warn("SoloLatino: sanctum response did not return XSRF-TOKEN cookie.");
        return [];
      }
      const decodedXSRF = decodeURIComponent(xsrfCookieVal);
      const cookieString = `XSRF-TOKEN=${xsrfCookieVal}; sololatinonet-session=${sessionCookieVal}`;
      const { res: pageRes, text: pageHtml } = pageOutcome.value;
      if (!pageRes.ok) {
        console.warn(`SoloLatino: failed to fetch target page: ${targetPageUrl} (${pageRes.status})`);
        noteRefusal(pageRes.status, "content page");
        return [];
      }
      const pageDoc = cheerio.load(pageHtml);
      const csrfToken = pageDoc('meta[name="csrf-token"]').attr("content");
      if (!csrfToken) {
        console.warn("SoloLatino: CSRF token not found in meta tags.");
        return [];
      }
      const playerTokens = [];
      pageDoc(".server-btn").each((i, el) => {
        const token = pageDoc(el).attr("data-player-token");
        const serverName = pageDoc(el).text().trim() || `Servidor ${i + 1}`;
        if (token) playerTokens.push({ name: serverName, token });
      });
      console.log(`SoloLatino: found ${playerTokens.length} player tokens`);
      const sortedPlayerTokens = sortPlayerTokens(playerTokens);
      return mapWithConcurrency(
        sortedPlayerTokens,
        TOKEN_CONCURRENCY,
        (pInfo) => fetchJsonWithTimeout(
          "https://sololatino.net/api/player-url",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-XSRF-TOKEN": decodedXSRF,
              "User-Agent": userAgent,
              Cookie: cookieString,
              Referer: targetPageUrl,
              Origin: "https://sololatino.net"
            },
            signal,
            body: JSON.stringify({ t: pInfo.token })
          },
          API_TIMEOUT_MS
        ).then(({ res: apiRes, data: apiJson }) => {
          if (apiRes.status !== 200) {
            console.warn(`SoloLatino: API /api/player-url returned status ${apiRes.status} for server ${pInfo.name}`);
            return null;
          }
          if (!apiJson || !apiJson.url) return null;
          const streamUrl = apiJson.url;
          const isIframe = apiJson.type === "iframe" || streamUrl.includes("embed") || streamUrl.includes("player") || streamUrl.includes("/f/");
          const resolvePromise = !isIframe ? Promise.resolve(streamUrl) : streamUrl.includes("player.pelisserieshoy.com") ? resolvePelisserieshoy(streamUrl, userAgent, signal) : resolvePlayerStream(streamUrl, userAgent, "https://sololatino.net/", { signal });
          return resolvePromise.then((directUrl) => {
            if (!directUrl) return null;
            return {
              name: "SoloLatino",
              title: `\u{1F1F2}\u{1F1FD} ${pInfo.name}`,
              url: directUrl,
              headers: { "User-Agent": userAgent, Referer: streamUrl || "https://sololatino.net/" }
            };
          }).catch((e) => {
            console.error(`SoloLatino: error unpacking iframe ${streamUrl}:`, e.message);
            return null;
          });
        }).catch((err) => {
          console.error(`SoloLatino: error requesting player URL for server ${pInfo.name}:`, err.message);
          return null;
        })
      );
    });
  }).catch((error) => {
    console.error(`SoloLatino scrape error for "${title}":`, error.message);
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
    provider: "sololatino"
  };
  return nuvioStream;
}
function wrapDiagText(text, width) {
  const clean = String(text).replace(/\s+/g, " ").trim().slice(0, 600);
  const lines = [];
  for (let i = 0; i < clean.length; i += width) lines.push(clean.slice(i, i + width));
  return lines.join("\n");
}
function diagStream(text) {
  return {
    name: "\u26A0\uFE0F SoloLatino diag",
    title: wrapDiagText(text, 30),
    url: "https://example.com/diag-not-playable.mp4",
    quality: null,
    size: null,
    provider: "sololatino"
  };
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  const type = mediaType === "tv" ? "series" : "movie";
  const trail = [];
  return Promise.all([fetchTmdbDetails(tmdbId, mediaType), getAlternativeTitles(mediaType, tmdbId)]).then(([details, extraTitles]) => {
    trail.push(details && details.title ? `tmdb: title="${details.title}" year=${details.year}` : "tmdb: no details/title");
    trail.push(`altTitles: ${extraTitles ? extraTitles.length : 0}`);
    if (!details || !details.title) return [];
    return scrape(details.title, details.originalTitle, details.year, type, seasonNum, episodeNum, { extraTitles }).then((results) => {
      trail.push(`scrape: ${(results || []).length} raw result(s)`);
      return mapWithConcurrency(
        (results || []).map((stream) => toNuvioStream(stream)),
        STREAM_PROBE_CONCURRENCY,
        (nuvioStream) => probeNuvioStream(nuvioStream)
      ).then((probed) => {
        trail.push(`probe: ${probed.length} survived of ${(results || []).length}`);
        return probed;
      });
    });
  }).then((streams) => streams && streams.length > 0 ? streams : [diagStream(trail.join(" | "))]).catch((error) => {
    console.error("SoloLatino (Nuvio): getStreams failed:", error && error.message);
    trail.push(`THREW: ${error && error.message}`);
    return [diagStream(trail.join(" | "))];
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

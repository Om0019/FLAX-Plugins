var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
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
const DEFAULT_TIMEOUT_MS = 3e3;
const HAS_TIMERS = typeof setTimeout === "function";
function safeSetTimeout(fn, ms) {
  return HAS_TIMERS ? setTimeout(fn, ms) : null;
}
function safeClearTimeout(id) {
  if (HAS_TIMERS && id !== null && id !== void 0) clearTimeout(id);
}
function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const externalSignal = options.signal;
  const _a = options, { signal } = _a, fetchOptions = __objRest(_a, ["signal"]);
  if (!HAS_TIMERS && !externalSignal) return fetch(url, fetchOptions);
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
  return Promise.race([fetch(url, fetchOptions), deadline]).then(
    (res) => {
      cleanup();
      return res;
    },
    (error) => {
      cleanup();
      throw error;
    }
  );
}
function probe(signal) {
  const targetUrl = "https://cinehdplus.org/";
  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  console.log(`CineHDPlus: Checking accessibility for ${targetUrl}`);
  return fetchWithTimeout(targetUrl, { headers: { "User-Agent": userAgent }, signal }, DEFAULT_TIMEOUT_MS).then((res) => {
    if (res.status === 403) {
      console.log("CineHDPlus: Site returned 403 (Cloudflare Protected). Skipping CineHDPlus.");
      return [];
    }
    console.log(`CineHDPlus: Site returned ${res.status}. Parsing not implemented.`);
    return [];
  }).catch((error) => {
    console.error("CineHDPlus access error:", error && error.message);
    return [];
  });
}
function getStreams() {
  return probe();
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

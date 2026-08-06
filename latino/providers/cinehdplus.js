// Built from src/providers/cinehdplus.js for the Hermes/es2016 runtime Nuvio's local-scraper
// sandbox targets -- do not hand-edit. Regenerate with:
//   npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/cinehdplus.js > latino/providers/cinehdplus.js
// Edit src/providers/cinehdplus.js instead, then rebuild.
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
function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternalSignal = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }
    const _a = options, { signal } = _a, fetchOptions = __objRest(_a, ["signal"]);
    fetch(url, __spreadProps(__spreadValues({}, fetchOptions), { signal: controller.signal })).then((res) => {
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternalSignal);
      resolve(res);
    }).catch((error) => {
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternalSignal);
      reject(error);
    });
  });
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

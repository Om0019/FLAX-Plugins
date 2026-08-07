/**
 * CineHDPlus provider for Nuvio Local Scrapers — disabled, see manifest.json
 * (`enabled: false`) and the source addon's `ENABLE_CINEHDPLUS` flag.
 *
 * cinehdplus.org sits behind a Cloudflare *managed challenge*: every request is
 * answered 403 with `cf-mitigated: challenge` and a "Just a moment..." interstitial
 * carrying cf_chl_opt and the challenge-platform script. Verified July 2026,
 * including with a complete browser header set (Accept, Accept-Language, sec-ch-ua,
 * Sec-Fetch-*) — headers do not move it, because passing requires executing the
 * challenge script and returning with a cf_clearance cookie.
 *
 * No fetch-based scraper can clear that, so there is nothing to implement here
 * short of driving a real browser. This file is kept only as a cheap probe to
 * notice if the site is ever taken out from behind the challenge; it never
 * returns any streams.
 */

const DEFAULT_TIMEOUT_MS = 3000;

// Nuvio's sandbox provides no timer functions -- `setTimeout` is not defined
// there -- and its fetch does not honour an AbortSignal, so the deadline is
// raced rather than wired into fetch, and is skipped entirely when there are
// no timers to arm it with. See the equivalent note in the other latino
// providers.
const HAS_TIMERS = typeof setTimeout === 'function';

function safeSetTimeout(fn, ms) {
  return HAS_TIMERS ? setTimeout(fn, ms) : null;
}

function safeClearTimeout(id) {
  if (HAS_TIMERS && id !== null && id !== undefined) clearTimeout(id);
}

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const externalSignal = options.signal;
  const { signal, ...fetchOptions } = options;

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
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
  });

  function cleanup() {
    safeClearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
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
  const targetUrl = 'https://cinehdplus.org/';
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  console.log(`CineHDPlus: Checking accessibility for ${targetUrl}`);
  return fetchWithTimeout(targetUrl, { headers: { 'User-Agent': userAgent }, signal }, DEFAULT_TIMEOUT_MS)
    .then((res) => {
      if (res.status === 403) {
        console.log('CineHDPlus: Site returned 403 (Cloudflare Protected). Skipping CineHDPlus.');
        return [];
      }
      console.log(`CineHDPlus: Site returned ${res.status}. Parsing not implemented.`);
      return [];
    })
    .catch((error) => {
      console.error('CineHDPlus access error:', error && error.message);
      return [];
    });
}

/**
 * Required Nuvio local-scraper entry point. Always resolves to an empty
 * array — see the file header for why.
 * @returns {Promise<Array<object>>}
 */
function getStreams() {
  return probe();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

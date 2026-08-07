// StreamFlix Provider for Nuvio
// Ported from StreamFlix API
const cheerio = require('cheerio-without-node-native');

// Constants
const TMDB_API_KEY = ((typeof process !== "undefined" && process.env ? process.env.TMDB_API_KEY : undefined) || '');
const STREAMFLIX_API_BASE = "https://api.streamflix.app";
const CONFIG_URL = `${STREAMFLIX_API_BASE}/config/config-streamflixapp.json`;
const DATA_URL = `${STREAMFLIX_API_BASE}/data.json`;
const WEBSOCKET_URL = "wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5";

// Global cache
let cache = {
  config: null,
  configTimestamp: 0,
  data: null,
  dataTimestamp: 0,
};
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// The stream links carry the release filename, which is where the only honest
// statement about resolution lives: `BrBa.S01E01.720p.BrRip.x264.400MB-Pahe.in.mkv`
// is a 720p file no matter which mirror serves it. Labelling every premium
// mirror 1080p and every standard one 720p by rule put 720p files into the
// caller's 1080p slot; when the filename says nothing, so do we.
function qualityFromLink(link) {
  const match = String(link || '').match(/\b(2160p|4k|1080p|720p|480p|360p)\b/i);
  if (!match) return null;
  return match[1].toLowerCase() === '4k' ? '2160p' : match[1].toLowerCase();
}

// Helper function for HTTP requests
function makeRequest(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
  };

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  }).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  });
}

// Get config data with caching
function getConfig() {
  const now = Date.now();
  if (cache.config && now - cache.configTimestamp < CACHE_TTL) {
    return Promise.resolve(cache.config);
  }

  console.log('[StreamFlix] Fetching config data...');
  return makeRequest(CONFIG_URL)
    .then(response => response.json())
    .then(json => {
      cache.config = json;
      cache.configTimestamp = now;
      console.log('[StreamFlix] Config data cached successfully');
      return json;
    })
    .catch(error => {
      console.error('[StreamFlix] Failed to fetch config:', error.message);
      throw error;
    });
}

// Get data with caching
function getData() {
  const now = Date.now();
  if (cache.data && now - cache.dataTimestamp < CACHE_TTL) {
    return Promise.resolve(cache.data);
  }

  console.log('[StreamFlix] Fetching data...');
  return makeRequest(DATA_URL)
    .then(response => response.json())
    .then(json => {
      cache.data = json;
      cache.dataTimestamp = now;
      console.log('[StreamFlix] Data cached successfully');
      return json;
    })
    .catch(error => {
      console.error('[StreamFlix] Failed to fetch data:', error.message);
      throw error;
    });
}

// Search for content by title
function searchContent(title, year, mediaType) {
  console.log(`[StreamFlix] Searching for: "${title}" (${year})`);
  
  return getData()
    .then(data => {
      if (!data || !data.data) {
        throw new Error('Invalid data structure received');
      }

      const searchQuery = title.toLowerCase();
      const results = data.data.filter(item => {
        if (!item.moviename) return false;

        // Whole words, not substrings. `includes` matched "It" inside
        // "Bitter" and "Up" inside "Uptown", which is how a search could
        // select a different film entirely and still look like a hit.
        const itemWords = new Set(item.moviename.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
        const titleWords = searchQuery.split(/[^a-z0-9]+/).filter(Boolean);
        if (titleWords.length === 0) return false;

        // Check if all words from search query are present in the item title
        return titleWords.every(word => itemWords.has(word));
      });

      console.log(`[StreamFlix] Found ${results.length} search results`);
      return results;
    });
}

// Find best match from search results
function findBestMatch(targetTitle, results) {
  if (!results || results.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const result of results) {
    const score = calculateSimilarity(
      targetTitle.toLowerCase(),
      result.moviename.toLowerCase()
    );
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  console.log(`[StreamFlix] Best match: "${bestMatch?.moviename}" (score: ${bestScore.toFixed(2)})`);
  return bestMatch;
}

// Calculate string similarity
function calculateSimilarity(str1, str2) {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matches = 0;
  for (const word of words1) {
    if (word.length > 2 && words2.some(w => w.includes(word) || word.includes(w))) {
      matches++;
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

// WebSocket-based episode fetching (real implementation per series.py/api.js)
function getEpisodesFromWebSocket(movieKey, totalSeasons = 1) {
  return new Promise((resolve, reject) => {
    let WSImpl = null;
    try {
      WSImpl = typeof WebSocket !== 'undefined' ? WebSocket : require('ws');
    } catch (e) {
      WSImpl = null;
    }

    if (!WSImpl) {
      return reject(new Error('WebSocket implementation not available'));
    }

    const ws = new WSImpl(
      'wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5'
    );

    const seasonsData = {};
    let currentSeason = 1;
    let completedSeasons = 0;
    let messageBuffer = '';
    let expectedResponses = 0;
    let responsesReceived = 0;

    const overallTimeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('WebSocket timeout'));
    }, 30000);

    function sendSeasonRequest(season) {
      const payload = {
        t: 'd',
        d: { a: 'q', r: season, b: { p: `Data/${movieKey}/seasons/${season}/episodes`, h: '' } }
      };
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        // Ignore send errors; will be picked up by 'error' event
      }
    }

    ws.onopen = function () {
      sendSeasonRequest(currentSeason);
    };

    ws.onmessage = function (evt) {
      try {
        const message = (typeof evt.data === 'string') ? evt.data : evt.data.toString();

        // numeric count of expected messages sometimes sent
        if (/^\d+$/.test(message.trim())) {
          expectedResponses = parseInt(message.trim(), 10);
          responsesReceived = 0;
          return;
        }

        messageBuffer += message;

        try {
          const data = JSON.parse(messageBuffer);
          messageBuffer = '';

          if (data.t === 'c') {
            return; // handshake complete
          }

          if (data.t === 'd') {
            const d_data = data.d || {};
            const b_data = d_data.b || {};

            // completion for current season
            if (d_data.r === currentSeason && b_data.s === 'ok') {
              completedSeasons++;
              if (completedSeasons < totalSeasons) {
                currentSeason++;
                expectedResponses = 0;
                responsesReceived = 0;
                sendSeasonRequest(currentSeason);
              } else {
                clearTimeout(overallTimeout);
                try { ws.close(); } catch {}
                resolve(seasonsData);
              }
              return;
            }

            // episode data
            if (b_data.d) {
              const episodes = b_data.d;
              const seasonEpisodes = seasonsData[currentSeason] || {};
              for (const [epKey, epData] of Object.entries(episodes)) {
                if (epData && typeof epData === 'object') {
                  seasonEpisodes[parseInt(epKey, 10)] = {
                    key: epData.key,
                    link: epData.link,
                    name: epData.name,
                    overview: epData.overview,
                    runtime: epData.runtime,
                    still_path: epData.still_path,
                    vote_average: epData.vote_average
                  };
                  responsesReceived++;
                }
              }
              seasonsData[currentSeason] = seasonEpisodes;

              // If we know how many to expect and we reached/exceeded it, do nothing here.
              // The season completion is signaled by b.s === 'ok' above which we handle to advance.
            }
          }
        } catch (e) {
          // Incomplete JSON in buffer, wait for more
          if (messageBuffer.length > 100000) {
            messageBuffer = '';
          }
        }
      } catch (err) {
        // ignore parse errors; will continue buffering
      }
    };

    ws.onerror = function (err) {
      clearTimeout(overallTimeout);
      reject(new Error('WebSocket error'));
    };

    ws.onclose = function () {
      clearTimeout(overallTimeout);
    };
  });
}

// Main function that Nuvio will call
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
  console.log(`[StreamFlix] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
  
  if (seasonNum !== null) {
    console.log(`[StreamFlix] Season: ${seasonNum}, Episode: ${episodeNum}`);
  }

  // Get TMDB info first
  const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  
  return makeRequest(tmdbUrl)
    .then(response => response.json())
    .then(tmdbData => {
      const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
      const year = mediaType === 'tv' 
        ? tmdbData.first_air_date?.substring(0, 4) 
        : tmdbData.release_date?.substring(0, 4);

      if (!title) {
        throw new Error('Could not extract title from TMDB response');
      }

      console.log(`[StreamFlix] TMDB Info: "${title}" (${year})`);

      // Search for content
      return searchContent(title, year, mediaType)
        .then(searchResults => {
          if (searchResults.length === 0) {
            console.log('[StreamFlix] No search results found');
            return [];
          }

          const selectedResult = findBestMatch(title, searchResults);
          if (!selectedResult) {
            console.log('[StreamFlix] No suitable match found');
            return [];
          }

          // Get config for stream URLs
          return getConfig()
            .then(config => {
              if (mediaType === 'movie') {
                // Process movie streams
                return processMovieStreams(selectedResult, config);
              } else {
                // Process TV show streams
                return processTVStreams(selectedResult, config, seasonNum, episodeNum);
              }
            });
        });
    })
    .catch(error => {
      console.error(`[StreamFlix] Error in getStreams: ${error.message}`);
      return [];
    });
}

// Process movie streams
function processMovieStreams(movieData, config) {
  console.log(`[StreamFlix] Processing movie streams for: ${movieData.moviename}`);
  
  const streams = [];
  
  // Premium streams (higher quality)
  if (config.premium && movieData.movielink) {
    config.premium.forEach((baseUrl, index) => {
      const streamUrl = `${baseUrl}${movieData.movielink}`;
      streams.push({
        name: "StreamFlix",
        title: `${movieData.moviename} - Premium Quality`,
        url: streamUrl,
        quality: qualityFromLink(movieData.movielink),
        size: movieData.movieduration || "Unknown",
        type: 'direct',
        headers: {
          'Referer': 'https://api.streamflix.app',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    });
  }
  
  // Regular movie streams
  if (config.movies && movieData.movielink) {
    config.movies.forEach((baseUrl, index) => {
      const streamUrl = `${baseUrl}${movieData.movielink}`;
      streams.push({
        name: "StreamFlix",
        title: `${movieData.moviename} - Standard Quality`,
        url: streamUrl,
        quality: qualityFromLink(movieData.movielink),
        size: movieData.movieduration || "Unknown",
        type: 'direct',
        headers: {
          'Referer': 'https://api.streamflix.app',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    });
  }

  console.log(`[StreamFlix] Generated ${streams.length} movie streams`);
  return streams.filter(function (s) { return s != null; });
}

// Process TV show streams
function processTVStreams(tvData, config, seasonNum, episodeNum) {
  console.log(`[StreamFlix] Processing TV streams for: ${tvData.moviename}`);
  
  // Extract total seasons from duration field
  const seasonMatch = tvData.movieduration?.match(/(\d+)\s+Season/);
  const totalSeasons = seasonMatch ? parseInt(seasonMatch[1]) : 1;
  
  return getEpisodesFromWebSocket(tvData.moviekey, totalSeasons)
    .then(seasonsData => {
      const streams = [];
      
      // If specific episode requested
      if (seasonNum !== null && episodeNum !== null) {
        const seasonData = seasonsData[seasonNum];
        if (seasonData) {
          const episodeData = seasonData[episodeNum - 1];
          if (episodeData && config.premium) {
            config.premium.forEach(baseUrl => {
              const streamUrl = `${baseUrl}${episodeData.link}`;
              streams.push({
                name: "StreamFlix",
                title: `${tvData.moviename} S${seasonNum}E${episodeNum} - ${episodeData.name}`,
                url: streamUrl,
                quality: qualityFromLink(episodeData.link),
                size: episodeData.runtime ? `${episodeData.runtime}min` : "Unknown",
                type: 'direct',
                headers: {
                  'Referer': 'https://api.streamflix.app',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
            });
          }
        }
      } else {
        // Return all episodes for all seasons
        for (const [season, episodes] of Object.entries(seasonsData)) {
          for (const [epIndex, episodeData] of Object.entries(episodes)) {
            if (config.premium && episodeData.link) {
              const epNum = parseInt(epIndex) + 1;
              config.premium.forEach(baseUrl => {
                const streamUrl = `${baseUrl}${episodeData.link}`;
                streams.push({
                  name: "StreamFlix",
                  title: `${tvData.moviename} S${season}E${epNum} - ${episodeData.name}`,
                  url: streamUrl,
                  quality: qualityFromLink(episodeData.link),
                  size: episodeData.runtime ? `${episodeData.runtime}min` : "Unknown",
                  type: 'direct',
                  headers: {
                    'Referer': 'https://api.streamflix.app',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                });
              });
            }
          }
        }
      }
      
      // Fallback if no episodes found
      if (streams.length === 0 && config.premium && seasonNum !== null && episodeNum !== null) {
        const fallbackUrl = `${config.premium[0]}tv/${tvData.moviekey}/s${seasonNum}/episode${episodeNum}.mkv`;
        streams.push({
          name: "StreamFlix",
          title: `${tvData.moviename} S${seasonNum}E${episodeNum} (Fallback)`,
          url: fallbackUrl,
          quality: null,
          size: "Unknown",
          type: 'direct',
          headers: {
            'Referer': 'https://api.streamflix.app',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      }

      console.log(`[StreamFlix] Generated ${streams.length} TV streams`);
      return streams.filter(function (s) { return s != null; });
    })
    .catch(error => {
      console.error('[StreamFlix] WebSocket failed, using fallback:', error.message);
      
      // Generate fallback stream
      if (config.premium && seasonNum !== null && episodeNum !== null) {
        const fallbackUrl = `${config.premium[0]}tv/${tvData.moviekey}/s${seasonNum}/episode${episodeNum}.mkv`;
        return [{
          name: "StreamFlix",
          title: `${tvData.moviename} S${seasonNum}E${episodeNum} (Fallback)`,
          url: fallbackUrl,
          quality: null,
          size: "Unknown",
          type: 'direct',
          headers: {
            'Referer': 'https://api.streamflix.app',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }];
      }
      
      return [];
    });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}


// ---------------------------------------------------------------------------
// Appended (not part of the vendored file above): unifies this provider's
// stream Name/Description with the upstream English Stremio addon's
// src/stream-template.js layout, applied there at its HTTP boundary and here
// as a post-processing wrap around the vendored getStreams, since Nuvio
// scrapers have no such boundary and this file's obfuscated internals aren't
// meant to be hand-edited:
//   Name:        {{cached ? "\u26a1\ufe0f " : ""}}{{indexer}}
//   Description: English{{container ? " \u2022 " + container : ""}}{{resolution ? " \u2022 " + resolution : ""}}
// ---------------------------------------------------------------------------
(function () {
  var __NUVIO_PROVIDER_NAME__ = "StreamFlix";
  var __streamContainerPattern = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
  var __streamResolutionPattern = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;

  function __extractStreamContainer(url) {
    var match = String(url || "").match(__streamContainerPattern);
    return match ? match[1].toLowerCase() : null;
  }

  function __extractStreamResolution(stream) {
    // Always regex-extracts just the resolution token instead of trusting
    // stream.quality verbatim when present -- some scrapers here set
    // quality to a whole descriptive string ("4k | BluRay | x265/HEVC"),
    // which used to pass straight through onto the card unfiltered.
    var text = (stream.quality || "") + " " + (stream.title || "") + " " + (stream.name || "");
    var match = text.match(__streamResolutionPattern);
    if (!match) return null;
    return match[1].toLowerCase() === "4k" ? "2160p" : match[1].toLowerCase();
  }

  function __formatByteSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n <= 0) return null;
    var units = ["B", "KB", "MB", "GB", "TB"];
    var value = n;
    var unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return (Math.round(value * 10) / 10) + " " + units[unitIndex];
  }

  // Some vendored scrapers here (VidEasy) put a whole multi-line
  // description into `size` instead of an actual file size. Only a short
  // "123 MB" / "1.5 GB" shaped string (or a raw byte number, handled above)
  // is trusted; anything else is dropped rather than shown verbatim.
  var __sizeStringPattern = /^\s*\d+(\.\d+)?\s*(B|KB|MB|GB|TB)\s*$/i;
  function __sanitizeSizeString(value) {
    if (typeof value !== "string") return null;
    return __sizeStringPattern.test(value) ? value.trim() : null;
  }

  // Nuvio's stream card renders `quality`/`size` directly, not `title` --
  // every provider here was setting `quality` to whatever raw, differently-
  // shaped string its own vendored scraper produced (a bare "1080p", or
  // "1080p | BluRay | x264/AVC", or an unformatted byte count in `size`),
  // which is why every provider's cards looked different from every other
  // provider's. `quality` now always becomes just the clean resolution
  // token already extracted above (or null), and `name` always becomes
  // just this provider's own display name instead of whatever descriptive
  // per-stream text the scraper happened to put there, so every provider
  // renders the same way: a fixed bold name, a clean quality • size line.
  function __applyStreamTemplate(stream) {
    var container = __extractStreamContainer(stream.url);
    var resolution = __extractStreamResolution(stream);
    var cached = stream.__cached === true || stream.cached === true;
    var parts = ["English", container, resolution].filter(Boolean);

    var out = {};
    for (var key in stream) if (Object.prototype.hasOwnProperty.call(stream, key)) out[key] = stream[key];
    out.name = (cached ? "\u26a1\ufe0f " : "") + __NUVIO_PROVIDER_NAME__;
    out.quality = resolution || null;
    out.size = typeof stream.size === "number" ? __formatByteSize(stream.size) : __sanitizeSizeString(stream.size);
    out.title = parts.length > 0 ? parts.join(" \u2022 ") : " ";
    return out;
  }

  // These vendored scrapers hand back every link they find, including
  // expired/geo-blocked embeds that never play. Latino's providers already
  // probe each candidate before returning it (see latino/src/providers/*);
  // English never did, so its cards looked more populated but were less
  // reliable to actually press play on. Mirrors the same Range/HEAD-based
  // playability probe here.
  var __streamProbeRangeBytes = 2048;
  var __streamProbeTimeoutMs = 1500;
  // Was 4. Nuvio itself runs up to 3 providers concurrently, and several of
  // this repo's own providers fan out 10-50+ of their own requests while
  // scraping a single title -- on a real device that adds up to enough
  // simultaneous open connections to be a plausible crash trigger. Lower
  // per-provider probe concurrency trades a little probing speed for a
  // meaningfully smaller connection/memory footprint at any given moment.
  var __streamProbeConcurrency = 2;
  var __hasTimers = typeof setTimeout === "function";

  function __fetchWithTimeout(url, options, timeoutMs) {
    var request = fetch(url, options);
    if (!__hasTimers) return request;
    var timeoutId;
    var timeout = new Promise(function (resolve, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error("Fetch timeout after " + timeoutMs + "ms: " + url));
      }, timeoutMs);
    });
    return Promise.race([request, timeout]).then(
      function (res) {
        clearTimeout(timeoutId);
        return res;
      },
      function (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    );
  }

  function __isHtmlProbeResponse(res, text) {
    var contentType = ((res.headers && res.headers.get && res.headers.get("content-type")) || "").toLowerCase();
    if (contentType.indexOf("text/html") !== -1) return true;
    return /^\s*<(!doctype|html)/i.test(text || "");
  }

  function __hasPlaylistEntries(body) {
    return body.indexOf("#EXT-X-STREAM-INF") !== -1 || body.indexOf("#EXTINF") !== -1;
  }

  function __firstPlaylistEntryUrl(body, manifestUrl) {
    var lines = String(body || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed.indexOf("#") === 0) continue;
      try {
        return new URL(trimmed, manifestUrl).toString();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // The raw CDN URLs these scrapers return are often hotlink-protected --
  // the actual player only gets through because it sends the Referer/
  // Origin/User-Agent the stream object carries in `headers`. Probing
  // without them produced false negatives (a real, playable 2160p VidEasy
  // stream 403'd on its segment host and was wrongly dropped) until this
  // was caught by comparing a probed-to-zero run against the same title
  // fetched with and without those headers. Every probe request below
  // merges them in, the same way the real player would.
  function __mergeProbeHeaders(extraHeaders, extra) {
    var headers = { Range: "bytes=0-" + (__streamProbeRangeBytes - 1) };
    if (extraHeaders) {
      for (var key in extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(extraHeaders, key)) headers[key] = extraHeaders[key];
      }
    }
    if (extra) {
      for (var key2 in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key2)) headers[key2] = extra[key2];
      }
    }
    return headers;
  }

  // Some CDNs (video-downloads.googleusercontent.com, seen on UHDMovies)
  // ignore the Range header entirely and respond 200 with the *whole* file
  // instead of 206 with just the requested slice. res.text() on that
  // response means buffering an entire multi-hundred-MB/GB video into a JS
  // string, which is what was actually causing English titles to spin
  // forever -- not a network hang, a probe silently trying to download the
  // whole movie before it could decide whether the movie was playable. Only
  // read the body when it's actually bounded: a real 206 (the Range was
  // honoured, so the body is just the requested slice) or a Content-Length
  // small enough to be a manifest/error page rather than a video file.
  var __streamProbeMaxBodyBytes = 2 * 1024 * 1024;
  function __shouldReadProbeBody(res) {
    if (res.status === 206) return true;
    var lengthHeader = res.headers && res.headers.get && res.headers.get("content-length");
    var length = lengthHeader ? parseInt(lengthHeader, 10) : NaN;
    return !isNaN(length) && length <= __streamProbeMaxBodyBytes;
  }

  function __probeHlsPlayback(body, manifestUrl, depth, extraHeaders) {
    var resourceUrl = __firstPlaylistEntryUrl(body, manifestUrl);
    if (!resourceUrl) return Promise.resolve(false);
    if (depth >= 1) {
      return __fetchWithTimeout(resourceUrl, { method: "HEAD", headers: extraHeaders || {} }, __streamProbeTimeoutMs)
        .then(function (res) { return [401, 403, 404, 410, 451].indexOf(res.status) === -1; })
        .catch(function () { return true; });
    }
    return __fetchWithTimeout(resourceUrl, { headers: __mergeProbeHeaders(extraHeaders) }, __streamProbeTimeoutMs)
      .then(function (res) {
        if (!res.ok && res.status !== 206) return false;
        if (!__shouldReadProbeBody(res)) return true;
        return res.text().then(function (text) {
          if (__isHtmlProbeResponse(res, text)) return false;
          if (__hasPlaylistEntries(text)) return __probeHlsPlayback(text, resourceUrl, depth + 1, extraHeaders);
          return text.length > 0;
        });
      })
      .catch(function () { return false; });
  }

  function __probeStreamPlayable(streamUrl, extraHeaders) {
    return __fetchWithTimeout(streamUrl, { headers: __mergeProbeHeaders(extraHeaders) }, __streamProbeTimeoutMs)
      .then(function (res) {
        if ([401, 403, 404, 410, 451].indexOf(res.status) !== -1) return false;
        if (!res.ok && res.status !== 206) return false;
        if (!__shouldReadProbeBody(res)) return true;
        return res.text().then(function (text) {
          if (__isHtmlProbeResponse(res, text)) return false;
          if (__hasPlaylistEntries(text)) return __probeHlsPlayback(text, streamUrl, 0, extraHeaders);
          return text.length > 0;
        });
      })
      .catch(function () { return false; });
  }

  // Nuvio's sandbox has no setTimeout/clearTimeout (see README), so a probe
  // fetch that never settles -- a blackholed CDN, a host that accepts the
  // connection and never answers -- can't be given a real timeout. Waiting
  // for every single item to settle before resolving meant one such stream
  // stalled this provider's getStreams() forever, leaving the whole English
  // list spinning with nothing shown. Once enough playable streams have
  // already been found to satisfy maxResults (the same cap __finalizeStreams
  // applies below), stop waiting on the rest -- their eventual results, if
  // any, are discarded rather than awaited.
  function __mapWithConcurrency(items, concurrency, worker, maxResults) {
    return new Promise(function (resolve) {
      if (items.length === 0) {
        resolve([]);
        return;
      }
      var results = [];
      var cursor = 0;
      var doneCount = 0;
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve(results);
      }
      function runNext() {
        while (cursor < items.length) {
          var index = cursor;
          cursor += 1;
          Promise.resolve()
            .then(function () { return worker(items[index], index); })
            .catch(function () { return null; })
            .then(function (result) {
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
      var runners = Math.max(1, Math.min(concurrency, items.length));
      for (var i = 0; i < runners; i += 1) runNext();
    });
  }

  // Caps this provider's own contribution to the merged stream list -- with
  // eight English providers each returning everything they find, the
  // combined list Nuvio shows can otherwise run into the dozens for one
  // title. Known resolutions sort first (higher first), everything else
  // keeps the order probing produced it in.
  var __maxStreamsPerProvider = 2;
  var __streamResolutionRankMap = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0 };
  function __finalizeStreams(streams) {
    return streams.filter(function (s) { return s != null; })
      .map(function (stream, index) { return { stream: stream, index: index }; })
      .sort(function (a, b) {
        var rankA = Object.prototype.hasOwnProperty.call(__streamResolutionRankMap, a.stream.quality) ? __streamResolutionRankMap[a.stream.quality] : -1;
        var rankB = Object.prototype.hasOwnProperty.call(__streamResolutionRankMap, b.stream.quality) ? __streamResolutionRankMap[b.stream.quality] : -1;
        if (rankA !== rankB) return rankB - rankA;
        return a.index - b.index;
      })
      .slice(0, __maxStreamsPerProvider)
      .map(function (entry) { return entry.stream; });
  }

  function __wrapGetStreams(original) {
    return function (tmdbId, mediaType, seasonNum, episodeNum) {
      return Promise.resolve(original(tmdbId, mediaType, seasonNum, episodeNum)).then(function (streams) {
        var templated = (streams || []).map(__applyStreamTemplate);
        return __mapWithConcurrency(templated, __streamProbeConcurrency, function (stream) { return __probeStreamPlayable(stream.url, stream.headers).then(function (playable) { return playable ? stream : null; }); }).then(__finalizeStreams);
      });
    };
  }

  if (typeof module !== "undefined" && module.exports && typeof module.exports.getStreams === "function") {
    module.exports.getStreams = __wrapGetStreams(module.exports.getStreams);
  } else if (typeof global !== "undefined" && typeof global.getStreams === "function") {
    global.getStreams = __wrapGetStreams(global.getStreams);
  }
})();

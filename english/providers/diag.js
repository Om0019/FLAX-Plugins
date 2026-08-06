// Built from src/providers/diag.js for the restricted runtime Nuvio's local-scraper
// sandbox provides -- do not hand-edit. Regenerate with:
//   npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/diag.js > english/providers/diag.js
// Edit src/providers/diag.js instead, then rebuild.
function checkFetch() {
  if (typeof fetch === "undefined") return Promise.resolve("fetch is undefined");
  return Promise.resolve("fetch is available");
}
function checkAbortController() {
  return Promise.resolve(
    typeof AbortController === "undefined" ? "AbortController is undefined" : "AbortController is available"
  );
}
function checkRequire(moduleName) {
  var mod;
  try {
    mod = require(moduleName);
  } catch (error) {
    return Promise.resolve("require(" + moduleName + ") threw: " + error.message);
  }
  if (!mod) return Promise.resolve("require(" + moduleName + ") returned falsy");
  return Promise.resolve(
    "require(" + moduleName + ") OK, has load(): " + (typeof mod.load === "function")
  );
}
function checkUrl(label, url) {
  if (typeof fetch === "undefined") return Promise.resolve(label + ": no fetch");
  return fetch(url).then(function(res) {
    return res.text().then(function(text) {
      return label + ": HTTP " + res.status + ", " + text.length + ' bytes, starts "' + text.slice(0, 40).replace(/\s+/g, " ") + '"';
    });
  }).catch(function(error) {
    return label + ": FETCH ERROR: " + (error && error.message);
  });
}
function safe(promiseFn) {
  return Promise.resolve().then(promiseFn).catch(function(error) {
    return "CHECK THREW: " + (error && error.message);
  });
}
function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}
var SIGNAL_PROBE_URL = "https://api.themoviedb.org/3/movie/603/external_ids?api_key=af3fa2d2239e9d0e6c04a1076d3df76f";
function checkFetchWithSignal() {
  if (typeof AbortController === "undefined") return Promise.resolve("no AbortController");
  var controller = new AbortController();
  var timeoutId = setTimeout(function() {
    controller.abort();
  }, 2e4);
  return fetch(SIGNAL_PROBE_URL, { signal: controller.signal }).then(function(res) {
    return res.text().then(function(text) {
      clearTimeout(timeoutId);
      return "OK, HTTP " + res.status + ", " + text.length + " bytes";
    });
  }).catch(function(error) {
    clearTimeout(timeoutId);
    return "FAILED: name=" + (error && error.name) + " message=" + (error && error.message);
  });
}
function checkGlobals() {
  var parts = [
    "setTimeout=" + typeof setTimeout,
    "clearTimeout=" + typeof clearTimeout,
    "setInterval=" + typeof setInterval,
    "AbortController=" + typeof AbortController,
    "URL=" + typeof URL,
    "URLSearchParams=" + typeof URLSearchParams,
    "TextDecoder=" + typeof TextDecoder,
    "atob=" + typeof atob,
    "btoa=" + typeof btoa,
    "Promise.allSettled=" + (typeof Promise !== "undefined" ? typeof Promise.allSettled : "no-Promise"),
    "Promise.race=" + (typeof Promise !== "undefined" ? typeof Promise.race : "no-Promise")
  ];
  return Promise.resolve(parts.join(" "));
}
function checkFetchWithoutSignal() {
  return fetch(SIGNAL_PROBE_URL).then(function(res) {
    return res.text().then(function(text) {
      return "OK, HTTP " + res.status + ", " + text.length + " bytes";
    });
  }).catch(function(error) {
    return "FAILED: name=" + (error && error.name) + " message=" + (error && error.message);
  });
}
var AIOSTREAMS_BASE_URL = "https://aiostreamsfortheweebsstable.midnightignite.me/api/v1/search";
var AIOSTREAMS_UUID = "4b990cd7-9058-41f6-a099-224272656e63";
var AIOSTREAMS_PASSWORD = "Jason001$";
var TMDB_API_KEY = "af3fa2d2239e9d0e6c04a1076d3df76f";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function stringToBase64(str) {
  var bytes = [];
  for (var i = 0; i < str.length; i += 1) bytes.push(str.charCodeAt(i) & 255);
  var out = "";
  for (var j = 0; j < bytes.length; j += 3) {
    var b0 = bytes[j];
    var b1 = j + 1 < bytes.length ? bytes[j + 1] : void 0;
    var b2 = j + 2 < bytes.length ? bytes[j + 2] : void 0;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[(b0 & 3) << 4 | (b1 === void 0 ? 0 : b1 >> 4)];
    out += b1 === void 0 ? "=" : BASE64_CHARS[(b1 & 15) << 2 | (b2 === void 0 ? 0 : b2 >> 6)];
    out += b2 === void 0 ? "=" : BASE64_CHARS[b2 & 63];
  }
  return out;
}
function realAiostreamsFlow(tmdbId, mediaType, seasonNum, episodeNum) {
  var tmdbType = mediaType === "tv" ? "tv" : "movie";
  var tmdbUrl = TMDB_BASE_URL + "/" + tmdbType + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;
  return fetch(tmdbUrl).then(function(res) {
    return res.text().then(function(text) {
      var data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
      }
      if (!res.ok || !data || !data.imdb_id) {
        return "TMDB lookup for " + tmdbType + "/" + tmdbId + " -> HTTP " + res.status + ', no imdb_id, body starts "' + text.slice(0, 80) + '"';
      }
      var imdbId = data.imdb_id;
      var searchType = mediaType === "tv" ? "series" : "movie";
      var id = searchType === "series" ? imdbId + ":" + (seasonNum || 1) + ":" + (episodeNum || 1) : imdbId;
      var searchUrl = AIOSTREAMS_BASE_URL + "?type=" + searchType + "&id=" + encodeURIComponent(id);
      var authHeader = "Basic " + stringToBase64(AIOSTREAMS_UUID + ":" + AIOSTREAMS_PASSWORD);
      return fetch(searchUrl, { headers: { Authorization: authHeader, Accept: "application/json" } }).then(function(aioRes) {
        return aioRes.text().then(function(aioText) {
          var aioData = null;
          try {
            aioData = JSON.parse(aioText);
          } catch (e) {
          }
          var resultCount = aioData && aioData.success && aioData.data && Array.isArray(aioData.data.results) ? aioData.data.results.length : "n/a";
          return "imdb_id=" + imdbId + ", AIOStreams HTTP " + aioRes.status + ", success=" + (aioData && aioData.success) + ", resultCount=" + resultCount + ', body starts "' + aioText.slice(0, 120) + '"';
        });
      }).catch(function(error) {
        return "imdb_id=" + imdbId + ", AIOStreams FETCH ERROR: " + (error && error.message);
      });
    });
  }).catch(function(error) {
    return "TMDB FETCH ERROR: " + (error && error.message);
  });
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var checks = [
    { name: "runtime", fn: function() {
      return Promise.resolve("typeof global=" + typeof global + " HermesInternal=" + (typeof HermesInternal !== "undefined"));
    } },
    { name: "fetch", fn: checkFetch },
    { name: "AbortController", fn: checkAbortController },
    { name: "require(cheerio-without-node-native)", fn: function() {
      return checkRequire("cheerio-without-node-native");
    } },
    { name: "require(cheerio)", fn: function() {
      return checkRequire("cheerio");
    } },
    { name: "tmdb key af3fa2..", fn: function() {
      return checkUrl("tmdb af3fa2..", "https://api.themoviedb.org/3/movie/603/external_ids?api_key=af3fa2d2239e9d0e6c04a1076d3df76f");
    } },
    { name: "tmdb key 439c47..", fn: function() {
      return checkUrl("tmdb 439c47..", "https://api.themoviedb.org/3/movie/603/external_ids?api_key=439c478a771f35c05022f9feabcca01c");
    } },
    { name: "aiostreams", fn: function() {
      return checkUrl("aiostreams", "https://aiostreamsfortheweebsstable.midnightignite.me/api/v1/search?type=movie&id=tt0133093");
    } },
    { name: "sololatino", fn: function() {
      return checkUrl("sololatino", "https://sololatino.net/");
    } },
    { name: "args", fn: function() {
      return Promise.resolve("tmdbId=" + tmdbId + " mediaType=" + mediaType + " season=" + seasonNum + " episode=" + episodeNum);
    } },
    { name: "real aiostreams flow", fn: function() {
      return realAiostreamsFlow(tmdbId, mediaType, seasonNum, episodeNum);
    } },
    { name: "fetch WITH signal", fn: checkFetchWithSignal },
    { name: "fetch WITHOUT signal", fn: checkFetchWithoutSignal },
    { name: "globals", fn: checkGlobals }
  ];
  return Promise.all(
    checks.map(function(check) {
      return safe(check.fn).then(function(result) {
        return oneLine(check.name + " :: " + result);
      });
    })
  ).then(function(lines) {
    return lines.map(function(line, i) {
      var padded = i < 10 ? "0" + i : "" + i;
      return {
        name: padded + " " + line,
        title: padded + " " + line,
        url: "https://example.com/diag-not-playable-" + i + ".mp4",
        quality: null,
        size: null
      };
    });
  });
}
module.exports = { getStreams };

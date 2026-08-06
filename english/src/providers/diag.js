// Temporary diagnostic scraper. Not a real stream source -- runs a handful
// of environment/network checks in whatever runtime actually calls
// getStreams (i.e. the real Nuvio app, not a Node.js sandbox) and reports
// each result as a fake "stream" title so it's readable straight from the
// app's source list without needing device logs.
//
// Safe to select for any movie/show; nothing it returns is playable, every
// url is a harmless placeholder. Remove this file and its manifest.json
// entry once the real issue is found.

function checkFetch() {
  if (typeof fetch === 'undefined') return Promise.resolve('fetch is undefined');
  return Promise.resolve('fetch is available');
}

function checkAbortController() {
  return Promise.resolve(
    typeof AbortController === 'undefined'
      ? 'AbortController is undefined'
      : 'AbortController is available'
  );
}

function checkRequire(moduleName) {
  var mod;
  try {
    mod = require(moduleName);
  } catch (error) {
    return Promise.resolve('require(' + moduleName + ') threw: ' + error.message);
  }
  if (!mod) return Promise.resolve('require(' + moduleName + ') returned falsy');
  return Promise.resolve(
    'require(' + moduleName + ') OK, has load(): ' + (typeof mod.load === 'function')
  );
}

function checkUrl(label, url) {
  if (typeof fetch === 'undefined') return Promise.resolve(label + ': no fetch');
  return fetch(url)
    .then(function (res) {
      return res.text().then(function (text) {
        return label + ': HTTP ' + res.status + ', ' + text.length + ' bytes, starts "' + text.slice(0, 40).replace(/\s+/g, ' ') + '"';
      });
    })
    .catch(function (error) {
      return label + ': FETCH ERROR: ' + (error && error.message);
    });
}

function safe(promiseFn) {
  return Promise.resolve()
    .then(promiseFn)
    .catch(function (error) {
      return 'CHECK THREW: ' + (error && error.message);
    });
}

function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var checks = [
    { name: 'runtime', fn: function () { return Promise.resolve('typeof global=' + typeof global + ' HermesInternal=' + (typeof HermesInternal !== 'undefined')); } },
    { name: 'fetch', fn: checkFetch },
    { name: 'AbortController', fn: checkAbortController },
    { name: 'require(cheerio-without-node-native)', fn: function () { return checkRequire('cheerio-without-node-native'); } },
    { name: 'require(cheerio)', fn: function () { return checkRequire('cheerio'); } },
    { name: 'tmdb key af3fa2..', fn: function () { return checkUrl('tmdb af3fa2..', 'https://api.themoviedb.org/3/movie/603/external_ids?api_key=af3fa2d2239e9d0e6c04a1076d3df76f'); } },
    { name: 'tmdb key 439c47..', fn: function () { return checkUrl('tmdb 439c47..', 'https://api.themoviedb.org/3/movie/603/external_ids?api_key=439c478a771f35c05022f9feabcca01c'); } },
    { name: 'aiostreams', fn: function () { return checkUrl('aiostreams', 'https://aiostreamsfortheweebsstable.midnightignite.me/api/v1/search?type=movie&id=tt0133093'); } },
    { name: 'sololatino', fn: function () { return checkUrl('sololatino', 'https://sololatino.net/'); } },
    { name: 'args', fn: function () { return Promise.resolve('tmdbId=' + tmdbId + ' mediaType=' + mediaType + ' season=' + seasonNum + ' episode=' + episodeNum); } }
  ];

  return Promise.all(
    checks.map(function (check) {
      return safe(check.fn).then(function (result) {
        return oneLine(check.name + ' :: ' + result);
      });
    })
  ).then(function (lines) {
    return lines.map(function (line, i) {
      var padded = i < 10 ? '0' + i : '' + i;
      return {
        name: padded + ' ' + line,
        title: padded + ' ' + line,
        url: 'https://example.com/diag-not-playable-' + i + '.mp4',
        quality: null,
        size: null
      };
    });
  });
}

module.exports = { getStreams };

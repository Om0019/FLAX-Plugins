/**
 * Runs a provider in a context approximating Nuvio's local-scraper sandbox,
 * so environment bugs surface here instead of only on a device.
 *
 * Plain `node provider.js` is not a valid test: Node has timers, a fetch that
 * honours AbortSignal, and resolves `cheerio` -- all things the real sandbox
 * lacks -- so a broken provider passes locally and returns nothing in the app.
 * This context supplies only what an on-device probe confirmed is present
 * (fetch, console, require, Promise, AbortController, URL, URLSearchParams,
 * TextDecoder, atob, btoa) and deliberately omits the timer globals.
 *
 * `fetch` is passed through from the host realm, so it keeps working even
 * though the sandbox itself has no timers -- it closes over the host's.
 *
 * Usage:
 *   node tools/run-in-sandbox.js <provider.js> [tmdbId] [movie|tv] [season] [episode]
 *
 * Examples:
 *   node tools/run-in-sandbox.js english/providers/aiostreams.js 27205 movie
 *   node tools/run-in-sandbox.js latino/providers/cuevana3i.js 603 movie
 *   node tools/run-in-sandbox.js latino/providers/tlnovelas.js 31586 tv 1 1
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const [, , providerArg, tmdbIdArg, mediaTypeArg, seasonArg, episodeArg] = process.argv;

if (!providerArg) {
  console.error('usage: node tools/run-in-sandbox.js <provider.js> [tmdbId] [movie|tv] [season] [episode]');
  process.exit(1);
}

const providerPath = path.resolve(providerArg);
const code = fs.readFileSync(providerPath, 'utf8');

const sandbox = {
  fetch: globalThis.fetch,
  console,
  Promise,
  AbortController,
  URL,
  URLSearchParams,
  TextDecoder,
  atob: globalThis.atob,
  btoa: globalThis.btoa,
  module: { exports: {} },
  // The sandbox exposes cheerio only under this name; map it to whatever the
  // repo has installed so the provider's own require works unchanged.
  require: (name) => {
    if (name === 'cheerio-without-node-native' || name === 'cheerio') {
      return require(path.join(__dirname, '..', 'node_modules', 'cheerio'));
    }
    return require(name);
  },
};
sandbox.exports = sandbox.module.exports;
sandbox.global = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: providerPath });

for (const name of ['setTimeout', 'clearTimeout', 'setInterval']) {
  if (vm.runInContext(`typeof ${name}`, sandbox) !== 'undefined') {
    console.error(`sandbox is wrong: ${name} leaked into the context`);
    process.exit(1);
  }
}

const { getStreams } = sandbox.module.exports;
if (typeof getStreams !== 'function') {
  console.error(`${providerArg} does not export getStreams`);
  process.exit(1);
}

const tmdbId = tmdbIdArg || '27205';
const mediaType = mediaTypeArg || 'movie';
const season = seasonArg ? Number(seasonArg) : undefined;
const episode = episodeArg ? Number(episodeArg) : undefined;

console.log(`${providerArg} <- tmdbId=${tmdbId} mediaType=${mediaType}` +
  (season ? ` season=${season} episode=${episode}` : '') + ' (no timers)');

getStreams(tmdbId, mediaType, season, episode)
  .then((streams) => {
    console.log(`RESULT ${Array.isArray(streams) ? streams.length : 'non-array'} stream(s)`);
    (streams || []).slice(0, 5).forEach((s) => console.log(`  - ${s.name} | ${s.title}`));
  })
  .catch((error) => {
    console.log(`THREW: ${error && error.message}`);
    process.exitCode = 1;
  });

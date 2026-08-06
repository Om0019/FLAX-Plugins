# Nuvio addon (English)

A [Nuvio Streams](https://github.com/tapframe/NuvioStreamingApp) local-scraper
repository for English-language movies and series, vendored from this repo's
`Latino-Addon/english-addon` Stremio addon.

## What this is

Unlike the Latino providers in `../latino/`, these files needed almost no
porting. `english-addon/providers/*.js` are already unmodified Nuvio
local-scraper plugins from the
[All-in-One-Nuvio](https://github.com/D3adlyRocket/All-in-One-Nuvio) repo —
obfuscated, but plain CommonJS modules exporting
`getStreams(tmdbId, mediaType, seasonNum, episodeNum)`, built for exactly the
restricted sandbox (no Node built-ins, no `async`/`await`) this repository
targets. The Stremio addon runs them in ordinary Node as a convenience; this
folder is those same files pointed at directly by Nuvio.

## Adding it to Nuvio

In the Nuvio app: Settings → Local Scrapers → add repository URL pointing at
this folder's raw `manifest.json`.

## Patched providers

Providers ship here with the same source patches the Stremio addon applies
at load time (`english-addon/src/providers/index.js`), baked in statically
since Nuvio has no load-time patching mechanism:

- **Peachify** — per-server timeout cut from 15s to 6s so its three
  responsive mirrors return before a normal request budget expires. Also
  fixed a `ReferenceError: window is not defined` crash on every call: the
  bundled node-forge's global-detection fallback assumed a browser whenever
  `process`/`self` weren't present, which is exactly this sandbox.
- **HDHub4u** — its first-result fallback (used when the scorer finds no
  confident match) now requires 75% title-token coverage, fixing wrong
  matches like "P.S. I Love You" for "I Love You Phillip Morris".
- **Castle** — its title matcher now requires the same 75% token-coverage
  check instead of a loose substring match, and no longer rejects
  single-word titles outright (the check required at least 2 significant
  tokens, so "Inception" or "Barbie" could never match anything, full stop).

**Castle and HDHub4u also carry a pure-JS `crypto-js` shim.** Both call
`require("crypto-js")` for AES-CBC decryption (Castle: its entire API
response format; HDHub4u: one of its player extractors) — an npm package
Nuvio's sandbox can't resolve, so it crashed at module-load time for
HDHub4u (the whole provider failed to register) and on first use for Castle
(caught, but every call returned zero streams). Both files now start with
an injected block that reimplements the exact `crypto-js` surface they call
(`AES.decrypt` in CBC/PKCS7 mode, `WordArray`, and the `Base64`/`Utf8`/`Hex`
encoders) in pure JS and shadows `require` so their existing
`require("crypto-js")` calls transparently receive it instead. The AES
engine itself is the same construction as the Latino embed69 decryptor
(`latino/src/providers/sololatino.js`), generalized to also support
AES-128 (the key size these two use), and was verified against the real
`crypto-js` package for randomized round-trips -- including each file's own
key-derivation shape -- before being wired in. Confirmed end-to-end against
the live sites via `tools/run-in-sandbox.js` (both now return real streams
for movies and TV instead of crashing or returning nothing).

## Playability probing, ordering, and list size

Every provider here (the 8 vendored scrapers via an appended wrapper, plus
`aiostreams.js`) now probes each candidate link with a Range/HEAD request
before returning it — mirroring the same check the Latino providers already
ran — and drops anything that comes back 401/403/404/410/451, is actually an
HTML error page, or an HLS manifest whose first segment doesn't check out.
Streams that survive are capped at 2 per provider (known resolution sorted
first, so a 1080p result beats an unlabeled one) instead of returning
everything a scraper found, so a title with several working sources doesn't
turn into dozens of cards. `AIOStreams` is also listed first in
`manifest.json` so its results are the first Nuvio shows when it resolves,
and within its own 2 it sorts already-cached (instantly playable) links
ahead of uncached ones.

Because the sandbox has no timers (above), a probed candidate that never
settles — a blackholed CDN, a host that accepts the connection and never
answers — used to leave the whole provider's `getStreams()` waiting forever,
since the original concurrency helper only resolved once every candidate had
settled. That surfaced as the whole English list spinning indefinitely with
nothing shown. Every provider's probing helper now resolves as soon as it
has already found enough playable streams to fill its 2-per-provider cap,
instead of waiting on stragglers that may never finish.

## Disabled providers

`VidLink`, `VidFast` and `VidSrc` are present but disabled in
`manifest.json`, carried over from the Stremio addon's own findings: each
was verified to return 0 streams repeatedly (a CDN-side proxy gate, stale
decryption key material, and a scraper returning nothing past its RCP
resolution step, respectively — see each entry's `description` in
`manifest.json` for specifics).

## AIOStreams

`providers/aiostreams.js` is a from-scratch port (not vendored — the source
addon's `aiostreams.js` isn't a Nuvio-shaped `getStreams` module) of the
provider that replaced Torrentio in the source addon
(`Latino-Addon` PR #35). It queries a configured AIOStreams instance's
`/api/v1/search` endpoint over HTTP Basic Auth and returns whatever
debrid-backed links that instance has cached, resolved via TMDB
`external_ids` since Nuvio hands this file a tmdbId but AIOStreams is keyed
on IMDb id.

**Its UUID and password are hardcoded in the file itself.** Nuvio's
local-scraper sandbox has no environment-variable mechanism, unlike the
source addon (which reads `AIOSTREAMS_UUID`/`AIOSTREAMS_PASSWORD` from
`process.env` with those same values as fallback defaults). Since Nuvio
loads scrapers from a raw file URL, treat this repository as sensitive if
those credentials should stay private — anyone who can fetch
`providers/aiostreams.js`'s raw contents can read them.

`src/providers/aiostreams.js` is the hand-authored, readable source;
`providers/aiostreams.js` is a built artifact -- Nuvio's sandbox targets
ES2016, unlike the already-restricted-target vendored providers above.
Rebuild after editing the source with:

```
npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/aiostreams.js > providers/aiostreams.js
```

Torrentio itself (the old `torrentio.js` vendored file) is not included:
even before AIOStreams replaced it, it wasn't run via its own `getStreams` —
the source addon fetched `torrentio.strem.fun` directly using a debrid
provider (TorBox) API key, a fundamentally different shape than a
self-contained Nuvio local scraper.

## Diagnostics

`src/providers/diag.js` is kept deliberately unbuilt and out of
`manifest.json` — it is not a stream source. It probes the sandbox from
inside the running app (which globals exist, whether `fetch` honours an
AbortSignal, whether cheerio resolves, whether TMDB/AIOStreams are
reachable) and reports each result as a fake, non-playable stream title,
so the answers are readable from Nuvio's own source list without device
logs. It is what identified the missing `setTimeout` documented in the
root README.

To use it again: build it like any other provider and add an entry
pointing at `providers/diag.js`, then remove both when done.

For most problems, reach for `tools/run-in-sandbox.js` at the repo root
first — it reproduces the sandbox locally (no timers) and needs no
device.

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

Three providers ship here with the same source patches the Stremio addon
applies at load time (`english-addon/src/providers/index.js`), baked in
statically since Nuvio has no load-time patching mechanism:

- **Peachify** — per-server timeout cut from 15s to 6s so its three
  responsive mirrors return before a normal request budget expires.
- **HDHub4u** — its first-result fallback (used when the scorer finds no
  confident match) now requires 75% title-token coverage, fixing wrong
  matches like "P.S. I Love You" for "I Love You Phillip Morris".
- **Castle** — its title matcher now requires the same 75% token-coverage
  check instead of a loose substring match.

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
`providers/aiostreams.js` is a built artifact -- Nuvio's sandbox runs on
Hermes targeting ES2016, which doesn't understand the object spread
(`{...x}`, ES2018) the source file uses, unlike the already-restricted-target
vendored providers above. Rebuild after editing the source with:

```
npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/aiostreams.js > providers/aiostreams.js
```

Torrentio itself (the old `torrentio.js` vendored file) is not included:
even before AIOStreams replaced it, it wasn't run via its own `getStreams` —
the source addon fetched `torrentio.strem.fun` directly using a debrid
provider (TorBox) API key, a fundamentally different shape than a
self-contained Nuvio local scraper.

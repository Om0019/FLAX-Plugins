# Nuvio addon (Latino)

A [Nuvio Streams](https://github.com/tapframe/NuvioStreamingApp) local-scraper
port of the Latino Stremio addon's ten Spanish-language sources, kept as a
separate, independent addon in this repo.

## What this is

Nuvio's local-scraper model is different from Stremio's: there's no server
and no manifest HTTP endpoint. Nuvio loads each `providers/*.js` directly
and calls `getStreams(tmdbId, mediaType, seasonNum, episodeNum)` on it, which
must return a Promise resolving to an array of stream objects. `manifest.json`
here is a *repository* manifest — the thing you point Nuvio's Settings →
Local Scrapers at — not a Stremio addon manifest.

## Adding it to Nuvio

In the Nuvio app: Settings → Local Scrapers → add repository URL pointing at
this folder's raw `manifest.json`, e.g.

```
https://raw.githubusercontent.com/Om0019/FLAX-Plugins/main/latino/manifest.json
```

(The English providers are a separate repository entry:
`https://raw.githubusercontent.com/Om0019/FLAX-Plugins/main/english/manifest.json`.
Adding one does not add the other.)

## Scope and known limitation

This is a from-scratch port, not a shared module — Nuvio's sandbox has no
Node built-ins (`crypto`, `Buffer`, `fs`) and no `async`/`await`, so nothing
here can `require('../src/...')`. Everything the scraper needs (HTTP fetch
with timeouts, a TTL cache, TMDB lookup, the SoloLatino search/match/session
flow, and the generic iframe-unpacking logic from `src/unpacker.js`) is
reimplemented in the single file `providers/sololatino.js`, using Promise
chains instead of async/await and hand-written base64 helpers instead of
`Buffer`.

**embed69 is implemented, from scratch, in pure JS.** `src/unpacker.js`
decrypts embed69's player links with AES-256-CBC, keyed by a SHA-256
proof-of-work — real cryptographic primitives that need `crypto`, which this
sandbox doesn't have (and `node-forge`-style libraries fail here too, since
they still assume a Node/browser environment). `providers/sololatino.js`
implements both SHA-256 and AES-256 decrypt from their definitions — the AES
S-box is generated from its algebraic definition (GF(2^8) multiplicative
inverse + the standard affine map) rather than transcribed from a 256-entry
table — and verified against Node's own `crypto` before being wired in:
SHA-256 against empty/short/long/unicode input and 200 randomized strings;
AES-256-CBC against 100 randomized encrypt-with-Node/decrypt-with-this
round-trips, plus the exact `IV‖ciphertext`/base64 shape embed69 uses,
end-to-end through a synthetic embed69 page. The proof-of-work search runs
in chunks, yielding via a microtask hop between them so it doesn't fully
monopolise the JS thread, and is capped (difficulty 5, 8s) rather than
attempted unbounded — the cap is lower than the original addon's, since a
pure-JS hash is measured at roughly a third of native `crypto`'s throughput
in this environment.

Filemoon (AES-GCM, and per the original code's own findings gated behind a
captcha on nearly every file anyway) and the Pelisplus mirrors (a different
AES-CBC key/API shape) remain stubbed — implementing either would follow the
same pattern as embed69 above. Everything else from `src/unpacker.js` — Dean
Edwards `eval` unpacking, VOE, Dood, Streamtape, Nupload, MediaFire,
VidGuard, Xupalace multi-server pages, JS-redirect and iframe chasing — is
ported and working.

## Build step

`src/providers/*.js` are the hand-authored, readable sources. Nuvio's
sandbox targets ES2016, so the versions actually loaded by Nuvio live in
`providers/*.js`, built from `src/providers/*.js` with:

```
npx esbuild@0.28.1 --target=es2016 --format=cjs --platform=neutral src/providers/<name>.js > providers/<name>.js
```

Edit `src/providers/<name>.js`, then rebuild before committing -- never
hand-edit `providers/<name>.js` directly, it will be overwritten.

## Testing

Plain `node providers/<name>.js` is not a sufficient test -- Node has
timers and a signal-honouring fetch, so a provider that cannot run in
Nuvio still passes locally. Use the sandbox harness at the repo root,
which omits the timer globals the app also lacks:

```
node tools/run-in-sandbox.js latino/providers/cuevana3i.js 603 movie
node tools/run-in-sandbox.js latino/providers/tlnovelas.js 31586 tv 1 1
```

See the root README for the full list of what the sandbox does and
doesn't provide.

## Adding another scraper

All ten sources from the Stremio addon are ported: sololatino, cuevana3i,
cinecalidad, cinehdplus, tioplus, lamovie, pelispedia, tlnovelas,
novelas360 and ennovelas. Anything new follows the same pattern — pull in
only what that scraper needs from the addon's `src/scrapers/common.js` and
`src/unpacker.js`, convert async/await to Promise chains, export
`getStreams`, guard any timer use (see the root README), build it, then
add an entry to `manifest.json`.

# FLAX-Plugin

Two [Nuvio Streams](https://github.com/tapframe/NuvioStreamingApp) local-scraper
repositories:

- **[latino/](latino/)** — Spanish-dubbed/subtitled movies and series.
- **[english/](english/)** — English movies and series, including a
  debrid-backed AIOStreams provider.

Each has its own `manifest.json` and `README.md`. In Nuvio: Settings → Local
Scrapers → add a repository URL pointing at the raw `manifest.json` of
whichever one you want (e.g.
`https://raw.githubusercontent.com/<owner>/<repo>/main/latino/manifest.json`).

Ported from [Latino-Addon](https://github.com/Om0019/latino)'s Stremio
addons (`nuvio-addon/` and `english-addon/`).

## Nuvio's sandbox: what is and isn't available

Measured from inside the running app (an on-device probe reporting
`typeof` for each global), not assumed:

| Available | Missing |
| --- | --- |
| `fetch`, `console`, `require` | **`setTimeout`** |
| `Promise` (incl. `race`, `allSettled`) | **`clearTimeout`** |
| `AbortController` | **`setInterval`** |
| `URL`, `URLSearchParams` | Node built-ins (`fs`, `crypto`, `Buffer`, `http`) |
| `TextDecoder`, `atob`, `btoa` | |

Two of these cost several rounds of misdiagnosis, so they are worth
stating plainly:

- **There are no timers.** `setTimeout` is not defined. A bare call throws
  `'setTimeout' is not defined`, and because `getStreams` implementations
  typically catch everything and return `[]`, the failure surfaces only as
  "No streams found" — never as an error. Any helper that reaches for a
  timer must guard on `typeof setTimeout === 'function'` first. This is
  the single most likely reason a provider that works under `node` returns
  nothing in the app.
- **`AbortController` exists but `fetch` does not honour its signal.**
  Passing `signal` to `fetch` makes the request fail. Use it only as a
  plain event target to race against, never as a `fetch` option.

Other constraints:

- **HTML parsing** is `require('cheerio-without-node-native')`, *not*
  `require('cheerio')` — the wrong name throws and leaves the binding
  `undefined`.
- **Syntax** must be ES2016 or older; source files here are transpiled
  with esbuild (see each folder's README for the exact command).
- **Testing under plain `node` is not sufficient** — Node has timers, a
  signal-honouring `fetch`, and resolves `cheerio` — so all four issues
  above pass locally and fail in the app. To reproduce the real
  environment, run a provider in a `vm` context that supplies only
  `fetch`/`console`/`require` and deliberately omits the timer globals.

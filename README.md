<div align="center">
  <br />
  <h1>🔌 FLAX-Plugins</h1>
  <p>
    <strong>A high-performance collection of local-scraper plugins for Nuvio Streams.</strong>
  </p>
  <br />

  <p>
    <a href="https://github.com/tapframe/NuvioStreamingApp"><img src="https://img.shields.io/badge/Platform-Nuvio-blue.svg?style=flat-square" alt="Platform"></a>
    <a href="#license"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License"></a>
  </p>
</div>

<hr />

## 📖 Overview

**FLAX-Plugins** contains two specialized local-scraper repositories designed to be natively integrated with [Nuvio Streams](https://github.com/tapframe/NuvioStreamingApp).

- 🌍 **[latino/](latino/)** — Spanish-dubbed and subtitled movies and series.
- 🇬🇧 **[english/](english/)** — English movies and series, including a debrid-backed AIOStreams provider.

These scrapers have been seamlessly ported from the Stremio addons ecosystem (`nuvio-addon/` and `english-addon/`).

---

## 🚀 Installation & Usage in Nuvio

Each plugin directory comes with its own `manifest.json` and internal documentation.

1. Open Nuvio and navigate to **Settings → Local Scrapers**.
2. Add a repository URL pointing at the raw `manifest.json` of whichever plugin you want to use.

**Example URL:**
```text
https://raw.githubusercontent.com/<owner>/<repo>/main/latino/manifest.json
```

---

## 🛠️ Nuvio's Sandbox Constraints

When contributing or debugging, please note that Nuvio's local execution sandbox differs significantly from a standard Node.js environment. 

### What is Available:
✅ `fetch`, `console`, `require`
✅ `Promise` (incl. `race`, `allSettled`)
✅ `AbortController`
✅ `URL`, `URLSearchParams`
✅ `TextDecoder`, `atob`, `btoa`

### What is Missing:
❌ `setTimeout` & `setInterval`
❌ `clearTimeout`
❌ Node built-ins (`fs`, `crypto`, `Buffer`, `http`)

### Critical Gotchas for Developers

1. **No Timers Allowed!** `setTimeout` is simply not defined. A bare call throws `'setTimeout' is not defined`. Because `getStreams` implementations typically catch everything and return `[]`, this failure often surfaces silently as "No streams found". Always check `typeof setTimeout === 'function'` before using it!
2. **`AbortController` quirks**: `fetch` does not honour its signal. Passing `signal` to `fetch` will make the request fail. Use it only as a plain event target to race against.
3. **HTML Parsing**: Use `require('cheerio-without-node-native')` instead of `require('cheerio')`.
4. **Syntax Restrictions**: Code must be ES2016 or older. Source files here are transpiled with esbuild.

> ⚠️ **Note**: Testing under plain `node` is not sufficient, as Node provides timers and resolves `cheerio`. Always test your provider in a `vm` context simulating the actual constraints!

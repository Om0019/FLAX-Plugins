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

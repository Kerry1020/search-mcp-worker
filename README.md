# search-mcp-worker

A Cloudflare Worker exposing an MCP server for **39 multi-engine search tools** — no API keys required.

Covers: web search, academic papers, developer forums, social media, news, books, music, maps, knowledge bases, package registries, SEC filings, and more.

## MCP Tools (39 total)

### 🔍 Web Search (9)

| Tool | Description |
|------|-------------|
| `search_auto` | Multi-engine auto-fallback. Returns first useful result set. Cached 5 min. |
| `search_duckduckgo` | DuckDuckGo HTML search. Supports region codes (`de-de`, `fr-fr`, `jp-jp`). |
| `search_bing` | Bing HTML search. |
| `search_yahoo` | Yahoo HTML search. |
| `search_google_web` | Google web search. May be rate-limited. |
| `search_baidu` | Baidu search for Chinese results. |
| `search_sogou` | Sogou search for Chinese results. |
| `search_naver` | Naver search for Korean results. |
| `search_yandex` | Yandex multi-language search. |

### 📚 Academic & Research (4)

| Tool | Description |
|------|-------------|
| `search_arxiv` | arXiv preprints. Returns titles, authors, abstracts, PDF links. |
| `search_pubmed` | PubMed biomedical literature. Two-step esearch→efetch. |
| `search_crossref` | CrossRef DOI search. Returns titles, authors, years, DOIs. |
| `search_paperswithcode` | ML/AI papers with code implementations. |

### 💻 Developer & Code (5)

| Tool | Description |
|------|-------------|
| `search_hackernews` | Hacker News via Algolia. Tech discussions, startup news. |
| `search_stackoverflow` | All StackExchange sites (`site` param: stackoverflow, math, physics, etc.). |
| `search_npm` | npm package search. Returns names, versions, descriptions. |
| `search_devto` | Dev.to developer blog posts. |
| `search_github_repos` | GitHub repository search. |

### 📱 Social & Video (3)

| Tool | Description |
|------|-------------|
| `search_reddit` | Reddit posts. Optional subreddit filter. |
| `search_mastodon` | Fediverse posts. Supports any instance. |
| `search_peertube` | PeerTube videos across the fediverse. |

### 📰 News & Media (2)

| Tool | Description |
|------|-------------|
| `search_bbc` | BBC News articles. |
| `search_bing_news` | Bing News headlines. |

### 📖 Reference & Media (4)

| Tool | Description |
|------|-------------|
| `search_wikipedia` | Wikipedia page summaries. |
| `search_wiktionary` | Word definitions, etymology, translations. Supports language codes. |
| `search_openlibrary` | Book search by title/author/ISBN. Returns cover URLs. |
| `search_musicbrainz` | Music recordings, artists, releases. |

### 🌍 Geographic & Knowledge (2)

| Tool | Description |
|------|-------------|
| `search_osm` | OpenStreetMap places, addresses, POIs with coordinates. |
| `search_wikidata` | Structured knowledge entities (IDs, labels, descriptions). |

### 📦 Package Registries (2)

| Tool | Description |
|------|-------------|
| `search_crates` | Rust crates on crates.io. Downloads count included. |
| `search_pypi` | Python packages. JSON API for known packages, HTML fallback for search. |

### 💰 Finance (1)

| Tool | Description |
|------|-------------|
| `search_sec_edgar` | SEC EDGAR filings. Filter by form type (10-K, 10-Q, 8-K, etc.). |

### 🗂️ Archive & Feeds (2)

| Tool | Description |
|------|-------------|
| `search_archive` | Internet Archive item search + Wayback Machine snapshots. |
| `find_rss` | Discover RSS/Atom feed URLs for any website. |

### ⚡ Quick Lookup (1)

| Tool | Description |
|------|-------------|
| `instant_answer` | DuckDuckGo instant answers for facts and definitions. |

### 🔧 GitHub & URL (3)

| Tool | Description |
|------|-------------|
| `fetch_github_file` | Fetch a public file from GitHub. |
| `fetch_metadata` | URL title, description, status, content type. |
| `fetch_url` | Fetch URL and return readable text + metadata. |

### 🐛 Debug (2)

| Tool | Description |
|------|-------------|
| `debug_capture_search_html` | Capture raw HTML for parser debugging. |
| `health` | Worker health check. |

## Features

- **Zero API keys** — all tools use public APIs or HTML parsing
- **In-memory cache** — 5 min TTL on `search_auto` results
- **Auto-fallback** — `search_auto` tries engines in sequence
- **Multi-language** — region codes on DDG, language codes on Wiktionary, Korean on Naver
- **Fediverse support** — Mastodon (any instance), PeerTube, Lemmy

## Local Development

```bash
npm install
npx wrangler dev --local --port 8791
```

## Deploy

```bash
npx wrangler deploy
```

## Project Structure

```
search-mcp-worker/
├── src/index.js      # Worker entry + all search parsers + MCP handlers (~95KB)
├── wrangler.toml
├── package.json
└── README.md
```

## Known Limitations

- Several search engines block Cloudflare Worker exit IPs (Bluesky, Google Scholar, Discogs)
- BBC search returns section pages rather than individual articles
- PyPI HTML search triggers client challenge; use exact package name with JSON API
- Archive Wayback may timeout due to archive.org latency from CF edge

## License

MIT

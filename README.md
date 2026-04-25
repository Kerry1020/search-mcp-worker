# search-mcp-worker

A Cloudflare Worker exposing an MCP server for multi-engine web search, academic papers, developer forums, social media, news, and more — no API keys required.

## MCP Tools

### Web Search

| Tool | Description |
|------|-------------|
| `search_auto` | Search multiple engines with automatic fallback. Returns the first useful result set. |
| `search_duckduckgo` | DuckDuckGo HTML search. Reliable general-purpose fallback. Supports region codes. |
| `search_bing` | Bing HTML search. |
| `search_yahoo` | Yahoo HTML search. |
| `search_google_web` | Google web search. May be rate-limited. |
| `search_baidu` | Baidu search for Chinese web results. |
| `search_sogou` | Sogou search for Chinese web results. |
| `search_naver` | Naver search for Korean web results. |
| `search_yandex` | Yandex search. Extra fallback for multi-language results. |
| `search_wikipedia` | Search Wikipedia and return page summaries. |

### Academic Search

| Tool | Description |
|------|-------------|
| `search_arxiv` | Search arXiv preprints. Returns titles, authors, abstracts, PDF links. |
| `search_pubmed` | Search biomedical literature on PubMed. Returns titles, authors, PMIDs. |

### Developer & Code

| Tool | Description |
|------|-------------|
| `search_hackernews` | Search Hacker News stories via Algolia. Tech discussions, startup news. |
| `search_stackoverflow` | Search Stack Exchange sites. Supports all StackExchange sites (stackoverflow, askubuntu, math, physics, etc.). |
| `search_npm` | Search npm packages. Returns names, versions, descriptions. |
| `search_devto` | Search Dev.to developer blog posts. |
| `search_github_repos` | Search public GitHub repositories. |
| `fetch_github_file` | Fetch a public file from GitHub. |

### Social & Video

| Tool | Description |
|------|-------------|
| `search_reddit` | Search Reddit posts. Optionally filter by subreddit. |
| `search_mastodon` | Search Mastodon/fediverse posts. Supports any instance. |
| `search_peertube` | Search PeerTube videos across the fediverse. |

### News & Media

| Tool | Description |
|------|-------------|
| `search_bbc` | Search BBC News articles. |
| `search_bing_news` | Search Bing News headlines. |
| `search_archive` | Internet Archive (item search + Wayback Machine snapshots). |

### URL & Metadata

| Tool | Description |
|------|-------------|
| `fetch_metadata` | Fetch URL title, description, status, content type. |
| `fetch_url` | Fetch URL and return readable text and metadata. |

### Debug

| Tool | Description |
|------|-------------|
| `debug_capture_search_html` | Capture raw search page HTML for parser debugging. |
| `health` | Worker health check. |

## How It Works

All searches parse live HTML or public APIs. No external API keys or subscriptions needed.

- **`search_auto`** tries engines in sequence and stops at the first good result
- DuckDuckGo supports region codes (e.g. `de-de`, `fr-fr`, `jp-jp`) for localized results
- StackOverflow supports any StackExchange site via the `site` parameter
- Reddit supports subreddit filtering via the `subreddit` parameter
- Mastodon supports any instance via the `instance` parameter

The MCP endpoint follows standard JSON-RPC (`/mcp`).

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
├── src/index.js      # Worker entry + all search parsers + MCP handlers
├── wrangler.toml
├── package.json
└── README.md
```

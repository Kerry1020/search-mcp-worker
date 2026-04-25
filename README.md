# search-mcp-worker

A Cloudflare Worker exposing an MCP server for multi-engine web search, GitHub lookup, URL fetching, Wikipedia queries, and Internet Archive access — no API keys required.

## MCP Tools

### Web Search

| Tool | Description |
|------|-------------|
| `search_auto` | Search multiple engines with automatic fallback. Returns the first useful result set. |
| `search_duckduckgo` | DuckDuckGo HTML search. Reliable general-purpose fallback. |
| `search_bing` | Bing HTML search. |
| `search_yahoo` | Yahoo HTML search. |
| `search_google_web` | Google web search. May be rate-limited; use DuckDuckGo/Bing as fallback. |
| `search_baidu` | Baidu search for Chinese web results. |
| `search_sogou` | Sogou search for Chinese web results. |
| `search_naver` | Naver search for Korean web results. |
| `search_yandex` | Yandex search. Extra fallback for multi-language results. |
| `search_wikipedia` | Search Wikipedia and return page summaries. |
| `search_archive` | Search the Internet Archive. Supports item search and Wayback Machine URL snapshots. |

### Academic

| Tool | Description |
|------|-------------|
| `search_arxiv` | Search arXiv preprints. Returns titles, authors, abstracts, PDF links. |
| `search_pubmed` | Search biomedical literature on PubMed. Returns titles, authors, PMIDs. |

### GitHub

| Tool | Description |
|------|-------------|
| `search_github_repos` | Search public GitHub repositories (no auth required). |
| `fetch_github_file` | Fetch a public file from GitHub by owner/repo/path/ref. |

### URL & Metadata

| Tool | Description |
|------|-------------|
| `fetch_metadata` | Fetch a URL and return title, description, canonical URL, status, content type. |
| `fetch_url` | Fetch a URL and return readable text and metadata. Not for private/authenticated pages. |

### Debug

| Tool | Description |
|------|-------------|
| `debug_capture_search_html` | Capture raw search page HTML for parser debugging. |
| `health` | Worker health check. |

## How It Works

All searches parse live HTML from search engine result pages. No external API keys or subscriptions needed. The `search_auto` tool tries engines in sequence and stops at the first good result, making it the recommended default.

Supported language-specific engines:
- **Chinese**: Baidu, Sogou
- **Korean**: Naver
- **Russian/Multi-lang**: Yandex
- **Regional**: DuckDuckGo supports region codes (e.g. `de-de`, `fr-fr`, `jp-jp`)

### Academic Search

| Tool | Description |
|------|-------------|
| `search_arxiv` | Search arXiv preprints. Returns titles, authors, abstracts, and PDF links. |
| `search_pubmed` | Search biomedical literature on PubMed. Returns titles, authors, PMIDs. |

### Archive

- **Archive**: Internet Archive (item search + Wayback Machine snapshots)

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

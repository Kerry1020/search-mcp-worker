# search-mcp-worker

A Cloudflare Worker exposing an MCP server for multi-engine web search, GitHub lookup, URL fetching, and Wikipedia queries — no API keys required.

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
| `search_yandex` | Yandex search. Extra fallback when other engines fail. |
| `search_wikipedia` | Search Wikipedia and return page summaries. |

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

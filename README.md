# search-mcp-worker

English | [简体中文](./README.zh-CN.md)

`search-mcp-worker` is a Cloudflare Worker that exposes a lightweight MCP server for web search and page fetching. It is designed for agents and automation workflows that need a single MCP endpoint instead of wiring together multiple search providers manually.

The project focuses on two jobs:

1. search across several public web sources
2. fetch and clean page content into readable text

## What it does

- Runs as a single Cloudflare Worker
- Exposes an MCP-compatible JSON-RPC endpoint at `/mcp`
- Supports multiple search tools for general web search, Wikipedia, Reddit, and public X/Twitter discovery
- Includes page-fetch tools for generic URLs and Reddit threads
- Uses fallback search paths when a primary engine returns weak or empty results
- Keeps deployment simple: no database, no extra backend, no headless browser

## Full tool list

The current `main` branch exposes **40 tools**.

### General web search

- `search_auto`
- `search_duckduckgo`
- `search_bing`
- `search_yahoo`
- `search_google_web`
- `search_baidu`
- `search_yandex`
- `search_naver`
- `search_sogou`

### Research, knowledge, developer, and domain search

- `search_archive`
- `search_arxiv`
- `search_pubmed`
- `search_hackernews`
- `search_stackoverflow`
- `search_reddit`
- `search_npm`
- `search_devto`
- `search_mastodon`
- `search_peertube`
- `search_bbc`
- `search_bing_news`
- `search_paperswithcode`
- `search_sec_edgar`
- `search_osm`
- `search_lemmy`
- `search_wikidata`
- `search_crates`
- `search_pypi`
- `search_wiktionary`
- `search_openlibrary`
- `search_musicbrainz`
- `search_crossref`
- `search_wikipedia`
- `search_github_repos`

### Fetch / extraction

- `fetch_github_file`
- `fetch_metadata`
- `fetch_url`

### Utility / debugging

- `instant_answer`
- `find_rss`
- `debug_capture_search_html`

### Notes on coverage

- `search_auto` is the umbrella entrypoint for multi-engine fallback.
- Several domain-specific tools target academic, developer, financial, map, library, and social/community sources.
- `debug_capture_search_html` is mainly for parser troubleshooting, not normal end-user search flows.

## Endpoints

### Health

`GET /` or `GET /healthz`

Example:

```bash
curl https://your-worker.example.com/healthz
```

Returns basic server metadata, version, MCP endpoint, and tool names.

### MCP

`POST /mcp`

This endpoint speaks JSON-RPC and supports the core MCP flow implemented by this worker:

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

## Example MCP calls

### Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

### List tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Call a search tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_bing",
    "arguments": {
      "query": "Cloudflare Workers MCP",
      "max_results": 5
    }
  }
}
```

### Call a fetch tool

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "fetch_url",
    "arguments": {
      "url": "https://modelcontextprotocol.io/",
      "max_chars": 3000
    }
  }
}
```

## Response shape

Tool calls return MCP text content plus structured JSON. In practice, clients can use the structured payload directly.

Search results generally look like this:

```json
{
  "ok": true,
  "status": 200,
  "query": "Cloudflare Workers MCP",
  "source": "bing",
  "fallback_used": false,
  "results": [
    {
      "rank": 1,
      "url": "https://example.com",
      "title": "Example result",
      "snippet": "Example snippet"
    }
  ]
}
```

## Local development

```bash
npm install
npx wrangler dev --local --port 8789
```

Then test:

```bash
curl http://127.0.0.1:8789/healthz
```

## Deployment

```bash
npx wrangler deploy
```

Current route configured in `wrangler.toml`:

- `search-mcp.qdp.qzz.io/*`

## Project structure

```text
search-mcp-worker/
├── src/index.js        # Worker entrypoint, MCP routing, tool implementations
├── wrangler.toml       # Cloudflare Worker config
├── package.json        # local development dependencies
├── README.md
└── README.zh-CN.md
```

## Design notes

- This project relies on publicly reachable web endpoints and HTML parsing for several engines.
- Search result quality depends on upstream markup stability, indexing coverage, and rate limiting.
- Some engines may challenge requests or return degraded HTML in certain regions.
- `search_twitter_x` does not call a private X API. It finds public pages through site-scoped web search.
- `fetch_url` returns cleaned text, not full readability-grade article extraction.

## Good use cases

- give an LLM one MCP endpoint for basic web search
- fetch readable text from a webpage before summarization
- search Wikipedia or Reddit without adding extra providers
- deploy a small search MCP service on Cloudflare with minimal operational overhead

## Limits

This worker is intentionally simple. It is not trying to be:

- a full SERP API replacement
- a browser automation system
- a JavaScript-rendering scraper
- a long-form article extraction engine
- a private authenticated social-media connector

## License / usage

Use and adapt it however fits your deployment model. If you expose it publicly, expect search engines to throttle or reshape traffic over time.

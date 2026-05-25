# search-mcp-worker

English | [简体中文](./README.zh-CN.md)

`search-mcp-worker` is a Cloudflare Worker that exposes a single MCP endpoint for public web search and lightweight page fetching. It is meant for agents and automation that want one stable JSON-RPC surface instead of stitching together many separate search providers.

## What this worker is for

This project focuses on two jobs:

1. search across public web sources through MCP tools
2. fetch a public page and turn it into readable text or metadata

It is intentionally small:

- one Cloudflare Worker
- one MCP endpoint at `/mcp`
- no database
- no browser cluster
- no authenticated social APIs

## Current tool surface

The current worker exposes **42 public tools**.

### General web search

- `search_auto`
- `search_duckduckgo`
- `search_bing`
- `search_bing_global`
- `search_bing_cn`
- `search_yahoo`
- `search_google_web`
- `search_baidu`
- `search_yandex`
- `search_naver`
- `search_sogou`

### News, research, developer, and vertical sources

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
- `search_sina_news`
- `search_163_news`
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

### Fetch tools

- `fetch_github_file`
- `fetch_metadata`
- `fetch_url`

### Utility / debugging

- `instant_answer`
- `find_rss`
- `debug_capture_search_html`

## How `search_auto` behaves

`search_auto` is the main entrypoint when you want the worker to choose engines for you.

- It tries a small engine set first.
- It falls back when early engines return empty or weak results.
- It reranks merged results before returning them.
- The top-level `source` is `"auto"` when more than one engine contributed useful results.
- The response also exposes `fallback_used`, `quality_status`, and `quality_reason` so callers can judge result quality.

This makes it suitable for agents that need a general search tool but still want structured signals about how trustworthy the result set is.

## Endpoints

### Health

`GET /` or `GET /healthz`

Example after deployment:

```bash
curl https://<your-domain>/healthz
```

Typical response:

```json
{
  "ok": true,
  "name": "search-mcp-worker",
  "version": "0.7.4",
  "mcp_endpoint": "https://<your-domain>/mcp"
}
```

### MCP

`POST /mcp`

The worker supports the basic MCP JSON-RPC flow:

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

### Call `search_auto`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_auto",
    "arguments": {
      "query": "Cloudflare Workers MCP",
      "limit": 5
    }
  }
}
```

### Call `fetch_url`

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

Tool calls return MCP text content plus a structured payload. In practice, most clients should read the structured payload directly.

A typical search response looks like this:

```json
{
  "ok": true,
  "query": "Cloudflare Workers MCP",
  "source": "auto",
  "fallback_used": true,
  "quality_status": "green",
  "quality_reason": "usable_results",
  "results": [
    {
      "rank": 1,
      "source": "duckduckgo",
      "url": "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
      "title": "MCP servers for Cloudflare",
      "snippet": "Use Cloudflare Workers to host MCP servers..."
    }
  ]
}
```

## Local development

```bash
npm install
npx wrangler dev --local --port 8789
```

Then check the local worker:

```bash
curl http://127.0.0.1:8789/healthz
```

## Deployment

```bash
npx wrangler deploy
```

After deployment, bind your own custom domain or use your own Worker hostname for `/healthz` and `/mcp`. Do not hardcode someone else's endpoint in your client config.

## Project structure

```text
search-mcp-worker/
├── src/index.js             # Worker entrypoint, MCP routing, tool implementations
├── src/mcp/tool-schemas.js  # MCP input schemas
├── src/core/provider-defaults.js
├── wrangler.toml
├── package.json
├── README.md
└── README.zh-CN.md
```

## What this worker does not do

This worker is intentionally pragmatic. It is not trying to be:

- a full commercial SERP API replacement
- a browser automation platform
- a JavaScript-rendering crawler
- a full article readability engine
- a private authenticated connector for closed platforms

## Good use cases

- give an LLM one MCP endpoint for broad public search
- search across web, academic, developer, and news sources with one tool surface
- fetch readable text from a public page before summarization
- deploy a small MCP search service on Cloudflare with low operational overhead

## Practical limits

This project relies heavily on public upstream HTML and public APIs.

That means quality depends on:

- upstream markup staying stable
- index coverage of the chosen engine
- regional behavior and challenge pages
- provider throttling and transient failures

If you expose the worker publicly, expect some engines to drift over time and plan to keep parsers and ranking rules maintained.

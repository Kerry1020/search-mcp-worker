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

### Web search

- `search_google_web`
- `search_duckduckgo`
- `search_bing`
- `search_baidu`
- `search_yandex`
- `search_yahoo`

These tools accept:

```json
{
  "query": "Cloudflare Workers",
  "max_results": 5
}
```

Notes:

- `query` is required
- `max_results` is clamped to `1-10`
- some tools internally fall back to another engine if the first source is blocked or returns nothing useful

### Knowledge / community search

#### `search_wikipedia`

Search Wikipedia with language-aware fallback.

```json
{
  "query": "Alan Turing",
  "limit": 5,
  "lang": "auto"
}
```

Arguments:

- `query` required
- `limit` optional, `1-10`
- `lang` optional, default `auto`

#### `search_reddit`

Search public Reddit posts through JSON endpoints.

```json
{
  "query": "mcp server",
  "subreddit": "ClaudeAI",
  "limit": 5,
  "sort": "relevance"
}
```

Arguments:

- `query` required
- `subreddit` optional
- `limit` optional, `1-10`
- `sort` optional, default `relevance`

#### `search_twitter_x`

Search public X/Twitter pages through multi-engine site-scoped search.

```json
{
  "query": "OpenAI MCP",
  "max_results": 5
}
```

## Fetch tools

### `fetch_url`

Fetch a URL and return metadata plus cleaned text.

```json
{
  "url": "https://developers.cloudflare.com/workers/",
  "max_chars": 6000
}
```

Arguments:

- `url` required
- `max_chars` optional, clamped to `500-20000`

Typical response fields:

- `ok`
- `status`
- `url`
- `final_url`
- `content_type`
- `title`
- `text`

### `fetch_reddit_post`

Fetch a Reddit thread via the public `.json` endpoint.

```json
{
  "url": "https://www.reddit.com/r/Cloudflare/comments/xxxxx/example_post/",
  "max_comments": 5
}
```

Arguments:

- `url` required
- `max_comments` optional, clamped to `1-20`

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

# search-mcp-worker

`search-mcp-worker` is a Cloudflare Worker that exposes a lightweight MCP server for multi-engine web search and content fetching.

## Features

- Unified MCP endpoint for multiple search engines
- HTML-based search adapters for Google, DuckDuckGo, Bing, Baidu, Yandex, and Yahoo
- Wikipedia and Reddit search helpers
- URL fetching with cleaned text extraction
- Reddit thread fetching via `.json`
- Worker-first deployment with zero backend dependency

## MCP Tools

### Search
- `search_google_web`
- `search_duckduckgo`
- `search_bing`
- `search_baidu`
- `search_yandex`
- `search_yahoo`
- `search_wikipedia`
- `search_reddit`
- `search_twitter_x`

### Fetch
- `fetch_url`
- `fetch_reddit_post`

## Project Structure

```text
search-mcp-worker/
├── src/index.js        # Worker entry + MCP tool handlers
├── wrangler.toml       # Cloudflare Worker config
├── package.json        # local dev dependency manifest
└── README.md
```

## Local Development

```bash
npm install
npx wrangler dev --local --port 8789
```

Health endpoint:

```bash
curl http://127.0.0.1:8789/healthz
```

## Deployment

```bash
npx wrangler deploy
```

Default route in this project:

- `search-mcp.qdp.qzz.io/*`

## Example MCP Call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_bing",
    "arguments": {
      "query": "Cloudflare",
      "max_results": 5
    }
  }
}
```

## Notes

- Search engines may rate-limit, redirect, or challenge requests.
- Some tools use fallbacks when the primary engine returns no usable results.
- Public X/Twitter search quality depends on upstream search engine visibility.

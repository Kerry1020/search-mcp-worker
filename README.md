# search-mcp-worker

Cloudflare Worker implementing an MCP server for multi-engine web search.

## Tools
- `search_google_web`
- `search_duckduckgo`
- `search_bing`
- `search_baidu`
- `search_yandex`
- `search_yahoo`
- `search_wikipedia`
- `search_reddit`
- `search_twitter_x`
- `fetch_url`
- `fetch_reddit_post`

## Local dev

```bash
npm i
npx wrangler dev --local --port 8789
```

## Deploy

```bash
npx wrangler deploy
```

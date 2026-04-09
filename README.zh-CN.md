# search-mcp-worker

`search-mcp-worker` 是一个部署在 Cloudflare Worker 上的 MCP 服务，用来统一封装多搜索引擎检索与网页内容抓取。

## 功能

- 提供统一的 MCP 接口
- 支持 Google、DuckDuckGo、Bing、Baidu、Yandex、Yahoo 的 HTML 搜索
- 支持 Wikipedia / Reddit 搜索
- 支持网页正文抓取与清洗
- 支持 Reddit 帖子线程抓取
- 无需额外后端，直接部署到 Worker

## 工具列表

### 搜索类
- `search_google_web`
- `search_duckduckgo`
- `search_bing`
- `search_baidu`
- `search_yandex`
- `search_yahoo`
- `search_wikipedia`
- `search_reddit`
- `search_twitter_x`

### 抓取类
- `fetch_url`
- `fetch_reddit_post`

## 项目结构

```text
search-mcp-worker/
├── src/index.js        # Worker 入口与 MCP tool 实现
├── wrangler.toml       # Cloudflare Worker 配置
├── package.json        # 本地开发依赖
└── README.md
```

## 本地开发

```bash
npm install
npx wrangler dev --local --port 8789
```

健康检查：

```bash
curl http://127.0.0.1:8789/healthz
```

## 部署

```bash
npx wrangler deploy
```

当前配置的默认路由：

- `search-mcp.qdp.qzz.io/*`

## MCP 调用示例

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

## 说明

- 某些搜索引擎会限流、跳转或触发验证码。
- 当主搜索源不可用时，部分工具会自动 fallback。
- X / Twitter 公开搜索结果质量取决于上游搜索引擎是否能索引到目标页面。

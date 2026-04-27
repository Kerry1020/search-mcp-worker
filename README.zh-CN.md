# search-mcp-worker

[English](./README.md) | 简体中文

`search-mcp-worker` 是一个部署在 Cloudflare Worker 上的轻量级 MCP 服务，提供网页搜索与页面抓取能力。它适合给 AI agent、自动化流程、轻量工具链提供统一的 MCP 入口，避免手动拼接多个搜索源。

这个项目主要做两件事：

1. 面向公开网页做多来源搜索
2. 抓取页面并清洗成适合模型读取的文本

## 它能做什么

- 以单个 Cloudflare Worker 运行
- 通过 `/mcp` 暴露兼容 MCP 的 JSON-RPC 接口
- 提供多个搜索工具，覆盖通用网页、Wikipedia、Reddit、公开 X/Twitter 页面发现
- 提供通用 URL 抓取与 Reddit 线程抓取工具
- 当主搜索源结果为空或质量差时，自动走 fallback 路径
- 部署简单：不需要数据库、不需要额外后端、不需要浏览器集群

## 完整工具列表

### 通用网页搜索

- `search_google_web`
- `search_duckduckgo`
- `search_bing`
- `search_baidu`
- `search_yandex`
- `search_yahoo`

这些工具的典型参数：

```json
{
  "query": "Cloudflare Workers",
  "max_results": 5
}
```

说明：

- `query` 必填
- `max_results` 会被限制在 `1-10`
- 某些工具在首选搜索源被拦截、无结果或结果不可用时，会自动尝试其他引擎

### 知识 / 社区搜索

#### `search_wikipedia`

按语言智能回退搜索 Wikipedia。

```json
{
  "query": "Alan Turing",
  "limit": 5,
  "lang": "auto"
}
```

参数：

- `query` 必填
- `limit` 可选，范围 `1-10`
- `lang` 可选，默认 `auto`

#### `search_reddit`

通过 Reddit 的公开 JSON 接口搜索帖子。

```json
{
  "query": "mcp server",
  "subreddit": "ClaudeAI",
  "limit": 5,
  "sort": "relevance"
}
```

参数：

- `query` 必填
- `subreddit` 可选
- `limit` 可选，范围 `1-10`
- `sort` 可选，默认 `relevance`

#### `search_twitter_x`

通过多搜索引擎站内检索发现公开的 X/Twitter 页面。

```json
{
  "query": "OpenAI MCP",
  "max_results": 5
}
```

## 抓取工具

### `fetch_url`

抓取一个 URL，返回元数据和清洗后的正文文本。

```json
{
  "url": "https://developers.cloudflare.com/workers/",
  "max_chars": 6000
}
```

参数：

- `url` 必填
- `max_chars` 可选，会被限制在 `500-20000`

典型返回字段：

- `ok`
- `status`
- `url`
- `final_url`
- `content_type`
- `title`
- `text`

### `fetch_reddit_post`

通过公开 `.json` 接口抓取 Reddit 帖子线程。

```json
{
  "url": "https://www.reddit.com/r/Cloudflare/comments/xxxxx/example_post/",
  "max_comments": 5
}
```

参数：

- `url` 必填
- `max_comments` 可选，会被限制在 `1-20`

## 服务端点

### 健康检查

`GET /` 或 `GET /healthz`

示例：

```bash
curl https://your-worker.example.com/healthz
```

会返回服务名称、版本、MCP 端点以及工具列表。

### MCP 端点

`POST /mcp`

这个端点使用 JSON-RPC，并实现了当前 Worker 支持的核心 MCP 流程：

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

## MCP 调用示例

### 初始化

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

### 列出工具

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### 调用搜索工具

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

### 调用抓取工具

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

## 返回结构

工具调用会同时返回 MCP 的文本内容和结构化 JSON。实际接入时，客户端通常可以直接消费结构化字段。

搜索结果大致长这样：

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
      "title": "示例结果",
      "snippet": "示例摘要"
    }
  ]
}
```

## 本地开发

```bash
npm install
npx wrangler dev --local --port 8789
```

然后测试：

```bash
curl http://127.0.0.1:8789/healthz
```

## 部署

```bash
npx wrangler deploy
```

当前 `wrangler.toml` 中配置的路由：

- `search-mcp.qdp.qzz.io/*`

## 项目结构

```text
search-mcp-worker/
├── src/index.js        # Worker 入口、MCP 路由、工具实现
├── wrangler.toml       # Cloudflare Worker 配置
├── package.json        # 本地开发依赖
├── README.md
└── README.zh-CN.md
```

## 设计说明

- 这个项目大量依赖公开网页端点和 HTML 解析。
- 搜索质量取决于上游页面结构稳定性、索引覆盖、限流策略。
- 某些搜索引擎在不同地区可能会返回挑战页、重定向页，或者降级后的 HTML。
- `search_twitter_x` 不调用私有 X API，而是通过站内限定的网页搜索发现公开页面。
- `fetch_url` 返回的是清洗后的文本预览，不是完整的高保真阅读模式抽取器。

## 适合的使用场景

- 给 LLM / Agent 提供一个统一的基础搜索 MCP 入口
- 在做摘要前先抓网页正文
- 不额外接第三方搜索 API，也能搜 Wikipedia / Reddit
- 想把一个轻量搜索 MCP 服务低成本部署到 Cloudflare

## 不适合的场景

这个 Worker 故意保持简单，它不是：

- 完整 SERP API 替代品
- 浏览器自动化系统
- 支持 JavaScript 渲染的抓取器
- 长文高精度正文抽取引擎
- 私有登录态社交媒体连接器

## 使用说明

你可以按自己的部署模型自由修改和接入它。若对外公开暴露服务，需要预期搜索引擎会随着时间调整限流、页面结构或返回策略。

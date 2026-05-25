# search-mcp-worker

[English](./README.md) | 简体中文

`search-mcp-worker` 是一个部署在 Cloudflare Worker 上的轻量 MCP 服务，给公开网页搜索和轻量页面抓取提供统一入口。它适合 AI agent、自动化流程、轻量工具链：只连一个 JSON-RPC 端点，就能调多种搜索和抓取能力。

## 这个项目是干什么的

这个 Worker 主要做两件事：

1. 通过 MCP 工具搜索公开网页和垂直数据源
2. 抓取公开页面并整理成可读文本或元数据

它故意保持很小：

- 单个 Cloudflare Worker
- 单个 `/mcp` 端点
- 不依赖数据库
- 不依赖浏览器集群
- 不接私有登录态社交 API

## 当前工具面

当前 Worker 暴露 **42 个公开工具**。

### 通用网页搜索

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

### 新闻、研究、开发者与垂直来源

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

### 抓取工具

- `fetch_github_file`
- `fetch_metadata`
- `fetch_url`

### 工具 / 调试

- `instant_answer`
- `find_rss`
- `debug_capture_search_html`

## `search_auto` 是怎么工作的

`search_auto` 是默认的总入口，适合“先给我一个可用结果集”的场景。

它的行为大致是：

- 先尝试一组较小的搜索引擎组合
- 如果前面的引擎返回空结果或低质量结果，就继续 fallback
- 合并多个来源结果后再做排序
- 当有多个引擎共同贡献了有效结果时，顶层 `source` 会返回 `"auto"`
- 同时返回 `fallback_used`、`quality_status`、`quality_reason`，让调用方判断结果集质量

这让它很适合给 agent 做通用搜索，但又不会把“结果是怎么来的”完全藏起来。

## 服务端点

### 健康检查

`GET /` 或 `GET /healthz`

示例（部署后替换成你自己的域名）：

```bash
curl https://<your-domain>/healthz
```

典型返回：

```json
{
  "ok": true,
  "name": "search-mcp-worker",
  "version": "0.7.4",
  "mcp_endpoint": "https://<your-domain>/mcp"
}
```

### MCP 端点

`POST /mcp`

这个 Worker 支持基础 MCP JSON-RPC 流程：

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

### 调用 `search_auto`

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

### 调用 `fetch_url`

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

工具调用会同时返回 MCP 文本内容和结构化字段。实际接入时，通常应该直接读取结构化 payload。

一个典型搜索返回大概长这样：

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

## 本地开发

```bash
npm install
npx wrangler dev --local --port 8789
```

然后检查本地 worker：

```bash
curl http://127.0.0.1:8789/healthz
```

## 部署

```bash
npx wrangler deploy
```

部署后请绑定你自己的自定义域名，或使用你自己的 Worker hostname 来访问 `/healthz` 和 `/mcp`。不要把别人的实际服务端点直接写进客户端配置里。

## 项目结构

```text
search-mcp-worker/
├── src/index.js             # Worker 入口、MCP 路由、工具实现
├── src/mcp/tool-schemas.js  # MCP 输入 schema
├── src/core/provider-defaults.js
├── wrangler.toml
├── package.json
├── README.md
└── README.zh-CN.md
```

## 这个 Worker 不做什么

这个项目是偏务实的实现，不打算变成：

- 商业级完整 SERP API 替代品
- 浏览器自动化平台
- 支持 JS 渲染的通用爬虫
- 高保真长文正文抽取引擎
- 私有登录态封闭平台连接器

## 适合的使用场景

- 给 LLM / agent 一个统一的公开搜索 MCP 入口
- 用一套工具面同时搜网页、学术、开发者、新闻类来源
- 在摘要前先抓公开页面文本
- 低运维成本地把一个搜索 MCP 服务挂到 Cloudflare 上

## 实际限制

这个项目强依赖公开上游 HTML 和公开 API。

所以质量会受到这些因素影响：

- 上游页面结构是否稳定
- 所选引擎是否收录到目标内容
- 地区差异和挑战页
- 限流和临时失败

如果你把它长期公开出去，就要预期某些来源会随时间漂移，解析器和排序规则需要持续维护。

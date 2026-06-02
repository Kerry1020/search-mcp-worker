# search-mcp-worker 代码全量分析

**版本**: v0.7.4  
**部署**: `search-mcp.qdp.qzz.io` (Cloudflare Workers)  
**主文件**: `src/index.js` (2719 行)  
**协议**: MCP (JSON-RPC 2.0 over HTTP POST `/mcp`)

---

## 架构概览

```
Client (AIaW / Claude / etc)
  │
  │  HTTP POST /mcp  (JSON-RPC 2.0)
  ▼
Cloudflare Worker (fetch handler)
  │
  ├── /health, /healthz → 版本信息 + 工具列表
  ├── /mcp → handleJsonRpc()
  │     ├── initialize → capabilities + serverInfo
  │     ├── tools/list → 57 个 tool schema
  │     ├── tools/call → callTool() → 具体搜索引擎
  │     └── ping → {}
  └── 404 → 其他路径
```

### 请求生命周期

1. `fetch()` 拦截 OPTIONS (CORS preflight)
2. 从 HTTP headers 加载 provider config (`x-{name}-api-key`, `x-{name}-base-url`)
3. 路由到 `/mcp` 或 `/health`
4. `handleJsonRpc()` 解析 JSON-RPC method
5. `callTool()` 通过 switch dispatch 到具体函数
6. 返回 `toolResult()` 包装的 JSON-RPC response

---

## Provider 系统

### 9 个可配置 Provider

| Provider | 需要 API Key | 需要 Base URL | 默认 Base URL |
|---|---|---|---|
| brave | ✅ | 可选 | - |
| tavily | ✅ | 可选 | - |
| jina | ✅ | 可选 | - |
| searxng | ✅ | 可选 | - |
| serpapi | ✅ | 可选 | - |
| bing | ✅ | 可选 | - |
| parallel | ✅ | 可选 | `api.parallel.ai` |
| ollama | ✅ | 可选 | `api.ollama.com/v1/web-search` |
| xiaohongshu | 特殊 | 特殊 | token server |

### Provider 配置注入方式

1. **HTTP Header**（无状态，每次请求）: `x-{provider}-api-key` / `x-{provider}-base-url`
2. **Runtime tool call**: `provider_set_{provider}` 工具设置内存中的 `PROVIDER_CONFIG`
3. **AIaW Plugin Settings**: 通过 header 传递持久化配置

### Provider 优先级链（search_auto 默认）

```
parallel → ollama → xiaohongshu → bing → brave → sogou → ecosia → qwant → naver → baidu → wikipedia → duckduckgo → google → archive → yahoo → yandex
```

---

## 57 个 Tool 完整清单

### 通用搜索引擎 (10)

| Tool | 函数 | 数据源 | 协议 |
|---|---|---|---|
| `search_auto` | `searchAuto` | 多引擎 fallback 链 | 聚合 |
| `search_duckduckgo` | `searchDuckDuckGo` | `html.duckduckgo.com` | HTML 抓取 |
| `search_bing` | `searchBing` | `bing.com/search` | HTML 抓取 |
| `search_yahoo` | `searchYahoo` | `search.yahoo.com` | HTML 抓取 |
| `search_google_web` | `searchGoogle` | `google.com/search` | HTML 抓取 |
| `search_baidu` | `searchBaidu` | `baidu.com/s` | HTML 抓取 |
| `search_yandex` | `searchYandex` | `yandex.com/search` | HTML 抓取 |
| `search_naver` | `searchNaver` | `search.naver.com` | HTML 抓取 |
| `search_sogou` | `searchSogou` | `sogou.com/web` | HTML 抓取 |
| `search_archive` | `searchArchive` | `web.archive.org` | HTML 抓取 |

### API 驱动搜索 (5)

| Tool | 函数 | 数据源 | 需要 Key |
|---|---|---|---|
| `search_brave` | `searchBrave` | `api.search.brave.com` | ✅ |
| `search_ollama` | `searchOllama` | `api.ollama.com/v1/web-search` | ✅ |
| `search_parallel` | `searchParallel` | `api.parallel.ai/v1/search` | ✅ |
| `search_xiaohongshu` | `searchXiaohongshu` | 小红书 native API + fallback | ✅ (cookies) |
| `search_ecosia` | `searchEcosia` | `ecosia.org/search` | ❌ (HTML) |

### 垂直搜索 - 学术 (4)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_arxiv` | `searchArxiv` | `export.arxiv.org/api/query` (Atom XML) |
| `search_pubmed` | `searchPubmed` | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch+efetch` |
| `search_paperswithcode` | `searchPapersWithCode` | `paperswithcode.com/api/v1/search` |
| `search_crossref` | `searchCrossref` | `api.crossref.org/works` |

### 垂直搜索 - 开发者 (6)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_hackernews` | `searchHackerNews` | `hn.algolia.com/api/v1/search` |
| `search_stackoverflow` | `searchStackOverflow` | `api.stackexchange.com/2.3/search/advanced` |
| `search_npm` | `searchNpm` | `registry.npmjs.org/-/v1/search` |
| `search_devto` | `searchDevto` | `dev.to/api/articles` |
| `search_crates` | `searchCrates` | `crates.io/api/v1/crates` |
| `search_pypi` | `searchPypi` | `pypi.org/search` (HTML) |

### 垂直搜索 - 社交/媒体 (6)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_reddit` | `searchReddit` | `www.reddit.com/search.json` |
| `search_mastodon` | `searchMastodon` | 多实例 `/api/v2/search` |
| `search_peertube` | `searchPeerTube` | `search.joinpeertube.org/api/v1/search/videos` |
| `search_bbc` | `searchBbc` | `www.bbc.co.uk/wwmodules` (JSON) |
| `search_bing_news` | `searchBingNews` | `bing.com/news/search` (HTML) |
| `search_lemmy` | `searchLemmy` | 多实例 `/api/v3/search` |

### 垂直搜索 - 知识/参考 (6)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_wikipedia` | `searchWikipedia` | `{lang}.wikipedia.org/w/api.php` |
| `search_wikidata` | `searchWikidata` | `wikidata.org/w/api.php` |
| `search_wiktionary` | `searchWiktionary` | `{lang}.wiktionary.org/w/api.php` |
| `search_openlibrary` | `searchOpenLibrary` | `openlibrary.org/search.json` |
| `search_musicbrainz` | `searchMusicbrainz` | `musicbrainz.org/ws/2/release` |
| `search_osm` | `searchOsm` | `nominatim.openstreetmap.org/search` |

### 垂直搜索 - 金融/其他 (2)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_sec_edgar` | `searchSecEdgar` | `efts.sec.gov/LATEST/search-index` |
| `instant_answer` | `instantAnswer` | `api.duckduckgo.com` |

### 工具类 (4)

| Tool | 函数 | 用途 |
|---|---|---|
| `fetch_url` | `fetchUrl` | 抓取任意 URL 正文（最多 512KB，12s 超时） |
| `fetch_metadata` | `fetchMetadata` | 抓取 URL 的 title/description/og:image |
| `fetch_github_file` | `fetchGitHubFile` | 抓取 GitHub 仓库中的单个文件内容 |
| `find_rss` | `findRss` | 发现 URL 对应的 RSS/Atom feed |

### GitHub 专用 (1)

| Tool | 函数 | 数据源 |
|---|---|---|
| `search_github_repos` | `searchGitHubRepos` | `api.github.com/search/repositories` |

### 调试 (1)

| Tool | 函数 | 用途 |
|---|---|---|
| `debug_capture_search_html` | `debugCaptureSearchHtml` | 抓取搜索引擎原始 HTML 用于调试解析 |

### Provider 管理 (13)

| Tool | 用途 |
|---|---|
| `provider_list` | 列出所有 provider 及其配置状态 |
| `provider_set_config` | 批量设置 provider 配置 |
| `provider_get_config` | 获取单个 provider 配置 |
| `provider_set_brave/tavily/jina/serpapi/bing/parallel/searxng/ollama` | 各 provider 专用设置 |
| `provider_set_xiaohongshu` | 小红书 cookies + token server 配置 |

---

## 核心函数调用链

### searchAuto（智能搜索）

```
searchAuto(args)
  ├── 解析 engines 列表（默认 16 个引擎）
  ├── 检查缓存 (auto:{engines}:{query}:{limit})
  ├── 逐个尝试引擎:
  │     ├── 调用具体搜索函数
  │     ├── isBadSearchResult() 检查结果质量
  │     ├── 有效 → setCache() → 返回
  │     └── 无效 → 尝试下一个
  └── 全部失败 → 返回 attempts 错误报告
```

### HTML 抓取通用模式

```
searchXxx(args)
  ├── requireString(query) + clampLimit(limit)
  ├── fetchText(url) 或 fetchJson(url)
  │     ├── fetchWithUA(url) — 随机 Google Search Appliance UA
  │     ├── AbortController + timeout 12s
  │     └── response.text() 最多 512KB
  ├── extractXxxResults(html, limit)
  │     ├── 正则匹配搜索结果块
  │     ├── 解析 title/url/snippet
  │     └── decodeXxxUrl() 解码重定向 URL
  └── searchResult({ source, query, limit, results })
```

### 小红书特殊链路

```
searchXiaohongshu(args)
  ├── 路径 1: Native API（如果有 XHS_COOKIES）
  │     ├── 解析 cookies → 提取 a1
  │     ├── Token Server 获取 X-S 签名 (POST /api/v1/tokens/xs)
  │     ├── Token Server 获取 X-S-Common (POST /api/v1/tokens/xs-common)
  │     ├── 直接调用 edith.xiaohongshu.com API
  │     └── 解析 note_card → title/url/snippet/likes/cover
  └── 路径 2: site-targeted fallback
        └── sogou → bing → google → baidu → yandex
              └── 过滤只保留 xiaohongshu.com 结果
```

---

## 基础设施函数

| 函数 | 行号 | 用途 |
|---|---|---|
| `fetchWithUA` | 1853 | 带 random UA 的 fetch + timeout + size limit |
| `fetchText` | 1897 | fetch + text() + 512KB 截断 |
| `fetchJson` | 1922 | fetch + json() + error handling |
| `fetchTextWithResponse` | 1888 | fetchText + 保留 status |
| `getCached` / `setCache` | 1905/1912 | 内存 Map 缓存 |
| `randomGsaUA` | 1848 | 生成随机 Google Search Appliance UA |
| `requireString` | 2658 | 参数校验，非字符串抛错 |
| `clampLimit` | 2671 | 限制 1-10，默认 5 |
| `htmlToText` | 2643 | HTML 标签剥离 |
| `cleanText` | 2653 | 空白压缩 |
| `decodeHtml` | 2658 | HTML entity 解码 |
| `isNoiseUrl` | 2629 | 过滤 JS/图片/CSS 等非结果 URL |
| `searchResult` | 2129 | 统一结果结构 `ok/source/query/limit/results` |
| `searchError` | 2124 | searchResult 的 error 封装 |
| `toolResult` | 2676 | MCP tool response 包装 |
| `sanitizeForJson` | 2699 | 清理控制字符 |

---

## URL 解码函数（搜索引擎反爬）

| 函数 | 引擎 | 作用 |
|---|---|---|
| `decodeDuckUrl` | DuckDuckGo | 解码 `uddg=` base64 URL |
| `decodeBingUrl` | Bing | 解码 `RU.*?RU` base64 + `&` 参数 |
| `decodeYahooUrl` | Yahoo | 解码 `RU=...` base64 URL |
| `decodeYandexUrl` | Yandex | 解码 Unicode 转义 + URL 编码 |
| `decodeUnicodeEscapes` | 通用 | `\uXXXX` → 实际字符 |
| `normalizeUrlCandidate` | 通用 | 清理 & 前缀 + 编码 |

---

## 环境变量（Cloudflare Workers env）

| 变量 | 用途 | 默认值 |
|---|---|---|
| `XHS_COOKIES` | 小红书 API cookies (JSON) | 空（走 fallback） |
| `XHS_TOKEN_SERVER` | X-S 签名服务 URL | `https://31.97.132.244:8443` |
| `XHS_TOKEN_SERVER_KEY` | 签名服务 auth key | `dev-key-123` |

> API keys 不通过 env 传递，全部通过 HTTP headers 或 `provider_set_*` 工具动态注入。

---

## 模块化拆分（src/ 目录）

线上版本是单文件 bundle（`src/index.js`），但 `src/` 下还有模块化源码：

| 文件 | 职责 |
|---|---|
| `core/provider-defaults.js` | 8 个 provider 默认配置 |
| `core/provider-config.js` | `resolveProviderConfig()` + `maskSecret()` + `headerValue()` |
| `core/request-context.js` | `createRequestContext()` 封装 request + provider config |
| `mcp/protocol.js` | JSON-RPC 处理 (`handleJsonRpc`, `rpcResult`, `rpcError`, `json`) |
| `mcp/tool-schemas.js` | `querySchema()` + `providerConfigSchema()` 工具 schema 工厂 |

---

## 测试文件

| 文件 | 覆盖范围 |
|---|---|
| `__tests__/search/public-tool-surface.test.js` | 57 个 tool schema 验证 |
| `__tests__/search/public-tool-fixes.test.js` | 已知 bug 回归测试 |
| `__tests__/search/search-auto.test.js` | searchAuto fallback 链 |
| `__tests__/search/vertical-tool-precision.test.js` | 垂直搜索精确度 |
| `__tests__/core/provider-config.test.js` | Provider 配置解析 |
| `__tests__/mcp/protocol.test.js` | JSON-RPC 协议测试 |

---

## 小红书 native API 技术细节

### 认证流程

1. **Cookies**: 需要 `a1` cookie（小红书登录态）
2. **X-S 签名**: POST `{token_server}/api/v1/tokens/xs`，传 `endpoint + payload + a1`，返回 `x_s` + `x_t`
3. **X-S-Common 签名**: POST `{token_server}/api/v1/tokens/xs-common`，传 `a1`，返回 `x_s_common`

### API 调用

- **Endpoint**: `POST https://edith.xiaohongshu.com/api/sns/web/v1/search/notes`
- **Headers**: `x-s`, `x-s-common`, `x-t` (签名) + 标准 browser headers
- **Payload**: `keyword`, `page`, `page_size`, `search_id` (UUID), `sort`, `note_type`
- **响应**: `data.items[]` → `note_card` → `note_id/title/desc/user/interact_info/cover`

### Fallback

native API 失败 → `site:xiaohongshu.com` 通过 sogou/bing/google/baidu/yandex 搜索 → 过滤小红书域名结果

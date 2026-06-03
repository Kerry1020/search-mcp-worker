# search-mcp-worker

[English](./README.md) | 简体中文

一个单文件 Cloudflare Worker，通过一个 JSON-RPC 端点暴露 **42 个 MCP 搜索和页面抓取工具**。零依赖、零数据库、零浏览器集群。

专为 LLM Agent 和自动化设计——一个稳定的搜索接口替代拼凑多个搜索提供商。

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│                    POST /mcp                          │
│              (JSON-RPC 2.0 端点)                      │
├──────────────┬───────────────┬───────────────────────┤
│  通用搜索    │  垂直源       │  抓取工具             │
│  (12 tools)  │  (22 tools)   │  (3 tools)            │
├──────────────┼───────────────┼───────────────────────┤
│ HTML 解析    │ JSON API      │ HTML → 纯文本         │
│ + 回退链    │ + HTML 解析   │ + 元数据提取          │
│              │ + finalize    │ + GitHub 原始文件     │
├──────────────┴───────────────┴───────────────────────┤
│  防御层                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ 熔断器   │ │ 指数退避 │ │ finalizeVertical     │ │
│  │ (5分钟)  │ │ 重试     │ │ SearchResults        │ │
│  │          │ │ (502-504)│ │ (意图偏移检测        │ │
│  │          │ │          │ │  + CJK/EN token      │ │
│  │          │ │          │ │  覆盖度)             │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

全部代码在 `src/index.js`（~4700 行），无构建步骤。

## 快速开始

### 部署

```bash
# 创建 metadata.json
echo '{"main_module":"index.js","compatibility_date":"2026-04-08"}' > /tmp/metadata.json

# 通过 CF API 部署
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/search-mcp-worker" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_API_KEY" \
  -F "metadata=@/tmp/metadata.json;type=application/json" \
  -F "index.js=@src/index.js;type=application/javascript+module"
```

### MCP 客户端配置

适用于 Claude Desktop、Cursor 或任何支持 SSE/StreamableHTTP 的 MCP 客户端：

```json
{
  "mcpServers": {
    "search": {
      "url": "https://your-worker.example.com/mcp"
    }
  }
}
```

### 健康检查

```bash
curl https://your-worker.example.com/health
# → {"ok":true,"build":{"sha":"c2de5b9","time":"2026-06-03T15:15:00Z"}}
```

## 工具一览（42 个）

### 第一层：通用网页搜索

解析 HTML 搜索结果页。每个引擎都有多轮回退链和轮换 User-Agent。

| 工具 | 引擎 | URL 模式 | 回退策略 |
|---|---|---|---|
| `search_auto` | 多引擎 | — | 按顺序尝试多个引擎，合并结果后重排序。返回 `fallback_used`、`quality_status`、`quality_reason` |
| `search_duckduckgo` | DuckDuckGo | `noai.duckduckgo.com/?q=` → `lite.duckduckgo.com/lite/`(POST) → `html.duckduckgo.com/html/` | 3 次尝试：noai → lite(POST 表单) → html |
| `search_bing` | Bing (美国) | `bing.com/search?q=` | 主参数 → 回退参数，2 条路由 |
| `search_bing_global` | Bing (全球) | `bing.com/search?q=` + `cn.bing.com/search?q=` | 美国+中国路由，主参数→回退参数 |
| `search_bing_cn` | Bing (中国) | `cn.bing.com/search?q=` | 中文优化 headers + 回退参数 |
| `search_yahoo` | Yahoo | `search.yahoo.com/search?p=` | 3 次尝试：nojs → 标准 → 最简 headers；自动处理 consent 表单 |
| `search_google_web` | Google | `google.com/search?q=` | 3 次尝试：GSA UA → Chrome UA + `gbv=1` → 裸请求 |
| `search_baidu` | 百度 | `m.baidu.com/s?word=` → `baidu.com/s?wd=&tn=json` → `baidu.com/s?wd=` | 移动版 HTML → JSON API → 桌面版 HTML |
| `search_yandex` | Yandex | `yandex.com/search/?text=` | GSA UA → 裸请求；验证码检测 → 返回 `blocked: true` |
| `search_naver` | Naver | `search.naver.com/search.naver?query=` | 单次尝试，HTML 解析 |
| `search_sogou` | 搜狗 | `sogou.com/web?query=` | H3+A 正则 → 通用链接提取；过滤 `sogou.com/?s_from=hint_up` 建议噪声 |
| `search_brave` | Brave | `search.brave.com/search?q=` | 单次尝试，HTML 解析 |
| `search_qwant` | Qwant | `qwant.com/?q=` | 单次尝试，HTML 解析 |
| `search_ecosia` | Ecosia | `ecosia.org/search?q=` | 单次尝试，HTML 解析 |

### 第二层：垂直源 — JSON API

调用结构化 JSON API。结果经过 `finalizeVerticalSearchResults` 做意图偏移检测和噪声过滤。

| 工具 | 来源 | API | 实现细节 |
|---|---|---|---|
| `search_arxiv` | arXiv | `export.arxiv.org/api/query?search_query=all:` (Atom XML) | XML 解析 → `{title, url, snippet}`；失败时回退到 `searchSiteTargetVertical` |
| `search_pubmed` | PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch` → `efetch` | 两步走：esearch 获取 ID → efetch 获取摘要；**技术信号检测**防止生物查询返回技术噪声 |
| `search_hackernews` | Hacker News | `hn.algolia.com/api/v1/search?tags=story` | Algolia API；`objectID` 作为自帖回退 |
| `search_stackoverflow` | Stack Exchange | `api.stackexchange.com/2.3/search/advanced` | 可配置 `site` 参数（默认 `stackoverflow`）；`filter=withbody` 包含正文 |
| `search_reddit` | Reddit | `reddit.com/search.json?q=&sort=relevance` | 可选 `subreddit` 参数；`raw_json=1`；失败时回退到 `searchRedditFallback` |
| `search_npm` | npm | `registry.npmjs.org/-/v1/search?text=` | 直接 JSON → `{name}@{version}` |
| `search_devto` | dev.to | `dev.to/api/articles?tag=` 然后用 `?q=` | **三级 tag 策略**：复合 tag（如 `machinelearning`）→ 单词 tag → `?q=` 回退 |
| `search_mastodon` | Mastodon | `mastodon.social/api/v2/search?q=` + `/api/v1/timelines/tag/` | 从 query 提取 hashtag，搜索 tag 时间线作为补充；多实例 |
| `search_peertube` | PeerTube | `search.joinpeertube.org/api/v1/search/videos` | 全局视频搜索索引 |
| `search_sec_edgar` | SEC EDGAR | `efts.sec.gov/LATEST/search-index?q=` | 可选 `form_type` 过滤（10-K、S-1 等） |
| `search_lemmy` | Lemmy | `lemmy.world/api/v3/post/list?community_name=` + `/api/v3/search?sort=New` | **社区回退**：query 匹配已知社区（linux/docker/rust 等）时，先获取 `post/list`；3 个实例（lemmy.world、lemmy.ml、programming.dev）并发搜索 |
| `search_wikipedia` | 维基百科 | `{lang}.wikipedia.org/w/api.php?action=query&list=search` | 可配置 `language`；回退到 HTML 抓取 |
| `search_wikidata` | Wikidata | `wikidata.org/w/api.php?action=wbsearchentities` | 返回实体 ID + 描述 |
| `search_wiktionary` | 维基词典 | `{lang}.wiktionary.org/w/api.php?action=query&list=search` | 可配置 `language` |
| `search_openlibrary` | Open Library | `openlibrary.org/search.json?q=` | 返回作品 OLID、作者、年份 |
| `search_musicbrainz` | MusicBrainz | `musicbrainz.org/ws/2/recording/?query=&fmt=json` | 艺术家 + 专辑信息 |
| `search_crossref` | Crossref | `api.crossref.org/works?query=` | DOI 链接的学术论文 |
| `search_pypi` | PyPI | `pypi.org/search/?q=`(HTML) → `pypi.org/pypi/{name}/json`(精确查找) | 先 HTML 抓取；0 结果时尝试精确包名查找 |
| `search_crates` | crates.io | `crates.io/api/v1/crates?q=` | 直接 JSON API |
| `search_github_repos` | GitHub | `api.github.com/search/repositories?q=&sort=stars` | 按 star 排序；多取后截断 |
| `search_ollama` | Ollama | `api.ollama.com/v1/web-search` (POST) | 可配置 endpoint；需要 API key |
| `search_parallel` | Parallel | `api.parallel.ai/v1/search` (POST) | 可配置 endpoint |

### 第二层：垂直源 — HTML 抓取

解析 HTML 搜索页面。结果同样经过 `finalizeVerticalSearchResults`。

| 工具 | 来源 | URL 模式 | 解析策略 |
|---|---|---|---|
| `search_bbc` | BBC | `bbc.co.uk/search?q=` | HTML 解析 |
| `search_bing_news` | Bing 新闻 | `bing.com/news/search?q=&format=rss` | RSS 优先，HTML 回退 |
| `search_sina_news` | 新浪新闻 | `search.sina.com.cn/api/news?q=`(JSON) → HTML 回退 | JSON API 优先；回退到 `searchSiteTargetVertical` 限定 `host=sina.com.cn` |
| `search_163_news` | 网易新闻 | `163.com/search?keyword=`(HTML) | HTML 解析 → `extract163SearchResults`；回退到站内定向搜索 |
| `search_paperswithcode` | Papers With Code | `api.semanticscholar.org/graph/v1/paper/search` | 后端使用 Semantic Scholar API |
| `search_osm` | OpenStreetMap | `nominatim.openstreetmap.org/search?q=&format=jsonv2` | 地理编码；返回经纬度 + OSM 链接 |
| `search_archive` | Archive.org | `archive.org/wayback/available?url=` + `advancedsearch.php?q=` | Wayback Machine 查询 + 高级搜索；**当前受 CF Workers IP 超时限制** |

### 第三层：抓取工具

| 工具 | 用途 | 实现 |
|---|---|---|
| `fetch_url` | 抓取任意 URL，提取可读文本 | `fetchTextWithResponse` → `extractReadableContent`（文章提取）→ 按 `max_chars` 截断 |
| `fetch_metadata` | 从 URL 提取元数据 | 抓取 HTML（128KB 上限）→ 解析 `<title>`、`<meta>` description/og:image 等 → 返回结构化元数据 |
| `fetch_github_file` | 从 GitHub 获取指定文件 | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` → 返回原始文本 |

### 辅助工具

| 工具 | 用途 |
|---|---|
| `instant_answer` | DuckDuckGo 即时回答 API（`api.duckduckgo.com/?format=json`） |
| `find_rss` | 发现指定 URL 上的 RSS/Atom 订阅源 |
| `debug_capture_search_html` | 调试工具：返回搜索引擎原始 HTML，用于解析器开发 |

## 防御层

### 熔断器（PR #2）

按引擎的滑动窗口。连续 3 次 blocked/captcha 响应后，冻结该引擎 5 分钟。`frozenUntil` 过期后自动恢复。

```
引擎被拦截 → recordEngineBlocked() → failures++
3 次失败 → frozenUntil = now + 5min
下次请求 → isEngineCircuitBroken() → true → 跳过该引擎，尝试下一个
5 分钟后 → 自动清除
```

适用于：Google、Yahoo、Bing、Yandex 等 HTML 抓取引擎。

### 指数退避重试（PR #5）

针对临时服务器错误（502、503、504）和网络故障：

```
fetchWithUA(url, headers, { retries: 1, retryDelay: 200 })
→ 200ms * 2^attempt + random(0, 50ms) 抖动
→ 最多 2 次尝试（1 次重试）
```

### 意图偏移检测

**`isHardIntentMismatchResult`** — 硬过滤器，丢弃明显偏题的结果：
- 英文：alpha token（长度 ≥ 3）在 title+snippet 中全字匹配。覆盖率 < 50% = 偏题。
- CJK：查询字符在 title+snippet 中检查。零命中 = 偏题。
- 来源特定：BBC 过滤非 alpha 噪声；PubMed 过滤技术 vs 生物交叉污染。

**`isIntentMismatchResult`** — 软过滤器，硬过滤器未触发时使用：
- 检查查询意图与结果内容的语义距离。
- 按引擎调优。

### `finalizeVerticalSearchResults`

所有垂直源的管线（hackernews、reddit、devto、mastodon、peertube、stackoverflow、sec_edgar、osm、bbc、bing_news、sina_news、163_news、wikipedia、pubmed）：

```
原始结果
  → classifyVerticalResultType（forum_post、news_article、package 等）
  → 过滤：isGenericWrapperResult（丢弃包装页/门户页）
  → 过滤：isHardIntentMismatchResult（丢弃偏题结果）
  → 过滤：isLowTrustResult（丢弃低质量信号）
  → 过滤：shouldDropVerticalResultType（保留首选类型）
  → scoreVerticalResult（相关性评分）
  → 按分数排序，截断到 limit
  → 返回 filtered_count + filtered_reason
```

**注意：** `lemmy` 绕过 `finalizeVerticalSearchResults`（直接使用 `searchResult`），因为 Lemmy 帖子标题使用社区俚语，token 覆盖度过滤器会误杀。

### `search_auto` 熔断流程

```
search_auto 按顺序尝试引擎：
  对每个引擎：
    如果 isEngineCircuitBroken(engine) → 跳过，报告 "circuit_breaker_frozen"
    results = engine.search(query)
    如果 results.length > 0 → recordEngineSuccess，使用结果
    如果被拦截/验证码 → recordEngineBlocked，尝试下一个引擎
  合并所有成功结果
  重排序
  返回 quality_status: green/yellow/red
```

## 响应格式

每个搜索工具返回一致的结构：

```json
{
  "ok": true,
  "query": "cloudflare workers",
  "source": "auto",
  "results": [
    {
      "rank": 1,
      "source": "duckduckgo",
      "url": "https://...",
      "title": "...",
      "snippet": "..."
    }
  ],
  "fallback_used": true,
  "quality_status": "green",
  "quality_reason": "usable_results",
  "filtered_count": 2,
  "filtered_reason": "intent_mismatch",
  "blocked": false,
  "block_reason": ""
}
```

MCP 文本输出带 ISO 8601 时间戳前缀：

```
[2026-06-03T14:45:12.693Z] Duckduckgo search results for "query":
1. Title
https://...
Snippet text
```

## 本地开发

```bash
# 无需 npm install —— 零依赖
npx wrangler dev --local --port 8789

# 测试
curl http://127.0.0.1:8789/health
curl -X POST http://127.0.0.1:8789/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_auto","arguments":{"query":"test","limit":3}}}'
```

## CI/CD

- **Smoke 测试**：每个 PR 触发 `.github/workflows/smoke.yml` — 对部署后的 Worker 运行 `tests/smoke_trace.mjs`
- **自动部署**：合并到 `main` 的 PR 触发 `.github/workflows/deploy.yml` — 构建并部署到 Cloudflare Workers
- **分支保护**：`main` 要求通过 smoke CI + PR 审查
- **CI 网络**：`CI_STRICT_NETWORKING` 环境变量 — `true`（本地）使用 `assert`，`false`（CI）使用 `warn`

## 项目结构

```
search-mcp-worker/
├── src/index.js              # 全部代码：MCP 路由、工具、防御层
├── tests/
│   ├── smoke_trace.mjs       # Smoke 测试套件
│   └── provider_sweep.mjs    # 全量 Provider 审计
├── .github/workflows/
│   ├── smoke.yml             # PR smoke CI
│   └── deploy.yml            # 合并后自动部署
├── wrangler.toml
├── package.json
└── README.md
```

## 已知限制

| 问题 | 原因 | 状态 |
|---|---|---|
| Bing 偶尔返回电商结果（如搜 "best pizza recipe" 返回 Best Buy） | Bing 算法对购物结果的偏见 | 不修——过滤会影响合法商业查询 |
| 搜狗在 CF Workers IP 下返回空结果 | 搜狗对数据中心 IP 返回降级内容（仅搜索建议） | 上游限制 |
| Archive.org `advancedsearch` 超时 | API 从 CF Workers 边缘节点不可达 | 上游限制 |
| 新浪新闻部分关键词返回空 | API 对某些关键词返回空 | 上游限制 |
| Arxiv 偶尔超时 | CF 边缘到 `export.arxiv.org` 的网络路径 | 临时性 |
| Lemmy 社区搜索覆盖范围 | 仅匹配硬编码的社区列表（linux/docker/rust 等） | 按需扩展 |

## 本项目不是

- 不是商业 SERP API 替代品
- 不是浏览器自动化平台或 JS 渲染爬虫
- 不是封闭平台的私有/认证连接器
- 不是完整的文章可读性引擎

## 许可证

GPL-3.0

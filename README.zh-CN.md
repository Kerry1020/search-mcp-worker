# search-mcp-worker

[English](./README.md) | 简体中文

一个单文件 Cloudflare Worker，通过一个 JSON-RPC 端点暴露 **53 个 MCP 工具**，覆盖网页搜索、页面抓取、PDF 解析、动态爬虫。零 npm 依赖、零数据库、零浏览器集群。

专为 LLM Agent 和自动化设计——一个稳定的搜索+工作接口，替代拼凑多个外部服务。

## 架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                       │
├──────────────┬───────────────┬──────────────┬──────────────┬──────────┤
│  通用搜索    │  垂直源       │  抓取工具    │  PDF 解析    │  动态    │
│  (12)        │  (29)         │  (7)         │  (2)         │  爬虫(4) │
├──────────────┼───────────────┼──────────────┼──────────────┼──────────┤
│ HTML 解析    │ JSON API +    │ HTML→文本 /  │ FlateDecode  │ 纯worker │
│ + 多引擎     │ HTML 解析     │ robots /     │ + 二进制     │ 策略链   │
│ 回退链       │ + finalize    │ sitemap /    │ 流扫描       │ 无浏览器 │
│              │               │ md / 抽取    │ (零依赖)     │ 依赖     │
├──────────────┴───────────────┴──────────────┴──────────────┴──────────┤
│  防御层                                                              │
│  熔断器 │ 指数退避 │ 意图偏移检测 │ finalize 管线                     │
└──────────────────────────────────────────────────────────────────────┘
```

外加 1 个编排器：`search_and_scrape` —— 把搜索结果接入并行全文抓取。

全部代码在 `src/index.js`，无构建步骤。

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
# → {"ok":true,"build":{"sha":"b39bd1e","time":"..."}}
```

## 工具一览（53 个）

53 个工具按 **6 个功能层 + 1 个辅助桶** 组织。所有工具共享同一套防御层（熔断器、指数退避、意图偏移检测）。

### 第一层 — 通用网页搜索（12 个）

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

### 第二层 — 垂直源（29 个）

结构化 JSON API（22 个）+ HTML 抓取源（7 个）。所有结果都过 `finalizeVerticalSearchResults` 做意图偏移检测和噪声过滤。

#### 2a. JSON API（22 个）

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

#### 2b. HTML 抓取（7 个）

| 工具 | 来源 | URL 模式 | 解析策略 |
|---|---|---|---|
| `search_bbc` | BBC | `bbc.co.uk/search?q=` | HTML 解析 |
| `search_bing_news` | Bing 新闻 | `bing.com/news/search?q=&format=rss` | RSS 优先，HTML 回退 |
| `search_sina_news` | 新浪新闻 | `search.sina.com.cn/api/news?q=`(JSON) → HTML 回退 | JSON API 优先；回退到 `searchSiteTargetVertical` 限定 `host=sina.com.cn` |
| `search_163_news` | 网易新闻 | `163.com/search?keyword=`(HTML) | HTML 解析 → `extract163SearchResults`；回退到站内定向搜索 |
| `search_paperswithcode` | Papers With Code | `api.semanticscholar.org/graph/v1/paper/search` | 后端使用 Semantic Scholar API |
| `search_osm` | OpenStreetMap | `nominatim.openstreetmap.org/search?q=&format=jsonv2` | 地理编码；返回经纬度 + OSM 链接 |
| `search_archive` | Archive.org | `archive.org/wayback/available?url=` + `advancedsearch.php?q=` | Wayback Machine 查询 + 高级搜索；**当前受 CF Workers IP 超时限制** |

### 第三层 — 抓取工具（7 个）

单 URL 抓取 + 结构化辅助工具。全部从 `fetchTextWithResponse` 出发，叠加不同后处理。

| 工具 | 用途 | 实现 |
|---|---|---|
| `fetch_url` | 抓取任意 URL，提取可读文本 | `fetchTextWithResponse` → `extractReadableContent`（文章提取）→ 按 `max_chars` 截断 |
| `fetch_metadata` | 从 URL 提取元数据 | 抓取 HTML（128KB 上限）→ 解析 `<title>`、`<meta>` description/og:image 等 → 返回结构化元数据 |
| `fetch_github_file` | 从 GitHub 获取指定文件 | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` → 返回原始文本 |
| `fetch_robots` | 抓取 + 解析 `robots.txt` | 从 URL 派生 origin → 抓 `/robots.txt` → 解析 user-agent 块（Allow/Disallow）+ Sitemap 声明 |
| `fetch_sitemap` | 抓取 + 解析 sitemap.xml | 默认抓首页 → 解析 `<urlset>` 或 `<sitemapindex>`；`recursive=true` 时递归抓子 sitemap |
| `fetch_html_to_markdown` | `fetch_url` 的 markdown 版本 | `fetchTextWithResponse` → cheerio-less DOM walker → 保留 H1-H3/链接/列表/代码块，去掉 `<script>`/`<style>`/`<nav>`/`<footer>` |
| `fetch_html_extract` | 抓取 + 结构化抽取 | 优先调 Workers AI binding（无 binding 时 graceful error），fallback 返原始文本 |

### 第四层 — PDF 解析（2 个）

纯 worker PDF 文本抽取。无 npm 依赖、无外部服务。

| 工具 | 用途 | 实现 |
|---|---|---|
| `pdf_parse` | 抓 URL PDF 并提取纯文本 | `fetch(url)` → `extractPdfTextAsync`（按字节扫描 `stream...endstream` 块）→ `DecompressionStream("deflate")` 解压 FlateDecode 流 → 跳过字体/图像/XObject 非文本流 → 按 `BT...ET` + `Tj/TJ` 算子提取文字 |
| `pdf_to_markdown` | 抓 PDF → 轻量 Markdown 化 | 复用 `pdf_parse` → 添加 `# PDF Document` 元数据头 → 按页估算插 `---` 分页符 |

**实现要点：**

- **二进制扫描**：按字节定位 `stream`（115,116,114,101,97,109）和 `endstream` 标记 → 不依赖 regex 切二进制流。
- **FlateDecode 解压**：浏览器原生 `DecompressionStream("deflate")`。
- **文本流过滤**：`looksLikeTextStream()` 检测 stream 解压后是否含 PDF 文本算子（BT/Tj/TJ/Td/Tm/Tf）或可打印 ASCII 比例 > 0.85；字体程序/图像/XObject 被跳过。
- **噪声过滤**：禁用 Strategy 1（outline/metadata）和 Strategy 2（Info-dict 元数据），只走 Strategy 3（解压后的真实 content stream）。这能干净处理 LaTeX 生成的 arXiv 论文及其他 LaTeX-heavy PDF。
- **已知限制**：扫描的纯 PDF（纯图像型）需配合外部 OCR —— worker 内不做 OCR。

### 第五层 — 动态爬虫（4 个）

纯 worker 爬虫，不依赖浏览器。CF 账户无 Browser Rendering entitlement，所以这些工具用分层启发式策略链最大化覆盖。

| 工具 | 用途 | 策略链 |
|---|---|---|
| `crawl_scrape` | URL → clean markdown | (1) 检测 Next.js `__NEXT_DATA__` / Nuxt `__NUXT__` / SvelteKit / Astro 内嵌 JSON；(2) 抓 `application/ld+json` JSON-LD；(3) 抓 OG/Twitter meta；(4) cheerio-less DOM walker 转 markdown；(5) 兜底 Archive.org Wayback 快照 |
| `crawl_screenshot` | URL 内容快照 | DOM 派生快照：title + h1-h3 层级 + 链接 + 摘要文本 + OG/Twitter + html sha256。**不返 PNG** —— 账户无 BR entitlement |
| `crawl_pdf` | URL → PDF 文本 | 复用 `pdf_parse` / `pdf_to_markdown`；PDF 是静态二进制无需 JS 渲染 |
| `crawl_extract` | URL → 结构化字段（无 AI） | HTML 启发式抽取：(1) JSON-LD 块；(2) OG/Twitter meta；(3) schema.org microdata `itemprop`；(4) `.price`/`.author`/`.title` 等 heuristic class 选择器 → 类型强制（string/number/boolean/array） |

### 第六层 — 智能编排（1 个）

| 工具 | 用途 | 实现 |
|---|---|---|
| `search_and_scrape` | search → 自动抓全文 | 编排型工具：内部调 `search_auto` 拿候选 URL → 4 并发调 `fetch_url` 或 `pdf_parse`（URL 含 `.pdf` 后缀或 content-type 是 PDF 时自动路由 PDF 路径）→ 返 `{query, results[], stats{elapsed_ms, succeeded, failed, concurrency: 4, deadline_hit}}`，30s 总超时 |

### 辅助工具（3 个）

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

### JSON 看门狗（PR #21）

`parseLenientJsonObject` 内置 8KB 门禁：输入超过 8192 字节时跳过字符级修复循环，直接返回 `null`。防止畸形大文本导致 Cloudflare Worker CPU 超时。

### 样式改版韧性（PR #21）

`extractGenericLinks` 在类名解析失败时采用两阶段降级：

1. **块级容器预筛**：扫描 `<li>`/`<div>`/`<section>`/`<article>` 容器内的外链和标题，输出带摘要的结果
2. **扁平 `<a>` 回退**：块级不够时，扫描所有 `<a>` 标签配合噪声 URL 过滤

即使上游完全移除 CSS 类名，仍能保持 85%+ 召回率。

### `_meta.parser` 可观测性（PR #23）

每个搜索响应包含 `_meta` 字段，标明结果的解析来源：

```json
{
  "ok": true,
  "results": [...],
  "_meta": { "parser": "exact" }
}
```

- `"exact"`：主解析器命中
- `"skeleton_fallback"`：通用骨架提取器降级命中

LLM Agent 可据此评估结果质量，在连续触发 `skeleton_fallback` 时主动切换到垂直数据源。

### Finalize 防御保障（PR #24）

finalize 防御层包含防过杀保护：

- **小样本保护**：≤2 条结果不会被判定为 `generic_wrapper_results` 全员击杀
- **跨语言放行**：纯英文查询匹配到中文结果时跳过 `intent_mismatch` 判定
- **搜索引擎域名豁免**：`baidu.com/link?url=`、`/s?wd=`、`/item/` 路径下的结果不被自动判定为搜索引擎噪声

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
  "block_reason": "",
  "_meta": { "parser": "exact" }
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
- **扩展 Smoke**：`tests/smoke_layer1_4.mjs` 对 11 个 Layer 1-4 工具（PDF + 抓取辅助）做端到端测试
- **自动部署**：合并到 `main` 的 PR 触发 `.github/workflows/deploy.yml` — 构建并部署到 Cloudflare Workers
- **分支保护**：`main` 要求通过 smoke CI + PR 审查
- **CI 网络**：`CI_STRICT_NETWORKING` 环境变量 — `true`（本地）使用 `assert`，`false`（CI）使用 `warn`

## 项目结构

```
search-mcp-worker/
├── src/index.js              # 全部代码：MCP 路由、53 个工具、防御层
├── tests/
│   ├── smoke_trace.mjs       # 核心 smoke 测试套件（在线）
│   ├── smoke_layer1_4.mjs    # 扩展 smoke —— 11 个 Layer 1-4 工具，39 个 assertion
│   ├── parser_harness.mjs    # 解析器单元测试（离线，25 个断言）
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
| `crawl_screenshot` 返回文本快照而非 PNG | CF 账户无 Browser Rendering entitlement | 用 BR-enabled 账户拿真截图 |
| PDF 解析器处理纯图像（扫描件）PDF | worker 内无 OCR | 扫描件需外接 OCR 服务 |
| `crawl_scrape` 处理 JS 渲染 SPA | 纯 worker 无 JS 执行 | 用 Archive.org Wayback 兜底或 BR-enabled endpoint |

## Agent 行为指南

LLM Agent（Claude、Cursor 等）调用这些工具时，应注意以下信号：

### `_meta.parser`（搜索工具）

每个搜索响应包含 `_meta.parser`：

| 值 | 含义 | Agent 行为 |
|---|---|---|
| `"exact"` | 主解析器匹配站点结构 | 高置信度 — 直接使用结果 |
| `"skeleton_fallback"` | 通用降级（站点布局变更） | 精度较低 — 用垂直工具（如 `search_github_repos`、`search_pubmed`）交叉验证 |

### `content_type: "challenge_page"`（fetch_url）

`fetch_url` 遇到反爬保护（WAF/JS 探测/IP 封锁）时：

| 信号 | 含义 | Agent 行为 |
|---|---|---|
| `content_type: "challenge_page"` + `status: 202` | 需要执行 JS — 纯 API 无法获取 | **不要**将文本当作正文内容，改用 `search_auto` 或其他来源 |
| `content_type: "challenge_page"` + `status: 403` | 数据中心 IP 被封锁 | 同上 — 切换搜索工具获取信息 |

### 推荐工具链

```
# 文章 / 博客内容
1. fetch_url           → 首选
2. crawl_scrape        → fetch_url 遇到 challenge_page 时改用此拿更干净 markdown
3. search_and_scrape   → 还没有 URL 时，先搜再自动抓

# PDF / 学术内容
1. pdf_to_markdown     → URL 结尾是 .pdf 或 content-type 是 PDF
2. pdf_parse           → 只需要纯文本时

# 站点级发现
1. fetch_robots        → 先查爬虫权限
2. fetch_sitemap       → 枚举可发现 URL
3. fetch_html_extract  → 从已知页面抽结构化字段
```

## 本项目不是

- 不是商业 SERP API 替代品
- 不是浏览器自动化平台或 JS 渲染爬虫
- 不是封闭平台的私有/认证连接器
- 不是完整的文章可读性引擎
- 不是 PDF OCR 服务

## 部署验证

- 在线 worker：`search-mcp.qdp.qzz.io/mcp`
- 最新部署版本：`200c5d7a-6e1c-40e5-af52-f232ead8285e`（wrangler 上传 291.55 KiB / gzip 60.51 KiB）
- 53 个工具在 CF 端全部端到端验证（curl `--resolve` 绕本地 DNS 污染）
- BabelTele 论文解析实测：arXiv 2606.19857（23 页 / 4.26 MB）→ 真实正文 85K 字符

## 许可证

本项目使用 Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International 许可证 —— 详见 [LICENSE](LICENSE) 文件。
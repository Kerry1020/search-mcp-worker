# search-mcp-worker

[![CI](https://github.com/Kerry1020/search-mcp-worker/actions/workflows/test.yml/badge.svg)](https://github.com/Kerry1020/search-mcp-worker/actions/workflows/test.yml)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6E56CF)](https://modelcontextprotocol.io)

[English](README.md) | 简体中文

跑在 Cloudflare Workers 上的多引擎网页搜索 MCP 服务，排序逻辑开源、可审计。

**一个排序逻辑完全开源、可审计的 MCP 搜索服务。**

你的 AI 不该只能信任 Tavily、Exa、Brave 的黑盒结果。在这里，你能看到**为什么**第 1 条排在第 2 条前面——所有排序决策都写在 `src/index.js` 里。

> **零按次计费。** 部署到你自己的 Cloudflare 账号一次即可（Workers 免费版：每天 10 万次请求）。
> **不是简单套壳。** 16 个通用网页搜索引擎 + 28 个垂直数据源，用加权 RRF（Reciprocal Rank Fusion，k=60）融合。每个引擎贡献 `weight / (60 + rank)`，所以被多个引擎同时排在前面的结果，会胜过只被单个引擎排第 1 的结果。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kerry1020/search-mcp-worker)

> **提示：** 如果部署时报 *"Unable to fetch repository contents"*，说明你的 Cloudflare 账号还没绑定 GitHub。先去 **[Workers & Pages → 创建 → 连接 Git](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)** 授权 **Cloudflare Workers & Pages** GitHub App，再回来点按钮即可。

## 适合谁 / 不适合谁

| ✅ 适合你，如果 | ❌ 不适合你，如果 |
|---|---|
| 你希望 AI 的搜索排序开源、可审计 | "别跟我讲怎么排，给结果就行" → 用 **Tavily MCP** |
| 你习惯自托管，更看重搜索质量而不是省事 | 你没有（也不想注册）Cloudflare 账号 |
| 除了 CF 免费额度，不想再付任何 API 费 | 你需要企业级 SLA、技术支持或合规保证 |
| 你认同"3 个引擎都排进前 5"比"1 个引擎排第 1"更可信 | 你只要一个单引擎代理 → 用 **Brave Search MCP** |

## 它有什么不一样

| 你 AI 现在的搜索 | 问题 | 用 search-mcp-worker |
|---|---|---|
| 单引擎 MCP（Brave、Google） | 单一视角，继承某一个索引的算法盲区 | 16 个通用引擎 + 28 个垂直源；`search_auto` 按查询意图选引擎，再用 RRF 融合 |
| 黑盒 API（Tavily、Exa） | 看不到也改不了排序——这条 SEO 垃圾凭什么排第 3？ | 排序代码完全公开。`assessEngineConfidence` → 5 道硬过滤 → RRF → tiebreaker，全在 `src/index.js` |
| 加分制（"3 个引擎都返回 = +3"） | 分不清"3 个引擎都排第 1"和"1 个排第 1、2 个排第 50" | **RRF(k=60)：** 分数取决于每个引擎给的名次，三次前 5（≈0.046）明显高于 #1 + #50 + #50（≈0.034） |

## 功能特性

一个 Cloudflare Worker，通过单个 JSON-RPC 端点暴露 **62 个 MCP 工具**（以 `tools/list` 实际返回为准）——通用网页搜索、垂直 API、页面抓取、PDF 解析、能识别 SPA 的爬取，以及"先搜后抓"的编排工具。运行时零 npm 依赖，无数据库，无浏览器集群。

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                          │
├──────────────┬───────────────┬──────────────┬──────────────┬─────────────┤
│  通用搜索    │  垂直源       │  抓取工具    │  PDF 解析    │  动态爬取   │
│  (17)        │  (28)         │  (7)         │  (2)         │  (4)        │
├──────────────┴───────────────┴──────────────┴──────────────┴─────────────┤
│  编排 (1): search_and_scrape          │   实用工具 (3)                   │
├──────────────────────────────────────────────────────────────────────────┤
│  排序管道                                                                │
│  引擎置信度 → 5 道硬过滤 → 3 类级联 → RRF(k=60) →                        │
│  Tiebreaker 链 → 域名多样性（窗口 8，每域最多 2）                        │
├──────────────────────────────────────────────────────────────────────────┤
│  防御层                                                                  │
│  熔断器 │ JUNK 软冻结 │ 指数退避 │ 健康日志                              │
└──────────────────────────────────────────────────────────────────────────┘
```

17 + 28 + 7 + 2 + 4 + 1 + 3 = **62** 个工具。Worker 入口就是单文件 `src/index.js`，没有构建步骤。

`POST /mcp` 支持的 JSON-RPC 方法：`initialize`（协议版本 `2025-03-26`）、`notifications/initialized`、`ping`、`tools/list`、`tools/call`，支持批量请求。响应是普通 JSON（不走 SSE 流）。

## 快速开始

1. 部署（点上面的按钮，或者 clone 后）：

   ```bash
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

2. 确认服务正常：

   ```bash
   curl https://<your-worker>.workers.dev/health
   # → {"ok":true,"name":"search-mcp-worker","version":"0.7.4","build":{...},"mcp_endpoint":".../mcp","tools":[...62 names...],"engine_health":{...},"circuit_breakers":{...}}
   ```

3. 接入 MCP 客户端（见 [MCP 客户端配置](#mcp-客户端配置)）：

   ```bash
   claude mcp add --transport http search https://<your-worker>.workers.dev/mcp
   ```

4. 试一次调用：

   ```bash
   curl -X POST https://<your-worker>.workers.dev/mcp \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_auto","arguments":{"query":"cloudflare workers","limit":3}}}'
   ```

## 使用 / 工具列表（62 个）

除特别说明外，所有搜索工具都接受 `query`（必填）和 `limit`（默认 5，最大 10）。所有搜索结果都经过同一套防御层（熔断器、JUNK 软冻结、指数退避、意图偏移检测）。

### `search_auto` 与 `auto_mode`

`search_auto` 是主入口，参数：`query`、`limit`、`auto_mode`、`engines`。

候选引擎列表的确定方式（`selectSearchAutoEngines`）：

| 输入 | 候选引擎 |
|---|---|
| `auto_mode: "full"` | 按意图选出的默认列表 **加上** 一份固定的 35 个引擎（去重后，普通英文查询共 38 个候选）。这种模式下 `engines` 参数会被**忽略**。 |
| `auto_mode` 为其他值或不传，且传了 `engines: [...]` | 完全按你给的引擎和顺序 |
| `auto_mode` 为其他值或不传，且没传 `engines` | 由 `detectSearchIntent` 决定的默认列表：中文、新闻、开发者、通用查询各有一份（15–19 个引擎，开头是 `brave`、`mojeek` 等） |

只有 `"full"` 是特殊值，其他任何值（包括 `"default"`）都按默认模式处理；响应里的 `auto_mode` 只会是 `"full"` 或 `"default"`。provider 被禁用的引擎（`x-<provider>-enabled: false` 或 `provider_set_config`）会从列表中剔除。

列表的执行方式（`searchAuto`），两种模式完全相同：

1. 跳过处于熔断或 JUNK 冻结状态的引擎。
2. 剩下的**前 4 个**引擎并发请求（竞速超时 12 秒）。
3. 只要有一个返回可用（green/yellow）结果，就把这批结果做 RRF 融合后立即返回。
4. 否则按顺序**逐个**尝试剩余引擎，遇到第一个返回可用结果的就停止。

所以 `"full"` 只是扩大了备选引擎池，并不会每次都把所有引擎查一遍。实际上一次响应最多融合约 4–5 个引擎。结果按（引擎列表, query, limit）缓存。

`engines` 可用的引擎名：`duckduckgo`、`bing`、`bing_global`、`bing_cn`、`bing_news`、`yahoo`、`google`、`yandex`、`baidu`、`naver`、`sogou`、`brave`、`qwant`、`ecosia`、`mojeek`、`startpage`、`searchmysite`、`marginalia`、`wiby`、`archive`、`wikipedia`、`wikidata`、`wiktionary`、`semantic_scholar`、`arxiv`、`pubmed`、`paperswithcode`、`crossref`、`hackernews`、`stackoverflow`、`reddit`、`reddit_rss`、`npm`、`devto`、`crates`、`pypi`、`github_repos`、`mastodon`、`peertube`、`lemmy`、`bbc`、`sina_news`、`163_news`、`sec_edgar`、`osm`、`openlibrary`、`musicbrainz`、`find_rss`、`ollama`、`parallel`。不认识的名字会被静默跳过。

### Layer 1 —— 通用网页搜索（17 个）

解析搜索结果 HTML 页。大多数引擎都有多级回退链，并轮换 User-Agent。**(indie)** 表示独立 / 小众网络索引。

| 工具 | 引擎 | 关键参数 | URL / 回退策略 |
|---|---|---|---|
| `search_auto` | 多引擎 RRF | `auto_mode`、`engines` | 见上文 |
| `search_duckduckgo` | DuckDuckGo | `region`（默认 `us-en`） | 3 次尝试：`noai.duckduckgo.com` → `lite.duckduckgo.com/lite/`（POST）→ `html.duckduckgo.com/html/` |
| `search_bing` | Bing（美国） | — | `bing.com/search?q=`；主参数 → 备用参数 |
| `search_bing_global` | Bing（国际） | — | `bing.com` + `cn.bing.com` 两条路由，主参数 → 备用参数 |
| `search_bing_cn` | Bing（中国） | — | `cn.bing.com/search?q=`，针对国内优化的请求头 + 备用参数 |
| `search_yahoo` | Yahoo | — | `search.yahoo.com/search?p=`；3 次尝试（nojs → 标准 → 最简请求头），自动处理 consent 页 |
| `search_google_web` | Google | — | `google.com/search?q=`；3 次尝试（GSA UA → Chrome UA + `gbv=1` → 裸请求），可能被限流 |
| `search_baidu` | 百度 | — | `m.baidu.com` HTML → `baidu.com/s?tn=json` → 桌面版 HTML |
| `search_yandex` | Yandex | `language` | `yandex.com/search/?text=`；检测到验证码返回 `blocked: true` |
| `search_naver` | Naver | — | `search.naver.com`，单次请求 |
| `search_sogou` | 搜狗 | — | `sogou.com/web?query=`；H3+A 正则 → 通用链接提取，过滤搜索建议噪声 |
| `search_archive` | Archive.org | `mode`（`search` / `wayback`） | Wayback 可用性 + `advancedsearch.php`；从 CF 边缘访问**经常超时** |
| `search_startpage` | Startpage | — | `startpage.com/sp/search?q=`，同时也是 Reddit 的代理 |
| `search_mojeek` | Mojeek（自有索引） | — | `mojeek.com/search?q=` |
| `search_searchmysite` | searchmysite **(indie)** | — | `searchmysite.net/search?q=` |
| `search_marginalia` | Marginalia **(indie)** | — | `search.marginalia.nu/search?query=` |
| `search_wiby` | Wiby.me **(indie)** | — | `wiby.me/?q=`，纯 HTML |

### Layer 2 —— 垂直数据源（28 个）

所有结果都经过 v3 finalize 管道（引擎置信度 → 5 道硬过滤 → 按类型级联排序）。

#### 2a. JSON / XML API（23 个）

| 工具 | 数据源 | 关键参数 | 实现细节 |
|---|---|---|---|
| `search_arxiv` | arXiv | — | `export.arxiv.org/api/query`（Atom XML）；失败时退到站内定向搜索 |
| `search_pubmed` | PubMed | — | esearch → efetch；技术信号检测，避免生物医学查询混进技术噪声 |
| `search_semantic_scholar` | Semantic Scholar | — | `api.semanticscholar.org/graph/v1/paper/search`；HTTP 429 时退到 arXiv；可通过 `provider_set_config`（`provider: "semantic_scholar"`）设置 API key |
| `search_paperswithcode` | Papers With Code | — | 后端用的是 Semantic Scholar API |
| `search_crossref` | Crossref | — | `api.crossref.org/works?query=`，带 DOI 的论文 |
| `search_hackernews` | Hacker News | — | `hn.algolia.com/api/v1/search?tags=story` |
| `search_stackoverflow` | Stack Exchange | `site`（默认 `stackoverflow`） | `api.stackexchange.com/2.3/search/advanced` |
| `search_reddit` | Reddit | `subreddit` | `reddit.com/search.json`；Reddit 通常对 CF IP 返回 403，建议用 `search_reddit_rss` |
| `search_npm` | npm | — | `registry.npmjs.org/-/v1/search` |
| `search_pypi` | PyPI | — | 先 HTML 搜索，再用 `pypi.org/pypi/{name}/json` 精确查找 |
| `search_crates` | crates.io | — | `crates.io/api/v1/crates?q=` |
| `search_github_repos` | GitHub | — | `api.github.com/search/repositories?sort=stars`，无需认证 |
| `search_devto` | dev.to | — | 三级标签策略：组合标签 → 首词标签 → `?q=` |
| `search_mastodon` | Mastodon | `instance`（默认 `mastodon.social`） | `/api/v2/search` + 话题标签时间线 |
| `search_lemmy` | Lemmy | `instance`（默认 `lemmy.world`） | 已知话题走社区回退；lemmy.world / lemmy.ml / programming.dev |
| `search_peertube` | PeerTube | — | `search.joinpeertube.org/api/v1/search/videos` |
| `search_wikipedia` | Wikipedia | `language` | `{lang}.wikipedia.org/w/api.php`，HTML 兜底 |
| `search_wikidata` | Wikidata | — | `wbsearchentities`，返回实体 ID + 描述 |
| `search_wiktionary` | Wiktionary | `language`（无 `limit`） | `{lang}.wiktionary.org/w/api.php` |
| `search_openlibrary` | Open Library | — | `openlibrary.org/search.json` |
| `search_musicbrainz` | MusicBrainz | — | `musicbrainz.org/ws/2/recording` |
| `search_sec_edgar` | SEC EDGAR | `form_type`（10-K、10-Q、8-K 等） | `efts.sec.gov/LATEST/search-index` |
| `search_osm` | OpenStreetMap | — | `nominatim.openstreetmap.org/search?format=jsonv2`，返回经纬度 + OSM 链接 |

#### 2b. HTML / RSS 抓取（5 个）

| 工具 | 数据源 | 关键参数 | 解析策略 |
|---|---|---|---|
| `search_bbc` | BBC | — | `bbc.co.uk/search` HTML |
| `search_bing_news` | Bing 新闻 | — | `bing.com/news/search?format=rss`，HTML 兜底 |
| `search_sina_news` | 新浪新闻 | — | JSON API → 站内定向搜索兜底（`sina.com.cn`） |
| `search_163_news` | 网易新闻 | — | HTML 解析 → 站内定向搜索兜底 |
| `search_reddit_rss` | 经 Startpage 搜 Reddit | `sort`（`relevance`/`new`/`top`/`comments`），`limit` 最大 20 | Reddit 封了 CF Worker IP，所以通过 Startpage 搜 Reddit，只保留 reddit.com 链接 |

> 独立引擎（`search_wiby`、`search_marginalia`、`search_searchmysite`）归在 Layer 1。

### Layer 3 —— 抓取工具（7 个）

| 工具 | 关键参数 | 用途 / 实现 |
|---|---|---|
| `fetch_url` | `url`、`maxChars` | 抓取任意公开 URL → 可读文本；遇到反爬页时返回 `content_type: "challenge_page"` |
| `fetch_metadata` | `url` | 标题、描述、canonical URL、状态码、content type |
| `fetch_github_file` | `owner`、`repo`、`path`、`ref`、`maxChars` | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` |
| `fetch_robots` | `url`、`maxChars` | 推导出站点根 → `/robots.txt` → 解析 Allow/Disallow 和 Sitemap |
| `fetch_sitemap` | `url`、`recursive`、`maxUrls` | 解析 `<urlset>` / `<sitemapindex>`；`recursive=true` 时递归子 sitemap |
| `fetch_html_to_markdown` | `url`、`maxChars` | DOM 遍历 → markdown（保留 H1–H3、链接、列表、代码），去掉 script/style/nav/footer |
| `fetch_html_extract` | `url`、`schema` | 本意是用 Workers AI（Llama 3.1 8B）抽取字段。**目前总是返回 `ok: false`（"Workers AI unavailable"）**：`wrangler.toml` 里没有 `[ai]` 绑定，fetch handler 也没有把 `env` 传给工具。请改用 `crawl_extract`。 |

### Layer 4 —— PDF 解析（2 个）

纯 Worker 内完成 PDF 文本提取，无 npm 依赖，无外部服务。

| 工具 | 关键参数 | 实现 |
|---|---|---|
| `pdf_parse` | `url`、`maxChars` | 二进制扫描 `stream…endstream` 块 → FlateDecode 用 `DecompressionStream("deflate")` 解压 → 跳过字体/图片/XObject 流 → 提取 `BT…ET` + `Tj/TJ` 文本 |
| `pdf_to_markdown` | `url`、`maxChars` | 同样的提取逻辑，额外加 `# PDF Document` 头和 `---` 分页符 |

**实现说明：**
- **二进制扫描**：按字节定位 `stream` / `endstream`，不对二进制数据跑正则。
- **文本流过滤**：`looksLikeTextStream()` 检查是否含 PDF 文本操作符（BT/Tj/TJ/Td/Tm/Tf），或可打印 ASCII 比例 > 0.85。
- **降噪**：策略 1（大纲/元数据）和策略 2（Info 字典元数据）已禁用，只用策略 3（解压后的正文流），LaTeX 生成的 arXiv 论文也能提取得很干净。
- **已知限制**：纯图片（扫描版）PDF 需要外部 OCR。

### Layer 5 —— 动态爬取（4 个）

不依赖浏览器（没有 Browser Rendering），用多层启发式策略链尽量覆盖。

| 工具 | 关键参数 | 策略链 |
|---|---|---|
| `crawl_scrape` | `url`、`maxChars`、`useCache` | (1) Next.js `__NEXT_DATA__` / Nuxt / SvelteKit / Astro 内嵌 JSON；(2) JSON-LD；(3) OG/Twitter meta；(4) DOM 遍历 → markdown；(5) Archive.org Wayback 兜底 |
| `crawl_screenshot` | `url`、`maxLinks` | 基于 DOM 的内容快照：标题、h1–h3、链接、摘要、OG/Twitter、html sha256。**不出 PNG** |
| `crawl_pdf` | `url`、`format`（`text`/`markdown`）、`maxChars` | 复用 `pdf_parse` / `pdf_to_markdown` |
| `crawl_extract` | `url`、`schema` | 不用 AI：JSON-LD → OG/Twitter → schema.org `itemprop` → `.price`/`.author`/`.title` 等启发式选择器，并做类型转换 |

### Layer 6 —— 编排（1 个）

| 工具 | 关键参数 | 实现 |
|---|---|---|
| `search_and_scrape` | `query`、`limit`（最大 10）、`maxCharsPerPage`（默认 8000，最大 20000）、`engines`、`recencyDays` | 先调 `search_auto` 拿候选 URL → 4 路并发 `fetch_url` / `pdf_parse`（PDF 自动分流）→ 返回 `{query, results[], stats{elapsed_ms, succeeded, failed, concurrency, deadline_hit}}`。总超时 30 秒。`recencyDays` 会被透传，但 `search_auto` 目前并未使用它。 |

### 实用工具（3 个）

| 工具 | 关键参数 | 用途 |
|---|---|---|
| `instant_answer` | `query` | DuckDuckGo Instant Answer API（`api.duckduckgo.com/?format=json`） |
| `find_rss` | `url` | 发现站点的 RSS/Atom 订阅源 |
| `debug_capture_search_html` | `engine`（bing / yahoo / yandex）、`query`、`limit`、`language`、`maxChars` | 返回搜索页的一段原始 HTML 样本，用于调试解析器 |

### 隐藏工具（不在 `tools/list` 中）

> **注意：** `TOOLS` 里还定义了 16 个工具，但被 `NON_PUBLIC_TOOL_NAMES` 从 `tools/list`（以及 `/health`）中过滤掉了。只要知道名字，**仍然可以通过 `tools/call` 调用**。隐藏的原因是它们属于运维/管理工具，或者从 Cloudflare IP 访问不稳定。
>
> - 搜索类：`search_brave`（HTML 抓取；`search_auto` 内部仍会用 `brave`）、`search_qwant`、`search_ecosia`、`search_ollama`（需要 Ollama API key）、`search_parallel`（需要 Parallel API key）。
> - Provider 管理：`provider_list`、`provider_get_config`、`provider_set_config`、`provider_set_bing`、`provider_set_brave`、`provider_set_jina`、`provider_set_ollama`、`provider_set_parallel`、`provider_set_searxng`、`provider_set_serpapi`、`provider_set_tavily`。它们读写当前 isolate 内存里的 `PROVIDER_CONFIG`（不持久化，返回时 API key 会打码）。真正被引擎用到的 API key 只有 `ollama`、`parallel` 和 `semantic_scholar`；`tavily`、`jina`、`searxng`、`serpapi` 的 key 只是存着，没有任何代码使用。`brave`、`bing`（覆盖 `bing_global` / `bing_cn` / `bing_news`）、`ollama`、`parallel`、`semantic_scholar` 的 `enabled` 开关会把对应引擎从 `search_auto` 中移除。

## 配置

没有必需的环境变量、secret 或绑定——`wrangler.toml` 只设置了 `name`、`main` 和 `compatibility_date`。可选的 provider 配置通过**每次请求的 HTTP 头**传入（由 MCP 客户端在每次调用时带上）：

| Name | Required | Secret | Default | Description |
|---|---|---|---|---|
| `x-ollama-api-key`（请求头） | 否 | 是 | — | `ollama` 引擎的 API key（`search_ollama` 或 `engines: ["ollama"]`） |
| `x-ollama-base-url`（请求头） | 否 | 否 | `https://api.ollama.com/v1/web-search` | Ollama web-search 端点 |
| `x-parallel-api-key`（请求头） | 否 | 是 | — | `parallel` 引擎的 API key |
| `x-parallel-base-url`（请求头） | 否 | 否 | `https://api.parallel.ai/v1/search` | Parallel 搜索端点 |
| `x-<provider>-enabled`（请求头） | 否 | 否 | `true` | 设为 `false` 时，本次请求的 `search_auto` 不使用该 provider 的引擎。provider：`brave`、`bing`、`ollama`、`parallel`、`semantic_scholar`（`tavily`、`jina`、`searxng`、`serpapi` 也接受但不起作用） |
| `OLLAMA_API_KEY`、`PARALLEL_API_KEY`（环境变量） | 否 | 是 | — | 最后的兜底，从 `process.env` 读取。只有开启 `nodejs_compat` 兼容性标志时才可能读到（随附的 `wrangler.toml` 没开），否则请用上面的请求头 |
| `CLOUDFLARE_API_TOKEN`（GitHub Actions secret） | 仅 CI 部署需要 | 是 | — | `.github/workflows/deploy.yml`（`cloudflare/wrangler-action`）使用 |

只要请求带了改变 provider 配置的请求头，就会绕过 `search_auto` 的结果缓存。

## MCP 客户端配置

Worker 没有内置认证，不需要传认证头。

**Claude Code：**

```bash
claude mcp add --transport http search https://<your-worker>.workers.dev/mcp
# 可选：每次请求带上 provider key
claude mcp add --transport http --header "x-ollama-api-key: <key>" search https://<your-worker>.workers.dev/mcp
```

**Claude Desktop / 通用 JSON（通过 mcp-remote）：**

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<your-worker>.workers.dev/mcp"]
    }
  }
}
```

能直接连接远程 HTTP 服务的客户端，也可以用 `{"url": "https://<your-worker>.workers.dev/mcp"}`。

## 安全说明

- **没有认证。** 代码不检查任何 `Authorization` 头或 token，所以也没有可设置的认证 secret。知道 URL 的人都能调用所有工具，包括隐藏的 `provider_*` 工具。CORS 为 `Access-Control-Allow-Origin: *`。
- `provider_set_*` / `provider_set_config` 修改的是 isolate 级别的 `PROVIDER_CONFIG`，一个调用方可以改掉（或塞入 API key 影响）同一 isolate 处理的其他请求，直到 isolate 被回收。API key 优先用每次请求的请求头传。
- 抓取 / 爬取 / PDF 工具会从你的 Worker 发起对任意 URL 的请求，每次调用都消耗你的 Workers 配额。
- 公开部署时，建议放在 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) 或其他带认证的网关后面，或者别公开 URL。

## 排序管道 v3（详解）

排序分两层：**单引擎 finalize**（每个引擎的结果进入跨引擎合并前）和**跨引擎合并**（RRF + tiebreaker + 多样性）。

### 单引擎 Finalize

```
原始结果
  │
  ├─ 0. 引擎置信度评估（4 个信号）
  │     • 域名集中度（≥50% 同二级域名 = 信号）
  │     • 标题多样性（不同标题 / 总数 ≤ 60% = 信号）
  │     • 空摘要率（≥60% 摘要 < 20 字 = 信号）
  │     • 广告/赞助率（≥30% 含 "Sponsored/Ad/广告/推广" = 信号）
  │     0-1 信号 → HIGH（取前 15）| MEDIUM（8）| LOW（3）| JUNK（0）
  │     JUNK 事件：recordEngineJunk → 连续 2 次 → 1min 软冻结
  │
  ├─ 1. 5 道硬过滤（任一命中 = 丢弃）
  │     第 1 道：isGenericWrapperResult（搜索页、广告、赞助）
  │     第 2 道：isHardIntentMismatchResult（离题）
  │     第 3 道：isLowTrustResult（CJK SEO 垃圾，如 .org.cn 含年份）
  │     第 4 道：shouldDropVerticalResultType（有更优类型时）
  │     第 5 道：isEngineSelfPage（引擎自域/help/captcha/snippet == title）
  │
  ├─ 2. 按类型级联排序
  │     类型 A（网页搜索）：
  │       L1：标题匹配比（≥100% / ≥80% / ≥50% / <50%）
  │       L2：时效衰减（≤2yr / 2-5yr / >5yr / 无日期 = 居中）
  │       L3：内容信息量（摘要 ≥200 / ≥100 / <100 字）
  │       L4：原始排名
  │     类型 B（API）：精确名匹配 → API 顺序 → 异常沉底
  │     类型 C（新闻）：时间桶（24h / 7d / 30d / 旧）→ 桶内标题匹配
  │
  └─ 3. 置信度截断（HIGH=15, MED=8, LOW=3, JUNK=0）
```

### 跨引擎合并（RRF）

```
所有引擎的过滤后结果
  │
  ├─ 1. 模糊去重
  │     通道 A：URL 精确匹配
  │     通道 B：同域名 + 标题相似度 ≥ 0.85（Levenshtein）
  │     命中：保留更长摘要/标题，合并引擎列表
  │
  ├─ 2. RRF 打分
  │     finalScore = Σ 命中引擎 { engineWeight / (60 + rank) }
  │     engineWeight = base × queryTypeMult × healthMult
  │     base:  startpage/google=1.2, bing_*=1.1, yahoo/brave/duckduckgo=1.0, indie=0.5
  │     queryTypeMult: 开发者→github/stackoverflow/npm/devto/hackernews ×1.5, 新闻→bing_news/bbc ×1.5,
  │                    CJK→baidu/sogou/bing_cn ×1.3, 学术→arxiv/semantic_scholar/pubmed/paperswithcode ×1.5
  │     healthMult: block_rate>50% → ×0.3, >30% → ×0.6, 否则 ×1.0
  │
  ├─ 3. Tiebreaker 链（顺序判定，非加分）
  │     (1) 命中引擎数更多
  │     (2) 标题含查询 token 更多
  │     (3) 标题+摘要更长（信息量更多）
  │     (4) 域名权威（gov/edu > org > 其他）
  │     (5) 结果类型（article/question/note > thread > 其他）
  │
  └─ 4. 域名多样性（滑动窗口）
        窗口大小 8，每域名最多 2 条
        超限 → 延后 → 主轮走完再追加
```

### v3 改了什么

排序管道在 2026-06-27 重写，用多层架构替换了原来 30 个常数相加的打分方案：

| 层 | 改前 | 改后 |
|---|---|---|
| 单引擎打分 | 30 个硬编码常数相加（rank×3、type ±90、token ×14、CJK +60、gov +35...） | 3 类级联（A: 网页搜索 / B: API / C: 新闻）+ 顺序判据 |
| 引擎健康 | 单一二元熔断器（3 次 blocked → 冻结 5min） | 新增 4 信号置信度评估（HIGH/MED/LOW/JUNK）+ JUNK 软冻结（连续 2 次 → 跳过 1min）+ 每引擎 `block_rate` 健康系数 |
| 跨引擎合并 | URL 精确去重 + 多源加分 | URL 精确 + 同域名模糊去重 + RRF(k=60) 三层引擎权重（base × query-type × health）+ 5 级 tiebreaker 链 + 滑动窗口域名多样性 |
| 结果类型 | 分类后当加分项 | 硬预过滤（按引擎的丢弃规则），不参与打分 |

核心思路：加分模型分不清"3 个引擎都把它排进前 5"和"3 个引擎只是都返回了它"，基于名次的融合可以。

### 近期修复：Yahoo `id="web"` ol 锚点（2026-06-28，提交 `dfdf485`）

Yahoo 结果页里有**多个** `<ol class="reg searchCenterMiddle">`：侧栏导航和 `<div id="web">` 里的真实结果。围绕 `id="web"` 截取的 180KB 窗口把两者都包进去了，lazy 的 `<ol…>[\s\S]*?<\/ol>` 正则先匹配到导航，解析器只好退到通用链接提取。修复方法是只在 `id="web"` **之后**的子串里找 ol；同一提交重写了 `parseYahooBlock`，沿 `<a …>…<h3>…</h3>…</a>` 解析，找不到时退到 `r.search.yahoo.com/_ylt=…/RU=…` 跳转链接。

| 指标（query=`python list comprehension`，limit=3） | 改前 | 改后 |
|---|---|---|
| 结果数 | 0（靠 fallback 救场） | 3 |
| Parser | `skeleton_fallback` 或 undefined | `exact` |
| 首条结果 | n/a | `List Comprehension in Python - GeeksforGeeks` |

## 防御层

### 熔断器

按引擎计：累计 3 次 blocked/验证码响应后冻结 5 分钟，之后自动恢复。

```
引擎 blocked → recordEngineBlocked() → failures++
3 次失败 → frozenUntil = now + 5min
下次请求 → isEngineCircuitBroken() → true → 跳过该引擎，试下一个
5min 后 → 自动解除
```

状态存在 isolate 内存里，所以按 isolate 独立，冷启动后清零。

### JUNK 软冻结

针对"没被封、但返回垃圾页"的引擎做更短周期的软冻结：

```
引擎返回 JUNK 置信度 → recordEngineJunk() → count++
连续 2 次 JUNK → frozenUntil = now + 1min
下次请求 → isEngineJunkFrozen() → true → 跳过该引擎
引擎返回非 JUNK → resetEngineJunk() → 计数清零
```

### 引擎健康日志

每个引擎维护最近 1 小时的事件日志（`success / blocked / empty / junk`），通过 `/health` 的 `engine_health` 暴露。它驱动 RRF 中的 `_healthWeightMultiplier`（`block_rate > 50% → ×0.3, > 30% → ×0.6`，事件数 ≥3 才生效）。

### 指数退避重试

针对 502/503/504 和网络错误：`200ms * 2^attempt + random(0, 50ms)` 抖动，默认重试 1 次。

### 意图偏移检测

**`isHardIntentMismatchResult`** 丢弃明显不相关的结果：
- 英文：长度 ≥ 3 的字母 token 在标题+摘要里整词匹配，覆盖率 < 50% 视为不匹配。
- CJK：查询字符在标题+摘要里零命中视为不匹配。
- 按源定制：BBC 丢非字母噪声；PubMed 丢技术与生物医学的交叉污染。

### Finalize 防护

- **小样本保护**：≤2 条结果时不会被当作 `generic_wrapper_results` 整体丢弃。
- **跨语言放行**：纯英文查询命中中文结果时跳过 `intent_mismatch`。
- **搜索引擎 host 例外**：`baidu.com/link?url=`、`/s?wd=`、`/item/` 路径不会被当作搜索引擎噪声自动丢弃。

### JSON 看门狗

`parseLenientJsonObject` 对超过 8192 字节的输入跳过逐字符修复，直接返回 `null`，避免上游返回畸形大 payload 时 Worker CPU 超时。

### 抗样式变动

基于 class 的解析器失效时，`extractGenericLinks` 会 (1) 扫描含内部链接、标题 ≥ 6 字的 `<li>` / `<div>` / `<section>` / `<article>` 块，(2) 不够再退到扫描所有 `<a>` 标签并过滤噪声 URL。

## 响应格式

每次 `tools/call` 返回 `{ content: [{ type: "text", text }], structuredContent }`。搜索工具的 structuredContent 结构一致（以 `search_auto` 为例）：

```json
{
  "ok": true,
  "query": "cloudflare workers",
  "source": "auto",
  "results": [
    {
      "source": "startpage",
      "engine": "startpage",
      "url": "https://...",
      "title": "...",
      "snippet": "...",
      "engine_count": 2,
      "sources": ["startpage", "brave"]
    }
  ],
  "attempts": [
    { "engine": "brave", "ok": true, "quality_status": "green" },
    { "engine": "yahoo", "ok": false, "error": "junk_frozen" }
  ],
  "quality_status": "green",
  "quality_reason": "usable_results",
  "filtered_count": 2,
  "auto_mode": "default"
}
```

文本内容带 ISO 8601 时间戳前缀：

```
[2026-06-27T14:45:12.693Z] Search results for "query":
1. Title
   https://...
   Snippet text
```

## Agent 使用指南

### `content_type: "challenge_page"`（fetch_url）

| 信号 | 含义 | Agent 应对 |
|---|---|---|
| `content_type: "challenge_page"` + `status: 202` | 需要 JS 探测，页面得在浏览器里执行 | **不要**把返回文本当正文，改用 `search_auto` 或其他数据源 |
| `content_type: "challenge_page"` + `status: 403` | 数据中心 IP 被封 | 同上，换搜索工具获取信息 |

### 推荐工具链

```
# 文章 / 博客内容
1. fetch_url           → 首选读取
2. crawl_scrape        → fetch_url 返回 challenge_page 时，试试更干净的 markdown
3. search_and_scrape   → 还没有 URL 时，先搜再自动抓取

# PDF / 学术内容
1. pdf_to_markdown     → URL 以 .pdf 结尾或 content-type 为 PDF 时
2. pdf_parse           → 只要纯文本时

# 站点级发现
1. fetch_robots        → 检查爬取权限
2. fetch_sitemap       → 枚举可发现的 URL
3. crawl_extract       → 从已知页面提取结构化字段
```

## 已知限制

| 问题 | 原因 | 状态 |
|---|---|---|
| 直连 Reddit（API/RSS/JSON/redlib） | Reddit 封禁 CF Worker IP 段（403） | 用 `search_reddit_rss` 经 Startpage 绕过 |
| `fetch_html_extract` 总是失败 | 没有 AI 绑定，`env` 也没传给工具 | 改用 `crawl_extract` |
| Bing 对通用查询偶尔返回电商结果 | Bing 偏向购物结果 | 不修——过滤会误伤正常的商业查询 |
| 搜狗在 CF Workers IP 上返回空 | 对数据中心 IP 返回降级结果 | 上游限制 |
| Archive.org `advancedsearch` 超时 | 从 CF 边缘不可达 | 上游限制 |
| 新浪新闻部分查询返回空 | API 对某些关键词返回空 | 上游限制 |
| arXiv 偶发超时 | CF 边缘的网络路径问题 | 偶发 |
| Lemmy 社区搜索覆盖面 | 只匹配硬编码的提示列表（linux/docker/rust 等） | 按需扩充 |
| `crawl_screenshot` 返回文本快照而非 PNG | 没有 Browser Rendering | 设计如此 |
| 纯图片 PDF | Worker 内没有 OCR | 交给外部 OCR |
| `crawl_scrape` 处理 JS 渲染的 SPA | 不执行 JS | 内嵌 JSON 启发式 + Wayback 兜底 |

## 这不是什么

- 不是商业 SERP API 的替代品
- 不是浏览器自动化平台或 JS 渲染爬虫
- 不是封闭平台的私有/认证连接器
- 不是完整的正文提取（readability）引擎
- 不是 PDF OCR 服务

## 使用定位

这个 Worker 定位为**对话式客户端的轻量发现入口**——小模型工具、聊天助手、即时调研这类"几条好结果胜过深度爬取"的场景。

如果要做正经的**爬取 / 归档 / 大批量抽取**，跑在物理机（或容器集群）上的专用爬虫在吞吐、JS 执行、IP 多样性、验证码处理和存储上都会更强。先考虑 scrapy / playwright / colly / crawl4ai，别指望这里的 `crawl_*`。

## 开发

```bash
npm install            # 安装 wrangler（唯一的 devDependency）
npm test               # 离线单元测试：node --test "__tests__/**/*.test.js"
npm run check          # 语法检查：node --check src/index.js
npx wrangler dev --local --port 8789

curl http://127.0.0.1:8789/health
curl -X POST http://127.0.0.1:8789/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

在线冒烟测试需要一个已部署的实例，URL 作为第一个参数传入：

```bash
node tests/smoke_trace.mjs https://<your-worker>.workers.dev
node tests/smoke_layer1_4.mjs https://<your-worker>.workers.dev/mcp   # 11 fetch/PDF/crawl/orchestrator tools
```

CI（`.github/workflows/`）：

- `test.yml`——push 到 `main` 和每个 PR 时运行：`npm ci`、`npm run check`、`npm test`。
- `smoke.yml`——向 `main` 提 PR 时，对维护者的生产部署跑 `tests/smoke_trace.mjs`。
- `deploy.yml`——push 到 `main` 时：注入 `BUILD_SHA` / `BUILD_TIME`，用 `cloudflare/wrangler-action` 部署，校验 `/health`，再跑一次冒烟测试。
- `CI_STRICT_NETWORKING=true` 时，网络敏感的冒烟检查会断言失败而不只是警告。

### 项目结构

```
search-mcp-worker/
├── src/
│   ├── index.js              # Worker 入口：MCP 路由、全部工具、排序管道、防御层
│   ├── mcp/                  # 已内联进 index.js 的源模块（保留供阅读 / 测试）
│   │   ├── protocol.js       # JSON-RPC 2.0 辅助函数（rpcResult, json, jsonRpcError, handleJsonRpc）
│   │   └── tool-schemas.js   # 共享的 input schema 生成器（querySchema）
│   └── core/                 # 已内联进 index.js 的源模块
│       ├── provider-config.js    # Provider API key 解析
│       ├── provider-defaults.js  # 各 provider 默认配置表
│       └── request-context.js    # JSON-RPC handler 的单请求上下文
├── __tests__/                # node:test 单元测试（离线）
├── tests/                    # 在线冒烟 / provider 巡检 / 回归脚本（需联网）
├── scripts-smoke-mcp.mjs     # 新部署实例的一次性冒烟脚本
├── dict_synonyms.json        # 中文意图同义词 / 停用词（已内联进 index.js）
├── .github/workflows/        # test.yml、smoke.yml、deploy.yml
├── wrangler.toml
└── package.json
```

## 部署

- **一键部署：** 点顶部的 *Deploy to Cloudflare*，Cloudflare 会把仓库复制到你的 GitHub 并部署到你的账号。
- **命令行：** `npx wrangler login && npx wrangler deploy`，服务地址为 `https://search-mcp-worker.<your-subdomain>.workers.dev`。
- **自定义域名：** `wrangler.toml` 故意没写路由，好让任何人都能一键部署；需要自己的域名时加一条 `routes` 即可。
- **GitHub Actions：** `deploy.yml` 需要仓库 secret `CLOUDFLARE_API_TOKEN`。其中的健康检查和冒烟步骤指向维护者的域名，fork 后记得改掉。

## 相关项目

- [time-mcp-worker](https://github.com/Kerry1020/time-mcp-worker) —— 时区查询、时间换算与时差计算
- [geo-mcp-worker](https://github.com/Kerry1020/geo-mcp-worker) —— 基于 OpenStreetMap 服务的地理编码、POI 搜索与路线规划
- [memory-mcp-worker](https://github.com/Kerry1020/memory-mcp-worker) —— 基于 KV 的 Agent 持久化记忆
- [webhook-inbox-mcp-worker](https://github.com/Kerry1020/webhook-inbox-mcp-worker) —— 把 webhook 收进 KV，再通过 MCP 工具读取
- [summarize-mcp-worker](https://github.com/Kerry1020/summarize-mcp-worker) —— 网页正文提取与抽取式摘要
- [image-mcp-worker](https://github.com/Kerry1020/image-mcp-worker) —— 对接任意 OpenAI 兼容图像 API 的图片生成
- [calc-mcp-worker](https://github.com/Kerry1020/calc-mcp-worker) —— 数学计算：表达式、微积分、矩阵、统计

## 许可证

本项目采用 [知识共享 署名-非商业性使用-相同方式共享 4.0 国际许可协议（CC BY-NC-SA 4.0）](LICENSE)。

# search-mcp-worker

[English](./README.md) | 简体中文

一个单文件 Cloudflare Worker，通过一个 JSON-RPC 端点暴露 **52 个 MCP 工具**，覆盖网页搜索、页面抓取、PDF 解析、动态爬虫。零 npm 依赖、零数据库、零浏览器集群。

专为 LLM Agent 和自动化设计——一个稳定的搜索+工作接口，替代拼凑多个外部服务。

## 架构总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                          │
├──────────────┬───────────────┬──────────────┬──────────────┬─────────────┤
│  通用搜索    │  垂直源       │  抓取工具    │  PDF 解析    │  动态       │
│  (12)        │  (27)         │  (7)         │  (2)         │  爬虫 (4)   │
├──────────────┴───────────────┴──────────────┴──────────────┴─────────────┤
│  排序管道                                                            │
│  引擎置信度 → 5 道硬丢弃 → 3-type 级联 → RRF(k=60) →               │
│  Tiebreaker 链 → 域名多样性（窗口 8，每域最多 2）                    │
├──────────────────────────────────────────────────────────────────────────┤
│  防御层                                                              │
│  熔断器 │ JUNK 软冻结 │ 指数退避 │ 健康日志                          │
└──────────────────────────────────────────────────────────────────────────┘
```

外加 1 个编排器：`search_and_scrape` —— 把搜索结果接入并行全文抓取。

全部代码在 `src/index.js`，无构建步骤。

## v3 新特性 —— 排序管道重写

排序管道在 2026-06-27 从第一性原理重写，去除了 30 个加法常数的评分方案，改为多层原则性架构。前后对比：

| 层 | 改前 | 改后 |
|---|---|---|
| 单引擎打分 | 30 个加法常数（rank×3、type ±90、token ×14、CJK +60、gov +35...） | 3-type 级联（A: 网页搜索 / B: API / C: 新闻）+ 顺序化判据 |
| 引擎健康 | 单一二元熔断器（3 次 blocked → 5min 冻结） | 加：4 信号置信度评估（HIGH/MED/LOW/JUNK）+ JUNK 软冻结（连续 2 次 → 1min 跳过）+ 每引擎 `block_rate` 健康系数 |
| 跨引擎合并 | URL 精确去重 + 加法多源加成 | URL 精确 + 同域名 Levenshtein ≥0.85 模糊去重 + RRF(k=60) 三层引擎权重（base × query-type × health）+ 5 级 tiebreaker 链 + 滑动窗口域名多样性 |
| 结果类型 | 分类后用作加法分数 | 硬预过滤（引擎特定丢弃规则）+ 不影响打分 |

核心论点：加法打分模型无法表达「3 个引擎都把它排前 5」是**乘性证据**而非 3 倍加法。详细推理见项目变更日志（PR #27+）。

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

Claude Desktop、Cursor 或任何支持 SSE/StreamableHTTP 的 MCP 客户端：

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
# → {"ok":true,"build":{"sha":"...","time":"..."}}
```

## 工具列表（52 个）

52 个工具分为 **6 个功能层** + 1 个小工具桶。全部共享同一套防御层（熔断器、JUNK 软冻结、指数退避、意图偏移检测）。

### 第 1 层 —— 通用网页搜索（12 个）

解析 HTML 搜索结果页。每个引擎有多种回退链 + 轮换 User-Agent。**(indie)** 标记的引擎用专门的小网络/替代索引；**(api)** 标记的返回 JSON。

| Tool | 引擎 | URL 模式 | 回退策略 |
|---|---|---|---|
| `search_auto` | 多引擎 RRF | — | 基于意图选引擎 → 4 并发竞速 → RRF 合并 → tiebreaker → 域名多样性 |
| `search_duckduckgo` | DuckDuckGo | `noai.duckduckgo.com/?q=` → `lite.duckduckgo.com/lite/` (POST) → `html.duckduckgo.com/html/` | 3 次尝试：noai → lite (POST 表单) → html |
| `search_bing` | Bing (US) | `bing.com/search?q=` | 主参数 → 回退参数，2 条路由 |
| `search_bing_global` | Bing (全球) | `bing.com/search?q=` + `cn.bing.com/search?q=` | US + CN 路由，主 → 回退参数 |
| `search_bing_cn` | Bing (CN) | `cn.bing.com/search?q=` | CN 优化请求头 + 回退参数 |
| `search_yahoo` | Yahoo | `search.yahoo.com/search?p=` | 3 次尝试：nojs → 标准 → 最简请求头；自动处理 consent 表单 |
| `search_google_web` | Google | `google.com/search?q=` | 3 次尝试：GSA UA → Chrome UA + `gbv=1` → bare |
| `search_baidu` | Baidu | `m.baidu.com/s?word=` → `baidu.com/s?wd=&tn=json` → `baidu.com/s?wd=` | 移动 HTML → JSON API → 桌面 HTML |
| `search_yandex` | Yandex | `yandex.com/search/?text=` | GSA UA → bare；captcha 检测 → 返回 `blocked: true` |
| `search_naver` | Naver | `search.naver.com/search.naver?query=` | 单次尝试，HTML 解析 |
| `search_sogou` | Sogou | `sogou.com/web?query=` | H3+A 正则 → 通用链接提取；过滤 `sogou.com/?s_from=hint_up` 建议噪声 |
| `search_brave` | Brave | `search.brave.com/search?q=` | 单次尝试，HTML 解析 |
| `search_qwant` | Qwant | `qwant.com/?q=` | 单次尝试，HTML 解析 |
| `search_ecosia` | Ecosia | `ecosia.org/search?q=` | 单次尝试，HTML 解析 |

### 第 2 层 —— 垂直源（27 个）

结构化 JSON API（20 个）+ HTML 抓取源（7 个）。所有结果都经过 v3 finalize 管线（引擎置信度 → 5 道硬丢弃 → 类型特定级联）。

#### 2a. JSON API（20 个）

| Tool | 数据源 | API | 实现细节 |
|---|---|---|---|
| `search_arxiv` | arXiv | `export.arxiv.org/api/query?search_query=all:` (Atom XML) | XML 解析 → `{title, url, snippet}`；失败时回退到 `searchSiteTargetVertical` |
| `search_pubmed` | PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch` → `efetch` | 两步：esearch 拿 ID → efetch 拿摘要；**技术信号检测**防止生物查询返回技术噪声 |
| `search_hackernews` | Hacker News | `hn.algolia.com/api/v1/search?tags=story` | Algolia API；`objectID` 回退处理自帖 |
| `search_stackoverflow` | Stack Exchange | `api.stackexchange.com/2.3/search/advanced` | 可配置 `site` 参数（默认 `stackoverflow`）；用 `filter=withbody` 包含正文 |
| `search_reddit_rss` | Reddit via Startpage | `search.startpage.com/sp/search?q=reddit+QUERY` | Reddit 封禁所有 CF Worker IP（直连/RSS/JSON/redlib 全 403）。用 Startpage 做 Reddit 讨论代理，过滤到 reddit.com URL |
| `search_npm` | npm | `registry.npmjs.org/-/v1/search?text=` | 直 JSON → `{name}@{version}` |
| `search_devto` | dev.to | `dev.to/api/articles?tag=` 然后 `?q=` | **3 层 tag 策略**：复合 tag（如 `machinelearning`）→ 第一个词 tag → `?q=` 回退 |
| `search_mastodon` | Mastodon | `mastodon.social/api/v2/search?q=` + `/api/v1/timelines/tag/` | 从查询提取 hashtag，搜索 tag 时间线作补充；多实例 |
| `search_peertube` | PeerTube | `search.joinpeertube.org/api/v1/search/videos` | 全球视频搜索索引 |
| `search_sec_edgar` | SEC EDGAR | `efts.sec.gov/LATEST/search-index?q=` | 可选 `form_type` 过滤（10-K, S-1 等） |
| `search_lemmy` | Lemmy | `lemmy.world/api/v3/post/list?community_name=` + `/api/v3/search?sort=New` | **社区回退**：若查询匹配已知社区（linux/docker/rust 等），先取 `post/list`；3 个实例（lemmy.world, lemmy.ml, programming.dev）并发 |
| `search_wikipedia` | Wikipedia | `{lang}.wikipedia.org/w/api.php?action=query&list=search` | 可配置 `language`；HTML 抓取回退 |
| `search_wikidata` | Wikidata | `wikidata.org/w/api.php?action=wbsearchentities` | 返回实体 ID + 描述 |
| `search_wiktionary` | Wiktionary | `{lang}.wiktionary.org/w/api.php?action=query&list=search` | 可配置 `language` |
| `search_openlibrary` | Open Library | `openlibrary.org/search.json?q=` | 返回作品 OLID、作者、年份 |
| `search_musicbrainz` | MusicBrainz | `musicbrainz.org/ws/2/recording/?query=&fmt=json` | 摘要含艺术家 + 专辑 |
| `search_crossref` | Crossref | `api.crossref.org/works?query=` | DOI 关联的学术论文 |
| `search_pypi` | PyPI | `pypi.org/search/?q=` (HTML) → `pypi.org/pypi/{name}/json` (直查) | 先 HTML 抓；0 结果时尝试精确包名查询 |
| `search_crates` | crates.io | `crates.io/api/v1/crates?q=` | 直 JSON API |
| `search_github_repos` | GitHub | `api.github.com/search/repositories?q=&sort=stars` | 按 star 排序；候选超额获取再切片 |
| `search_semantic_scholar` | Semantic Scholar | `api.semanticscholar.org/graph/v1/paper/search` | 覆盖 IEEE/ACM/Springer/Elsevier。HTTP 429 时自动 fallback 到 arXiv。可选 API key：`PROVIDER_CONFIG.semantic_scholar.apiKey` |
| `search_ollama` | Ollama | `api.olloma.com/v1/web-search` (POST) | 可配置端点；需要 API key |
| `search_parallel` | Parallel | `api.parallel.ai/v1/search` (POST) | 可配置端点 |

#### 2b. HTML 抓取（7 个）

| Tool | 数据源 | URL 模式 | 解析策略 |
|---|---|---|---|
| `search_bbc` | BBC | `bbc.co.uk/search?q=` | HTML 解析 |
| `search_bing_news` | Bing News | `bing.com/news/search?q=&format=rss` | 先 RSS，HTML 回退 |
| `search_sina_news` | Sina News | `search.sina.com.cn/api/news?q=` (JSON) → HTML 回退 | 先 JSON API；回退到 `searchSiteTargetVertical`（`host=sina.com.cn`） |
| `search_163_news` | 163 News | `163.com/search?keyword=` (HTML) | HTML 解析 → `extract163SearchResults`；回退到 site-targeted 搜索 |
| `search_paperswithcode` | Papers With Code | `api.semanticscholar.org/graph/v1/paper/search` | Semantic Scholar API 作后端 |
| `search_osm` | OpenStreetMap | `nominatim.openstreetmap.org/search?q=&format=jsonv2` | 地理编码；返回 lat/lon + OSM 链接 |
| `search_archive` | Archive.org | `archive.org/wayback/available?url=` + `advancedsearch.php?q=` | Wayback Machine 查询 + 高级搜索；**受限**于 CF Workers IP 超时 |

#### 2c. 独立 / 小网络（3 个）

| Tool | 数据源 | 备注 |
|---|---|---|
| `search_wiby` | Wiby.me | 老式独立网页搜索。纯 HTML，无 JS |
| `search_marginalia` | Marginalia | 独立/非商业网页。JSON API 优先 + HTML 回退 |
| `searchmysite` | searchmysite | 独立站点搜索 |

### 第 3 层 —— 抓取工具（7 个）

单 URL 抓取 + 结构化辅助。全部基于 `fetchTextWithResponse`，叠加分层后处理。

| Tool | 用途 | 实现 |
|---|---|---|
| `fetch_url` | 抓取任意 URL，提取可读文本 | `fetchTextWithResponse` → `extractReadableContent`（文章提取）→ 在 `max_chars` 截断 |
| `fetch_metadata` | 从 URL 提取元数据 | 抓 HTML（128KB 限制）→ 解析 `<title>`、`<meta>` description/og:image 等 → 返回结构化元数据 |
| `fetch_github_file` | 从 GitHub 抓取指定文件 | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` → 返回原始文本 |
| `fetch_robots` | 抓取 + 解析 `robots.txt` | 从 URL 推导 origin → 抓 `/robots.txt` → 解析 user-agent 块（Allow/Disallow）+ Sitemap 声明 |
| `fetch_sitemap` | 抓取 + 解析 sitemap.xml | 默认抓首页 → 解析 `<urlset>` 或 `<sitemapindex>`；`recursive=true` 走子 sitemap |
| `fetch_html_to_markdown` | `fetch_url` 的 Markdown 版 | `fetchTextWithResponse` → 无 cheerio 的 DOM 遍历 → 保留 H1-H3 / 链接 / 列表 / 代码块，丢弃 `<script>`/`<style>`/`<nav>`/`<footer>` |
| `fetch_html_extract` | 抓取 + 结构化抽取 | 优先用 Workers AI binding（无则优雅报错）；回退到原始文本 |

### 第 4 层 —— PDF 解析（2 个）

纯 worker 的 PDF 文本提取。无 npm 依赖、无外部服务。

| Tool | 用途 | 实现 |
|---|---|---|
| `pdf_parse` | 抓取 PDF URL 并提取纯文本 | `fetch(url)` → `extractPdfTextAsync`（`stream...endstream` 块的二进制扫描）→ `DecompressionStream("deflate")` 解 FlateDecode 流 → 跳过字体/图像/XObject 非文本流 → 用 `BT...ET` + `Tj/TJ` 算子提取 |
| `pdf_to_markdown` | 抓取 PDF 转为轻量 Markdown | 复用 `pdf_parse` → 头部加 `# PDF Document` 元信息 → 页间插入 `---` 分页符 |

**实现说明：**
- **二进制扫描**：字节级定位 `stream` (115,116,114,101,97,109) 和 `endstream` 标记——不对二进制流用正则。
- **FlateDecode 解压**：浏览器原生 `DecompressionStream("deflate")`。
- **文本流过滤**：`looksLikeTextStream()` 检查解压流的 PDF 文本算子（BT/Tj/TJ/Td/Tm/Tf）或可打印 ASCII 比例 > 0.85；字体/图像/XObject 被跳过。
- **噪声过滤**：策略 1（大纲/元数据）和策略 2（Info 字典元数据）已禁用——只用策略 3（解压的真实内容流），能干净处理 LaTeX 生成的 arXiv 论文和其他 LaTeX 重 PDF。
- **已知限制**：扫描版纯 PDF（仅图像）需要外部 OCR——worker 不处理。

### 第 5 层 —— 动态爬虫（4 个）

纯 worker 爬取，无浏览器依赖。CF 账号无 Browser Rendering entitlement，所以这些工具用分层启发式策略链最大化无 JS 渲染的覆盖。

| Tool | 用途 | 策略链 |
|---|---|---|
| `crawl_scrape` | URL → 干净 markdown | (1) 检测 Next.js `__NEXT_DATA__` / Nuxt `__NUXT__` / SvelteKit / Astro 内嵌 JSON；(2) 提取 `application/ld+json` JSON-LD；(3) OG/Twitter meta；(4) 无 cheerio 的 DOM 遍历 → markdown；(5) 回退到 Archive.org Wayback 快照 |
| `crawl_screenshot` | URL 内容快照 | DOM 派生快照：title + h1-h3 层级 + 链接 + 摘要文本 + OG/Twitter + html sha256。**无 PNG 截图**——账号无 BR entitlement |
| `crawl_pdf` | URL → PDF 文本 | 复用 `pdf_parse` / `pdf_to_markdown`；PDF 是静态二进制，无 JS 渲染需求 |
| `crawl_extract` | URL → 结构化字段（无 AI） | HTML 启发式抽取：(1) JSON-LD 块；(2) OG/Twitter meta；(3) schema.org microdata `itemprop`；(4) `.price` / `.author` / `.title` 启发式类选择器 → 类型强制（string/number/boolean/array） |

### 第 6 层 —— 智能编排（1 个）

| Tool | 用途 | 实现 |
|---|---|---|
| `search_and_scrape` | 搜索 → 自动全文抓取 | 编排器：内部调 `search_auto` 拿候选 URL → 4 并发 `fetch_url` 或 `pdf_parse`（URL 结尾 `.pdf` 或 content-type 是 PDF 时自动走 PDF）→ 返回 `{query, results[], stats{elapsed_ms, succeeded, failed, concurrency: 4, deadline_hit}}`。30s 总超时。 |

### 工具桶（3 个）

| Tool | 用途 |
|---|---|
| `instant_answer` | DuckDuckGo Instant Answer API（`api.duckduckgo.com/?format=json`） |
| `find_rss` | 发现指定 URL 的 RSS/Atom feed |
| `debug_capture_search_html` | 调试工具：返回搜索引擎原始 HTML 用于解析器开发 |

## 排序管道 v3（详细）

排序系统分两层：**单引擎 finalize**（每个引擎的结果进入跨引擎合并器前）+ **跨引擎合并**（RRF + tiebreaker + 多样性）。

### 单引擎 Finalize

每个引擎的结果都经过此管道再进 RRF：

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
  ├─ 1. 5 道硬丢弃过滤（任一命中 = 丢弃）
  │     第 1 道：isGenericWrapperResult（搜索页、广告、赞助）
  │     第 2 道：isHardIntentMismatchResult（离题）
  │     第 3 道：isLowTrustResult（CJK SEO 垃圾，如 .org.cn 含年份）
  │     第 4 道：shouldDropVerticalResultType（有更优类型时）
  │     第 5 道：isEngineSelfPage（引擎自域/help/captcha/snippet == title）
  │
  ├─ 2. 类型特定级联排序
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
  │     通道 B：同域名 + 标题 Levenshtein 相似度 ≥ 0.85
  │     命中：保留更长摘要/标题，合并引擎列表
  │
  ├─ 2. RRF 打分
  │     finalScore = Σ 命中引擎 { engineWeight / (60 + rank) }
  │     engineWeight = base × queryTypeMult × healthMult
  │     base:  startpage/google=1.2, bing/yahoo/brave=1.0-1.1, indie=0.5
  │     queryTypeMult: 开发者→github/stackoverflow/npm ×1.5, 新闻→bing_news/bbc ×1.5,
  │                    CJK→baidu/sogou/bing_cn ×1.3, 学术→arxiv/semantic_scholar ×1.5
  │     healthMult: block_rate>50% → ×0.3, >30% → ×0.6, 否则 ×1.0
  │
  ├─ 3. Tiebreaker 链（顺序化，非加法）
  │     (1) 验证引擎数更多
  │     (2) 标题含查询 token 更多
  │     (3) 标题+摘要更长（信息量更多）
  │     (4) 域名权威（gov > edu > org > 其他）
  │     (5) 结果类型（article/question/note > thread > 其他）
  │
  └─ 4. 域名多样性（滑动窗口）
        窗口大小 8，每域名最多 2 条
        超限 → 延后 → 主轮走完再追加
```

## 防御层

### 熔断器

每引擎滑动窗口。连续 3 次 blocked/captcha 响应，引擎冻结 5 分钟。`frozenUntil` 过期后自动恢复。

```
引擎 blocked → recordEngineBlocked() → failures++
3 次失败 → frozenUntil = now + 5min
下次请求 → isEngineCircuitBroken() → true → 跳过引擎，尝试下一个
5min 后 → 自动清除
```

适用于：Google、Yahoo、Bing、Yandex 等 HTML 抓取引擎。

### JUNK 软冻结（v3）

补强熔断器，针对返回低质结果而非硬 blocked 的引擎做短周期软冻结：

```
引擎返回 JUNK 置信度 → recordEngineJunk() → count++
连续 2 次 JUNK → frozenUntil = now + 1min
下次请求 → isEngineJunkFrozen() → true → 跳过引擎
引擎返回非 JUNK → resetEngineJunk() → 计数器清零
1min 后 → 自动清除
```

软冻结防止 Yahoo 那种「技术上没 blocked 但返回垃圾页」每次搜索都重发请求。1 分钟窗口短到能快速自愈，但够跳过一次重复请求批次。

### 引擎健康日志

每引擎滑动 1 小时事件日志（`success / blocked / empty / junk`）。用于：
- RRF 引擎权重中的 `_healthWeightMultiplier`：`block_rate > 50% → ×0.3, > 30% → ×0.6`
- JUNK 软冻结跟踪器
- 熔断器（与自身的失败计数器并行）

### 指数退避重试

针对瞬时服务器错误（502, 503, 504）和网络失败：

```
fetchWithUA(url, headers, { retries: 1, retryDelay: 200 })
  → 200ms * 2^attempt + random(0, 50ms) 抖动
  → 最多 2 次尝试（1 次重试）
```

### 意图偏移检测

**`isHardIntentMismatchResult`** —— 硬过滤，丢弃明显不匹配：
- 英文：alpha token（长度 ≥ 3）整词匹配标题+摘要。覆盖率 < 50% = 不匹配。
- CJK：查询字符检查标题+摘要。零命中 = 不匹配。
- 源特定：BBC 丢非字母噪声；PubMed 丢技术与生物交叉污染。

### Finalize 防护

finalize 防御层包含防过度过滤的保护：
- **小样本保护**：≤2 条结果永远不会被当作 `generic_wrapper_results` 杀死
- **跨语言通过**：纯英文查询匹配中文结果时跳过 `intent_mismatch`
- **搜索引擎 host 例外**：`baidu.com/link?url=`、`/s?wd=`、`/item/` 路径的结果不被当作搜索引擎噪声自动杀死

### JSON 看门狗

`parseLenientJsonObject` 有 8KB 守卫：输入超过 8192 字节时跳过字符级修复循环直接返回 `null`。防止上游返回畸形大 payload 时 Cloudflare Worker CPU 超时。

### 样式变动抗性

`extractGenericLinks` 在基于 class 的解析器失败时用两阶段方法：
1. **块级预过滤**：扫 `<li>`、`<div>`、`<section>`、`<article>` 容器（含内部链接 + 标题长度 ≥ 6），产出带摘要的结果。
2. **平面 `<a>` 回退**：若块没填满 limit，回退到扫所有 `<a>` 标签 + 噪声 URL 过滤。

即便上游完全移除 CSS class 名也能提供 85%+ 召回。

## 响应格式

每个搜索工具返回统一结构：

```json
{
  "ok": true,
  "query": "cloudflare workers",
  "source": "auto",
  "results": [
    {
      "rank": 1,
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
  "filtered_reason": "engine_self_pages"
}
```

MCP 文本输出带 ISO 8601 时间戳前缀：

```
[2026-06-27T14:45:12.693Z] "query" 的搜索结果：
1. 标题
   https://...
   摘要文本
```

## 本地开发

```bash
# 无需 npm install——零依赖
npx wrangler dev --local --port 8789

# 测试
curl http://127.0.0.1:8789/health
curl -X POST http://127.0.0.1:8789/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_auto","arguments":{"query":"test","limit":3}}}'
```

## CI/CD

- **冒烟测试**：每个 PR 触发 `.github/workflows/smoke.yml`——对部署的 worker 跑 `tests/smoke_trace.mjs`
- **扩展冒烟**：`tests/smoke_layer1_4.mjs` 端到端测试 11 个 1-4 层工具（PDF + fetch 辅助）针对 CF worker
- **自动部署**：合并到 `main` 的 PR 触发 `.github/workflows/deploy.yml`——构建并部署到 Cloudflare Workers
- **分支保护**：`main` 需要通过冒烟 CI + PR 审核
- **CI 网络**：`CI_STRICT_NETWORKING` 环境变量——`true`（本地）用 `assert`，`false`（CI）用 `warn` 处理网络敏感测试

## 项目结构

```
search-mcp-worker/
├── src/index.js              # 全部：MCP 路由、52 工具、排序管道、防御层
├── tests/
│   ├── smoke_trace.mjs       # 核心冒烟测试套件（在线）
│   ├── smoke_layer1_4.mjs    # 扩展冒烟——11 个 1-4 层工具，39 个断言
│   ├── parser_harness.mjs    # 解析器单元测试（离线，25 个断言）
│   └── provider_sweep.mjs    # 全 provider 审计
├── .github/workflows/
│   ├── smoke.yml             # PR 冒烟 CI
│   └── deploy.yml            # merge 自动部署
├── wrangler.toml
├── package.json
└── README.md
```

## 已知限制

| 问题 | 原因 | 状态 |
|---|---|---|
| Reddit 直连（API/RSS/JSON/redlib） | Reddit 封禁所有 CF Worker IP 段（403） | 通过 Startpage 代理在 `search_reddit_rss` 中解决 |
| Bing 偶发对通用查询返回电商 | Bing 对购物的算法偏向 | 不修——过滤会杀合法商业查询 |
| Sogou 在 CF Workers IP 上返回空 | Sogou 对数据中心 IP 返回降级结果 | 上游限制 |
| Archive.org `advancedsearch` 超时 | API 从 CF Workers 边缘节点不可达 | 上游限制 |
| Sina News 对部分查询返回空 | API 对某些关键词返回空 | 上游限制 |
| Arxiv 偶发超时 | CF 边缘到 `export.arxiv.org` 的网络路径 | 瞬时 |
| Lemmy 社区搜索覆盖 | 只匹配硬编码提示列表（linux/docker/rust 等） | 按需扩展 |
| `crawl_screenshot` 返回文本快照非 PNG | CF 账号无 Browser Rendering entitlement | 用 BR-enabled 账号做真截图 |
| PDF 解析器对扫描版 PDF | worker 内无 OCR | 把扫描版 PDF 管道到外部 OCR |
| `crawl_scrape` 对 JS 渲染 SPA | 纯 worker 无 JS 执行 | 用 Archive.org Wayback 回退或 BR-enabled 端点 |

## Agent 行为指南

LLM Agent（Claude、Cursor 等）使用这些工具时注意以下信号：

### `content_type: "challenge_page"`（fetch_url）

`fetch_url` 遇到反爬保护（WAF/JS 挑战/IP 封禁）时：

| 信号 | 含义 | Agent 行动 |
|---|---|---|
| `content_type: "challenge_page"` + `status: 202` | 需要 JS 探测——页面需浏览器执行 | **不要**把文本当作文章内容。改用 `search_auto` 或其他数据源 |
| `content_type: "challenge_page"` + `status: 403` | 数据中心 IP 被封 | 同上——切换到搜索工具获取信息 |

### 推荐工具链

```
# 文章 / 博客内容
1. fetch_url           → 主要读取
2. crawl_scrape        → 若 fetch_url 返回 challenge_page，试更干净的 markdown
3. search_and_scrape   → 还没有 URL 时，先搜索再自动抓取

# PDF / 学术内容
1. pdf_to_markdown     → URL 结尾 .pdf 或 content-type 是 PDF 时
2. pdf_parse           → 只要纯文本时

# 站点级发现
1. fetch_robots        → 检查爬取权限
2. fetch_sitemap       → 枚举可发现 URL
3. fetch_html_extract  → 从已知页面取结构化字段
```

## 这不是什么

- 不是商业 SERP API 替代品
- 不是浏览器自动化平台或 JS 渲染爬虫
- 不是封闭平台的私有/认证连接器
- 不是完整的可读性引擎
- 不是 PDF OCR 服务

## 部署验证

- 52 个工具对 CF Workers 边缘部署端到端验证
- v3 排序管道在 4 种查询意图（默认 / 开发者 / CJK / 学术 / 新闻）上验证
- RRF 跨引擎共识验证：学术和英文查询产出前 3 多源一致结果
- 引擎置信度评估验证：4 信号正确识别 Yahoo 垃圾页
- PDF 解析器在真实 arXiv 论文（23 页，LaTeX 重）上验证 → 干净正文文本提取
- 见 `tests/smoke_layer1_4.mjs` 的 39 断言扩展冒烟套件覆盖第 1-4 层

## 许可证

本项目采用 Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International 许可——见 [LICENSE](LICENSE) 文件了解详情。

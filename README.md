# search-mcp-worker

English | [简体中文](./README.zh-CN.md)

A single-file Cloudflare Worker that exposes **76 MCP tools** for web search, page fetching, PDF parsing, dynamic crawling, and provider configuration through one JSON-RPC endpoint. Zero npm dependencies, zero database, zero browser cluster.

Designed for LLM agents and automation that need one stable search/work surface instead of stitching together many providers.

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                          │
├──────────────┬───────────────┬──────────────┬──────────────┬─────────────┤
│  General     │  Vertical     │  Fetch       │  PDF         │  Crawl      │
│  Search      │  Sources      │  Tools       │  Parser      │  Tools      │
│  (20)        │  (29)         │  (7)         │  (2)         │  (4)        │
├──────────────┴───────────────┴──────────────┴──────────────┴─────────────┤
│  Provider Admin (10) — runtime config of API-key engines                 │
├──────────────────────────────────────────────────────────────────────────┤
│  Ranking Pipeline                                                       │
│  Engine-confidence → 5 hard drops → 3-type cascade → RRF(k=60) →        │
│  Tiebreaker chain → Domain diversity (window 8, max 2/domain)            │
├──────────────────────────────────────────────────────────────────────────┤
│  Defense Layer                                                           │
│  Circuit Breaker │ JUNK Soft-Freeze │ Exponential Backoff │ Health Log  │
└──────────────────────────────────────────────────────────────────────────┘
```

Plus 1 orchestrator: `search_and_scrape` — wires search results → parallel full-text fetch.

Plus 3 utility tools: `instant_answer`, `find_rss`, `debug_capture_search_html`.

Plus 2 MCP protocol tools: `initialize`, `ping`.

Everything lives in `src/index.js`. No build step.

## What's New in v3 — Ranking Pipeline Rewrite

The ranking pipeline was rewritten from first principles in 2026-06-27 to remove a 30-constant additive scoring scheme in favor of a principled, multi-layer architecture. Detailed before/after:

| Layer | Before | After |
|---|---|---|
| Single-engine scoring | 30 hardcoded constants added (rank×3, type ±90, token ×14, CJK +60, gov +35...) | 3-type cascade (A: web search / B: API / C: news) with sequential criteria |
| Engine health | Single binary circuit breaker (3 blocked → 5min freeze) | Adds: 4-signal confidence assessment (HIGH/MED/LOW/JUNK) + JUNK soft-freeze (2 consecutive → 1min skip) + per-engine `block_rate` health multiplier |
| Cross-engine merging | URL exact dedup + additive multi-source bonus | URL exact + same-domain Levenshtein ≥0.85 fuzzy dedup + RRF (k=60) with 3-layer engine weight (base × query-type × health) + 5-stage tiebreaker chain + sliding-window domain diversity (window 8, max 2/domain) |
| Result types | Classified but used as additive scores | Hard-pre-filter (engine-specific drop rules) + no scoring influence |

The full reasoning is documented in the project changelog (PR #27+). The TL;DR: an additive scoring model cannot represent the fact that "3 engines all rank this in the top 5" is multiplicative evidence, not 3× additive.

## Recent Fixes

### 2026-06-28 — Yahoo `id="web"` ol anchor (commit `dfdf485`)

Yahoo's result page contains **multiple** `<ol class="reg searchCenterMiddle">` elements: a left-sidebar nav (time filters, related searches) and the actual search results inside `<div id="web">`. The `extractSectionAroundMarker` anchor (180KB window around `id="web"`) includes both, so a naive lazy `<ol…>[\s\S]*?<\/ol>` regex matched the **navigation** ol first — leaving the parser to see zero `<h3>` / `algo` results and fall through to the generic-link extractor.

The fix anchors the ol search to the substring **after** `id="web"`, so the lazy match lands on the real results ol. `parseYahooBlock` (also rewritten in this commit) walks `<a …>…<h3>…</h3>…</a>` from the title outward, then falls back to a `r.search.yahoo.com/_ylt=…/RU=…` redirect if needed.

**Verification (post-deploy, query=`python list comprehension`, limit=3):**

| Metric | Before | After |
|---|---|---|
| Result count | 0 (fallback rescue) | 3 |
| Parser | `skeleton_fallback` or undefined | `exact` |
| First result | n/a | `List Comprehension in Python - GeeksforGeeks → geeksforgeeks.org/python-list-comprehension/` |

## Quick Start

### Deploy

```bash
# Create metadata.json
echo '{"main_module":"index.js","compatibility_date":"2026-04-08"}' > /tmp/metadata.json

# Deploy via CF API
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/search-mcp-worker" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_API_KEY" \
  -F "metadata=@/tmp/metadata.json;type=application/json" \
  -F "index.js=@src/index.js;type=application/javascript+module"
```

### Use from MCP client

For Claude Desktop, Cursor, or any MCP client that supports SSE/StreamableHTTP:

```json
{
  "mcpServers": {
    "search": {
      "url": "https://your-worker.example.com/mcp"
    }
  }
}
```

### Health check

```bash
curl https://your-worker.example.com/health
# → {"ok":true,"build":{"sha":"...","time":"..."}}
```

## Tool Surface (76 tools)

The 76 public tools are grouped into **6 functional layers** plus a utility bucket and a runtime provider-admin bucket. All share the same defense layer (circuit breaker, JUNK soft-freeze, exponential backoff, intent mismatch detection).

**Public tool breakdown**: Layer 1 (20 general web search) + Layer 2 (29 vertical sources) + Layer 3 (7 fetch) + Layer 4 (2 PDF) + Layer 5 (4 crawl) + Layer 6 (1 orchestrator) + 3 utility tools. Plus 10 non-public `provider_*` admin tools for runtime engine configuration (see [Provider Admin](#provider-admin-10-tools) below). Plus 2 MCP protocol tools (`initialize`, `ping`).

### Layer 1 — General Web Search (20 tools)

Parse HTML search result pages. Each engine has a multi-attempt fallback chain with rotating User-Agents. Engines marked **(indie)** use specialized small-web or alternative indexes; engines marked **(api)** return JSON.

| Tool | Engine | URL Pattern | Fallback Strategy |
|---|---|---|---|
| `search_auto` | Multi-engine RRF | — | Intent-based engine selection → 4-concurrent race → RRF merge → tiebreaker → domain diversity |
| `search_duckduckgo` | DuckDuckGo | `noai.duckduckgo.com/?q=` → `lite.duckduckgo.com/lite/` (POST) → `html.duckduckgo.com/html/` | 3 attempts: noai → lite (POST form) → html |
| `search_bing` | Bing (US) | `bing.com/search?q=` | Primary params → fallback params, 2 routes |
| `search_bing_global` | Bing (Global) | `bing.com/search?q=` + `cn.bing.com/search?q=` | US + CN routes, primary → fallback params |
| `search_bing_cn` | Bing (CN) | `cn.bing.com/search?q=` | CN-optimized headers + fallback params |
| `search_yahoo` | Yahoo | `search.yahoo.com/search?p=` | 3 attempts: nojs → standard → minimal headers; auto-handles consent form |
| `search_google_web` | Google | `google.com/search?q=` | 3 attempts: GSA UA → Chrome UA + `gbv=1` → bare |
| `search_baidu` | Baidu | `m.baidu.com/s?word=` → `baidu.com/s?wd=&tn=json` → `baidu.com/s?wd=` | Mobile HTML → JSON API → Desktop HTML |
| `search_yandex` | Yandex | `yandex.com/search/?text=` | GSA UA → bare; captcha detection → returns `blocked: true` |
| `search_naver` | Naver | `search.naver.com/search.naver?query=` | Single attempt, HTML parse |
| `search_sogou` | Sogou | `sogou.com/web?query=` | H3+A regex → generic link extraction; filters `sogou.com/?s_from=hint_up` suggestion noise |
| `search_brave` | Brave | `search.brave.com/search?q=` | Single attempt, HTML parse |
| `search_qwant` | Qwant | `qwant.com/?q=` | Single attempt, HTML parse |
| `search_ecosia` | Ecosia | `ecosia.org/search?q=` | Single attempt, HTML parse |
| `search_archive` | Archive.org | `archive.org/wayback/available?url=` + `advancedsearch.php?q=` | Wayback Machine lookup + advanced search; **currently limited** by CF Workers IP timeout |
| `search_startpage` | Startpage | `startpage.com/sp/search?q=` | Single attempt, HTML parse; primary fallback for Reddit due to CF-IP 403 |
| `search_mojeek` | Mojeek | `mojeek.com/search?q=` | Single attempt, HTML parse |
| `search_searchmysite` | searchmysite | `searchmysite.net/search?q=` | Single attempt, indie index |
| `search_marginalia` | Marginalia **(indie)** | `search.marginalia.nu/search?query=` | Indie/non-commercial web index |
| `search_wiby` | Wiby.me **(indie)** | `wiby.me/?q=` | Old-school independent web search. Pure HTML, no JS |

### Layer 2 — Vertical Sources (29 tools)

Structured JSON APIs (23) and HTML-scrape sources (6). All results pass through the v3 finalize pipeline (engine-confidence → 5 hard drops → type-specific cascade).

#### 2a. JSON API (23 tools)

| Tool | Source | API | Implementation Details |
|---|---|---|---|
| `search_arxiv` | arXiv | `export.arxiv.org/api/query?search_query=all:` (Atom XML) | XML parse → `{title, url, snippet}`; fallback to `searchSiteTargetVertical` on failure |
| `search_pubmed` | PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch` → `efetch` | Two-step: esearch gets IDs → efetch gets abstracts; **tech signal detection** prevents bio queries from returning tech noise |
| `search_hackernews` | Hacker News | `hn.algolia.com/api/v1/search?tags=story` | Algolia API; `objectID` fallback for self-posts |
| `search_stackoverflow` | Stack Exchange | `api.stackexchange.com/2.3/search/advanced` | Configurable `site` param (default: `stackoverflow`); body included via `filter=withbody` |
| `search_reddit` | Reddit | `reddit.com/search.json?q=` (JSON API) | Optional `subreddit` filter; sort by `relevance|new|top|comments`. **Note**: Reddit often returns 403 to CF Worker IPs — when blocked, fall back to `search_reddit_rss` (Startpage proxy). |
| `search_reddit_rss` | Reddit via Startpage | `search.startpage.com/sp/search?q=reddit+QUERY` | Reddit blocks all CF Worker IPs (403 across direct/RSS/JSON/redlib). Uses Startpage as a search proxy for Reddit discussions, filtered to reddit.com URLs |
| `search_npm` | npm | `registry.npmjs.org/-/v1/search?text=` | Direct JSON → `{name}@{version}` |
| `search_devto` | dev.to | `dev.to/api/articles?tag=` then `?q=` | **3-tier tag strategy**: compound tag (e.g. `machinelearning`) → first word tag → `?q=` fallback |
| `search_mastodon` | Mastodon | `mastodon.social/api/v2/search?q=` + `/api/v1/timelines/tag/` | Extracts hashtags from query, searches tag timeline as supplement; multi-instance |
| `search_peertube` | PeerTube | `search.joinpeertube.org/api/v1/search/videos` | Global video search index |
| `search_sec_edgar` | SEC EDGAR | `efts.sec.gov/LATEST/search-index?q=` | Optional `form_type` filter (10-K, S-1, etc.) |
| `search_lemmy` | Lemmy | `lemmy.world/api/v3/post/list?community_name=` + `/api/v3/search?sort=New` | **Community fallback**: if query matches known community (linux/docker/rust/etc), fetches `post/list` first; 3 instances (lemmy.world, lemmy.ml, programming.dev) concurrent |
| `search_wikipedia` | Wikipedia | `{lang}.wikipedia.org/w/api.php?action=query&list=search` | Configurable `language`; fallback to HTML scrape |
| `search_wikidata` | Wikidata | `wikidata.org/w/api.php?action=wbsearchentities` | Returns entity ID + description |
| `search_wiktionary` | Wiktionary | `{lang}.wiktionary.org/w/api.php?action=query&list=search` | Configurable `language` |
| `search_openlibrary` | Open Library | `openlibrary.org/search.json?q=` | Returns work OLID, author, year |
| `search_musicbrainz` | MusicBrainZ | `musicbrainz.org/ws/2/recording/?query=&fmt=json` | Artist + album in snippet |
| `search_crossref` | Crossref | `api.crossref.org/works?query=` | DOI-linked academic papers |
| `search_pypi` | PyPI | `pypi.org/search/?q=` (HTML) → `pypi.org/pypi/{name}/json` (direct lookup) | HTML scrape first; if 0 results, tries exact package name lookup |
| `search_crates` | crates.io | `crates.io/api/v1/crates?q=` | Direct JSON API |
| `search_github_repos` | GitHub | `api.github.com/search/repositories?q=&sort=stars` | Star-sorted; candidate over-fetch then slice |
| `search_semantic_scholar` | Semantic Scholar | `api.semanticscholar.org/graph/v1/paper/search` | Covers IEEE/ACM/Springer/Elsevier. HTTP 429 triggers automatic fallback to arXiv. API key optional via `PROVIDER_CONFIG.semantic_scholar.apiKey` |
| `search_ollama` | Ollama | `api.olloma.com/v1/web-search` (POST) | Provider-configurable endpoint; requires API key |
| `search_parallel` | Parallel | `api.parallel.ai/v1/search` (POST) | Provider-configurable endpoint |

#### 2b. HTML Scrape (6 tools)

| Tool | Source | URL Pattern | Parsing Strategy |
|---|---|---|---|
| `search_bbc` | BBC | `bbc.co.uk/search?q=` | HTML parse |
| `search_bing_news` | Bing News | `bing.com/news/search?q=&format=rss` | RSS first, HTML fallback |
| `search_sina_news` | Sina News | `search.sina.com.cn/api/news?q=` (JSON) → HTML fallback | JSON API first; falls back to `searchSiteTargetVertical` with `host=sina.com.cn` |
| `search_163_news` | 163 News | `163.com/search?keyword=` (HTML) | HTML parse → `extract163SearchResults`; fallback to site-targeted search |
| `search_paperswithcode` | Papers With Code | `api.semanticscholar.org/graph/v1/paper/search` | Semantic Scholar API as backend |
| `search_osm` | OpenStreetMap | `nominatim.openstreet.org/search?q=&format=jsonv2` | Geocoding; returns lat/lon + OSM link |

#### 2c. Indie / Small-Web (0 tools)

> Indie / small-web engines (`search_wiby`, `search_marginalia`, `search_searchmysite`) are classified as **Layer 1 — General Web Search** above, since they expose a `search_<engine>` tool without a vertical specialization.

### Layer 3 — Fetch Tools (7 tools)

Single-URL fetch + structural helpers. All start from `fetchTextWithResponse` and add layered post-processing.

| Tool | Purpose | Implementation |
|---|---|---|
| `fetch_url` | Fetch any URL, extract readable text | `fetchTextWithResponse` → `extractReadableContent` (article extraction) → truncation at `max_chars` |
| `fetch_metadata` | Extract metadata from a URL | Fetches HTML (128KB limit) → parses `<title>`, `<meta>` description/og:image/etc. → returns structured metadata |
| `fetch_github_file` | Fetch a specific file from GitHub | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` → returns raw text |
| `fetch_robots` | Fetch + parse `robots.txt` | Derives origin from URL → fetches `/robots.txt` → parses user-agent blocks (Allow/Disallow) + Sitemap declarations |
| `fetch_sitemap` | Fetch + parse sitemap.xml | Default fetches the home page → parses `<urlset>` or `<sitemapindex>`; `recursive=true` walks child sitemaps |
| `fetch_html_to_markdown` | Markdown version of `fetch_url` | `fetchTextWithResponse` → cheerio-less DOM walker → preserves H1-H3 / links / lists / code blocks, drops `<script>`/`<style>`/`<nav>`/`<footer>` |
| `fetch_html_extract` | Fetch + structured extraction | Prefers Workers AI binding (graceful error when absent); falls back to raw text |

### Layer 4 — PDF Parser (2 tools)

Pure-worker PDF text extraction. No npm deps, no external services.

| Tool | Purpose | Implementation |
|---|---|---|
| `pdf_parse` | Fetch a PDF from URL and extract plain text | `fetch(url)` → `extractPdfTextAsync` (binary scan of `stream...endstream` blocks) → `DecompressionStream("deflate")` for FlateDecode streams → skip font/image/XObject non-text streams → extract by `BT...ET` + `Tj/TJ` operators |
| `pdf_to_markdown` | Fetch a PDF and convert to lightweight Markdown | Reuses `pdf_parse` → prepends `# PDF Document` metadata header → inserts `---` page-break markers between pages |

**Implementation notes:**
- **Binary scan**: byte-level locate `stream` (115,116,114,101,97,109) and `endstream` markers — no regex on binary streams.
- **FlateDecode decompression**: browser-native `DecompressionStream("deflate")`.
- **Text-stream filter**: `looksLikeTextStream()` checks decompressed stream for PDF text operators (BT/Tj/TJ/Td/Tm/Tf) or printable-ASCII ratio > 0.85; font programs / images / XObjects are skipped.
- **Noise filtering**: Strategy 1 (outline/metadata) and Strategy 2 (Info-dict metadata) are disabled — only Strategy 3 (decompressed real content streams) is used, which cleanly handles LaTeX-generated arXiv papers and other LaTeX-heavy PDFs.
- **Known limits**: scanned pure PDFs (image-only) need external OCR — not handled in-worker.

### Layer 5 — Dynamic Crawl (4 tools)

Pure-worker crawling with no browser dependency. The CF account has no Browser Rendering entitlement, so these tools use a layered heuristic strategy chain to maximize coverage without JS rendering.

| Tool | Purpose | Strategy chain |
|---|---|---|
| `crawl_scrape` | URL → clean markdown | (1) Detect Next.js `__NEXT_DATA__` / Nuxt `__NUXT__` / SvelteKit / Astro embedded JSON; (2) extract `application/ld+json` JSON-LD; (3) OG/Twitter meta tags; (4) cheerio-less DOM walker → markdown; (5) fallback to Archive.org Wayback snapshot |
| `crawl_screenshot` | URL content snapshot | DOM-derived snapshot: title + h1-h3 hierarchy + links + summary text + OG/Twitter + html sha256. **No PNG screenshot** — account has no BR entitlement |
| `crawl_pdf` | URL → PDF text | Reuses `pdf_parse` / `pdf_to_markdown`; PDFs are static binaries, no JS rendering needed |
| `crawl_extract` | URL → structured fields (no AI) | HTML heuristic extraction: (1) JSON-LD blocks; (2) OG/Twitter meta; (3) schema.org microdata `itemprop`; (4) `.price` / `.author` / `.title` heuristic class selectors → type coercion (string/number/boolean/array) |

### Layer 6 — Smart Orchestration (1 tool)

| Tool | Purpose | Implementation |
|---|---|---|
| `search_and_scrape` | Search → automatic full-text fetch | Orchestrator: calls `search_auto` internally for candidate URLs → 4-concurrent `fetch_url` or `pdf_parse` (PDF auto-routed when URL ends in `.pdf` or content-type is PDF) → returns `{query, results[], stats{elapsed_ms, succeeded, failed, concurrency: 4, deadline_hit}}`. 30s total timeout. |

### Utility Tools (3 tools)

| Tool | Purpose |
|---|---|
| `instant_answer` | DuckDuckGo Instant Answer API (`api.duckduck.com/?format=json`) |
| `find_rss` | Discover RSS/Atom feeds on a given URL |
| `debug_capture_search_html` | Debug tool: returns raw HTML from a search engine for parser development |

### Provider Admin (10 tools)

Non-public runtime configuration tools for API-key-driven engines. Listed in `tools/list` for operators but excluded from public tool counts above. Engines configured here are automatically picked up by `search_auto` when their host matches the query type.

| Tool | Purpose |
|---|---|
| `provider_list` | List all configured providers and their status (enabled, has key, last error) |
| `provider_get_config` | Read current config for one or all providers |
| `provider_set_config` | Set a generic provider's API key and endpoint via name/value params |
| `provider_set_bing` | Set Bing Search API key |
| `provider_set_brave` | Set Brave Search API key |
| `provider_set_jina` | Set Jina Reader API key |
| `provider_set_ollama` | Set Ollama endpoint and API key |
| `provider_set_parallel` | Set Parallel AI endpoint and API key |
| `provider_set_searxng` | Set SearXNG instance URL |
| `provider_set_serpapi` | Set SerpAPI key |
| `provider_set_tavily` | Set Tavily API key |

## Ranking Pipeline v3 (Detailed)

The ranking system has two layers: **per-engine finalize** (applied to each engine's results before they enter the cross-engine merger) and **cross-engine merge** (RRF + tiebreaker + diversity).

### Per-Engine Finalize

Every engine's results pass through this pipeline before reaching RRF:

```
Raw results
  │
  ├─ 0. Engine-confidence assessment (4 signals)
  │     • domain concentration (≥50% same 2nd-level domain = signal)
  │     • title diversity (unique titles / total ≤ 60% = signal)
  │     • empty-snippet rate (≥60% snippets < 20 chars = signal)
  │     • ad/sponsor rate (≥30% contain "Sponsored/Ad/广告/推广" = signal)
  │     0-1 signals → HIGH (send top 15) | MEDIUM (top 8) | LOW (top 3) | JUNK (send 0)
  │     JUNK events: recordEngineJunk → after 2 consecutive → 1min soft-freeze
  │
  ├─ 1. 5 hard-drop filters (any match = drop)
  │     Gate 1: isGenericWrapperResult (search pages, ads, sponsored)
  │     Gate 2: isHardIntentMismatchResult (off-topic)
  │     Gate 3: isLowTrustResult (CJK SEO spam, e.g. .org.cn with year)
  │     Gate 4: shouldDropVerticalResultType (when better types exist)
  │     Gate 5: isEngineSelfPage (engine self-domain / help / captcha / snippet == title)
  │
  ├─ 2. Type-specific cascade sort
  │     Type A (web search):
  │       L1: title match ratio (≥100% / ≥80% / ≥50% / <50%)
  │       L2: time decay (≤2yr / 2-5yr / >5yr / no date = center)
  │       L3: content info (snippet ≥200 / ≥100 / <100 chars)
  │       L4: original rank
  │     Type B (API): exact name match → API order → anomaly sink
  │     Type C (news): time bucket (24h / 7d / 30d / old) → title match within bucket
  │
  └─ 3. Confidence-based truncation (HIGH=15, MED=8, LOW=3, JUNK=0)
```

### Cross-Engine Merge (RRF)

```
All engines' filtered results
  │
  ├─ 1. Fuzzy dedup
  │     Pass A: URL exact match
  │     Pass B: same domain + title Levenshtein similarity ≥ 0.85
  │     On match: keep longer snippet/title, merge engine list
  │
  ├─ 2. RRF score
  │     finalScore = Σ over matching engines { engineWeight / (60 + rank) }
  │     engineWeight = base × queryTypeMult × healthMult
  │     base:  startpage/google=1.2, bing/yahoo/brave=1.0-1.1, indie=0.5
  │     queryTypeMult: developer→github/stackoverflow/npm ×1.5, news→bing_news/bbc ×1.5,
  │                    CJK→baidu/sogou/bing_cn ×1.3, academic→arxiv/semantic_scholar ×1.5
  │     healthMult: block_rate>50% → ×0.3, >30% → ×0.6, else ×1.0
  │
  ├─ 3. Tiebreaker chain (sequential, not additive)
  │     (1) more engines verified
  │     (2) more query tokens in title
  │     (3) longer title+snippet (more information)
  │     (4) domain authority (gov > edu > org > others)
  │     (5) result type (article/question/note > thread > others)
  │
  └─ 4. Domain diversity (sliding window)
        Window size 8, max 2 results per domain
        Overflow → deferred → appended after main pass
```

## Defense Layer

### Circuit Breaker

Per-engine sliding window. After 3 consecutive blocked/captcha responses, the engine is frozen for 5 minutes. Auto-recovers when `frozenUntil` expires.

```
Engine blocked → recordEngineBlocked() → failures++
3 failures → frozenUntil = now + 5min
Next request → isEngineCircuitBroken() → true → skip engine, try next
5min later → auto-clear
```

Applies to: Google, Yahoo, Bing, Yandex, and other HTML-scraped engines.

### JUNK Soft-Freeze (v3)

Complements the circuit breaker with a shorter-cycle soft freeze for engines returning low-quality results rather than hard blocks:

```
Engine returns JUNK confidence → recordEngineJunk() → count++
2 consecutive JUNK → frozenUntil = now + 1min
Next request → isEngineJunkFrozen() → true → skip engine
Engine returns non-JUNK → resetEngineJunk() → counter cleared
1min later → auto-clear
```

The soft freeze prevents Yahoo-style "garbage pages that aren't technically blocked" from being re-requested every search. The 1-minute window is short enough to self-heal quickly but long enough to skip one duplicate request batch.

### Engine Health Log

Per-engine sliding 1-hour event log (`success / blocked / empty / junk`). Used by:
- `_healthWeightMultiplier` in RRF engine weights: `block_rate > 50% → ×0.3, > 30% → ×0.6`
- The JUNK soft-freeze tracker
- The circuit breaker (alongside its own failure counter)

### Exponential Backoff Retry

For transient server errors (502, 503, 504) and network failures:

```
fetchWithUA(url, headers, { retries: 1, retryDelay: 200 })
  → 200ms * 2^attempt + random(0, 50ms) jitter
  → max 2 attempts (1 retry)
```

### Intent Mismatch Detection

**`isHardIntentMismatchResult`** — hard filter, drops obvious mismatches:
- English: alpha tokens (len ≥ 3) full-word matched against title+snippet. Coverage < 50% = mismatch.
- CJK: query characters checked against title+snippet. Zero hits = mismatch.
- Source-specific: BBC drops non-alpha noise; PubMed drops tech vs bio cross-contamination.

### Finalize Safeguards

The finalize defense layer includes protections against over-filtering:
- **Small-sample protection**: ≤2 results are never junk-killed as `generic_wrapper_results`
- **Cross-lingual pass**: pure English queries matching Chinese results skip `intent_mismatch`
- **Search engine host exemption**: results from `baidu.com/link?url=`, `/s?wd=`, or `/item/` paths are not auto-killed as search engine noise

### JSON Watchdog

`parseLenientJsonObject` has an 8KB guard: inputs larger than 8192 bytes skip the character-level repair loop and return `null` immediately. This prevents Cloudflare Worker CPU timeouts when upstream returns malformed large payloads.

### Style-Churn Resilience

`extractGenericLinks` uses a two-phase approach when class-based parsers fail:
1. **Block-level pre-filter**: scans `<li>`, `<div>`, `<section>`, `<article>` containers with internal links and title length ≥ 6, yielding results with snippets.
2. **Flat `<a>` fallback**: if blocks don't fill the limit, falls back to scanning all `<a>` tags with noise URL filtering.

This provides 85%+ recall even when upstream completely removes CSS class names.

## Response Format

Every search tool returns a consistent structure:

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

The MCP text output is prefixed with an ISO 8601 timestamp:

```
[2026-06-27T14:45:12.693Z] Search results for "query":
1. Title
   https://...
   Snippet text
```

## Local Development

```bash
# No npm install needed — zero dependencies
npx wrangler dev --local --port 8789

# Test
curl http://127.0.0.1:8789/health
curl -X POST http://127.0.0.1:8789/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_auto","arguments":{"query":"test","limit":3}}}'
```

## CI/CD

- **Smoke tests**: Every PR triggers `.github/workflows/smoke.yml` — runs `tests/smoke_trace.mjs` against the deployed worker
- **Extended smoke**: `tests/smoke_layer1_4.mjs` exercises the 11 Layer 1-4 tools (PDF + fetch helpers) end-to-end against the CF worker
- **Auto-deploy**: Merged PRs to `main` trigger `.github/workflows/deploy.yml` — builds and deploys to Cloudflare Workers
- **Branch protection**: `main` requires passing smoke CI + PR review
- **CI networking**: `CI_STRICT_NETWORKING` env var — `true` (local) uses `assert`, `false` (CI) uses `warn` for network-sensitive tests

## Project Structure

```
search-mcp-worker/
├── src/
│   ├── index.js              # Everything: MCP routing, 76 tools, ranking pipeline, defense layer (worker entry point)
│   ├── mcp/                  # Source modules bundled into index.js (kept for re-bundle / inspection)
│   │   ├── protocol.js       # JSON-RPC 2.0 envelope helpers (rpcResult, json, jsonRpcError, handleJsonRpc)
│   │   └── tool-schemas.js   # Shared input schema generator (querySchema)
│   └── core/                 # Source modules bundled into index.js (kept for re-bundle / inspection)
│       ├── provider-config.js    # Provider API-key resolution (env → PROVIDER_CONFIG → runtime)
│       ├── provider-defaults.js  # Default per-provider config table (brave, jina, ollama, parallel, …)
│       └── request-context.js    # Per-request context for the JSON-RPC handler
├── __tests__/                # Node `node:test` unit tests (offline, no network)
│   ├── core/provider-config.test.js
│   ├── mcp/protocol.test.js
│   └── search/{public-tool-fixes,public-tool-surface,search-auto,vertical-tool-precision}.test.js
├── tests/                    # Online smoke + provider-sweep tests (require network)
│   ├── smoke_trace.mjs       # Core smoke test suite (run in CI against the deployed worker)
│   ├── smoke_layer1_4.mjs    # Extended smoke — Layer 1-4 tools end-to-end
│   ├── parser_harness.mjs    # Parser unit tests (offline)
│   ├── provider_sweep.mjs    # Full provider audit
│   └── regression_20domain.mjs  # 20-domain regression sweep
├── scripts-smoke-mcp.mjs     # One-shot smoke for a freshly-deployed worker (used post-deploy verification)
├── .github/workflows/
│   ├── smoke.yml             # PR smoke CI — runs `node --check src/index.js` + `tests/smoke_trace.mjs` against the live worker
│   └── deploy.yml            # Auto-deploy on merge to main
├── dict_synonyms.json        # Engine-health synonym table used by Health-Log + RRF engine weighting
├── wrangler.toml
├── package.json
├── LICENSE
└── README.md
```

## Known Limitations

| Issue | Cause | Status |
|---|---|---|
| Reddit direct access (API/RSS/JSON/redlib) | Reddit blocks all CF Worker IP ranges (403) | Worked around via Startpage proxy in `search_reddit_rss` |
| Bing sometimes returns e-commerce for general queries | Bing's algorithmic bias toward shopping | Won't fix — filtering would kill legitimate commercial queries |
| Sogou returns empty on CF Workers IP | Sogou serves degraded results to datacenter IPs | Upstream limitation |
| Archive.org `advancedsearch` timeout | API unreachable from CF Workers edge nodes | Upstream limitation |
| Sina News empty for some queries | API returns empty for certain keywords | Upstream limitation |
| Arxiv occasional timeout | Network path from CF edge to `export.arxiv.org` | Transient |
| Lemmy community search coverage | Only matches against a hardcoded hint list (linux/docker/rust/etc) | Expand as needed |
| `crawl_screenshot` returns text snapshot, not PNG | CF account has no Browser Rendering entitlement | Use a BR-enabled account for real screenshots |
| PDF parser on image-only (scanned) PDFs | No OCR in-worker | Pipe scanned PDFs to external OCR |
| `crawl_scrape` on JS-rendered SPAs | No JS execution in pure worker | Use Archive.org Wayback fallback or BR-enabled endpoint |

## Agent Behavior Guide

When using these tools from an LLM agent (Claude, Cursor, etc.), observe these signals:

### `content_type: "challenge_page"` (fetch_url)

When `fetch_url` encounters anti-bot protection (WAF/JS challenge/IP block):

| Signal | Meaning | Agent action |
|---|---|---|
| `content_type: "challenge_page"` + `status: 202` | JS probe required — page needs browser execution | Do NOT treat text as article content. Use `search_auto` or alternative sources instead |
| `content_type: "challenge_page"` + `status: 403` | Data center IP blocked | Same — switch to search tools for the information |

### Recommended tool chains

```
# Article / blog content
1. fetch_url           → primary read
2. crawl_scrape        → if fetch_url returns challenge_page, try cleaner markdown
3. search_and_scrape   → if you don't yet have a URL, search first then auto-fetch

# PDF / academic content
1. pdf_to_markdown     → when URL ends in .pdf or content-type is PDF
2. pdf_parse           → when you need raw text only

# Site-level discovery
1. fetch_robots        → check crawl permissions
2. fetch_sitemap       → enumerate discoverable URLs
3. fetch_html_extract  → structured fields from a known page
```

## What This Is Not

- Not a commercial SERP API replacement
- Not a browser automation platform or JS-rendering crawler
- Not a private/authenticated connector for closed platforms
- Not a full readability engine
- Not a PDF OCR service

## Deployment Verification

- 76 tools verified end-to-end against a CF Workers edge deployment
- Ranking pipeline v3 verified across 4 query intents (default / developer / CJK / academic / news)
- RRF cross-engine consensus verified producing top-3 multi-source agreement on academic and English queries
- Engine confidence assessment verified correctly identifying Yahoo garbage pages via 4-signal detection
- PDF parser verified on a real arXiv paper (23 pages, LaTeX-heavy) → clean body text extraction
- See `tests/smoke_layer1_4.mjs` for the 39-assertion extended smoke suite covering Layers 1-4

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International** (CC BY-NC-SA 4.0) — see the [LICENSE](LICENSE) file for the full text.

> ⚠️ **License history note**: This repo briefly switched to MIT (commit `1e955f6`) and GPL-3.0 (commit `0f7d68b`) before reverting back to CC BY-NC-SA 4.0 (commit `04938da`). The `LICENSE` file on `main` is authoritative. `package.json` still declares `"license": "GPL-3.0"` as a stale field — the `LICENSE` file wins.

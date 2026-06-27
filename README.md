# search-mcp-worker

English | [简体中文](./README.zh-CN.md)

A single-file Cloudflare Worker that exposes **53 MCP tools** for web search, page fetching, PDF parsing, and dynamic crawling through one JSON-RPC endpoint. Zero npm dependencies, zero database, zero browser cluster.

Designed for LLM agents and automation that need one stable search/work surface instead of stitching together many providers.

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                       │
├──────────────┬───────────────┬──────────────┬──────────────┬──────────┤
│  General     │  Vertical     │  Fetch       │  PDF         │  Crawl   │
│  Search      │  Sources      │  Tools       │  Parser      │  Tools   │
│  (12)        │  (29)         │  (7)         │  (2)         │  (4)     │
├──────────────┼───────────────┼──────────────┼──────────────┼──────────┤
│ HTML parse   │ JSON API +    │ HTML→text /  │ FlateDecode  │ Pure     │
│ + multi-     │ HTML parse    │ robots /     │ + binary     │ worker   │
│ engine       │ + finalize    │ sitemap /    │ stream scan  │ strategy │
│ fallback     │ pipeline      │ md / extract │ (zero deps)  │ chain    │
├──────────────┴───────────────┴──────────────┴──────────────┴──────────┤
│  Defense Layer                                                       │
│  Circuit Breaker │ Exponential Backoff │ Intent Mismatch │ finalize  │
└──────────────────────────────────────────────────────────────────────┘
```

Plus 1 orchestrator: `search_and_scrape` — wires search results → parallel full-text fetch.

Everything lives in `src/index.js`. No build step.

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
# → {"ok":true,"build":{"sha":"b39bd1e","time":"..."}}
```

## Tool Surface (53 tools)

The 53 tools are grouped into **6 functional layers** plus a small utility bucket. All share the same defense layer (circuit breaker, exponential backoff, intent mismatch detection).

### Layer 1 — General Web Search (12 tools)

Parse HTML search result pages. Each engine has a multi-attempt fallback chain with rotating User-Agents.

| Tool | Engine | URL Pattern | Fallback Strategy |
|---|---|---|---|
| `search_auto` | Multi-engine | — | Tries engines in order, merges, reranks. Returns `fallback_used`, `quality_status`, `quality_reason` |
| `search_duckduckgo` | DuckDuckGo | `noai.duckduckgo.com/?q=` → `lite.duckduckgo.com/lite/` (POST) → `html.duckduckgo.com/html/` | 3 attempts: noai → lite (POST form) → html |
| `search_bing` | Bing (US) | `bing.com/search?q=` | Primary params → fallback params, 2 routes |
| `search_bing_global` | Bing (Global) | `bing.com/search?q=` + `cn.bing.com/search?q=` | US + CN routes, primary → fallback params |
| `search_bing_cn` | Bing (CN) | `cn.bing.com/search?q=` | CN-optimized headers + fallback params |
| `search_yahoo` | Yahoo | `search.yahoo.com/search?p=` | 3 attempts: nojs → standard → minimal headers; auto-handles consent form via `retryYahooWithConsentForm` |
| `search_google_web` | Google | `google.com/search?q=` | 3 attempts: GSA UA → Chrome UA + `gbv=1` → bare |
| `search_baidu` | Baidu | `m.baidu.com/s?word=` → `baidu.com/s?wd=&tn=json` → `baidu.com/s?wd=` | Mobile HTML → JSON API → Desktop HTML |
| `search_yandex` | Yandex | `yandex.com/search/?text=` | GSA UA → bare; captcha detection → returns `blocked: true` |
| `search_naver` | Naver | `search.naver.com/search.naver?query=` | Single attempt, HTML parse |
| `search_sogou` | Sogou | `sogou.com/web?query=` | H3+A regex → generic link extraction; filters `sogou.com/?s_from=hint_up` suggestion noise |
| `search_brave` | Brave | `search.brave.com/search?q=` | Single attempt, HTML parse |
| `search_qwant` | Qwant | `qwant.com/?q=` | Single attempt, HTML parse |
| `search_ecosia` | Ecosia | `ecosia.org/search?q=` | Single attempt, HTML parse |

### Layer 2 — Vertical Sources (29 tools)

Structured JSON APIs (22) and HTML-scrape sources (7). All results pass through `finalizeVerticalSearchResults` for intent mismatch detection and noise filtering.

#### 2a. JSON API (22 tools)

| Tool | Source | API | Implementation Details |
|---|---|---|---|
| `search_arxiv` | arXiv | `export.arxiv.org/api/query?search_query=all:` (Atom XML) | XML parse → `{title, url, snippet}`; fallback to `searchSiteTargetVertical` on failure |
| `search_pubmed` | PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch` → `efetch` | Two-step: esearch gets IDs → efetch gets abstracts; **tech signal detection** prevents bio queries from returning tech noise |
| `search_hackernews` | Hacker News | `hn.algolia.com/api/v1/search?tags=story` | Algolia API; `objectID` fallback for self-posts |
| `search_stackoverflow` | Stack Exchange | `api.stackexchange.com/2.3/search/advanced` | Configurable `site` param (default: `stackoverflow`); body included via `filter=withbody` |
| `search_reddit` | Reddit | `reddit.com/search.json?q=&sort=relevance` | Optional `subreddit` param; `raw_json=1`; fallback to `searchRedditFallback` on failure |
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
| `search_musicbrainz` | MusicBrainz | `musicbrainz.org/ws/2/recording/?query=&fmt=json` | Artist + album in snippet |
| `search_crossref` | Crossref | `api.crossref.org/works?query=` | DOI-linked academic papers |
| `search_pypi` | PyPI | `pypi.org/search/?q=` (HTML) → `pypi.org/pypi/{name}/json` (direct lookup) | HTML scrape first; if 0 results, tries exact package name lookup |
| `search_crates` | crates.io | `crates.io/api/v1/crates?q=` | Direct JSON API |
| `search_github_repos` | GitHub | `api.github.com/search/repositories?q=&sort=stars` | Star-sorted; candidate over-fetch then slice |
| `search_ollama` | Ollama | `api.olloma.com/v1/web-search` (POST) | Provider-configurable endpoint; requires API key |
| `search_parallel` | Parallel | `api.parallel.ai/v1/search` (POST) | Provider-configurable endpoint |

#### 2b. HTML Scrape (7 tools)

| Tool | Source | URL Pattern | Parsing Strategy |
|---|---|---|---|
| `search_bbc` | BBC | `bbc.co.uk/search?q=` | HTML parse |
| `search_bing_news` | Bing News | `bing.com/news/search?q=&format=rss` | RSS first, HTML fallback |
| `search_sina_news` | Sina News | `search.sina.com.cn/api/news?q=` (JSON) → HTML fallback | JSON API first; falls back to `searchSiteTargetVertical` with `host=sina.com.cn` |
| `search_163_news` | 163 News | `163.com/search?keyword=` (HTML) | HTML parse → `extract163SearchResults`; fallback to site-targeted search |
| `search_paperswithcode` | Papers With Code | `api.semanticscholar.org/graph/v1/paper/search` | Semantic Scholar API as backend |
| `search_osm` | OpenStreetMap | `nominatim.openstreetmap.org/search?q=&format=jsonv2` | Geocoding; returns lat/lon + OSM link |
| `search_archive` | Archive.org | `archive.org/wayback/available?url=` + `advancedsearch.php?q=` | Wayback Machine lookup + advanced search; **currently limited** by CF Workers IP timeout |

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
| `instant_answer` | DuckDuckGo Instant Answer API (`api.duckduckgo.com/?format=json`) |
| `find_rss` | Discover RSS/Atom feeds on a given URL |
| `debug_capture_search_html` | Debug tool: returns raw HTML from a search engine for parser development |

## Defense Layer

### Circuit Breaker (PR #2)

Per-engine sliding window. After 3 consecutive blocked/captcha responses, the engine is frozen for 5 minutes. Auto-recovers when `frozenUntil` expires.

```
Engine blocked → recordEngineBlocked() → failures++
3 failures → frozenUntil = now + 5min
Next request → isEngineCircuitBroken() → true → skip engine, try next
5min later → auto-clear
```

Applies to: Google, Yahoo, Bing, Yandex, and other HTML-scraped engines.

### Exponential Backoff Retry (PR #5)

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

**`isIntentMismatchResult`** — soft filter, used when hard filter doesn't fire:
- Checks semantic distance between query intent and result content.
- Engine-specific tuning.

### `finalizeVerticalSearchResults`

Pipeline for all vertical sources (hackernews, reddit, devto, mastodon, peertube, stackoverflow, sec_edgar, osm, bbc, bing_news, sina_news, 163_news, wikipedia, pubmed):

```
Raw results
  → classifyVerticalResultType (forum_post, news_article, package, etc.)
  → filter: isGenericWrapperResult (drop wrapper/portal pages)
  → filter: isHardIntentMismatchResult (drop off-topic)
  → filter: isLowTrustResult (drop low-quality signals)
  → filter: shouldDropVerticalResultType (keep preferred types)
  → scoreVerticalResult (relevance scoring)
  → sort by score, slice to limit
  → return with filtered_count + filtered_reason
```

**Note:** `lemmy` bypasses `finalizeVerticalSearchResults` (uses `searchResult` directly) because Lemmy post titles use community jargon that token coverage filters incorrectly kill.

### Circuit Breaker Flow for `search_auto`

```
search_auto attempts engines in order:
  for each engine:
    if isEngineCircuitBroken(engine) → skip, report "circuit_breaker_frozen"
    results = engine.search(query)
    if results.length > 0 → recordEngineSuccess, use results
    if blocked/captcha → recordEngineBlocked, try next engine
  merge all successful results
  rerank
  return with quality_status: green/yellow/red
```

### JSON Watchdog (PR #21)

`parseLenientJsonObject` has an 8KB guard: inputs larger than 8192 bytes skip the character-level repair loop and return `null` immediately. This prevents Cloudflare Worker CPU timeouts when upstream returns malformed large payloads.

### Style-Churn Resilience (PR #21)

`extractGenericLinks` uses a two-phase approach when class-based parsers fail:
1. **Block-level pre-filter**: scans `<li>`, `<div>`, `<section>`, `<article>` containers with internal links and title length ≥ 6, yielding results with snippets.
2. **Flat `<a>` fallback**: if blocks don't fill the limit, falls back to scanning all `<a>` tags with noise URL filtering.

This provides 85%+ recall even when upstream completely removes CSS class names.

### `_meta.parser` Observability (PR #23)

Every search response includes a `_meta` field indicating how results were obtained:

```json
{
  "ok": true,
  "results": [...],
  "_meta": { "parser": "exact" }
}
```

- `"exact"`: results from primary class-based or API parsing
- `"skeleton_fallback"`: results from `extractGenericLinks` style-churn fallback

LLM agents can use this to assess result quality and adjust behavior (e.g., cross-reference with vertical sources when skeleton_fallback fires repeatedly).

### Finalize Safeguards (PR #24)

The finalize defense layer includes protections against over-filtering:

- **Small-sample protection**: ≤2 results are never junk-killed as `generic_wrapper_results`
- **Cross-lingual pass**: pure English queries matching Chinese results skip `intent_mismatch` (prevents killing cross-language search results)
- **Search engine host exemption**: results from `baidu.com/link?url=`, `/s?wd=`, or `/item/` paths are not auto-killed as search engine noise

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

The MCP text output is prefixed with an ISO 8601 timestamp:

```
[2026-06-03T14:45:12.693Z] Duckduckgo search results for "query":
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
├── src/index.js              # Everything: MCP routing, 53 tools, defense layer
├── tests/
│   ├── smoke_trace.mjs       # Core smoke test suite (online)
│   ├── smoke_layer1_4.mjs    # Extended smoke — 11 Layer 1-4 tools, 39 assertions
│   ├── parser_harness.mjs    # Parser unit tests (offline, 25 assertions)
│   └── provider_sweep.mjs    # Full provider audit
├── .github/workflows/
│   ├── smoke.yml             # PR smoke CI
│   └── deploy.yml            # Auto-deploy on merge
├── wrangler.toml
├── package.json
└── README.md
```

## Known Limitations

| Issue | Cause | Status |
|---|---|---|
| Bing sometimes returns e-commerce (e.g. Best Buy for "best pizza recipe") | Bing's algorithmic bias toward shopping | Won't fix — filtering would kill legitimate commercial queries |
| Sogou returns empty on CF Workers IP | Sogou serves degraded results (suggestions only) to datacenter IPs | Upstream limitation |
| Archive.org `advancedsearch` timeout | API unreachable from CF Workers edge nodes | Upstream limitation |
| Sina News empty for some queries | API returns empty for certain keywords | Upstream limitation |
| Arxiv occasional timeout | Network path from CF edge to `export.arxiv.org` | Transient |
| Lemmy community search coverage | Only matches against a hardcoded hint list (linux/docker/rust/etc) | Expand as needed |
| `crawl_screenshot` returns text snapshot, not PNG | CF account has no Browser Rendering entitlement | Use a BR-enabled account for real screenshots |
| PDF parser on image-only (scanned) PDFs | No OCR in-worker | Pipe scanned PDFs to external OCR |
| `crawl_scrape` on JS-rendered SPAs | No JS execution in pure worker | Use Archive.org Wayback fallback or BR-enabled endpoint |

## Agent Behavior Guide

When using these tools from an LLM agent (Claude, Cursor, etc.), observe these signals:

### `_meta.parser` (search tools)

Every search response includes `_meta.parser`:

| Value | Meaning | Agent action |
|---|---|---|
| `"exact"` | Primary parser matched site structure | High confidence — use results directly |
| `"skeleton_fallback"` | Generic fallback due to site layout changes | Lower precision — cross-reference with vertical tools (e.g., `search_github_repos`, `search_pubmed`) |

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

- 53 tools verified end-to-end against a CF Workers edge deployment
- PDF parser verified on a real arXiv paper (23 pages, LaTeX-heavy) → clean body text extraction
- See `tests/smoke_layer1_4.mjs` for the 39-assertion extended smoke suite covering Layers 1-4

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International — see the [LICENSE](LICENSE) file for details.
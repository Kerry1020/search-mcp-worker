# search-mcp-worker

[![CI](https://github.com/Kerry1020/search-mcp-worker/actions/workflows/test.yml/badge.svg)](https://github.com/Kerry1020/search-mcp-worker/actions/workflows/test.yml)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6E56CF)](https://modelcontextprotocol.io)

English | [简体中文](README.zh-CN.md)

Multi-engine web search MCP server on Cloudflare Workers, with open, auditable ranking.

**An MCP search server where the ranking is open-source and auditable.**

Your AI shouldn't have to trust black-box search results from Tavily, Exa, or Brave. Here, you can see **why** result #1 beat result #2 — every ranking decision is in `src/index.js`.

> **Zero per-query API costs.** Deploy once to your own Cloudflare account (Workers free plan: 100k requests/day).
> **Not a wrapper.** 16 general web engines plus 28 vertical sources, merged via weighted Reciprocal Rank Fusion (RRF, k=60). Each engine contributes `weight / (60 + rank)`, so a result that several engines place near the top beats one that a single engine ranks #1.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kerry1020/search-mcp-worker)

> **Heads up:** If you see *"Unable to fetch repository contents"*, your Cloudflare account isn't linked to GitHub yet. Go to **[Workers & Pages → Create → Connect to Git](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)**, authorize the **Cloudflare Workers & Pages** GitHub App, then click the button again.

## Who is this for

| ✅ You want this if | ❌ You don't want this if |
|---|---|
| You want auditable, open-source ranking for your AI's search | "Just give me results, I don't care how" → use **Tavily MCP** |
| You self-host and care about search quality over convenience | You don't have (or want) a Cloudflare account |
| You want zero per-query API costs beyond the CF free tier | You need enterprise SLA, support, or compliance guarantees |
| You care that "3 engines all rank it top-5" is a stronger signal than "1 engine ranks it #1" | You want a single-engine proxy — use **Brave Search MCP** |

## What makes this different

| Your AI's search today | The problem | With search-mcp-worker |
|---|---|---|
| Single-engine MCPs (Brave, Google) | One perspective. Algorithmic blind spots inherited from one index. | 16 general web engines + 28 vertical sources; `search_auto` picks engines by query intent and fuses them with RRF. |
| Black-box APIs (Tavily, Exa) | You can't see or fix ranking. Why is this SEO spam at #3? | Ranking code is open. `assessEngineConfidence` → 5 hard-drop filters → RRF → tiebreaker — all in `src/index.js`. |
| Additive bonuses ("3 engines like this = +3") | Can't distinguish "3 engines all rank it #1" from "one engine at #1 + two at #50" | **RRF(k=60):** score depends on each engine's rank, so three top-5 placements (≈0.046) clearly beat #1 + #50 + #50 (≈0.034). |

## Features

A Cloudflare Worker that exposes **62 MCP tools** (as returned by `tools/list`) through one JSON-RPC endpoint — general web search, vertical APIs, page fetching, PDF parsing, SPA-aware crawling and a search-then-scrape orchestrator. Zero runtime npm dependencies, no database, no browser cluster.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       POST /mcp  (JSON-RPC 2.0)                          │
├──────────────┬───────────────┬──────────────┬──────────────┬─────────────┤
│  General     │  Vertical     │  Fetch       │  PDF         │  Crawl      │
│  Search      │  Sources      │  Tools       │  Parser      │  Tools      │
│  (17)        │  (28)         │  (7)         │  (2)         │  (4)        │
├──────────────┴───────────────┴──────────────┴──────────────┴─────────────┤
│  Orchestrator (1): search_and_scrape   │   Utility (3)                   │
├──────────────────────────────────────────────────────────────────────────┤
│  Ranking Pipeline                                                        │
│  Engine-confidence → 5 hard drops → 3-type cascade → RRF(k=60) →         │
│  Tiebreaker chain → Domain diversity (window 8, max 2/domain)            │
├──────────────────────────────────────────────────────────────────────────┤
│  Defense Layer                                                           │
│  Circuit Breaker │ JUNK Soft-Freeze │ Exponential Backoff │ Health Log   │
└──────────────────────────────────────────────────────────────────────────┘
```

17 + 28 + 7 + 2 + 4 + 1 + 3 = **62** tools. The worker entry point is the single file `src/index.js`; there is no build step.

JSON-RPC methods handled on `POST /mcp`: `initialize` (protocol version `2025-03-26`), `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Batched requests are supported. Responses are plain JSON (no SSE stream).

## Quick start

1. Deploy (button above, or from a clone):

   ```bash
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

2. Check it's up:

   ```bash
   curl https://<your-worker>.workers.dev/health
   # → {"ok":true,"name":"search-mcp-worker","version":"0.7.4","build":{...},"mcp_endpoint":".../mcp","tools":[...62 names...],"engine_health":{...},"circuit_breakers":{...}}
   ```

3. Add it to your MCP client (see [MCP client config](#mcp-client-config)):

   ```bash
   claude mcp add --transport http search https://<your-worker>.workers.dev/mcp
   ```

4. Try a call:

   ```bash
   curl -X POST https://<your-worker>.workers.dev/mcp \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_auto","arguments":{"query":"cloudflare workers","limit":3}}}'
   ```

## Usage / Tools (62)

All search tools take `query` (required) and `limit` (default 5, max 10) unless noted. All search results pass through the same defense layer (circuit breaker, JUNK soft-freeze, exponential backoff, intent-mismatch detection).

### `search_auto` and `auto_mode`

`search_auto` is the main entry point. Parameters: `query`, `limit`, `auto_mode`, `engines`.

How the candidate engine list is chosen (`selectSearchAutoEngines`):

| Input | Candidate engines |
|---|---|
| `auto_mode: "full"` | The intent-based default list **plus** a fixed list of 35 engines (deduplicated; 38 candidates for a generic English query). `engines` is **ignored** in this mode. |
| any other `auto_mode` value (or omitted) + `engines: [...]` | Exactly the engines you pass, in order. |
| any other `auto_mode` value (or omitted), no `engines` | Intent-based default list from `detectSearchIntent`: separate lists for Chinese, news, developer and generic queries (15–19 engines, starting with `brave`, `mojeek`, ...). |

Only `"full"` is special; every other value (including `"default"`) behaves as default mode, and the response reports `auto_mode: "full"` or `"default"`. Engines whose provider is disabled (`x-<provider>-enabled: false` or `provider_set_config`) are removed from the list.

How the list is executed (`searchAuto`) — this is the same in both modes:

1. Engines that are circuit-broken or JUNK-frozen are skipped.
2. The **first 4** remaining engines run concurrently (12 s race timeout).
3. If at least one returns usable (green/yellow) results, their results are RRF-merged and returned immediately.
4. Otherwise the remaining engines are tried **one at a time**, stopping at the first engine that returns usable results.

So `"full"` widens the pool of fallback engines; it does not query every engine on every call. In practice a response fuses at most ~4–5 engines. Results are cached per (engine list, query, limit).

Engine names accepted in `engines`: `duckduckgo`, `bing`, `bing_global`, `bing_cn`, `bing_news`, `yahoo`, `google`, `yandex`, `baidu`, `naver`, `sogou`, `brave`, `qwant`, `ecosia`, `mojeek`, `startpage`, `searchmysite`, `marginalia`, `wiby`, `archive`, `wikipedia`, `wikidata`, `wiktionary`, `semantic_scholar`, `arxiv`, `pubmed`, `paperswithcode`, `crossref`, `hackernews`, `stackoverflow`, `reddit`, `reddit_rss`, `npm`, `devto`, `crates`, `pypi`, `github_repos`, `mastodon`, `peertube`, `lemmy`, `bbc`, `sina_news`, `163_news`, `sec_edgar`, `osm`, `openlibrary`, `musicbrainz`, `find_rss`, `ollama`, `parallel`. Unknown names are silently skipped.

### Layer 1 — General Web Search (17 tools)

Parse HTML search result pages. Most engines have a multi-attempt fallback chain with rotating User-Agents. **(indie)** = small-web / independent index.

| Tool | Engine | Key params | URL / fallback strategy |
|---|---|---|---|
| `search_auto` | Multi-engine RRF | `auto_mode`, `engines` | See above |
| `search_duckduckgo` | DuckDuckGo | `region` (default `us-en`) | 3 attempts: `noai.duckduckgo.com` → `lite.duckduckgo.com/lite/` (POST) → `html.duckduckgo.com/html/` |
| `search_bing` | Bing (US) | — | `bing.com/search?q=`; primary → fallback params |
| `search_bing_global` | Bing (Global) | — | `bing.com` + `cn.bing.com` routes, primary → fallback params |
| `search_bing_cn` | Bing (CN) | — | `cn.bing.com/search?q=`, CN-optimized headers + fallback params |
| `search_yahoo` | Yahoo | — | `search.yahoo.com/search?p=`; 3 attempts (nojs → standard → minimal headers); handles consent form |
| `search_google_web` | Google | — | `google.com/search?q=`; 3 attempts (GSA UA → Chrome UA + `gbv=1` → bare); may be rate limited |
| `search_baidu` | Baidu | — | `m.baidu.com` HTML → `baidu.com/s?tn=json` → desktop HTML |
| `search_yandex` | Yandex | `language` | `yandex.com/search/?text=`; captcha detection → `blocked: true` |
| `search_naver` | Naver | — | `search.naver.com`, single attempt |
| `search_sogou` | Sogou | — | `sogou.com/web?query=`; H3+A regex → generic links; filters suggestion noise |
| `search_archive` | Archive.org | `mode` (`search` / `wayback`) | Wayback availability + `advancedsearch.php`; **often times out** from CF edge |
| `search_startpage` | Startpage | — | `startpage.com/sp/search?q=`; also the Reddit proxy |
| `search_mojeek` | Mojeek (own index) | — | `mojeek.com/search?q=` |
| `search_searchmysite` | searchmysite **(indie)** | — | `searchmysite.net/search?q=` |
| `search_marginalia` | Marginalia **(indie)** | — | `search.marginalia.nu/search?query=` |
| `search_wiby` | Wiby.me **(indie)** | — | `wiby.me/?q=`, pure HTML |

### Layer 2 — Vertical Sources (28 tools)

All results pass through the v3 finalize pipeline (engine-confidence → 5 hard drops → type-specific cascade).

#### 2a. JSON / XML APIs (23 tools)

| Tool | Source | Key params | Implementation details |
|---|---|---|---|
| `search_arxiv` | arXiv | — | `export.arxiv.org/api/query` (Atom XML); falls back to site-targeted search |
| `search_pubmed` | PubMed | — | esearch → efetch; tech-signal detection keeps tech noise out of bio queries |
| `search_semantic_scholar` | Semantic Scholar | — | `api.semanticscholar.org/graph/v1/paper/search`; HTTP 429 → arXiv fallback; optional API key via `provider_set_config` (`provider: "semantic_scholar"`) |
| `search_paperswithcode` | Papers With Code | — | Uses the Semantic Scholar API as backend |
| `search_crossref` | Crossref | — | `api.crossref.org/works?query=`, DOI-linked papers |
| `search_hackernews` | Hacker News | — | `hn.algolia.com/api/v1/search?tags=story` |
| `search_stackoverflow` | Stack Exchange | `site` (default `stackoverflow`) | `api.stackexchange.com/2.3/search/advanced` |
| `search_reddit` | Reddit | `subreddit` | `reddit.com/search.json`; Reddit usually returns 403 to CF IPs — use `search_reddit_rss` |
| `search_npm` | npm | — | `registry.npmjs.org/-/v1/search` |
| `search_pypi` | PyPI | — | HTML search, then `pypi.org/pypi/{name}/json` exact lookup |
| `search_crates` | crates.io | — | `crates.io/api/v1/crates?q=` |
| `search_github_repos` | GitHub | — | `api.github.com/search/repositories?sort=stars`, unauthenticated |
| `search_devto` | dev.to | — | 3-tier tag strategy: compound tag → first-word tag → `?q=` |
| `search_mastodon` | Mastodon | `instance` (default `mastodon.social`) | `/api/v2/search` + hashtag timeline |
| `search_lemmy` | Lemmy | `instance` (default `lemmy.world`) | Community fallback for known topics; lemmy.world / lemmy.ml / programming.dev |
| `search_peertube` | PeerTube | — | `search.joinpeertube.org/api/v1/search/videos` |
| `search_wikipedia` | Wikipedia | `language` | `{lang}.wikipedia.org/w/api.php`; HTML fallback |
| `search_wikidata` | Wikidata | — | `wbsearchentities`, entity ID + description |
| `search_wiktionary` | Wiktionary | `language` (no `limit`) | `{lang}.wiktionary.org/w/api.php` |
| `search_openlibrary` | Open Library | — | `openlibrary.org/search.json` |
| `search_musicbrainz` | MusicBrainz | — | `musicbrainz.org/ws/2/recording` |
| `search_sec_edgar` | SEC EDGAR | `form_type` (10-K, 10-Q, 8-K, …) | `efts.sec.gov/LATEST/search-index` |
| `search_osm` | OpenStreetMap | — | `nominatim.openstreetmap.org/search?format=jsonv2`, lat/lon + OSM link |

#### 2b. HTML / RSS scrape (5 tools)

| Tool | Source | Key params | Parsing strategy |
|---|---|---|---|
| `search_bbc` | BBC | — | `bbc.co.uk/search` HTML |
| `search_bing_news` | Bing News | — | `bing.com/news/search?format=rss`, HTML fallback |
| `search_sina_news` | Sina News | — | JSON API → site-targeted fallback (`sina.com.cn`) |
| `search_163_news` | 163 News | — | HTML parse → site-targeted fallback |
| `search_reddit_rss` | Reddit via Startpage | `sort` (`relevance`/`new`/`top`/`comments`), `limit` up to 20 | Reddit blocks CF Worker IPs, so this searches Startpage for Reddit and keeps reddit.com URLs |

> Indie engines (`search_wiby`, `search_marginalia`, `search_searchmysite`) are listed under Layer 1.

### Layer 3 — Fetch Tools (7 tools)

| Tool | Key params | Purpose / implementation |
|---|---|---|
| `fetch_url` | `url`, `maxChars` | Fetch any public URL → readable text; reports `content_type: "challenge_page"` on anti-bot pages |
| `fetch_metadata` | `url` | Title, description, canonical URL, status, content type |
| `fetch_github_file` | `owner`, `repo`, `path`, `ref`, `maxChars` | `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` |
| `fetch_robots` | `url`, `maxChars` | Derives origin → `/robots.txt` → Allow/Disallow + Sitemap lines |
| `fetch_sitemap` | `url`, `recursive`, `maxUrls` | Parses `<urlset>` / `<sitemapindex>`; `recursive=true` walks child sitemaps |
| `fetch_html_to_markdown` | `url`, `maxChars` | DOM walker → markdown (H1–H3, links, lists, code); drops script/style/nav/footer |
| `fetch_html_extract` | `url`, `schema` | Intended to extract fields with Workers AI (Llama 3.1 8B). **Currently always returns `ok: false` ("Workers AI unavailable")**: there is no `[ai]` binding in `wrangler.toml` and the fetch handler does not pass `env` to tools. Use `crawl_extract` instead. |

### Layer 4 — PDF Parser (2 tools)

Pure-worker PDF text extraction. No npm deps, no external services.

| Tool | Key params | Implementation |
|---|---|---|
| `pdf_parse` | `url`, `maxChars` | Binary scan of `stream…endstream` blocks → `DecompressionStream("deflate")` for FlateDecode → skip font/image/XObject streams → extract `BT…ET` + `Tj/TJ` text |
| `pdf_to_markdown` | `url`, `maxChars` | Same extraction, plus `# PDF Document` header and `---` page breaks |

**Implementation notes:**
- **Binary scan**: byte-level search for `stream` / `endstream` markers — no regex on binary data.
- **Text-stream filter**: `looksLikeTextStream()` checks for PDF text operators (BT/Tj/TJ/Td/Tm/Tf) or printable-ASCII ratio > 0.85.
- **Noise filtering**: Strategy 1 (outline/metadata) and Strategy 2 (Info-dict metadata) are disabled — only Strategy 3 (decompressed content streams) is used, which handles LaTeX-generated arXiv papers cleanly.
- **Known limits**: image-only (scanned) PDFs need external OCR.

### Layer 5 — Dynamic Crawl (4 tools)

No browser dependency (no Browser Rendering), so these use a layered heuristic chain.

| Tool | Key params | Strategy chain |
|---|---|---|
| `crawl_scrape` | `url`, `maxChars`, `useCache` | (1) Next.js `__NEXT_DATA__` / Nuxt / SvelteKit / Astro embedded JSON; (2) JSON-LD; (3) OG/Twitter meta; (4) DOM walker → markdown; (5) Archive.org Wayback fallback |
| `crawl_screenshot` | `url`, `maxLinks` | DOM-derived snapshot: title, h1–h3, links, summary, OG/Twitter, html sha256. **No PNG** |
| `crawl_pdf` | `url`, `format` (`text`/`markdown`), `maxChars` | Reuses `pdf_parse` / `pdf_to_markdown` |
| `crawl_extract` | `url`, `schema` | No AI: JSON-LD → OG/Twitter → schema.org `itemprop` → `.price`/`.author`/`.title` heuristics, with type coercion |

### Layer 6 — Orchestrator (1 tool)

| Tool | Key params | Implementation |
|---|---|---|
| `search_and_scrape` | `query`, `limit` (max 10), `maxCharsPerPage` (default 8000, max 20000), `engines`, `recencyDays` | Calls `search_auto` for candidate URLs → 4-concurrent `fetch_url` / `pdf_parse` (PDF auto-routed) → `{query, results[], stats{elapsed_ms, succeeded, failed, concurrency, deadline_hit}}`. 30 s total timeout. `recencyDays` is forwarded but not currently used by `search_auto`. |

### Utility Tools (3 tools)

| Tool | Key params | Purpose |
|---|---|---|
| `instant_answer` | `query` | DuckDuckGo Instant Answer API (`api.duckduckgo.com/?format=json`) |
| `find_rss` | `url` | Discover RSS/Atom feeds on a site |
| `debug_capture_search_html` | `engine` (bing / yahoo / yandex), `query`, `limit`, `language`, `maxChars` | Returns a bounded raw-HTML sample from a search page for parser development |

### Hidden tools (not in `tools/list`)

> **Note:** 16 more tools are defined in `TOOLS` but filtered out of `tools/list` (and `/health`) by `NON_PUBLIC_TOOL_NAMES`. They are **still callable via `tools/call`** if you know the name. They are hidden because they are operator/admin tools or unreliable from Cloudflare IPs.
>
> - Search: `search_brave` (HTML scrape; `brave` is still used internally by `search_auto`), `search_qwant`, `search_ecosia`, `search_ollama` (needs an Ollama API key), `search_parallel` (needs a Parallel API key).
> - Provider admin: `provider_list`, `provider_get_config`, `provider_set_config`, `provider_set_bing`, `provider_set_brave`, `provider_set_jina`, `provider_set_ollama`, `provider_set_parallel`, `provider_set_searxng`, `provider_set_serpapi`, `provider_set_tavily`. These read/write the in-memory `PROVIDER_CONFIG` of the current isolate (not persisted; API keys are masked in responses). Only the `ollama`, `parallel` and `semantic_scholar` API keys are actually used by any engine; `tavily`, `jina`, `searxng`, `serpapi` keys are stored but not consumed. The `enabled` flag of `brave`, `bing` (covers `bing_global` / `bing_cn` / `bing_news`), `ollama`, `parallel` and `semantic_scholar` removes those engines from `search_auto`.

## Configuration

There are no required environment variables, secrets or bindings — `wrangler.toml` only sets `name`, `main` and `compatibility_date`. Optional provider settings can be passed **per request as HTTP headers** (the MCP client sends them on every call):

| Name | Required | Secret | Default | Description |
|---|---|---|---|---|
| `x-ollama-api-key` (header) | No | Yes | — | API key for the `ollama` engine (`search_ollama`, or `engines: ["ollama"]`) |
| `x-ollama-base-url` (header) | No | No | `https://api.ollama.com/v1/web-search` | Ollama web-search endpoint |
| `x-parallel-api-key` (header) | No | Yes | — | API key for the `parallel` engine |
| `x-parallel-base-url` (header) | No | No | `https://api.parallel.ai/v1/search` | Parallel search endpoint |
| `x-<provider>-enabled` (header) | No | No | `true` | `false` removes that provider's engines from `search_auto` for this request. Providers: `brave`, `bing`, `ollama`, `parallel`, `semantic_scholar` (also accepted but unused: `tavily`, `jina`, `searxng`, `serpapi`) |
| `OLLAMA_API_KEY`, `PARALLEL_API_KEY` (env) | No | Yes | — | Last-resort fallback read from `process.env`. Only reachable if you enable the `nodejs_compat` compatibility flag (not set in the shipped `wrangler.toml`); otherwise use the headers above |
| `CLOUDFLARE_API_TOKEN` (GitHub Actions secret) | For CI deploy only | Yes | — | Used by `.github/workflows/deploy.yml` (`cloudflare/wrangler-action`) |

Any request that sets a provider header bypasses the `search_auto` result cache.

## MCP client config

The worker has no built-in authentication, so no auth header is needed.

**Claude Code:**

```bash
claude mcp add --transport http search https://<your-worker>.workers.dev/mcp
# optional: pass provider keys per request
claude mcp add --transport http --header "x-ollama-api-key: <key>" search https://<your-worker>.workers.dev/mcp
```

**Claude Desktop / generic JSON via mcp-remote:**

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

Clients that support remote HTTP servers directly can use `{"url": "https://<your-worker>.workers.dev/mcp"}`.

## Security notes

- **No authentication.** The code does not check any `Authorization` header or token, so there is no auth secret to set. Anyone who knows the URL can call every tool, including the hidden `provider_*` tools. CORS is `Access-Control-Allow-Origin: *`.
- `provider_set_*` / `provider_set_config` change the isolate-wide `PROVIDER_CONFIG`, so one caller can change engine settings (or plant API keys) for other requests served by the same isolate until it is recycled. Prefer per-request headers for keys.
- The fetch/crawl/PDF tools fetch arbitrary URLs from your worker, and every call consumes your Workers quota.
- For a public deployment, put the worker behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) or another gateway that enforces authentication, or keep the URL private.

## Ranking Pipeline v3 (Detailed)

The ranking system has two layers: **per-engine finalize** (applied to each engine's results before cross-engine merging) and **cross-engine merge** (RRF + tiebreaker + diversity).

### Per-Engine Finalize

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
  │     Pass B: same domain + title similarity ≥ 0.85 (Levenshtein)
  │     On match: keep longer snippet/title, merge engine list
  │
  ├─ 2. RRF score
  │     finalScore = Σ over matching engines { engineWeight / (60 + rank) }
  │     engineWeight = base × queryTypeMult × healthMult
  │     base:  startpage/google=1.2, bing_*=1.1, yahoo/brave/duckduckgo=1.0, indie=0.5
  │     queryTypeMult: developer→github/stackoverflow/npm/devto/hackernews ×1.5, news→bing_news/bbc ×1.5,
  │                    CJK→baidu/sogou/bing_cn ×1.3, academic→arxiv/semantic_scholar/pubmed/paperswithcode ×1.5
  │     healthMult: block_rate>50% → ×0.3, >30% → ×0.6, else ×1.0
  │
  ├─ 3. Tiebreaker chain (sequential, not additive)
  │     (1) more engines verified
  │     (2) more query tokens in title
  │     (3) longer title+snippet (more information)
  │     (4) domain authority (gov/edu > org > others)
  │     (5) result type (article/question/note > thread > others)
  │
  └─ 4. Domain diversity (sliding window)
        Window size 8, max 2 results per domain
        Overflow → deferred → appended after main pass
```

### What changed in v3

The ranking pipeline was rewritten on 2026-06-27 to replace a 30-constant additive scoring scheme with a multi-layer architecture:

| Layer | Before | After |
|---|---|---|
| Single-engine scoring | 30 hardcoded constants added (rank×3, type ±90, token ×14, CJK +60, gov +35...) | 3-type cascade (A: web search / B: API / C: news) with sequential criteria |
| Engine health | Single binary circuit breaker (3 blocked → 5min freeze) | Adds 4-signal confidence assessment (HIGH/MED/LOW/JUNK) + JUNK soft-freeze (2 consecutive → 1min skip) + per-engine `block_rate` health multiplier |
| Cross-engine merging | URL exact dedup + additive multi-source bonus | URL exact + same-domain fuzzy dedup + RRF (k=60) with 3-layer engine weight (base × query-type × health) + 5-stage tiebreaker chain + sliding-window domain diversity |
| Result types | Classified but used as additive scores | Hard pre-filter (engine-specific drop rules), no scoring influence |

The point: an additive bonus model cannot tell "3 engines all rank this in the top 5" apart from "3 engines returned it somewhere"; rank-based fusion can.

### Recent fix: Yahoo `id="web"` ol anchor (2026-06-28, commit `dfdf485`)

Yahoo's result page contains **multiple** `<ol class="reg searchCenterMiddle">` elements: a sidebar nav and the real results inside `<div id="web">`. The 180KB window around `id="web"` included both, so a lazy `<ol…>[\s\S]*?<\/ol>` regex matched the navigation first and the parser fell through to the generic-link extractor. The fix anchors the ol search to the substring **after** `id="web"`; `parseYahooBlock` (rewritten in the same commit) walks `<a …>…<h3>…</h3>…</a>` and falls back to the `r.search.yahoo.com/_ylt=…/RU=…` redirect.

| Metric (query=`python list comprehension`, limit=3) | Before | After |
|---|---|---|
| Result count | 0 (fallback rescue) | 3 |
| Parser | `skeleton_fallback` or undefined | `exact` |
| First result | n/a | `List Comprehension in Python - GeeksforGeeks` |

## Defense Layer

### Circuit Breaker

Per engine: after 3 blocked/captcha responses, the engine is frozen for 5 minutes, then auto-recovers.

```
Engine blocked → recordEngineBlocked() → failures++
3 failures → frozenUntil = now + 5min
Next request → isEngineCircuitBroken() → true → skip engine, try next
5min later → auto-clear
```

State lives in isolate memory, so it is per-isolate and resets on cold start.

### JUNK Soft-Freeze

A shorter-cycle soft freeze for engines returning low-quality pages rather than hard blocks:

```
Engine returns JUNK confidence → recordEngineJunk() → count++
2 consecutive JUNK → frozenUntil = now + 1min
Next request → isEngineJunkFrozen() → true → skip engine
Engine returns non-JUNK → resetEngineJunk() → counter cleared
```

### Engine Health Log

Per-engine sliding 1-hour event log (`success / blocked / empty / junk`), exposed at `/health` as `engine_health`. Feeds `_healthWeightMultiplier` in RRF (`block_rate > 50% → ×0.3, > 30% → ×0.6`, once an engine has ≥3 events).

### Exponential Backoff Retry

For 502/503/504 and network failures: `200ms * 2^attempt + random(0, 50ms)` jitter, 1 retry by default.

### Intent Mismatch Detection

**`isHardIntentMismatchResult`** drops obvious mismatches:
- English: alpha tokens (len ≥ 3) full-word matched against title+snippet; coverage < 50% = mismatch.
- CJK: query characters checked against title+snippet; zero hits = mismatch.
- Source-specific: BBC drops non-alpha noise; PubMed drops tech vs bio cross-contamination.

### Finalize Safeguards

- **Small-sample protection**: ≤2 results are never junk-killed as `generic_wrapper_results`.
- **Cross-lingual pass**: pure English queries matching Chinese results skip `intent_mismatch`.
- **Search engine host exemption**: `baidu.com/link?url=`, `/s?wd=`, `/item/` paths are not auto-killed as search-engine noise.

### JSON Watchdog

`parseLenientJsonObject` skips its character-level repair loop for inputs larger than 8192 bytes and returns `null`, avoiding Worker CPU timeouts on malformed large payloads.

### Style-Churn Resilience

When class-based parsers fail, `extractGenericLinks` (1) scans `<li>` / `<div>` / `<section>` / `<article>` blocks with internal links and titles ≥ 6 chars, then (2) falls back to all `<a>` tags with noise-URL filtering.

## Response Format

Each `tools/call` returns `{ content: [{ type: "text", text }], structuredContent }`. Search tools share this structured shape (example from `search_auto`):

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

The text content is prefixed with an ISO 8601 timestamp:

```
[2026-06-27T14:45:12.693Z] Search results for "query":
1. Title
   https://...
   Snippet text
```

## Agent Behavior Guide

### `content_type: "challenge_page"` (fetch_url)

| Signal | Meaning | Agent action |
|---|---|---|
| `content_type: "challenge_page"` + `status: 202` | JS probe required — page needs browser execution | Do NOT treat text as article content. Use `search_auto` or other sources |
| `content_type: "challenge_page"` + `status: 403` | Data-center IP blocked | Same — switch to search tools |

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
3. crawl_extract       → structured fields from a known page
```

## Known Limitations

| Issue | Cause | Status |
|---|---|---|
| Reddit direct access (API/RSS/JSON/redlib) | Reddit blocks CF Worker IP ranges (403) | Worked around via Startpage in `search_reddit_rss` |
| `fetch_html_extract` always fails | No AI binding, and `env` is not passed to tools | Use `crawl_extract` |
| Bing sometimes returns e-commerce for general queries | Bing's bias toward shopping | Won't fix — filtering would kill legitimate commercial queries |
| Sogou returns empty on CF Workers IPs | Degraded results for datacenter IPs | Upstream limitation |
| Archive.org `advancedsearch` timeout | Unreachable from CF edge | Upstream limitation |
| Sina News empty for some queries | API returns empty for certain keywords | Upstream limitation |
| arXiv occasional timeout | Network path from CF edge | Transient |
| Lemmy community search coverage | Only matches a hardcoded hint list (linux/docker/rust/etc) | Expand as needed |
| `crawl_screenshot` returns a text snapshot, not PNG | No Browser Rendering | By design |
| PDF parser on image-only PDFs | No in-worker OCR | Use external OCR |
| `crawl_scrape` on JS-rendered SPAs | No JS execution | Embedded-JSON heuristics + Wayback fallback |

## What This Is Not

- Not a commercial SERP API replacement
- Not a browser automation platform or JS-rendering crawler
- Not a private/authenticated connector for closed platforms
- Not a full readability engine
- Not a PDF OCR service

## Intended Use

This worker is a **lightweight discovery surface for conversational clients** — small LLM-driven tools, chat assistants, and on-the-fly research where a few good results beat a deep crawl.

For serious **crawling / archival / high-volume extraction**, a dedicated scraper on real hardware (or a container cluster) will outperform this worker on throughput, JS execution, IP diversity, captcha handling and storage. Reach for scrapy / playwright / colly / crawl4ai before reaching for `crawl_*` here.

## Development

```bash
npm install            # installs wrangler (the only devDependency)
npm test               # offline unit tests: node --test "__tests__/**/*.test.js"
npm run check          # syntax check: node --check src/index.js
npx wrangler dev --local --port 8789

curl http://127.0.0.1:8789/health
curl -X POST http://127.0.0.1:8789/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Online smoke tests hit a live deployment and take its URL as the first argument:

```bash
node tests/smoke_trace.mjs https://<your-worker>.workers.dev
node tests/smoke_layer1_4.mjs https://<your-worker>.workers.dev/mcp   # 11 fetch/PDF/crawl/orchestrator tools
```

CI (`.github/workflows/`):

- `test.yml` — on push to `main` and every PR: `npm ci`, `npm run check`, `npm test`.
- `smoke.yml` — on PRs to `main`: runs `tests/smoke_trace.mjs` against the maintainer's production deployment.
- `deploy.yml` — on push to `main`: injects `BUILD_SHA` / `BUILD_TIME`, deploys with `cloudflare/wrangler-action`, verifies `/health`, runs a smoke test.
- `CI_STRICT_NETWORKING=true` makes network-sensitive smoke checks assert instead of warn.

### Project structure

```
search-mcp-worker/
├── src/
│   ├── index.js              # Worker entry: MCP routing, all tools, ranking pipeline, defense layer
│   ├── mcp/                  # Source modules already inlined into index.js (kept for inspection / tests)
│   │   ├── protocol.js       # JSON-RPC 2.0 helpers (rpcResult, json, jsonRpcError, handleJsonRpc)
│   │   └── tool-schemas.js   # Shared input schema generator (querySchema)
│   └── core/                 # Source modules already inlined into index.js
│       ├── provider-config.js    # Provider API-key resolution
│       ├── provider-defaults.js  # Default per-provider config table
│       └── request-context.js    # Per-request context for the JSON-RPC handler
├── __tests__/                # node:test unit tests (offline)
├── tests/                    # Online smoke / provider-sweep / regression scripts (need network)
├── scripts-smoke-mcp.mjs     # One-shot smoke for a freshly deployed worker
├── dict_synonyms.json        # CJK intent synonyms / stop words (inlined into index.js)
├── .github/workflows/        # test.yml, smoke.yml, deploy.yml
├── wrangler.toml
└── package.json
```

## Deploy

- **Button:** use *Deploy to Cloudflare* at the top; Cloudflare forks the repo and deploys it to your account.
- **CLI:** `npx wrangler login && npx wrangler deploy`. The worker is served at `https://search-mcp-worker.<your-subdomain>.workers.dev`.
- **Custom domain:** the route block in `wrangler.toml` is intentionally left out so the button works for anyone; add a `routes` entry if you want your own domain.
- **GitHub Actions:** `deploy.yml` needs a `CLOUDFLARE_API_TOKEN` repository secret. Its health-check and smoke steps point at the maintainer's domain — change them for your fork.

## Related projects

- [time-mcp-worker](https://github.com/Kerry1020/time-mcp-worker) — time zone lookup, conversion and time differences
- [geo-mcp-worker](https://github.com/Kerry1020/geo-mcp-worker) — geocoding, POI search and routing via OpenStreetMap services
- [memory-mcp-worker](https://github.com/Kerry1020/memory-mcp-worker) — persistent KV-backed memory for agents
- [webhook-inbox-mcp-worker](https://github.com/Kerry1020/webhook-inbox-mcp-worker) — receive webhooks into KV and read them as MCP tools
- [summarize-mcp-worker](https://github.com/Kerry1020/summarize-mcp-worker) — web page extraction and extractive summarization
- [image-mcp-worker](https://github.com/Kerry1020/image-mcp-worker) — image generation via any OpenAI-compatible images API
- [calc-mcp-worker](https://github.com/Kerry1020/calc-mcp-worker) — math: expressions, calculus, matrices, statistics

## License

Licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](LICENSE).

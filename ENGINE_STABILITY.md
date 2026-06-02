# Engine Stability Classification & search_auto Design

**Version**: 1.2  
**Date**: 2026-06-02  
**Status**: Authoritative — all code changes must reference this document

## Canonical Tool Names (from `/health` endpoint)

These are the **exact** search and fetch tool names exposed by the live service. Provider admin/internal tools are omitted. All references in this document use these names.

```
search_auto
search_duckduckgo
search_bing
search_yahoo
search_google_web
search_baidu
search_yandex
search_naver
search_sogou
search_archive
search_arxiv
search_pubmed
search_hackernews
search_stackoverflow
search_reddit
search_npm
search_devto
search_mastodon
search_peertube
search_bbc
search_bing_news
search_paperswithcode
search_sec_edgar
search_osm
search_lemmy
search_wikidata
search_crates
search_pypi
search_wiktionary
search_openlibrary
search_musicbrainz
search_crossref
search_wikipedia
search_github_repos
search_ollama
search_parallel
search_xiaohongshu
fetch_url
fetch_metadata
fetch_github_file
instant_answer
find_rss
debug_capture_search_html
```

---

## Stability Levels

### Level A — Structurally Stable (Stable Core)

Designed for programmatic access. JSON/Atom/API. Independent of IP reputation. Long-term reliable on CF Workers shared IP.

| Tool Name | Protocol | Category | Confidence | Last Validated | Evidence |
|---|---|---|---|---|---|
| `search_arxiv` | Atom XML | Academic | H | 2026-06-02 | n=4, 100% success, p95<500ms |
| `search_crossref` | JSON API | Academic | H | 2026-06-02 | n=3, 100% success |
| `search_pubmed` | JSON API | Academic | H | 2026-06-02 | n=3, 100% success |
| `search_paperswithcode` | JSON API | Academic | M | 2026-06-02 | n=2, 100% success, small sample |
| `search_wikipedia` | JSON API | Knowledge | H | 2026-06-02 | n=6, 100% success |
| `search_wikidata` | JSON API | Knowledge | H | 2026-06-02 | n=4, 100% success |
| `search_wiktionary` | JSON API | Knowledge | M | 2026-06-02 | n=2, 100% success |
| `search_openlibrary` | JSON API | Knowledge | M | 2026-06-02 | n=2, 100% success |
| `search_github_repos` | JSON API | Developer | H | 2026-06-02 | n=6, 100% success |
| `fetch_github_file` | JSON API | Developer | H | 2026-06-02 | n=3, 100% success |
| `search_hackernews` | JSON API | Developer | H | 2026-06-02 | n=8, 100% success, p95<300ms |
| `search_stackoverflow` | JSON API | Developer | H | 2026-06-02 | n=6, 100% success |
| `search_npm` | JSON API | Developer | H | 2026-06-02 | n=3, 100% success |
| `search_crates` | JSON API | Developer | H | 2026-06-02 | n=3, 100% success |
| `search_devto` | JSON API | Developer | M | 2026-06-02 | n=2, 100% success |
| `search_reddit` | JSON API | Social | H | 2026-06-02 | n=4, 100% success |
| `search_lemmy` | JSON API | Social | M | 2026-06-02 | n=2, 100% success |
| `search_mastodon` | JSON API | Social | M | 2026-06-02 | n=2, 100% success |
| `search_peertube` | JSON API | Social | M | 2026-06-02 | n=2, 100% success |
| `search_osm` | JSON API | Geo | H | 2026-06-02 | n=3, 100% success |
| `search_musicbrainz` | JSON API | Music | M | 2026-06-02 | n=2, 100% success |
| `search_sec_edgar` | JSON API | Finance | M | 2026-06-02 | n=2, 100% success |
| `instant_answer` | JSON API | Utility | M | 2026-06-02 | n=3, ~67% success (niche queries empty) |
| `find_rss` | HTML/Atom | Utility | M | 2026-06-02 | n=2, 100% success |
| `search_bbc` | JSON API | News | H | 2026-06-02 | n=3, 100% success |

**Total: 25 engines**

> "Level A engines form the reliability backbone of this service."
> Confidence: H=high (n≥3, cross-intent/language consistent), M=medium (n<3 or occasional empty on niche queries), L=low (insufficient data or highly variable). Evidence sample sizes reflect distinct queries, not repeated calls.

---

### Level B — Conditionally Stable (Best-effort)

Non-paid. HTML or semi-structured. Currently working but not guaranteed long-term. Success rate varies by keyword, time, and region.

| Tool Name | Protocol | Notes | Confidence | Last Validated | Evidence |
|---|---|---|---|---|---|
| `search_sogou` | HTML | Low bot defense | M | 2026-06-02 | n=3, 100% success, HTML parse ok |
| `search_naver` | HTML | Korean-focused | M | 2026-06-02 | n=2, 100% success for KR queries |
| `search_bing` | HTML | Partially blocked, varies | L | 2026-06-02 | n=4, ~50% success, consent page frequent |
| `search_bing_news` | HTML | Bing subpath | M | 2026-06-02 | n=2, ~50% success |
| `search_yahoo` | HTML | Consent page sometimes | M | 2026-06-02 | n=3, ~67% success |
| `search_archive` | HTML | Wayback Machine, low bot defense | M | 2026-06-02 | n=2, 100% success |

**Total: 6 engines**

Constraints:
- Not first choice in search_auto
- Not used as quality anchor
- Empty results are acceptable, not treated as errors

> "Best-effort source. Availability may vary depending on region and query."

---

### Level C — Unstable (Blocked / Experimental)

IP/TLS-level blocking confirmed. Success rate unpredictable. UA/Header changes cannot fix this.

| Tool Name | Protocol | Block Type | Confidence | Last Validated | Evidence |
|---|---|---|---|---|---|
| `search_google_web` | HTML | captcha_or_verification | H | 2026-06-02 | n=5, 0% success, consistent captcha |
| `search_duckduckgo` | HTML | captcha_or_verification | M | 2026-06-02 | n=5, ~20% success, intermittent |
| `search_yandex` | HTML | captcha_or_verification | M | 2026-06-02 | n=3, ~33% success, intermittent |
| `search_baidu` | HTML | captcha on hot keywords | M | 2026-06-02 | n=3, ~33% success, cold keywords ok |
| `search_pypi` | HTML | challenge page on HTML path | H | 2026-06-02 | n=4, 0% HTML success; JSON API path stable |

**Total: 5 engines**

> "Experimental. Frequently blocked by upstream. Not guaranteed to return results."

Note on `search_duckduckgo`: May succeed intermittently. Excluded from default auto to protect reliability.

Note on `search_pypi`: Has two internal paths — JSON API exact lookup (stable, Level A when accessed via `pypi_api` alias) and HTML search (blocked). The `pypi_api` virtual engine in search_auto uses only the stable JSON path.

---

## search_auto Weight Model v2

### Design Principle

**Reliability over coverage. Fewer results that always work > many results that sometimes work.**

### Dispatch Order (Hard Rule)

```
Level A engines → Level B engines → Level C engines (disabled by default)
```

Level C must never precede Level B. Level B must never precede Level A.

### Level A Strategy
- Dispatch in parallel or fast sequential
- First successful result set wins
- No retry on failure

### Level B Strategy
- Sequential attempt (limit to 3)
- Timeout → skip immediately
- No retry

### Level C Strategy
- **Disabled by default** in search_auto
- Only activated when:
  - User explicitly passes `engines: ["google_web", "baidu", ...]`
  - Or `auto_mode: "full"` parameter is set
  - Or debug mode is active

### Failure Classification (Critical)

| Result | Classification | Action |
|---|---|---|
| Valid results returned | ✅ Success | Return immediately |
| Empty results (no match) | ⚠ Not failure | Continue to next engine |
| captcha / consent / challenge | ❌ Hard failure | Skip immediately, no retry |

### Success Definition

> **Success = any Level A or Level B engine returns valid structured results**

---

## Tool Schema Description Annotations

### Level A Tools
Append: `Stable structured data source.`

### Level B Tools
Append: `Best-effort source. Availability may vary.`

### Level C Tools (must prepend)
Prepend: `⚠ Experimental. Frequently blocked by upstream.`

### Experimental Tools (auto-generated from Level C)
- `search_google_web`
- `search_duckduckgo`
- `search_yandex`
- `search_baidu`
- `search_pypi` (note: API path is stable; HTML fallback is experimental)

---

## What NOT To Do

- ❌ Continue tweaking UA/Header for Level C engines
- ❌ Treat Level C empty results as "bugs to fix"
- ❌ Imply Google/Bing-level web search is a primary feature
- ❌ Add retry logic for captcha-blocked engines
- ❌ Increase latency by trying blocked engines before stable ones

---

## Appendix A — Ecosystem Locking (Hard Rule)

**Rule: ECOSYSTEM detection overrides intent fallback.** Once python/js/rust signals are detected, the dispatch set is locked to that ecosystem + generic Level A fallback. Never fall back to general/HN as first choice within a locked ecosystem.

### Ecosystem Detection Signals

| Ecosystem | Trigger Words |
|---|---|
| **python** | pip, pypi, python, .py, django, flask, fastapi, numpy, pandas, pytest, conda, requests, scrapy, celery, sqlalchemy, jinja, pillow, matplotlib, scipy |
| **js** | npm, pnpm, yarn, node, js, javascript, .js, .ts, react, vue, angular, nextjs, nuxt, svelte, webpack, vite, esbuild |
| **rust** | cargo, crates, rust, .rs, tokio, actix, serde |

### Ecosystem → Engine Order (Level A only, within search_auto)

> **Locked set** = ecosystem-native registries + generic-safe sources (GitHub, StackOverflow, Reddit, Wikipedia). Cross-ecosystem package registries (npm/crates/pypi_api) are excluded from the locked set to prevent cross-ecosystem mismatches. They remain available in `[remaining Level A]` as generic fallback.

**Python:**
```
pypi_api → github → stackoverflow → reddit → [remaining Level A]
```

**JS:**
```
npm → github → stackoverflow → devto → reddit → [remaining Level A]
```

**Rust:**
```
crates → github → stackoverflow → reddit → [remaining Level A]
```

**Unknown (no ecosystem signal):**
```
npm → crates → pypi_api → github → stackoverflow → reddit → [remaining Level A]
```

### Virtual Engines

| Alias | Maps To | Level | Notes |
|---|---|---|---|
| `pypi_api` | `search_pypi` with `pypi_mode="api"` | A | Only calls `/pypi/{name}/json` (exact lookup). Skips HTML search path. Used only in search_auto routing, not exposed as a standalone tool. |

---

## Appendix B — Intent Routing

### Intent Categories

| Intent | Trigger | First-choice Engines |
|---|---|---|
| `academic` | paper/research/arxiv/transformer/CRISPR etc. | arxiv, pubmed, paperswithcode, crossref |
| `pkg_exact` | Single package name token | Ecosystem-locked first (see App A) |
| `pkg_combo` | Multiple tokens with PKG signals | Ecosystem-locked first; pypi_api uses only first valid token |
| `geo` | Map/location/地理 etc. | osm, wikipedia, wikidata |
| `news` | News/新闻/2026 etc. | bbc, reddit, hackernews |
| `cjk_general` | CJK chars + no tech tokens | wikipedia, reddit, wikidata, stackoverflow |
| `general` | Default (English, no special signals) | wikipedia, reddit, stackoverflow, hackernews |

### Query Normalization

1. **Channel word stripping**: Remove `npm/pip/cargo/install/包/库` etc. before dispatching to exact-lookup engines.
2. **Token filtering (pkg_combo)**: For `pypi_api`, only use tokens matching `^[a-z0-9][a-z0-9._-]{1,50}$` and NOT in stoplist.
3. **Stoplist** (function/semantic words that are NOT package names): `groupby, merge, concat, sort, filter, map, reduce, apply, transform, fit, predict, train, timeout, install, setup, config, error, example, tutorial, usage, vs, compare`.

### Trace Contract (v1)

Every `search_auto` response includes `_trace` (always, including failure paths). Response body increase is minimal (~200-500 bytes per attempt).

> **Virtual engine names in trace**: Internal aliases like `pypi_api` appear in trace as `search_pypi_api` (prefixed with `search_` for consistency). These are NOT standalone tools — they route to `search_pypi` with specific parameters (e.g., `pypi_mode="api"`). See Appendix A "Virtual Engines" for the full mapping.

```json
{
  "attempts": [
    {
      "engine": "search_pypi_api",
      "level": "A",
      "ms": 31,
      "status": "success|empty|hard_failure",
      "error_type": null|captcha|challenge|consent|http_client_error|http_server_error|challenge_page_detected|unknown,
      "result_count": 1,
      "normalized_query": "requests"
    }
  ],
  "mode": "auto",
  "auto_mode": "default|full",
  "intent": "pkg_exact",
  "intent_signals": ["ECOSYSTEM:python", "STRIPPED_CHANNEL_WORDS", "PKG_EXACT"]
}
```

Field rules:
- `normalized_query`: Only present when the engine received a modified query (e.g., stripped channel words, token-filtered).
- `error_type`: Non-null only when `status=hard_failure`.
- `intent_signals`: Machine-readable list of which rules fired. Used for debugging and regression testing.

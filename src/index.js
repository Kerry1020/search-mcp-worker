var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var SERVER_NAME = "search-mcp-worker";
var SERVER_VERSION = "0.7.4";
var BUILD_SHA = "unknown";
var BUILD_TIME = "unknown";
var MAX_FETCH_BYTES = 512e3;
var DEFAULT_TIMEOUT_MS = 12e3;
var JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, mcp-session-id"
};
var PROVIDER_CONFIG = {
  brave: { apiKey: "", baseUrl: "", enabled: true },
  tavily: { apiKey: "", baseUrl: "", enabled: true },
  jina: { apiKey: "", baseUrl: "", enabled: true },
  searxng: { apiKey: "", baseUrl: "", enabled: true },
  serpapi: { apiKey: "", baseUrl: "", enabled: true },
  bing: { apiKey: "", baseUrl: "", enabled: true },
  parallel: { apiKey: "", baseUrl: "", enabled: true },
  ollama: { apiKey: "", baseUrl: "https://api.ollama.com/v1/web-search", enabled: true },
  semantic_scholar: { apiKey: "", baseUrl: "https://api.semanticscholar.org", enabled: true }
};
// ── Engine weights for RRF ranking (3-layer: base × query-type × health) ──
var ENGINE_BASE_WEIGHTS = {
  // Tier 1: Major search engines (most reliable)
  startpage: 1.2, google: 1.2,
  bing_global: 1.1, bing_cn: 1.1, bing_news: 1.1,
  yahoo: 1.0, brave: 1.0, duckduckgo: 1.0,
  // Tier 2: Regional / specialized
  baidu: 0.9, sogou: 0.9, naver: 0.8,
  wikipedia: 0.9, bbc: 0.8,
  // Tier 3: Developer / community
  github_repos: 0.85, stackoverflow: 0.85, npm: 0.85,
  devto: 0.85, hackernews: 0.85, reddit_rss: 0.8,
  // Tier 4: Academic
  arxiv: 0.7, semantic_scholar: 0.7, pubmed: 0.7, paperswithcode: 0.7,
  // Tier 5: Indie / small-web
  wiby: 0.5, marginalia: 0.5, searchmysite: 0.5,
  // Tier 6: Other verticals
  archive: 0.6, mastodon: 0.5, peertube: 0.5, lemmy: 0.5,
  ecosia: 0.7, qwant: 0.7, yandex: 0.7,
  wikidata: 0.5, crates: 0.6, pypi: 0.6, osm: 0.5,
  sec_edgar: 0.6
};

// ── Engine type classification (determines per-engine processing) ──
// A = web search proxy, B = structured API, C = news source
var ENGINE_TYPE = {
  // Type A: Web search proxies (HTML parsing, SEO garbage possible)
  startpage: "A", google: "A", bing_global: "A", bing_cn: "A",
  yahoo: "A", brave: "A", duckduckgo: "A", baidu: "A", sogou: "A", naver: "A",
  ecosia: "A", qwant: "A", yandex: "A",
  wiby: "A", marginalia: "A", searchmysite: "A",
  reddit_rss: "A",
  // Type B: Structured API sources (already sorted by relevance)
  github_repos: "B", stackoverflow: "B", npm: "B", devto: "B", hackernews: "B",
  arxiv: "B", semantic_scholar: "B", pubmed: "B", paperswithcode: "B",
  crates: "B", pypi: "B", wikidata: "B", osm: "B", sec_edgar: "B",
  wikipedia: "B",
  mastodon: "B", peertube: "B", lemmy: "B", reddit: "B",
  // Type C: News sources (time-sensitive)
  bbc: "C", bing_news: "C"
};
// Override bing_news: it's classified as C for news
ENGINE_TYPE.bing_news = "C";

// ── Engine-specific domain blacklists (URLs from these domains are always dropped) ──
var ENGINE_DOMAIN_BLACKLIST = {
  bing_global: ["bing.com", "www.bing.com", "cn.bing.com", "microsoft.com", "msn.com", "live.com"],
  bing_cn: ["bing.com", "www.bing.com", "cn.bing.com", "microsoft.com", "msn.com", "live.com"],
  yahoo: ["help.yahoo.com", "advertising.yahoo.com", "feedback.yahoo.com", "uk.help.yahoo.com",
          "search.yahoo.com", "login.yahoo.com", "privacy.yahoo.com", "legal.yahoo.com",
          "info.yahoo.com", "downloads.yahoo.com", "jp.promotions.yahoo.com"],
  google: [],
  duckduckgo: ["duckduckgo.com", "duck.com"],
  brave: ["search.brave.com"],
  baidu: ["baidu.com/link", "baidu.com/home", "passport.baidu.com", "tieba.baidu.com"],
  sogou: ["sogou.com/web", "sogou.com/link"],
  startpage: [],
  naver: ["help.naver.com"],
  ecosia: [],
  qwant: [],
  yandex: []
};

function getProviderConfig(name) {
  const key = String(name || "").toLowerCase();
  return PROVIDER_CONFIG[key] || null;
}
function maskSecret(v) {
  const s = String(v || "");
  if (!s) return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}
function headerValue(request, key) {
  try {
    return request?.headers?.get?.(key) || request?.headers?.get?.(key.toLowerCase()) || "";
  } catch {
    return "";
  }
}
function getProviderApiKey(name, envKey, requestOrConfig) {
  const header = headerValue(requestOrConfig, `x-${name}-api-key`);
  if (header) return header;
  const config = requestOrConfig && typeof requestOrConfig === "object" && !("headers" in requestOrConfig) ? requestOrConfig : null;
  const cfg = config ? config[String(name || "").toLowerCase()] || null : getProviderConfig(name);
  if (cfg && cfg.apiKey) return cfg.apiKey;
  return envKey ? (typeof process !== "undefined" && process.env ? process.env[envKey] : "") : "";
}
function getProviderBaseUrl(name, fallback, requestOrConfig) {
  const header = headerValue(requestOrConfig, `x-${name}-base-url`);
  if (header) return header;
  const config = requestOrConfig && typeof requestOrConfig === "object" && !("headers" in requestOrConfig) ? requestOrConfig : null;
  const cfg = config ? config[String(name || "").toLowerCase()] || null : getProviderConfig(name);
  if (cfg && cfg.baseUrl) return cfg.baseUrl;
  return fallback;
}
var TOOLS = [
  {
    name: "search_auto",
    description: "Search multiple engines, merge usable results, and rerank the best matches automatically. Response includes _meta.parser: 'exact' (primary parser hit) or 'skeleton_fallback' (generic fallback due to site layout changes — results may have lower precision). If skeleton_fallback, consider cross-referencing with vertical tools like search_github_repos or search_pubmed for higher confidence.",
    inputSchema: querySchema({ engines: true, autoMode: true })
  },
  {
    name: "search_duckduckgo",
    description: "Search the web via DuckDuckGo HTML results. Good general fallback search. Response includes _meta.parser: 'exact' or 'skeleton_fallback'.",
    inputSchema: querySchema({ region: true })
  },
  {
    name: "search_bing",
    description: "Search the web via Bing HTML results. Response includes _meta.parser: 'exact' or 'skeleton_fallback'. For Chinese queries, prefer search_bing_cn.",
    inputSchema: querySchema()
  },
  {
    name: "search_bing_global",
    description: "Search the web via the international Bing HTML route.",
    inputSchema: querySchema()
  },
  {
    name: "search_bing_cn",
    description: "Search the web via the China Bing HTML route.",
    inputSchema: querySchema()
  },
  {
    name: "search_yahoo",
    description: "Search the web via Yahoo HTML results.",
    inputSchema: querySchema()
  },
  {
    name: "search_google_web",
    description: "Search the web via Google web results. May be rate limited; use DuckDuckGo/Bing as fallback.",
    inputSchema: querySchema()
  },
  {
    name: "search_baidu",
    description: "Search Chinese web results via Baidu.",
    inputSchema: querySchema()
  },
  {
    name: "search_yandex",
    description: "Search the web via Yandex HTML results. Useful as an extra fallback when other engines fail.",
    inputSchema: querySchema({ language: true })
  },
  {
    name: "search_naver",
    description: "Search Korean web results via Naver.",
    inputSchema: querySchema()
  },
  {
    name: "search_sogou",
    description: "Search Chinese web results via Sogou.",
    inputSchema: querySchema()
  },
  {
    name: "search_archive",
    description: "Search the Internet Archive (Wayback Machine + archive.org items). Returns archived URLs and snapshot availability.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or URL to look up in the archive" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        mode: { type: "string", description: "Search mode: 'search' for archive items, 'wayback' for URL snapshots, default 'search'" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_semantic_scholar",
    description: "Search academic papers across all publishers (IEEE, ACM, Springer, Elsevier, etc) via Semantic Scholar. Returns title, authors, abstract snippet, year, citation count, and URL. Broader than arXiv alone — covers the full corpus of scientific literature. No API key required.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for academic papers" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_arxiv",
    description: "Search academic papers on arXiv. Returns titles, authors, abstracts, and PDF links.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_pubmed",
    description: "Search biomedical literature on PubMed. Returns titles, authors, PMIDs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_hackernews",
    description: "Search Hacker News stories and comments via Algolia API. Good for tech discussions and startup news.",
    inputSchema: querySchema()
  },
  {
    name: "search_stackoverflow",
    description: "Search Stack Overflow questions. Returns titles, links, and accepted answers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        site: { type: "string", description: "StackExchange site, default stackoverflow (options: askubuntu, serverfault, superuser, math, physics, etc.)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_reddit",
    description: "Search Reddit posts via JSON API. Returns titles, scores, and permalinks.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        subreddit: { type: "string", description: "Optional subreddit to search within" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_npm",
    description: "Search npm packages. Returns package names, descriptions, and links.",
    inputSchema: querySchema()
  },
  {
    name: "search_devto",
    description: "Search Dev.to developer blog posts. Returns titles, URLs, and tags.",
    inputSchema: querySchema()
  },
  {
    name: "search_mastodon",
    description: "Search Mastodon social posts. Returns toot content, authors, and URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        instance: { type: "string", description: "Mastodon instance, default mastodon.social" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_peertube",
    description: "Search PeerTube videos across the fediverse. Returns titles, channels, and embed URLs.",
    inputSchema: querySchema()
  },
  {
    name: "search_bbc",
    description: "Search BBC News articles. Returns headlines, URLs, and publication dates.",
    inputSchema: querySchema()
  },
  {
    name: "search_bing_news",
    description: "Search Bing News. Returns news headlines, sources, and URLs.",
    inputSchema: querySchema()
  },
  {
    name: "search_sina_news",
    description: "Search Sina News articles. Returns Chinese news headlines and URLs.",
    inputSchema: querySchema()
  },
  {
    name: "search_163_news",
    description: "Search 163 News articles. Returns Chinese news headlines and URLs.",
    inputSchema: querySchema()
  },
  {
    name: "search_paperswithcode",
    description: "Search Papers With Code for ML/AI papers with code implementations. Returns paper titles, links, and tasks.",
    inputSchema: querySchema()
  },
  {
    name: "search_sec_edgar",
    description: "Search SEC EDGAR filings. Find company 10-K, 10-Q, 8-K, proxy statements and other SEC filings.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name or filing keyword" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        form_type: { type: "string", description: "Filing type filter: 10-K, 10-Q, 8-K, DEF 14A, etc." }
      },
      required: ["query"]
    }
  },
  {
    name: "search_osm",
    description: "Search OpenStreetMap for places, addresses, POIs. Returns coordinates and location details.",
    inputSchema: querySchema()
  },
  {
    name: "search_lemmy",
    description: "Search Lemmy fediverse communities and posts. Open-source Reddit alternative.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        instance: { type: "string", description: "Lemmy instance, default lemmy.world" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_wikidata",
    description: "Search Wikidata structured knowledge base. Returns entity IDs, labels, descriptions.",
    inputSchema: querySchema()
  },
  {
    name: "search_crates",
    description: "Search Rust crates on crates.io. Returns package names, descriptions, downloads.",
    inputSchema: querySchema()
  },
  {
    name: "search_pypi",
    description: "Search Python packages on PyPI via JSON API. Returns package names and summaries.",
    inputSchema: querySchema()
  },
  {
    name: "search_wiktionary",
    description: "Search Wiktionary for word definitions, etymology, and translations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Word or phrase to look up" },
        language: { type: "string", description: "Wiktionary language code, default en" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_openlibrary",
    description: "Search Open Library for books by title, author, or ISBN. Returns book metadata and cover URLs.",
    inputSchema: querySchema()
  },
  {
    name: "search_musicbrainz",
    description: "Search MusicBrainz for music recordings, artists, and releases.",
    inputSchema: querySchema()
  },
  {
    name: "instant_answer",
    description: "Get instant answers from DuckDuckGo for facts, definitions, and summaries. Good for quick lookups.",
    inputSchema: querySchema()
  },
  {
    name: "search_crossref",
    description: "Search CrossRef for academic publications with DOIs. Returns titles, authors, years, DOIs.",
    inputSchema: querySchema()
  },
  {
    name: "find_rss",
    description: "Find RSS/Atom feed URLs for a given website. Returns discovered feed links.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Website URL to scan for RSS feeds" }
      },
      required: ["url"]
    }
  },
  {
    name: "debug_capture_search_html",
    description: "Fetch a live search page and return a bounded HTML sample focused on result markers for parser debugging.",
    inputSchema: {
      type: "object",
      properties: {
        engine: { type: "string", description: "Search engine: bing, yahoo, or yandex" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Suggested result count where supported" },
        language: { type: "string", description: "Yandex language code, default en" },
        maxChars: { type: "number", description: "Maximum HTML characters to return, default 12000, max 40000" }
      },
      required: ["engine", "query"]
    }
  },
  {
    name: "search_wikipedia",
    description: "Search Wikipedia pages and return summaries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" },
        language: { type: "string", description: "Wikipedia language code, default en" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_github_repos",
    description: "Search public GitHub repositories via GitHub's API without authentication.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Repository search query" },
        limit: { type: "number", description: "Maximum results, default 5, max 10" }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_github_file",
    description: "Fetch a public file from GitHub using owner/repo/path/ref.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string", description: "Branch, tag, or commit, default main" },
        maxChars: { type: "number", description: "Maximum returned characters, default 20000, max 50000" }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "fetch_metadata",
    description: "Fetch a public URL and return title, description, canonical URL, status and content type.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetch_url",
    description: "Fetch a public URL and return readable text/metadata. Not for authenticated/private pages. If the target site blocks the request (anti-bot/WAF), returns content_type: 'challenge_page' with status 202 or 403 — the text will contain the raw challenge HTML or error message, not the actual page content. When you see challenge_page, do NOT treat the text as article content; instead try search_auto or an alternative source for the same information.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to fetch" },
        maxChars: { type: "number", description: "Maximum returned characters, default 12000, max 30000" }
      },
      required: ["url"]
    }
  },
  {
    name: "provider_list",
    description: "List provider configuration status and whether api keys are configured.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "provider_set_config",
    description: "Set provider API key/base URL/enabled flag for current worker runtime.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Provider name, e.g. ollama/brave/tavily/jina/searxng/serpapi/bing/parallel" },
        api_key: { type: "string", description: "API key/token" },
        base_url: { type: "string", description: "Custom provider base URL (optional)" },
        enabled: { type: "boolean", description: "Enable/disable provider" }
      },
      required: ["provider"]
    }
  },
  {
    name: "provider_get_config",
    description: "Get one provider config (api key masked).",
    inputSchema: {
      type: "object",
      properties: { provider: { type: "string" } },
      required: ["provider"]
    }
  },
  {
    name: "provider_set_ollama",
    description: "Configure the Ollama provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "ollama", needsBaseUrl: false, needsApiKey: true })
  },
  {
    name: "provider_set_brave",
    description: "Configure the Brave provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "brave", needsApiKey: true, needsBaseUrl: false })
  },
  {
    name: "provider_set_tavily",
    description: "Configure the Tavily provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "tavily", needsApiKey: true, needsBaseUrl: false })
  },
  {
    name: "provider_set_jina",
    description: "Configure the Jina provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "jina", needsApiKey: true, needsBaseUrl: false })
  },
  {
    name: "provider_set_serpapi",
    description: "Configure the SerpAPI provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "serpapi", needsApiKey: true, needsBaseUrl: false })
  },
  {
    name: "provider_set_bing",
    description: "Configure the Bing provider for this worker runtime. API key optional; HTML search works without it.",
    inputSchema: providerConfigSchema({ provider: "bing", needsApiKey: false, needsBaseUrl: false, note: "Built-in HTML search, no configuration needed. Leave enabled." })
  },
  {
    name: "provider_set_parallel",
    description: "Configure the Parallel provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "parallel", needsApiKey: true, needsBaseUrl: false })
  },
  {
    name: "provider_set_searxng",
    description: "Configure the SearXNG provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "searxng", needsBaseUrl: true, needsApiKey: false, note: "Only configure if you use your own SearXNG instance." })
  },
  {
    name: "search_ollama",
    description: "Search via Ollama search provider API (requires provider key set via provider_set_config).",
    inputSchema: querySchema()
  },
  {
    name: "search_parallel",
    description: "Search via Parallel AI search API (requires provider key set via provider_set_config). High quality results.",
    inputSchema: querySchema()
  },
  {
    name: "pdf_parse",
    description: "Fetch a PDF from a public URL and extract its text content. Handles text-based PDFs (most research papers, reports, documentation). Scanned/image-only PDFs will return empty text with a note suggesting crawl_pdf + AI vision. No external dependencies — pure inline parser.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL pointing to a PDF file" },
        maxChars: { type: "number", description: "Maximum returned characters, default 50000, max 100000" }
      },
      required: ["url"]
    }
  },
  {
    name: "pdf_to_markdown",
    description: "Fetch a PDF from a public URL and convert to clean markdown. Same extraction as pdf_parse but adds markdown formatting (page breaks as ---, paragraph spacing). Best for feeding PDF content into LLMs.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL pointing to a PDF file" },
        maxChars: { type: "number", description: "Maximum returned characters, default 50000, max 100000" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetch_robots",
    description: "Fetch a site's robots.txt (auto-derives origin from any URL on the site) and parse its Allow/Disallow rules, Sitemap declarations, and crawl delay. Useful before scraping to check what's allowed. Returns raw content even when robots.txt is missing or malformed (with a note explaining the case).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Any URL on the site (origin is auto-derived), e.g. https://example.com/some/page" },
        maxChars: { type: "number", description: "Maximum raw text returned, default 8000, max 32000" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetch_sitemap",
    description: "Fetch a sitemap.xml (or sitemap index), parse all <loc> entries with optional lastmod/changefreq/priority, optionally recurse into nested sitemapindex files up to maxUrls total. Returns a flat list of URLs. Skips entries that already appeared at a shallower depth.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of a sitemap.xml or sitemap-index file. Auto-resolved to the site's /sitemap.xml if a site root is given." },
        recursive: { type: "boolean", description: "Recurse into nested sitemapindex files, default false" },
        maxUrls: { type: "number", description: "Maximum total URLs across all nested sitemaps, default 5000, max 20000" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetch_html_to_markdown",
    description: "Fetch a public URL (no JS rendering, plain HTTP fetch) and convert HTML to clean markdown — preserving H1-H3 headings, links, lists, code blocks, and paragraphs. Same as fetch_url but returns structured markdown instead of plain text. Good for feeding article/blog content into LLMs.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to fetch" },
        maxChars: { type: "number", description: "Maximum returned characters, default 20000, max 80000" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetch_html_extract",
    description: "Fetch a public URL (no JS rendering, plain HTTP fetch) and extract structured fields using Workers AI (Llama 3.1 8B Instruct). Pass a schema object describing the fields you want. Falls back to returning the raw text if AI extraction fails. For JS-rendered pages, use crawl_extract instead.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to fetch" },
        schema: { type: "object", description: "Object describing fields to extract, e.g. {\"title\":\"string\",\"author\":\"string\",\"price\":\"number\"}. Field values describe the expected JSON type: string, number, boolean, or array of these." }
      },
      required: ["url", "schema"]
    }
  },
  {
    name: "crawl_scrape",
    description: "Fetch a URL and produce clean markdown with smart SPA heuristics. Strategy chain: (1) Detect Next.js / Nuxt / Astro / SvelteKit / React Server Components markers and extract embedded __NEXT_DATA__ / __NUXT_DATA__ / type=\"application/ld+json\" JSON-LD / og:* meta tags to recover rendered content; (2) If site is not a known SPA framework, use cheerio-less DOM walker to convert HTML to markdown; (3) On JS-only sites with no embedded data, fall back to Archive.org Wayback Machine snapshot for the same URL; (4) On total failure, return { ok: false, raw_html_excerpt } so caller can retry. No JS rendering — pure HTTP fetch + worker-side parsing.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to scrape" },
        maxChars: { type: "number", description: "Maximum characters of content returned (default 12000, max 50000)" },
        useCache: { type: "boolean", description: "If true, fall back to Archive.org Wayback snapshot when direct fetch fails (default true)" }
      },
      required: ["url"]
    }
  },
  {
    name: "crawl_screenshot",
    description: "Produce a structured 'content snapshot' of a URL — title, headings, links, summary text, key metadata — for cases where a true PNG screenshot is required. Cloudflare Browser Rendering binding is NOT enabled on this account, so this tool returns a deterministic DOM-derived snapshot rather than a rasterized image. If you need a true PNG screenshot, please open a Cloudflare Dashboard ticket to enable Browser Rendering. The snapshot includes: page title, h1-h3 hierarchy, top 20 links, first 1500 chars of body text, og:* / twitter:* meta tags, and a sha256 of the source HTML.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to snapshot" },
        maxLinks: { type: "number", description: "Max number of links to return (default 20, max 100)" }
      },
      required: ["url"]
    }
  },
  {
    name: "crawl_pdf",
    description: "Fetch a PDF from a URL and parse its text content. Does NOT require a browser — PDFs are static binary files served over HTTP, fully parseable by workerd + Step 1's extractPdfTextAsync. Internally calls fetchWithUA then routes through pdfParse / pdfToMarkdown. Returns either plain text or markdown depending on the format param. For sites that gate PDFs behind JS (e.g. some paywalls), this will fail and you should use crawl_scrape first to find the direct PDF URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Direct URL to a PDF file (must end in .pdf or return application/pdf content-type)" },
        format: { type: "string", enum: ["text", "markdown"], description: "Output format: 'text' for plain extracted text, 'markdown' for lightly-formatted markdown (default 'markdown')" },
        maxChars: { type: "number", description: "Maximum characters returned (default 50000, max 200000)" }
      },
      required: ["url"]
    }
  },
  {
    name: "crawl_extract",
    description: "Fetch a URL and extract structured fields WITHOUT Workers AI (AI binding is not enabled on this account). Uses deterministic HTML heuristic extraction in priority order: (1) JSON-LD <script type=\"application/ld+json\"> blocks — best for products, articles, events, organizations; (2) Open Graph meta tags (og:title, og:description, og:image, og:type); (3) Twitter card meta tags; (4) Common semantic class hints (.price, .author, .product-title); (5) For matching schema field names, return the first non-empty value found. The schema param is an object { fieldName: typeString } where typeString is one of: 'string', 'number', 'boolean', 'array'. If no values can be extracted, returns { ok: false, extracted: {}, note }.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to extract from" },
        schema: { type: "object", description: "Object describing fields to extract, e.g. {\"title\":\"string\",\"price\":\"number\"}. Same shape as fetch_html_extract." }
      },
      required: ["url", "schema"]
    }
  },
  {
    name: "search_and_scrape",
    description: "Smart bridge tool: combine search + automatic content fetching + parsing in a single call. Internally runs search_auto across multiple engines, then concurrently fetches the top-N result URLs, routes PDFs through pdfParse and HTML through fetchUrl, and returns each result's title + URL + snippet + extracted content. Useful when you want full article content from a search query without manually chaining separate tool calls. PDF URLs are auto-detected by URL suffix or content-type and routed to pdfParse. No JS rendering — for SPA-heavy sites, individual crawl_scrape calls may be more effective. Concurrency capped at 4 to stay within Worker CPU limits; total timeout 30s.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: { type: "number", description: "Maximum number of search results to scrape (default 5, max 10)" },
        maxCharsPerPage: { type: "number", description: "Max characters of content to fetch per page (default 8000, max 20000)" },
        engines: { type: "array", items: { type: "string" }, description: "Optional override of search engines to use (defaults to auto-selected set). e.g. [\"duckduckgo\",\"brave\"]" },
        recencyDays: { type: "number", description: "Optional recency filter in days — passed through to search engines that support it" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_mojeek",
    description: "Search the Mojeek independent web index (UK-based, own crawler, no Google/Bing dependency). Stable, fast (~0.3s), CAPTCHA-resistant. Returns web search results with title/URL/snippet. Use for general web search — Mojeek indexes a broad crawl of the open web. Add keywords like 'reddit' or 'github' to narrow results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Use plain keywords or phrases." },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_startpage",
    description: "Search via Startpage (privacy-focused Google proxy). Returns Google-quality results without CAPTCHAs on CF Workers edge. Good for broad web search, technical queries, and Reddit content. Note: do NOT use site: operator — it triggers CAPTCHA. Instead add keywords like 'reddit' or 'github' to narrow results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Avoid site: operator — use keywords instead (e.g. 'reddit docker' instead of 'site:reddit.com docker')." },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_searchmysite",
    description: "Search the SearchMySite index — a curated collection of personal blogs and indie websites (~15,000 sites). Ideal for finding authentic, human-written content: tutorials, opinion pieces, technical deep-dives. No corporate/SEO content. Results include title/URL/date.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for personal blog content" },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_marginalia",
    description: "Search the Marginalia independent search engine — focuses on non-commercial, small-web content (blogs, forums, wikis, academic sites). Curated index that deliberately excludes big-tech and SEO-heavy sites. May be rate-limited from CF Worker IPs (retry on 429). Results include title/URL/snippet with source categories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for small-web/indie content" },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_wiby",
    description: "Search Wiby — a deliberately simple, old-school search engine that indexes hand-curated, non-commercial personal websites, blogs, and hobbyist pages. No JavaScript, no CAPTCHAs, fast response from CF Workers. Ideal for discovering authentic, human-written content (tutorials, personal projects, niche blogs). Results include title/URL/snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for indie/personal web content" },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_reddit_rss",
    description: "Search Reddit discussions — returns posts with title, URL, subreddit, and snippet. Because Reddit blocks CF Worker IPs, this tool uses a privacy search proxy to find Reddit discussions. Good for finding community opinions, real-world experiences, troubleshooting threads, and product recommendations. Results are filtered to reddit.com/r/ discussion URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for Reddit posts and discussions" },
        limit: { type: "number", description: "Maximum results to return (default 5, max 20)" },
        sort: { type: "string", description: "Sort order: 'relevance' (default), 'new', 'top', 'comments'" }
      },
      required: ["query"]
    }
  },
];
var NON_PUBLIC_TOOL_NAMES = new Set([
  "provider_list",
  "provider_get_config",
  "provider_set_config",
  "provider_set_ollama",
  "provider_set_brave",
  "provider_set_tavily",
  "provider_set_jina",
  "provider_set_serpapi",
  "provider_set_bing",
  "provider_set_parallel",
  "provider_set_searxng",
  "search_ollama",
  "search_parallel",
  "search_brave",
  "search_qwant",
  "search_ecosia"
]);
var PUBLIC_TOOLS = TOOLS.filter((tool) => !NON_PUBLIC_TOOL_NAMES.has(tool.name));
function buildRequestProviderConfig(request) {
  const config = Object.fromEntries(Object.entries(PROVIDER_CONFIG).map(([name, value]) => [name, { ...value }]));
  for (const name of Object.keys(config)) {
    const hKey = request.headers.get(`x-${name}-api-key`);
    if (hKey) config[name].apiKey = hKey;
    const hUrl = request.headers.get(`x-${name}-base-url`);
    if (hUrl) config[name].baseUrl = hUrl;
    const hEnabled = request.headers.get(`x-${name}-enabled`);
    if (hEnabled !== null) config[name].enabled = hEnabled !== "false";
  }
  return config;
}
function getRequestProviderConfig(requestOrConfig) {
  if (!requestOrConfig) {
    return Object.fromEntries(Object.entries(PROVIDER_CONFIG).map(([name, value]) => [name, { ...value }]));
  }
  if (typeof requestOrConfig === "object" && !("headers" in requestOrConfig)) return requestOrConfig;
  return buildRequestProviderConfig(requestOrConfig);
}
function hasRequestScopedProviderOverrides(requestOrConfig) {
  const config = getRequestProviderConfig(requestOrConfig);
  for (const [name, value] of Object.entries(config)) {
    const base = PROVIDER_CONFIG[name] || {};
    if ((value.enabled !== false) !== (base.enabled !== false)) return true;
    if (String(value.apiKey || "") !== String(base.apiKey || "")) return true;
    if (String(value.baseUrl || "") !== String(base.baseUrl || "")) return true;
  }
  return false;
}
var worker_default = {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    const requestProviderConfig = buildRequestProviderConfig(request);
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz") {
      return json({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        build: { sha: BUILD_SHA, time: BUILD_TIME },
        mcp_endpoint: `${url.origin}/mcp`,
        endpoints: ["/mcp", "/health", "/healthz"],
        tools: PUBLIC_TOOLS.map((tool) => tool.name),
        engine_health: getEngineHealthStats(),
        circuit_breakers: Object.fromEntries([...CIRCUIT_BREAKER.entries()].map(([k, v]) => [k, { failures: v.failures, frozen_until: new Date(v.frozenUntil).toISOString() }]))
      });
    }
    if (url.pathname !== "/mcp") return jsonRpcError(null, -32004, "not found", 404);
    if (request.method !== "POST") return jsonRpcError(null, -32600, "POST required", 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonRpcError(null, -32700, "invalid JSON", 400);
    }
    const isBatch = Array.isArray(body);
    const messages = isBatch ? body : [body];
    const responses = [];
    for (const message of messages) {
      const response = await handleJsonRpc(message, request, requestProviderConfig);
      if (response !== void 0) responses.push(response);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: JSON_HEADERS });
    return json(isBatch ? responses : responses[0]);
  }
};
function querySchema(extra = {}) {
  const properties = {
    query: { type: "string", description: "Search query" },
    limit: { type: "number", description: "Maximum results, default 5, max 10" }
  };
  if (extra.region) properties.region = { type: "string", description: "DuckDuckGo region, default us-en" };
  if (extra.language) properties.language = { type: "string", description: "Search language code, default en" };
  if (extra.autoMode) properties.auto_mode = { type: "string", description: "Auto aggregation mode: default uses intent-aware engines; full fans out across all enabled public search engines before reranking." };
  if (extra.engines) properties.engines = { type: "array", items: { type: "string" }, description: "Optional engine order: duckduckgo, bing, yahoo, google, yandex, baidu, naver, sogou, wikipedia, arxiv, pubmed, hackernews, stackoverflow, reddit, npm, devto, mastodon, peertube, bbc, bing_news, archive, paperswithcode, sec_edgar, osm, lemmy, wikidata, crates, pypi, ollama" };
  return { type: "object", properties, required: ["query"] };
}
function providerConfigSchema({ provider, needsApiKey = true, needsBaseUrl = false, note = "" }) {
  const properties = {
    enabled: { type: "boolean", description: note || `Enable/disable ${provider}`, default: true }
  };
  if (needsApiKey) properties.api_key = { type: "string", description: `${provider} API key` };
  if (needsBaseUrl) properties.base_url = { type: "string", description: `${provider} base URL` };
  const required = [];
  if (needsApiKey) required.push("api_key");
  return { type: "object", properties, required };
}
__name(querySchema, "querySchema");
__name2(querySchema, "querySchema");
async function handleJsonRpc(message, request, requestProviderConfig) {
  const id = message?.id ?? null;
  try {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return rpcError(id, -32600, "invalid request");
    }
    switch (message.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        });
      case "notifications/initialized":
        return void 0;
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: PUBLIC_TOOLS });
      case "tools/call":
        return rpcResult(id, await callTool(message.params, requestProviderConfig));
      default:
        return rpcError(id, -32601, `method not found: ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32e3, error?.message || "internal error");
  }
}
__name(handleJsonRpc, "handleJsonRpc");
__name2(handleJsonRpc, "handleJsonRpc");
async function callTool(params, requestProviderConfig) {
  const name = params?.name;
  const args = params?.arguments || {};
  const providerArgs = { ...args, _context: { ...(args?._context || {}), providerConfig: requestProviderConfig } };
  switch (name) {
    case "search_auto":
      return toolResult(await searchAuto({ ...args, _providerConfig: requestProviderConfig }), formatSearchResponse);
    case "search_duckduckgo":
      return toolResult(await searchDuckDuckGo(args), formatSearchResponse);
    case "search_bing":
      return toolResult(await searchBing(args), formatSearchResponse);
    case "search_bing_global":
      return toolResult(await searchBingGlobal(args), formatSearchResponse);
    case "search_bing_cn":
      return toolResult(await searchBingCn(args), formatSearchResponse);
    case "search_ollama":
      return toolResult(await searchOllama(providerArgs), formatSearchResponse);
    case "search_parallel":
      return toolResult(await searchParallel(providerArgs), formatSearchResponse);
    case "provider_list":
      return toolResult(providerList(), formatMetadataResponse);
    case "provider_set_config":
      return toolResult(providerSetConfig(args), formatMetadataResponse);
    case "provider_get_config":
      return toolResult(providerGetConfig(args), formatMetadataResponse);
    case "provider_set_ollama":
      return toolResult(providerSetSpecificConfig("ollama", args), formatMetadataResponse);
    case "provider_set_brave":
      return toolResult(providerSetSpecificConfig("brave", args), formatMetadataResponse);
    case "provider_set_tavily":
      return toolResult(providerSetSpecificConfig("tavily", args), formatMetadataResponse);
    case "provider_set_jina":
      return toolResult(providerSetSpecificConfig("jina", args), formatMetadataResponse);
    case "provider_set_serpapi":
      return toolResult(providerSetSpecificConfig("serpapi", args), formatMetadataResponse);
    case "provider_set_bing":
      return toolResult(providerSetSpecificConfig("bing", args), formatMetadataResponse);
    case "provider_set_parallel":
      return toolResult(providerSetSpecificConfig("parallel", args), formatMetadataResponse);
    case "provider_set_searxng":
      return toolResult(providerSetSpecificConfig("searxng", args), formatMetadataResponse);
    case "search_yahoo":
      return toolResult(await searchYahoo(args), formatSearchResponse);
    case "search_google_web":
      return toolResult(await searchGoogle(args), formatSearchResponse);
    case "search_baidu":
      return toolResult(await searchBaidu(args), formatSearchResponse);
    case "search_yandex":
      return toolResult(await searchYandex(args), formatSearchResponse);
    case "search_naver":
      return toolResult(await searchNaver(args), formatSearchResponse);
    case "search_sogou":
      return toolResult(await searchSogou(args), formatSearchResponse);
    case "search_qwant":
      return toolResult(await searchQwant(args), formatSearchResponse);
    case "search_ecosia":
      return toolResult(await searchEcosia(args), formatSearchResponse);
    case "search_archive":
      return toolResult(await searchArchive(args), formatSearchResponse);
    case "search_semantic_scholar":
      return toolResult(await searchSemanticScholar(args), formatSearchResponse);
    case "search_brave":
      return toolResult(await searchBrave(args), formatSearchResponse);
    case "search_arxiv":
      return toolResult(await searchArxiv(args), formatSearchResponse);
    case "search_pubmed":
      return toolResult(await searchPubmed(args), formatSearchResponse);
    case "search_hackernews":
      return toolResult(await searchHackerNews(args), formatSearchResponse);
    case "search_stackoverflow":
      return toolResult(await searchStackOverflow(args), formatSearchResponse);
    case "search_reddit":
      return toolResult(await searchReddit(args), formatSearchResponse);
    case "search_npm":
      return toolResult(await searchNpm(args), formatSearchResponse);
    case "search_devto":
      return toolResult(await searchDevto(args), formatSearchResponse);
    case "search_mastodon":
      return toolResult(await searchMastodon(args), formatSearchResponse);
    case "search_peertube":
      return toolResult(await searchPeerTube(args), formatSearchResponse);
    case "search_bbc":
      return toolResult(await searchBbc(args), formatSearchResponse);
    case "search_bing_news":
      return toolResult(await searchBingNews(args), formatSearchResponse);
    case "search_sina_news":
      return toolResult(await searchSinaNews(args), formatSearchResponse);
    case "search_163_news":
      return toolResult(await search163News(args), formatSearchResponse);
    case "search_paperswithcode":
      return toolResult(await searchPapersWithCode(args), formatSearchResponse);
    case "search_sec_edgar":
      return toolResult(await searchSecEdgar(args), formatSearchResponse);
    case "search_osm":
      return toolResult(await searchOsm(args), formatSearchResponse);
    case "search_lemmy":
      return toolResult(await searchLemmy(args), formatSearchResponse);
    case "search_wikidata":
      return toolResult(await searchWikidata(args), formatSearchResponse);
    case "search_crates":
      return toolResult(await searchCrates(args), formatSearchResponse);
    case "search_pypi":
      return toolResult(await searchPypi(args), formatSearchResponse);
    case "search_wiktionary":
      return toolResult(await searchWiktionary(args), formatSearchResponse);
    case "search_openlibrary":
      return toolResult(await searchOpenLibrary(args), formatSearchResponse);
    case "search_musicbrainz":
      return toolResult(await searchMusicbrainz(args), formatSearchResponse);
    case "instant_answer":
      return toolResult(await instantAnswer(args), formatSearchResponse);
    case "search_crossref":
      return toolResult(await searchCrossref(args), formatSearchResponse);
    case "find_rss":
      return toolResult(await findRss(args), formatSearchResponse);
    case "debug_capture_search_html":
      return toolResult(await debugCaptureSearchHtml(args), formatDebugCaptureResponse);
    case "search_wikipedia":
      return toolResult(await searchWikipedia(args), formatSearchResponse);
    case "search_github_repos":
      return toolResult(await searchGitHubRepos(args), formatSearchResponse);
    case "fetch_github_file":
      return toolResult(await fetchGitHubFile(args), formatGitHubFileResponse);
    case "fetch_metadata":
      return toolResult(await fetchMetadata(args), formatMetadataResponse);
    case "fetch_url":
      return toolResult(await fetchUrl(args), formatFetchUrlResponse);
    case "pdf_parse":
      return toolResult(await pdfParse(args), formatPdfResponse);
    case "pdf_to_markdown":
      return toolResult(await pdfToMarkdown(args), formatPdfResponse);
    case "fetch_robots":
      return toolResult(await fetchRobots(args), formatMetadataResponse);
    case "fetch_sitemap":
      return toolResult(await fetchSitemap(args), formatMetadataResponse);
    case "fetch_html_to_markdown":
      return toolResult(await fetchHtmlToMarkdown(args), formatFetchUrlResponse);
    case "fetch_html_extract":
      return toolResult(await fetchHtmlExtract(args), formatMetadataResponse);
    case "crawl_scrape":
      return toolResult(await crawlScrape(args), formatFetchUrlResponse);
    case "crawl_screenshot":
      return toolResult(await crawlScreenshot(args), formatMetadataResponse);
    case "crawl_pdf":
      return toolResult(await crawlPdf(args), formatPdfResponse);
    case "crawl_extract":
      return toolResult(await crawlExtract(args), formatMetadataResponse);
    case "search_and_scrape":
      return toolResult(await searchAndScrape(args), formatFetchUrlResponse);
    case "search_mojeek":
      return toolResult(await searchMojeek(args), formatSearchResponse);
    case "search_startpage":
      return toolResult(await searchStartpage(args), formatSearchResponse);
    case "search_searchmysite":
      return toolResult(await searchSearchmysite(args), formatSearchResponse);
    case "search_marginalia":
      return toolResult(await searchMarginalia(args), formatSearchResponse);
    case "search_wiby":
      return toolResult(await searchWiby(args), formatSearchResponse);
    case "search_reddit_rss":
      return toolResult(await searchRedditRss(args), formatSearchResponse);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
__name(callTool, "callTool");
__name2(callTool, "callTool");
function evaluateSearchQuality(result, query, engine) {
  const results = Array.isArray(result?.results) ? result.results : [];
  const filteredCount = Number.isFinite(result?.filtered_count) ? Number(result.filtered_count) : 0;
  if (!result) {
    return { quality_status: "red", quality_reason: "no_result_object", filtered_count: 0, ok: false };
  }
  if (result.blocked) {
    return { quality_status: "blocked", quality_reason: result.block_reason || "blocked", filtered_count: filteredCount, ok: false };
  }
  if (!results.length) {
    if (filteredCount > 0) {
      if (result.filtered_reason === "intent_mismatch") {
        return { quality_status: "yellow", quality_reason: "intent_mismatch", filtered_count: filteredCount, ok: false };
      }
      if (result.filtered_reason === "low_trust_results") {
        return { quality_status: "yellow", quality_reason: "low_trust_results", filtered_count: filteredCount, ok: false };
      }
      return { quality_status: "junk", quality_reason: result.filtered_reason || "generic_wrapper_results", filtered_count: filteredCount, ok: false };
    }
    return { quality_status: "empty", quality_reason: result.error || "no_results", filtered_count: filteredCount, ok: false };
  }
  const genericCount = results.filter((item) => isGenericWrapperResult(item, query, engine)).length;
  const mismatchCount = results.filter((item) => isIntentMismatchResult(item, query, engine)).length;
  const lowTrustCount = results.filter((item) => isLowTrustResult(item, query, engine)).length;
  if (genericCount === results.length && results.length > 2) {
    return { quality_status: "junk", quality_reason: "generic_wrapper_results", filtered_count: filteredCount, ok: false };
  }
  const isPureEnglishQuery = /^[A-Za-z0-9\s\-_.,!@#$%^&*()]+$/.test(query);
  const hasChineseResults = results.some((item) => /[\u4e00-\u9fa5]/.test(item.title || item.snippet || ""));
  if (mismatchCount === results.length && !(isPureEnglishQuery && hasChineseResults)) {
    return { quality_status: "yellow", quality_reason: "intent_mismatch", filtered_count: filteredCount, ok: false };
  }
  if (lowTrustCount === results.length) {
    return { quality_status: "yellow", quality_reason: "low_trust_results", filtered_count: filteredCount, ok: false };
  }
  if (genericCount > 0 && genericCount + mismatchCount + lowTrustCount >= results.length) {
    return { quality_status: "yellow", quality_reason: "wrapper_dominant_results", filtered_count: filteredCount, ok: false };
  }
  return { quality_status: "green", quality_reason: genericCount > 0 || mismatchCount > 0 || lowTrustCount > 0 ? "usable_with_minor_noise" : "usable_results", filtered_count: filteredCount, ok: true };
}
__name(evaluateSearchQuality, "evaluateSearchQuality");
__name2(evaluateSearchQuality, "evaluateSearchQuality");
function filterSearchResultsForQuery(results, query, engine = "") {
  const filteredResults = [];
  let genericCount = 0;
  let semanticTruncationCount = 0;
  for (const item of Array.isArray(results) ? results : []) {
    const generic = isGenericWrapperResult(item, query, engine);
    const semanticTruncation = isSemanticTruncationResult(item, query, engine);
    if (generic || semanticTruncation) {
      if (generic) genericCount++;
      if (semanticTruncation) semanticTruncationCount++;
      continue;
    }
    filteredResults.push(item);
  }
  const filteredCount = Math.max(0, (Array.isArray(results) ? results.length : 0) - filteredResults.length);
  let filteredReason = "";
  if (filteredCount > 0 && semanticTruncationCount === filteredCount) filteredReason = "semantic_truncation";
  else if (filteredCount > 0 && genericCount === filteredCount) filteredReason = "generic_wrapper_results";
  else if (filteredCount > 0 && semanticTruncationCount > 0) filteredReason = "semantic_truncation";
  return { filteredResults, filteredCount, filteredReason };
}
__name(filterSearchResultsForQuery, "filterSearchResultsForQuery");
__name2(filterSearchResultsForQuery, "filterSearchResultsForQuery");
function isSemanticTruncationResult(item, query, engine = "") {
  const queryText = String(query || "");
  if (!/(?:路由器|wifi|wi-fi|pppoe|校园网|千兆|router|gigabit)/i.test(queryText)) return false;
  if (!/\b20\d{2}\b/.test(queryText)) return false;
  const title = String(item?.title || "").toLowerCase();
  const snippet = String(item?.snippet || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  const combined = `${title} ${snippet}`;
  const hasRouterIntent = /(?:路由器|wifi|wi-fi|pppoe|校园网|千兆|router|gigabit)/i.test(combined);
  if (hasRouterIntent) return false;
  const yearOnlyNoise = /\b20\d{2}\b/.test(title) && /(?:wikipedia\.org|britannica\.com|history\.com|cnn\.com|apnews\.com|associatedpress\.com|timeanddate\.com|onthisday\.com)/i.test(url);
  return yearOnlyNoise;
}
__name(isSemanticTruncationResult, "isSemanticTruncationResult");
__name2(isSemanticTruncationResult, "isSemanticTruncationResult");
function isBadSearchResult(result, query, engine) {
  return !evaluateSearchQuality(result, query, engine).ok;
}
__name(isBadSearchResult, "isBadSearchResult");
__name2(isBadSearchResult, "isBadSearchResult");
function isGenericWrapperResult(item, query, engine) {
  const url = String(item?.url || "");
  const title = String(item?.title || "").toLowerCase();
  const snippet = String(item?.snippet || "").toLowerCase();
  const host = safeHostname(url);
  const queryText = String(query || "").trim().toLowerCase();
  const combined = `${title} ${snippet}`.trim();
  if (!url || isNoiseUrl(url)) return true;
  if (host && isSearchEngineHost(host) && url.toLowerCase().includes("/search")) return true;
  if (/search results|search again|all results|results for|related searches|more results|see more/i.test(combined)) return true;
  if (/\b(?:sponsored|advertisement|advertorial|promo|coupon|deals?)\b|赞助|广告|推广/.test(combined)) return true;
  if (/\b(?:home|homepage|index|category|sections?)\b|worklife|accessibility|help center/.test(title) && !queryText) return true;
  if (queryText && host && isSearchEngineHost(host) && combined.includes(queryText) && url.toLowerCase().includes("/search")) return true;
  if (engine === "wikipedia" && host && !host.endsWith("wikipedia.org")) return true;
  if (engine === "bbc" && host && /(?:^|\.)bbc\.(?:com|co\.uk)$/i.test(host)) {
    let pathname = "";
    try {
      pathname = new URL(url).pathname.toLowerCase();
    } catch {
      pathname = "";
    }
    if (/^\/$/.test(pathname)) return true;
    if (/^\/(?:news|sport|reel|culture|weather)(?:\/)?$/.test(pathname)) return true;
    if (/^\/culture\/music(?:\/)?$/.test(pathname)) return true;
    if (/\/(?:worklife|future|travel|sounds|help|accessibility)(?:\/|$)/i.test(url)) return true;
    if (/\/(?:aboutthebbc|usingthebbc(?:\/|$)|iplayer\/guidance)(?:\/|$)?/i.test(url)) return true;
    if (/\/(?:contact|bbcnewsletter|advertisingcontact)(?:\/|$)/i.test(url)) return true;
    if (/\/editorialguidelines\/guidance\/links-and-feeds(?:\/|$)?/i.test(url)) return true;
    if (/\b(?:bbc homepage|homepage|news|sport|reel|culture|weather|contact the bbc|bbc emails for you|advertise with us)\b/i.test(title)) return true;
    if (/\bexternal linking\b/i.test(combined)) return true;
  }
  return false;
}
__name(isGenericWrapperResult, "isGenericWrapperResult");
__name2(isGenericWrapperResult, "isGenericWrapperResult");
function isIntentMismatchResult(item, query, engine = "") {
  const queryText = String(query || "").trim().toLowerCase();
  const contentText = `${item?.title || ""} ${item?.snippet || ""}`.toLowerCase();
  const host = safeHostname(item?.url || "");
  if (/[㐀-鿿]/.test(queryText)) {
    const queryTokens = tokenizeSearchText(queryText);
    const compactQuery = queryText.replace(/\s+/g, "");
    const compactContent = contentText.replace(/\s+/g, "");
    const matchedTokens = queryTokens.filter((token) => compactContent.includes(token));
    if (isClearCjkMismatchResult(item, query, engine)) return true;
    if (compactQuery && compactContent.includes(compactQuery)) return false;
    if (matchedTokens.length > 0) return false;
    if (cjkSubTokenCoverage(contentText, query) >= 0.15) return false;
    if (hasCjkIntentSynonymMatch(contentText, query)) return false;
    return true;
  }
  if (engine === "bbc") {
    const queryTokens = tokenizeSearchText(query);
    const alphaTokens = queryTokens.filter((token) => /[a-z]/i.test(token) && token.length >= 3);
    if (!alphaTokens.length) return false;
    const rawContent = ` ${contentText.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    const alphaMatches = alphaTokens.filter((token) => rawContent.includes(` ${token} `)).length;
    return alphaMatches === 0;
  }
  if (engine === "pubmed" || engine === "arxiv" || engine === "paperswithcode") {
    const techSignals = /\b(?:protocol|server|framework|library|package|api|sdk|github|npm|pip|install|json|rpc|http|websocket|config|deploy|docker|kubernetes|programming|software|code|repository|module|plugin)\b/i.test(queryText);
    const bioNoiseSignals = /\b(?:protein|expression|gene|clinical|patient|cell|mouse|rat|tumor|cancer|therapy|treatment|pathway|receptor|inhibitor|antibody|assay|knockout|mutation|phenotype|mRNA|ex vivo|in vivo|in vitro)\b/i.test(contentText);
    if (techSignals && bioNoiseSignals) {
      const techInContent = /\b(?:protocol|server|framework|library|api|software|code|programming|repository|package)\b/i.test(contentText);
      if (!techInContent) return true;
    }
  }
  const queryTokens = tokenizeSearchText(query).filter((token) => token.length >= 3);
  if (!queryTokens.length) return false;
  if (!/[\u4e00-\u9fa5]/.test(queryText) && queryTokens.length >= 3) {
    const alphaTokens = queryTokens.filter((t) => /[a-z]/i.test(t));
    if (alphaTokens.length >= 3) {
      const rawContent = ` ${contentText.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
      const matched = alphaTokens.filter((t) => rawContent.includes(` ${t} `)).length;
      if (matched / alphaTokens.length < 0.5) return true;
    }
  }
  const haystack = tokenizeSearchText(contentText);
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  return matches === 0;
}
__name(isIntentMismatchResult, "isIntentMismatchResult");
__name2(isIntentMismatchResult, "isIntentMismatchResult");
function tokenizeSearchText(value) {
  const text = String(value || "").toLowerCase();
  const tokens = text.match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(tokens)];
}
__name(tokenizeSearchText, "tokenizeSearchText");
__name2(tokenizeSearchText, "tokenizeSearchText");
function cjkSubTokenCoverage(content, query) {
  const compactQuery = String(query || "").toLowerCase().replace(/\s+/g, "");
  const compactContent = String(content || "").toLowerCase().replace(/\s+/g, "");
  if (!/[\u4e00-\u9fa5]/.test(compactQuery) || !compactContent) return 0;
  const cjkRuns = compactQuery.match(/[\u4e00-\u9fa5]+/g) || [];
  const cjkStopWords = /^(?:的|了|是|在|和|与|或|不|有|个|这|那|一|大|小|中|上|下|前|后|最|很|都|也|就|要|能|会|年|月|日|最新|情况|世界|中国)$/u;
  const subTokens = [];
  for (const run of cjkRuns) {
    if (run.length <= 2 && !cjkStopWords.test(run)) { subTokens.push(run); continue; }
    for (let len = Math.min(4, run.length); len >= 2; len--) {
      for (let i = 0; i + len <= run.length; i++) {
        const gram = run.substring(i, i + len);
        if (!cjkStopWords.test(gram)) subTokens.push(gram);
      }
    }
  }
  const uniqueTokens = [...new Set(subTokens)];
  if (!uniqueTokens.length) return 0;
  const hits = uniqueTokens.filter((t) => compactContent.includes(t)).length;
  return hits / uniqueTokens.length;
}
__name(cjkSubTokenCoverage, "cjkSubTokenCoverage");
__name2(cjkSubTokenCoverage, "cjkSubTokenCoverage");
var SYNONYM_DICT = /* @__PURE__ */ (() => {
  try {
    return /* dict_synonyms.json */ { "intent_groups": [{ "query_patterns": ["初学", "初学者", "入门", "教程", "课程", "学习", "自学"], "content_patterns": ["新手", "小白", "零基础", "入门", "教程", "教学", "指南", "自学", "课程", "学习", "基础"] }, { "query_patterns": ["推荐", "排行", "榜单", "哪款", "性价比", "选购"], "content_patterns": ["推荐", "排行", "榜", "哪款", "性价比", "选购", "评测", "攻略", "盘点", "值得买", "闭眼入"] }, { "query_patterns": ["对比", "比较", "横评", "替代方案"], "content_patterns": ["对比", "比较", "横评", "替代", "vs", "优缺点", "区别"] }], "intent_action_keywords": ["推荐", "对比", "教程", "攻略", "食谱", "注意事项", "排行", "评测", "最佳实践", "安全加固", "替代方案", "入门", "课程", "减肥", "办公", "软件", "app"], "concept_page_title_patterns": ["百度百科", "wikipedia", "维基百科"], "concept_page_host_patterns": ["baike.baidu.com", "wikipedia.org", "linux.org"], "concept_page_title_exact": ["download linux", "linux.org"], "cjk_stop_words": ["的", "了", "是", "在", "和", "与", "或", "不", "有", "个", "这", "那", "一", "大", "小", "中", "上", "下", "前", "后", "最", "很", "都", "也", "就", "要", "能", "会", "年", "月", "日", "最新", "情况", "世界", "中国"] };
  } catch { return null; }
})();
function hasCjkIntentSynonymMatch(content, query) {
  const q = String(query || "").toLowerCase().replace(/\s+/g, "");
  const c = String(content || "").toLowerCase().replace(/\s+/g, "");
  if (!/[\u4e00-\u9fa5]/.test(q)) return false;
  if (!SYNONYM_DICT) {
    if (/(?:初学|初学者|入门|教程|课程|学习|自学)/.test(q) && /(?:新手|小白|零基础|入门|教程|教学|指南|自学|课程|学习|基础)/.test(c)) return true;
    if (/(?:推荐|排行|榜单|哪款|性价比|选购)/.test(q) && /(?:推荐|排行|榜|哪款|性价比|选购|评测|攻略|盘点|值得买|闭眼入)/.test(c)) return true;
    if (/(?:对比|比较|横评|替代方案)/.test(q) && /(?:对比|比较|横评|替代|vs|优缺点|区别)/i.test(c)) return true;
    return false;
  }
  for (const group of SYNONYM_DICT.intent_groups) {
    const qMatch = group.query_patterns.some((p) => q.includes(p));
    if (!qMatch) continue;
    const cMatch = group.content_patterns.some((p) => c.includes(p));
    if (cMatch) return true;
  }
  return false;
}
__name(hasCjkIntentSynonymMatch, "hasCjkIntentSynonymMatch");
__name2(hasCjkIntentSynonymMatch, "hasCjkIntentSynonymMatch");
function hasMeaningfulCjkTokenMatch(item, query) {
  const normalizedQuery = normalizeCjkQuery(query);
  const normalizedContent = normalizeCjkQuery(`${item?.title || ""} ${item?.snippet || ""}`);
  if (!normalizedQuery || !normalizedContent) return false;
  if (normalizedContent.includes(normalizedQuery)) return true;
  const meaningfulTokens = tokenizeSearchText(query).map((token) => normalizeCjkQuery(token)).filter((token) => token && !/^\d+$/.test(token) && !/^20\d{2}$/.test(token) && !/^(?:年|月|日|最新|情况|世界|中国)$/.test(token));
  return meaningfulTokens.some((token) => normalizedContent.includes(token));
}
__name(hasMeaningfulCjkTokenMatch, "hasMeaningfulCjkTokenMatch");
__name2(hasMeaningfulCjkTokenMatch, "hasMeaningfulCjkTokenMatch");
function isCommunityMismatchResult(item, query, engine = "") {
  if (engine !== "bing_cn" && engine !== "bing" && engine !== "sogou") return false;
  if (!hasCjkText(query)) return false;
  const intent = detectSearchIntent(query);
  if (intent.isDeveloper) return false;
  const url = String(item?.url || "");
  const title = String(item?.title || "").toLowerCase();
  const snippet = String(item?.snippet || "").toLowerCase();
  const host = safeHostname(url).toLowerCase();
  const combined = `${title} ${snippet}`;
  const communitySignal = /(?:^|\.)(?:forum|community|bbs)\./.test(host) || /\b(?:forum|community|discussion|thread|帖子|论坛|社区)\b/.test(combined);
  if (!communitySignal) return false;
  return !hasMeaningfulCjkTokenMatch(item, query);
}
__name(isCommunityMismatchResult, "isCommunityMismatchResult");
__name2(isCommunityMismatchResult, "isCommunityMismatchResult");
function isWeakCjkMatchResult(item, query, engine = "") {
  if (engine !== "bing_cn" && engine !== "bing" && engine !== "sogou" && engine !== "baidu") return false;
  if (!hasCjkText(query)) return false;
  const intent = detectSearchIntent(query);
  if (intent.isDeveloper) return false;
  return !hasMeaningfulCjkTokenMatch(item, query);
}
__name(isWeakCjkMatchResult, "isWeakCjkMatchResult");
__name2(isWeakCjkMatchResult, "isWeakCjkMatchResult");
function isClearCjkMismatchResult(item, query, engine = "") {
  const host = safeHostname(item?.url || "");
  if (host === "mp.weixin.qq.com" && !String(item?.snippet || "").trim()) return true;
  if (host && isSearchEngineHost(host) && !/\/link\?|\/s\?wd=|\/item\//i.test(String(item?.url || ""))) return true;
  return isCommunityMismatchResult(item, query, engine);
}
__name(isClearCjkMismatchResult, "isClearCjkMismatchResult");
__name2(isClearCjkMismatchResult, "isClearCjkMismatchResult");
function isHardIntentMismatchResult(item, query, engine = "") {
  if (hasCjkText(query)) {
    if (isClearCjkMismatchResult(item, query, engine)) return true;
    const queryTokens = tokenizeSearchText(query).filter((t) => t.length >= 2);
    if (!queryTokens.length) return false;
    const contentText = `${item?.title || ""} ${item?.snippet || ""}`.toLowerCase();
    const compactContent = contentText.replace(/\s+/g, "");
    const compactQuery = query.toLowerCase().replace(/\s+/g, "");
    if (compactQuery && compactContent.includes(compactQuery)) return false;
    const matchedTokens = queryTokens.filter((token) => compactContent.includes(token));
    if (matchedTokens.length > 0) return false;
    if (cjkSubTokenCoverage(contentText, query) >= 0.15) return false;
    if (hasCjkIntentSynonymMatch(contentText, query)) return false;
    return true;
  }
  return isIntentMismatchResult(item, query, engine);
}
__name(isHardIntentMismatchResult, "isHardIntentMismatchResult");
__name2(isHardIntentMismatchResult, "isHardIntentMismatchResult");
function isLowTrustResult(item, query, engine = "") {
  const queryText = String(query || "").trim().toLowerCase();
  if (!queryText || !/[㐀-鿿]/.test(queryText)) return false;
  if (engine !== "baidu" && engine !== "sogou" && engine !== "bing" && engine !== "bing_cn") return false;
  const intent = detectSearchIntent(query);
  if (intent.isDeveloper) return false;
  const url = String(item?.url || "");
  const host = safeHostname(url);
  if (!host || isSearchEngineHost(host)) return false;
  const title = String(item?.title || "");
  const snippet = String(item?.snippet || "").trim();
  const compactQuery = queryText.replace(/\s+/g, "");
  const compactHost = host.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const titleLower = title.toLowerCase();
  const suspiciousTld = /\.(?:org|com|net)\.cn$/i.test(host);
  const hasYear = /20\d{2}/.test(compactHost);
  const sportsishQuery = /\b(?:nba|cba|f1|epl|uefa|fifa|worldcup|olympics)\b/i.test(compactQuery) || /总决赛|决赛|赛程|比分|战况|情况|冠军|淘汰赛/.test(queryText);
  const policyishQuery = /政策|禁烟|规定|条例|公告|发布|情况|最新/.test(queryText);
  const slugSignals = ["nba", "zongjuesai", "juesai", "quanchang", "huifang", "xilie", "bifen", "saicheng", "jinyan", "zhengce", "xin", "zuixin"];
  const slugMatchCount = slugSignals.filter((token) => compactHost.includes(token)).length;
  const tokenMatches = tokenizeSearchText(queryText).filter((token) => compactHost.includes(token.replace(/\s+/g, ""))).length;
  const titleLooksAnswerish = /(总决赛|比分|回放|赛程|政策|禁烟|通知|公告)/.test(title) || titleLower.includes("nba");
  if ((sportsishQuery || policyishQuery) && suspiciousTld && hasYear && compactHost.length >= 20 && titleLooksAnswerish && !snippet) {
    if (slugMatchCount >= 2 || tokenMatches >= 2) return true;
  }
  return false;
}
__name(isLowTrustResult, "isLowTrustResult");
__name2(isLowTrustResult, "isLowTrustResult");
function isSearchEngineHost(host) {
  return /(?:^|\.)(?:bing|google|yahoo|duckduckgo|baidu|sogou|yandex|brave|qwant|ecosia|naver)\./i.test(String(host || ""));
}
__name(isSearchEngineHost, "isSearchEngineHost");
__name2(isSearchEngineHost, "isSearchEngineHost");
function detectSearchIntent(query) {
  const text = String(query || "").trim();
  const lowered = text.toLowerCase();
  const isChinese = /[㐀-鿿]/.test(text);
  const isNews = /\b(news|policy|press|regulation|government|announcement|update|breaking)\b|新闻|政策|发布|公告/.test(lowered);
  const isDeveloper = /\b(api|sdk|docs?|documentation|github|gitlab|stackoverflow|npm|package|library|framework|typescript|javascript|python|java|golang|rust|error|bug)\b/.test(lowered);
  const isAcademic = /\b(paper|research|study|algorithm|model|neural|transformer|benchmark|dataset|arxiv|conference|journal|citation|abstract|theorem|proof|experiment|evaluation|methodology|semantic|embedding|fine-tun|pre-train|gradient|optimi[sz]ation|regulari[sz]|convolution|attention|sequence|token|rnn|lstm|bert|gpt|clip|diffusion|gan|reinforcement|clustering|classification|regression|embed|vector|tensor|epoch|loss|accuracy|f1|precision|recall)\b|论文|研究|算法|模型|神经网络|深度学习|机器学习|梯度|优化|训练|微调/.test(lowered);
  return { isChinese, isNews, isDeveloper, isAcademic };
}
__name(detectSearchIntent, "detectSearchIntent");
__name2(detectSearchIntent, "detectSearchIntent");
function defaultSearchAutoEngines(query) {
  const intent = detectSearchIntent(query);
  if (intent.isChinese) return ["brave", "yahoo", "mojeek", "bing_cn", "bing_news", "baidu", "sogou", "bing_global", "naver", "wikipedia", "startpage", "reddit_rss", "marginalia", "semantic_scholar", "duckduckgo", "google", "yandex"];
  if (intent.isNews) return ["brave", "mojeek", "bbc", "bing_news", "bing_global", "yahoo", "startpage", "reddit_rss", "naver", "archive", "wikipedia", "marginalia", "semantic_scholar", "duckduckgo", "google"];
  if (intent.isDeveloper) return ["brave", "mojeek", "github_repos", "stackoverflow", "npm", "devto", "hackernews", "searchmysite", "reddit_rss", "naver", "startpage", "wiby", "marginalia", "semantic_scholar", "bing_global", "wikipedia", "duckduckgo", "google"];
  return ["brave", "mojeek", "yahoo", "startpage", "bing_global", "naver", "wikipedia", "archive", "searchmysite", "marginalia", "wiby", "reddit_rss", "semantic_scholar", "bbc", "duckduckgo", "google", "sogou", "baidu", "yandex"];
}
__name(defaultSearchAutoEngines, "defaultSearchAutoEngines");
__name2(defaultSearchAutoEngines, "defaultSearchAutoEngines");
function fullSearchAutoEngines(query) {
  const defaults = defaultSearchAutoEngines(query);
  const publicEngines = [
    "bing_global",
    "bing_cn",
    "bing_news",
    "duckduckgo",
    "google",
    "yahoo",
    "brave",
    "sogou",
    "baidu",
    "yandex",
    "naver",
    "bbc",
    "archive",
    "wikipedia",
    "github_repos",
    "stackoverflow",
    "npm",
    "devto",
    "hackernews",
    "reddit",
    "arxiv",
    "pubmed",
    "paperswithcode",
    "sec_edgar",
    "osm",
    "lemmy",
    "wikidata",
    "crates",
    "pypi",
    "semantic_scholar",
    "wiby",
    "reddit_rss",
    "marginalia",
    "mastodon",
    "peertube"
  ];
  return [...new Set([...defaults, ...publicEngines])];
}
__name(fullSearchAutoEngines, "fullSearchAutoEngines");
__name2(fullSearchAutoEngines, "fullSearchAutoEngines");
function getEngineProviderName(engine) {
  const normalized = String(engine || "").toLowerCase();
  if (normalized === "bing_global" || normalized === "bing_cn" || normalized === "bing_news") return "bing";
  return Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, normalized) ? normalized : null;
}
__name(getEngineProviderName, "getEngineProviderName");
__name2(getEngineProviderName, "getEngineProviderName");
function isSearchEngineEnabled(engine, requestProviderConfig) {
  const providerName = getEngineProviderName(engine) || String(engine || "").toLowerCase();
  const config = getRequestProviderConfig(requestProviderConfig)[providerName];
  return config ? config.enabled !== false : true;
}
__name(isSearchEngineEnabled, "isSearchEngineEnabled");
__name2(isSearchEngineEnabled, "isSearchEngineEnabled");
function selectSearchAutoEngines(args) {
  const autoMode = String(args?.auto_mode || "").toLowerCase();
  const requested = autoMode === "full" ? fullSearchAutoEngines(args.query) : Array.isArray(args.engines) && args.engines.length ? args.engines : defaultSearchAutoEngines(args.query);
  const normalized = requested.map((name) => String(name).toLowerCase()).filter(Boolean);
  const unique = [];
  for (const engine of normalized) {
    if (unique.includes(engine)) continue;
    const providerName = getEngineProviderName(engine);
    if (providerName && !isSearchEngineEnabled(providerName, args?._providerConfig)) continue;
    if (!providerName && !isSearchEngineEnabled(engine, args?._providerConfig)) continue;
    unique.push(engine);
  }
  return unique;
}
__name(selectSearchAutoEngines, "selectSearchAutoEngines");
__name2(selectSearchAutoEngines, "selectSearchAutoEngines");
async function runSearchEngine(engine, args) {
  const providerArgs = args?._providerConfig ? { ...args, _context: { ...(args?._context || {}), providerConfig: args._providerConfig } } : args;
  if (engine === "duckduckgo") return await searchDuckDuckGo(args);
  if (engine === "bing") return await searchBing(args);
  if (engine === "bing_global") return await searchBingGlobal(args);
  if (engine === "bing_cn") return await searchBingCn(args);
  if (engine === "parallel") return await searchParallel(providerArgs);
  if (engine === "ollama") return await searchOllama(providerArgs);
  if (engine === "yahoo") return await searchYahoo(args);
  if (engine === "google") return await searchGoogle(args);
  if (engine === "yandex") return await searchYandex(args);
  if (engine === "baidu") return await searchBaidu(args);
  if (engine === "wikipedia") return await searchWikipedia(args);
  if (engine === "naver") return await searchNaver(args);
  if (engine === "sogou") return await searchSogou(args);
  if (engine === "brave") return await searchBrave(args);
  if (engine === "qwant") return await searchQwant(args);
  if (engine === "ecosia") return await searchEcosia(args);
  if (engine === "archive") return await searchArchive(args);
  if (engine === "semantic_scholar") return await searchSemanticScholar(args);
  if (engine === "arxiv") return await searchArxiv(args);
  if (engine === "pubmed") return await searchPubmed(args);
  if (engine === "hackernews") return await searchHackerNews(args);
  if (engine === "stackoverflow") return await searchStackOverflow(args);
  if (engine === "reddit") return await searchReddit(args);
  if (engine === "npm") return await searchNpm(args);
  if (engine === "devto") return await searchDevto(args);
  if (engine === "mastodon") return await searchMastodon(args);
  if (engine === "peertube") return await searchPeerTube(args);
  if (engine === "bbc") return await searchBbc(args);
  if (engine === "bing_news") return await searchBingNews(args);
  if (engine === "sina_news") return await searchSinaNews(args);
  if (engine === "163_news") return await search163News(args);
  if (engine === "paperswithcode") return await searchPapersWithCode(args);
  if (engine === "sec_edgar") return await searchSecEdgar(args);
  if (engine === "osm") return await searchOsm(args);
  if (engine === "lemmy") return await searchLemmy(args);
  if (engine === "wikidata") return await searchWikidata(args);
  if (engine === "crates") return await searchCrates(args);
  if (engine === "pypi") return await searchPypi(args);
  if (engine === "wiktionary") return await searchWiktionary(args);
  if (engine === "mojeek") return await searchMojeek(args);
  if (engine === "startpage") return await searchStartpage(args);
  if (engine === "searchmysite") return await searchSearchmysite(args);
  if (engine === "marginalia") return await searchMarginalia(args);
  if (engine === "wiby") return await searchWiby(args);
  if (engine === "reddit_rss") return await searchRedditRss(args);
  if (engine === "openlibrary") return await searchOpenLibrary(args);
  if (engine === "musicbrainz") return await searchMusicbrainz(args);
  if (engine === "crossref") return await searchCrossref(args);
  if (engine === "github_repos") return await searchGitHubRepos(args);
  if (engine === "find_rss") return await findRss(args);
  return null;
}
__name(runSearchEngine, "runSearchEngine");
__name2(runSearchEngine, "runSearchEngine");
function parseSiteTargetQuery(query) {
  const match = String(query || "").trim().match(/^site:([^\s/]+)\s+(.+)$/i);
  if (!match) return null;
  return { host: match[1].toLowerCase(), query: match[2].trim() };
}
__name(parseSiteTargetQuery, "parseSiteTargetQuery");
__name2(parseSiteTargetQuery, "parseSiteTargetQuery");
function filterSiteTargetedResults(results, siteTarget, limit) {
  if (!siteTarget) return Array.isArray(results) ? results.slice(0, limit) : [];
  const targetHost = siteTarget.host;
  return (Array.isArray(results) ? results : []).filter((item) => {
    const host = safeHostname(item?.url || "").toLowerCase();
    return host === targetHost || host.endsWith(`.${targetHost}`);
  }).slice(0, limit);
}
__name(filterSiteTargetedResults, "filterSiteTargetedResults");
__name2(filterSiteTargetedResults, "filterSiteTargetedResults");
function buildSearchAutoAttempt(engine, result, quality) {
  return {
    engine,
    ok: quality.ok,
    result_count: Array.isArray(result?.results) ? result.results.length : 0,
    quality_status: quality.quality_status,
    quality_reason: quality.quality_reason,
    filtered_count: quality.filtered_count
  };
}
__name(buildSearchAutoAttempt, "buildSearchAutoAttempt");
__name2(buildSearchAutoAttempt, "buildSearchAutoAttempt");
// ════════════════════════════════════════════════════════════════
// RRF-BASED RANKING (Reciprocal Rank Fusion with engine weights)
// Replaces all hardcoded additive constants with a principled formula.
// See: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
// ════════════════════════════════════════════════════════════════
const RRF_K = 60;

// ── Levenshtein distance for fuzzy title matching ──────────
function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
function _titleSimilarity(a, b) {
  const na = String(a || "").toLowerCase().replace(/\s+/g, " ").trim();
  const nb = String(b || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen < 4) return na === nb ? 1 : 0;
  const dist = _levenshtein(na, nb);
  return 1 - dist / maxLen;
}

// ── Layer 2: Query-type dynamic weight multiplier ─────────
function _queryTypeWeightMultiplier(engine, intent) {
  let mult = 1.0;
  if (intent.isDeveloper && /github_repos|stackoverflow|npm|devto|hackernews/.test(engine)) mult *= 1.5;
  if (intent.isNews && /bing_news|bbc/.test(engine)) mult *= 1.5;
  if (intent.isChinese && /baidu|sogou|bing_cn/.test(engine)) mult *= 1.3;
  if (intent.isAcademic && /arxiv|semantic_scholar|pubmed|paperswithcode/.test(engine)) mult *= 1.5;
  return mult;
}

// ── Layer 3: Health-based weight decay ────────────────────
function _healthWeightMultiplier(engine) {
  const stats = getEngineHealthStats();
  const s = stats[engine];
  if (!s || s.total < 3) return 1.0;
  if (s.block_rate > 50) return 0.3;
  if (s.block_rate > 30) return 0.6;
  return 1.0;
}

// ── Combined engine weight (base × query-type × health) ───
function getEngineWeight(engine, query) {
  const base = ENGINE_BASE_WEIGHTS[engine] ?? 1.0;
  const intent = detectSearchIntent(query);
  const qMult = _queryTypeWeightMultiplier(engine, intent);
  const hMult = _healthWeightMultiplier(engine);
  return base * qMult * hMult;
}

// ── RRF score: sum of weight/(k+rank) for each matching engine ──
function computeRRFScore(positions, query) {
  // positions: array of { engine, rank }
  let score = 0;
  for (const { engine, rank } of positions) {
    const weight = getEngineWeight(engine, query);
    score += weight / (RRF_K + Math.max(1, rank));
  }
  return score;
}

// ── Tiebreaker chain (sequential, NOT additive) ───────────
function compareTiebreakers(a, b, query) {
  // 1. More engines = higher priority
  const aEngines = (a._positions?.length || 0);
  const bEngines = (b._positions?.length || 0);
  if (aEngines !== bEngines) return bEngines - aEngines;

  // 2. Title contains more query tokens
  const aTokens = tokenizeSearchText(query).filter(t => t.length >= 2 && (a.title || "").toLowerCase().includes(t)).length;
  const bTokens = tokenizeSearchText(query).filter(t => t.length >= 2 && (b.title || "").toLowerCase().includes(t)).length;
  if (aTokens !== bTokens) return bTokens - aTokens;

  // 3. Longer content = more information
  const aLen = String(a.title || "").length + String(a.snippet || "").length;
  const bLen = String(b.title || "").length + String(b.snippet || "").length;
  if (aLen !== bLen) return bLen - aLen;

  // 4. Domain authority: gov > edu > org > others
  const _domainScore = (url) => {
    const h = safeHostname(url);
    if (/(?:^|\.)(gov|edu)$/.test(h)) return 3;
    if (/(?:^|\.)org$/.test(h)) return 2;
    if (/(?:^|\.)(gov|edu)\./.test(h)) return 2;
    return 0;
  };
  const aDom = _domainScore(a.url), bDom = _domainScore(b.url);
  if (aDom !== bDom) return bDom - aDom;

  // 5. Result type quality
  const _typeScore = (item) => {
    const t = item.result_type || "";
    if (t === "question" || t === "article" || t === "note") return 2;
    if (t === "thread") return 1;
    return 0;
  };
  const aType = _typeScore(a), bType = _typeScore(b);
  if (aType !== bType) return bType - aType;

  return 0; // truly tied
}

// ── Domain diversity: sliding window dedup ────────────────
function applyDomainDiversity(results, windowSize, maxPerDomain) {
  const final = [];
  const deferred = [];
  for (const r of results) {
    const domain = safeHostname(r.url || "");
    const recentDomains = final.slice(-windowSize).map(item => safeHostname(item.url || ""));
    const domainCount = recentDomains.filter(d => d === domain).length;
    if (domainCount >= maxPerDomain) {
      deferred.push(r);
    } else {
      final.push(r);
    }
  }
  return [...final, ...deferred];
}

// ════════════════════════════════════════════════════════════════
// MERGE — replaces old scoreSearchAutoResult + mergeSearchAutoResults
// ════════════════════════════════════════════════════════════════
function mergeSearchAutoResults(collectedResults, limit, query = "") {
  const maxLimit = clampLimit(limit);

  // ── Phase 1: Fuzzy dedup (URL exact + same-domain title similarity ≥ 0.85) ──
  const dedupMap = new Map(); // key → merged entry

  for (const item of collectedResults) {
    const url = String(item?.url || "").trim();
    if (!url) continue;
    const host = safeHostname(url);
    const title = String(item?.title || "").trim();
    const engine = String(item?.engine || item?.source || "").toLowerCase();
    const rank = Number(item?.rank_within_engine) || 99;

    // Try URL exact match first
    let matched = dedupMap.get(url);

    // If no URL match, try same-domain + title similarity
    if (!matched && title && host) {
      for (const [existingUrl, entry] of dedupMap) {
        const existingHost = safeHostname(existingUrl);
        if (existingHost === host) {
          const sim = _titleSimilarity(title, entry.title);
          if (sim >= 0.85) {
            matched = entry;
            break;
          }
        }
      }
    }

    if (matched) {
      // Merge: accumulate positions + engines, keep best content
      matched._positions.push({ engine, rank });
      matched._engines.add(engine);
      // Keep the longer snippet/title
      if (String(item.snippet || "").length > String(matched.snippet || "").length) {
        matched.snippet = item.snippet;
      }
      if (title.length > String(matched.title || "").length) {
        matched.title = title;
      }
      // Keep URLs: prefer shorter/cleaner URL
      if (url.length < String(matched.url || "").length && !url.includes("?")) {
        matched.url = url;
      }
    } else {
      dedupMap.set(url, {
        ...item,
        title,
        url,
        _positions: [{ engine, rank }],
        _engines: new Set([engine])
      });
    }
  }

  // ── Phase 2: RRF scoring ──
  const scored = [...dedupMap.values()].map(item => {
    const rrfScore = computeRRFScore(item._positions, query);
    return { ...item, _rrfScore: rrfScore };
  });

  // ── Phase 3: Sort by RRF score, then tiebreaker chain ──
  scored.sort((a, b) => {
    if (b._rrfScore !== a._rrfScore) return b._rrfScore - a._rrfScore;
    return compareTiebreakers(a, b, query);
  });

  // ── Phase 4: Domain diversity (window=8, max 2 per domain) ──
  const diversified = applyDomainDiversity(scored, 8, 2);

  // ── Phase 5: Clean up internal fields + truncate ──
  return diversified.slice(0, maxLimit).map(({ _positions, _engines, _rrfScore, ...item }) => {
    const engines = [..._engines].filter(Boolean);
    const sources = [...new Set([...engines, ...(Array.isArray(item.sources) ? item.sources : []), ...(item.source ? [item.source] : [])])];
    return {
      ...item,
      sources: sources.length ? sources : undefined,
      engine: engines[0] || item.engine || item.source,
      engine_count: engines.length
    };
  });
}
function buildSearchAutoResponse({ args, engines, attempts, acceptedResults, siteTarget }) {
  const mergedResults = mergeSearchAutoResults(acceptedResults, args.limit, args.query);
  const contributingSources = [...new Set(mergedResults.flatMap((item) => Array.isArray(item?.sources) && item.sources.length ? item.sources : item?.source ? [item.source] : []).filter(Boolean))];
  const successfulSources = [...new Set((Array.isArray(acceptedResults) ? acceptedResults : []).flatMap((item) => Array.isArray(item?.sources) && item.sources.length ? item.sources : item?.source ? [item.source] : []).filter(Boolean))];
  const autoMode = String(args?.auto_mode || "").toLowerCase() === "full" ? "full" : "default";
  const aggregateSource = siteTarget ? "site_targeted" : successfulSources.length > 1 ? "auto" : successfulSources[0] || engines[0] || null;
  if (mergedResults.length) {
    const finalQuality = mergedResults.some((item) => item.quality_status === "green") ? "green" : "yellow";
    return {
      ok: true,
      source: aggregateSource,
      query: typeof args.query === "string" ? args.query.trim() : "",
      limit: clampLimit(args.limit),
      results: mergedResults,
      sources: contributingSources,
      attempts,
      fallback_used: attempts.length > 1,
      quality_status: finalQuality,
      quality_reason: finalQuality === "green" ? "usable_results" : "usable_with_minor_noise",
      filtered_count: attempts.reduce((total, item) => total + (Number(item.filtered_count) || 0), 0),
      merged_count: acceptedResults.length,
      deduped_count: Math.max(0, acceptedResults.length - mergedResults.length),
      auto_mode: autoMode,
      ...siteTarget ? { site_target: siteTarget.host } : {}
    };
  }
  return {
    ok: false,
    source: aggregateSource,
    query: typeof args.query === "string" ? args.query.trim() : "",
    results: [],
    attempts,
    fallback_used: attempts.length > 1,
    quality_status: attempts.some((item) => item.quality_status === "blocked") ? "blocked" : attempts.some((item) => item.quality_status === "empty") ? "empty" : "red",
    quality_reason: attempts.some((item) => item.quality_status === "junk") ? "only_junk_results" : attempts.some((item) => item.quality_status === "empty") ? "no_results" : "no_useful_results",
    filtered_count: attempts.reduce((total, item) => total + (Number(item.filtered_count) || 0), 0),
    auto_mode: autoMode,
    ...siteTarget ? { site_target: siteTarget.host } : {},
    error: attempts.length ? `No search engine returned parsed results. Tried: ${attempts.map((item) => item.error ? `${item.engine}: ${item.error}` : `${item.engine}: ${item.quality_reason || "no useful parsed results"}`).join("; ")}` : "No search engines requested."
  };
}
__name(buildSearchAutoResponse, "buildSearchAutoResponse");
__name2(buildSearchAutoResponse, "buildSearchAutoResponse");
async function searchAuto(args) {
  const engines = selectSearchAutoEngines(args);
  const attempts = [];
  const acceptedResults = [];
  const cacheDisabled = hasRequestScopedProviderOverrides(args?._providerConfig);
  const cacheKey = `auto:${engines.join(",")}:${args.query}:${args.limit || 5}`;
  const cached = cacheDisabled ? null : getCached(cacheKey);
  if (cached) return { ...cached, _cached: true };
  const siteTarget = parseSiteTargetQuery(args.query);
  const CONCURRENT_LIMIT = 4;
  const RACE_TIMEOUT_MS = 12000;
  let raceWon = false;
  let raceResults = [];
  const circuitBroken = engines.filter((e) => !isEngineCircuitBroken(e) && !isEngineJunkFrozen(e));
  const firstBatch = circuitBroken.slice(0, CONCURRENT_LIMIT);
  const remaining = circuitBroken.slice(CONCURRENT_LIMIT);
  const racePromises = firstBatch.map(async (engine) => {
    try {
      const result = await runSearchEngine(engine, args);
      if (!result) return { engine, ok: false, error: "no_result" };
      const originalResults = Array.isArray(result?.results) ? result.results : [];
      const filteredResults = filterSiteTargetedResults(originalResults, siteTarget, Number(args.limit) || 5);
      const normalizedResult = siteTarget && Array.isArray(result?.results) ? { ...result, results: filteredResults, filtered_count: Math.max(0, originalResults.length - filteredResults.length) } : result;
      const quality = evaluateSearchQuality(normalizedResult, args.query, engine);
      const enrichedResult = { ...normalizedResult, ...quality };
      return { engine, result: enrichedResult, quality };
    } catch (error) {
      return { engine, ok: false, error: error?.message || "failed" };
    }
  });
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), RACE_TIMEOUT_MS));
  const raceSettled = await Promise.allSettled([...racePromises.map((p) => p.then((r) => {
    if (r?.quality && (r.quality.quality_status === "green" || r.quality.quality_status === "yellow") && !raceWon) {
      raceWon = true;
    }
    return r;
  })), timeoutPromise]);
  for (const settled of raceSettled) {
    if (settled.status !== "fulfilled" || !settled.value || settled.value === null) continue;
    const entry = settled.value;
    if (!entry?.result) {
      if (entry.engine) recordEngineHealthEvent(entry.engine, "empty");
      attempts.push({ engine: entry.engine, ok: false, error: entry.error || "failed", quality_status: "red", quality_reason: entry.error || "failed", filtered_count: 0, result_count: 0 });
      continue;
    }
    const engine = entry.engine;
    const enrichedResult = entry.result;
    const quality = entry.quality;
    attempts.push(buildSearchAutoAttempt(engine, enrichedResult, quality));
    if (quality.quality_status === "blocked") { recordEngineBlocked(engine); }
    else if (quality.quality_status === "green" || quality.quality_status === "yellow") {
      recordEngineSuccess(engine);
      const usableResults = Array.isArray(enrichedResult?.results) ? enrichedResult.results : [];
      usableResults.forEach((item, index) => {
        acceptedResults.push({
          ...item,
          source: enrichedResult.source || engine,
          engine,
          quality_status: quality.quality_status,
          quality_reason: quality.quality_reason,
          rank_within_engine: index + 1
        });
      });
    }
  }
  if (raceWon && acceptedResults.length > 0) {
    const final = buildSearchAutoResponse({ args, engines, attempts, acceptedResults, siteTarget });
    if (!cacheDisabled && final.ok) setCache(cacheKey, final);
    return final;
  }
  for (const engine of remaining) {
    if (isEngineCircuitBroken(engine)) {
      attempts.push({ engine, ok: false, error: "circuit_breaker", quality_status: "red", quality_reason: "circuit_breaker_frozen", filtered_count: 0, result_count: 0 });
      continue;
    }
    if (isEngineJunkFrozen(engine)) {
      attempts.push({ engine, ok: false, error: "junk_frozen", quality_status: "red", quality_reason: "junk_soft_frozen", filtered_count: 0, result_count: 0 });
      continue;
    }
    try {
      const result = await runSearchEngine(engine, args);
      if (!result) continue;
      const originalResults = Array.isArray(result?.results) ? result.results : [];
      const filteredResults = filterSiteTargetedResults(originalResults, siteTarget, Number(args.limit) || 5);
      const normalizedResult = siteTarget && Array.isArray(result?.results) ? { ...result, results: filteredResults, filtered_count: Math.max(0, originalResults.length - filteredResults.length) } : result;
      const quality = evaluateSearchQuality(normalizedResult, args.query, engine);
      const enrichedResult = { ...normalizedResult, ...quality };
      attempts.push(buildSearchAutoAttempt(engine, enrichedResult, quality));
      if (quality.quality_status === "blocked") { recordEngineBlocked(engine); }
      else if (quality.quality_status === "green" || quality.quality_status === "yellow") {
        recordEngineSuccess(engine);
        const usableResults = Array.isArray(enrichedResult?.results) ? enrichedResult.results : [];
        usableResults.forEach((item, index) => {
          acceptedResults.push({
            ...item,
            source: enrichedResult.source || engine,
            engine,
            quality_status: quality.quality_status,
            quality_reason: quality.quality_reason,
            rank_within_engine: index + 1
          });
        });
        break;
      }
    } catch (error) {
      attempts.push({ engine, ok: false, error: error?.message || "failed", quality_status: "red", quality_reason: error?.message || "failed", filtered_count: 0, result_count: 0 });
    }
  }
  const final = buildSearchAutoResponse({ args, engines, attempts, acceptedResults, siteTarget });
  if (!cacheDisabled && final.ok) setCache(cacheKey, final);
  return final;
}
__name(searchAuto, "searchAuto");
__name2(searchAuto, "searchAuto");
async function searchDuckDuckGo(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const region = typeof args.region === "string" ? args.region : "us-en";
  const attempts = [
    { url: `https://noai.duckduckgo.com/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`, method: "GET", body: null, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html,*/*", "Accept-Language": "en-US,en;q=0.9" } },
    { url: `https://lite.duckduckgo.com/lite/`, method: "POST", body: `q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Referer": "https://html.duckduckgo.com/" } },
    { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`, method: "GET", body: null, headers: {} }
  ];
  let bestFailure = null;
  const fetchAttempts = [];
  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), DEFAULT_TIMEOUT_MS);
      const fetchOpts = { signal: controller.signal, headers: attempt.headers, redirect: "follow" };
      if (attempt.method === "POST" && attempt.body) {
        fetchOpts.method = "POST";
        fetchOpts.body = attempt.body;
      }
      const response = await fetch(attempt.url, fetchOpts);
      clearTimeout(timer);
      if (!response.ok) throw new Error(`upstream ${response.status}`);
      const text = await response.text();
      const fetchPath = safeHostname(response.url) || safeHostname(attempt.url);
      const diagnosis = diagnoseSearchHtml("duckduckgo", text, response.url);
      fetchAttempts.push({ path: fetchPath, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
      if (diagnosis.blocked) {
        bestFailure = searchResult({ source: "duckduckgo", query, limit, results: [], region, blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath, fetch_attempts: fetchAttempts });
        continue;
      }
      let results = [];
      const blocks = text.split(/<div[^>]+class="[^"]*result[^"]*"[^>]*>/i);
      for (const block of blocks) {
        if (results.length >= limit) break;
        const link = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!link) continue;
        const href = decodeDuckUrl(decodeHtml(link[1]));
        if (isNoiseUrl(href) || isDuckDuckGoNoiseUrl(href) || !looksLikeSearchResultUrl(href)) continue;
        const snippet = (block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
        results.push({ title: cleanText(link[2]), url: href, snippet: cleanText(snippet) });
      }
      if (!results.length) {
        const rows = text.split(/<tr[^>]*>/i);
        for (const row of rows) {
          if (results.length >= limit) break;
          if (/class\s*=\s*(["'])[^"']*result-sponsored[^"']*\1/i.test(row)) continue;
          const hrefBeforeClassLink = row.match(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*class\s*=\s*(["'])[^"']*result-link[^"']*\3[^>]*>([\s\S]*?)<\/a>/i);
          const classBeforeHrefLink = row.match(/<a\b[^>]*class\s*=\s*(["'])[^"']*result-link[^"']*\1[^>]*href\s*=\s*(["'])(.*?)\2[^>]*>([\s\S]*?)<\/a>/i);
          const genericLink = row.match(/<a[^>]+href="(https?:\/\/[^\"]+)"[^>]*class="[^"]*link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
          const href = hrefBeforeClassLink ? hrefBeforeClassLink[2] : classBeforeHrefLink ? classBeforeHrefLink[3] : genericLink ? genericLink[1] : "";
          const title = hrefBeforeClassLink ? hrefBeforeClassLink[4] : classBeforeHrefLink ? classBeforeHrefLink[4] : genericLink ? genericLink[2] : "";
          if (!href || !title) continue;
          const normalizedHref = decodeDuckUrl(decodeHtml(href));
          if (isNoiseUrl(normalizedHref) || isDuckDuckGoNoiseUrl(normalizedHref) || !looksLikeSearchResultUrl(normalizedHref)) continue;
          const snippet = (row.match(/<td[^>]+class\s*=\s*(["'])[^"']*result-snippet[^"']*\1[^>]*>([\s\S]*?)<\/td>/i) || [])[2] || "";
          results.push({ title: cleanText(title), url: normalizedHref, snippet: cleanText(snippet) });
        }
      }
      if (!results.length) results = extractGenericLinks(text, limit, "https://duckduckgo.com");
      if (results.length) {
        return searchResult({ source: "duckduckgo", query, limit, results, region, fetch_path: fetchPath, fetch_attempts: fetchAttempts });
      }
      bestFailure = searchResult({ source: "duckduckgo", query, limit, results: [], region, fetch_path: fetchPath, fetch_attempts: fetchAttempts });
    } catch (error) {
      fetchAttempts.push({ path: safeHostname(attempt.url), blocked: false, block_reason: "", error: error?.message || "failed" });
      bestFailure = {
        ok: false,
        source: "duckduckgo",
        query,
        limit,
        results: [],
        region,
        error: error?.message || "failed",
        fetch_path: safeHostname(attempt.url),
        fetch_attempts: fetchAttempts
      };
    }
  }
  return bestFailure || searchResult({ source: "duckduckgo", query, limit, results: [], region, error: "duckduckgo returned no usable results", fetch_attempts: fetchAttempts });
}
__name(searchDuckDuckGo, "searchDuckDuckGo");
__name2(searchDuckDuckGo, "searchDuckDuckGo");
async function searchBing(args) {
  return searchBingRoute(args, {
    source: "bing",
    engine: "bing",
    baseUrl: "https://www.bing.com/search",
    primaryParams: "setlang=en&cc=us",
    fallbackParams: "",
    acceptLanguage: "en-US,en;q=0.9"
  });
}
__name(searchBing, "searchBing");
__name2(searchBing, "searchBing");
async function searchBingGlobal(args) {
  return searchBingRoute(args, {
    source: "bing_global",
    engine: "bing",
    baseUrl: "https://www.bing.com/search",
    primaryParams: "setlang=en&cc=us",
    fallbackParams: "",
    acceptLanguage: "en-US,en;q=0.9"
  });
}
__name(searchBingGlobal, "searchBingGlobal");
__name2(searchBingGlobal, "searchBingGlobal");
async function searchBingCn(args) {
  return searchBingRoute(args, {
    source: "bing_cn",
    engine: "bing",
    baseUrl: "https://cn.bing.com/search",
    primaryParams: "mkt=zh-CN&setlang=zh-Hans",
    fallbackParams: "mkt=zh-CN",
    acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.6"
  });
}
__name(searchBingCn, "searchBingCn");
__name2(searchBingCn, "searchBingCn");
async function searchBingRoute(args, route) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const attempts = [
    {
      url: `${route.baseUrl}?q=${encodeURIComponent(query)}&count=${limit}${route.primaryParams ? `&${route.primaryParams}` : ""}`,
      headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*", "Accept-Language": route.acceptLanguage }
    },
    {
      url: `${route.baseUrl}?q=${encodeURIComponent(query)}&count=${limit}${route.fallbackParams ? `&${route.fallbackParams}` : ""}`,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html,*/*", "Accept-Language": route.acceptLanguage }
    },
    {
      url: `${route.baseUrl}?q=${encodeURIComponent(query)}&count=${limit}${route.fallbackParams ? `&${route.fallbackParams}` : ""}`,
      headers: route.acceptLanguage ? { "Accept-Language": route.acceptLanguage } : {}
    }
  ];
  let sawBlocked = false;
  let blockReason = "";
  let sawAnyResults = false;
  for (const attempt of attempts) {
    try {
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml(route.engine, text, response.url);
      if (diagnosis.blocked) {
        sawBlocked = true;
        blockReason = diagnosis.reason || blockReason;
        continue;
      }
      const results = extractBingResults(text, limit);
      if (results.length > 0) {
        sawAnyResults = true;
        const { filteredResults, filteredCount, filteredReason } = filterSearchResultsForQuery(results, query, route.source);
        if (filteredResults.length > 0) {
          return searchResult({ source: route.source, query, limit, results: filteredResults, blocked: false, block_reason: "", filtered_count: filteredCount, filtered_reason: filteredReason });
        }
        return searchResult({ source: route.source, query, limit, results: [], blocked: false, block_reason: "", filtered_count: filteredCount, filtered_reason: filteredReason });
      }
    } catch {
      continue;
    }
  }
  if (sawBlocked && !sawAnyResults) {
    return searchResult({ source: route.source, query, limit, results: [], blocked: true, block_reason: blockReason || "captcha_or_verification" });
  }
  return searchResult({ source: route.source, query, limit, results: [], blocked: false, block_reason: "" });
}
__name(searchBingRoute, "searchBingRoute");
__name2(searchBingRoute, "searchBingRoute");
async function searchYahoo(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  // Helper: pipe all results through finalizeVerticalSearchResults (v2 pipeline)
  function finalizeYahoo(results, blocked = false, block_reason = "") {
    return finalizeVerticalSearchResults({ source: "yahoo", query, limit, results, blocked, block_reason });
  }
  const attempts = [
    { url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}&ei=UTF-8&nojs=1`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*", "Accept-Language": "en-US,en;q=0.9" } },
    { url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}&ei=UTF-8`, headers: {} },
    { url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}`, headers: {} }
  ];
  for (const attempt of attempts) {
    try {
      let text = "";
      let response = null;
      let diagnosis = { blocked: false, reason: "" };
      let shouldRetryWithConsentCookie = false;
      try {
        const fetched = await fetchWithUA(attempt.url, attempt.headers);
        text = fetched.text;
        response = fetched.response;
        diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
        const initialResults = diagnosis.blocked ? [] : extractYahooResults(text, limit);
        if (initialResults.length > 0) return finalizeYahoo(initialResults);
        shouldRetryWithConsentCookie = diagnosis.reason === "consent_page" || attempt.url.includes("nojs=1") && !diagnosis.blocked;
      } catch (error) {
        shouldRetryWithConsentCookie = attempt.url.includes("nojs=1") && /upstream 5\d\d/i.test(String(error?.message || error || ""));
        if (!shouldRetryWithConsentCookie) throw error;
      }
      if (shouldRetryWithConsentCookie) {
        const consentHeaders = {
          ...attempt.headers,
          "Cookie": "GUCS=AV.0",
          "Referer": "https://search.yahoo.com/",
          "Accept-Language": attempt.headers?.["Accept-Language"] || "en-US,en;q=0.9"
        };
        const retried = await fetchWithUA(attempt.url, consentHeaders);
        text = retried.text;
        response = retried.response;
        diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
        if (diagnosis.reason === "consent_page" || safeHostname(response?.url) === "consent.yahoo.com") {
          const consentRetried = await retryYahooWithConsentForm(attempt.url, consentHeaders, text, response?.url || "");
          if (consentRetried) {
            text = consentRetried.text;
            response = consentRetried.response;
            diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
          }
        }
      }
      let results = [];
      if (!diagnosis.blocked) {
        results = extractYahooResults(text, limit);
      }
      if (results.length > 0) return finalizeYahoo(results);
      if (diagnosis.blocked || shouldRetryWithConsentCookie) {
        continue;
      }
    } catch (e) {
      continue;
    }
  }
  try {
    let text = "";
    let response = null;
    let diagnosis = { blocked: false, reason: "" };
    let shouldRetryWithConsentCookie = false;
    const mobileUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}&ei=UTF-8&nojs=1`;
    const mobileHeaders = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    };
    try {
      const mobileAttempt = await fetchWithUA(mobileUrl, mobileHeaders);
      text = mobileAttempt.text;
      response = mobileAttempt.response;
      diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
      const initialResults = diagnosis.blocked ? [] : extractYahooResults(text, limit);
      if (initialResults.length > 0) {
        return finalizeYahoo(initialResults);
      }
      shouldRetryWithConsentCookie = diagnosis.reason === "consent_page" || !diagnosis.blocked;
    } catch (error) {
      shouldRetryWithConsentCookie = /upstream 5\d\d/i.test(String(error?.message || error || ""));
      if (!shouldRetryWithConsentCookie) throw error;
    }
    if (shouldRetryWithConsentCookie) {
      const consentHeaders = {
        ...mobileHeaders,
        "Cookie": "GUCS=AV.0",
        "Referer": "https://search.yahoo.com/"
      };
      const retried = await fetchWithUA(mobileUrl, consentHeaders);
      text = retried.text;
      response = retried.response;
      diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
      if (diagnosis.reason === "consent_page") {
        const consentRetried = await retryYahooWithConsentForm(mobileUrl, consentHeaders, text, response?.url || "");
        if (consentRetried) {
          text = consentRetried.text;
          response = consentRetried.response;
          diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
        }
      }
    }
    if (!diagnosis.blocked) {
      const results = extractYahooResults(text, limit);
      if (results.length > 0) {
        return finalizeYahoo(results);
      }
      if (shouldRetryWithConsentCookie) {
        return finalizeYahoo([], true, "consent_page");
      }
      return finalizeYahoo([]);
    }
  } catch (e) {
  }
  return finalizeYahoo([], true, "consent_page");
}
__name(searchYahoo, "searchYahoo");
__name2(searchYahoo, "searchYahoo");
async function debugCaptureSearchHtml(args) {
  const engine = requireString(args.engine, "engine").toLowerCase();
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 12e3, 2e3), 4e4);
  const url = buildSearchDebugUrl(engine, query, limit, args.language);
  const { text, response } = await fetchTextWithResponse(url, { maxBytes: Math.min(MAX_FETCH_BYTES, Math.max(maxChars * 6, 96e3)) });
  const diagnosis = diagnoseSearchHtml(engine, text, response.url);
  const excerpt = extractSearchDebugExcerpt(engine, text, maxChars);
  return {
    engine,
    query,
    url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    blocked: diagnosis.blocked,
    block_reason: diagnosis.reason || "",
    marker: excerpt.marker,
    marker_index: excerpt.markerIndex,
    excerpt_offset: excerpt.offset,
    sample: excerpt.sample,
    truncated: excerpt.truncated,
    maxChars
  };
}
__name(debugCaptureSearchHtml, "debugCaptureSearchHtml");
__name2(debugCaptureSearchHtml, "debugCaptureSearchHtml");
async function searchGoogle(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const attempts = [
    { url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}&hl=en`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,application/xhtml+xml,*/*", "Accept-Language": "en-US,en;q=0.9" } },
    { url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}&hl=en&gbv=1`, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html,*/*" } },
    { url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}`, headers: {} }
  ];
  for (const attempt of attempts) {
    try {
      const { text, response } = await fetchWithUA(attempt.url, { ...attempt.headers });
      const diagnosis = diagnoseSearchHtml("google", text, response.url);
      if (diagnosis.blocked) {
        continue;
      }
      let results = [];
      const re = /<a href="\/url\?(?:q|url)=([^&"]+)[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
      for (const match of text.matchAll(re)) {
        if (results.length >= limit) break;
        const u = decodeGoogleUrl(`/url?${match[0].includes('/url?url=') ? 'url' : 'q'}=${match[1]}`);
        if (isNoiseUrl(u)) continue;
        results.push({ title: cleanText(match[2]), url: u, snippet: "" });
      }
      if (!results.length) {
        const generic = extractGenericLinks(text, limit * 4, "https://www.google.com");
        results = generic.map((item) => ({ ...item, url: decodeGoogleUrl(item.url) })).filter((item) => !isNoiseUrl(item.url));
      }
      if (results.length > 0) return searchResult({ source: "google", query, limit, results, blocked: false, block_reason: "" });
    } catch (e) {
      continue;
    }
  }
  return searchResult({ source: "google", query, limit, results: [], blocked: true, block_reason: "captcha_or_verification" });
}
__name(searchGoogle, "searchGoogle");
__name2(searchGoogle, "searchGoogle");
async function searchBaidu(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const attempts = [
    { url: `https://m.baidu.com/s?word=${encodeURIComponent(query)}&pn=0&rn=${limit}`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*", "Accept-Language": "zh-CN,zh;q=0.9" }, type: "html", baseUrl: "https://www.baidu.com" },
    { url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&tn=json&rn=${limit}&pn=0`, headers: { "Accept": "application/json,text/plain,*/*", "Accept-Language": "zh-CN,zh;q=0.9" }, type: "json" },
    { url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`, headers: {}, type: "html", baseUrl: "https://www.baidu.com" }
  ];
  for (const attempt of attempts) {
    try {
      if (attempt.type === "json") {
        const data = await fetchJson(attempt.url, { headers: attempt.headers, timeoutMs: DEFAULT_TIMEOUT_MS });
        const results = extractBaiduJsonResults(data, limit);
        if (results.length > 0) {
          return finalizeVerticalSearchResults({ source: "baidu", query, limit, results, blocked: false, block_reason: "" });
        }
        continue;
      }
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml("baidu", text, response.url);
      if (diagnosis.blocked) {
        continue;
      }
      let results = extractBaiduResults(text, limit);
      if (!results.length) {
        results = extractGenericLinks(text, limit * 4, attempt.baseUrl || "https://www.baidu.com").filter((item) => !isBaiduNoiseTitle(item.title) && !isBaiduNoiseUrl(item.url)).slice(0, limit);
      }
      if (results.length > 0) {
        return finalizeVerticalSearchResults({ source: "baidu", query, limit, results, blocked: false, block_reason: "" });
      }
    } catch (e) {
      continue;
    }
  }
  return searchResult({ source: "baidu", query, limit, results: [], blocked: true, block_reason: "captcha_or_verification" });
}
__name(searchBaidu, "searchBaidu");
__name2(searchBaidu, "searchBaidu");
async function searchYandex(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const language = /^[a-z-]{2,12}$/i.test(args.language || "") ? args.language : "en";
  const attempts = [
    { url: `https://yandex.com/search/?text=${encodeURIComponent(query)}&lang=${encodeURIComponent(language)}&lr=134`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*" } },
    { url: `https://yandex.com/search/?text=${encodeURIComponent(query)}&lang=${encodeURIComponent(language)}`, headers: {} }
  ];
  for (const attempt of attempts) {
    try {
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml("yandex", text, response.url);
      if (diagnosis.blocked) {
        continue;
      }
      const results = extractYandexResults(text, limit);
      if (results.length > 0) return searchResult({ source: "yandex", query, limit, results, language, blocked: false, block_reason: "" });
    } catch (e) {
      continue;
    }
  }
  return searchResult({ source: "yandex", query, limit, results: [], language, blocked: true, block_reason: "captcha_or_verification" });
}
__name(searchYandex, "searchYandex");
__name2(searchYandex, "searchYandex");
async function searchNaver(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const { text, response } = await fetchTextWithResponse(`https://search.naver.com/search.naver?query=${encodeURIComponent(query)}&where=web`);
  const diagnosis = diagnoseSearchHtml("naver", text, response.url);
  let results = [];
  const seen = /* @__PURE__ */ new Set();
  const dataUrlRe = /data-url="(https?:\/\/[^"]+)"/gi;
  for (const m of text.matchAll(dataUrlRe)) {
    if (results.length >= limit) break;
    const url = decodeHtml(m[1]);
    if (isNoiseUrl(url) || seen.has(url) || url.includes("naver.com") || url.includes("pstatic.net")) continue;
    seen.add(url);
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      const pathSeg = u.pathname.split("/").filter(Boolean).pop() || "";
      const raw = decodeURIComponent(pathSeg.replace(/[-_]/g, " ")).replace(/\.[a-z]+$/, "");
      results.push({ title: raw ? `${raw} - ${host}` : host, url, snippet: "" });
    } catch {
      results.push({ title: url, url, snippet: "" });
    }
  }
  if (results.length < limit) {
    const linkRe = /<a[^>]+href="(https?:\/\/(?!.*naver\.com)(?!.*pstatic\.net)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const m of text.matchAll(linkRe)) {
      if (results.length >= limit) break;
      const url = decodeHtml(m[1]);
      const title = cleanText(m[2]);
      if (isNoiseUrl(url) || seen.has(url) || !title || title.length < 3) continue;
      seen.add(url);
      results.push({ title, url, snippet: "" });
    }
  }
  if (!results.length) results = extractGenericLinks(text, limit, "https://search.naver.com");
  return searchResult({ source: "naver", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
}
__name(searchNaver, "searchNaver");
__name2(searchNaver, "searchNaver");
function isSogouDirectNoiseResult(item, query) {
  const url = String(item?.url || "");
  const host = safeHostname(url);
  if (!host) return false;
  if (host === "mp.weixin.qq.com" && !String(item?.snippet || "").trim()) return true;
  try {
    const parsed = new URL(url);
    if (isSearchEngineHost(host)) {
      const pathname = parsed.pathname.toLowerCase();
      if (/^\/(?:web|s|search)(?:\/)?$/.test(pathname) && /(?:query|keyword|wd|q|p|text)=/i.test(parsed.search)) return true;
    }
  } catch {
  }
  return false;
}
__name(isSogouDirectNoiseResult, "isSogouDirectNoiseResult");
__name2(isSogouDirectNoiseResult, "isSogouDirectNoiseResult");
async function searchSogou(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const { text, response } = await fetchTextWithResponse(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`);
  const diagnosis = diagnoseSearchHtml("sogou", text, response.url);
  let results = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of text.matchAll(re)) {
    if (results.length >= limit) break;
    let url = decodeSogouUrl(decodeHtml(match[1]));
    const title = cleanText(match[2]);
    if (!title || title.length < 2) continue;
    if (url.startsWith("javascript:") || url === "#" || url === "/") continue;
    if (!url.startsWith("http")) url = decodeSogouUrl("https://www.sogou.com" + url);
    if (seen.has(url) || isNoiseUrl(url) || isSogouNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: "" });
  }
  if (!results.length) {
    results = extractGenericLinks(text, limit * 3, "https://www.sogou.com").map((item) => ({ ...item, url: decodeSogouUrl(item.url) })).filter((item) => {
      if (seen.has(item.url) || isNoiseUrl(item.url) || isSogouNoiseUrl(item.url) || !looksLikeSearchResultUrl(item.url)) return false;
      seen.add(item.url);
      return true;
    }).slice(0, limit);
  }
  const { filteredResults, filteredCount, filteredReason } = filterSearchResultsForQuery(results, query, "sogou");
  const directFilteredResults = filteredResults.filter((item) => !isSogouDirectNoiseResult(item, query));
  const directFilteredCount = filteredCount + Math.max(0, filteredResults.length - directFilteredResults.length);
  const directFilteredReason = directFilteredCount > filteredCount && !directFilteredResults.length && directFilteredResults.length !== filteredResults.length ? "intent_mismatch" : filteredReason;
  return searchResult({ source: "sogou", query, limit, results: directFilteredResults, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "", filtered_count: directFilteredCount, filtered_reason: directFilteredReason });
}
__name(searchSogou, "searchSogou");
__name2(searchSogou, "searchSogou");
async function searchBrave(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  try {
    const { text, response } = await fetchTextWithResponse(url);
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    const diagnosis = diagnoseSearchHtml("brave", text, response.url);
    if (diagnosis.blocked) return searchResult({ source: "brave", query, limit, results: [], blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath });
    let results = [];
    const blocks = text.split(/data-type="web"/i);
    for (const block of blocks) {
      if (results.length >= limit) break;
      const link = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*l1[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<a[^>]+class="[^"]*l1[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const href = decodeHtml(link[1]);
      if (isNoiseUrl(href)) continue;
      const snippet = (block.match(/class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || (block.match(/class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "";
      results.push({ title: cleanText(link[2]), url: href, snippet: cleanText(snippet) });
    }
    if (!results.length) {
      const links = text.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*l1[^"]*"[^>]*>([\s\S]*?)<\/a>/gi) || [];
      for (const lm of links) {
        if (results.length >= limit) break;
        const m = lm.match(/href="(https?:\/\/[^"]+)"/i);
        const tm = lm.match(/>([\s\S]*?)<\//i);
        if (m && !isNoiseUrl(m[1])) results.push({ title: cleanText(tm ? tm[1] : ""), url: decodeHtml(m[1]), snippet: "" });
      }
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://search.brave.com");
    return searchResult({ source: "brave", query, limit, results, fetch_path: fetchPath });
  } catch (error) {
    return { ok: false, source: "brave", query, limit, results: [], error: error?.message || "failed" };
  }
}
__name(searchBrave, "searchBrave");
__name2(searchBrave, "searchBrave");
async function searchQwant(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://www.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
  try {
    const { text, response } = await fetchTextWithResponse(url);
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    const diagnosis = diagnoseSearchHtml("qwant", text, response.url);
    if (diagnosis.blocked) return searchResult({ source: "qwant", query, limit, results: [], blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath });
    let results = extractGenericLinks(text, limit, "https://www.qwant.com");
    return searchResult({ source: "qwant", query, limit, results, fetch_path: fetchPath });
  } catch (error) {
    return { ok: false, source: "qwant", query, limit, results: [], error: error?.message || "failed" };
  }
}
__name(searchQwant, "searchQwant");
__name2(searchQwant, "searchQwant");
async function searchEcosia(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}&method=index`;
  try {
    const { text, response } = await fetchTextWithResponse(url);
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    const diagnosis = diagnoseSearchHtml("ecosia", text, response.url);
    if (diagnosis.blocked) return searchResult({ source: "ecosia", query, limit, results: [], blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath });
    let results = [];
    const blocks = text.split(/<div[^>]+class="[^"]*result[^"]*"[^>]*>/i);
    for (const block of blocks) {
      if (results.length >= limit) break;
      const link = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const href = decodeHtml(link[1]);
      if (isNoiseUrl(href)) continue;
      const snippet = (block.match(/<p[^>]+class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "";
      results.push({ title: cleanText(link[2]), url: href, snippet: cleanText(snippet) });
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://www.ecosia.org");
    return searchResult({ source: "ecosia", query, limit, results, fetch_path: fetchPath });
  } catch (error) {
    return { ok: false, source: "ecosia", query, limit, results: [], error: error?.message || "failed" };
  }
}
__name(searchEcosia, "searchEcosia");
__name2(searchEcosia, "searchEcosia");
async function searchArchive(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const mode = args.mode === "wayback" ? "wayback" : "search";
  if (mode === "wayback") {
    const url = query.startsWith("http") ? query : `https://${query}`;
    try {
      const data = await fetchJson(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
      const snapshots = data?.archived_snapshots?.closest ? [{
        title: `Wayback snapshot: ${url}`,
        url: `https://web.archive.org/web/${data.archived_snapshots.closest.timestamp}/${data.archived_snapshots.closest.url}`,
        snippet: `Status: ${data.archived_snapshots.closest.status}, Timestamp: ${data.archived_snapshots.closest.timestamp}`
      }] : [];
      return searchResult({ source: "archive_wayback", query: url, limit, results: snapshots });
    } catch (e) {
      return searchResult({ source: "archive_wayback", query: url, limit, results: [], error: e?.message || "wayback lookup failed" });
    }
  }
  let results = [];
  try {
    const searchQ = /^[a-z0-9][-a-z0-9]*(\.[a-z]{2,})+/.test(query) ? `host:${query}` : query;
    const data = await fetchJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(searchQ)}&fl[]=identifier,title,description&rows=${limit}&output=json`);
    const docs = data?.response?.docs || [];
    for (const doc of docs) {
      if (results.length >= limit) break;
      results.push({
        title: doc.title || doc.identifier || "",
        url: `https://archive.org/details/${doc.identifier}`,
        snippet: Array.isArray(doc.description) ? doc.description[0]?.substring(0, 200) || "" : (doc.description || "").substring(0, 200)
      });
    }
  } catch {
  }
  if (!results.length) {
    const { text } = await fetchTextWithResponse(`https://archive.org/search?query=${encodeURIComponent(query)}`);
    results = extractGenericLinks(text, limit, "https://archive.org");
  }
  return finalizeVerticalSearchResults({ source: "archive", query, limit, results });
}
__name(searchArchive, "searchArchive");
__name2(searchArchive, "searchArchive");

// ── Semantic Scholar — academic paper search (covers IEEE, ACM, Springer, etc) ──
async function searchSemanticScholar(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const fields = "title,url,year,abstract,citationCount,journal,authors";
  const cfg = getProviderConfig("semantic_scholar");
  const baseUrl = cfg?.baseUrl || "https://api.semanticscholar.org";
  const apiKey = cfg?.apiKey || "";
  const apiUrl = `${baseUrl}/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  try {
    const headers = { "User-Agent": "search-mcp-worker/1.0", "Accept": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;
    const resp = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (resp.status === 429) {
      // Rate limited — retry with exponential backoff (max 1 retry)
      await new Promise((r) => setTimeout(r, 1500));
      const resp2 = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(15000) });
      if (!resp2.ok) throw new Error(`HTTP ${resp2.status} (after 429 retry)`);
      const data = await resp2.json();
      return finalizeSemanticScholarResults(data, query, limit);
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return finalizeSemanticScholarResults(data, query, limit);
  } catch (e) {
    // Rate-limited? Fall back to arXiv as academic backup
    try {
      const fallback = await searchArxiv({ query, limit });
      if (fallback?.results?.length) return fallback;
    } catch { /* arxiv also failed */ }
    return searchError("semantic_scholar", query, limit, e, { fetch_path: "api.semanticscholar.org" });
  }
}
function finalizeSemanticScholarResults(data, query, limit) {
  const results = (data?.data || []).slice(0, limit).map((p) => {
    const journal = p.journal || {};
    const journalName = journal.name || journal.displayName || "";
    const authors = (p.authors || []).map((a) => a.name || "").filter(Boolean).slice(0, 3).join(", ");
    const snippet = cleanText(p.abstract || "").substring(0, 300) || (journalName ? `${journalName}` : "");
    const yearStr = p.year ? `${p.year}` : "";
    return {
      title: cleanText(p.title || "").substring(0, 160),
      url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
      snippet,
      authors: authors || undefined,
      year: yearStr || undefined,
      citations: p.citationCount || 0
    };
  });
  return finalizeVerticalSearchResults({ source: "semantic_scholar", query, limit, results, fetch_path: "api.semanticscholar.org" });
}

async function searchArxiv(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const { text: xml } = await fetchArxivAtom(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`, {
      timeoutMs: 2e4
    });
    let results = [];
    const entries = xml.split("<entry>");
    for (let i = 1; i < entries.length && results.length < limit; i++) {
      const entry = entries[i];
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim().replace(/\n/g, " ") || "";
      const id = (entry.match(/<id>([^<]+)<\/id>/) || [])[1] || "";
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim().replace(/\n/g, " ").substring(0, 200) || "";
      const authors = (entry.match(/<name>([^<]+)<\/name>/g) || []).map((a) => a.replace(/<\/?name>/g, "")).join(", ");
      if (title && id) results.push({ title, url: id, snippet: summary, authors });
    }
    return searchResult({ source: "arxiv", query, limit, results, fetch_path: "export.arxiv.org" });
  } catch (e) {
    const fallback = await searchSiteTargetVertical(args, {
      source: "arxiv",
      host: "arxiv.org"
    });
    if (fallback?.ok) {
      return fallback;
    }
    return searchResult({ source: "arxiv", query, limit, results: [], error: e?.message || "failed", fetch_path: "export.arxiv.org" });
  }
}
__name(searchArxiv, "searchArxiv");
__name2(searchArxiv, "searchArxiv");
async function searchPubmed(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const searchXml = await fetchText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}`);
    const ids = [...searchXml.matchAll(/<Id>(\d+)<\/Id>/g)].map((m) => m[1]);
    if (!ids.length) return searchResult({ source: "pubmed", query, limit, results: [] });
    const fetchXml = await fetchText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml`);
    let results = [];
    const articles = fetchXml.split("<PubmedArticle>");
    for (let i = 1; i < articles.length && results.length < limit; i++) {
      const art = articles[i];
      const title = (art.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1]?.trim() || "";
      const pmid = (art.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";
      const abstract = (art.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/) || [])[1]?.replace(/<[^>]+>/g, "").trim().substring(0, 200) || "";
      const authorNames = [...art.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map((m) => m[1]).join(", ");
      if (title && pmid) results.push({ title, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, snippet: abstract, authors: authorNames });
    }
    return searchResult({ source: "pubmed", query, limit, results });
  } catch (e) {
    return searchResult({ source: "pubmed", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchPubmed, "searchPubmed");
__name2(searchPubmed, "searchPubmed");
async function searchHackerNews(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`);
    let results = [];
    for (const hit of data.hits || []) {
      if (results.length >= limit) break;
      const title = hit.title || "";
      const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const points = hit.points || 0;
      const author = hit.author || "";
      const numComments = hit.num_comments || 0;
      results.push({ title, url, snippet: `${points} points | ${numComments} comments | by ${author}` });
    }
    return finalizeVerticalSearchResults({ source: "hackernews", query, limit, results });
  } catch (e) {
    return searchResult({ source: "hackernews", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchHackerNews, "searchHackerNews");
__name2(searchHackerNews, "searchHackerNews");
function classifyVerticalResultType(item, source) {
  const url = String(item?.url || "");
  const title = String(item?.title || "").toLowerCase();
  const snippet = String(item?.snippet || "").toLowerCase();
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = "";
  }
  if (source === "bbc") {
    if (/^\/news\/articles\//.test(pathname)) return "article";
    if (/^\/news\/topics\//.test(pathname)) return "topic_page";
    if (/^\/$/.test(pathname) || /^\/(?:news|sport|reel|culture|weather)(?:\/)?$/.test(pathname)) return "homepage";
    return "result";
  }
  if (source === "bing_news") {
    const host = safeHostname(url).toLowerCase();
    if (/(^|\.)bing\.com$/.test(host) && (/^\/news(?:\/search)?\/?$/.test(pathname) || pathname === "/")) return "landing_page";
    return "article";
  }
  if (source === "sina_news") {
    const host = safeHostname(url).toLowerCase();
    if (/(^|\.)search\.sina\.com\.cn$/.test(host)) return "search_page";
    if (/(^|\.)sina\.com\.cn$/.test(host)) {
      if (/\/\d{4}-\d{2}-\d{2}\/doc-/i.test(pathname) || /\/article_[a-z0-9]+_/i.test(pathname)) return "article";
      if (pathname === "/" || pathname === "") return "homepage";
      return "channel_page";
    }
    return "result";
  }
  if (source === "163_news") {
    const host = safeHostname(url).toLowerCase();
    if (/(^|\.)so\.163\.com$/.test(host) || ((host === "www.163.com" || host === "163.com") && pathname.startsWith("/search"))) return "search_page";
    if (host === "www.163.com" || host === "163.com" || host === "dy.163.com") {
      if (/\/article\/[a-z0-9]+\.html$/i.test(pathname)) return "article";
      if (/\/special\//i.test(pathname)) return "topic_page";
      if (pathname === "/" || pathname === "") return "homepage";
      return "channel_page";
    }
    return "result";
  }
  if (source === "stackoverflow") {
    if (/^\/questions\/\d+(?:\/|$)/.test(pathname)) return "question";
    if (/^\/questions\/tagged\//.test(pathname)) return "tag_page";
    if (/^\/users\//.test(pathname)) return "user_profile";
    return "result";
  }
  if (source === "wikipedia") {
    if (/\bmay refer to\b|\bdisambiguation\b/.test(`${title} ${snippet}`)) return "disambiguation";
    return "article";
  }
  return "result";
}
__name(classifyVerticalResultType, "classifyVerticalResultType");
__name2(classifyVerticalResultType, "classifyVerticalResultType");
function isPreferredVerticalResultType(resultType, source) {
  if (source === "bbc") return resultType === "article";
  if (source === "bing_news") return resultType === "article";
  if (source === "sina_news") return resultType === "article";
  if (source === "163_news") return resultType === "article";
  if (source === "stackoverflow") return resultType === "question";
  if (source === "wikipedia") return resultType === "article";
  return false;
}
__name(isPreferredVerticalResultType, "isPreferredVerticalResultType");
__name2(isPreferredVerticalResultType, "isPreferredVerticalResultType");
function shouldDropVerticalResultType(resultType, source, hasPreferred) {
  if (!hasPreferred) return false;
  if (source === "bbc") return resultType === "homepage" || resultType === "topic_page";
  if (source === "bing_news") return resultType === "landing_page";
  if (source === "sina_news") return resultType === "homepage" || resultType === "channel_page" || resultType === "search_page";
  if (source === "163_news") return resultType === "homepage" || resultType === "channel_page" || resultType === "topic_page" || resultType === "search_page";
  if (source === "stackoverflow") return resultType === "tag_page" || resultType === "user_profile";
  if (source === "wikipedia") return resultType === "disambiguation";
  return false;
}
__name(shouldDropVerticalResultType, "shouldDropVerticalResultType");
__name2(shouldDropVerticalResultType, "shouldDropVerticalResultType");
// ════════════════════════════════════════════════════════════════
// SINGLE-ENGINE RANKING v2 — replaces scoreVerticalResult
// Three cascade levels + confidence-based truncation
// ════════════════════════════════════════════════════════════════

// ── Engine-level confidence assessment (before per-item filtering) ──
// Returns: "HIGH" | "MEDIUM" | "LOW" | "JUNK"
function assessEngineConfidence(results, source) {
  const n = results.length;
  if (n === 0) return "JUNK";

  // Count unique 2nd-level domains
  const domains = results.map(r => {
    try { return new URL(r.url || "").hostname.split(".").slice(-2).join("."); } catch { return ""; }
  }).filter(Boolean);
  const uniqueDomains = new Set(domains).size;
  const domainConcentration = n > 0 ? (domains.length - uniqueDomains) / n : 0;

  // Title diversity: how many unique titles (ignoring trailing numbers)
  const titleSet = new Set(results.map(r => String(r.title || "").replace(/\s*\d+\s*$/g, "").trim().toLowerCase()).filter(Boolean));

  // Snippet empty rate
  const emptySnippet = results.filter(r => !r.snippet || r.snippet.length < 20).length;
  const emptyRate = emptySnippet / n;

  // Ad/sponsor ratio
  const adPattern = /sponsored|advertisement|ads?\b|推广|广告|赞助/i;
  const adCount = results.filter(r => adPattern.test(r.title || "") || adPattern.test(r.snippet || "")).length;
  const adRate = adCount / n;

  // Signal checks
  let junkSignals = 0;
  if (domainConcentration >= 0.5) junkSignals++;
  if (titleSet.size <= n * 0.6 && n >= 5) junkSignals++;
  if (emptyRate >= 0.6) junkSignals++;
  if (adRate >= 0.3) junkSignals++;

  if (junkSignals >= 3) return "JUNK";
  if (junkSignals >= 2) return "LOW";
  if (junkSignals >= 1) return "MEDIUM";
  return "HIGH";
}
__name(assessEngineConfidence, "assessEngineConfidence");
__name2(assessEngineConfidence, "assessEngineConfidence");

// ── New hard-drop signals (additional to existing 4 gates) ──
function isEngineSelfPage(item, source) {
  const url = String(item?.url || "").toLowerCase();
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })();

  // Engine-specific domain blacklist
  const blacklist = ENGINE_DOMAIN_BLACKLIST[source] || [];
  for (const blocked of blacklist) {
    if (host === blocked || host.endsWith("." + blocked)) return true;
    // baidu.com/link style path matching
    if (blocked.includes("/") && path.startsWith(blocked.substring(blocked.indexOf("/")))) return true;
  }

  // Help/support/advertising/feedback pages (catches Yahoo Chinese garbage)
  if (/^(help|support|advertising|feedback|login|privacy|legal|info|about)\./i.test(host)) return true;
  if (/^\/(help|support|contact|advertise|feedback|about|privacy|terms|legal)/i.test(path)) return true;

  // Captcha / JS-required pages
  const title = String(item?.title || "");
  const snippet = String(item?.snippet || "");
  if (/please enable javascript|captcha|recaptcha|verify you are human|access denied|blocked/i.test(snippet)) return true;

  // Snippet == title (SEO template)
  const t = title.trim().toLowerCase();
  const s = snippet.trim().toLowerCase();
  if (t && s && t.length > 10 && t === s) return true;

  return false;
}
__name(isEngineSelfPage, "isEngineSelfPage");
__name2(isEngineSelfPage, "isEngineSelfPage");

// ── Type B: API source cascade (name match → API order → anomaly sink) ──
function cascadeSortTypeB(results, query, source) {
  const queryLower = String(query || "").toLowerCase().trim();
  const nameFields = {
    npm: "name", github_repos: "name", crates: "name", pypi: "name",
    arxiv: "title", semantic_scholar: "title", pubmed: "title",
    paperswithcode: "title", stackoverflow: "title",
    devto: "title", hackernews: "title", wikipedia: "title",
    wikidata: "title", sec_edgar: "title"
  };
  const nameField = nameFields[source] || "title";

  // Split into: exact-match, normal, anomaly
  const exactMatch = [];
  const normal = [];
  const anomaly = [];

  for (const r of results) {
    const name = String(r[nameField] || r.title || r.name || "").toLowerCase().trim();
    const desc = String(r.snippet || r.description || r.abstract || "");
    // Anomaly: title > 300 chars, desc == title, or gibberish
    if ((r.title || "").length > 300 || (desc && name && desc.trim() === name)) {
      anomaly.push(r);
    } else if (queryLower.length >= 3 && name === queryLower) {
      exactMatch.push(r);
    } else {
      normal.push(r);
    }
  }
  return [...exactMatch, ...normal, ...anomaly];
}

// ── Type C: News cascade (time → title match within same time bucket) ──
function cascadeSortTypeC(results, query, source) {
  const tokens = tokenizeSearchText(query).filter(t => t.length >= 2);
  const now = Date.now();

  // Classify freshness
  function timeBucket(r) {
    const dateStr = r.date || r.published_at || r.pub_date || r.created_at || "";
    if (!dateStr) return 3; // old / unknown
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 3;
      const age = (now - d.getTime()) / 1000;
      if (age <= 86400) return 0; // 24h
      if (age <= 604800) return 1; // 7d
      if (age <= 2592000) return 2; // 30d
      return 3;
    } catch { return 3; }
  }

  function titleMatchScore(r) {
    const title = String(r.title || "").toLowerCase();
    let hits = 0;
    for (const t of tokens) if (title.includes(t)) hits++;
    return hits;
  }

  return [...results].sort((a, b) => {
    const ta = timeBucket(a), tb = timeBucket(b);
    if (ta !== tb) return ta - tb;
    const ma = titleMatchScore(a), mb = titleMatchScore(b);
    if (ma !== mb) return mb - ma;
    return (a.rank_within_engine || 99) - (b.rank_within_engine || 99);
  });
}

// ── Type A: Web search cascade (title match → time decay → content info → original position) ──
function cascadeSortTypeA(results, query, source) {
  const tokens = tokenizeSearchText(query).filter(t => t.length >= 2);
  const totalTokens = tokens.length || 1;

  function titleTier(r) {
    const title = String(r.title || "").toLowerCase();
    let hits = 0;
    for (const t of tokens) if (title.includes(t)) hits++;
    const ratio = hits / totalTokens;
    if (ratio >= 1.0) return 0;   // all tokens hit
    if (ratio >= 0.8) return 1;   // ≥80% tokens
    if (ratio >= 0.5) return 2;   // ≥50% tokens
    return 3;                      // <50%
  }

  // L2a: Time decay — newer results rank higher within same title tier
  // 0 = ≤2yr, 1 = 2-5yr, 2 = >5yr, 1.5 = no date (center, not bottom)
  function timeDecayTier(r) {
    const dateStr = r.date || r.publishedDate || r.publish_date || r.published_at || "";
    if (!dateStr) return 1.5; // no date → center
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 1.5;
      const ageYr = (Date.now() - d.getTime()) / (365.25 * 86400 * 1000);
      if (ageYr <= 2) return 0;
      if (ageYr <= 5) return 1;
      return 2;
    } catch { return 1.5; }
  }

  function contentInfoTier(r) {
    const snippet = String(r.snippet || "");
    if (snippet.length >= 200) return 0;
    if (snippet.length >= 100) return 1;
    return 2;
  }

  return [...results].sort((a, b) => {
    const ta = titleTier(a), tb = titleTier(b);
    if (ta !== tb) return ta - tb;
    // L2a: time decay (between title match and content info)
    const da = timeDecayTier(a), db = timeDecayTier(b);
    if (da !== db) return da - db;
    // L2b: content info
    const ca = contentInfoTier(a), cb = contentInfoTier(b);
    if (ca !== cb) return ca - cb;
    return (a.rank_within_engine || 99) - (b.rank_within_engine || 99);
  });
}

// ── Confidence-based truncation limits ──
var CONFIDENCE_LIMITS = { HIGH: 15, MEDIUM: 8, LOW: 3, JUNK: 0 };

// ════════════════════════════════════════════════════════════════
// FINALIZE v2 — replaces old scoreVerticalResult + finalizeVerticalSearchResults
// ════════════════════════════════════════════════════════════════
function finalizeVerticalSearchResults({ source, query, limit, results, blocked, block_reason, ...extra }) {
  const normalized = (Array.isArray(results) ? results : []).map((item, index) => {
    const resultType = classifyVerticalResultType(item, source);
    return {
      ...item,
      source: item?.source || source,
      engine: item?.engine || source,
      rank_within_engine: Number(item?.rank_within_engine) || index + 1,
      result_type: resultType
    };
  });

  // ── Phase 0: Engine-level confidence assessment ──
  const confidence = assessEngineConfidence(normalized, source);
  const truncLimit = CONFIDENCE_LIMITS[confidence] || 15;

  // JUNK → record for soft-freeze, return immediately
  if (confidence === "JUNK") {
    recordEngineJunk(source);
    return searchResult({
      source, query, limit, results: [],
      blocked: false, block_reason: "",
      ...extra,
      filtered_count: normalized.length,
      filtered_reason: "engine_confidence_junk",
      quality_status: "junk",
      quality_reason: `confidence=JUNK (domain concentration / low title diversity / high empty rate / high ad rate)`
    });
  }
  // Non-JUNK result → reset junk counter
  resetEngineJunk(source);

  // ── Phase 1: Hard-drop filters (sequential, any match = drop) ──
  let genericCount = 0, mismatchCount = 0, lowTrustCount = 0, typeDropCount = 0, selfPageCount = 0;
  const hasPreferred = normalized.some(item => isPreferredVerticalResultType(item.result_type, source));

  const filteredResults = normalized.filter(item => {
    // Gate 1: Generic wrapper (existing)
    if (isGenericWrapperResult(item, query, source)) { genericCount++; return false; }
    // Gate 2: Hard intent mismatch (existing)
    if (isHardIntentMismatchResult(item, query, source)) { mismatchCount++; return false; }
    // Gate 3: Low trust SEO (existing, CJK only)
    if (isLowTrustResult(item, query, source)) { lowTrustCount++; return false; }
    // Gate 4: Type downgrade (existing)
    if (shouldDropVerticalResultType(item.result_type, source, hasPreferred)) { typeDropCount++; return false; }
    // Gate 5: Engine self-pages / help/support/captcha (NEW)
    if (isEngineSelfPage(item, source)) { selfPageCount++; return false; }
    return true;
  });

  // ── Phase 2: Cascade sort based on engine type ──
  const engineType = ENGINE_TYPE[source] || "A";
  let sorted;
  if (engineType === "B") {
    sorted = cascadeSortTypeB(filteredResults, query, source);
  } else if (engineType === "C") {
    sorted = cascadeSortTypeC(filteredResults, query, source);
  } else {
    sorted = cascadeSortTypeA(filteredResults, query, source);
  }

  // ── Phase 3: Confidence-based truncation ──
  const finalResults = sorted.slice(0, truncLimit);

  const filteredCount = normalized.length - finalResults.length;
  let filteredReason = "";
  if (filteredCount > 0 || confidence !== "HIGH") {
    const reasons = [
      ["generic_wrapper_results", genericCount],
      ["intent_mismatch", mismatchCount],
      ["low_trust_results", lowTrustCount],
      ["vertical_result_type", typeDropCount],
      ["engine_self_pages", selfPageCount],
      ["confidence_truncated", confidence !== "HIGH" ? 1 : 0]
    ].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    filteredReason = reasons.length === 1 ? reasons[0][0] : reasons[0]?.[0] || "vertical_precision_filter";
  }

  const quality = evaluateSearchQuality({ results: finalResults, filtered_count: filteredCount, filtered_reason: filteredReason }, query, source);

  return searchResult({
    source, query, limit,
    results: finalResults,
    blocked, block_reason,
    ...extra,
    filtered_count: filteredCount,
    filtered_reason: filteredReason,
    quality_status: quality.quality_status,
    quality_reason: quality.quality_reason,
    _engine_confidence: confidence
  });
}
__name(finalizeVerticalSearchResults, "finalizeVerticalSearchResults");
__name2(finalizeVerticalSearchResults, "finalizeVerticalSearchResults");
async function searchStackOverflow(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const site = /^[a-z.]+$/.test(args.site || "") ? args.site : "stackoverflow";
  try {
    const data = await fetchJson(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=${site}&pagesize=${limit}&filter=withbody`);
    let results = [];
    for (const item of data.items || []) {
      if (results.length >= limit) break;
      const title = item.title || "";
      const url = item.link || "";
      const score = item.score || 0;
      const answers = item.answer_count || 0;
      const tags = (item.tags || []).join(", ");
      results.push({ title, url, snippet: `Score: ${score} | Answers: ${answers}${tags ? " | " + tags : ""}` });
    }
    return finalizeVerticalSearchResults({ source: "stackoverflow", query, limit, results, site });
  } catch (e) {
    return searchResult({ source: "stackoverflow", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchStackOverflow, "searchStackOverflow");
__name2(searchStackOverflow, "searchStackOverflow");
function hasCjkText(value) {
  return /[㐀-鿿]/.test(String(value || ""));
}
__name(hasCjkText, "hasCjkText");
__name2(hasCjkText, "hasCjkText");
function normalizeCjkQuery(value) {
  return String(value || "").normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}
__name(normalizeCjkQuery, "normalizeCjkQuery");
__name2(normalizeCjkQuery, "normalizeCjkQuery");
function scoreCjkRedditFallbackResult(item, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const title = normalizeCjkQuery(item?.title || "");
  const snippet = normalizeCjkQuery(item?.snippet || "");
  let score = 0;
  if (title.includes(normalizedQuery)) score += 100;
  if (snippet.includes(normalizedQuery)) score += 40;
  for (let size = Math.min(normalizedQuery.length, 8); size >= 2; size--) {
    for (let start = 0; start <= normalizedQuery.length - size; start++) {
      const part = normalizedQuery.slice(start, start + size);
      if (title.includes(part)) score += size * 8;
      if (snippet.includes(part)) score += size * 3;
    }
  }
  return score;
}
__name(scoreCjkRedditFallbackResult, "scoreCjkRedditFallbackResult");
__name2(scoreCjkRedditFallbackResult, "scoreCjkRedditFallbackResult");
function filterRedditFallbackResults(results, subredditName, limit, query) {
  const normalizedSubreddit = String(subredditName || "").toLowerCase();
  const normalizedQuery = hasCjkText(query) ? normalizeCjkQuery(query) : "";
  const filtered = (Array.isArray(results) ? results : []).filter((item) => {
    const url = String(item?.url || "");
    const host = safeHostname(url).toLowerCase();
    if (!(host === "reddit.com" || host.endsWith(".reddit.com"))) return false;
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      if (!pathname || pathname === "/") return false;
      if (/^\/r\/(all|popular)(\/|$)/.test(pathname)) return false;
      if (/^\/r\/[^/]+\/(top|hot|new|rising)(\/|$)/.test(pathname)) return false;
      if (normalizedSubreddit) return pathname.startsWith(`/r/${normalizedSubreddit}/comments/`);
      return /^\/r\/[^/]+\/comments\//.test(pathname);
    } catch {
      return false;
    }
  });
  if (normalizedQuery) {
    filtered.sort((a, b) => scoreCjkRedditFallbackResult(b, normalizedQuery) - scoreCjkRedditFallbackResult(a, normalizedQuery));
  }
  return filtered.slice(0, limit);
}
__name(filterRedditFallbackResults, "filterRedditFallbackResults");
__name2(filterRedditFallbackResults, "filterRedditFallbackResults");
async function searchRedditFallback(query, limit, subredditName, providerConfig) {
  const siteQuery = subredditName ? `site:reddit.com/r/${subredditName} ${query}` : `site:reddit.com ${query}`;
  const fallbackLimit = Math.max(limit, 10);
  const fallback = await searchAuto({
    query: siteQuery,
    limit: fallbackLimit,
    engines: ["duckduckgo", "brave", "naver", "bing", "sogou"],
    ...providerConfig ? { _providerConfig: providerConfig } : {}
  });
  const results = filterRedditFallbackResults(fallback?.results, subredditName, limit, query);
  if (!results.length) return null;
  const fallbackAttempt = Array.isArray(fallback?.attempts) ? fallback.attempts.find((item) => item.ok && item.result_count > 0) || fallback.attempts.find((item) => item.result_count > 0) || fallback.attempts[0] : null;
  return searchResult({
    source: "reddit",
    query,
    limit,
    results,
    subreddit: subredditName,
    fetch_path: fallbackAttempt?.engine === "duckduckgo" ? "lite.duckduckgo.com" : fallback?.fetch_path || fallbackAttempt?.engine || "",
    fallback_used: true,
    attempts: Array.isArray(fallback?.attempts) ? fallback.attempts : void 0
  });
}
__name(searchRedditFallback, "searchRedditFallback");
__name2(searchRedditFallback, "searchRedditFallback");
async function searchReddit(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const subreddit = args.subreddit ? `r/${String(args.subreddit).replace(/^r\//, "")}/` : "";
  const subredditName = subreddit ? subreddit.replace(/^r\//, "").replace(/\/$/, "") : "";
  try {
    const data = await fetchJson(`https://www.reddit.com/${subreddit}search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance&raw_json=1`, {
      headers: {
        Accept: "application/json"
      },
      timeoutMs: 15e3
    });
    let results = [];
    for (const child of data.data?.children || []) {
      if (results.length >= limit) break;
      const post = child.data || {};
      const title = post.title || "";
      const url = post.permalink ? `https://reddit.com${post.permalink}` : post.url_overridden_by_dest || post.url || "";
      const score = post.score || 0;
      const sub = post.subreddit || subredditName;
      results.push({ title, url, snippet: `r/${sub} | ${score} pts | ${post.num_comments || 0} comments` });
    }
    if (results.length) return finalizeVerticalSearchResults({ source: "reddit", query, limit, results, subreddit: subredditName, fetch_path: "www.reddit.com" });
    const fallback = await searchRedditFallback(query, limit, subredditName, args?._context?.providerConfig);
    if (fallback) return fallback;
    return searchResult({ source: "reddit", query, limit, results: [], subreddit: subredditName, fetch_path: "www.reddit.com" });
  } catch (e) {
    const fallback = await searchRedditFallback(query, limit, subredditName, args?._context?.providerConfig);
    if (fallback) return fallback;
    return searchError("reddit", query, limit, e, { subreddit: subredditName, fetch_path: "www.reddit.com" });
  }
}
__name(searchReddit, "searchReddit");
__name2(searchReddit, "searchReddit");
async function searchNpm(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`);
    let results = [];
    for (const pkg of data.objects || []) {
      if (results.length >= limit) break;
      const p = pkg.package || {};
      results.push({ title: `${p.name}@${p.version || "?"}`, url: p.links?.npm || `https://www.npmjs.com/package/${p.name}`, snippet: (p.description || "").substring(0, 150) });
    }
    return searchResult({ source: "npm", query, limit, results });
  } catch (e) {
    return searchResult({ source: "npm", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchNpm, "searchNpm");
__name2(searchNpm, "searchNpm");
async function searchDevto(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const words = query.trim().split(/[\s+]+/).filter((w) => w.length > 1);
    const alphaWords = words.filter((w) => /^[a-z0-9]+$/i.test(w));
    const compoundTag = alphaWords.join("").toLowerCase();
    const singleTag = alphaWords.length > 0 ? alphaWords[0].toLowerCase() : "";
    let data = [];
    if (compoundTag) {
      try { data = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&tag=${encodeURIComponent(compoundTag)}`); } catch (e) { data = []; }
    }
    if ((!Array.isArray(data) || data.length === 0) && singleTag && singleTag !== compoundTag) {
      try { data = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&tag=${encodeURIComponent(singleTag)}`); } catch (e) { data = []; }
    }
    if (!Array.isArray(data) || data.length === 0) {
      data = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&q=${encodeURIComponent(query)}`);
    }
    let results = [];
    for (const article of Array.isArray(data) ? data : []) {
      if (results.length >= limit) break;
      results.push({ title: article.title || "", url: article.url || "", snippet: `${article.description || ""} | reactions: ${article.positive_reactions_count || 0} | comments: ${article.comments_count || 0}` });
    }
    return finalizeVerticalSearchResults({ source: "devto", query, limit, results });
  } catch (e) {
    return searchError("devto", query, limit, e);
  }
}
__name(searchDevto, "searchDevto");
__name2(searchDevto, "searchDevto");
__name2(searchDevto, "searchDevto");
async function searchMastodon(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const instance = /^[a-z0-9.-]+$/.test(args.instance || "") ? args.instance : "mastodon.social";
  try {
    let data;
    try {
      data = await fetchJson(`https://${instance}/api/v2/search?q=${encodeURIComponent(query)}&type=statuses&limit=${limit}`);
    } catch {
      data = { statuses: [] };
    }
    let results = [];
    for (const status of data.statuses || []) {
      if (results.length >= limit) break;
      const content = (status.content || "").replace(/<[^>]+>/g, "").trim().substring(0, 200);
      const author = status.account?.acct || "";
      results.push({ title: `@${author}: ${content.substring(0, 60)}`, url: status.url || "", snippet: content });
    }
    if (!results.length) {
      try {
        const tag = query.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 30);
        const tagData = await fetchJson(`https://${instance}/api/v1/timelines/tag/${tag}?limit=${limit}`);
        for (const status of tagData) {
          if (results.length >= limit) break;
          const content = (status.content || "").replace(/<[^>]+>/g, "").trim().substring(0, 200);
          const author = status.account?.acct || "";
          results.push({ title: `@${author}: ${content.substring(0, 60)}`, url: status.url || "", snippet: content });
        }
      } catch {
      }
    }
    return finalizeVerticalSearchResults({ source: "mastodon", query, limit, results });
  } catch (e) {
    return searchResult({ source: "mastodon", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchMastodon, "searchMastodon");
__name2(searchMastodon, "searchMastodon");
async function searchPeerTube(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://search.joinpeertube.org/api/v1/search/videos?search=${encodeURIComponent(query)}&count=${limit}`);
    let results = [];
    for (const vid of data.data || []) {
      if (results.length >= limit) break;
      results.push({ title: vid.name || "", url: vid.url || "", snippet: `by ${vid.channel?.displayName || "?"} | ${vid.views || 0} views | ${vid.durationLabel || ""}` });
    }
    return finalizeVerticalSearchResults({ source: "peertube", query, limit, results });
  } catch (e) {
    return searchResult({ source: "peertube", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchPeerTube, "searchPeerTube");
__name2(searchPeerTube, "searchPeerTube");
async function searchBbc(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    let results = [];
    const { text: html2 } = await fetchTextWithResponse(`https://www.bbc.co.uk/search?q=${encodeURIComponent(query)}`);
    const seen = /* @__PURE__ */ new Set();
    const re = /<a[^>]+href=["'](https:\/\/www\.bbc\.(?:com|co\.uk)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const candidateLimit = Math.max(limit * 12, 40);
    const anchorScanLimit = Math.max(limit * 40, 120);
    let scannedAnchors = 0;
    for (const match of html2.matchAll(re)) {
      scannedAnchors++;
      if (scannedAnchors > anchorScanLimit) break;
      const url = match[1];
      const title = cleanText(match[2]);
      const candidate = { title, url, snippet: "" };
      if (isNoiseUrl(url) || seen.has(url) || !title || title.length < 4 || isIntentMismatchResult(candidate, query, "bbc")) continue;
      seen.add(url);
      if (results.length < candidateLimit) results.push(candidate);
    }
    if (!results.length) {
      results = extractGenericLinks(html2, candidateLimit, "https://www.bbc.co.uk").filter((r) => r.url.includes("bbc.") && !isIntentMismatchResult(r, query, "bbc")).slice(0, candidateLimit);
    }
    return finalizeVerticalSearchResults({ source: "bbc", query, limit, results });
  } catch (e) {
    return searchResult({ source: "bbc", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchBbc, "searchBbc");
__name2(searchBbc, "searchBbc");
async function searchBingNews(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const { text } = await fetchTextWithResponse(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`);
    let results = [];
    const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
      if (results.length >= limit) break;
      const title = (item.match(/<title><!\[CDATA\[([^\]]*)\]\]><\/title>/) || item.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
      const url = (item.match(/<link><!\[CDATA\[([^\]]*)\]\]><\/link>/) || item.match(/<link>([^<]+)<\/link>/) || [])[1] || "";
      const normalized = { title: cleanText(title), url: unwrapBingNewsUrl(url), snippet: "" };
      if (normalized.title && normalized.url) results.push(normalized);
    }
    if (!results.length) {
      const { text: html } = await fetchTextWithResponse(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}`);
      results = extractGenericLinks(html, limit * 4, "https://www.bing.com").map((r) => ({ ...r, url: unwrapBingNewsUrl(r.url) })).filter((r) => r.url).slice(0, limit * 4);
    }
    return finalizeVerticalSearchResults({ source: "bing_news", query, limit, results });
  } catch (e) {
    return searchResult({ source: "bing_news", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchBingNews, "searchBingNews");
__name2(searchBingNews, "searchBingNews");
function extractSinaNewsApiResults(payload, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of payload?.data?.list || []) {
    if (results.length >= limit) break;
    const title = cleanText(item?.title || "");
    const url = String(item?.url || "").trim();
    if (!title || title.length < 2 || !/^https?:\/\//i.test(url) || seen.has(url) || isNoiseUrl(url)) continue;
    seen.add(url);
    const snippet = cleanText(item?.searchSummary || item?.summary || item?.content || "");
    results.push({ title, url, snippet });
  }
  return results;
}
__name(extractSinaNewsApiResults, "extractSinaNewsApiResults");
__name2(extractSinaNewsApiResults, "extractSinaNewsApiResults");
function extract163SearchResults(html, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const section = extractSectionAroundMarker(html, ["keyword_list", "keyword_new"], 5e4) || html;
  const blockRe = /<div[^>]+class="[^"]*keyword_new[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>?/gi;
  for (const match of section.matchAll(blockRe)) {
    if (results.length >= limit) break;
    const block = match[1];
    const anchor = /<h3[^>]*>[\s\S]*?<a[^>]+href=("([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!anchor) continue;
    const url = decodeHtml(anchor[2] || anchor[3] || "").trim();
    const title = cleanText(anchor[4]);
    if (!title || title.length < 2 || !/^https?:\/\//i.test(url) || seen.has(url) || isNoiseUrl(url)) continue;
    seen.add(url);
    const sourceMatch = /<div[^>]+class="[^"]*keyword_source[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const timeMatch = /<div[^>]+class="[^"]*keyword_time[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const snippet = [cleanText(sourceMatch?.[1] || ""), cleanText(timeMatch?.[1] || "")].filter(Boolean).join(" | ");
    results.push({ title, url, snippet });
  }
  if (results.length) return results;
  return extractGenericLinks(section, Math.max(limit * 6, 12), "https://www.163.com").filter((item) => {
    const host = safeHostname(item.url);
    return host === "www.163.com" || host === "163.com" || host === "dy.163.com";
  });
}
__name(extract163SearchResults, "extract163SearchResults");
__name2(extract163SearchResults, "extract163SearchResults");
async function searchSinaNews(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://search.sina.com.cn/api/news?q=${encodeURIComponent(query)}`);
    const results = extractSinaNewsApiResults(data, Math.max(limit * 6, 12));
    if (results.length) {
      return finalizeVerticalSearchResults({ source: "sina_news", query, limit, results });
    }
  } catch {
  }
  return searchSiteTargetVertical(args, { source: "sina_news", host: "sina.com.cn" });
}
__name(searchSinaNews, "searchSinaNews");
__name2(searchSinaNews, "searchSinaNews");
async function search163News(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const { text: html } = await fetchTextWithResponse(`https://www.163.com/search?keyword=${encodeURIComponent(query)}`);
    const results = extract163SearchResults(html, Math.max(limit * 6, 12));
    if (results.length) {
      return finalizeVerticalSearchResults({ source: "163_news", query, limit, results });
    }
  } catch {
  }
  return searchSiteTargetVertical(args, { source: "163_news", host: "163.com" });
}
__name(search163News, "search163News");
__name2(search163News, "search163News");
function unwrapBingNewsUrl(url) {
  const value = decodeHtml(String(url || "")).trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!/(^|\.)bing\.com$/i.test(parsed.hostname)) return parsed.toString();
    for (const key of ["url", "u", "target", "r"]) {
      const candidate = parsed.searchParams.get(key);
      if (!candidate) continue;
      const decoded = decodeURIComponent(candidate);
      if (/^https?:\/\//i.test(decoded)) return decoded;
      if (/^https?:\/\//i.test(candidate)) return candidate;
    }
    return parsed.toString();
  } catch {
    return value;
  }
}
__name(unwrapBingNewsUrl, "unwrapBingNewsUrl");
__name2(unwrapBingNewsUrl, "unwrapBingNewsUrl");
async function searchPapersWithCode(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  let results = [];
  try {
    const resp = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,abstract`);
    if (resp.ok) {
      const data = await resp.json();
      for (const paper of data.data || []) {
        if (results.length >= limit) break;
        const authors = (paper.authors || []).map((a) => a.name || "").join(", ");
        const year = paper.year || "";
        results.push({ title: paper.title || "", url: `https://www.semanticscholar.org/paper/${paper.paperId || ""}`, snippet: `${authors}${year ? " (" + year + ")" : ""}` });
      }
    }
  } catch {
  }
  if (!results.length) {
    try {
      const data = await fetchJson(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`);
      for (const item of data.message?.items || []) {
        if (results.length >= limit) break;
        const title = (item.title || [""])[0];
        const author = (item.author || []).map((a) => `${a.given || ""} ${a.family || ""}`.trim()).join(", ");
        const year = (item.published?.["date-parts"] || [[null]])[0][0] || "";
        const doi = item.DOI || "";
        const url = doi ? `https://doi.org/${doi}` : item.URL || "";
        results.push({ title, url, snippet: `${author}${year ? " (" + year + ")" : ""}` });
      }
    } catch {
    }
  }
  return searchResult({ source: "paperswithcode", query, limit, results });
}
__name(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
__name2(searchPapersWithCode, "searchPapersWithCode");
async function searchSecEdgar(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const formType = args.form_type ? `&forms=${encodeURIComponent(String(args.form_type))}` : "";
  try {
    const { text } = await fetchTextWithResponse(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}${formType}`);
    let results = [];
    try {
      const data = JSON.parse(text);
      const hits = data?.hits?.hits || [];
      for (const hit of hits) {
        if (results.length >= limit) break;
        const source = hit._source || {};
        const entity = source.entity_name || source.display_names?.[0] || "";
        const form = source.form_type || source.form || "";
        const filed = source.filed_at || source.file_date || source.date || "";
        const cik = String(source.ciks?.[0] || source.cik || "").replace(/^0+/, "");
        const accession = String(source.adsh || source.accession_number || source.file_id || source._id || "").trim();
        const accessionCompact = accession.replace(/-/g, "");
        const canonicalUrl = cik && accession && accessionCompact ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/${accession}-index.htm` : "";
        const fallbackUrl = entity ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(entity)}${form ? `&type=${encodeURIComponent(form)}` : ""}` : "";
        const url = source.link || source.url || canonicalUrl || fallbackUrl;
        const titleParts = [entity, form].filter(Boolean);
        const title = titleParts.length ? titleParts.join(" ") : accession || query;
        const filedText = filed ? filed.substring(0, 10) : "";
        results.push({ title, url, snippet: filedText ? `Filed: ${filedText}` : "" });
      }
    } catch {
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://www.sec.gov");
    return finalizeVerticalSearchResults({ source: "sec_edgar", query, limit, results });
  } catch (e) {
    return searchResult({ source: "sec_edgar", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchSecEdgar, "searchSecEdgar");
__name2(searchSecEdgar, "searchSecEdgar");
async function searchOsm(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=${limit}&addressdetails=1`, {
      headers: {
        "Accept-Language": "en",
        Referer: "https://search-mcp.qdp.qzz.io/"
      }
    });
    let results = [];
    for (const place of Array.isArray(data) ? data : []) {
      if (results.length >= limit) break;
      const name = place.display_name || "";
      const type = place.type || place.class || "";
      const lat = place.lat || "";
      const lon = place.lon || "";
      results.push({ title: name, url: lat && lon ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}` : "https://www.openstreetmap.org", snippet: `Type: ${type} | ${lat}, ${lon}` });
    }
    return finalizeVerticalSearchResults({ source: "osm", query, limit, results, fetch_path: "nominatim.openstreetmap.org" });
  } catch (e) {
    return searchError("osm", query, limit, e, { fetch_path: "nominatim.openstreetmap.org" });
  }
}
__name(searchOsm, "searchOsm");
__name2(searchOsm, "searchOsm");
async function searchLemmy(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const instances = /^[a-z0-9.-]+$/.test(args.instance || "") ? [args.instance] : ["lemmy.world", "lemmy.ml", "programming.dev"];
  const q = query.toLowerCase();
  const communityHints = ["linux_gaming", "linux", "docker", "programming", "rust", "selfhosted", "technology", "opensource"];
  const matchedCommunity = communityHints.find((c) => q.includes(c.replace(/_/g, " ")) || q.includes(c));
  let allResults = [];
  if (matchedCommunity) {
    try {
      const data = await fetchJson(`https://lemmy.world/api/v3/post/list?community_name=${encodeURIComponent(matchedCommunity)}&limit=${limit}`);
      allResults.push(...(data.posts || []).map((post) => {
        const p = post.post || {};
        return { title: p.name || "", url: p.ap_id || p.url || "", snippet: `!${post.community?.name || matchedCommunity}@lemmy.world | ${post.counts?.score || 0} pts | ${post.counts?.comments || 0} comments` };
      }));
    } catch (e) {}
  }
  const settled = await Promise.allSettled(instances.map(async (inst) => {
    const data = await fetchJson(`https://${inst}/api/v3/search?q=${encodeURIComponent(query)}&limit=${limit}&type_=Posts&sort=New`);
    return (data.posts || []).map((post) => {
      const p = post.post || {};
      return { title: p.name || "", url: p.ap_id || p.url || "", snippet: `!${post.community?.name || ""}@${inst} | ${post.counts?.score || 0} pts | ${post.counts?.comments || 0} comments` };
    });
  }));
  for (const r of settled) {
    if (r.status === "fulfilled") allResults.push(...r.value);
  }
  allResults = allResults.slice(0, limit * 2);
  return searchResult({ source: "lemmy", query, limit, results: allResults });
}
__name(searchLemmy, "searchLemmy");
__name2(searchLemmy, "searchLemmy");
async function searchWikidata(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=${limit}&origin=*`);
    let results = [];
    for (const item of data.search || []) {
      if (results.length >= limit) break;
      const label = item.label || "";
      const desc = item.description || "";
      const id = item.id || "";
      results.push({ title: `${label} (${id})`, url: `https://www.wikidata.org/wiki/${id}`, snippet: desc });
    }
    return searchResult({ source: "wikidata", query, limit, results, fetch_path: "www.wikidata.org" });
  } catch (e) {
    return searchError("wikidata", query, limit, e, { fetch_path: "www.wikidata.org" });
  }
}
__name(searchWikidata, "searchWikidata");
__name2(searchWikidata, "searchWikidata");
async function searchCrates(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${limit}`);
    let results = [];
    for (const crate of data.crates || []) {
      if (results.length >= limit) break;
      results.push({ title: `${crate.name}@${crate.max_version || "?"}`, url: `https://crates.io/crates/${crate.name}`, snippet: `${crate.description || ""} | ${crate.downloads || 0} downloads` });
    }
    return searchResult({ source: "crates", query, limit, results });
  } catch (e) {
    return searchResult({ source: "crates", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchCrates, "searchCrates");
__name2(searchCrates, "searchCrates");
async function searchPypi(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const { text, response } = await fetchTextWithResponse(`https://pypi.org/search/?q=${encodeURIComponent(query)}`);
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    const baseUrl = response.url || "https://pypi.org/";
    const pattern = /<a[^>]+class="[^"]*package-snippet[^"]*"[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]+class="[^"]*package-snippet__name[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]+class="[^"]*package-snippet__version[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?(?:<p[^>]+class="[^"]*package-snippet__description[^"]*"[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/a>/gi;
    for (const match of text.matchAll(pattern)) {
      if (results.length >= limit) break;
      const href = new URL(decodeHtml(match[1]), baseUrl).toString();
      if (seen.has(href)) continue;
      seen.add(href);
      const name = cleanText(match[2]);
      const version = cleanText(match[3]);
      if (!name) continue;
      results.push({
        title: version ? `${name}@${version}` : name,
        url: href,
        snippet: cleanText(match[4] || "")
      });
    }
    if (results.length) return searchResult({ source: "pypi", query, limit, results, fetch_path: safeHostname(response.url) || "pypi.org" });
    if (/\s/.test(query)) {
      return searchResult({ source: "pypi", query, limit, results: [], error: "No PyPI package matched the query.", fetch_path: safeHostname(response.url) || "pypi.org" });
    }
  } catch {
  }
  try {
    const data = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(query)}/json`);
    const info = data?.info || {};
    if (!info.name) {
      return searchResult({ source: "pypi", query, limit, results: [], error: "No PyPI package matched the query." });
    }
    return searchResult({ source: "pypi", query, limit, results: [{ title: `${info.name}@${info.version}`, url: info.project_url || `https://pypi.org/project/${info.name}/`, snippet: info.summary || "" }] });
  } catch (e) {
    return searchError("pypi", query, limit, e);
  }
}
__name(searchPypi, "searchPypi");
__name2(searchPypi, "searchPypi");
__name2(searchPypi, "searchPypi");
async function findRss(args) {
  const url = requireString(args.url, "url");
  try {
    const { text } = await fetchTextWithResponse(url);
    const feeds = [];
    const rssRe = /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    for (const match of text.matchAll(rssRe)) {
      feeds.push({ title: match[1], url: new URL(match[1], url).href, snippet: "RSS/Atom feed" });
    }
    const altRe = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    for (const match of text.matchAll(altRe)) {
      const feedUrl = new URL(match[1], url).href;
      if (!feeds.some((f) => f.url === feedUrl)) {
        feeds.push({ title: feedUrl, url: feedUrl, snippet: "RSS/Atom feed" });
      }
    }
    return searchResult({ source: "rss_finder", query: url, limit: feeds.length, results: feeds });
  } catch (e) {
    return searchResult({ source: "rss_finder", query: url, limit: 0, results: [], error: e?.message || "failed" });
  }
}
__name(findRss, "findRss");
__name2(findRss, "findRss");

// ── New independent search engines ──────────────────────
async function searchMojeek(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  try {
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    }, { retries: 1, retryDelay: 300 });
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    const diagnosis = diagnoseSearchHtml("mojeek", text, response.url);
    if (diagnosis.blocked) return searchResult({ source: "mojeek", query, limit, results: [], blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath });
    let results = [];
    const liRe = /<li\s+class="r(\d+)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(text)) !== null && results.length < limit) {
      const block = liMatch[2];
      const hrefMatch = block.match(/<a[^>]+class="title"[^>]+href="(https?:\/\/[^"]+)"/i) || block.match(/<a[^>]+class="ob"[^>]+href="(https?:\/\/[^"]+)"/i);
      const titleMatch = block.match(/<a[^>]+class="title"[^>]+>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<p\s+class="s"[^>]*>([\s\S]*?)<\/p>/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      if (isNoiseUrl(href)) continue;
      results.push({ title: cleanText(titleMatch ? titleMatch[1] : ""), url: href, snippet: cleanText(snippetMatch ? snippetMatch[1] : "") });
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://www.mojeek.com");
    return finalizeVerticalSearchResults({ source: "mojeek", query, limit, results, fetch_path: fetchPath });
  } catch (e) {
    return searchError("mojeek", query, limit, e, { fetch_path: "www.mojeek.com" });
  }
}
__name(searchMojeek, "searchMojeek");
__name2(searchMojeek, "searchMojeek");

async function searchStartpage(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}`;
  try {
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "DNT": "1"
    });
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    const diagnosis = diagnoseSearchHtml("startpage", text, response.url);
    if (diagnosis.blocked) return searchResult({ source: "startpage", query, limit, results: [], blocked: true, block_reason: diagnosis.reason || "", fetch_path: fetchPath });
    let results = [];
    const urlRe = /<a[^>]+class="[^"]*result-link[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = urlRe.exec(text)) !== null && results.length < limit) {
      if (isNoiseUrl(m[1])) continue;
      results.push({ title: cleanText(m[2]), url: m[1], snippet: "" });
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://www.startpage.com");
    return finalizeVerticalSearchResults({ source: "startpage", query, limit, results, fetch_path: fetchPath });
  } catch (e) {
    return searchError("startpage", query, limit, e, { fetch_path: "www.startpage.com" });
  }
}
__name(searchStartpage, "searchStartpage");
__name2(searchStartpage, "searchStartpage");

async function searchSearchmysite(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://searchmysite.net/search/?q=${encodeURIComponent(query)}`;
  try {
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    });
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    let results = extractGenericLinks(text, limit * 3, "https://searchmysite.net");
    results = results.filter((r) => !/searchmysite\.net|^\/search|^\/add|^\/manage|^\/browse/i.test(r.url)).slice(0, limit);
    return finalizeVerticalSearchResults({ source: "searchmysite", query, limit, results, fetch_path: fetchPath });
  } catch (e) {
    return searchError("searchmysite", query, limit, e, { fetch_path: "searchmysite.net" });
  }
}
__name(searchSearchmysite, "searchSearchmysite");
__name2(searchSearchmysite, "searchSearchmysite");

// ── Marginalia — indie/non-commercial web search ──────────
// Uses the official JSON API (api.marginalia.nu) with HTML fallback.
async function searchMarginalia(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    // Primary: JSON API — fast, structured, no rate-limit issues
    const apiUrl = `https://api.marginalia.nu/public/search/${encodeURIComponent(query)}?count=${limit}`;
    const resp = await fetch(apiUrl, {
      headers: { "User-Agent": "search-mcp-worker/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    if (resp.ok) {
      const data = await resp.json();
      const items = (data?.results || []).slice(0, limit).map((r) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: cleanText(r.description || "").substring(0, 300)
      }));
      if (items.length) return finalizeVerticalSearchResults({ source: "marginalia", query, limit, results: items, fetch_path: "api.marginalia.nu" });
    }
  } catch { /* API failed, fall through to HTML */ }
  // Fallback: HTML scraping
  try {
    const url = `https://search.marginalia.nu/search?query=${encodeURIComponent(query)}`;
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    });
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    let results = extractGenericLinks(text, limit * 2, "https://search.marginalia.nu");
    results = results.filter((r) => !/marginalia\.nu|marginalia-search\.com|search\.marginalia|old-search/i.test(r.url)).slice(0, limit);
    return finalizeVerticalSearchResults({ source: "marginalia", query, limit, results, fetch_path: fetchPath });
  } catch (e) {
    return searchError("marginalia", query, limit, e, { fetch_path: "search.marginalia.nu" });
  }
}
__name(searchMarginalia, "searchMarginalia");
__name2(searchMarginalia, "searchMarginalia");

// ── Wiby — indie/personal web search engine ────────────────
async function searchWiby(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const url = `https://wiby.me/?q=${encodeURIComponent(query)}`;
  try {
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    });
    const fetchPath = safeHostname(response.url) || safeHostname(url);
    let results = extractGenericLinks(text, limit * 2, "https://wiby.me");
    results = results
      .filter((r) => !/[?&]q=|wiby\.me|settings|javascript:/i.test(r.url))
      .slice(0, limit);
    return finalizeVerticalSearchResults({ source: "wiby", query, limit, results, fetch_path: fetchPath });
  } catch (e) {
    return searchError("wiby", query, limit, e, { fetch_path: "wiby.me" });
  }
}
__name(searchWiby, "searchWiby");
__name2(searchWiby, "searchWiby");

// ── Reddit search via startpage proxy ──────────────────────
// Reddit blocks all CF Worker IPs (403 / "blocked by network security").
// Strategy: search startpage with "reddit" keyword, filter to reddit.com URLs.
// Startpage returns Google-quality results and reliably surfaces reddit discussions.
async function searchRedditRss(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const redditQuery = `reddit ${query}`;
  const url = `https://www.startpage.com/sp/search?query=${encodeURIComponent(redditQuery)}`;
  try {
    const { text, response } = await fetchWithUA(url, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "DNT": "1"
    });
    // Parse startpage results
    let allResults = [];
    const urlRe = /<a[^>]+class="[^"]*result-link[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = urlRe.exec(text)) !== null && allResults.length < limit * 5) {
      allResults.push({ title: cleanText(m[2]), url: m[1], snippet: "" });
    }
    if (!allResults.length) allResults = extractGenericLinks(text, limit * 5, "https://www.startpage.com");
    // Filter to only reddit.com/r/ discussion URLs
    let results = allResults
      .filter((r) => /reddit\.com\/r\//i.test(r.url))
      .map((r) => {
        const subMatch = r.url.match(/reddit\.com\/(r\/[^\/]+)/i);
        const snippet = r.snippet || `${subMatch ? subMatch[1] : "reddit.com"}`;
        return {
          title: r.title || "",
          url: r.url,
          snippet: snippet.substring(0, 300),
          subreddit: subMatch ? subMatch[1] : void 0
        };
      })
      .slice(0, limit);
    return finalizeVerticalSearchResults({
      source: "reddit_rss",
      query,
      limit,
      results,
      fetch_path: "reddit via startpage proxy",
      proxied_via: "startpage"
    });
  } catch (e) {
    return searchError("reddit_rss", query, limit, e, { fetch_path: "startpage.com (reddit proxy)" });
  }
}
__name(searchRedditRss, "searchRedditRss");
__name2(searchRedditRss, "searchRedditRss");

async function searchWiktionary(args) {
  const query = requireString(args.query, "query");
  const lang = /^[a-z]{2,12}$/i.test(args.language || "") ? String(args.language).toLowerCase() : "en";
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://${lang}.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`);
    let results = [];
    for (const item of data.query?.search || []) {
      if (results.length >= limit) break;
      const title = item.title || query;
      const snippet = cleanText(item.snippet || "").substring(0, 200);
      results.push({ title, url: `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(title)}`, snippet });
    }
    return searchResult({ source: "wiktionary", query, limit, results, language: lang, fetch_path: `${lang}.wiktionary.org` });
  } catch (e) {
    return searchError("wiktionary", query, limit, e, { language: lang, fetch_path: `${lang}.wiktionary.org` });
  }
}
__name(searchWiktionary, "searchWiktionary");
__name2(searchWiktionary, "searchWiktionary");
async function searchOpenLibrary(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`);
    let results = [];
    for (const doc of data.docs || []) {
      if (results.length >= limit) break;
      const title = doc.title || "";
      const author = (doc.author_name || []).join(", ");
      const year = doc.first_publish_year || "";
      const olid = (doc.edition_key || [])[0] || doc.key || "";
      const url = olid.startsWith("/works/") ? `https://openlibrary.org${olid}` : olid ? `https://openlibrary.org/books/${olid}` : `https://openlibrary.org/search?q=${encodeURIComponent(title || query)}`;
      results.push({ title, url, snippet: `${author}${year ? " (" + year + ")" : ""}` });
    }
    const queryTokens = query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 3);
    if (queryTokens.length >= 2 && results.length) {
      const normalizedQuery = query.toLowerCase();
      const ranked = results.map((item, index) => {
        const title = String(item.title || "").toLowerCase();
        const snippet = String(item.snippet || "").toLowerCase();
        const titleHasExactPhrase = title.includes(normalizedQuery);
        const snippetHasExactPhrase = snippet.includes(normalizedQuery);
        const titleTokenMatches = queryTokens.filter((token) => title.includes(token)).length;
        const snippetTokenMatches = queryTokens.filter((token) => snippet.includes(token)).length;
        const strongMatch = titleHasExactPhrase || snippetHasExactPhrase || titleTokenMatches === queryTokens.length && queryTokens.length >= 3;
        return {
          item,
          index,
          strongMatch,
          titleHasExactPhrase,
          snippetHasExactPhrase,
          titleTokenMatches,
          snippetTokenMatches
        };
      }).filter((entry) => entry.strongMatch).sort((a, b) => Number(b.titleHasExactPhrase) - Number(a.titleHasExactPhrase) || Number(b.snippetHasExactPhrase) - Number(a.snippetHasExactPhrase) || b.titleTokenMatches - a.titleTokenMatches || b.snippetTokenMatches - a.snippetTokenMatches || a.index - b.index);
      if (!ranked.length) {
        return searchResult({ source: "openlibrary", query, limit, results: [], error: "No OpenLibrary result matched the query.", fetch_path: "openlibrary.org" });
      }
      results = ranked.map((entry) => entry.item).slice(0, limit);
    }
    return searchResult({ source: "openlibrary", query, limit, results, fetch_path: "openlibrary.org" });
  } catch (e) {
    return searchError("openlibrary", query, limit, e, { fetch_path: "openlibrary.org" });
  }
}
__name(searchOpenLibrary, "searchOpenLibrary");
__name2(searchOpenLibrary, "searchOpenLibrary");
async function searchMusicbrainz(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`, {
      headers: {
        Accept: "application/json"
      },
      timeoutMs: 15e3
    });
    let results = [];
    for (const rec of data.recordings || []) {
      if (results.length >= limit) break;
      const title = rec.title || "";
      const artist = (rec["artist-credit"] || []).map((a) => a.name || a.artist?.name || "").filter(Boolean).join(", ");
      const album = (rec.releases || [])[0]?.title || "";
      results.push({ title, url: `https://musicbrainz.org/recording/${rec.id}`, snippet: `${artist}${album ? " - " + album : ""}` });
    }
    return searchResult({ source: "musicbrainz", query, limit, results, fetch_path: "musicbrainz.org" });
  } catch (e) {
    return searchError("musicbrainz", query, limit, e, { fetch_path: "musicbrainz.org" });
  }
}
__name(searchMusicbrainz, "searchMusicbrainz");
__name2(searchMusicbrainz, "searchMusicbrainz");
async function instantAnswer(args) {
  const query = requireString(args.query, "query");
  try {
    const data = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      headers: {
        Accept: "application/json"
      }
    });
    const abstract = data.Abstract || data.AbstractText || "";
    const answer = data.Answer || "";
    const definition = data.Definition || "";
    const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    const flattenedTopics = relatedTopics.flatMap((item) => Array.isArray(item?.Topics) ? item.Topics : [item]);
    const topicText = flattenedTopics.map((item) => item?.Text || "").find(Boolean) || "";
    const firstRelatedUrl = flattenedTopics.map((item) => item?.FirstURL || "").find(Boolean) || "";
    const text = abstract || answer || definition || topicText;
    const url = data.AbstractURL || data.DefinitionURL || firstRelatedUrl || data.Redirect || "";
    const source = data.AbstractSource || data.DefinitionSource || "DuckDuckGo";
    if (text) {
      return searchResult({ source: "ddg_instant", query, limit: 1, results: [{ title: data.Heading || query, url, snippet: `${text.substring(0, 300)}${source ? " (Source: " + source + ")" : ""}` }], fetch_path: "api.duckduckgo.com" });
    }

    const fallback = await searchDuckDuckGo({ query, limit: 1 });
    if (Array.isArray(fallback?.results) && fallback.results.length) {
      return searchResult({ source: "ddg_instant", query, limit: 1, results: [fallback.results[0]], fetch_path: "api.duckduckgo.com", fallback_used: true });
    }

    const redirectResponse = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,*/*"
      },
      redirect: "manual"
    });
    const redirectUrl = redirectResponse.headers.get("location") || "";
    if (redirectResponse.status >= 300 && redirectResponse.status < 400 && /^https?:\/\//i.test(redirectUrl)) {
      return searchResult({
        source: "ddg_instant",
        query,
        limit: 1,
        results: [{ title: query, url: redirectUrl, snippet: "" }],
        fetch_path: "api.duckduckgo.com",
        fallback_used: true
      });
    }

    return searchResult({ source: "ddg_instant", query, limit: 1, results: [], fetch_path: "api.duckduckgo.com", error: "No instant answer found." });
  } catch (e) {
    return searchError("ddg_instant", query, 1, e, { fetch_path: "api.duckduckgo.com" });
  }
}
__name(instantAnswer, "instantAnswer");
__name2(instantAnswer, "instantAnswer");
async function searchCrossref(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const data = await fetchJson(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`);
    let results = [];
    for (const item of data.message?.items || []) {
      if (results.length >= limit) break;
      const title = (item.title || [""])[0];
      const author = (item.author || []).map((a) => `${a.given || ""} ${a.family || ""}`.trim()).join(", ");
      const year = (item.published?.["date-parts"] || [[null]])[0][0] || "";
      const doi = item.DOI || "";
      results.push({ title, url: doi ? `https://doi.org/${doi}` : "", snippet: `${author}${year ? " (" + year + ")" : ""}${doi ? " DOI: " + doi : ""}` });
    }
    return searchResult({ source: "crossref", query, limit, results });
  } catch (e) {
    return searchError("crossref", query, limit, e);
  }
}
__name(searchCrossref, "searchCrossref");
__name2(searchCrossref, "searchCrossref");
async function searchWikipedia(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const language = /^[a-z-]{2,12}$/i.test(args.language || "") ? args.language : "en";
  const api = `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`;
  try {
    const data = await fetchJson(api);
    const results = (data?.query?.search || []).slice(0, limit * 4).map((item) => ({
      title: item.title,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(" ", "_"))}`,
      snippet: cleanText(item.snippet || "")
    }));
    return finalizeVerticalSearchResults({ source: "wikipedia", query, limit, results, language });
  } catch {
    try {
      const html = await fetchText(`https://${language}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`);
      return finalizeVerticalSearchResults({ source: "wikipedia", query, limit, results: extractGenericLinks(html, limit * 4, `https://${language}.wikipedia.org`), language });
    } catch (e) {
      return searchError("wikipedia", query, limit, e, { language, fetch_path: `${language}.wikipedia.org` });
    }
  }
}
__name(searchWikipedia, "searchWikipedia");
__name2(searchWikipedia, "searchWikipedia");
async function searchGitHubRepos(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const candidateLimit = Math.min(Math.max(limit * 8, 20), 50);
    const data = await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${candidateLimit}`);
    const normalizedQuery = query.trim().toLowerCase();
    const queryTokens = normalizedQuery.split(/[^a-z0-9]+/i).filter(Boolean);
    const rankedItems = (data.items || []).map((repo, index) => {
      const fullName = String(repo.full_name || "");
      const fullNameLower = fullName.toLowerCase();
      const nameLower = String(repo.name || fullName.split("/").pop() || "").toLowerCase();
      const descriptionLower = String(repo.description || "").toLowerCase();
      const stars = Number(repo.stargazers_count || 0);
      let score = 0;
      let nameTokenMatches = 0;
      let fullNameTokenMatches = 0;
      let descriptionTokenMatches = 0;
      if (normalizedQuery && fullNameLower === normalizedQuery) score += 1e6;
      else if (normalizedQuery && nameLower === normalizedQuery) score += 9e5;
      else if (normalizedQuery && fullNameLower.endsWith(`/${normalizedQuery}`)) score += 8e5;
      if (normalizedQuery && nameLower.includes(normalizedQuery)) score += 3e5;
      if (normalizedQuery && fullNameLower.includes(normalizedQuery)) score += 2e5;
      if (normalizedQuery && descriptionLower.includes(normalizedQuery)) score += 2e4;
      for (const token of queryTokens) {
        if (nameLower.includes(token)) nameTokenMatches += 1;
        if (fullNameLower.includes(token)) fullNameTokenMatches += 1;
        if (descriptionLower.includes(token)) descriptionTokenMatches += 1;
      }
      score += nameTokenMatches * 25e3;
      score += fullNameTokenMatches * 8e3;
      score += descriptionTokenMatches * 1e3;
      if (queryTokens.length >= 2) {
        if (nameTokenMatches === queryTokens.length) score += 18e4;
        if (fullNameTokenMatches === queryTokens.length) score += 12e4;
        if (descriptionTokenMatches === queryTokens.length) score += 12e3;
      }
      score += Math.log10(stars + 1) * 5e3;
      return { repo, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    const results = rankedItems.slice(0, limit).map(({ repo }) => ({
      title: `${repo.full_name} \u2605${repo.stargazers_count || 0}`,
      url: repo.html_url,
      snippet: repo.description || ""
    }));
    return searchResult({ source: "github", query, limit, results, total_count: data.total_count || 0 });
  } catch (e) {
    return searchError("github", query, limit, e, { fetch_path: "api.github.com" });
  }
}
__name(searchGitHubRepos, "searchGitHubRepos");
__name2(searchGitHubRepos, "searchGitHubRepos");
async function fetchGitHubFile(args) {
  const owner = requireSlug(args.owner, "owner");
  const repo = requireSlug(args.repo, "repo");
  const path = requireString(args.path, "path").replace(/^\/+/, "");
  const ref = args.ref ? requireString(args.ref, "ref") : "main";
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 2e4, 1e3), 5e4);
  const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodedRef}/${encodedPath}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;
  const maxBytes = Math.min(MAX_FETCH_BYTES, maxChars * 4);

  // Strategy 1: raw.githubusercontent.com (fast, no rate limit header)
  let rawError = null;
  try {
    const text = await fetchText(rawUrl, { maxBytes, retries: 1, retryDelay: 200 });
    if (text && text.length > 0) {
      return {
        owner, repo, path, ref,
        url: rawUrl,
        source: "raw",
        content: text.slice(0, maxChars),
        truncated: text.length > maxChars,
        maxChars
      };
    }
  } catch (e) {
    rawError = String(e?.message || e || "raw fetch failed");
  }

  // Strategy 2: GitHub REST Contents API (base64-encoded, more reliable on CF edge)
  try {
    const headers = { "User-Agent": "search-mcp-worker", "Accept": "application/vnd.github.v3+json" };
    const { text, response } = await fetchTextWithResponse(apiUrl, { maxBytes: Math.min(MAX_FETCH_BYTES, maxChars * 6), headers });
    if (response.status === 200 && text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      if (parsed && typeof parsed.content === "string") {
        // GitHub API returns base64-encoded content; the raw decoder handles both
        // standard base64 and base64url, stripping whitespace.
        const b64 = parsed.content.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
        // atob is available in CF Workers runtime
        const decoded = atob(b64);
        return {
          owner, repo, path, ref,
          url: parsed.html_url || rawUrl,
          source: "api",
          content: decoded.slice(0, maxChars),
          truncated: decoded.length > maxChars,
          maxChars
        };
      }
    }
  } catch (e) {
    // Both strategies failed — fall through to error return
  }

  // Both strategies failed — return structured error
  return {
    ok: false,
    owner, repo, path, ref,
    url: rawUrl,
    error: `GitHub file fetch failed — raw: ${rawError || "empty"}; api: unreachable`,
    hint: "Check repo/ref/path exist and are public. Private repos need a GITHUB_TOKEN binding."
  };
}
__name(fetchGitHubFile, "fetchGitHubFile");
__name2(fetchGitHubFile, "fetchGitHubFile");
async function fetchMetadata(args) {
  const url = new URL(requireString(args.url, "url"));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  try {
    const { text, response } = await fetchTextWithResponse(url.toString(), { maxBytes: 128e3 });
    const title = cleanText((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const description = cleanText((text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || text.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i) || [])[1] || "");
    const canonical = decodeHtml((text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i) || text.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i) || [])[1] || "");
    const finalUrl = response.url || url.toString();
    return {
      ok: true,
      url: url.toString(),
      finalUrl,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      title,
      description,
      canonical: canonical ? new URL(canonical, finalUrl).toString() : ""
    };
  } catch (error) {
    const message = String(error?.message || error || "failed");
    const statusMatch = message.match(/upstream\s+(\d{3})/i);
    return {
      ok: false,
      url: url.toString(),
      finalUrl: url.toString(),
      status: statusMatch ? Number(statusMatch[1]) : 0,
      contentType: "",
      title: "",
      description: "",
      canonical: "",
      error: message
    };
  }
}
__name(fetchMetadata, "fetchMetadata");
__name2(fetchMetadata, "fetchMetadata");
function parseLenientJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
  }
  if (source.length > 8192) return null;
  let normalized = "";
  let inString = false;
  let escaped = false;
  let identifier = "";
  const flushIdentifier = () => {
    if (!identifier) return;
    normalized += identifier === "undefined" ? "null" : identifier;
    identifier = "";
  };
  for (const char of source) {
    if (escaped) {
      if (identifier) flushIdentifier();
      normalized += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (identifier) flushIdentifier();
      normalized += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (!inString && identifier) flushIdentifier();
      normalized += char;
      inString = !inString;
      continue;
    }
    if (!inString && /[A-Za-z_$]/.test(char)) {
      identifier += char;
      continue;
    }
    if (!inString && identifier) flushIdentifier();
    if (inString && char === "\n") {
      normalized += "\\n";
      continue;
    }
    if (inString && char === "\r") {
      normalized += "\\r";
      continue;
    }
    if (inString && char === "\t") {
      normalized += "\\t";
      continue;
    }
    normalized += char;
  }
  if (identifier) flushIdentifier();
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}
async function fetchUrl(args) {
  const url = new URL(requireString(args.url, "url"));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 12e3, 1e3), 3e4);
  try {
    const { text, response } = await fetchTextWithResponse(url.toString(), { maxBytes: MAX_FETCH_BYTES });
    const fallbackFinalUrl = response.url || url.toString();
    const title = cleanText((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url.toString());
    const challengeSignals = /probe\.js|g_captcha|cf-challenge|challenge-form|__cf_bm|challenge-platform/i.test(text);
    const extractedText = htmlToText(text).slice(0, maxChars);
    if (challengeSignals || (response.status === 202 && extractedText.trim().length < 50)) {
      return {
        ok: true,
        url: url.toString(),
        finalUrl: fallbackFinalUrl,
        title,
        text: extractedText || text.slice(0, maxChars),
        maxChars,
        contentType: response.headers.get("content-type") || "",
        status: response.status,
        content_type: "challenge_page",
        reason: challengeSignals ? "JS challenge / anti-bot probe detected" : "HTTP 202 with empty content — likely anti-bot"
      };
    }
    return {
      ok: true,
      url: url.toString(),
      finalUrl: fallbackFinalUrl,
      title,
      text: extractedText,
      maxChars,
      contentType: response.headers.get("content-type") || ""
    };
  } catch (error) {
    const message = String(error?.message || error || "failed");
    const statusMatch = message.match(/upstream\s+(\d{3})/i);
    const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
    if (statusCode === 403 || statusCode === 202) {
      try {
        const rawRes = await fetch(url.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            "Accept": "text/html,*/*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
          },
          redirect: "follow",
          signal: AbortSignal.timeout(10000)
        });
        const rawHtml = await rawRes.text();
        const challengeSignals = /probe\.js|g_captcha|cf-challenge|challenge-form|__cf_bm|challenge-platform/i.test(rawHtml);
        return {
          ok: true,
          url: url.toString(),
          finalUrl: rawRes.url || url.toString(),
          title: cleanText((rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url.toString()),
          text: htmlToText(rawHtml).slice(0, maxChars),
          maxChars,
          contentType: rawRes.headers.get("content-type") || "",
          status: statusCode,
          content_type: "challenge_page",
          reason: challengeSignals ? "JS challenge / anti-bot probe detected" : `upstream ${statusCode} — data center IP may be blocked`
        };
      } catch {
        return {
          ok: false,
          url: url.toString(),
          finalUrl: url.toString(),
          title: url.toString(),
          text: "",
          maxChars,
          contentType: "",
          status: statusCode,
          content_type: "challenge_page",
          error: `upstream ${statusCode} — raw fetch also failed`
        };
      }
    }
    return {
      ok: false,
      url: url.toString(),
      finalUrl: url.toString(),
      title: url.toString(),
      text: "",
      maxChars,
      contentType: "",
      status: statusCode,
      error: message
    };
  }
}
__name(fetchUrl, "fetchUrl");
__name2(fetchUrl, "fetchUrl");

// ─── Auxiliary tools layer (Step 2) ─────────────────────────────────────────
// fetch_robots / fetch_sitemap / fetch_html_to_markdown / fetch_html_extract
// All reuse existing helpers (requireString, safeHostname, fetchTextWithResponse, htmlToText).
// fetch_html_extract requires Workers AI binding — gracefully errors if absent.

async function fetchRobots(args) {
  const url = new URL(requireString(args.url, "url"));
  if (![ "http:", "https:" ].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const origin = `${url.protocol}//${url.host}`;
  const robotsUrl = `${origin}/robots.txt`;
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 8000, 500), 32000);

  let response;
  try {
    response = await fetchTextWithResponse(robotsUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; search-mcp-worker)" },
      redirect: "follow"
    });
  } catch (error) {
    return {
      ok: false,
      domain: url.host,
      robots_url: robotsUrl,
      error: `fetch failed: ${String(error?.message || error)}`,
      rules: [],
      sitemaps: []
    };
  }

  const inner = response.response || {};
  const status = inner.status || 0;
  const raw = response.text || "";
  const isOk = status >= 200 && status < 300;

  if (status === 404) {
    return {
      ok: true,
      domain: url.host,
      robots_url: robotsUrl,
      status,
      rules: [],
      sitemaps: [],
      raw: raw.slice(0, maxChars),
      note: "robots.txt not found (404). Site has no robots policy; no automated crawling restrictions unless enforced via WAF."
    };
  }

  if (!isOk) {
    return {
      ok: false,
      domain: url.host,
      robots_url: robotsUrl,
      status,
      error: `upstream ${status}`,
      rules: [],
      sitemaps: []
    };
  }

  const rules = [];
  const sitemaps = [];
  let crawlDelay;
  let activeAgent = "*";

  for (const line of raw.split(/\r?\n/)) {
    const stripped = line.split("#")[0].trim();
    if (!stripped) {
      activeAgent = "*";
      continue;
    }
    const colonIdx = stripped.indexOf(":");
    if (colonIdx === -1) continue;
    const key = stripped.slice(0, colonIdx).trim().toLowerCase();
    const value = stripped.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      activeAgent = value.toLowerCase();
    } else if (key === "allow" || key === "disallow") {
      rules.push({ user_agent: activeAgent, type: key, path: value });
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else if (key === "crawl-delay") {
      crawlDelay = value;
    }
  }

  return {
    ok: true,
    domain: url.host,
    robots_url: robotsUrl,
    status,
    rules,
    sitemaps: [ ...new Set(sitemaps) ],
    crawl_delay: crawlDelay,
    raw: raw.slice(0, maxChars),
    _meta: { parser: "inline-regex-v1" }
  };
}
__name(fetchRobots, "fetchRobots");
__name2(fetchRobots, "fetchRobots");

async function fetchSitemap(args) {
  const url = new URL(requireString(args.url, "url"));
  if (![ "http:", "https:" ].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const recursive = Boolean(args.recursive);
  const maxUrls = Math.min(Math.max(Number(args.maxUrls) || 5000, 100), 20000);

  const result = {
    ok: true,
    source_url: url.toString(),
    is_index: false,
    urls: [],
    total: 0,
    nested_sitemaps: [],
    _meta: { parser: "inline-regex-v1", recursive }
  };

  const visited = new Set();
  const queue = [ { url: url.toString(), depth: 0 } ];
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; search-mcp-worker)" };

  while (queue.length > 0 && result.total < maxUrls) {
    const { url: curUrl, depth } = queue.shift();
    if (visited.has(curUrl)) continue;
    visited.add(curUrl);

    let response;
    try {
      response = await fetchTextWithResponse(curUrl, { headers, redirect: "follow", maxBytes: 5 * 1024 * 1024 });
    } catch (error) {
      result._meta.failed_sitemaps = result._meta.failed_sitemaps || [];
      result._meta.failed_sitemaps.push({ url: curUrl, error: String(error?.message || error) });
      continue;
    }

    const innerResp = response.response || {};
    const status = innerResp.status || 0;
    if (status < 200 || status >= 300) {
      result._meta.failed_sitemaps = result._meta.failed_sitemaps || [];
      result._meta.failed_sitemaps.push({ url: curUrl, status });
      continue;
    }

    let xml = response.text || "";
    // If truncated mid-URL-block, drop the last unclosed <url>...</url> to avoid regex hang.
    const lastUrlClose = xml.lastIndexOf("</url>");
    if (lastUrlClose !== -1 && lastUrlClose < xml.length - 100) {
      xml = xml.slice(0, lastUrlClose + 6);
      result._meta.truncated_by_fetch = true;
    }

    // Detect sitemapindex vs urlset
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    if (depth === 0) result.is_index = isIndex;

    if (isIndex && recursive) {
      // Parse <sitemap><loc>...</loc></sitemap>
      const subMatches = xml.matchAll(/<sitemap[\s>][^>]*>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi);
      for (const m of subMatches) {
        const subUrl = m[1].trim();
        if (!visited.has(subUrl)) {
          queue.push({ url: subUrl, depth: depth + 1 });
          if (depth === 0) result.nested_sitemaps.push(subUrl);
        }
      }
    } else if (!isIndex) {
      // Parse <url> entries. Use lookahead to avoid matching inner <url> tags.
// Lazy match until </url> but not if followed by > which would consume inner elements.
const urlRe = /<url\b[^>]*>([\s\S]*?)<\/url>(?!\s*<url)/gi;
      let m;
      while ((m = urlRe.exec(xml)) !== null && result.total < maxUrls) {
        const block = m[1];
        const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
        if (!loc) continue;
        const locUrl = loc[1].trim();
        if (visited.has(locUrl)) continue;
        visited.add(locUrl);
        const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i);
        const changefreq = block.match(/<changefreq>\s*([^<]+?)\s*<\/changefreq>/i);
        const priority = block.match(/<priority>\s*([^<]+?)\s*<\/priority>/i);
        result.urls.push({
          loc: locUrl,
          ...(lastmod && { lastmod: lastmod[1].trim() }),
          ...(changefreq && { changefreq: changefreq[1].trim() }),
          ...(priority && { priority: priority[1].trim() })
        });
        result.total++;
      }
    }

    if (!recursive) break;
  }

  if (result.total >= maxUrls) {
    result._meta.truncated = true;
    result._meta.note = `Hit maxUrls limit (${maxUrls}). Some entries may have been skipped.`;
  }

  return result;
}
__name(fetchSitemap, "fetchSitemap");
__name2(fetchSitemap, "fetchSitemap");

// HTML → Markdown converter. Lightweight inline implementation:
// preserves headings, links, lists, code, paragraphs.
function htmlToMarkdown(html) {
  if (!html) return "";
  let md = html;

  // Strip script/style/nav/header/footer first
  md = md.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
  md = md.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
  md = md.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${cleanText(t).trim()}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${cleanText(t).trim()}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${cleanText(t).trim()}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${cleanText(t).trim()}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `\n##### ${cleanText(t).trim()}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `\n###### ${cleanText(t).trim()}\n\n`);

  // Code blocks (preserve content verbatim)
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => {
    const inner = t.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "$1");
    return `\n\`\`\`\n${inner.replace(/<[^>]+>/g, "").trim()}\n\`\`\`\n\n`;
  });
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${t.replace(/<[^>]+>/g, "").trim()}\``);

  // Links
  md = md.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = cleanText(text).trim();
    if (!t) return href;
    return `[${t}](${href})`;
  });

  // Lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, t) => {
    const items = [];
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = itemRe.exec(t)) !== null) {
      const inner = cleanText(m[1]).trim();
      if (inner) items.push(`- ${inner}`);
    }
    return items.length ? `\n${items.join("\n")}\n\n` : "";
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, t) => {
    const items = [];
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    let n = 1;
    while ((m = itemRe.exec(t)) !== null) {
      const inner = cleanText(m[1]).trim();
      if (inner) items.push(`${n++}. ${inner}`);
    }
    return items.length ? `\n${items.join("\n")}\n\n` : "";
  });

  // Paragraphs and breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n${cleanText(t).trim()}\n\n`);

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = decodeHtml(md);

  // Normalize whitespace
  md = md.replace(/[ \t]+\n/g, "\n");
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}
__name(htmlToMarkdown, "htmlToMarkdown");
__name2(htmlToMarkdown, "htmlToMarkdown");

async function fetchHtmlToMarkdown(args) {
  const url = new URL(requireString(args.url, "url"));
  if (![ "http:", "https:" ].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 20000, 1000), 80000);

  let response;
  try {
    response = await fetchTextWithResponse(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
  } catch (error) {
    return {
      ok: false,
      url: url.toString(),
      title: url.toString(),
      markdown: "",
      text_length: 0,
      maxChars,
      contentType: "",
      status: 0,
      error: `fetch failed: ${String(error?.message || error)}`
    };
  }

  const innerResp = response.response || {};
  const status = innerResp.status || 0;
  const contentType = innerResp.headers?.get?.("content-type") || "";
  const isOk = status >= 200 && status < 300;

  if (!isOk) {
    return {
      ok: false,
      url: url.toString(),
      title: url.toString(),
      markdown: "",
      text_length: 0,
      maxChars,
      contentType,
      status,
      error: `upstream ${status}`
    };
  }

  const html = response.text || "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtml(cleanText(titleMatch[1])).trim() : url.toString();

  const fullMarkdown = htmlToMarkdown(html);
  const truncated = fullMarkdown.length > maxChars;
  const markdown = truncated ? fullMarkdown.slice(0, maxChars) : fullMarkdown;

  return {
    ok: true,
    url: url.toString(),
    finalUrl: innerResp.url || url.toString(),
    title,
    markdown,
    text_length: markdown.length,
    full_length: fullMarkdown.length,
    truncated,
    maxChars,
    contentType,
    status,
    _meta: { parser: "inline-regex-v1" }
  };
}
__name(fetchHtmlToMarkdown, "fetchHtmlToMarkdown");
__name2(fetchHtmlToMarkdown, "fetchHtmlToMarkdown");

// Workers AI caller. Returns null if no AI binding, or if call fails.
// Uses Llama 3.1 8B Instruct (free on Workers AI).
async function callWorkersAI(env, messages, maxTokens = 512) {
  if (!env?.AI) return null;
  try {
    const resp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages,
      max_tokens: maxTokens
    });
    return resp?.response || null;
  } catch (error) {
    return null;
  }
}
__name(callWorkersAI, "callWorkersAI");
__name2(callWorkersAI, "callWorkersAI");

async function fetchHtmlExtract(args) {
  const url = new URL(requireString(args.url, "url"));
  if (![ "http:", "https:" ].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const schema = args.schema;
  if (!schema || typeof schema !== "object") throw new Error("schema must be an object describing fields to extract");

  // Fetch the page first
  const fetched = await fetchUrl({ url: url.toString(), maxChars: 30000 });

  if (!fetched.ok) {
    return {
      ok: false,
      url: url.toString(),
      extracted: null,
      raw_text_length: 0,
      error: fetched.error || `upstream ${fetched.status}`,
      _meta: { engine: "llama-3.1-8b + fetch" }
    };
  }

  const schemaKeys = Object.keys(schema);
  const schemaDesc = schemaKeys.map(k => {
    const t = String(schema[k]).toLowerCase();
    return `"${k}": ${t}`;
  }).join(", ");

  const prompt = `Extract the following fields from the page text below and return ONLY valid JSON matching this schema: {${schemaDesc}}\n\nPage text:\n"""\n${fetched.text}\n"""\n\nReturn JSON only, no prose, no markdown fences. If a field is missing, use null.`;

  const aiResp = await callWorkersAI(args._env || globalThis.env, [
    { role: "system", content: "You are a precise data extractor. Always return valid JSON matching the requested schema. Never add commentary." },
    { role: "user", content: prompt }
  ]);

  if (!aiResp) {
    return {
      ok: true,
      url: url.toString(),
      extracted: null,
      raw_text_length: fetched.text_length,
      error: "Workers AI unavailable or extraction failed. Set up [ai] binding in wrangler.toml to enable.",
      _meta: { engine: "llama-3.1-8b + fetch (ai binding missing or call failed)" }
    };
  }

  let extracted = null;
  try {
    const jsonMatch = aiResp.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    // Try to recover: extract anything that looks like a JSON object
    try {
      const cleaned = aiResp.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
      extracted = JSON.parse(cleaned);
    } catch {}
  }

  return {
    ok: true,
    url: url.toString(),
    extracted,
    raw_text_length: fetched.text_length,
    _meta: { engine: "llama-3.1-8b + fetch", parsed_from_ai: !!extracted }
  };
}
__name(fetchHtmlExtract, "fetchHtmlExtract");
__name2(fetchHtmlExtract, "fetchHtmlExtract");

// ─── PDF parsing layer (Step 1) ─────────────────────────────────────────────
// Pure inline PDF text extractor. No external dependencies.
// Handles: text-based PDFs with standard font encoding (Latin-1 / WinAnsi).
// Limitations: scanned/image PDFs (returns empty + note), encrypted PDFs (error),
// CID-keyed CJK fonts (partial), complex table layouts (best-effort).

function decodePdfString(s) {
  return s
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
__name(decodePdfString, "decodePdfString");
__name2(decodePdfString, "decodePdfString");

function extractPdfText(buf) {
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const out = [];

  // Strategy 1: find BT...ET text objects, extract Tj and TJ operators
  const textObjRe = /BT\b([\s\S]*?)ET/g;
  let obj;
  while ((obj = textObjRe.exec(raw)) !== null) {
    const block = obj[1];
    // (literal string) Tj
    const tjRe = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    let m;
    while ((m = tjRe.exec(block)) !== null) {
      const decoded = decodePdfString(m[1]);
      if (decoded.trim()) out.push(decoded);
    }
    // [array of strings and numbers] TJ
    const tjArrRe = /\[([\s\S]*?)\]\s*TJ/g;
    while ((m = tjArrRe.exec(block)) !== null) {
      const inner = m[1];
      const strRe = /\(((?:\\.|[^\\()])*)\)/g;
      let sm;
      const line = [];
      while ((sm = strRe.exec(inner)) !== null) {
        line.push(decodePdfString(sm[1]));
      }
      if (line.length) out.push(line.join(""));
    }
  }

  // Strategy 2: fallback — extract all parenthesized string literals
  if (out.length === 0) {
    const litRe = /\(((?:\\.|[^\\()]){2,})\)/g;
    let m;
    while ((m = litRe.exec(raw)) !== null) {
      const decoded = decodePdfString(m[1]);
      if (decoded.length > 2 && /[a-zA-Z\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(decoded)) {
        out.push(decoded);
      }
    }
  }

  const text = out.join(" ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { text, page_count_estimate: pageCount || null };
}
__name(extractPdfText, "extractPdfText");
__name2(extractPdfText, "extractPdfText");

// Full async version (used by pdfParse) — adds Strategy 3: decompress FlateDecode streams

async function extractPdfTextAsync(buf) {
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const out = [];

  // Quality check: ratio of printable ASCII / CJK chars to total
  function isReadable(text) {
    if (!text || text.length === 0) return false;
    let printable = 0;
    const sample = text.length > 5000 ? text.slice(0, 5000) : text;
    for (const ch of sample) {
      const code = ch.charCodeAt(0);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 ||
          (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff)) {
        printable++;
      }
    }
    return printable / sample.length > 0.6;
  }
  function extractFromBlock(block) {
    const tjRe = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    let m;
    while ((m = tjRe.exec(block)) !== null) {
      const decoded = decodePdfString(m[1]);
      if (decoded.trim()) out.push(decoded);
    }
    const tjArrRe = /\[([\s\S]*?)\]\s*TJ/g;
    while ((m = tjArrRe.exec(block)) !== null) {
      const strRe = /\(((?:\\.|[^\\()])*)\)/g;
      let sm;
      const line = [];
      while ((sm = strRe.exec(m[1])) !== null) line.push(decodePdfString(sm[1]));
      if (line.length) out.push(line.join(""));
    }
  }

  // Strategy 1: BT...ET text objects with Tj/TJ operators (uncompressed PDFs)
  // SKIPPED for now — for LaTeX-generated papers this catches PDF outline/metadata
  // strings (cite.* / section.* / page.*) before reaching actual content.
  // We go directly to Strategy 3 which handles FlateDecode-compressed content streams
  // and skips non-text streams via looksLikeTextStream.
  const textObjRe = /BT\b([\s\S]*?)ET/g;
  let obj;
  // Disabled: while ((obj = textObjRe.exec(raw)) !== null) extractFromBlock(obj[1]);

  // Strategy 2: DISABLED — captures PDF Info-dict metadata (authors, producer, etc.)
  // mixed with font/label strings, polluting output. Strategy 3 alone is cleaner.
  // Keeping the code as reference, but not executed.
  if (false && out.length === 0) {
    const litRe = /\(((?:\\.|[^\\()]){2,})\)/g;
    let m;
    while ((m = litRe.exec(raw)) !== null) {
      const decoded = decodePdfString(m[1]);
      // Skip short or non-textual literals (PDF metadata, citation keys, font glyph names)
      if (decoded.length > 4 && /[a-zA-Z\u4e00-\u9fff\u3040-\u30ff\u30a0-\u30ff]/.test(decoded) && !/^cite\./.test(decoded) && !/^Doc-Start$/.test(decoded) && !/^(table|section|subsection|appendix|Hfootnote)\./.test(decoded)) {
        out.push(decoded);
      }
    }
    if (out.length > 0 && !isReadable(out.join(" "))) {
      out.length = 0;
    }
  }

  // Strategy 3: binary-scan for stream...endstream blocks, decompress, extract
  // This is the main path for most real-world PDFs (FlateDecode compressed)
  // Uses binary byte scanning instead of regex to handle binary stream content correctly.
  // Skips streams that are NOT text content (fonts, images, XObjects) by checking
  // the decompressed stream's first bytes — text streams start with PDF operators
  // (BT, Tj, TJ, /, %) or ASCII text; font/image streams have binary magic bytes.
  // Always runs now (Strategy 1+2 disabled because they captured metadata/outline noise).
    const streamMarker = [115, 116, 114, 101, 97, 109]; // "stream"
    const endstreamMarker = [101, 110, 100, 115, 116, 114, 101, 97, 109]; // "endstream"
    function findBytes(haystack, needle, startFrom) {
      for (let i = startFrom; i < haystack.length - needle.length; i++) {
        let match = true;
        for (let j = 0; j < needle.length; j++) {
          if (haystack[i + j] !== needle[j]) { match = false; break; }
        }
        if (match) return i;
      }
      return -1;
    }
    function looksLikeTextStream(text) {
      // True text streams contain PDF text operators or content-like ASCII
      // Heuristic: scan first 512 chars — must have >50% printable or contain
      // common PDF text-content markers
      if (!text || text.length < 10) return false;
      const sample = text.length > 512 ? text.slice(0, 512) : text;
      // Common text-stream markers
      const hasTextOp = /\\bBT\\b|\\bTj\\b|\\bTJ\\b|\\bTd\\b|\\bTm\\b|\\bTf\\b/.test(sample);
      if (hasTextOp) return true;
      // Otherwise check printable ratio
      let printable = 0;
      for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
          printable++;
        }
      }
      return printable / sample.length > 0.85;
    }
    let pos = 0;
    let streamCount = 0;
    while (pos < bytes.length && streamCount < 200) {
      if (out.length > 80000) break;
      const streamStart = findBytes(bytes, streamMarker, pos);
      if (streamStart === -1) break;
      let dataStart = streamStart + 6;
      if (bytes[dataStart] === 13) dataStart++;
      if (bytes[dataStart] === 10) dataStart++;
      const endStart = findBytes(bytes, endstreamMarker, dataStart);
      if (endStart === -1) break;
      let dataEnd = endStart;
      if (bytes[dataEnd - 1] === 10) dataEnd--;
      if (bytes[dataEnd - 1] === 13) dataEnd--;
      const streamBytes = bytes.subarray(dataStart, dataEnd);
      pos = endStart + 9;
      streamCount++;
      if (streamBytes.length < 50) continue;
      try {
        const ds = new DecompressionStream("deflate");
        const decompressedStream = new Blob([streamBytes]).stream().pipeThrough(ds);
        const text = await new Response(decompressedStream).text();
        if (!looksLikeTextStream(text)) continue; // skip fonts / images / XObjects
        extractFromBlock(text);
      } catch {}
    }

  const text = out.join(" ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { text, page_count_estimate: pageCount || null };
}
__name(extractPdfTextAsync, "extractPdfTextAsync");
__name2(extractPdfTextAsync, "extractPdfTextAsync");

async function pdfParse(args) {
  const url = new URL(requireString(args.url, "url"));
  if (![ "http:", "https:" ].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 50000, 1000), 100000);

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), 20000);
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "application/pdf,*/*"
      },
      redirect: "follow"
    });
    clearTimeout(timer);
  } catch (error) {
    return {
      ok: false,
      url: url.toString(),
      error: String(error?.message || error || "fetch failed"),
      text: "",
      text_length: 0
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      url: url.toString(),
      finalUrl: response.url || url.toString(),
      status: response.status,
      error: `upstream ${response.status}`,
      text: "",
      text_length: 0
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);

  // Reject obviously non-PDF content types (unless URL ends in .pdf)
  const isPdfByContentType = /pdf/i.test(contentType);
  const isPdfByUrl = /\.pdf(\?|$)/i.test(url.toString());
  if (!isPdfByContentType && !isPdfByUrl) {
    return {
      ok: false,
      url: url.toString(),
      finalUrl: response.url || url.toString(),
      contentType,
      error: `not a PDF (content-type: ${contentType || "unknown"})`,
      text: "",
      text_length: 0
    };
  }

  // Limit to 10MB to avoid OOM in Worker
  if (contentLength > 10 * 1024 * 1024) {
    return {
      ok: false,
      url: url.toString(),
      error: `PDF too large (${(contentLength / 1024 / 1024).toFixed(1)}MB, max 10MB)`,
      text: "",
      text_length: 0
    };
  }

  const buf = await response.arrayBuffer();
  const { text, page_count_estimate } = await extractPdfTextAsync(buf);
  const truncated = text.length > maxChars;
  const finalText = text.slice(0, maxChars);

  const result = {
    ok: true,
    url: url.toString(),
    finalUrl: response.url || url.toString(),
    contentType: contentType || "application/pdf",
    size_bytes: buf.byteLength,
    page_count_estimate,
    text: finalText,
    text_length: finalText.length,
    full_text_length: text.length,
    truncated,
    _meta: { parser: "inline-regex-v1", decompression: typeof DecompressionStream !== "undefined" ? "available" : "unavailable" }
  };

  if (text.length < 50) {
    result.note = "No meaningful text extracted. This is likely a scanned/image-only PDF. Use crawl_pdf to render it, or crawl_screenshot on individual pages, then feed to a vision model.";
  }

  return result;
}
__name(pdfParse, "pdfParse");
__name2(pdfParse, "pdfParse");

async function pdfToMarkdown(args) {
  const result = await pdfParse(args);
  if (!result.ok) return result;

  let md = result.text;
  // Convert double newlines to paragraph breaks
  md = md.replace(/\n{2,}/g, "\n\n");
  // If page count is known, try to insert page break markers
  // (best-effort: split text evenly across pages)
  if (result.page_count_estimate && result.page_count_estimate > 1) {
    const perPage = Math.ceil(md.length / result.page_count_estimate);
    const parts = [];
    for (let i = 0; i < md.length; i += perPage) {
      parts.push(md.slice(i, i + perPage));
    }
    md = parts.join("\n\n---\n\n");
  }
  // Clean up excessive spaces within paragraphs
  md = md.replace(/([^\n])  +([^\n])/g, "$1 $2");
  // Add a header with metadata
  const header = [
    `# PDF Document`,
    ``,
    `- **Source:** ${result.url}`,
    `- **Size:** ${(result.size_bytes / 1024).toFixed(1)} KB`,
    result.page_count_estimate ? `- **Pages (estimated):** ${result.page_count_estimate}` : null,
    result.truncated ? `- **Truncated:** ${result.text_length} of ${result.full_text_length} chars` : null,
    ``,
    `---`,
    ``
  ].filter(Boolean).join("\n");

  return {
    ...result,
    markdown: header + md,
    text: undefined // remove raw text to avoid duplication; markdown is canonical
  };
}
__name(pdfToMarkdown, "pdfToMarkdown");
__name2(pdfToMarkdown, "pdfToMarkdown");

function formatPdfResponse(result) {
  const ts = `[${new Date().toISOString()}]`;
  if (!result.ok) {
    return `${ts} PDF parse failed: ${result.error || "unknown error"}
URL: ${result.url}`;
  }
  const md = result.markdown;
  if (md) {
    return `${ts} PDF → Markdown (${result.size_bytes} bytes, ${result.page_count_estimate || "?"} pages)

${md}`;
  }
  return `${ts} PDF parsed (${result.size_bytes} bytes, ${result.page_count_estimate || "?"} pages)

URL: ${result.url}
Final URL: ${result.finalUrl}

${result.text}`;
}
__name(formatPdfResponse, "formatPdfResponse");
__name2(formatPdfResponse, "formatPdfResponse");

// =====================================================================
// Layer 2 — Dynamic Crawl Tools (Step 3)
// 4 new tools: crawl_scrape / crawl_screenshot / crawl_pdf / crawl_extract
// All pure worker functions, no external bindings, no JS rendering.
// crawl_pdf: PDF is static binary, reused Step 1 extractPdfTextAsync.
// crawl_scrape: SPA detection + DOM walker + Archive.org fallback.
// crawl_extract: JSON-LD + OG + Twitter + heuristic class extraction.
// crawl_screenshot: content snapshot fallback (no Browser Rendering binding).
// =====================================================================

const CRAWL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Crawl helpers — detect SPA frameworks / extract embedded data
function detectSpaFramework(html) {
  if (typeof html !== "string" || !html) return null;
  if (/id\s*=\s*["']__NEXT_DATA__["']/.test(html)) return "next";
  if (/window\.__NUXT__/.test(html)) return "nuxt";
  if (/<script[^>]+id\s*=\s*["']__SVELTEKIT_DATA__["']/.test(html)) return "sveltekit";
  if (/astro-island|<astro-[a-z]+/.test(html)) return "astro";
  if (/data-react-helmet|window\.__INITIAL_STATE__|window\.__PRELOADED_STATE__/.test(html)) return "react-ssr";
  return null;
}

function extractNextData(html) {
  const match = html.match(/<script[^>]+id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractNuxtData(html) {
  const match = html.match(/<script[^>]+>\s*window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      blocks.push(obj);
    } catch {
      // skip malformed
    }
  }
  return blocks;
}

function extractOgTags(html) {
  const og = {};
  const re = /<meta\s+(?:[^>]*?)property\s*=\s*["']og:([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    og[m[1]] = decodeHtml(m[2]);
  }
  return og;
}

function extractTwitterTags(html) {
  const tw = {};
  const re = /<meta\s+(?:[^>]*?)name\s*=\s*["']twitter:([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    tw[m[1]] = decodeHtml(m[2]);
  }
  return tw;
}

// Walk JSON tree and collect string values that look like paragraphs / headings / descriptions
function flattenJsonToText(obj, depth = 0, max = 3) {
  if (depth > max || obj == null) return [];
  if (typeof obj === "string") {
    const t = obj.trim();
    return t.length > 20 ? [t] : [];
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((v) => flattenJsonToText(v, depth + 1, max));
  }
  if (typeof obj === "object") {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
      // skip noisy keys
      if (/^(image|thumbnail|logo|icon|avatar|brand|favicon|node_|_)/i.test(k)) continue;
      out.push(...flattenJsonToText(v, depth + 1, max));
    }
    return out;
  }
  return [];
}

// Minimal cheerio-less DOM walker: html -> markdown-ish plain text
function domToMarkdown(html, maxChars = 12000) {
  if (typeof html !== "string" || !html) return { markdown: "", truncated: false };
  // Drop scripts/styles/nav/footer/noscript first
  let s = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<nav\b[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<footer\b[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<header\b[\s\S]*?<\/header>/gi, " ");

  const lines = [];
  // Headings
  s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) => {
    const text = stripTags(inner).trim();
    if (text) lines.push(`${"#".repeat(Number(n))} ${text}\n`);
    return "";
  });
  // Paragraphs / divs
  s.replace(/<(p|div|li|td|th|article|section|main)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = stripTags(inner).trim();
    if (text && text.length > 1) lines.push(`${text}\n`);
    return "";
  });
  // Anchors with text (add as markdown links if we have hrefs later — skip href for now)
  // Pre / code
  s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const text = stripTags(inner).trim();
    if (text) lines.push("```\n" + text + "\n```\n");
    return "";
  });
  s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
    const text = stripTags(inner).trim();
    if (text) lines.push(`\`${text}\``);
    return "";
  });
  // Tables (very rough — just cell text)
  s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner) => {
    const cells = [];
    inner.replace(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => {
      cells.push(stripTags(c).trim());
      return "";
    });
    if (cells.length) lines.push(cells.join(" | ") + "\n");
    return "";
  });

  // Fallback: strip remaining tags and add as plain text
  const remaining = stripTags(s).replace(/\s+/g, " ").trim();
  if (remaining && lines.length === 0) {
    lines.push(remaining + "\n");
  }

  let markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = markdown.length > maxChars;
  if (truncated) markdown = markdown.slice(0, maxChars);
  return { markdown, truncated };
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ");
}

// Archive.org Wayback Machine lookup
async function fetchWaybackSnapshot(targetUrl, timeoutMs = 8000) {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
    const r = await fetch(api, { signal: ctrl.signal, headers: { "User-Agent": CRAWL_UA } });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `wayback api ${r.status}` };
    const data = await r.json();
    const snap = data?.archived_snapshots?.closest;
    if (!snap || !snap.available) return { ok: false, error: "no_archive_snapshot" };
    return {
      ok: true,
      snapshot_url: snap.url,
      timestamp: snap.timestamp,
      status: snap.status
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function crawlScrape(args) {
  const rawUrl = requireString(args.url, "url");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, url: rawUrl, error: "invalid url" };
  }
  if (![ "http:", "https:" ].includes(url.protocol)) {
    return { ok: false, url: rawUrl, error: "only http(s) URLs are allowed" };
  }
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 12000, 500), 50000);
  const useCache = args.useCache !== false;

  // Fetch original
  let response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), 15000);
    response = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent": CRAWL_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
    clearTimeout(timer);
  } catch (e) {
    return { ok: false, url: url.toString(), error: `fetch failed: ${String(e?.message || e)}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      url: url.toString(),
      finalUrl: response.url || url.toString(),
      status: response.status,
      error: `upstream ${response.status}`
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const html = await response.text();
  const framework = detectSpaFramework(html);
  const jsonLd = extractJsonLdBlocks(html);
  const og = extractOgTags(html);
  const twitter = extractTwitterTags(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";

  // Strategy chain
  let markdown = "";
  let strategy = "dom-walker";
  let extractedStructured = null;

  // Strategy 1: Next.js __NEXT_DATA__
  if (framework === "next") {
    const data = extractNextData(html);
    if (data) {
      const texts = flattenJsonToText(data);
      markdown = texts.join("\n\n");
      extractedStructured = data;
      strategy = "next-data";
    }
  }
  // Strategy 2: Nuxt __NUXT__
  if (!markdown && framework === "nuxt") {
    const data = extractNuxtData(html);
    if (data) {
      const texts = flattenJsonToText(data);
      markdown = texts.join("\n\n");
      extractedStructured = data;
      strategy = "nuxt-data";
    }
  }
  // Strategy 3: JSON-LD (works for many sites incl. static + SSG)
  if (!markdown && jsonLd.length) {
    const texts = flattenJsonToText(jsonLd);
    markdown = texts.join("\n\n");
    strategy = "json-ld";
  }
  // Strategy 4: OG + meta tags as fallback
  if (!markdown && (og.title || og.description || twitter.title || twitter.description)) {
    markdown = [
      og.title || twitter.title,
      og.description || twitter.description,
      og.type ? `(type: ${og.type})` : null
    ].filter(Boolean).join("\n\n");
    strategy = "og-meta";
  }
  // Strategy 5: cheerio-less DOM walker (works for plain HTML / SSR)
  if (!markdown) {
    const out = domToMarkdown(html, maxChars * 2); // buffer for post-truncation
    markdown = out.markdown;
    strategy = "dom-walker";
  }

  // Truncate
  const truncated = markdown.length > maxChars;
  if (truncated) markdown = markdown.slice(0, maxChars);

  // Optional Archive.org fallback when content too thin
  let waybackNote = null;
  if (useCache && (!markdown || markdown.length < 200)) {
    const wb = await fetchWaybackSnapshot(url.toString());
    if (wb.ok) {
      waybackNote = `original too thin (${markdown.length} chars); Archive.org snapshot available at ${wb.snapshot_url} (ts=${wb.timestamp})`;
    }
  }

  const result = {
    ok: true,
    url: url.toString(),
    finalUrl: response.url || url.toString(),
    contentType,
    status: response.status,
    framework,
    strategy,
    title: (og.title || twitter.title || decodeHtml(title).trim()) || null,
    description: og.description || twitter.description || null,
    og,
    twitter,
    jsonLdCount: jsonLd.length,
    markdown,
    markdown_length: markdown.length,
    truncated,
    wayback_note: waybackNote,
    _meta: {
      parser: "crawl-scrape-v1",
      fallback_strategy: waybackNote ? "wayback-available" : null
    }
  };

  if (!markdown) {
    result.note = "no content extracted (empty page or all-JS rendering with no embedded data)";
  }

  return result;
}

async function crawlScreenshot(args) {
  const rawUrl = requireString(args.url, "url");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, url: rawUrl, error: "invalid url" };
  }
  if (![ "http:", "https:" ].includes(url.protocol)) {
    return { ok: false, url: rawUrl, error: "only http(s) URLs are allowed" };
  }
  const maxLinks = Math.min(Math.max(Number(args.maxLinks) || 20, 1), 100);

  let response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), 15000);
    response = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": CRAWL_UA, "Accept": "text/html,application/xhtml+xml,*/*" },
      redirect: "follow"
    });
    clearTimeout(timer);
  } catch (e) {
    return { ok: false, url: url.toString(), error: `fetch failed: ${String(e?.message || e)}` };
  }
  if (!response.ok) {
    return {
      ok: false,
      url: url.toString(),
      status: response.status,
      error: `upstream ${response.status}`
    };
  }

  const html = await response.text();
  const og = extractOgTags(html);
  const twitter = extractTwitterTags(html);

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : null;

  // Headings h1-h3
  const headings = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (text) headings.push({ level: Number(m[1]), text });
  }

  // Links
  const links = [];
  const linkRe = /<a\s+(?:[^>]*?)href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null && links.length < maxLinks) {
    const href = m[1];
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      const abs = new URL(href, url.toString()).toString();
      links.push({ text: text || abs, href: abs });
    } catch {
      // skip malformed
    }
  }

  // Body summary — strip everything, get first 1500 chars
  const cleanHtml = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
  const bodySummary = stripTags(cleanHtml).replace(/\s+/g, " ").trim().slice(0, 1500);

  // sha256 of html for fingerprinting
  const htmlBytes = new TextEncoder().encode(html);
  const hashBuf = await crypto.subtle.digest("SHA-256", htmlBytes);
  const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    ok: true,
    url: url.toString(),
    finalUrl: response.url || url.toString(),
    contentType: response.headers.get("content-type") || "",
    status: response.status,
    snapshot_type: "content-snapshot",
    note: "Browser Rendering binding is not enabled on this account. True PNG screenshots require enabling Cloudflare Browser Rendering in the dashboard. This tool returns a structured DOM snapshot instead.",
    title,
    description: og.description || twitter.description || null,
    og,
    twitter,
    headings: headings.slice(0, 50),
    links,
    body_summary: bodySummary,
    html_length: html.length,
    html_sha256: hashHex,
    _meta: { parser: "crawl-snapshot-v1", format: "dom-derived" }
  };
}

async function crawlPdf(args) {
  // Reuse Step 1 pdfParse / pdfToMarkdown
  const format = args.format === "text" ? "text" : "markdown";
  if (format === "text") {
    return await pdfParse(args);
  }
  return await pdfToMarkdown(args);
}

async function crawlExtract(args) {
  const rawUrl = requireString(args.url, "url");
  const schema = args.schema && typeof args.schema === "object" ? args.schema : {};
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, url: rawUrl, error: "invalid url" };
  }
  if (![ "http:", "https:" ].includes(url.protocol)) {
    return { ok: false, url: rawUrl, error: "only http(s) URLs are allowed" };
  }

  let response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), 15000);
    response = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": CRAWL_UA, "Accept": "text/html,application/xhtml+xml,*/*" },
      redirect: "follow"
    });
    clearTimeout(timer);
  } catch (e) {
    return { ok: false, url: url.toString(), error: `fetch failed: ${String(e?.message || e)}` };
  }
  if (!response.ok) {
    return {
      ok: false,
      url: url.toString(),
      status: response.status,
      error: `upstream ${response.status}`
    };
  }
  const html = await response.text();
  const og = extractOgTags(html);
  const twitter = extractTwitterTags(html);
  const jsonLd = extractJsonLdBlocks(html);

  // Build candidate-value pool keyed by field name (lowercase)
  const pool = {};
  function put(field, value) {
    if (value == null) return;
    const v = typeof value === "string" ? value.trim() : value;
    if (v == null || v === "") return;
    const key = String(field).toLowerCase();
    if (!pool[key]) pool[key] = [];
    pool[key].push(v);
  }

  // OG tags (canonical source for title/description/image/price)
  for (const [k, v] of Object.entries(og)) {
    put(k, v);
    put(`og:${k}`, v);
    put(`og_${k}`, v);
  }
  // Twitter tags
  for (const [k, v] of Object.entries(twitter)) {
    put(k, v);
    put(`twitter:${k}`, v);
    put(`twitter_${k}`, v);
  }
  // JSON-LD: walk each block, use @type / name / property keys as candidate field names
  for (const block of jsonLd) {
    function walk(o) {
      if (o == null || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      for (const [k, v] of Object.entries(o)) {
        if (v == null) continue;
        if (typeof v === "object") { walk(v); continue; }
        // Primitive — push under multiple candidate names
        put(k, v);
        put(k.replace(/([A-Z])/g, "_$1").toLowerCase(), v);
      }
    }
    walk(block);
  }
  // HTML element content for common field names (loose)
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) put("title", decodeHtml(titleMatch[1]).trim());
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) put("title", decodeHtml(h1Match[1]).trim());
  // Common heuristic selectors — extract text content from .price / .author / etc.
  const heuristicRe = /<(?:span|div|p|meta|td|th|h[1-6])[^>]*?(?:class|itemprop|name|id)\s*=\s*["'][^"']*\b(price|author|title|name|sku|brand|date|description|image|content|rating|count|availability|currency)\b[^"']*["'][^>]*?>([\s\S]*?)<\/(?:span|div|p|td|th|h[1-6])>/gi;
  let hm;
  while ((hm = heuristicRe.exec(html)) !== null) {
    const field = hm[1].toLowerCase();
    let val = stripTags(hm[2]).replace(/\s+/g, " ").trim();
    if (!val) continue;
    // Also try meta content= attribute
    if (val.length < 2) {
      const metaMatch = hm[2].match(/content\s*=\s*["']([^"']+)["']/i);
      if (metaMatch) val = metaMatch[1];
    }
    put(field, val);
  }
  // meta itemprop="..." content="..." patterns (schema.org microdata)
  const microRe = /<meta\s+(?:[^>]*?)itemprop\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["']/gi;
  while ((hm = microRe.exec(html)) !== null) {
    put(hm[1].toLowerCase(), decodeHtml(hm[2]).trim());
  }

  // Coerce each schema field — pick first pool entry, coerce type
  const extracted = {};
  const missing = [];
  for (const [field, typeStr] of Object.entries(schema)) {
    const candidates = pool[field.toLowerCase()] || [];
    let raw = candidates.length ? candidates[0] : null;
    let coerced = null;
    if (raw != null) {
      if (typeStr === "number") {
        const num = parseFloat(String(raw).replace(/[^\d.\-]/g, ""));
        coerced = Number.isFinite(num) ? num : null;
      } else if (typeStr === "boolean") {
        coerced = /^(true|yes|1|available|in stock)$/i.test(String(raw));
      } else if (typeStr === "array") {
        coerced = candidates.length ? candidates : String(raw).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      } else {
        coerced = String(raw);
      }
    }
    extracted[field] = coerced;
    if (coerced == null || coerced === "") missing.push(field);
  }

  return {
    ok: true,
    url: url.toString(),
    finalUrl: response.url || url.toString(),
    status: response.status,
    extracted,
    missing_fields: missing,
    sources_used: {
      og: Object.keys(og).length,
      twitter: Object.keys(twitter).length,
      jsonld_blocks: jsonLd.length
    },
    _meta: { parser: "crawl-extract-v1", method: "html-heuristic-no-ai" }
  };
}

// =====================================================================
// Layer 3 — Smart Bridge Tool (Step 4)
// 1 new tool: search_and_scrape
// Pure orchestration: search_auto -> concurrent fetchUrl / pdfParse
// No new helpers — fully reuses existing tools.
// =====================================================================

async function searchAndScrape(args) {
  const query = requireString(args.query, "query");
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
  const maxChars = Math.min(Math.max(Number(args.maxCharsPerPage) || 8000, 500), 20000);
  const recencyDays = Number(args.recencyDays) || undefined;
  const enginesOverride = Array.isArray(args.engines) && args.engines.length ? args.engines : undefined;

  const startedAt = Date.now();
  // Hard cap on total wall time
  const TOTAL_TIMEOUT_MS = 30000;
  const hardDeadline = startedAt + TOTAL_TIMEOUT_MS;

  // Phase 1: search
  const searchArgs = { query, limit, _providerConfig: args?._providerConfig };
  if (recencyDays) searchArgs.recency_days = recencyDays;
  if (enginesOverride) searchArgs.engines = enginesOverride;

  let searchResult;
  try {
    searchResult = await searchAuto(searchArgs);
  } catch (e) {
    return {
      ok: false,
      query,
      error: `search failed: ${String(e?.message || e)}`,
      stats: { elapsed_ms: Date.now() - startedAt }
    };
  }
  const candidates = Array.isArray(searchResult?.results) ? searchResult.results : [];
  if (!candidates.length) {
    return {
      ok: true,
      query,
      results: [],
      stats: {
        elapsed_ms: Date.now() - startedAt,
        search_total: 0,
        fetched_total: 0,
        succeeded: 0,
        failed: 0,
        engines_attempted: Array.isArray(searchResult?.attempts) ? searchResult.attempts.length : 0
      },
      note: "no search results returned — try a different query or remove recency filter",
      search_attempts: Array.isArray(searchResult?.attempts) ? searchResult.attempts : undefined
    };
  }

  // Phase 2: concurrent fetch with simple bounded parallelism (4)
  const CONCURRENCY = 4;
  const results = new Array(candidates.length);
  let cursor = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (cursor < candidates.length) {
      if (Date.now() > hardDeadline) break;
      const idx = cursor++;
      const item = candidates[idx];
      const url = String(item.url || item.href || "").trim();
      const title = String(item.title || "").trim();
      const snippet = String(item.snippet || item.description || "").trim();

      if (!url || !/^https?:\/\//i.test(url)) {
        results[idx] = {
          title, url, snippet, ok: false, error: "invalid or missing url", content_type: "skipped"
        };
        failed++;
        continue;
      }

      // PDF detection: URL suffix or content-type probe
      const looksLikePdf = /\.pdf(\?|#|$)/i.test(url);

      try {
        let res;
        if (looksLikePdf) {
          // Fast path: URL ends in .pdf — go straight to pdfParse
          res = await pdfParse({ url, maxChars });
        } else {
          // Ambiguous URL — fetch first, then branch on content-type
          // We use fetchUrl for HTML, but probe content-type to detect hidden PDFs
          // (e.g. arxiv.org/pdf/1706.03762 — URL has /pdf/ path segment, not .pdf suffix)
          // Strategy: lightweight probe via fetchUrl, check contentType, if PDF then re-parse
          res = await fetchUrl({ url, maxChars });
          // If fetchUrl returned a PDF content-type but garbled text, re-route through pdfParse
          const ct = String(res?.contentType || "").toLowerCase();
          if (res?.ok && ct.includes("pdf")) {
            try {
              const pdfRes = await pdfParse({ url, maxChars });
              if (pdfRes?.ok) {
                res = { ...pdfRes, _rerouted: true };
              }
            } catch {
              // keep original fetchUrl result
            }
          }
        }
        if (res?.ok) {
          const isPdf = /\.pdf/i.test(res.contentType || "") || /\.pdf(\?|#|$)/i.test(res.finalUrl || url);
          const contentType = isPdf ? "pdf" : "html";
          const text = isPdf ? res.text : res.text;
          results[idx] = {
            title,
            url,
            finalUrl: res.finalUrl || url,
            snippet,
            ok: true,
            content_type: contentType,
            text_length: res.text_length || (text ? text.length : 0),
            text: text || "",
            truncated: res.truncated || false
          };
          succeeded++;
        } else {
          results[idx] = {
            title, url, snippet, ok: false,
            content_type: looksLikePdf ? "pdf" : "html",
            error: res?.error || "fetch failed",
            status: res?.status
          };
          failed++;
        }
      } catch (e) {
        results[idx] = {
          title, url, snippet, ok: false,
          content_type: looksLikePdf ? "pdf" : "html",
          error: String(e?.message || e)
        };
        failed++;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, candidates.length); i++) workers.push(worker());
  await Promise.all(workers);

  // Filter to remove empty slots (shouldn't exist, but defensive)
  const out = results.filter(Boolean);

  const elapsed = Date.now() - startedAt;
  const deadlineHit = elapsed >= TOTAL_TIMEOUT_MS - 500; // within 500ms of deadline

  return {
    ok: true,
    query,
    results: out,
    stats: {
      elapsed_ms: elapsed,
      search_total: candidates.length,
      fetched_total: out.length,
      succeeded,
      failed,
      concurrency: CONCURRENCY,
      deadline_hit: deadlineHit,
      engines_attempted: Array.isArray(searchResult?.attempts) ? searchResult.attempts.length : 0
    },
    search_attempts: Array.isArray(searchResult?.attempts) ? searchResult.attempts.slice(0, 5) : undefined,
    _meta: { orchestrator: "search-and-scrape-v1" }
  };
}

var GSA_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Safari/537.36 Edg/125.0.2535.92",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36",
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Linux; Android 13; CPH2449) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36"
];
function randomGsaUA() {
  return GSA_USER_AGENTS[Math.floor(Math.random() * GSA_USER_AGENTS.length)];
}
__name(randomGsaUA, "randomGsaUA");
__name2(randomGsaUA, "randomGsaUA");
async function fetchWithUA(url, headers, options = {}) {
  const retries = options.retries ?? 1;
  const baseDelay = options.retryDelay ?? 200;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers,
        redirect: "follow"
      });
      if (!response.ok && [502, 503, 504].includes(response.status) && attempt < retries) {
        clearTimeout(timer);
        const sleep = baseDelay * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise((r) => setTimeout(r, sleep));
        continue;
      }
      if (!response.ok) throw new Error(`upstream ${response.status} for ${url}`);
      const maxBytes = options.maxBytes || MAX_FETCH_BYTES;
      const reader = response.body?.getReader();
      if (!reader) return { text: await response.text(), response };
      const chunks = [];
      let size = 0;
      while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
      }
      const merged = new Uint8Array(Math.min(size, maxBytes));
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk.slice(0, merged.length - offset), offset);
        offset += chunk.byteLength;
        if (offset >= merged.length) break;
      }
      return { text: new TextDecoder().decode(merged), response };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries && err.name !== "AbortError") {
        const sleep = baseDelay * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise((r) => setTimeout(r, sleep));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
__name(fetchWithUA, "fetchWithUA");
__name2(fetchWithUA, "fetchWithUA");
async function fetchTextWithResponse(url, options = {}) {
  return fetchWithUA(url, {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
  }, options);
}
__name(fetchTextWithResponse, "fetchTextWithResponse");
__name2(fetchTextWithResponse, "fetchTextWithResponse");
async function fetchText(url, options = {}) {
  const { text } = await fetchTextWithResponse(url, options);
  return text;
}
__name(fetchText, "fetchText");
__name2(fetchText, "fetchText");
var searchCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 5 * 60 * 1e3;
var CIRCUIT_BREAKER = /* @__PURE__ */ new Map();
var CIRCUIT_THRESHOLD = 3;
var CIRCUIT_FREEZE_MS = 5 * 60 * 1e3;
// ── JUNK soft-freeze: 2 consecutive JUNK → 1 min freeze ──
var JUNK_FREEZE_THRESHOLD = 2;
var JUNK_FREEZE_MS = 60 * 1e3;
var JUNK_TRACKER = /* @__PURE__ */ new Map();
var ENGINE_HEALTH = /* @__PURE__ */ new Map();
var ENGINE_HEALTH_WINDOW_MS = 60 * 60 * 1e3;
function recordEngineHealthEvent(engine, event) {
  const now = Date.now();
  let health = ENGINE_HEALTH.get(engine);
  if (!health) { health = { events: [] }; ENGINE_HEALTH.set(engine, health); }
  health.events.push({ event, ts: now });
  health.events = health.events.filter((e) => now - e.ts < ENGINE_HEALTH_WINDOW_MS);
}
__name(recordEngineHealthEvent, "recordEngineHealthEvent");
__name2(recordEngineHealthEvent, "recordEngineHealthEvent");
function getEngineHealthStats() {
  const now = Date.now();
  const stats = {};
  for (const [engine, health] of ENGINE_HEALTH.entries()) {
    const recent = health.events.filter((e) => now - e.ts < ENGINE_HEALTH_WINDOW_MS);
    const total = recent.length;
    const blocked = recent.filter((e) => e.event === "blocked").length;
    const success = recent.filter((e) => e.event === "success").length;
    const empty = recent.filter((e) => e.event === "empty").length;
    stats[engine] = { total, blocked, success, empty, block_rate: total > 0 ? Math.round(blocked / total * 100) : 0 };
  }
  return stats;
}
__name(getEngineHealthStats, "getEngineHealthStats");
__name2(getEngineHealthStats, "getEngineHealthStats");
function isEngineCircuitBroken(engine) {
  const record = CIRCUIT_BREAKER.get(engine);
  if (!record) return false;
  if (Date.now() > record.frozenUntil) { CIRCUIT_BREAKER.delete(engine); return false; }
  return true;
}
__name(isEngineCircuitBroken, "isEngineCircuitBroken");
__name2(isEngineCircuitBroken, "isEngineCircuitBroken");
// ── JUNK soft-freeze: check + record + reset ──
function isEngineJunkFrozen(engine) {
  const rec = JUNK_TRACKER.get(engine);
  if (!rec || !rec.frozenUntil) return false;
  if (Date.now() > rec.frozenUntil) { JUNK_TRACKER.delete(engine); return false; }
  return true;
}
__name(isEngineJunkFrozen, "isEngineJunkFrozen");
__name2(isEngineJunkFrozen, "isEngineJunkFrozen");
function recordEngineJunk(engine) {
  const rec = JUNK_TRACKER.get(engine) || { count: 0, frozenUntil: 0 };
  rec.count++;
  if (rec.count >= JUNK_FREEZE_THRESHOLD) {
    rec.frozenUntil = Date.now() + JUNK_FREEZE_MS;
    rec.count = 0;
  }
  JUNK_TRACKER.set(engine, rec);
  recordEngineHealthEvent(engine, "junk");
}
__name(recordEngineJunk, "recordEngineJunk");
__name2(recordEngineJunk, "recordEngineJunk");
function resetEngineJunk(engine) {
  JUNK_TRACKER.delete(engine);
}
__name(resetEngineJunk, "resetEngineJunk");
__name2(resetEngineJunk, "resetEngineJunk");
function recordEngineBlocked(engine) {
  const record = CIRCUIT_BREAKER.get(engine) || { failures: 0, frozenUntil: 0 };
  record.failures++;
  if (record.failures >= CIRCUIT_THRESHOLD) {
    record.frozenUntil = Date.now() + CIRCUIT_FREEZE_MS;
    record.failures = 0;
  }
  CIRCUIT_BREAKER.set(engine, record);
  recordEngineHealthEvent(engine, "blocked");
}
__name(recordEngineBlocked, "recordEngineBlocked");
__name2(recordEngineBlocked, "recordEngineBlocked");
function recordEngineSuccess(engine) {
  CIRCUIT_BREAKER.delete(engine);
  recordEngineHealthEvent(engine, "success");
}
__name(recordEngineSuccess, "recordEngineSuccess");
__name2(recordEngineSuccess, "recordEngineSuccess");
function getCached(key) {
  const entry = searchCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  if (entry) searchCache.delete(key);
  return null;
}
__name(getCached, "getCached");
function setCache(key, data) {
  if (searchCache.size > 200) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
  searchCache.set(key, { data, ts: Date.now() });
}
__name(setCache, "setCache");
__name2(getCached, "getCached");
__name2(setCache, "setCache");
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const headers = {
      Accept: "application/json",
      "User-Agent": `${SERVER_NAME}/${SERVER_VERSION} (https://search-mcp.qdp.qzz.io)`,
      ...options.headers || {}
    };
    const response = await fetch(url, { signal: controller.signal, headers, redirect: "follow" });
    if (!response.ok) throw new Error(`upstream ${response.status} for ${url}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchJson, "fetchJson");
__name2(fetchJson, "fetchJson");
async function fetchArxivAtom(url, options = {}) {
  return fetchWithUA(url, {
    Accept: "application/atom+xml",
    "User-Agent": `${SERVER_NAME}/${SERVER_VERSION} (https://search-mcp.qdp.qzz.io)`
  }, options);
}
__name(fetchArxivAtom, "fetchArxivAtom");
__name2(fetchArxivAtom, "fetchArxivAtom");
function providerList() {
  const out = {};
  for (const [k, v] of Object.entries(PROVIDER_CONFIG)) {
    out[k] = { enabled: v.enabled !== false, baseUrl: v.baseUrl || "", apiKeyConfigured: !!v.apiKey, apiKeyMasked: maskSecret(v.apiKey) };
  }
  return { ok: true, providers: out };
}
function providerSetConfig(args) {
  const name = String(args.provider || "").toLowerCase();
  if (!name || !PROVIDER_CONFIG[name]) throw new Error(`unsupported provider: ${name}`);
  if (typeof args.api_key === "string") PROVIDER_CONFIG[name].apiKey = args.api_key.trim();
  if (typeof args.base_url === "string") PROVIDER_CONFIG[name].baseUrl = args.base_url.trim();
  if (typeof args.enabled === "boolean") PROVIDER_CONFIG[name].enabled = args.enabled;
  return { ok: true, provider: name, config: { enabled: PROVIDER_CONFIG[name].enabled !== false, baseUrl: PROVIDER_CONFIG[name].baseUrl || "", apiKeyMasked: maskSecret(PROVIDER_CONFIG[name].apiKey) } };
}
function providerGetConfig(args) {
  const name = String(args.provider || "").toLowerCase();
  if (!name || !PROVIDER_CONFIG[name]) throw new Error(`unsupported provider: ${name}`);
  const v = PROVIDER_CONFIG[name];
  return { ok: true, provider: name, config: { enabled: v.enabled !== false, baseUrl: v.baseUrl || "", apiKeyConfigured: !!v.apiKey, apiKeyMasked: maskSecret(v.apiKey) } };
}
function providerSetSpecificConfig(provider, args) {
  const merged = { ...args, provider };
  return providerSetConfig(merged);
}
async function searchOllama(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const providerConfig = args?._context?.providerConfig;
  const apiKey = getProviderApiKey("ollama", "OLLAMA_API_KEY", providerConfig);
  const endpoint = getProviderBaseUrl("ollama", "https://api.ollama.com/v1/web-search", providerConfig);
  if (!apiKey) return searchError("ollama", query, limit, "missing OLLAMA_API_KEY. Use provider_set_config or x-ollama-api-key header to set it.");
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": `${SERVER_NAME}/${SERVER_VERSION}`
      },
      body: JSON.stringify({ query, max_results: limit })
    });
    if (!resp.ok) return searchError("ollama", query, limit, `upstream ${resp.status}`);
    const data = await resp.json();
    const items = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : [];
    const results = items.slice(0, limit).map((it) => ({
      title: it.title || it.name || it.url || "",
      url: it.url || it.link || "",
      snippet: (it.snippet || it.description || it.content || "").toString().slice(0, 300)
    })).filter((x) => x.url || x.title);
    return searchResult({ source: "ollama", query, limit, results, fetch_path: safeHostname(endpoint) });
  } catch (error) {
    return searchError("ollama", query, limit, error?.message || "failed");
  }
}
async function searchParallel(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const providerConfig = args?._context?.providerConfig;
  const apiKey = getProviderApiKey("parallel", "PARALLEL_API_KEY", providerConfig);
  const endpoint = getProviderBaseUrl("parallel", "https://api.parallel.ai/v1/search", providerConfig);
  if (!apiKey) return searchError("parallel", query, limit, "missing PARALLEL_API_KEY. Use provider_set_config to set it.");
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `${SERVER_NAME}/${SERVER_VERSION}`
      },
      body: JSON.stringify({ search_queries: [query] })
    });
    if (!resp.ok) return searchError("parallel", query, limit, `upstream ${resp.status}`);
    const data = await resp.json();
    const items = Array.isArray(data?.results) ? data.results : [];
    const results = [];
    for (const item of items) {
      if (results.length >= limit) break;
      const excerpts = Array.isArray(item?.excerpts) ? item.excerpts.join(" ").slice(0, 300) : "";
      results.push({
        title: item.title || item.url || "",
        url: item.url || "",
        snippet: excerpts
      });
    }
    return searchResult({ source: "parallel", query, limit, results, fetch_path: safeHostname(endpoint) });
  } catch (error) {
    return searchError("parallel", query, limit, error?.message || "failed");
  }
}
async function searchSiteTargetVertical(args, { source, host, preferredEngines = [searchSogou, searchBing, searchGoogle, searchBaidu, searchYandex] }) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const composed = `site:${host} ${query}`;
  try {
    const { text } = await fetchTextWithResponse(`https://www.sogou.com/web?query=${encodeURIComponent(composed)}`);
    const seen = /* @__PURE__ */ new Set();
    const raw = [];
    const re = /<h3[^>]*>[\s\S]*?<a[^>]+href=("([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of text.matchAll(re)) {
      if (raw.length >= Math.max(limit * 8, 16)) break;
      let url = decodeSogouUrl(decodeHtml(match[2] || match[3] || ""));
      const title = cleanText(match[4]);
      if (!title || title.length < 2) continue;
      if (url.startsWith("javascript:") || url === "#" || url === "/") continue;
      if (!url.startsWith("http")) url = decodeSogouUrl(`https://www.sogou.com${url}`);
      if (seen.has(url) || isNoiseUrl(url) || isSogouNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
      seen.add(url);
      raw.push({ title, url, snippet: "" });
    }
    const filtered = filterSiteTargetedResults(raw, { host }, Math.max(limit * 4, 8));
    if (filtered.length) {
      return finalizeVerticalSearchResults({ source, query, limit, results: filtered, blocked: false, block_reason: "", strategy: "site-targeted-fallback", fetch_path: "sogou" });
    }
  } catch {
  }
  for (const fn of preferredEngines) {
    try {
      const result = await fn({ query: composed, limit: Math.max(limit * 4, 8) });
      const filtered = filterSiteTargetedResults(result.results, { host }, Math.max(limit * 4, 8));
      if (filtered.length) {
        return finalizeVerticalSearchResults({ source, query, limit, results: filtered, blocked: result?.blocked, block_reason: result?.block_reason || "", strategy: "site-targeted-fallback", fetch_path: result?.fetch_path || result?.source || "" });
      }
    } catch {
    }
  }
  return searchResult({ source, query, limit, results: [], strategy: "site-targeted-fallback" });
}
__name(searchSiteTargetVertical, "searchSiteTargetVertical");
__name2(searchSiteTargetVertical, "searchSiteTargetVertical");

function searchError(source, query, limit, error, extra = {}) {
  return searchResult({ source, query, limit, results: [], error: typeof error === "string" ? error : error?.message || "failed", ...extra });
}
__name(searchError, "searchError");
__name2(searchError, "searchError");
function searchResult({ source, query, limit, results, blocked, block_reason, ...extra }) {
  const hasResults = Array.isArray(results) && results.length > 0;
  const parser = extra._meta?.parser || (hasResults && results.some((r) => r.__skeleton) ? "skeleton_fallback" : hasResults ? "exact" : void 0);
  const clean = hasResults ? results.map(({ __skeleton, ...r }) => r) : results;
  return {
    ok: hasResults,
    source,
    query,
    limit,
    results: clean,
    ...hasResults ? {} : blocked !== void 0 ? { blocked: Boolean(blocked) } : {},
    ...hasResults ? {} : block_reason ? { block_reason } : {},
    ...parser ? { _meta: { parser } } : {},
    ...extra
  };
}
__name(searchResult, "searchResult");
__name2(searchResult, "searchResult");
function formatSearchResponse(result) {
  const ts = `[${new Date().toISOString()}]`;
  if (!result.results.length) {
    if (result.blocked && result.block_reason) {
      return `${ts} ${capitalize(result.source || "search")} search for "${result.query}" is blocked by upstream: ${result.block_reason}.`;
    }
    return `${ts} ${result.error || `${capitalize(result.source || "search")} search for "${result.query}" returned no parsed results.`}`;
  }
  const isAggregated = result.source === "auto" || Array.isArray(result.sources) && result.sources.length > 1;
  const heading = isAggregated ? `Auto aggregated search results for "${result.query}":` : `${capitalize(result.source || "search")} search results for "${result.query}":`;
  return [
    `${ts} ${heading}`,
    "",
    ...result.results.map((item, index) => {
      const itemSources = Array.isArray(item.sources) ? item.sources.filter(Boolean) : [];
      const sourceLabel = isAggregated || itemSources.length > 1 ? `[${itemSources.length ? itemSources.join(", ") : item.source || result.source || "search"}] ` : "";
      return `${index + 1}. ${sourceLabel}${item.title}
${item.url}
${item.snippet || ""}`;
    })
  ].join("\n");
}
__name(formatSearchResponse, "formatSearchResponse");
__name2(formatSearchResponse, "formatSearchResponse");
function formatGitHubFileResponse(result) {
  return `[${new Date().toISOString()}] ${result.owner}/${result.repo}/${result.path}@${result.ref}

${result.content}`;
}
__name(formatGitHubFileResponse, "formatGitHubFileResponse");
__name2(formatGitHubFileResponse, "formatGitHubFileResponse");
function formatMetadataResponse(result) {
  return `[${new Date().toISOString()}]\n${JSON.stringify(result, null, 2)}`;
}
__name(formatMetadataResponse, "formatMetadataResponse");
__name2(formatMetadataResponse, "formatMetadataResponse");
function formatFetchUrlResponse(result) {
  return `[${new Date().toISOString()}] ${result.title}

URL: ${result.url}
Final URL: ${result.finalUrl}

${result.text}`;
}
__name(formatFetchUrlResponse, "formatFetchUrlResponse");
__name2(formatFetchUrlResponse, "formatFetchUrlResponse");
function formatDebugCaptureResponse(result) {
  return `[${new Date().toISOString()}]\n${JSON.stringify(result, null, 2)}`;
}
__name(formatDebugCaptureResponse, "formatDebugCaptureResponse");
__name2(formatDebugCaptureResponse, "formatDebugCaptureResponse");
function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
__name(capitalize, "capitalize");
__name2(capitalize, "capitalize");
function buildSearchDebugUrl(engine, query, limit, language) {
  if (engine === "bing") return `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`;
  if (engine === "yahoo") return `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}`;
  if (engine === "yandex") {
    const lang = /^[a-z-]{2,12}$/i.test(language || "") ? language : "en";
    return `https://yandex.com/search/?text=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`;
  }
  throw new Error("engine must be bing, yahoo, or yandex");
}
__name(buildSearchDebugUrl, "buildSearchDebugUrl");
__name2(buildSearchDebugUrl, "buildSearchDebugUrl");
function diagnoseSearchHtml(engine, html, finalUrl = "") {
  const haystack = `${finalUrl}
${html}`.toLowerCase();
  const finalHost = safeHostname(finalUrl);
  if (engine === "duckduckgo") {
    const hasResultMarkers = /result__a|result-link|uddg=/.test(haystack);
    if (/anomaly|automated requests|unusual traffic|captcha/i.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
    if (!hasResultMarkers && /robot/i.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "google") {
    if (/sorry|unusual traffic|detected unusual traffic|our systems have detected|captcha/i.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "baidu") {
    if (/验证码|安全验证|请输入验证码|antispam|passport\.baidu\.com/i.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "yandex") {
    if (/showcaptchafast|smartcaptcha|captcha|robot check|are you a robot|unusual traffic/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "bing") {
    const hasBingResultMarkers = /id=["']b_results["']|id=["']b_content["']|class=["'][^"']*b_algo[^"']*["']/.test(haystack);
    if (!hasBingResultMarkers && finalHost.endsWith("bing.com") && /(?:id|class)=["'][^"']*(?:b_captcha|b_cf|captcha)[^"']*["']/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
    if (!hasBingResultMarkers && /our systems have detected unusual traffic|verify you are human|please solve the challenge below/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "yahoo") {
    const hasYahooResultMarkers = /id=["']web["']|searchcentermiddle|algo-sr|comptitle|class=["'][^"']*algo[^"']*["']|class=["'][^"']*s-title[^"']*["']/.test(haystack);
    if (!hasYahooResultMarkers && (finalHost === "consent.yahoo.com" || /privacy choices|privacykeuzes|collectconsent|guce|id=["']consent-page["']|class=["'][^"']*consent-form[^"']*["']|tcf2-layer1/i.test(haystack))) {
      return { blocked: true, reason: "consent_page" };
    }
    if (/captcha|human verification|unusual traffic|press & hold/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  return { blocked: false, reason: "" };
}
__name(diagnoseSearchHtml, "diagnoseSearchHtml");
__name2(diagnoseSearchHtml, "diagnoseSearchHtml");
function extractSearchDebugExcerpt(engine, html, maxChars) {
  const markers = {
    bing: ['id="b_results"', "id='b_results'", 'class="b_algo"', "class='b_algo'", 'id="b_content"', 'class="b_searchboxForm"'],
    yahoo: ['id="web"', "id='web'", 'class="algo-sr"', "class='algo-sr'", 'class="searchCenterMiddle"', "class='searchCenterMiddle'"],
    yandex: ["showcaptcha", "smartcaptcha", "serp-list", "main__result", "Organic", "serp-item"]
  }[engine] || [];
  for (const marker of markers) {
    const markerIndex = html.toLowerCase().indexOf(marker.toLowerCase());
    if (markerIndex >= 0) {
      const offset = Math.max(0, markerIndex - Math.floor(maxChars * 0.25));
      const sample = html.slice(offset, offset + maxChars);
      return { marker, markerIndex, offset, sample, truncated: offset > 0 || offset + maxChars < html.length };
    }
  }
  return { marker: "", markerIndex: -1, offset: 0, sample: html.slice(0, maxChars), truncated: html.length > maxChars };
}
__name(extractSearchDebugExcerpt, "extractSearchDebugExcerpt");
__name2(extractSearchDebugExcerpt, "extractSearchDebugExcerpt");
function decodeDuckUrl(href) {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return href;
  }
}
__name(decodeDuckUrl, "decodeDuckUrl");
__name2(decodeDuckUrl, "decodeDuckUrl");
function isDuckDuckGoNoiseUrl(url) {
  return /duckduckgo\.com\/(?:duckduckgo-help-pages|y\.js\?|traffic\.js\?|iu\/)/i.test(String(url || ""));
}
__name(isDuckDuckGoNoiseUrl, "isDuckDuckGoNoiseUrl");
__name2(isDuckDuckGoNoiseUrl, "isDuckDuckGoNoiseUrl");
function extractBingResults(html, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const baseUrl = "https://www.bing.com";
  const narrowedHtml = extractSectionAroundMarker(html, ['id="b_results"', "id='b_results'", 'id="b_content"', "id='b_content'"], 18e4) || html;
  const blockPatterns = [
    /<li[^>]+class=(?:"[^"]*b_algo[^"]*"|'[^']*b_algo[^']*')[^>]*>[\s\S]*?<\/li>/gi,
    /<div[^>]+class=(?:"[^"]*b_algo[^"]*"|'[^']*b_algo[^']*')[^>]*>[\s\S]*?<\/div>/gi,
    /<article[^>]+class=(?:"[^"]*b_algo[^"]*"|'[^']*b_algo[^']*')[^>]*>[\s\S]*?<\/article>/gi
  ];
  const blocks = [];
  for (const pattern of blockPatterns) {
    for (const match of narrowedHtml.matchAll(pattern)) blocks.push(match[0]);
  }
  for (const block of blocks) {
    if (results.length >= limit) break;
    const result = parseBingBlock(block, baseUrl);
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
  }
  if (results.length) return results;
  const primarySection = extractSectionAroundMarker(narrowedHtml, ['id="b_results"', "id='b_results'", 'id="b_content"', "id='b_content'"], 12e4) || narrowedHtml;
  for (const item of extractGenericLinks(primarySection, limit * 4, baseUrl)) {
    if (results.length >= limit) break;
    const url = decodeBingUrl(item.url);
    if (seen.has(url) || isNoiseUrl(url) || isBingNoiseUrl(url)) continue;
    if (!looksLikeSearchResultUrl(url)) continue;
    seen.add(url);
    results.push({ ...item, url });
  }
  return results;
}
__name(extractBingResults, "extractBingResults");
__name2(extractBingResults, "extractBingResults");
function parseBingBlock(block, baseUrl) {
  const headerMatch = block.match(/<(?:h2|h3)[^>]*>[\s\S]*?<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>[\s\S]*?<\/(?:h2|h3)>/i);
  if (headerMatch) {
    const attrs = `${headerMatch[1] || ""} ${headerMatch[6] || ""}`;
    const rawHref = decodeHtml(headerMatch[3] || headerMatch[4] || headerMatch[5] || "");
    const title = normalizeBingTitle(cleanText(headerMatch[7]), rawHref);
    if (rawHref && !/^(?:javascript:|#)/i.test(rawHref) && title && title.length >= 2 && !/(?:b_attribution|b_footnote|b_img|cico|expand|share|feedback|musCard|b_pag|b_richcard|b_algoarea|overlay)/i.test(attrs)) {
      let url;
      try {
        url = decodeBingUrl(new URL(rawHref, baseUrl).toString());
      } catch {
        url = decodeBingUrl(rawHref);
      }
      if (!isNoiseUrl(url) && !isBingNoiseUrl(url) && looksLikeSearchResultUrl(url)) {
        const snippet = extractBingSnippet(block, title);
        return { title, url, snippet };
      }
    }
  }
  const candidates = [...block.matchAll(/<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of candidates) {
    const attrs = `${match[1] || ""} ${match[6] || ""}`;
    if (/(?:b_attribution|b_footnote|b_img|cico|expand|share|feedback|musCard|b_pag|b_richcard|b_algoarea|overlay|tilk|siteicon)/i.test(attrs)) continue;
    const rawHref = decodeHtml(match[3] || match[4] || match[5] || "");
    if (!rawHref || /^(?:javascript:|#)/i.test(rawHref)) continue;
    let url;
    try {
      url = decodeBingUrl(new URL(rawHref, baseUrl).toString());
    } catch {
      url = decodeBingUrl(rawHref);
    }
    if (isNoiseUrl(url) || isBingNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    const title = normalizeBingTitle(cleanText(match[7]), rawHref);
    if (!title || title.length < 2) continue;
    const snippet = extractBingSnippet(block, title);
    return { title, url, snippet };
  }
  return null;
}
__name(parseBingBlock, "parseBingBlock");
__name2(parseBingBlock, "parseBingBlock");
function extractBingSnippet(block, title) {
  const snippetPatterns = [
    { pattern: /<(?:div|p|span)[^>]+class=("([^"]*(?:b_caption|b_lineclamp|b_snippet|b_algoSlug|b_paractl|b_secondaryText)[^"]*)"|'([^']*(?:b_caption|b_lineclamp|b_snippet|b_algoSlug|b_paractl|b_secondaryText)[^']*)')[^>]*>([\s\S]*?)<\/(?:div|p|span)>/gi, contentIndex: 4 },
    { pattern: /<(?:div|p|span)[^>]+data-[^>]*>([\s\S]*?)<\/(?:div|p|span)>/gi, contentIndex: 1 },
    { pattern: /<p[^>]*>([\s\S]*?)<\/p>/gi, contentIndex: 1 }
  ];
  for (const { pattern, contentIndex } of snippetPatterns) {
    for (const match of block.matchAll(pattern)) {
      const snippet = cleanText(match[contentIndex] || "");
      if (snippet && snippet !== title && snippet.length > 20) return snippet;
    }
  }
  return "";
}
__name(extractBingSnippet, "extractBingSnippet");
__name2(extractBingSnippet, "extractBingSnippet");
function decodeBingUrl(href) {
  try {
    const url = new URL(decodeHtml(String(href || "")), "https://www.bing.com");
    for (const key of ["u", "url", "target", "r", "redir", "ru"]) {
      const target = url.searchParams.get(key);
      if (target) {
        const stripped = safelyDecodeUrlComponent(target).replace(/^a1/i, "");
        const decoded = normalizeUrlCandidate(decodeBase64Urlish(stripped) || stripped);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    const pathMatch = url.pathname.match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      const stripped = safelyDecodeUrlComponent(pathMatch[1]).replace(/^a1/i, "");
      const decoded = normalizeUrlCandidate(decodeBase64Urlish(stripped) || stripped);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeBingUrl, "decodeBingUrl");
__name2(decodeBingUrl, "decodeBingUrl");
function decodeBase64Urlish(value) {
  const text = String(value || "").trim();
  if (!text || !/^[A-Za-z0-9+/=_-]+$/.test(text) || /^https?:\/\//i.test(text)) return "";
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  try {
    const decoded = atob(padded);
    return /^https?:\/\//i.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}
__name(decodeBase64Urlish, "decodeBase64Urlish");
__name2(decodeBase64Urlish, "decodeBase64Urlish");
function normalizeBingTitle(title, rawHref = "") {
  const text = String(title || "").trim();
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  const href = String(rawHref || "");
  const decodedTarget = decodeBingUrl(href);
  const tailFromBreadcrumbs = normalizeBingBreadcrumbTail(collapsed, decodedTarget);
  if (tailFromBreadcrumbs) return tailFromBreadcrumbs;
  const directHost = safeHostname(href);
  const targetHost = safeHostname(decodedTarget);
  const host = targetHost || directHost;
  const hostPattern = host ? host.replace(/^www\./i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  if (hostPattern) {
    const attributionPrefix = new RegExp(`^(?:${hostPattern})(?:\s+https?:\/\/\s*${hostPattern})?(?:\s+[›>»]\s+[^›>»]+)+\s+`, "i");
    const stripped = collapsed.replace(attributionPrefix, "").trim();
    if (stripped && stripped.length >= 2) return stripped;
  }
  return collapsed;
}
__name(normalizeBingTitle, "normalizeBingTitle");
__name2(normalizeBingTitle, "normalizeBingTitle");
function normalizeBingBreadcrumbTail(title, decodedTarget) {
  const collapsed = String(title || "").trim();
  if (!collapsed.includes("›") && !collapsed.includes(">") && !collapsed.includes("»")) return "";
  const parts = collapsed.split(/[›>»]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  let tail = parts[parts.length - 1] || "";
  const slugWords = bingTitleSlugWords(decodedTarget);
  const duplicateSlugTitle = tail.match(/^([a-z0-9]+(?:[-_][a-z0-9]+)+)\s+(.+)$/i);
  if (duplicateSlugTitle) {
    const slug = duplicateSlugTitle[1].replace(/[-_]+/g, " ").trim().toLowerCase();
    const remainder = duplicateSlugTitle[2].trim();
    if (slug && remainder && slug === remainder.toLowerCase()) return remainder;
  }
  if (slugWords) {
    const slugTokens = slugWords.split(/\s+/).filter(Boolean);
    if (slugTokens.length) {
      const joinedPattern = slugTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[-_\\s]+");
      const slugPrefix = new RegExp(`^(?:${joinedPattern})(?:\s+|$)`, "i");
      tail = tail.replace(slugPrefix, "").trim();
      if (!tail) return slugTokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
    }
  }
  return tail && tail.length >= 2 ? tail : "";
}
__name(normalizeBingBreadcrumbTail, "normalizeBingBreadcrumbTail");
__name2(normalizeBingBreadcrumbTail, "normalizeBingBreadcrumbTail");
function bingTitleSlugWords(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const segment = pathname.split("/").filter(Boolean).pop() || "";
    return segment.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().toLowerCase();
  } catch {
    return "";
  }
}
__name(bingTitleSlugWords, "bingTitleSlugWords");
__name2(bingTitleSlugWords, "bingTitleSlugWords");
function decodeGoogleUrl(href) {
  try {
    const url = new URL(decodeHtml(String(href || "")), "https://www.google.com");
    for (const key of ["q", "url", "target", "u"]) {
      const target = url.searchParams.get(key);
      if (!target) continue;
      const decoded = normalizeUrlCandidate(safelyDecodeUrlComponent(target));
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeGoogleUrl, "decodeGoogleUrl");
__name2(decodeGoogleUrl, "decodeGoogleUrl");
function isBingNoiseUrl(url) {
  return /bing\.com\/(?:search|images|videos|maps|news)|go\.microsoft\.com|r\.bing\.com|th\.bing\.com|cc\.bingj\.com/i.test(String(url || ""));
}
__name(isBingNoiseUrl, "isBingNoiseUrl");
__name2(isBingNoiseUrl, "isBingNoiseUrl");
function extractYahooResults(html, limit) {
  const diagnosis = diagnoseSearchHtml("yahoo", html);
  if (diagnosis.blocked) return [];
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const baseUrl = "https://search.yahoo.com";
  const narrowedHtml = extractSectionAroundMarker(html, ['id="web"', "id='web'", 'class="searchCenterMiddle"', "class='searchCenterMiddle'"], 18e4) || html;
  const blockPatterns = [
    /<div[^>]+class=(?:"[^"]*algo[^"]*sr[^"]*"|'[^']*algo[^']*sr[^']*')[^>]*>[\s\S]*?<\/div>/gi,
    /<li[^>]+class=(?:"[^"]*algo[^"]*sr[^"]*"|'[^']*algo[^']*sr[^']*')[^>]*>[\s\S]*?<\/li>/gi,
    /<div[^>]+class=(?:"[^"]*dd\s+algo[^"]*"|'[^']*dd\s+algo[^']*')[^>]*>[\s\S]*?<\/div>/gi
  ];
  const blocks = [];
  for (const pattern of blockPatterns) {
    for (const match of narrowedHtml.matchAll(pattern)) blocks.push(match[0]);
  }
  for (const block of blocks) {
    if (results.length >= limit) break;
    const result = parseYahooBlock(block, baseUrl);
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
  }
  if (results.length) return results;
  for (const item of extractGenericLinks(narrowedHtml, limit * 4, baseUrl)) {
    if (results.length >= limit) break;
    const url = decodeYahooUrl(item.url);
    if (seen.has(url) || isNoiseUrl(url) || isYahooNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    seen.add(url);
    results.push({ ...item, url });
  }
  return results;
}
__name(extractYahooResults, "extractYahooResults");
__name2(extractYahooResults, "extractYahooResults");
function parseYahooBlock(block, baseUrl) {
  const headerMatch = block.match(/<(?:h3|h4)[^>]*>[\s\S]*?<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>[\s\S]*?<\/(?:h3|h4)>/i);
  const candidates = headerMatch ? [headerMatch] : [...block.matchAll(/<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of candidates) {
    const attrs = `${match[1] || ""} ${match[6] || ""}`;
    if (/(?:favicon|img|icon|next|prev|pagination|more-res|sch-res-header|advertisement)/i.test(attrs)) continue;
    const rawHref = decodeHtml(match[3] || match[4] || match[5] || "");
    if (!rawHref || /^(?:javascript:|#)/i.test(rawHref)) continue;
    let url;
    try {
      url = decodeYahooUrl(new URL(rawHref, baseUrl).toString());
    } catch {
      url = decodeYahooUrl(rawHref);
    }
    if (isNoiseUrl(url) || isYahooNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    const title = cleanText(match[7]);
    if (!title || title.length < 2) continue;
    const snippet = extractYahooSnippet(block, title);
    return { title, url, snippet };
  }
  return null;
}
__name(parseYahooBlock, "parseYahooBlock");
__name2(parseYahooBlock, "parseYahooBlock");
function extractYahooSnippet(block, title) {
  const snippetPatterns = [
    { pattern: /<(?:div|p|span)[^>]+class=("([^"]*(?:compText|lh-22|fc-falcon|fz-ms|clr-grey|summary)[^"]*)"|'([^']*(?:compText|lh-22|fc-falcon|fz-ms|clr-grey|summary)[^']*)')[^>]*>([\s\S]*?)<\/(?:div|p|span)>/gi, contentIndex: 4 },
    { pattern: /<p[^>]*>([\s\S]*?)<\/p>/gi, contentIndex: 1 }
  ];
  for (const { pattern, contentIndex } of snippetPatterns) {
    for (const match of block.matchAll(pattern)) {
      const snippet = cleanText(match[contentIndex] || "");
      if (snippet && snippet !== title && snippet.length > 20) return snippet;
    }
  }
  return "";
}
__name(extractYahooSnippet, "extractYahooSnippet");
__name2(extractYahooSnippet, "extractYahooSnippet");
function decodeYahooUrl(href) {
  try {
    const url = new URL(decodeHtml(String(href || "")), "https://search.yahoo.com");
    for (const key of ["RU", "ru", "url", "target", "u"]) {
      const target = url.searchParams.get(key);
      if (target) return normalizeUrlCandidate(safelyDecodeUrlComponent(target));
    }
    const pathMatch = url.pathname.match(/\/RU=(.+?)(?:\/(?:RK|RS)=|$)/i);
    if (pathMatch?.[1]) {
      const decoded = normalizeUrlCandidate(safelyDecodeUrlComponent(pathMatch[1]));
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeYahooUrl, "decodeYahooUrl");
__name2(decodeYahooUrl, "decodeYahooUrl");
function extractHtmlAttribute(tag, name) {
  const match = String(tag || "").match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[2] || match?.[3] || match?.[4] || "").trim();
}
__name(extractHtmlAttribute, "extractHtmlAttribute");
__name2(extractHtmlAttribute, "extractHtmlAttribute");
function extractYahooConsentForm(html, fallbackUrl = "") {
  for (const formMatch of String(html || "").matchAll(/<form[^>]*>[\s\S]*?<\/form>/gi)) {
    const formHtml = formMatch[0];
    const fields = {};
    for (const inputMatch of formHtml.matchAll(/<input\b[^>]*>/gi)) {
      const inputTag = inputMatch[0];
      if (extractHtmlAttribute(inputTag, "type").toLowerCase() !== "hidden") continue;
      const name = extractHtmlAttribute(inputTag, "name");
      if (!name) continue;
      fields[name] = extractHtmlAttribute(inputTag, "value");
    }
    const formTagMatch = formHtml.match(/<form[^>]*>/i);
    const rawAction = extractHtmlAttribute(formTagMatch?.[0] || "", "action");
    let action = rawAction ? (() => {
      try {
        return new URL(rawAction, fallbackUrl || "https://consent.yahoo.com/").toString();
      } catch {
        return rawAction;
      }
    })() : fallbackUrl || fields.sessionId ? `https://consent.yahoo.com/v2/collectConsent?sessionId=${encodeURIComponent(fields.sessionId || "")}` : "https://consent.yahoo.com/v2/collectConsent";
    if (!/consent\.yahoo\.com\/v2\/collectConsent/i.test(action)) continue;
    if (Object.keys(fields).length) return { action, fields };
  }
  return null;
}
__name(extractYahooConsentForm, "extractYahooConsentForm");
__name2(extractYahooConsentForm, "extractYahooConsentForm");
function mergeYahooCookies(existingCookie, setCookieHeaders) {
  const cookieMap = /* @__PURE__ */ new Map();
  for (const part of String(existingCookie || "").split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    cookieMap.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const headerList = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const headerValue of headerList) {
    for (const chunk of String(headerValue || "").split(/,(?=\s*[A-Za-z0-9_.-]+=)/)) {
      const firstPart = chunk.split(";")[0] || "";
      const index = firstPart.indexOf("=");
      if (index <= 0) continue;
      cookieMap.set(firstPart.slice(0, index).trim(), firstPart.slice(index + 1).trim());
    }
  }
  return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
__name(mergeYahooCookies, "mergeYahooCookies");
__name2(mergeYahooCookies, "mergeYahooCookies");
async function retryYahooWithConsentForm(url, headers, html, consentPageUrl = "") {
  const consentForm = extractYahooConsentForm(html, consentPageUrl);
  if (!consentForm) return null;
  const body = new URLSearchParams({ ...consentForm.fields, agree: "agree" }).toString();
  const consentResponse = await fetch(consentForm.action, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://consent.yahoo.com",
      "Referer": consentForm.action,
      "Accept": "text/html,*/*"
    },
    body,
    redirect: "manual"
  });
  if (consentResponse.status >= 400) throw new Error(`upstream ${consentResponse.status} for ${consentForm.action}`);
  const setCookieHeaders = typeof consentResponse.headers.getSetCookie === "function" ? consentResponse.headers.getSetCookie() : consentResponse.headers.get("set-cookie") || "";
  const mergedCookie = mergeYahooCookies(headers?.["Cookie"] || headers?.cookie || "", setCookieHeaders);
  const retryUrl = consentResponse.headers.get("location") || consentForm.fields.originalDoneUrl || url;
  return fetchWithUA(retryUrl, {
    ...headers,
    ...(mergedCookie ? { "Cookie": mergedCookie } : {}),
    "Referer": "https://consent.yahoo.com/",
    "Accept-Language": headers?.["Accept-Language"] || "en-US,en;q=0.9"
  });
}
__name(retryYahooWithConsentForm, "retryYahooWithConsentForm");
__name2(retryYahooWithConsentForm, "retryYahooWithConsentForm");
function isYahooNoiseUrl(url) {
  return /search\.yahoo\.com\/search|r\.search\.yahoo\.com|yahoo\.com\/(?:search|news|video|images)/i.test(String(url || ""));
}
__name(isYahooNoiseUrl, "isYahooNoiseUrl");
__name2(isYahooNoiseUrl, "isYahooNoiseUrl");
function decodeYandexUrl(href) {
  try {
    const decodedHref = decodeUnicodeEscapes(decodeHtml(String(href || "")));
    const direct = decodedHref.match(/(?:^|[?&])(?:target|img_url|rpt=img&url)=([^&]+)/i);
    if (direct?.[1]) return normalizeUrlCandidate(decodeUnicodeEscapes(safelyDecodeUrlComponent(direct[1])));
    const url = new URL(decodedHref, "https://yandex.com");
    for (const key of ["url", "to", "target", "u", "rdrnd", "img_url"]) {
      const target = url.searchParams.get(key);
      if (target) return normalizeUrlCandidate(decodeUnicodeEscapes(safelyDecodeUrlComponent(target)));
    }
    const pathMatch = url.pathname.match(/\/clck\/jsredir[^/]*\/D\?(.+)/i);
    if (pathMatch?.[1]) {
      const params = new URLSearchParams(pathMatch[1]);
      for (const key of ["url", "to", "target", "u"]) {
        const target = params.get(key);
        if (target) return normalizeUrlCandidate(decodeUnicodeEscapes(safelyDecodeUrlComponent(target)));
      }
    }
    return normalizeUrlCandidate(url.toString());
  } catch {
    return href;
  }
}
__name(decodeYandexUrl, "decodeYandexUrl");
__name2(decodeYandexUrl, "decodeYandexUrl");
function decodeSogouUrl(href) {
  try {
    const url = new URL(decodeHtml(String(href || "")), "https://www.sogou.com");
    for (const key of ["url", "target", "u", "ru"]) {
      const target = url.searchParams.get(key);
      if (!target) continue;
      const decoded = normalizeUrlCandidate(safelyDecodeUrlComponent(target));
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeSogouUrl, "decodeSogouUrl");
__name2(decodeSogouUrl, "decodeSogouUrl");
function isSogouNoiseUrl(url) {
  return /(?:^|\.)sogou\.com$/i.test(safeHostname(url)) && /\/web\?|\/sogou\?|\/\?(?:.*&)?s_from=/i.test(String(url || ""));
}
__name(isSogouNoiseUrl, "isSogouNoiseUrl");
__name2(isSogouNoiseUrl, "isSogouNoiseUrl");
function decodeUnicodeEscapes(value) {
  return String(value || "").replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
__name(decodeUnicodeEscapes, "decodeUnicodeEscapes");
__name2(decodeUnicodeEscapes, "decodeUnicodeEscapes");
function normalizeUrlCandidate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^\/\//.test(text)) return `https:${text}`;
  return text;
}
__name(normalizeUrlCandidate, "normalizeUrlCandidate");
__name2(normalizeUrlCandidate, "normalizeUrlCandidate");
function safelyDecodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
__name(safelyDecodeUrlComponent, "safelyDecodeUrlComponent");
__name2(safelyDecodeUrlComponent, "safelyDecodeUrlComponent");
function extractYandexResults(html, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const baseUrl = "https://yandex.com";
  const blockPattern = /<(?<tag>li|div)[^>]+class=(?:"[^"]*(?:serp-item|Organic(?:[\s_-]|$)|main__result|search-result)[^"]*"|'[^']*(?:serp-item|Organic(?:[\s_-]|$)|main__result|search-result)[^']*')[^>]*>[\s\S]*?<\/\k<tag>>/gi;
  const blocks = [...html.matchAll(blockPattern)].map((match) => match[0]);
  for (const block of blocks) {
    if (results.length >= limit) break;
    const result = parseYandexBlock(block, baseUrl);
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
  }
  if (results.length) return results;
  for (const item of extractGenericLinks(html, limit * 3, baseUrl)) {
    if (results.length >= limit) break;
    const url = decodeYandexUrl(item.url);
    if (seen.has(url) || isNoiseUrl(url)) continue;
    seen.add(url);
    results.push({ ...item, url });
  }
  return results;
}
__name(extractYandexResults, "extractYandexResults");
__name2(extractYandexResults, "extractYandexResults");
function parseYandexBlock(block, baseUrl) {
  const candidates = [...block.matchAll(/<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of candidates) {
    const attrs = `${match[1] || ""} ${match[6] || ""}`;
    if (/(?:serp-item__thumb|favicon|sitelink|related__link|navigation__link)/i.test(attrs)) continue;
    const rawHref = decodeHtml(match[3] || match[4] || match[5] || "");
    if (!rawHref) continue;
    if (/^(?:javascript:|#)/i.test(rawHref)) continue;
    let url;
    try {
      url = decodeYandexUrl(new URL(rawHref, baseUrl).toString());
    } catch {
      url = decodeYandexUrl(rawHref);
    }
    if (isNoiseUrl(url)) continue;
    const title = cleanText(match[7]);
    if (!title || title.length < 2) continue;
    if (/^(?:cache|translate|копия|ещ[её])$/i.test(title)) continue;
    const snippet = extractYandexSnippet(block, title);
    return { title, url, snippet };
  }
  return null;
}
__name(parseYandexBlock, "parseYandexBlock");
__name2(parseYandexBlock, "parseYandexBlock");
function extractYandexSnippet(block, title) {
  const snippetPatterns = [
    { pattern: /<(?:div|span|p)[^>]+class=("([^"]*(?:text-container|organic__text|ExtendedText-Container|TextContainer|organic__content-wrapper|path__text)[^"]*)"|'([^']*(?:text-container|organic__text|ExtendedText-Container|TextContainer|organic__content-wrapper|path__text)[^']*)')[^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi, contentIndex: 4 },
    { pattern: /<div[^>]+data-zone-name=("snippet"|'snippet')[^>]*>([\s\S]*?)<\/div>/gi, contentIndex: 2 },
    { pattern: /<div[^>]+role=("text"|'text')[^>]*>([\s\S]*?)<\/div>/gi, contentIndex: 2 }
  ];
  for (const { pattern, contentIndex } of snippetPatterns) {
    for (const match of block.matchAll(pattern)) {
      const raw = match[contentIndex] || "";
      const snippet = cleanText(raw);
      if (snippet && snippet !== title) return snippet;
    }
  }
  return "";
}
__name(extractYandexSnippet, "extractYandexSnippet");
__name2(extractYandexSnippet, "extractYandexSnippet");
function extractBaiduResults(html, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const blockPattern = /<div[^>]+class=(?:"[^"]*c-result result[^"]*"|'[^']*c-result result[^']*')[^>]*>[\s\S]*?<\/div>/gi;
  for (const match of html.matchAll(blockPattern)) {
    if (results.length >= limit) break;
    const block = match[0];
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = cleanText(titleMatch?.[1] || "");
    if (!title || title.length < 2 || isBaiduNoiseTitle(title)) continue;
    const url = extractBaiduResultUrl(block);
    if (!url || seen.has(url) || isNoiseUrl(url) || isBaiduNoiseUrl(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: "" });
  }
  return results;
}
__name(extractBaiduResults, "extractBaiduResults");
__name2(extractBaiduResults, "extractBaiduResults");
function extractBaiduJsonResults(data, limit) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const entries = Array.isArray(data?.feed?.entry) ? data.feed.entry : [];
  for (const entry of entries) {
    if (results.length >= limit) break;
    const title = cleanText(entry?.title || entry?.name || "");
    const url = normalizeUrlCandidate(String(entry?.url || entry?.link || "").trim());
    const snippet = cleanText(entry?.abs || entry?.desc || entry?.description || "");
    if (!title || title.length < 2 || isBaiduNoiseTitle(title)) continue;
    if (!url || seen.has(url) || isNoiseUrl(url) || isBaiduNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet });
  }
  return results;
}
__name(extractBaiduJsonResults, "extractBaiduJsonResults");
__name2(extractBaiduJsonResults, "extractBaiduJsonResults");
function extractBaiduResultUrl(block) {
  const rlDataUrl = block.match(/rl-link-data-url="([^"]+)"/i)?.[1];
  if (rlDataUrl) return decodeHtml(rlDataUrl);
  const dataLogMatch = block.match(/data-log="([^"]+)"/i)?.[1];
  if (dataLogMatch) {
    const decodedLog = decodeHtml(dataLogMatch);
    const muMatch = decodedLog.match(/&quot;mu&quot;:&quot;([^&]+?)&quot;/i) || decodedLog.match(/"mu":"([^"]+)"/i);
    if (muMatch?.[1]) return decodeHtml(muMatch[1]);
  }
  const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>/i);
  return linkMatch?.[1] ? decodeHtml(linkMatch[1]) : "";
}
__name(extractBaiduResultUrl, "extractBaiduResultUrl");
__name2(extractBaiduResultUrl, "extractBaiduResultUrl");
function extractGenericLinks(html, limit, baseUrl) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const blockRe = /<(li|div|section|article)[^>]*>([\s\S]*?)<\/\1>/gi;
  let bm;
  while ((bm = blockRe.exec(html)) !== null) {
    if (results.length >= limit) break;
    const block = bm[2];
    if (!block.includes("<a") || block.length > 2000) continue;
    const aMatch = block.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;
    const rawUrl = aMatch[1];
    const rawTitle = stripTags(aMatch[2]);
    if (!rawTitle || rawTitle.length < 6 || seen.has(rawUrl)) continue;
    let href;
    try {
      href = new URL(rawUrl, baseUrl).toString();
    } catch {
      continue;
    }
    if (isNoiseUrl(href)) continue;
    seen.add(href);
    const remaining = block.replace(aMatch[0], "");
    let snippet = stripTags(remaining);
    if (snippet.length > 180) snippet = snippet.substring(0, 170) + "...";
    results.push({ title: rawTitle.substring(0, 80), url: href, snippet });
  }
  if (results.length < limit) {
    const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(re)) {
      if (results.length >= limit) break;
      const title = cleanText(match[2]);
      if (!title || title.length < 3) continue;
      let href = decodeHtml(match[1]);
      if (href.startsWith("#") || href.startsWith("javascript:")) continue;
      try {
        href = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
      if (seen.has(href) || isNoiseUrl(href)) continue;
      seen.add(href);
      results.push({ title, url: href, snippet: "" });
    }
  }
    results.forEach((r) => { r.__skeleton = true; });
  return results;
}
__name2(extractGenericLinks, "extractGenericLinks");
function extractSectionAroundMarker(html, markers, maxLength) {
  const lowered = html.toLowerCase();
  for (const marker of markers) {
    const index = lowered.indexOf(String(marker).toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - Math.floor(maxLength * 0.15));
      return html.slice(start, start + maxLength);
    }
  }
  return "";
}
__name(extractSectionAroundMarker, "extractSectionAroundMarker");
__name2(extractSectionAroundMarker, "extractSectionAroundMarker");
function looksLikeSearchResultUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}
__name(looksLikeSearchResultUrl, "looksLikeSearchResultUrl");
__name2(looksLikeSearchResultUrl, "looksLikeSearchResultUrl");
function isBaiduNoiseTitle(title) {
  return /^(?:\d+小时|\d+天|\d+周|\d+月|24小时|1周内|1个月内|半年内|一年内)$/i.test(String(title || "").trim());
}
__name(isBaiduNoiseTitle, "isBaiduNoiseTitle");
__name2(isBaiduNoiseTitle, "isBaiduNoiseTitle");
function isBaiduNoiseUrl(url) {
  return /(?:^https?:\/\/)?m?\.baidu\.com\/(?:from=|sf\?|s\?|ssid=|pu=)|(?:[?&])pd=(?:sd_ptime(?:_[a-z0-9]+)?|csaitab)(?:[&#]|$)/i.test(String(url || ""));
}
__name(isBaiduNoiseUrl, "isBaiduNoiseUrl");
__name2(isBaiduNoiseUrl, "isBaiduNoiseUrl");
function isNoiseUrl(url) {
  return /\/preferences|\/settings|\/login|\/account|setlang=|\/search\?|\/images\/|\/maps\?|\/html\/?$|\/more\/?$|\/support\/?|\/legal\/?|duckduckgo\.com\/?$|baidu\.com\/?$|yandex\.com\/?$|yandex\.com\/search|yabs\.yandex|yandex\.ru\/images|hao123\.com|voice\.baidu\.com|policies\.google|support\.google|go\.microsoft\.com|account\.microsoft|bing\.com\/ck\/a|consent\.yahoo\.com|search\.yahoo\.com\/v2\/partners|guce\.yahoo\.com|beian\.miit\.gov\.cn|beian\.mps\.gov\.cn|dxzhgl\.miit\.gov\.cn/i.test(String(url || ""));
}
__name(isNoiseUrl, "isNoiseUrl");
__name2(isNoiseUrl, "isNoiseUrl");
function safeHostname(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}
__name(safeHostname, "safeHostname");
__name2(safeHostname, "safeHostname");
function htmlToText(html) {
  return decodeHtml(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}
__name(htmlToText, "htmlToText");
__name2(htmlToText, "htmlToText");
function cleanText(value) {
  return htmlToText(String(value || "")).replace(/[\x00-\x1f\x7f]/g, (c) => c === "\n" ? "\n" : c === "\r" ? "" : c === "	" ? " " : "");
}
__name(cleanText, "cleanText");
__name2(cleanText, "cleanText");
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
__name(decodeHtml, "decodeHtml");
__name2(decodeHtml, "decodeHtml");
function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
__name(requireString, "requireString");
__name2(requireString, "requireString");
function requireSlug(value, name) {
  const slug = requireString(value, name);
  if (!/^[A-Za-z0-9_.-]+$/.test(slug)) throw new Error(`${name} contains invalid characters`);
  return slug;
}
__name(requireSlug, "requireSlug");
__name2(requireSlug, "requireSlug");
function clampLimit(value) {
  return Math.min(Math.max(Number(value) || 5, 1), 10);
}
__name(clampLimit, "clampLimit");
__name2(clampLimit, "clampLimit");
function toolResult(structuredContent, formatter = (value) => JSON.stringify(value, null, 2)) {
  return {
    content: [{ type: "text", text: formatter(structuredContent) }],
    structuredContent
  };
}
__name(toolResult, "toolResult");
__name2(toolResult, "toolResult");
function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
__name(rpcResult, "rpcResult");
__name2(rpcResult, "rpcResult");
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
__name(rpcError, "rpcError");
__name2(rpcError, "rpcError");
function jsonRpcError(id, code, message, status) {
  return json(rpcError(id, code, message), status);
}
__name(jsonRpcError, "jsonRpcError");
__name2(jsonRpcError, "jsonRpcError");
function sanitizeForJson(value) {
  if (typeof value === "string") return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (Array.isArray(value)) return value.map(sanitizeForJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForJson(v);
    return out;
  }
  return value;
}
__name(sanitizeForJson, "sanitizeForJson");
__name2(sanitizeForJson, "sanitizeForJson");
function json(value, status = 200) {
  return new Response(JSON.stringify(sanitizeForJson(value)), { status, headers: JSON_HEADERS });
}
__name(json, "json");
__name2(json, "json");
export {
  worker_default as default
};
//# sourceMappingURL=index.js.map

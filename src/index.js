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
  ollama: { apiKey: "", baseUrl: "https://api.ollama.com/v1/web-search", enabled: true }
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
    description: "Search multiple engines, merge usable results, and rerank the best matches automatically.",
    inputSchema: querySchema({ engines: true, autoMode: true })
  },
  {
    name: "search_duckduckgo",
    description: "Search the web via DuckDuckGo HTML results. Good general fallback search.",
    inputSchema: querySchema({ region: true })
  },
  {
    name: "search_bing",
    description: "Search the web via Bing HTML results.",
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
    description: "Fetch a public URL and return readable text/metadata. Not for authenticated/private pages.",
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
  }
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
        tools: PUBLIC_TOOLS.map((tool) => tool.name)
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
  if (genericCount === results.length) {
    return { quality_status: "junk", quality_reason: "generic_wrapper_results", filtered_count: filteredCount, ok: false };
  }
  if (mismatchCount === results.length) {
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
  for (const item of Array.isArray(results) ? results : []) {
    const generic = isGenericWrapperResult(item, query, engine);
    if (generic) {
      genericCount++;
      continue;
    }
    filteredResults.push(item);
  }
  const filteredCount = Math.max(0, (Array.isArray(results) ? results.length : 0) - filteredResults.length);
  const filteredReason = filteredCount > 0 && genericCount === filteredCount ? "generic_wrapper_results" : "";
  return { filteredResults, filteredCount, filteredReason };
}
__name(filterSearchResultsForQuery, "filterSearchResultsForQuery");
__name2(filterSearchResultsForQuery, "filterSearchResultsForQuery");
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
  if (queryText && host && isSearchEngineHost(host) && combined.includes(queryText)) return true;
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
    return compactQuery ? !compactContent.includes(compactQuery) && matchedTokens.length === 0 : false;
  }
  if (engine === "bbc") {
    const queryTokens = tokenizeSearchText(query);
    const alphaTokens = queryTokens.filter((token) => /[a-z]/i.test(token));
    const numericTokens = queryTokens.filter((token) => /\d/.test(token));
    if (!alphaTokens.length || !numericTokens.length) return false;
    const rawContent = ` ${contentText.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    const alphaMatches = alphaTokens.filter((token) => rawContent.includes(` ${token} `)).length;
    const numericMatches = numericTokens.filter((token) => rawContent.includes(` ${token} `) || contentText.includes(token)).length;
    return alphaMatches === 0 && numericMatches > 0;
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
  if (host && isSearchEngineHost(host)) return true;
  return isCommunityMismatchResult(item, query, engine);
}
__name(isClearCjkMismatchResult, "isClearCjkMismatchResult");
__name2(isClearCjkMismatchResult, "isClearCjkMismatchResult");
function isHardIntentMismatchResult(item, query, engine = "") {
  if (!hasCjkText(query)) return false;
  if (isClearCjkMismatchResult(item, query, engine)) return true;
  const queryTokens = tokenizeSearchText(query).filter((t) => t.length >= 2);
  if (!queryTokens.length) return false;
  const contentText = `${item?.title || ""} ${item?.snippet || ""}`.toLowerCase();
  const compactContent = contentText.replace(/\s+/g, "");
  const compactQuery = query.toLowerCase().replace(/\s+/g, "");
  if (compactQuery && compactContent.includes(compactQuery)) return false;
  const matchedTokens = queryTokens.filter((token) => compactContent.includes(token));
  if (matchedTokens.length === 0) return true;
  return false;
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
  return { isChinese, isNews, isDeveloper };
}
__name(detectSearchIntent, "detectSearchIntent");
__name2(detectSearchIntent, "detectSearchIntent");
function defaultSearchAutoEngines(query) {
  const intent = detectSearchIntent(query);
  if (intent.isChinese) return ["sogou", "bing_cn", "bing_news", "baidu", "bing_global", "brave", "duckduckgo", "google", "yahoo", "yandex"];
  if (intent.isNews) return ["bbc", "bing_news", "bing_global", "brave", "duckduckgo", "google", "yahoo", "archive"];
  if (intent.isDeveloper) return ["github_repos", "stackoverflow", "npm", "devto", "hackernews", "brave", "duckduckgo", "bing_global", "google"];
  return ["bing_global", "duckduckgo", "google", "yahoo", "brave", "sogou", "baidu", "yandex", "naver", "archive", "wikipedia"];
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
    "pypi"
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
function scoreSearchAutoResult(item, query = "") {
  const qualityWeight = item.quality_status === "green" ? 220 : item.quality_status === "yellow" ? 110 : 0;
  const rankWeight = Math.max(0, 30 - (Number(item.rank_within_engine) || 0) * 3);
  const itemSources = Array.isArray(item?.sources) ? item.sources.filter(Boolean) : item?.source ? [item.source] : [];
  const multiSourceWeight = Math.max(0, itemSources.length - 1) * 40;
  const title = String(item?.title || "");
  const snippet = String(item?.snippet || "");
  const content = `${title} ${snippet}`.trim();
  const tokenMatches = tokenizeSearchText(query).filter((token) => token.length >= 2 && content.toLowerCase().includes(token)).length;
  const tokenWeight = Math.min(45, tokenMatches * 8);
  const officialHost = safeHostname(item?.url || "");
  const officialWeight = /(?:^|\.)(?:gov|edu|org|nhc\.gov\.cn|who\.int)$/i.test(officialHost) ? 35 : 0;
  const genericPenalty = isGenericWrapperResult(item, query, item.engine || item.source || "") ? 60 : 0;
  const mismatchPenalty = isIntentMismatchResult(item, query, item.engine || item.source || "") ? 80 : 0;
  const lowTrustPenalty = isLowTrustResult(item, query, item.engine || item.source || "") ? 120 : 0;
  return qualityWeight + rankWeight + multiSourceWeight + tokenWeight + officialWeight - genericPenalty - mismatchPenalty - lowTrustPenalty;
}
__name(scoreSearchAutoResult, "scoreSearchAutoResult");
__name2(scoreSearchAutoResult, "scoreSearchAutoResult");
function mergeSearchAutoResults(collectedResults, limit, query = "") {
  const byUrl = /* @__PURE__ */ new Map();
  for (const item of collectedResults) {
    const url = String(item?.url || "").trim();
    if (!url) continue;
    const candidate = { ...item, score: scoreSearchAutoResult(item, query) };
    const existing = byUrl.get(url);
    if (!existing || candidate.score > existing.score) {
      const mergedSources = [...new Set([...(Array.isArray(existing?.sources) ? existing.sources : existing?.source ? [existing.source] : []), ...(Array.isArray(candidate.sources) ? candidate.sources : candidate.source ? [candidate.source] : [])].filter(Boolean))];
      byUrl.set(url, mergedSources.length ? { ...candidate, sources: mergedSources } : candidate);
      continue;
    }
    const mergedSources = [...new Set([...(Array.isArray(existing?.sources) ? existing.sources : existing?.source ? [existing.source] : []), ...(Array.isArray(candidate.sources) ? candidate.sources : candidate.source ? [candidate.source] : [])].filter(Boolean))];
    if (mergedSources.length) {
      existing.sources = mergedSources;
      existing.score += Math.max(10, (mergedSources.length - 1) * 15);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score || a.rank_within_engine - b.rank_within_engine).slice(0, clampLimit(limit)).map(({ score, ...item }) => item);
}
__name(mergeSearchAutoResults, "mergeSearchAutoResults");
__name2(mergeSearchAutoResults, "mergeSearchAutoResults");
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
  for (const engine of engines) {
    if (isEngineCircuitBroken(engine)) {
      attempts.push({ engine, ok: false, error: "circuit_breaker", quality_status: "red", quality_reason: "circuit_breaker_frozen", filtered_count: 0, result_count: 0 });
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
        if (initialResults.length > 0) return searchResult({ source: "yahoo", query, limit, results: initialResults, blocked: false, block_reason: "" });
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
      if (results.length > 0) return searchResult({ source: "yahoo", query, limit, results, blocked: false, block_reason: "" });
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
        return searchResult({ source: "yahoo", query, limit, results: initialResults, blocked: false, block_reason: "" });
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
        return searchResult({ source: "yahoo", query, limit, results, blocked: false, block_reason: "" });
      }
      if (shouldRetryWithConsentCookie) {
        return searchResult({ source: "yahoo", query, limit, results: [], blocked: true, block_reason: "consent_page" });
      }
      return searchResult({ source: "yahoo", query, limit, results: [], blocked: false, block_reason: "" });
    }
  } catch (e) {
  }
  return searchResult({ source: "yahoo", query, limit, results: [], blocked: true, block_reason: "consent_page" });
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
    const data = await fetchJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,description&rows=${limit}&output=json`);
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
  return searchResult({ source: "archive", query, limit, results });
}
__name(searchArchive, "searchArchive");
__name2(searchArchive, "searchArchive");
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
    return searchResult({ source: "hackernews", query, limit, results });
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
function scoreVerticalResult(item, query, source) {
  const title = String(item?.title || "");
  const snippet = String(item?.snippet || "");
  const content = `${title} ${snippet}`.toLowerCase();
  const resultType = String(item?.result_type || "");
  const rank = Number(item?.rank_within_engine) || 99;
  let score = Math.max(0, 40 - rank * 3);
  const typeWeights = {
    article: 90,
    note: 95,
    question: 90,
    thread: 90,
    result: 20,
    topic_page: -40,
    channel_page: -70,
    homepage: -80,
    landing_page: -80,
    tag_page: -70,
    user_profile: -90,
    disambiguation: -85,
    profile: -90,
    search_page: -80,
    listing_page: -70,
    community_home: -80
  };
  score += typeWeights[resultType] || 0;
  const tokens = tokenizeSearchText(query).filter((token) => token.length >= 2);
  for (const token of tokens) {
    if (title.toLowerCase().includes(token)) score += 14;
    else if (content.includes(token)) score += 6;
  }
  if (hasCjkText(query)) {
    const normalizedQuery = normalizeCjkQuery(query);
    const normalizedTitle = normalizeCjkQuery(title);
    const normalizedSnippet = normalizeCjkQuery(snippet);
    if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 60;
    else if (normalizedQuery && normalizedSnippet.includes(normalizedQuery)) score += 24;
  }
  if (source === "wikipedia" && /\([^)]*\)/.test(title)) score += 12;
  return score;
}
__name(scoreVerticalResult, "scoreVerticalResult");
__name2(scoreVerticalResult, "scoreVerticalResult");
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
  const hasPreferred = normalized.some((item) => isPreferredVerticalResultType(item.result_type, source));
  let genericCount = 0;
  let mismatchCount = 0;
  let lowTrustCount = 0;
  let typeDropCount = 0;
  const filteredResults = normalized.filter((item) => {
    if (isGenericWrapperResult(item, query, source)) {
      genericCount++;
      return false;
    }
    if (isHardIntentMismatchResult(item, query, source)) {
      mismatchCount++;
      return false;
    }
    if (isLowTrustResult(item, query, source)) {
      lowTrustCount++;
      return false;
    }
    if (shouldDropVerticalResultType(item.result_type, source, hasPreferred)) {
      typeDropCount++;
      return false;
    }
    return true;
  }).sort((a, b) => scoreVerticalResult(b, query, source) - scoreVerticalResult(a, query, source) || a.rank_within_engine - b.rank_within_engine).slice(0, limit);
  const filteredCount = Math.max(0, normalized.length - filteredResults.length);
  let filteredReason = "";
  if (filteredCount > 0) {
    const reasons = [
      ["generic_wrapper_results", genericCount],
      ["intent_mismatch", mismatchCount],
      ["low_trust_results", lowTrustCount],
      ["vertical_result_type", typeDropCount]
    ].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
    filteredReason = reasons.length === 1 ? reasons[0][0] : reasons[0]?.[0] || "vertical_precision_filter";
  }
  const quality = evaluateSearchQuality({ results: filteredResults, filtered_count: filteredCount, filtered_reason: filteredReason }, query, source);
  return searchResult({
    source,
    query,
    limit,
    results: filteredResults,
    blocked,
    block_reason,
    ...extra,
    filtered_count: filteredCount,
    filtered_reason: filteredReason,
    quality_status: quality.quality_status,
    quality_reason: quality.quality_reason
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
    if (results.length) return searchResult({ source: "reddit", query, limit, results, subreddit: subredditName, fetch_path: "www.reddit.com" });
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
    const data = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&q=${encodeURIComponent(query)}`);
    let results = [];
    for (const article of Array.isArray(data) ? data : []) {
      if (results.length >= limit) break;
      results.push({ title: article.title || "", url: article.url || "", snippet: `${article.description || ""} | reactions: ${article.positive_reactions_count || 0} | comments: ${article.comments_count || 0}` });
    }
    return searchResult({ source: "devto", query, limit, results });
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
    return searchResult({ source: "mastodon", query, limit, results });
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
    return searchResult({ source: "peertube", query, limit, results });
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
    return searchResult({ source: "sec_edgar", query, limit, results });
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
    return searchResult({ source: "osm", query, limit, results, fetch_path: "nominatim.openstreetmap.org" });
  } catch (e) {
    return searchError("osm", query, limit, e, { fetch_path: "nominatim.openstreetmap.org" });
  }
}
__name(searchOsm, "searchOsm");
__name2(searchOsm, "searchOsm");
async function searchLemmy(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const instance = /^[a-z0-9.-]+$/.test(args.instance || "") ? args.instance : "lemmy.world";
  try {
    const data = await fetchJson(`https://${instance}/api/v3/search?q=${encodeURIComponent(query)}&limit=${limit}&type_=Posts`);
    let results = [];
    for (const post of data.posts || []) {
      if (results.length >= limit) break;
      const p = post.post || {};
      const name = p.name || "";
      const url = p.ap_id || p.url || "";
      const community = post.community?.name || "";
      const score = post.counts?.score || 0;
      const comments = post.counts?.comments || 0;
      results.push({ title: name, url, snippet: `!${community}@${instance} | ${score} pts | ${comments} comments` });
    }
    return searchResult({ source: "lemmy", query, limit, results });
  } catch (e) {
    return searchResult({ source: "lemmy", query, limit, results: [], error: e?.message || "failed" });
  }
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
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodedRef}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const text = await fetchText(url, { maxBytes: Math.min(MAX_FETCH_BYTES, maxChars * 4) });
  return {
    owner,
    repo,
    path,
    ref,
    url,
    content: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    maxChars
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
    return {
      ok: true,
      url: url.toString(),
      finalUrl: fallbackFinalUrl,
      title,
      text: htmlToText(text).slice(0, maxChars),
      maxChars,
      contentType: response.headers.get("content-type") || ""
    };
  } catch (error) {
    const message = String(error?.message || error || "failed");
    const statusMatch = message.match(/upstream\s+(\d{3})/i);
    return {
      ok: false,
      url: url.toString(),
      finalUrl: url.toString(),
      title: url.toString(),
      text: "",
      maxChars,
      contentType: "",
      status: statusMatch ? Number(statusMatch[1]) : 0,
      error: message
    };
  }
}
__name(fetchUrl, "fetchUrl");
__name2(fetchUrl, "fetchUrl");
var GSA_USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 12; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36"
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
function isEngineCircuitBroken(engine) {
  const record = CIRCUIT_BREAKER.get(engine);
  if (!record) return false;
  if (Date.now() > record.frozenUntil) { CIRCUIT_BREAKER.delete(engine); return false; }
  return true;
}
__name(isEngineCircuitBroken, "isEngineCircuitBroken");
__name2(isEngineCircuitBroken, "isEngineCircuitBroken");
function recordEngineBlocked(engine) {
  const record = CIRCUIT_BREAKER.get(engine) || { failures: 0, frozenUntil: 0 };
  record.failures++;
  if (record.failures >= CIRCUIT_THRESHOLD) {
    record.frozenUntil = Date.now() + CIRCUIT_FREEZE_MS;
    record.failures = 0;
  }
  CIRCUIT_BREAKER.set(engine, record);
}
__name(recordEngineBlocked, "recordEngineBlocked");
__name2(recordEngineBlocked, "recordEngineBlocked");
function recordEngineSuccess(engine) {
  CIRCUIT_BREAKER.delete(engine);
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
  return {
    ok: hasResults,
    source,
    query,
    limit,
    results,
    ...hasResults ? {} : blocked !== void 0 ? { blocked: Boolean(blocked) } : {},
    ...hasResults ? {} : block_reason ? { block_reason } : {},
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
  return /(?:^|\.)sogou\.com$/i.test(safeHostname(url)) && /\/link(?:\?|$)|\/web\?|\/sogou\?/i.test(String(url || ""));
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
  return results;
}
__name(extractGenericLinks, "extractGenericLinks");
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
  return /\/preferences|\/settings|\/login|\/account|setlang=|\/search\?|\/images\/|\/maps\?|\/html\/?$|\/more\/?$|\/support\/?|\/legal\/?|duckduckgo\.com\/?$|baidu\.com\/?$|yandex\.com\/?$|yandex\.com\/search|yabs\.yandex|yandex\.ru\/images|hao123\.com|voice\.baidu\.com|policies\.google|support\.google|go\.microsoft\.com|account\.microsoft|bing\.com\/ck\/a|consent\.yahoo\.com|search\.yahoo\.com\/v2\/partners|guce\.yahoo\.com/i.test(String(url || ""));
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

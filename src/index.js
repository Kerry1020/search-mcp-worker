var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var SERVER_NAME = "search-mcp-worker";
var SERVER_VERSION = "0.7.4";
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
  xiaohongshu: { apiKey: "", baseUrl: "", enabled: true }
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
function getProviderApiKey(name, envKey, request) {
  const header = headerValue(request, `x-${name}-api-key`);
  if (header) return header;
  const cfg = getProviderConfig(name);
  if (cfg && cfg.apiKey) return cfg.apiKey;
  return envKey ? (typeof process !== "undefined" && process.env ? process.env[envKey] : "") : "";
}
function getProviderBaseUrl(name, fallback, request) {
  const header = headerValue(request, `x-${name}-base-url`);
  if (header) return header;
  const cfg = getProviderConfig(name);
  if (cfg && cfg.baseUrl) return cfg.baseUrl;
  return fallback;
}
var TOOLS = [
  {
    name: "search_auto",
    description: "Search multiple engines with fallbacks and return the first useful result set.",
    inputSchema: querySchema({ engines: true })
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
        provider: { type: "string", description: "Provider name, e.g. ollama/brave/tavily/jina/searxng/serpapi/bing/parallel/xiaohongshu" },
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
    inputSchema: providerConfigSchema({ provider: "ollama", needsBaseUrl: true, needsApiKey: true })
  },
  {
    name: "provider_set_brave",
    description: "Configure the Brave provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "brave", needsApiKey: true })
  },
  {
    name: "provider_set_tavily",
    description: "Configure the Tavily provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "tavily", needsApiKey: true })
  },
  {
    name: "provider_set_jina",
    description: "Configure the Jina provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "jina", needsApiKey: true, needsBaseUrl: true })
  },
  {
    name: "provider_set_serpapi",
    description: "Configure the SerpAPI provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "serpapi", needsApiKey: true })
  },
  {
    name: "provider_set_bing",
    description: "Configure the Bing provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "bing", needsApiKey: true })
  },
  {
    name: "provider_set_parallel",
    description: "Configure the Parallel provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "parallel", needsApiKey: true, needsBaseUrl: true })
  },
  {
    name: "provider_set_searxng",
    description: "Configure the SearXNG provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "searxng", needsBaseUrl: true, needsApiKey: false })
  },
  {
    name: "provider_set_xiaohongshu",
    description: "Configure the Xiaohongshu provider for this worker runtime.",
    inputSchema: providerConfigSchema({ provider: "xiaohongshu", needsBaseUrl: true, needsApiKey: true })
  },
  {
    name: "search_ollama",
    description: "Search via Ollama search provider API (requires provider key or env OLLAMA_API_KEY).",
    inputSchema: querySchema()
  },
  {
    name: "search_xiaohongshu",
    description: "Search Xiaohongshu content using site-targeted fallback strategy.",
    inputSchema: querySchema()
  }
];
var worker_default = {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz") {
      return json({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp_endpoint: `${url.origin}/mcp`,
        endpoints: ["/mcp", "/health", "/healthz"],
        tools: TOOLS.map((tool) => tool.name)
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
      const response = await handleJsonRpc(message, request);
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
  if (extra.engines) properties.engines = { type: "array", items: { type: "string" }, description: "Optional engine order: duckduckgo, bing, yahoo, google, yandex, baidu, naver, sogou, wikipedia, arxiv, pubmed, hackernews, stackoverflow, reddit, npm, devto, mastodon, peertube, bbc, bing_news, archive, paperswithcode, sec_edgar, osm, lemmy, wikidata, crates, pypi, ollama, xiaohongshu" };
  return { type: "object", properties, required: ["query"] };
}
function providerConfigSchema({ provider, needsApiKey = true, needsBaseUrl = false }) {
  const properties = {
    api_key: { type: "string", description: `${provider} API key` },
    enabled: { type: "boolean", description: `Enable/disable ${provider}` }
  };
  if (needsBaseUrl) properties.base_url = { type: "string", description: `${provider} base URL` };
  const required = [];
  if (needsApiKey) required.push("api_key");
  return { type: "object", properties, required };
}
__name(querySchema, "querySchema");
__name2(querySchema, "querySchema");
async function handleJsonRpc(message, request) {
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
        return rpcResult(id, { tools: TOOLS });
      case "tools/call":
        return rpcResult(id, await callTool(message.params, request));
      default:
        return rpcError(id, -32601, `method not found: ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32e3, error?.message || "internal error");
  }
}
__name(handleJsonRpc, "handleJsonRpc");
__name2(handleJsonRpc, "handleJsonRpc");
async function callTool(params, request) {
  const name = params?.name;
  const args = params?.arguments || {};
  switch (name) {
    case "search_auto":
      return toolResult(await searchAuto(args), formatSearchResponse);
    case "search_duckduckgo":
      return toolResult(await searchDuckDuckGo(args), formatSearchResponse);
    case "search_bing":
      return toolResult(await searchBing(args), formatSearchResponse);
    case "search_ollama":
      return toolResult(await searchOllama(args), formatSearchResponse);
    case "search_xiaohongshu":
      return toolResult(await searchXiaohongshu(args), formatSearchResponse);
    case "provider_list":
      return toolResult(providerList(), formatMetadataResponse);
    case "provider_set_config":
      return toolResult(providerSetConfig(args), formatMetadataResponse);
    case "provider_get_config":
      return toolResult(providerGetConfig(args), formatMetadataResponse);
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
function isBadSearchResult(result) {
  if (!result || result.ok === false) return true;
  if (!Array.isArray(result.results) || result.results.length === 0) return true;
  return result.results.every((item) => isNoiseUrl(item.url));
}
__name(isBadSearchResult, "isBadSearchResult");
__name2(isBadSearchResult, "isBadSearchResult");
async function searchAuto(args) {
  const requested = Array.isArray(args.engines) ? args.engines : ["ollama", "xiaohongshu", "bing", "brave", "sogou", "ecosia", "qwant", "naver", "baidu", "wikipedia", "duckduckgo", "google", "archive", "yahoo", "yandex"];
  const engines = requested.map((name) => String(name).toLowerCase()).filter(Boolean);
  const attempts = [];
  const cacheKey = `auto:${engines.join(",")}:${args.query}:${args.limit || 5}`;
  const cached = getCached(cacheKey);
  if (cached) return { ...cached, _cached: true };
  for (const engine of engines) {
    try {
      let result;
      if (engine === "duckduckgo") result = await searchDuckDuckGo(args);
      else if (engine === "bing") result = await searchBing(args);
      else if (engine === "ollama") result = await searchOllama(args);
      else if (engine === "xiaohongshu") result = await searchXiaohongshu(args);
      else if (engine === "yahoo") result = await searchYahoo(args);
      else if (engine === "google") result = await searchGoogle(args);
      else if (engine === "yandex") result = await searchYandex(args);
      else if (engine === "baidu") result = await searchBaidu(args);
      else if (engine === "wikipedia") result = await searchWikipedia(args);
      else if (engine === "naver") result = await searchNaver(args);
      else if (engine === "sogou") result = await searchSogou(args);
      else if (engine === "brave") result = await searchBrave(args);
      else if (engine === "qwant") result = await searchQwant(args);
      else if (engine === "ecosia") result = await searchEcosia(args);
      else if (engine === "archive") result = await searchArchive(args);
      else if (engine === "arxiv") result = await searchArxiv(args);
      else if (engine === "arxiv") result = await searchArxiv(args);
      else if (engine === "pubmed") result = await searchPubmed(args);
      else if (engine === "hackernews") result = await searchHackerNews(args);
      else if (engine === "stackoverflow") result = await searchStackOverflow(args);
      else if (engine === "reddit") result = await searchReddit(args);
      else if (engine === "npm") result = await searchNpm(args);
      else if (engine === "devto") result = await searchDevto(args);
      else if (engine === "mastodon") result = await searchMastodon(args);
      else if (engine === "peertube") result = await searchPeerTube(args);
      else if (engine === "bbc") result = await searchBbc(args);
      else if (engine === "bing_news") result = await searchBingNews(args);
      else if (engine === "paperswithcode") result = await searchPapersWithCode(args);
      else if (engine === "sec_edgar") result = await searchSecEdgar(args);
      else if (engine === "osm") result = await searchOsm(args);
      else if (engine === "lemmy") result = await searchLemmy(args);
      else if (engine === "wikidata") result = await searchWikidata(args);
      else if (engine === "crates") result = await searchCrates(args);
      else if (engine === "pypi") result = await searchPypi(args);
      else continue;
      attempts.push({ engine, ok: !isBadSearchResult(result), result_count: Array.isArray(result.results) ? result.results.length : 0 });
      if (!isBadSearchResult(result)) {
        const final = {
          ...result,
          source: result.source || engine,
          attempts,
          fallback_used: attempts.length > 1
        };
        setCache(cacheKey, final);
        return final;
      }
    } catch (error) {
      attempts.push({ engine, ok: false, error: error?.message || "failed" });
    }
  }
  return {
    ok: false,
    source: engines[0] || null,
    query: typeof args.query === "string" ? args.query.trim() : "",
    results: [],
    attempts,
    fallback_used: attempts.length > 1,
    error: attempts.length ? `No search engine returned parsed results. Tried: ${attempts.map((item) => item.error ? `${item.engine}: ${item.error}` : `${item.engine}: no useful parsed results`).join("; ")}` : "No search engines requested."
  };
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
        if (isNoiseUrl(href)) continue;
        const snippet = (block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
        results.push({ title: cleanText(link[2]), url: href, snippet: cleanText(snippet) });
      }
      if (!results.length) {
        const rows = text.split(/<tr[^>]*>/i);
        for (const row of rows) {
          if (results.length >= limit) break;
          const link = row.match(/<a[^>]+class="[^"]*result-link[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || row.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
          if (!link) continue;
          const href = decodeDuckUrl(decodeHtml(link[1]));
          if (isNoiseUrl(href)) continue;
          const snippet = (row.match(/<td[^>]+class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/i) || [])[1] || "";
          results.push({ title: cleanText(link[2]), url: href, snippet: cleanText(snippet) });
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
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const attempts = [
    { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}&setlang=en&cc=us`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*" } },
    { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html,*/*" } },
    { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`, headers: {} }
  ];
  for (const attempt of attempts) {
    try {
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml("bing", text, response.url);
      if (diagnosis.blocked) continue;
      const results = extractBingResults(text, limit);
      if (results.length > 0) return searchResult({ source: "bing", query, limit, results, blocked: false, block_reason: "" });
    } catch (e) {
      continue;
    }
  }
  return searchResult({ source: "bing", query, limit, results: [], blocked: true, block_reason: "captcha_or_verification" });
}
__name(searchBing, "searchBing");
__name2(searchBing, "searchBing");
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
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml("yahoo", text, response.url);
      if (diagnosis.blocked) continue;
      const results = extractYahooResults(text, limit);
      if (results.length > 0) return searchResult({ source: "yahoo", query, limit, results, blocked: false, block_reason: "" });
    } catch (e) {
      continue;
    }
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
      if (diagnosis.blocked) continue;
      let results = [];
      const re = /<a href="\/url\?q=([^&"]+)[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
      for (const match of text.matchAll(re)) {
        if (results.length >= limit) break;
        const u = decodeURIComponent(match[1]);
        if (isNoiseUrl(u)) continue;
        results.push({ title: cleanText(match[2]), url: u, snippet: "" });
      }
      if (!results.length) results = extractGenericLinks(text, limit, "https://www.google.com");
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
    { url: `https://m.baidu.com/s?word=${encodeURIComponent(query)}&pn=0&rn=${limit}`, headers: { "User-Agent": randomGsaUA(), "Accept": "text/html,*/*", "Accept-Language": "zh-CN,zh;q=0.9" } },
    { url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`, headers: {} }
  ];
  for (const attempt of attempts) {
    try {
      const { text, response } = await fetchWithUA(attempt.url, attempt.headers);
      const diagnosis = diagnoseSearchHtml("baidu", text, response.url);
      if (diagnosis.blocked) continue;
      let results = [];
      const re = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]+class="[^"]*content-right_8Zs40[^"]*"[^>]*>|<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const match of text.matchAll(re)) {
        if (results.length >= limit) break;
        const u = decodeHtml(match[1] || match[3]);
        if (isNoiseUrl(u)) continue;
        results.push({ title: cleanText(match[2] || match[4]), url: u, snippet: "" });
      }
      if (!results.length) results = extractGenericLinks(text, limit, "https://www.baidu.com");
      if (results.length > 0) return searchResult({ source: "baidu", query, limit, results, blocked: false, block_reason: "" });
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
      if (diagnosis.blocked) continue;
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
async function searchSogou(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const { text, response } = await fetchTextWithResponse(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`);
  const diagnosis = diagnoseSearchHtml("sogou", text, response.url);
  let results = [];
  const re = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of text.matchAll(re)) {
    if (results.length >= limit) break;
    let url = decodeHtml(match[1]);
    const title = cleanText(match[2]);
    if (!title || title.length < 2) continue;
    if (url.startsWith("javascript:") || url === "#" || url === "/") continue;
    if (!url.startsWith("http")) url = "https://www.sogou.com" + url;
    results.push({ title, url, snippet: "" });
  }
  if (!results.length) results = extractGenericLinks(text, limit, "https://www.sogou.com");
  return searchResult({ source: "sogou", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
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
    const xml = await fetchText(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`);
    let results = [];
    const entries = xml.split("<entry>");
    for (let i = 1; i < entries.length && results.length < limit; i++) {
      const entry = entries[i];
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim().replace(/\n/g, " ") || "";
      const id = (entry.match(/<id>([^<]+)<\/id>/) || [])[1] || "";
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim().replace(/\n/g, " ").substring(0, 200) || "";
      const authors = (entry.match(/<name>([^<]+)<\/name>/g) || []).map((a) => a.replace(/<\/?name>/g, "")).join(", ");
      const pdfUrl = id.replace("abs", "pdf");
      if (title && id) results.push({ title, url: id, snippet: summary, authors });
    }
    return searchResult({ source: "arxiv", query, limit, results });
  } catch (e) {
    return searchResult({ source: "arxiv", query, limit, results: [], error: e?.message || "failed" });
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
    return searchResult({ source: "stackoverflow", query, limit, results });
  } catch (e) {
    return searchResult({ source: "stackoverflow", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchStackOverflow, "searchStackOverflow");
__name2(searchStackOverflow, "searchStackOverflow");
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
    return searchResult({ source: "reddit", query, limit, results, subreddit: subredditName, fetch_path: "www.reddit.com" });
  } catch (e) {
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
    const re = /<a[^>]+href="(https:\/\/www\.bbc\.(?:com|co\.uk)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html2.matchAll(re)) {
      if (results.length >= limit) break;
      const url = match[1];
      const title = cleanText(match[2]);
      if (isNoiseUrl(url) || seen.has(url) || !title || title.length < 8 || url.includes("/weather") || url.includes("/accessibility") || url.includes("/help")) continue;
      seen.add(url);
      results.push({ title, url, snippet: "" });
    }
    if (!results.length) results = extractGenericLinks(html2, limit, "https://www.bbc.co.uk").filter((r) => r.url.includes("bbc."));
    return searchResult({ source: "bbc", query, limit, results });
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
      const url = (item.match(/<link>([^<]+)<\/link>/) || [])[1] || "";
      if (title && url) results.push({ title: cleanText(title), url, snippet: "" });
    }
    if (!results.length) {
      const { text: html } = await fetchTextWithResponse(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}`);
      results = extractGenericLinks(html, limit, "https://www.bing.com");
      results = results.filter((r) => !r.url.includes("bing.com"));
    }
    return searchResult({ source: "bing_news", query, limit, results });
  } catch (e) {
    return searchResult({ source: "bing_news", query, limit, results: [], error: e?.message || "failed" });
  }
}
__name(searchBingNews, "searchBingNews");
__name2(searchBingNews, "searchBingNews");
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
        results.push({ title, url: doi ? `https://doi.org/${doi}` : "", snippet: `${author}${year ? " (" + year + ")" : ""}` });
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
        const form = source.form_type || "";
        const filed = source.filed_at || source.date || "";
        const id = source.file_id || source._id || "";
        const url = id ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(entity)}&type=${form}` : "";
        results.push({ title: `${entity} - ${form} (${filed.substring(0, 10)})`, url, snippet: `Filed: ${filed.substring(0, 10)}` });
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
    const data = await fetchJson(`https://pypi.org/search/?q=${encodeURIComponent(query)}&format=json`);
    let results = [];
    for (const item of data.items || data.results || []) {
      if (results.length >= limit) break;
      results.push({ title: `${item.name || item.project}@${item.version || ""}`, url: `https://pypi.org/project/${item.name || item.project}/`, snippet: item.summary || "" });
    }
    if (results.length) return searchResult({ source: "pypi", query, limit, results });
  } catch {
  }
  try {
    const data = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(query)}/json`);
    const info = data?.info || {};
    return searchResult({ source: "pypi", query, limit, results: [{ title: `${info.name}@${info.version}`, url: info.project_url || `https://pypi.org/project/${query}/`, snippet: info.summary || "" }] });
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
    const rssRe = /<link[^>]+rel="alternate"[^>]+type="application\/(?:rss|atom)\+xml"[^>]+href="([^"]+)"[^>]*>/gi;
    for (const match of text.matchAll(rssRe)) {
      feeds.push({ title: match[1], url: new URL(match[1], url).href, snippet: "RSS/Atom feed" });
    }
    const altRe = /<link[^>]+type="application\/(?:rss|atom)\+xml"[^>]+href="([^"]+)"[^>]*>/gi;
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
  try {
    const data = await fetchJson(`https://${lang}.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`);
    let results = [];
    for (const item of data.query?.search || []) {
      if (results.length >= 5) break;
      const title = item.title || query;
      const snippet = cleanText(item.snippet || "").substring(0, 200);
      results.push({ title, url: `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(title)}`, snippet });
    }
    return searchResult({ source: "wiktionary", query, limit: 5, results, language: lang, fetch_path: `${lang}.wiktionary.org` });
  } catch (e) {
    return searchError("wiktionary", query, 5, e, { language: lang, fetch_path: `${lang}.wiktionary.org` });
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
    const abstract = data.Abstract || "";
    const answer = data.Answer || "";
    const definition = data.Definition || "";
    const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    const flattenedTopics = relatedTopics.flatMap((item) => Array.isArray(item?.Topics) ? item.Topics : [item]);
    const topicText = flattenedTopics.map((item) => item?.Text || "").find(Boolean) || "";
    const firstRelatedUrl = flattenedTopics.map((item) => item?.FirstURL || "").find(Boolean) || "";
    const text = abstract || answer || definition || topicText;
    const url = data.AbstractURL || data.DefinitionURL || firstRelatedUrl || "";
    const source = data.AbstractSource || data.DefinitionSource || "DuckDuckGo";
    if (!text) {
      return searchResult({ source: "ddg_instant", query, limit: 1, results: [], fetch_path: "api.duckduckgo.com", error: "No instant answer found." });
    }
    return searchResult({ source: "ddg_instant", query, limit: 1, results: [{ title: query, url, snippet: `${text.substring(0, 300)}${source ? " (Source: " + source + ")" : ""}` }], fetch_path: "api.duckduckgo.com" });
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
    const results = (data?.query?.search || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(" ", "_"))}`,
      snippet: cleanText(item.snippet || "")
    }));
    return searchResult({ source: "wikipedia", query, limit, results, language });
  } catch {
    const html = await fetchText(`https://${language}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`);
    return searchResult({ source: "wikipedia", query, limit, results: extractGenericLinks(html, limit, `https://${language}.wikipedia.org`), language });
  }
}
__name(searchWikipedia, "searchWikipedia");
__name2(searchWikipedia, "searchWikipedia");
async function searchGitHubRepos(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const data = await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`);
  const results = (data.items || []).slice(0, limit).map((repo) => ({
    title: `${repo.full_name} \u2605${repo.stargazers_count || 0}`,
    url: repo.html_url,
    snippet: repo.description || ""
  }));
  return searchResult({ source: "github", query, limit, results, total_count: data.total_count || 0 });
}
__name(searchGitHubRepos, "searchGitHubRepos");
__name2(searchGitHubRepos, "searchGitHubRepos");
async function fetchGitHubFile(args) {
  const owner = requireSlug(args.owner, "owner");
  const repo = requireSlug(args.repo, "repo");
  const path = requireString(args.path, "path").replace(/^\/+/, "");
  const ref = args.ref ? requireString(args.ref, "ref") : "main";
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 2e4, 1e3), 5e4);
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
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
  const { text, response } = await fetchTextWithResponse(url.toString(), { maxBytes: 128e3 });
  const title = cleanText((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const description = cleanText((text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || text.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i) || [])[1] || "");
  const canonical = decodeHtml((text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i) || [])[1] || "");
  return {
    url: url.toString(),
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    title,
    description,
    canonical: canonical ? new URL(canonical, response.url).toString() : ""
  };
}
__name(fetchMetadata, "fetchMetadata");
__name2(fetchMetadata, "fetchMetadata");
async function fetchUrl(args) {
  const url = new URL(requireString(args.url, "url"));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http(s) URLs are allowed");
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 12e3, 1e3), 3e4);
  const { text, response } = await fetchTextWithResponse(url.toString(), { maxBytes: MAX_FETCH_BYTES });
  const title = cleanText((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url.toString());
  return {
    url: url.toString(),
    finalUrl: response.url,
    title,
    text: htmlToText(text).slice(0, maxChars),
    maxChars,
    contentType: response.headers.get("content-type") || ""
  };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
      redirect: "follow"
    });
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
  } finally {
    clearTimeout(timer);
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
  const apiKey = getProviderApiKey("ollama", "OLLAMA_API_KEY", request);
  const endpoint = getProviderBaseUrl("ollama", "https://api.ollama.com/v1/web-search", request);
  if (!apiKey) return searchError("ollama", query, limit, "missing OLLAMA_API_KEY/provider api key");
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
}
async function searchXiaohongshu(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const composed = `site:xiaohongshu.com ${query}`;
  let results = [];
  const preferred = [searchSogou, searchBaidu, searchBing, searchGoogle, searchYandex];
  for (const fn of preferred) {
    try {
      const r = await fn({ query: composed, limit });
      if (Array.isArray(r?.results) && r.results.length) {
        results = r.results.filter((x) => (x.url || "").includes("xiaohongshu.com")).slice(0, limit);
        if (results.length) break;
      }
    } catch {}
  }
  return searchResult({ source: "xiaohongshu", query, limit, results, strategy: "site-targeted-fallback" });
}

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
  if (!result.results.length) {
    if (result.blocked && result.block_reason) {
      return `${capitalize(result.source || "search")} search for "${result.query}" is blocked by upstream: ${result.block_reason}.`;
    }
    return result.error || `${capitalize(result.source || "search")} search for "${result.query}" returned no parsed results.`;
  }
  return [
    `${capitalize(result.source || "search")} search results for "${result.query}":`,
    "",
    ...result.results.map((item, index) => `${index + 1}. ${item.title}
${item.url}
${item.snippet || ""}`)
  ].join("\n");
}
__name(formatSearchResponse, "formatSearchResponse");
__name2(formatSearchResponse, "formatSearchResponse");
function formatGitHubFileResponse(result) {
  return `# ${result.owner}/${result.repo}/${result.path}@${result.ref}

${result.content}`;
}
__name(formatGitHubFileResponse, "formatGitHubFileResponse");
__name2(formatGitHubFileResponse, "formatGitHubFileResponse");
function formatMetadataResponse(result) {
  return JSON.stringify(result, null, 2);
}
__name(formatMetadataResponse, "formatMetadataResponse");
__name2(formatMetadataResponse, "formatMetadataResponse");
function formatFetchUrlResponse(result) {
  return `# ${result.title}

URL: ${result.url}
Final URL: ${result.finalUrl}

${result.text}`;
}
__name(formatFetchUrlResponse, "formatFetchUrlResponse");
__name2(formatFetchUrlResponse, "formatFetchUrlResponse");
function formatDebugCaptureResponse(result) {
  return JSON.stringify(result, null, 2);
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
    if (/anomaly|automated requests|unusual traffic|captcha|robot/i.test(haystack)) {
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
    if (finalHost.endsWith("bing.com") && /(?:id|class)=["'][^"']*(?:b_captcha|b_cf|captcha)[^"']*["']/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
    if (/our systems have detected unusual traffic|verify you are human|please solve the challenge below/.test(haystack)) {
      return { blocked: true, reason: "captcha_or_verification" };
    }
  }
  if (engine === "yahoo") {
    if (finalHost === "consent.yahoo.com" || /privacy choices|privacykeuzes|collectconsent|guce/i.test(haystack)) {
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
  const candidates = headerMatch ? [headerMatch] : [...block.matchAll(/<a\b([^>]*)href=("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of candidates) {
    const attrs = `${match[1] || ""} ${match[6] || ""}`;
    if (/(?:b_attribution|b_footnote|b_img|cico|expand|share|feedback|musCard|b_pag|b_richcard|b_algoarea|overlay)/i.test(attrs)) continue;
    const rawHref = decodeHtml(match[3] || match[4] || match[5] || "");
    if (!rawHref || /^(?:javascript:|#)/i.test(rawHref)) continue;
    let url;
    try {
      url = decodeBingUrl(new URL(rawHref, baseUrl).toString());
    } catch {
      url = decodeBingUrl(rawHref);
    }
    if (isNoiseUrl(url) || isBingNoiseUrl(url) || !looksLikeSearchResultUrl(url)) continue;
    const title = cleanText(match[7]);
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
        const decoded = normalizeUrlCandidate(safelyDecodeUrlComponent(target).replace(/^a1/i, ""));
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    const pathMatch = url.pathname.match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      const decoded = safelyDecodeUrlComponent(pathMatch[1]).replace(/^a1/i, "");
      if (/^https?:\/\//i.test(decoded)) return normalizeUrlCandidate(decoded);
    }
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeBingUrl, "decodeBingUrl");
__name2(decodeBingUrl, "decodeBingUrl");
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
    return url.toString();
  } catch {
    return href;
  }
}
__name(decodeYahooUrl, "decodeYahooUrl");
__name2(decodeYahooUrl, "decodeYahooUrl");
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

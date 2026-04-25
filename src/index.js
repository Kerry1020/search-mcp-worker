var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var SERVER_NAME = "search-mcp-worker";
var SERVER_VERSION = "0.7.3";
var MAX_FETCH_BYTES = 512e3;
var DEFAULT_TIMEOUT_MS = 12e3;
var JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, mcp-session-id"
};
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
  if (extra.engines) properties.engines = { type: "array", items: { type: "string" }, description: "Optional engine order: duckduckgo, bing, yahoo, google, yandex, baidu, wikipedia" };
  return { type: "object", properties, required: ["query"] };
}
__name(querySchema, "querySchema");
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
        return rpcResult(id, await callTool(message.params));
      default:
        return rpcError(id, -32601, `method not found: ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32e3, error?.message || "internal error");
  }
}
__name(handleJsonRpc, "handleJsonRpc");
async function callTool(params) {
  const name = params?.name;
  const args = params?.arguments || {};
  switch (name) {
    case "search_auto":
      return toolResult(await searchAuto(args), formatSearchResponse);
    case "search_duckduckgo":
      return toolResult(await searchDuckDuckGo(args), formatSearchResponse);
    case "search_bing":
      return toolResult(await searchBing(args), formatSearchResponse);
    case "search_yahoo":
      return toolResult(await searchYahoo(args), formatSearchResponse);
    case "search_google_web":
      return toolResult(await searchGoogle(args), formatSearchResponse);
    case "search_baidu":
      return toolResult(await searchBaidu(args), formatSearchResponse);
    case "search_yandex":
      return toolResult(await searchYandex(args), formatSearchResponse);
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
function isBadSearchResult(result) {
  if (!result || result.ok === false) return true;
  if (!Array.isArray(result.results) || result.results.length === 0) return true;
  return result.results.every((item) => isNoiseUrl(item.url));
}
__name(isBadSearchResult, "isBadSearchResult");
async function searchAuto(args) {
  const requested = Array.isArray(args.engines) ? args.engines : ["duckduckgo", "bing", "yahoo", "google", "yandex", "baidu", "wikipedia"];
  const engines = requested.map((name) => String(name).toLowerCase()).filter(Boolean);
  const attempts = [];
  for (const engine of engines) {
    try {
      let result;
      if (engine === "duckduckgo") result = await searchDuckDuckGo(args);
      else if (engine === "bing") result = await searchBing(args);
      else if (engine === "yahoo") result = await searchYahoo(args);
      else if (engine === "google") result = await searchGoogle(args);
      else if (engine === "yandex") result = await searchYandex(args);
      else if (engine === "baidu") result = await searchBaidu(args);
      else if (engine === "wikipedia") result = await searchWikipedia(args);
      else continue;
      attempts.push({ engine, ok: !isBadSearchResult(result), result_count: Array.isArray(result.results) ? result.results.length : 0 });
      if (!isBadSearchResult(result)) {
        return {
          ...result,
          source: result.source || engine,
          attempts,
          fallback_used: attempts.length > 1
        };
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
async function searchDuckDuckGo(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const region = typeof args.region === "string" ? args.region : "us-en";
  const attempts = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`,
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`
  ];
  let bestFailure = null;
  const fetchAttempts = [];
  for (const url of attempts) {
    try {
      const { text, response } = await fetchTextWithResponse(url);
      const fetchPath = safeHostname(response.url) || safeHostname(url);
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
      if (!results.length) results = extractGenericLinks(text, limit, "https://duckduckgo.com");
      if (results.length) {
        return searchResult({ source: "duckduckgo", query, limit, results, region, fetch_path: fetchPath, fetch_attempts: fetchAttempts });
      }
      bestFailure = searchResult({ source: "duckduckgo", query, limit, results: [], region, fetch_path: fetchPath, fetch_attempts: fetchAttempts });
    } catch (error) {
      fetchAttempts.push({ path: safeHostname(url), blocked: false, block_reason: "", error: error?.message || "failed" });
      bestFailure = {
        ok: false,
        source: "duckduckgo",
        query,
        limit,
        results: [],
        region,
        error: error?.message || "failed",
        fetch_path: safeHostname(url),
        fetch_attempts: fetchAttempts
      };
    }
  }
  return bestFailure || searchResult({ source: "duckduckgo", query, limit, results: [], region, error: "duckduckgo returned no usable results", fetch_attempts: fetchAttempts });
}
__name(searchDuckDuckGo, "searchDuckDuckGo");
async function searchBing(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`);
  const diagnosis = diagnoseSearchHtml("bing", html);
  const results = extractBingResults(html, limit);
  return searchResult({ source: "bing", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
}
__name(searchBing, "searchBing");
async function searchYahoo(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const html = await fetchText(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}`);
  const diagnosis = diagnoseSearchHtml("yahoo", html);
  const results = extractYahooResults(html, limit);
  return searchResult({ source: "yahoo", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
}
__name(searchYahoo, "searchYahoo");
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
async function searchGoogle(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  try {
    const { text, response } = await fetchTextWithResponse(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}`);
    const diagnosis = diagnoseSearchHtml("google", text, response.url);
    let results = [];
    const re = /<a href="\/url\?q=([^&"]+)[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
    for (const match of text.matchAll(re)) {
      if (results.length >= limit) break;
      const url = decodeURIComponent(match[1]);
      if (isNoiseUrl(url)) continue;
      results.push({ title: cleanText(match[2]), url, snippet: "" });
    }
    if (!results.length) results = extractGenericLinks(text, limit, "https://www.google.com");
    return searchResult({ source: "google", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
  } catch (error) {
    const message = String(error?.message || "");
    if (/upstream 429 .*google\.com\/search/i.test(message)) {
      return searchResult({ source: "google", query, limit, results: [], blocked: true, block_reason: "rate_limited" });
    }
    throw error;
  }
}
__name(searchGoogle, "searchGoogle");
async function searchBaidu(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const { text, response } = await fetchTextWithResponse(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}`);
  const diagnosis = diagnoseSearchHtml("baidu", text, response.url);
  let results = [];
  const re = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]+class="[^"]*content-right_8Zs40[^"]*"[^>]*>|<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of text.matchAll(re)) {
    if (results.length >= limit) break;
    const url = decodeHtml(match[1] || match[3]);
    if (isNoiseUrl(url)) continue;
    results.push({ title: cleanText(match[2] || match[4]), url, snippet: "" });
  }
  if (!results.length) results = extractGenericLinks(text, limit, "https://www.baidu.com");
  return searchResult({ source: "baidu", query, limit, results, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
}
__name(searchBaidu, "searchBaidu");
async function searchYandex(args) {
  const query = requireString(args.query, "query");
  const limit = clampLimit(args.limit);
  const language = /^[a-z-]{2,12}$/i.test(args.language || "") ? args.language : "en";
  const html = await fetchText(`https://yandex.com/search/?text=${encodeURIComponent(query)}&lang=${encodeURIComponent(language)}`);
  const diagnosis = diagnoseSearchHtml("yandex", html);
  const results = extractYandexResults(html, limit);
  return searchResult({ source: "yandex", query, limit, results, language, blocked: diagnosis.blocked, block_reason: diagnosis.reason || "" });
}
__name(searchYandex, "searchYandex");
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
async function fetchTextWithResponse(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
      },
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
__name(fetchTextWithResponse, "fetchTextWithResponse");
async function fetchText(url, options = {}) {
  const { text } = await fetchTextWithResponse(url, options);
  return text;
}
__name(fetchText, "fetchText");
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": `${SERVER_NAME}/${SERVER_VERSION} (https://search-mcp.qdp.qzz.io)`
    }
  });
  if (!response.ok) throw new Error(`upstream ${response.status} for ${url}`);
  return response.json();
}
__name(fetchJson, "fetchJson");
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
function formatGitHubFileResponse(result) {
  return `# ${result.owner}/${result.repo}/${result.path}@${result.ref}

${result.content}`;
}
__name(formatGitHubFileResponse, "formatGitHubFileResponse");
function formatMetadataResponse(result) {
  return JSON.stringify(result, null, 2);
}
__name(formatMetadataResponse, "formatMetadataResponse");
function formatFetchUrlResponse(result) {
  return `# ${result.title}

URL: ${result.url}
Final URL: ${result.finalUrl}

${result.text}`;
}
__name(formatFetchUrlResponse, "formatFetchUrlResponse");
function formatDebugCaptureResponse(result) {
  return JSON.stringify(result, null, 2);
}
__name(formatDebugCaptureResponse, "formatDebugCaptureResponse");
function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
__name(capitalize, "capitalize");
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
function isBingNoiseUrl(url) {
  return /bing\.com\/(?:search|images|videos|maps|news)|go\.microsoft\.com|r\.bing\.com|th\.bing\.com|cc\.bingj\.com/i.test(String(url || ""));
}
__name(isBingNoiseUrl, "isBingNoiseUrl");
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
function isYahooNoiseUrl(url) {
  return /search\.yahoo\.com\/search|r\.search\.yahoo\.com|yahoo\.com\/(?:search|news|video|images)/i.test(String(url || ""));
}
__name(isYahooNoiseUrl, "isYahooNoiseUrl");
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
function decodeUnicodeEscapes(value) {
  return String(value || "").replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
__name(decodeUnicodeEscapes, "decodeUnicodeEscapes");
function normalizeUrlCandidate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^\/\//.test(text)) return `https:${text}`;
  return text;
}
__name(normalizeUrlCandidate, "normalizeUrlCandidate");
function safelyDecodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
__name(safelyDecodeUrlComponent, "safelyDecodeUrlComponent");
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
function looksLikeSearchResultUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}
__name(looksLikeSearchResultUrl, "looksLikeSearchResultUrl");
function isNoiseUrl(url) {
  return /\/preferences|\/settings|\/login|\/account|setlang=|\/search\?|\/images\/|\/maps\?|\/html\/?$|\/more\/?$|\/support\/?|\/legal\/?|duckduckgo\.com\/?$|baidu\.com\/?$|yandex\.com\/?$|yandex\.com\/search|yabs\.yandex|yandex\.ru\/images|hao123\.com|voice\.baidu\.com|policies\.google|support\.google|go\.microsoft\.com|account\.microsoft|bing\.com\/ck\/a|consent\.yahoo\.com|search\.yahoo\.com\/v2\/partners|guce\.yahoo\.com/i.test(String(url || ""));
}
__name(isNoiseUrl, "isNoiseUrl");
function safeHostname(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}
__name(safeHostname, "safeHostname");
function htmlToText(html) {
  return decodeHtml(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}
__name(htmlToText, "htmlToText");
function cleanText(value) {
  return htmlToText(String(value || ""));
}
__name(cleanText, "cleanText");
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
__name(decodeHtml, "decodeHtml");
function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
__name(requireString, "requireString");
function requireSlug(value, name) {
  const slug = requireString(value, name);
  if (!/^[A-Za-z0-9_.-]+$/.test(slug)) throw new Error(`${name} contains invalid characters`);
  return slug;
}
__name(requireSlug, "requireSlug");
function clampLimit(value) {
  return Math.min(Math.max(Number(value) || 5, 1), 10);
}
__name(clampLimit, "clampLimit");
function toolResult(structuredContent, formatter = (value) => JSON.stringify(value, null, 2)) {
  return {
    content: [{ type: "text", text: formatter(structuredContent) }],
    structuredContent
  };
}
__name(toolResult, "toolResult");
function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
__name(rpcResult, "rpcResult");
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
__name(rpcError, "rpcError");
function jsonRpcError(id, code, message, status) {
  return json(rpcError(id, code, message), status);
}
__name(jsonRpcError, "jsonRpcError");
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
__name(json, "json");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map

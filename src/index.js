const SERVER_NAME = 'search-mcp-worker';
const SERVER_VERSION = '0.3.0';

const TOOLS = [
  {
    name: 'search_google_web',
    description: 'Search the web using Google HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_duckduckgo',
    description: 'Search the web using DuckDuckGo HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_bing',
    description: 'Search the web using Bing HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_baidu',
    description: 'Search the web using Baidu HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_yandex',
    description: 'Search the web using Yandex HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_yahoo',
    description: 'Search the web using Yahoo HTML results.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_wikipedia',
    description: 'Search Wikipedia with language-aware fallback.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 5 }, lang: { type: 'string', default: 'auto' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_reddit',
    description: 'Search Reddit public posts via JSON endpoints.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, subreddit: { type: 'string' }, limit: { type: 'integer', default: 5 }, sort: { type: 'string', default: 'relevance' } },
      required: ['query'], additionalProperties: false,
    },
  },
  {
    name: 'search_twitter_x',
    description: 'Search public Twitter/X pages using multi-engine site-scoped search.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'fetch_url',
    description: 'Fetch a URL and return a cleaned text preview plus metadata.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, max_chars: { type: 'integer', default: 6000 } }, required: ['url'], additionalProperties: false },
  },
  {
    name: 'fetch_reddit_post',
    description: 'Fetch a Reddit post thread via .json and summarize the main post.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, max_comments: { type: 'integer', default: 5 } }, required: ['url'], additionalProperties: false },
  },
];

function corsHeaders(extra = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, mcp-session-id',
    ...extra,
  };
}

function jsonRpc(id, result) {
  return Response.json({ jsonrpc: '2.0', id, result }, { headers: corsHeaders() });
}

function jsonRpcError(id, code, message, data) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message, data } }, { headers: corsHeaders() });
}

function textContent(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
}

function decodeHtml(str = '') {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteUrl(href, base) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeQuery(input = '') {
  const q = String(input || '').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  const noNoise = q.replace(/^[!@#$%^&*()_+=[\]{};:'"\\|,.<>/?`~\-\s]+/, '').trim();
  return (noNoise || q).slice(0, 300);
}

function containsCJK(s = '') {
  return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(String(s));
}

async function fetchText(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

function unwrapDuckUrl(url) {
  try {
    const abs = absoluteUrl(decodeHtml(url), 'https://duckduckgo.com');
    const u = new URL(abs);
    return u.searchParams.get('uddg') ? decodeURIComponent(u.searchParams.get('uddg')) : abs;
  } catch {
    return absoluteUrl(decodeHtml(url), 'https://duckduckgo.com');
  }
}

function parseDuckHtml(text, base, maxResults) {
  const out = [];
  const blocks = text.match(/<div[^>]*class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/g) || [];

  for (const block of blocks) {
    const a = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = unwrapDuckUrl(a[1]);
    const title = stripHtml(a[2]);
    const snippetMatch = block.match(/<(?:a|div|span)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i)
      || block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*>[\s\S]*?<\/a>[\s\S]{0,1200}?<div[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = stripHtml(snippetMatch?.[1] || '');
    if (!url || !title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet });
    if (out.length >= maxResults) break;
  }

  if (out.length > 0) return out;

  const resA = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]{0,2400}?<(?:a|div|span)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>)?/g;
  for (const m of text.matchAll(resA)) {
    const url = unwrapDuckUrl(m[1]);
    const title = stripHtml(m[2]);
    const snippet = stripHtml(m[3] || '');
    if (!url || !title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet });
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseGoogleHtml(text, maxResults) {
  const out = [];
  const re = /<a href="\/url\?q=([^"&]+)[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of text.matchAll(re)) {
    const url = decodeURIComponent(m[1]);
    if (!/^https?:/i.test(url)) continue;
    const title = stripHtml(m[2]);
    if (!title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet: '' });
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseBingHtml(text, maxResults) {
  const out = [];
  const re = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]{0,2200}?(?:<p>([\s\S]*?)<\/p>)?/g;
  for (const m of text.matchAll(re)) {
    const url = decodeHtml(m[1]);
    const title = stripHtml(m[2]);
    const snippet = stripHtml(m[3] || '');
    if (!url || !title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet });
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseYahooHtml(text, maxResults) {
  const out = [];
  const re = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of text.matchAll(re)) {
    const url = decodeHtml(m[1]);
    const title = stripHtml(m[2]);
    if (!url || !title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet: '' });
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseBaiduHtml(text, maxResults) {
  const out = [];
  const blockRe = /<div[^>]+class="[^"]*result[^"]*c-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  for (const m of text.matchAll(blockRe)) {
    const block = m[0];
    const link = block.match(/<(?:a|span)[^>]*(?:mu|data-landurl|href)="([^"]+)"[^>]*>/i)
      || block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i)
      || block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const rawUrl = decodeHtml(titleMatch?.[1] || link?.[1] || '');
    const title = stripHtml(titleMatch?.[2] || titleMatch?.[1] || '');
    const snippetMatch = block.match(/<div[^>]*class="[^"]*(?:content-right_[^"]*|c-color-text|c-span[0-9]+)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || block.match(/<span[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || block.match(/<div[^>]*data-module="abstract"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = stripHtml(snippetMatch?.[1] || '');
    if (!rawUrl || !title || out.some((x) => x.url === rawUrl || x.title === title)) continue;
    out.push({ rank: out.length + 1, url: rawUrl, title, snippet });
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseYandexHtml(text, maxResults) {
  const out = [];
  if (/showcaptcha|Are you not a robot\?/i.test(text)) return out;
  const re = /<a[^>]*class="[^"]*(?:OrganicTitle-Link|Link[^" ]* OrganicTitle-Link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,2000}?(?:<div[^>]*class="[^"]*OrganicTextContentSpan[^"]*"[^>]*>([\s\S]*?)<\/div>)?/g;
  for (const m of text.matchAll(re)) {
    const url = decodeHtml(m[1]);
    const title = stripHtml(m[2]);
    const snippet = stripHtml(m[3] || '');
    if (!url || !title || out.some((x) => x.url === url)) continue;
    out.push({ rank: out.length + 1, url, title, snippet });
    if (out.length >= maxResults) break;
  }
  return out;
}

async function searchGoogleRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'google' };
  const url = `https://www.google.com/search?hl=${containsCJK(q) ? 'zh-CN' : 'en'}&q=${encodeURIComponent(q)}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  return { ok: res.ok, status: res.status, query: q, results: parseGoogleHtml(text, maxResults), source: 'google' };
}

async function searchDuckDuckGoRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'duckduckgo' };
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  return { ok: res.ok, status: res.status, query: q, results: parseDuckHtml(text, url, maxResults), source: 'duckduckgo' };
}

async function searchBingRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'bing' };
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=${containsCJK(q) ? 'zh-Hans' : 'en-US'}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  return { ok: res.ok, status: res.status, query: q, results: parseBingHtml(text, maxResults), source: 'bing' };
}

async function searchYahooRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'yahoo' };
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  return { ok: res.ok, status: res.status, query: q, results: parseYahooHtml(text, maxResults), source: 'yahoo' };
}

async function searchBaiduRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'baidu' };
  const headers = { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' };
  const attempts = [
    `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    `http://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    `http://m.baidu.com/s?word=${encodeURIComponent(q)}`,
  ];
  let last = { ok: false, status: 599, query: q, results: [], source: 'baidu' };
  for (const url of attempts) {
    const { res, text } = await fetchText(url, { headers, redirect: 'follow' });
    const results = parseBaiduHtml(text, maxResults);
    last = { ok: res.ok, status: res.status, query: q, results, source: 'baidu', final_url: res.url };
    if (results.length > 0) return last;
  }
  return last;
}

async function searchYandexRaw(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [], source: 'yandex' };
  const url = `https://yandex.com/search/?text=${encodeURIComponent(q)}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  const captcha = /showcaptcha|Are you not a robot\?/i.test(text) || /showcaptcha/i.test(res.url || '');
  return { ok: res.ok && !captcha, status: captcha ? 429 : res.status, query: q, results: parseYandexHtml(text, maxResults), source: 'yandex', blocked: captcha, final_url: res.url };
}

async function chooseBestResult(rawResults, query) {
  const usable = rawResults.find(r => Array.isArray(r.results) && r.results.length > 0);
  if (usable) return { ...usable, query, fallback_used: usable.source !== rawResults[0].source };
  return { ...(rawResults[0] || { ok: true, status: 200, results: [], source: 'none' }), query, fallback_used: false };
}

async function searchGoogleWeb(query, maxResults = 5) {
  return await chooseBestResult([
    await searchGoogleRaw(query, maxResults),
    await searchDuckDuckGoRaw(query, maxResults),
    await searchBingRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchDuckDuckGo(query, maxResults = 5) {
  return await chooseBestResult([
    await searchDuckDuckGoRaw(query, maxResults),
    await searchBingRaw(query, maxResults),
    await searchGoogleRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchBing(query, maxResults = 5) {
  return await chooseBestResult([
    await searchBingRaw(query, maxResults),
    await searchDuckDuckGoRaw(query, maxResults),
    await searchGoogleRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchYahoo(query, maxResults = 5) {
  return await chooseBestResult([
    await searchYahooRaw(query, maxResults),
    await searchBingRaw(query, maxResults),
    await searchDuckDuckGoRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchBaidu(query, maxResults = 5) {
  return await chooseBestResult([
    await searchBaiduRaw(query, maxResults),
    await searchBingRaw(query, maxResults),
    await searchDuckDuckGoRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchYandex(query, maxResults = 5) {
  return await chooseBestResult([
    await searchYandexRaw(query, maxResults),
    await searchBingRaw(query, maxResults),
    await searchDuckDuckGoRaw(query, maxResults),
  ], normalizeQuery(query));
}

async function searchWikipedia(query, limit = 5, lang = 'auto') {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [] };
  const preferredLang = lang === 'auto' ? (containsCJK(q) ? 'zh' : 'en') : String(lang || 'en').toLowerCase();
  const languages = preferredLang === 'zh' ? ['zh', 'en'] : ['en', 'zh'];
  for (const oneLang of languages) {
    const url = `https://${oneLang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&namespace=0&format=json&origin=*`;
    const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
    const data = JSON.parse(text || '[]');
    const titles = Array.isArray(data?.[1]) ? data[1] : [];
    const snippets = Array.isArray(data?.[2]) ? data[2] : [];
    const urls = Array.isArray(data?.[3]) ? data[3] : [];
    const results = titles.map((title, i) => ({
      rank: i + 1,
      title,
      snippet: stripHtml(snippets[i] || ''),
      url: urls[i] || `https://${oneLang}.wikipedia.org/wiki/${encodeURIComponent(String(title || '').replace(/ /g, '_'))}`,
      lang: oneLang,
    }));
    if (results.length > 0) return { ok: res.ok, status: res.status, query: q, lang: oneLang, results };
  }
  return { ok: true, status: 200, query: q, lang: preferredLang, results: [] };
}

async function searchReddit(query, subreddit, limit = 5, sort = 'relevance') {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, subreddit: subreddit || null, results: [] };
  const base = subreddit ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json` : 'https://www.reddit.com/search.json';
  const url = `${base}?q=${encodeURIComponent(q)}&limit=${limit}&sort=${encodeURIComponent(sort)}&restrict_sr=${subreddit ? 'on' : 'off'}`;
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  const data = JSON.parse(text || '{}');
  const results = ((((data || {}).data || {}).children) || []).map((item, i) => {
    const d = item.data || {};
    return {
      rank: i + 1,
      title: d.title || '',
      subreddit: d.subreddit || null,
      author: d.author || null,
      score: d.score ?? null,
      url: d.url ? absoluteUrl(d.url, 'https://www.reddit.com') : null,
      permalink: d.permalink ? absoluteUrl(d.permalink, 'https://www.reddit.com') : null,
      selftext: (d.selftext || '').slice(0, 1000),
    };
  });
  return { ok: res.ok, status: res.status, query: q, subreddit: subreddit || null, results };
}

async function searchTwitterX(query, maxResults = 5) {
  const q = normalizeQuery(query);
  if (!q) return { ok: true, status: 200, query: q, results: [] };
  const scopedQueries = [
    `${q} site:x.com OR site:twitter.com`,
    `${q} (site:x.com OR site:twitter.com)`,
    `${q} twitter`,
  ];
  const engines = [];
  for (const sq of scopedQueries) {
    engines.push(await searchDuckDuckGo(sq, Math.max(maxResults * 2, 10)));
    engines.push(await searchGoogleWeb(sq, Math.max(maxResults * 2, 10)));
    engines.push(await searchBing(sq, Math.max(maxResults * 2, 10)));
  }
  const merged = [];
  for (const engine of engines) {
    for (const r of (engine.results || [])) {
      if (!/(^https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//i.test(r.url || '')) continue;
      if (/(?:\/home|\/explore|\/search|\/i\/flow|\/settings)(?:[/?#]|$)/i.test(r.url || '')) continue;
      if (merged.some((x) => x.url === r.url)) continue;
      merged.push(r);
      if (merged.length >= maxResults) break;
    }
    if (merged.length >= maxResults) break;
  }
  return { ok: merged.length > 0, status: merged.length > 0 ? 200 : 404, query: q, results: merged, via: 'multi_engine_site_search' };
}

async function fetchUrl(url, maxChars = 6000) {
  const { res, text } = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [null, ''])[1];
  return {
    ok: res.ok,
    status: res.status,
    url,
    final_url: res.url,
    content_type: res.headers.get('content-type'),
    title: decodeHtml(title),
    text: stripHtml(text).slice(0, maxChars),
  };
}

async function fetchRedditPost(url, maxComments = 5) {
  const jsonUrl = url.replace(/\/$/, '') + '.json';
  const { res, text } = await fetchText(jsonUrl, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw Search MCP' } });
  const data = JSON.parse(text || '[]');
  const post = (((data[0] || {}).data || {}).children || [])[0]?.data || {};
  const comments = ((((data[1] || {}).data || {}).children) || []).slice(0, maxComments).map((c) => ({ author: c?.data?.author || null, body: (c?.data?.body || '').slice(0, 500), score: c?.data?.score ?? null }));
  return {
    ok: res.ok,
    status: res.status,
    title: post.title || '',
    subreddit: post.subreddit || null,
    author: post.author || null,
    score: post.score ?? null,
    selftext: post.selftext || '',
    url: post.url ? absoluteUrl(post.url, 'https://www.reddit.com') : url,
    comments,
  };
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'search_google_web':
      return await searchGoogleWeb(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_duckduckgo':
      return await searchDuckDuckGo(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_bing':
      return await searchBing(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_baidu':
      return await searchBaidu(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_yandex':
      return await searchYandex(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_yahoo':
      return await searchYahoo(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'search_wikipedia':
      return await searchWikipedia(args?.query, clampInt(args?.limit, 1, 10, 5), args?.lang ?? 'auto');
    case 'search_reddit':
      return await searchReddit(args?.query, args?.subreddit ? String(args.subreddit) : '', clampInt(args?.limit, 1, 10, 5), String(args?.sort || 'relevance'));
    case 'search_twitter_x':
      return await searchTwitterX(args?.query, clampInt(args?.max_results, 1, 10, 5));
    case 'fetch_url':
      return await fetchUrl(String(args?.url || ''), clampInt(args?.max_chars, 500, 20000, 6000));
    case 'fetch_reddit_post':
      return await fetchRedditPost(String(args?.url || ''), clampInt(args?.max_comments, 1, 20, 5));
    default:
      throw new Error(`unknown_tool:${name}`);
  }
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return Response.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION, mcp_endpoint: `${url.origin}/mcp`, tools: TOOLS.map((t) => t.name) }, { headers: corsHeaders() });
    }

    if (req.method !== 'POST' || url.pathname !== '/mcp') {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404, headers: corsHeaders() });
    }

    let body;
    try { body = await req.json(); } catch { return jsonRpcError(null, -32700, 'Parse error'); }

    const id = body?.id ?? null;
    const method = body?.method;
    const params = body?.params || {};

    try {
      if (method === 'initialize') {
        return jsonRpc(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
      }
      if (method === 'notifications/initialized') {
        return new Response(null, { status: 202, headers: corsHeaders() });
      }
      if (method === 'tools/list') {
        return jsonRpc(id, { tools: TOOLS });
      }
      if (method === 'tools/call') {
        const result = await handleToolCall(params?.name, params?.arguments || {});
        return jsonRpc(id, textContent(result));
      }
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    } catch (e) {
      return jsonRpcError(id, -32000, 'Tool execution failed', { message: String(e?.message || e) });
    }
  },
};

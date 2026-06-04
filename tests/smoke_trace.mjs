#!/usr/bin/env node
// smoke_trace.mjs — smoke test for search-mcp-worker (current main)
// Run: node tests/smoke_trace.mjs [BASE_URL]
// Exit 0 = all pass, exit 1 = failures

const BASE = process.argv[2] || "https://search-mcp.qdp.qzz.io";
const STRICT = process.env.CI_STRICT_NETWORKING === "true";

let passed = 0, failed = 0, warned = 0;
const parserStats = { exact: 0, skeleton_fallback: 0, unknown: 0 };
const engineParserHistory = {};

function assert(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}
function warn(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { warned++; console.log(`  ⚠️  ${name} (non-blocking)${detail ? " — " + detail : ""}`); }
}

async function callToolRaw(tool, args, timeoutMs = 15000) {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)
      });
      return await res.json();
    } catch (e) {
      if (attempt === 1) return { error: { message: e.message } };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function callTool(tool, args, timeoutMs = 15000) {
  const json = await callToolRaw(tool, args, timeoutMs);
  return json.result?.content?.[0]?.text || "";
}

function recordParser(engine, json) {
  const sc = json.result?.structuredContent;
  const parser = sc?._meta?.parser
    || (sc?.results?.length ? "exact" : "unknown");
  if (!engineParserHistory[engine]) engineParserHistory[engine] = [];
  engineParserHistory[engine].push(parser);
  parserStats[parser] = (parserStats[parser] || 0) + 1;
}

function auditSemanticIntegrity(engine, query, json) {
  const items = json.result?.structuredContent?.results || [];
  const compactQuery = String(query || "").toLowerCase().replace(/[\s\p{P}]+/gu, "");
  const queryHasRouterIntent = /路由器|wifi|pppoe|校园网|千兆/i.test(query);
  if (!queryHasRouterIntent) return;
  const corrupted = items.some((item) => {
    const title = String(item?.title || "").toLowerCase();
    const url = String(item?.url || "").toLowerCase();
    const haystack = `${title} ${String(item?.snippet || "").toLowerCase()}`;
    const yearbookNoise = /(?:wikipedia\.org|cnn\.com|apnews\.com|associatedpress\.com)/i.test(url)
      && /\b2025\b/.test(title)
      && !/(路由器|wifi|wi-fi|pppoe|校园网|router|gigabit)/i.test(haystack);
    return yearbookNoise;
  });
  if (corrupted) {
    console.error(`\n❌ CRITICAL SEMANTIC FAILURE: ${engine} likely truncated query`);
    console.error(`   Query: ${query}`);
    console.error("   Got generic 2025 yearbook/wiki/news results instead of router/WiFi intent.");
    failed++;
  } else {
    passed++;
    console.log(`  ✅ ${engine} semantic integrity`);
  }
}

function hasResults(text) {
  return text.includes("1.") || text.includes("search results") || text.includes("Results");
}

(async () => {
  // 1. Health check: build.sha must be set (not "unknown")
  console.log("\n=== 1. Health check: SHA must be set ===");
  try {
    let health;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        health = await (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(8000) })).json();
        break;
      } catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 1000)); }
    }
    assert("health.ok is true", health.ok === true);
    assert("build.sha is not unknown", health.build?.sha && health.build.sha !== "unknown", health.build?.sha || "missing");
    assert("build.time is set", !!health.build?.time, health.build?.time || "missing");
  } catch (e) {
    assert("health endpoint reachable", false, e.message);
  }

  // 2. sina_news returns Chinese news
  console.log("\n=== 2. sina_news — Chinese news search ===");
  const sinaRaw = await callToolRaw("search_sina_news", { query: "高考作文", limit: 3 });
  const sina = sinaRaw.result?.content?.[0]?.text || "";
  recordParser("sina_news", sinaRaw);
  assert("sina_news returns results", hasResults(sina), sina.slice(0, 100));
  assert("sina_news not blocked", !sina.includes("blocked") || sina.includes("0 results") === false);

  // 3. 163_news returns Chinese news
  console.log("\n=== 3. 163_news — Chinese news search ===");
  const n163Raw = await callToolRaw("search_163_news", { query: "上海天气", limit: 3 });
  const n163 = n163Raw.result?.content?.[0]?.text || "";
  recordParser("163_news", n163Raw);
  assert("163_news returns results", hasResults(n163), n163.slice(0, 100));
  assert("163_news not blocked", !n163.includes("blocked") || n163.includes("0 results") === false);

  // 4. search_auto returns results for general query (network-dependent in CI)
  console.log(`\n=== 4. search_auto — general query (${STRICT ? "strict" : "non-blocking"}) ===`);
  const auto1Raw = await callToolRaw("search_auto", { query: "weather london", limit: 3 }, 30000);
  const auto1 = auto1Raw.result?.content?.[0]?.text || "";
  recordParser("search_auto_en", auto1Raw);
  (STRICT ? assert : warn)("search_auto returns results or has trace", hasResults(auto1) || auto1.includes("trace"), auto1.slice(0, 100));

  // 5. search_auto returns results for Chinese query (network-dependent in CI)
  console.log(`\n=== 5. search_auto — Chinese query (${STRICT ? "strict" : "non-blocking"}) ===`);
  const auto2Raw = await callToolRaw("search_auto", { query: "高考作文", limit: 3 }, 30000);
  const auto2 = auto2Raw.result?.content?.[0]?.text || "";
  recordParser("search_auto_cjk", auto2Raw);
  (STRICT ? assert : warn)("search_auto CJK returns results", hasResults(auto2) || auto2.includes("trace"), auto2.slice(0, 100));

  // 6. search_pypi returns package info
  console.log("\n=== 6. search_pypi — package search ===");
  const pypiRaw = await callToolRaw("search_pypi", { query: "requests", limit: 3 });
  const pypi = pypiRaw.result?.content?.[0]?.text || "";
  recordParser("pypi", pypiRaw);
  assert("search_pypi returns results", hasResults(pypi), pypi.slice(0, 100));

  // 7. search_bing semantic guard: catch query truncation to bare "2025"
  console.log("\n=== 7. search_bing — semantic truncation guard ===");
  const routerQuery = "2025 性价比 千兆 WiFi6 PPPoE 校园网 路由器";
  const bingRouterRaw = await callToolRaw("search_bing", { query: routerQuery, limit: 3 }, 30000);
  const bingRouter = bingRouterRaw.result?.content?.[0]?.text || "";
  recordParser("bing_router_guard", bingRouterRaw);
  (STRICT ? assert : warn)("search_bing router query returns results", hasResults(bingRouter), bingRouter.slice(0, 100));
  auditSemanticIntegrity("bing", routerQuery, bingRouterRaw);

  // === Parser observability report ===
  console.log("\n=== 📊 Parser Observability Report ===");
  const totalParsed = parserStats.exact + parserStats.skeleton_fallback + (parserStats.unknown || 0);
  console.log(`  exact: ${parserStats.exact} | skeleton_fallback: ${parserStats.skeleton_fallback} | unknown: ${parserStats.unknown || 0} (total: ${totalParsed})`);
  for (const [eng, hist] of Object.entries(engineParserHistory)) {
    console.log(`  ${eng}: [${hist.join(", ")}]`);
  }

  // Degradation alert: core engines at 100% skeleton_fallback
  const coreEngines = ["baidu", "bing", "google_web", "duckduckgo"];
  let degradedEngines = [];
  for (const [eng, hist] of Object.entries(engineParserHistory)) {
    if (hist.length > 0 && hist.every(p => p === "skeleton_fallback") && coreEngines.some(c => eng.includes(c))) {
      degradedEngines.push(eng);
    }
  }
  if (degradedEngines.length > 0) {
    console.error(`\n🚨 DEGRADATION ALERT: core engines at 100% skeleton_fallback: ${degradedEngines.join(", ")}`);
    console.error("   Primary CSS selectors may be stale — parser update needed.");
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${warned} warnings`);
  process.exit(failed > 0 ? 1 : 0);
})();

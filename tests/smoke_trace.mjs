#!/usr/bin/env node
// smoke_trace.mjs — smoke test for search-mcp-worker (current main)
// Run: node tests/smoke_trace.mjs [BASE_URL]
// Exit 0 = all pass, exit 1 = failures

const BASE = process.argv[2] || "https://search-mcp.qdp.qzz.io";

let passed = 0, failed = 0, warned = 0;
function assert(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}
function warn(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { warned++; console.log(`  ⚠️  ${name} (non-blocking)${detail ? " — " + detail : ""}`); }
}

async function callTool(tool, args) {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
      });
      const json = await res.json();
      return json.result?.content?.[0]?.text || "";
    } catch (e) {
      if (attempt === 1) return `FETCH_ERROR: ${e.message}`;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function hasResults(text) {
  return text.includes("1.") || text.includes("search results") || text.includes("Results");
}

(async () => {
  // 1. Health check: build.sha must be set (not "unknown")
  console.log("\n=== 1. Health check: SHA must be set ===");
  try {
    const health = await (await fetch(`${BASE}/health`)).json();
    assert("health.ok is true", health.ok === true);
    assert("build.sha is not unknown", health.build?.sha && health.build.sha !== "unknown", health.build?.sha || "missing");
    assert("build.time is set", !!health.build?.time, health.build?.time || "missing");
  } catch (e) {
    assert("health endpoint reachable", false, e.message);
  }

  // 2. sina_news returns Chinese news
  console.log("\n=== 2. sina_news — Chinese news search ===");
  const sina = await callTool("search_sina_news", { query: "高考作文", limit: 3 });
  assert("sina_news returns results", hasResults(sina), sina.slice(0, 100));
  assert("sina_news not blocked", !sina.includes("blocked") || sina.includes("0 results") === false);

  // 3. 163_news returns Chinese news
  console.log("\n=== 3. 163_news — Chinese news search ===");
  const n163 = await callTool("search_163_news", { query: "上海天气", limit: 3 });
  assert("163_news returns results", hasResults(n163), n163.slice(0, 100));
  assert("163_news not blocked", !n163.includes("blocked") || n163.includes("0 results") === false);

  // 4. search_auto returns results for general query (may timeout — network-dependent)
  console.log("\n=== 4. search_auto — general query (non-blocking) ===");
  const auto1 = await callTool("search_auto", { query: "weather london", limit: 3 });
  warn("search_auto returns results or has trace", hasResults(auto1) || auto1.includes("trace"), auto1.slice(0, 100));

  // 5. search_auto returns results for Chinese query (may timeout from CI)
  console.log("\n=== 5. search_auto — Chinese query (non-blocking) ===");
  const auto2 = await callTool("search_auto", { query: "高考作文", limit: 3 });
  warn("search_auto CJK returns results", hasResults(auto2) || auto2.includes("trace"), auto2.slice(0, 100));

  // 6. search_pypi returns package info
  console.log("\n=== 6. search_pypi — package search ===");
  const pypi = await callTool("search_pypi", { query: "requests", limit: 3 });
  assert("search_pypi returns results", hasResults(pypi), pypi.slice(0, 100));

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${warned} warnings`);
  process.exit(failed > 0 ? 1 : 0);
})();

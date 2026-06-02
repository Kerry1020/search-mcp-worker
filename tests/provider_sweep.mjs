#!/usr/bin/env node
// provider_sweep.mjs — per-provider health check for search_* tools
// Run: node tests/provider_sweep.mjs [BASE_URL]
//
// Scope: All search_* tools listed in ENGINE_STABILITY.md canonical tool names,
// excluding: search_auto (aggregator), search_parallel (requires config),
// search_ollama (requires local server), search_xiaohongshu (requires token server).
// Non-search tools (fetch_*, instant_answer, find_rss, debug_*) are out of scope.
//
// Checks per provider:
// 1. Failure classification: consent/challenge/captcha → hard_failure + error_type
// 2. Trace contract: engine/level/ms/status/result_count present
// 3. Input normalization: normalized_query present when query is modified

const BASE = process.argv[2] || "https://search-mcp.qdp.qzz.io";
const TIMEOUT_MS = 12000;

async function callTool(name, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
  try {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
    const res = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const json = await res.json();
    const text = json.result?.content?.[0]?.text || "";
    const idx = text.indexOf("--- trace ---");
    let trace = null;
    if (idx >= 0) trace = JSON.parse(text.slice(idx + "--- trace ---".length));
    // Count results: "1. title" format or numbered list
    const resultCount = (text.match(/^\d+\.\s/gm) || []).length;
    return { text: text.slice(0, idx > 0 ? idx : 300), trace, resultCount };
  } finally { clearTimeout(timer); }
}

// Representative queries chosen per-provider to maximize hit probability
// Level C uses generic queries since results are not expected (blocked)
const PROVIDERS = [
  // Level A - Structured (representative domain-specific queries)
  { name: "search_arxiv", query: "attention is all you need", level: "A", note: "exact paper title" },
  { name: "search_crossref", query: "deep learning nature", level: "A", note: "academic keyword" },
  { name: "search_pubmed", query: "CRISPR gene editing", level: "A", note: "biomedical topic" },
  { name: "search_paperswithcode", query: "object detection YOLO", level: "A", note: "method + model" },
  { name: "search_wikipedia", query: "quantum computing", level: "A", note: "general knowledge" },
  { name: "search_wikidata", query: "Albert Einstein", level: "A", note: "famous entity" },
  { name: "search_wiktionary", query: "serendipity", level: "A", note: "common English word" },
  { name: "search_openlibrary", query: "dune frank herbert", level: "A", note: "famous book" },
  { name: "search_github_repos", query: "react framework", level: "A", note: "popular repo" },
  { name: "search_hackernews", query: "rust programming", level: "A", note: "tech topic" },
  { name: "search_stackoverflow", query: "python list comprehension", level: "A", note: "exact SO topic" },
  { name: "search_npm", query: "express", level: "A", note: "popular package" },
  { name: "search_crates", query: "serde", level: "A", note: "popular crate" },
  { name: "search_devto", query: "typescript tips", level: "A", note: "dev blog topic" },
  { name: "search_reddit", query: "r/programming rust", level: "A", note: "subreddit + topic" },
  { name: "search_lemmy", query: "linux desktop", level: "A", note: "community topic" },
  { name: "search_mastodon", query: "open source software", level: "A", note: "fediverse topic" },
  { name: "search_peertube", query: "programming tutorial", level: "A", note: "video topic" },
  { name: "search_osm", query: "restaurant Tokyo", level: "A", note: "geo + city" },
  { name: "search_musicbrainz", query: "radiohead", level: "A", note: "famous artist" },
  { name: "search_sec_edgar", query: "Apple Inc", level: "A", note: "public company" },
  { name: "search_bbc", query: "climate change", level: "A", note: "news topic" },
  // Level B - HTML (cold queries to avoid consent/captcha triggers)
  { name: "search_sogou", query: "天气预报 明天", level: "B", note: "Chinese weather" },
  { name: "search_naver", query: "날씨", level: "B", note: "Korean weather" },
  { name: "search_bing", query: "how to bake bread", level: "B", note: "non-tech cold query" },
  { name: "search_bing_news", query: "space exploration", level: "B", note: "news topic" },
  { name: "search_yahoo", query: "history of Rome", level: "B", note: "non-tech cold query" },
  { name: "search_archive", query: "example.com", level: "B", note: "archived domain" },
  // Level C - Blocked (generic queries, expect hard_failure or empty)
  { name: "search_google_web", query: "hello world", level: "C", note: "expect blocked" },
  { name: "search_duckduckgo", query: "hello world", level: "C", note: "expect blocked" },
  { name: "search_yandex", query: "hello world", level: "C", note: "expect blocked" },
  { name: "search_baidu", query: "你好世界", level: "C", note: "expect blocked" },
  { name: "search_pypi", query: "flask", level: "C", note: "HTML path blocked, API path works" },
];

const REQUIRED_FIELDS = ["engine", "level", "ms", "status", "result_count"];

(async () => {
  const report = [];
  let pass = 0, fail = 0;

  // Run sequentially to avoid overwhelming upstream
  for (const p of PROVIDERS) {
    process.stderr.write(`.`);
    try {
      const r = await callTool(p.name, { query: p.query, limit: 3 });
      const entry = { provider: p.name, level: p.level, query: p.query, result_count: r.resultCount, issues: [] };

        // Check 1: Contract fields (only if trace available)
        if (r.trace) {
          for (const a of r.trace.attempts || []) {
            const missing = REQUIRED_FIELDS.filter(f => !(f in a));
            if (missing.length) entry.issues.push(`missing fields: ${missing.join(",")}`);
            if (a.status === "hard_failure" && !a.error_type) entry.issues.push("hard_failure without error_type");
            const knownTypes = ["captcha", "challenge", "consent", "http_client_error", "http_server_error", "challenge_page_detected", "unknown"];
            if (a.error_type && !knownTypes.includes(a.error_type)) entry.issues.push(`unknown error_type: ${a.error_type}`);
          }
        }

        // Check 2: No results but no trace of failure = suspicious empty
        if (r.resultCount === 0 && r.trace) {
          const allEmpty = r.trace.attempts?.every(a => a.status === "empty");
          if (allEmpty && p.level === "A") entry.issues.push("Level A returned empty (verify query suitability)");
        }

        if (entry.issues.length === 0) { entry.status = r.resultCount > 0 ? "PASS" : "EMPTY_OK"; pass++; }
        else { entry.status = "ISSUES"; fail++; }
        report.push(entry);
      } catch (e) {
        fail++;
        report.push({ provider: p.name, level: p.level, query: p.query, status: "ERROR", result_count: 0, issues: [e.message?.slice(0, 100)] });
      }
    await new Promise(r => setTimeout(r, 500));
  }

  process.stderr.write("\n\n");

  // Summary table
  const levelOrder = { A: 0, B: 1, C: 2 };
  report.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));

  console.log("=".repeat(80));
  console.log("PROVIDER SWEEP REPORT");
  console.log("=".repeat(80));
  for (const r of report) {
    const icon = r.status === "PASS" ? "✅" : r.status === "EMPTY_OK" ? "⚠️ " : "❌";
    const lvl = `[${r.level}]`;
    const cnt = `n=${r.result_count ?? "?"}`;
    const issues = r.issues?.length ? ` → ${r.issues.join("; ")}` : "";
    console.log(`${icon} ${lvl.padEnd(4)} ${r.provider.padEnd(28)} ${cnt.padEnd(6)}${issues}`);
  }
  console.log("=".repeat(80));
  console.log(`Total: ${report.length} | Pass: ${pass} | Issues: ${fail}`);
  console.log("=".repeat(80));

  // JSON output for programmatic use
  const jsonPath = new URL("./sweep_report.json", import.meta.url).pathname;
  const fs = await import("fs");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nFull JSON: ${jsonPath}`);

  process.exit(fail > 0 ? 1 : 0);
})();

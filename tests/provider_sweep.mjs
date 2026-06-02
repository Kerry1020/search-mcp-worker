#!/usr/bin/env node
// provider_sweep.mjs — per-provider health check
// Run: node tests/provider_sweep.mjs [BASE_URL]
// Output: JSON report to stdout, summary to stderr

const BASE = process.argv[2] || "https://search-mcp.qdp.qzz.io";

async function callTool(name, args) {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  const text = json.result?.content?.[0]?.text || "";
  const idx = text.indexOf("--- trace ---");
  let trace = null;
  if (idx >= 0) trace = JSON.parse(text.slice(idx + "--- trace ---".length));
  const resultCount = (text.match(/^\d+\./gm) || []).length;
  return { text: text.slice(0, idx > 0 ? idx : 300), trace, resultCount };
}

const PROVIDERS = [
  // Level A - Structured
  { name: "search_arxiv", query: "transformer attention", level: "A" },
  { name: "search_crossref", query: "machine learning", level: "A" },
  { name: "search_pubmed", query: "covid vaccine", level: "A" },
  { name: "search_paperswithcode", query: "object detection", level: "A" },
  { name: "search_wikipedia", query: "quantum computing", level: "A" },
  { name: "search_wikidata", query: "Albert Einstein", level: "A" },
  { name: "search_wiktionary", query: "serendipity", level: "A" },
  { name: "search_openlibrary", query: "dune frank herbert", level: "A" },
  { name: "search_github_repos", query: "react framework", level: "A" },
  { name: "search_hackernews", query: "rust programming", level: "A" },
  { name: "search_stackoverflow", query: "python list comprehension", level: "A" },
  { name: "search_npm", query: "express", level: "A" },
  { name: "search_crates", query: "serde", level: "A" },
  { name: "search_devto", query: "typescript tips", level: "A" },
  { name: "search_reddit", query: "machine learning", level: "A" },
  { name: "search_lemmy", query: "linux", level: "A" },
  { name: "search_mastodon", query: "open source", level: "A" },
  { name: "search_peertube", query: "programming", level: "A" },
  { name: "search_osm", query: "restaurant Tokyo", level: "A" },
  { name: "search_musicbrainz", query: "radiohead", level: "A" },
  { name: "search_sec_edgar", query: "Apple Inc", level: "A" },
  { name: "search_bbc", query: "climate change", level: "A" },
  { name: "search_instant_answer", query: "capital of France", level: "A" },
  // Level B - HTML
  { name: "search_sogou", query: "天气预报", level: "B" },
  { name: "search_naver", query: "한국 날씨", level: "B" },
  { name: "search_bing", query: "python tutorial", level: "B" },
  { name: "search_bing_news", query: "AI news", level: "B" },
  { name: "search_yahoo", query: "best laptops 2026", level: "B" },
  { name: "search_archive", query: "example.com", level: "B" },
  // Level C - Blocked/Experimental
  { name: "search_google_web", query: "test query", level: "C" },
  { name: "search_duckduckgo", query: "test query", level: "C" },
  { name: "search_yandex", query: "test query", level: "C" },
  { name: "search_baidu", query: "测试查询", level: "C" },
  { name: "search_pypi", query: "requests", level: "C" },
];

const REQUIRED_FIELDS = ["engine", "level", "ms", "status", "result_count"];

(async () => {
  const report = [];
  let pass = 0, fail = 0;

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
          // Check if error_type is in known enum
          const knownTypes = ["captcha", "challenge", "consent", "http_client_error", "http_server_error", "challenge_page_detected", "unknown"];
          if (a.error_type && !knownTypes.includes(a.error_type)) entry.issues.push(`unknown error_type: ${a.error_type}`);
        }
      }

      // Check 2: No results but no trace of failure = suspicious empty
      if (r.resultCount === 0 && r.trace) {
        const allEmpty = r.trace.attempts?.every(a => a.status === "empty");
        if (allEmpty && p.level === "A") entry.issues.push("Level A returned empty (verify query suitability)");
      }

      // Status determination
      if (entry.issues.length === 0) {
        entry.status = r.resultCount > 0 ? "PASS" : "EMPTY_OK";
        pass++;
      } else {
        entry.status = "ISSUES";
        fail++;
      }
      report.push(entry);
    } catch (e) {
      report.push({ provider: p.name, level: p.level, query: p.query, status: "ERROR", issues: [e.message?.slice(0, 100)] });
      fail++;
    }
    await new Promise(r => setTimeout(r, 300)); // rate limit
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
    const cnt = `n=${r.resultCount}`;
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

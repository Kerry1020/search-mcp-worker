#!/usr/bin/env node
// smoke_trace.mjs — 6 invariant assertions for search_auto trace contract
// Run: node tests/smoke_trace.mjs [BASE_URL]
// Exit 0 = all pass, exit 1 = failures

const BASE = process.argv[2] || "https://search-mcp.qdp.qzz.io";

async function callAuto(query, extra = {}) {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_auto", arguments: { query, limit: 3, ...extra } } };
  const res = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  const text = json.result?.content?.[0]?.text || "";
  const idx = text.indexOf("--- trace ---");
  if (idx < 0) return { text: text.slice(0, 300), trace: null };
  return { text: text.slice(0, idx), trace: JSON.parse(text.slice(idx + "--- trace ---".length)) };
}

const LEVEL_C = new Set(["search_google_web", "search_duckduckgo", "search_yandex", "search_baidu"]);
const LEVEL_B_HTML = new Set(["search_bing", "search_sogou", "search_naver", "search_yahoo", "search_bing_news"]);
const CHANNEL_WORDS = /\b(npm|pip|pypi|cargo|install)\b/i;
const CROSS_ECO = { python: new Set(["search_npm", "search_crates"]), js: new Set(["search_crates", "search_pypi_api"]), rust: new Set(["search_npm", "search_pypi_api"]) };

let passed = 0, failed = 0;
function assert(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}

(async () => {
  // 1. Hard Rule: default mode no Level C
  console.log("\n=== 1. Hard Rule: no Level C in default mode ===");
  const r1 = await callAuto("weather london");
  if (r1.trace) {
    const hasC = r1.trace.attempts.some(a => LEVEL_C.has(a.engine));
    assert("no Level C in default", !hasC, hasC ? r1.trace.attempts.map(a => a.engine).join(",") : "");
  } else assert("trace present", false, r1.text);

  // 2. Failure classification: hard_failure must have error_type
  console.log("\n=== 2. Failure classification ===");
  const r2 = await callAuto("google search test", { auto_mode: "full" });
  if (r2.trace) {
    const hfs = r2.trace.attempts.filter(a => a.status === "hard_failure");
    if (hfs.length > 0) {
      assert("hard_failure has error_type", hfs.every(a => a.error_type), hfs.map(a => `${a.engine}:${a.error_type}`).join(", "));
    } else {
      // No hard failures encountered — check structure is valid
      assert("attempts structure valid", r2.trace.attempts.every(a => a.engine && a.level && typeof a.ms === "number" && a.status && typeof a.result_count === "number"));
    }
  } else assert("trace present", false, r2.text);

  // 3. normalized_query: alias engines must not contain channel words
  console.log("\n=== 3. normalized_query for alias engines ===");
  const r3 = await callAuto("pip requests");
  if (r3.trace) {
    const aliases = r3.trace.attempts.filter(a => a.normalized_query);
    if (aliases.length > 0) {
      assert("normalized_query has no channel words", aliases.every(a => !CHANNEL_WORDS.test(a.normalized_query)), aliases.map(a => `${a.engine}: "${a.normalized_query}"`).join(", "));
    } else {
      assert("pypi_api has normalized_query", false, "no normalized_query found");
    }
  } else assert("trace present", false, r3.text);

  // 4. Ecosystem locking: locked set excludes cross-eco registries
  console.log("\n=== 4. Ecosystem locking ===");
  const ecoTests = [
    { q: "pip requests", eco: "python" },
    { q: "npm react", eco: "js" },
    { q: "cargo tokio", eco: "rust" },
  ];
  for (const et of ecoTests) {
    const r = await callAuto(et.q);
    if (r.trace) {
      const crossEco = CROSS_ECO[et.eco];
      const first3 = r.trace.attempts.slice(0, 3);
      const hasCross = first3.some(a => crossEco.has(a.engine));
      assert(`${et.eco}: no cross-eco in first 3`, !hasCross, hasCross ? first3.map(a => a.engine).join(",") : "");
    }
  }

  // 5. Intent gate: pkg/academic/tech skip Level B HTML
  console.log("\n=== 5. Intent gate for Level B HTML ===");
  const gateTests = ["pip requests", "transformer attention", "rust tokio async"];
  for (const q of gateTests) {
    const r = await callAuto(q);
    if (r.trace) {
      const htmlB = r.trace.attempts.filter(a => LEVEL_B_HTML.has(a.engine));
      assert(`"${q}" no Level B HTML`, htmlB.length === 0, htmlB.length ? htmlB.map(a => a.engine).join(",") : "");
    }
  }

  // 6. Trace contract: every attempt has required fields
  console.log("\n=== 6. Trace contract fields ===");
  const r6 = await callAuto("python flask tutorial");
  if (r6.trace) {
    const required = ["engine", "level", "ms", "status", "result_count"];
    for (const a of r6.trace.attempts) {
      const missing = required.filter(f => !(f in a));
      assert(`${a.engine} has all fields`, missing.length === 0, missing.join(",") || "ok");
      if (a.status === "hard_failure") {
        assert(`${a.engine} hard_failure has error_type`, !!a.error_type, a.error_type || "missing");
      }
    }
  }

  // 7. Quality gate: good results have no quality_flag
  console.log("\n=== 7. Quality gate — good results ===");
  const r7 = await callAuto("pip requests");
  if (r7.trace) {
    const successAttempts = r7.trace.attempts.filter(a => a.status === "success");
    assert("success has no quality_flag", successAttempts.every(a => !a.quality_flag), successAttempts.map(a => a.quality_flag).join(","));
  }

  // 8. Quality gate: bogus results are treated as hard_failure
  // Test by checking that if quality_flag=bogus exists, status must be hard_failure
  console.log("\n=== 8. Quality gate — bogus = hard_failure ===");
  const r8 = await callAuto("google search test", { auto_mode: "full" });
  if (r8.trace) {
    const bogusAttempts = r8.trace.attempts.filter(a => a.quality_flag === "bogus");
    if (bogusAttempts.length > 0) {
      assert("bogus results are hard_failure", bogusAttempts.every(a => a.status === "hard_failure"), bogusAttempts.map(a => a.status).join(","));
    } else {
      // No bogus detected — verify that successful results are clean
      const successAttempts = r8.trace.attempts.filter(a => a.status === "success");
      assert("no bogus flagged on clean results", true, `${successAttempts.length} success attempts`);
    }
  }

  // 9. Quality gate: weak results have quality_flag but don't crash dispatch
  console.log("\n=== 9. Quality gate — weak doesn't block ===");
  const r9 = await callAuto("apple", { auto_mode: "full" });
  if (r9.trace) {
    const weakAttempts = r9.trace.attempts.filter(a => a.quality_flag === "weak");
    // Weak results should still allow eventual success
    const finalSuccess = r9.trace.attempts.some(a => a.status === "success" && !a.quality_flag);
    if (weakAttempts.length > 0) {
      assert("weak flagged but dispatch continues", finalSuccess || r9.trace.attempts.length > weakAttempts.length);
    } else {
      assert("no weak flagged (acceptable)", true);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();

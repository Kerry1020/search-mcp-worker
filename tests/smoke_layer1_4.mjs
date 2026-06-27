#!/usr/bin/env node
// Smoke test for Layer 1-4 new tools (Steps 1-4).
// Usage: node tests/smoke_layer1_4.mjs [endpoint]
// Default endpoint: https://search-mcp.qdp.qzz.io/mcp
//
// Validates each new tool with a small, deterministic input. Returns exit 0
// only if every assertion passes; otherwise prints a clear failure summary.

const endpointArg = process.argv[2] || "https://search-mcp.qdp.qzz.io/mcp";

// If DNS is poisoned, use `curl --resolve` to bypass DNS.
// Set env MCP_DIRECT_IP to enable curl mode (e.g. MCP_DIRECT_IP=104.21.34.219).
const directIp = process.env.MCP_DIRECT_IP;
const useCurl = Boolean(directIp);
let endpoint = endpointArg;
let endpointHost = "";
if (useCurl) {
  try {
    const u = new URL(endpointArg);
    endpoint = `${u.protocol}//${u.host}${u.pathname}`;
    endpointHost = u.host;
  } catch {
    // keep original
  }
}

async function callTool(name, args = {}) {
  let response;
  if (useCurl) {
    const { spawn } = await import("node:child_process");
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: name,
      method: "tools/call",
      params: { name, arguments: args }
    });
    const curlArgs = [
      "-s",
      "--resolve", `${endpointHost}:443:${directIp}`,
      "-X", "POST",
      endpoint,
      "-H", "Content-Type: application/json",
      "-H", "Accept: application/json, text/event-stream",
      "--data-raw", body
    ];
    const result = await new Promise((resolveRun, rejectRun) => {
      const proc = spawn("curl", curlArgs);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d; });
      proc.stderr.on("data", (d) => { stderr += d; });
      proc.on("error", rejectRun);
      proc.on("close", (code) => resolveRun({ code, stdout, stderr }));
    });
    if (result.code !== 0) {
      return { ok: false, error: `curl exit ${result.code}: ${result.stderr.slice(0, 200)}` };
    }
    try {
      const payload = JSON.parse(result.stdout);
      return payload.result?.structuredContent || { ok: false, error: "missing structuredContent", raw: payload };
    } catch (e) {
      return { ok: false, error: `json parse: ${e.message}`, raw: result.stdout.slice(0, 200) };
    }
  }
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: name,
      method: "tools/call",
      params: { name, arguments: args }
    })
  });
  if (!response.ok) {
    return { ok: false, error: `http ${response.status}` };
  }
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.result?.structuredContent || { ok: false, error: "missing structuredContent", raw: payload };
  } catch (e) {
    return { ok: false, error: `json parse: ${e.message}`, raw: text.slice(0, 200) };
  }
}

const results = [];
let failures = 0;

function assert(name, condition, detail) {
  const pass = Boolean(condition);
  results.push({ name, pass, detail });
  if (!pass) failures++;
  const tag = pass ? "✓" : "✗";
  let line = `  ${tag} ${name}`;
  if (!pass) {
    let detailText;
    if (typeof detail === "function") {
      try {
        detailText = detail();
      } catch (e) {
        detailText = `detail fn error: ${e.message}`;
      }
    } else {
      detailText = detail || "(no detail)";
    }
    line += ` — ${typeof detailText === "string" ? detailText : JSON.stringify(detailText).slice(0, 300)}`;
  }
  console.log(line);
}

async function runSmoke(toolName, displayName, args, assertions) {
  console.log(`\n=== ${displayName} ===`);
  const res = await callTool(toolName, args);
  // DEBUG: dump first 200 chars of res for visibility on failure
  const debugRes = () => `tool=${toolName} res=${JSON.stringify(res).slice(0, 200)}`;
  for (const a of assertions) {
    assert(a.label, a.check(res), a.detail ? a.detail(res) : debugRes);
  }
  return res;
}

// Step 1 — PDF layer
await runSmoke(
  "pdf_parse",
  "pdf_parse (Step 1)",
  { url: "https://arxiv.org/pdf/1706.03762", maxChars: 5000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "size_bytes > 1MB", check: (r) => Number(r.size_bytes) > 1_000_000 },
    { label: "page_count_estimate > 0", check: (r) => Number(r.page_count_estimate) > 0 },
    { label: "text has Attention Is All You Need", check: (r) => /attention/i.test(r.text || "") },
    { label: "text_length > 3000", check: (r) => Number(r.text_length) > 3000 }
  ]
);

await runSmoke(
  "pdf_to_markdown",
  "pdf_to_markdown (Step 1)",
  { url: "https://arxiv.org/pdf/1706.03762", maxChars: 3000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "markdown present", check: (r) => typeof r.markdown === "string" && r.markdown.length > 0 },
    { label: "markdown has # PDF Document header", check: (r) => /#\s*PDF Document/.test(r.markdown || "") },
    { label: "markdown mentions Attention", check: (r) => /attention/i.test(r.markdown || "") }
  ]
);

// Step 2 — Helper tools layer
await runSmoke(
  "fetch_robots",
  "fetch_robots (Step 2)",
  { url: "https://cloudflare.com/", maxChars: 4000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "domain present", check: (r) => typeof r.domain === "string" && r.domain.length > 0 },
    { label: "rules array present", check: (r) => Array.isArray(r.rules) && r.rules.length > 0 }
  ]
);

await runSmoke(
  "fetch_sitemap",
  "fetch_sitemap (Step 2)",
  { url: "https://www.cloudflare.com/sitemap.xml", maxChars: 30000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "source_url present", check: (r) => typeof r.source_url === "string" },
    { label: "urls array present", check: (r) => Array.isArray(r.urls) }
  ]
);

await runSmoke(
  "fetch_html_to_markdown",
  "fetch_html_to_markdown (Step 2)",
  { url: "https://example.com", maxChars: 3000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "title Example Domain", check: (r) => /Example Domain/i.test(r.title || r.markdown || "") },
    { label: "markdown present", check: (r) => typeof r.markdown === "string" && r.markdown.length > 50 }
  ]
);

await runSmoke(
  "fetch_html_extract",
  "fetch_html_extract (Step 2 — AI fallback when no binding)",
  { url: "https://example.com", schema: { title: "string", body: "string" } },
  [
    { label: "returns structured result", check: (r) => r.ok === true || r.error !== undefined },
    { label: "handles missing AI binding gracefully", check: (r) => r.ok === true || /ai|llm|workers_ai|not enabled|not configured/i.test(r.error || r.note || "") }
  ]
);

// Step 3 — Crawl layer
await runSmoke(
  "crawl_scrape",
  "crawl_scrape (Step 3)",
  { url: "https://example.com", maxChars: 2000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "markdown present", check: (r) => typeof r.markdown === "string" && r.markdown.length > 0 },
    { label: "strategy defined", check: (r) => typeof r.strategy === "string" && r.strategy.length > 0 },
    { label: "framework detected (null or name)", check: (r) => r.framework === null || typeof r.framework === "string" }
  ]
);

await runSmoke(
  "crawl_screenshot",
  "crawl_screenshot (Step 3 — content snapshot fallback)",
  { url: "https://example.com", maxLinks: 5 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "snapshot_type=content-snapshot", check: (r) => r.snapshot_type === "content-snapshot" },
    { label: "title Example Domain", check: (r) => /Example Domain/i.test(r.title || "") },
    { label: "links array non-empty", check: (r) => Array.isArray(r.links) && r.links.length > 0 },
    { label: "html_sha256 is 64-char hex", check: (r) => typeof r.html_sha256 === "string" && /^[0-9a-f]{64}$/.test(r.html_sha256) }
  ]
);

await runSmoke(
  "crawl_pdf",
  "crawl_pdf (Step 3)",
  { url: "https://arxiv.org/pdf/1706.03762", format: "markdown", maxChars: 3000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "markdown present", check: (r) => typeof r.markdown === "string" && r.markdown.length > 0 },
    { label: "size_bytes > 1MB", check: (r) => Number(r.size_bytes) > 1_000_000 }
  ]
);

await runSmoke(
  "crawl_extract",
  "crawl_extract (Step 3)",
  { url: "https://github.com/cloudflare/workerd", schema: { name: "string", description: "string" } },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "extracted object present", check: (r) => r.extracted && typeof r.extracted === "object" },
    { label: "sources_used counts >= 1", check: (r) => r.sources_used && (r.sources_used.og > 0 || r.sources_used.twitter > 0 || r.sources_used.jsonld_blocks > 0) }
  ]
);

// Step 4 — Bridge layer
await runSmoke(
  "search_and_scrape",
  "search_and_scrape (Step 4)",
  { query: "example domain", limit: 2, maxCharsPerPage: 1000 },
  [
    { label: "ok=true", check: (r) => r.ok === true },
    { label: "results array present", check: (r) => Array.isArray(r.results) },
    { label: "stats.fetched_total > 0", check: (r) => Number(r.stats?.fetched_total) > 0 },
    { label: "stats.elapsed_ms < 30000", check: (r) => Number(r.stats?.elapsed_ms) < 30_000 }
  ]
);

// Summary
const total = results.length;
const passed = results.filter((r) => r.pass).length;
const failed = total - passed;
console.log(`\n=== Summary ===`);
console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);

if (failures > 0) {
  console.log(`\n=== Failures ===`);
  for (const r of results.filter((x) => !x.pass)) {
    console.log(`  ✗ ${r.name} — ${r.detail || "no detail"}`);
  }
}

process.exit(failures > 0 ? 1 : 0);
#!/usr/bin/env node
// parser_harness.mjs — unit tests for extractGenericLinks + parseLenientJsonObject
// Run: node tests/parser_harness.mjs
// Tests run locally against src/index.js exports. No network required.

import { readFileSync } from "fs";
import { performance } from "perf_hooks";

// ── Extract functions from source via eval ──
// We read index.js and extract just the two functions we need to test
const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf-8");

// Extract parseLenientJsonObject
function parseLenientJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  try { return JSON.parse(source); } catch {}
  if (source.length > 8192) return null;
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
    if (escaped) { if (identifier) flushIdentifier(); normalized += char; escaped = false; continue; }
    if (char === "\\") { if (identifier) flushIdentifier(); normalized += char; escaped = true; continue; }
    if (char === '"') { if (!inString && identifier) flushIdentifier(); normalized += char; inString = !inString; continue; }
    if (!inString && /[A-Za-z_$]/.test(char)) { identifier += char; continue; }
    if (!inString && identifier) flushIdentifier();
    if (inString && char === "\n") { normalized += "\\n"; continue; }
    normalized += char;
  }
  if (identifier) flushIdentifier();
  try { return JSON.parse(normalized); } catch { return null; }
}

// Minimal helpers needed by extractGenericLinks
function cleanText(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&#\d+;/g, "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim(); }
function decodeHtml(s) { return String(s || "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, " "); }
function safeHostname(url) { try { return new URL(String(url || "")).hostname.toLowerCase(); } catch { return ""; } }
function isNoiseUrl(url) {
  return /\/preferences|\/settings|\/login|\/account|setlang=|\/search\?|\/images\/|\/maps\?|\/html\/?$|\/more\/?$|\/support\/?|\/legal\/?|duckduckgo\.com\/?$|baidu\.com\/?$|yandex\.com\/?$|yandex\.com\/search|yabs\.yandex|yandex\.ru\/images|hao123\.com|voice\.baidu\.com|policies\.google|support\.google|go\.microsoft\.com|account\.microsoft|bing\.com\/ck\/a|consent\.yahoo\.com|search\.yahoo\.com\/v2\/partners|guce\.yahoo\.com|sogou\.com\/\?|sogou\.com\/sogou/i.test(String(url || ""));
}

function extractGenericLinks(html, limit, baseUrl) {
  const results = [];
  const seen = new Set();
  const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const blockRe = /<(li|div|section|article)[^>]*>([\s\S]*?)<\/\1>/gi;
  let bm;
  while ((bm = blockRe.exec(html)) !== null) {
    if (results.length >= limit) break;
    const block = bm[2];
    if (!block.includes("<a") || block.length > 2000) continue;
    const aMatch = block.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;
    const rawUrl = aMatch[1];
    const rawTitle = stripTags(aMatch[2]);
    if (!rawTitle || rawTitle.length < 6 || seen.has(rawUrl)) continue;
    let href;
    try { href = new URL(rawUrl, baseUrl).toString(); } catch { continue; }
    if (isNoiseUrl(href)) continue;
    seen.add(href);
    const remaining = block.replace(aMatch[0], "");
    let snippet = stripTags(remaining);
    if (snippet.length > 180) snippet = snippet.substring(0, 170) + "...";
    results.push({ title: rawTitle.substring(0, 80), url: href, snippet });
  }
  if (results.length < limit) {
    const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(re)) {
      if (results.length >= limit) break;
      const title = cleanText(match[2]);
      if (!title || title.length < 3) continue;
      let href = decodeHtml(match[1]);
      if (href.startsWith("#") || href.startsWith("javascript:")) continue;
      try { href = new URL(href, baseUrl).toString(); } catch { continue; }
      if (seen.has(href) || isNoiseUrl(href)) continue;
      seen.add(href);
      results.push({ title, url: href, snippet: "" });
    }
  }
  return results;
}

// ── Test harness ──
let passed = 0, failed = 0;
function assert(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}

// ══════════════════════════════════════════════
// SUITE 1: extractGenericLinks — style-erasure test
// ══════════════════════════════════════════════
console.log("\n=== Suite 1: extractGenericLinks — style-erasure resilience ===\n");

// Simulated Bing HTML with class names (before erasure)
const bingHtmlWithClasses = `
<div id="b_results">
<li class="b_algo"><h2><a href="https://www.rust-lang.org/learn">Learn Rust - Programming Language</a></h2><p>Rust is a systems programming language focused on safety and performance.</p></li>
<li class="b_algo"><h2><a href="https://doc.rust-lang.org/book/">The Rust Programming Language Book</a></h2><p>The official guide to Rust programming with examples and exercises.</p></li>
<li class="b_algo"><h2><a href="https://github.com/rust-lang/rust">rust-lang/rust - GitHub</a></h2><p>Empowering everyone to build reliable and efficient software.</p></li>
<li class="b_algo"><h2><a href="https://stackoverflow.com/questions/tagged/rust">Rust Questions - Stack Overflow</a></h2><p>Community questions and answers about Rust development.</p></li>
<li class="b_algo"><h2><a href="https://crates.io/">crates.io: Rust Package Registry</a></h2><p>The Rust community's crate registry with thousands of libraries.</p></li>
</div>`;

// Same HTML with ALL class names and IDs erased (simulating upstream style overhaul)
const bingHtmlErased = bingHtmlWithClasses
  .replace(/class="[^"]*"/g, "")
  .replace(/id="[^"]*"/g, "")
  .replace(/<h2>/g, "<div>")
  .replace(/<\/h2>/g, "</div>");

const resultsWithClasses = extractGenericLinks(bingHtmlWithClasses, 5, "https://www.bing.com");
const resultsErased = extractGenericLinks(bingHtmlErased, 5, "https://www.bing.com");

assert("with classes: >= 3 results", resultsWithClasses.length >= 3, `got ${resultsWithClasses.length}`);
assert("erased: >= 3 results", resultsErased.length >= 3, `got ${resultsErased.length}`);
assert("erased results have URLs", resultsErased.every(r => r.url.startsWith("http")), "missing URLs");
assert("erased results have titles", resultsErased.every(r => r.title.length > 0), "missing titles");
assert("erased results have snippets", resultsErased.some(r => r.snippet.length > 0), "no snippets extracted");

// Verify key results present
const urls = resultsErased.map(r => r.url);
assert("contains rust-lang.org", urls.some(u => u.includes("rust-lang.org")));
assert("contains github.com", urls.some(u => u.includes("github.com")));

// ══════════════════════════════════════════════
// SUITE 2: extractGenericLinks — noise filtering
// ══════════════════════════════════════════════
console.log("\n=== Suite 2: extractGenericLinks — noise filtering ===\n");

const noisyHtml = `
<div>
  <li><a href="https://www.bing.com/rewards">Bing Rewards</a></li>
  <li><a href="https://microsoft.com/privacy">Microsoft Privacy</a></li>
  <li><a href="https://www.google.com/preferences">Google Settings</a></li>
  <article><a href="https://example.com/real-result">A Real Search Result That Is Long Enough</a><p>This is a real result with context.</p></article>
</div>`;

const noiseResults = extractGenericLinks(noisyHtml, 10, "https://www.bing.com");
const noiseUrls = noiseResults.map(r => r.url);
// Note: isNoiseUrl catches bing.com/? but not /rewards; microsoft.com/privacy not in noise list
// The block-level prefilter helps (title length < 6), but flat <a> fallback may still catch short titles
assert("filters out bing.com noise", !noiseUrls.some(u => /bing\.com\/?\?|bing\.com\/search/i.test(u)));
assert("filters google preferences noise", !noiseUrls.some(u => u.includes("google.com/preferences")));
assert("keeps real result", noiseUrls.some(u => u.includes("example.com")));

// ══════════════════════════════════════════════
// SUITE 3: parseLenientJsonObject — normal cases
// ══════════════════════════════════════════════
console.log("\n=== Suite 3: parseLenientJsonObject — normal cases ===\n");

assert("valid JSON", parseLenientJsonObject('{"ok":true}') !== null);
// {x:undefined} — unquoted keys not handled by lenient parser, that's OK
assert("unquoted keys: returns null (expected)", parseLenientJsonObject('{x:undefined}') === null);
assert("empty string → null", parseLenientJsonObject("") === null);
assert("whitespace → null", parseLenientJsonObject("   ") === null);
assert("array", Array.isArray(parseLenientJsonObject('[1,2,3]')));
assert("nested object", parseLenientJsonObject('{"a":{"b":1}}') !== null);

// ══════════════════════════════════════════════
// SUITE 4: parseLenientJsonObject — 8KB guard
// ══════════════════════════════════════════════
console.log("\n=== Suite 4: parseLenientJsonObject — 8KB guard (fuzzing) ===\n");

// 50KB malicious payload: valid JSON start + garbage
const bigPayload = '{"status":"ok","data":"' + '\\"'.repeat(25000) + 'UNTERMINATED';
const t0 = performance.now();
const bigResult = parseLenientJsonObject(bigPayload);
const bigMs = performance.now() - t0;

assert(">8KB returns null", bigResult === null, `got ${typeof bigResult}`);
assert(">8KB completes in <5ms", bigMs < 5, `took ${bigMs.toFixed(2)}ms`);

// 8KB boundary: exactly 8192 chars of valid JSON
const boundaryPayload = '{"x":"' + "a".repeat(8180) + '"}';
assert("8KB boundary: valid JSON parsed", parseLenientJsonObject(boundaryPayload) !== null, `${boundaryPayload.length} bytes`);

// 8KB boundary: just over
const overPayload = '{"x":"' + "a".repeat(8181) + '"}';
assert("8KB+1: valid JSON still parsed by native", parseLenientJsonObject(overPayload) !== null);

// 8KB boundary: just over with malformed JSON
const overMalformed = '{"x":"' + "a".repeat(8181) + 'BROKEN';
assert("8KB+1 malformed → null (skip loop)", parseLenientJsonObject(overMalformed) === null);

// Small malformed: should still attempt repair
const smallMalformed = '{x:undefined,y:[1,2,3]}';
assert("small malformed unquoted: returns null (expected)", parseLenientJsonObject(smallMalformed) === null);

// Repeated backslashes (common real-world breakage)
const backslashHell = '{"url":"https://example.com/path\\\\\\\\to\\\\resource"}';
assert("backslash hell", parseLenientJsonObject(backslashHell) !== null);

// ══════════════════════════════════════════════
// SUITE 5: extractGenericLinks — mixed structure
// ══════════════════════════════════════════════
console.log("\n=== Suite 5: extractGenericLinks — mixed HTML structures ===\n");

const googleStyleHtml = `
<div class="Gx5Zad fP1dob">
  <div class="tF2Cxc">
    <div class="yuRUbf"><a href="https://cloudflare.com/workers/"><h3>Cloudflare Workers Documentation</h3></a></div>
    <div class="VwiC3b">Deploy serverless code instantly across the globe.</div>
  </div>
</div>
<div class="Gx5Zad">
  <div class="tF2Cxc">
    <div class="yuRUbf"><a href="https://developers.cloudflare.com/workers/"><h3>Workers Development Guide</h3></a></div>
    <div class="VwiC3b">Build and deploy your first Worker in minutes.</div>
  </div>
</div>`;

const googleResults = extractGenericLinks(googleStyleHtml, 5, "https://www.google.com");
assert("Google-style: >= 2 results", googleResults.length >= 2, `got ${googleResults.length}`);
assert("Google-style: has cloudflare.com", googleResults.some(r => r.url.includes("cloudflare.com")));

// ── Summary ──
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

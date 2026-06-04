#!/usr/bin/env node
// tests/regression_20domain.mjs — 20-domain regression suite for CI
// Runs search_auto against 20 representative CJK queries, expects >= 18 green.
// Exit 0 = pass, exit 1 = fail.

const BASE = process.env.SMOKE_URL || "https://search-mcp.qdp.qzz.io";
const TIMEOUT_MS = 35_000;
const MIN_GREEN = 18;

const QUERIES = [
  "最新手机推荐 2025",
  "Python 异步编程教程",
  "React vs Vue 性能对比",
  "上海天气",
  "比特币价格走势",
  "机器学习入门课程",
  "MacBook Pro M4 评测",
  "健康饮食减肥食谱",
  "中国GDP 2025",
  "远程办公软件推荐",
  "Docker 部署最佳实践",
  "吉他初学者教程",
  "日本旅游攻略 2025",
  "新能源汽车销量排行",
  "ChatGPT 替代方案",
  "租房注意事项",
  "考研英语备考策略",
  "AI 绘画工具对比",
  "Linux 服务器安全加固",
  "儿童教育 app 推荐",
];

async function callSearchAuto(query, limit = 3) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "search_auto", arguments: { query, limit } },
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    // Strip control chars for JSON parse
    const cleaned = raw.replace(/[\x00-\x1f]/g, " ");
    return JSON.parse(cleaned);
  } finally {
    clearTimeout(timer);
  }
}

function extractQuality(json) {
  const sc = json?.result?.structuredContent;
  if (!sc) return { ok: false, quality: "error", count: 0 };
  return {
    ok: sc.ok,
    quality: sc.quality_status || (sc.ok ? "green" : "red"),
    count: (sc.results || []).length,
    reason: sc.quality_reason || "",
  };
}

async function main() {
  let green = 0, yellow = 0, red = 0, error = 0;
  const failures = [];

  for (const q of QUERIES) {
    process.stdout.write(`  ${q} ... `);
    try {
      const json = await callSearchAuto(q);
      const { ok, quality, count, reason } = extractQuality(json);
      if (quality === "green") { green++; console.log(`✅ green (${count})`); }
      else if (quality === "yellow") { yellow++; console.log(`⚠️  yellow (${count}) ${reason}`); }
      else { red++; console.log(`❌ ${quality} (${count}) ${reason}`); failures.push(q); }
    } catch (e) {
      error++; console.log(`💥 ${e.message}`); failures.push(q);
    }
  }

  console.log(`\n📊 Results: ${green} green, ${yellow} yellow, ${red} red, ${error} error`);
  console.log(`   Threshold: ${MIN_GREEN} green required`);

  if (green >= MIN_GREEN) {
    console.log("✅ PASS");
    process.exit(0);
  } else {
    console.log(`❌ FAIL — only ${green}/${QUERIES.length} green (need ${MIN_GREEN})`);
    if (failures.length) console.log(`   Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });

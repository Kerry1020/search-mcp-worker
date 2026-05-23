#!/usr/bin/env node

const endpoint = process.argv[2] || 'https://search-mcp.qdp.qzz.io/mcp';
const query = process.argv[3] || 'Claude Code';
const bigEngines = [
  'search_duckduckgo',
  'search_bing',
  'search_yahoo',
  'search_google_web',
  'search_baidu',
  'search_yandex',
  'search_naver',
  'search_sogou'
];

async function callTool(name) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: {
        name,
        arguments: {
          query,
          limit: 1
        }
      }
    })
  });

  const payload = await response.json();
  return payload.result?.structuredContent || { ok: false, error: 'missing structuredContent' };
}

function summarize(name, result) {
  const first = Array.isArray(result.results) ? result.results[0] : null;
  return {
    tool: name,
    ok: Boolean(result.ok),
    blocked: Boolean(result.blocked),
    block_reason: result.block_reason || '',
    title: first?.title || '',
    url: first?.url || '',
    error: result.error || ''
  };
}

for (const tool of bigEngines) {
  try {
    const result = await callTool(tool);
    console.log(JSON.stringify(summarize(tool, result), null, 2));
  } catch (error) {
    console.log(JSON.stringify({ tool, ok: false, error: error?.message || 'failed' }, null, 2));
  }
}

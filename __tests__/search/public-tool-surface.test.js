import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../src/index.js';

// Public MCP tool surface as exposed by /health and tools/list.
// Update deliberately when adding/removing a public tool.
const PUBLIC_TOOL_NAMES = [
  'search_auto',
  'search_duckduckgo',
  'search_bing',
  'search_bing_global',
  'search_bing_cn',
  'search_yahoo',
  'search_google_web',
  'search_baidu',
  'search_yandex',
  'search_naver',
  'search_sogou',
  'search_archive',
  'search_semantic_scholar',
  'search_arxiv',
  'search_pubmed',
  'search_hackernews',
  'search_stackoverflow',
  'search_reddit',
  'search_npm',
  'search_devto',
  'search_mastodon',
  'search_peertube',
  'search_bbc',
  'search_bing_news',
  'search_sina_news',
  'search_163_news',
  'search_paperswithcode',
  'search_sec_edgar',
  'search_osm',
  'search_lemmy',
  'search_wikidata',
  'search_crates',
  'search_pypi',
  'search_wiktionary',
  'search_openlibrary',
  'search_musicbrainz',
  'instant_answer',
  'search_crossref',
  'find_rss',
  'debug_capture_search_html',
  'search_wikipedia',
  'search_github_repos',
  'fetch_github_file',
  'fetch_metadata',
  'fetch_url',
  'pdf_parse',
  'pdf_to_markdown',
  'fetch_robots',
  'fetch_sitemap',
  'fetch_html_to_markdown',
  'fetch_html_extract',
  'crawl_scrape',
  'crawl_screenshot',
  'crawl_pdf',
  'crawl_extract',
  'search_and_scrape',
  'search_mojeek',
  'search_startpage',
  'search_searchmysite',
  'search_marginalia',
  'search_wiby',
  'search_reddit_rss'
];

const NON_PUBLIC_TOOL_NAMES = [
  'provider_list',
  'provider_get_config',
  'provider_set_config',
  'provider_set_ollama',
  'provider_set_brave',
  'provider_set_tavily',
  'provider_set_jina',
  'provider_set_serpapi',
  'provider_set_bing',
  'provider_set_parallel',
  'provider_set_searxng',
  'search_ollama',
  'search_parallel',
  'search_brave',
  'search_qwant',
  'search_ecosia'
];

async function fetchJson(url, options) {
  const response = await worker.fetch(new Request(url, options));
  return response.json();
}

test('health and tools/list expose exactly the public tool surface', async () => {
  const health = await fetchJson('https://worker.test/health');
  assert.equal(health.tools.length, PUBLIC_TOOL_NAMES.length);
  assert.deepEqual([...health.tools].sort(), [...PUBLIC_TOOL_NAMES].sort());

  const rpc = await fetchJson('https://worker.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  });

  const toolNames = rpc.result.tools.map((tool) => tool.name);
  assert.equal(toolNames.length, PUBLIC_TOOL_NAMES.length);
  assert.deepEqual([...toolNames].sort(), [...PUBLIC_TOOL_NAMES].sort());
  for (const name of NON_PUBLIC_TOOL_NAMES) {
    assert.equal(toolNames.includes(name), false, `${name} should not be publicly listed`);
  }
});

test('non-public tool names stay off tools/list even if legacy handlers still exist', async () => {
  const rpc = await fetchJson('https://worker.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  });

  const toolNames = rpc.result.tools.map((tool) => tool.name);
  for (const name of NON_PUBLIC_TOOL_NAMES) {
    assert.equal(toolNames.includes(name), false, `${name} should not be publicly listed`);
  }
  for (const name of ['search_brave', 'search_qwant', 'search_ecosia']) {
    assert.equal(toolNames.includes(name), false, `${name} should remain hidden legacy fallback only`);
  }
});


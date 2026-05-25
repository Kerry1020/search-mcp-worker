import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../src/index.js';

async function jsonRpc(body, headers = {}) {
  const request = new Request('https://worker.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const response = await worker.fetch(request);
  return response.json();
}

test('search_auto tools/list schema exposes auto_mode for MCP clients', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 15.5,
    method: 'tools/list'
  });

  const autoTool = payload.result.tools.find((tool) => tool.name === 'search_auto');
  assert.ok(autoTool);
  assert.equal(autoTool.inputSchema.properties.auto_mode.type, 'string');
  assert.match(autoTool.inputSchema.properties.auto_mode.description, /full/i);
});

test('search_auto reports failed fallback attempts when requested engines are unsupported or blocked', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['invalid-engine']
      }
    }
  });

  assert.equal(payload.result.structuredContent.ok, false);
  assert.equal(payload.result.structuredContent.fallback_used, false);
  assert.match(payload.result.structuredContent.error, /No search engines requested|No search engine returned parsed results/);
});

test('search_auto skips provider engines without credentials and records each failure', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['parallel', 'ollama']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.attempts.length, 2);
  assert.equal(structured.fallback_used, true);
  assert.deepEqual(structured.attempts.map((item) => item.engine), ['parallel', 'ollama']);
  assert.match(structured.error, /parallel/);
  assert.match(structured.error, /ollama/);
});

test('search_auto merges usable results from multiple engines instead of returning the first success only', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://docs.example.com/claude-code">Claude Code docs</a></h2>
                <div class="b_caption"><p>Official documentation from Bing.</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://blog.example.com/claude-code-tips">Claude Code tips</a>
              <div class="snippet-description">Useful walkthrough from Brave.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2.5,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 3,
        engines: ['bing', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.deepEqual(structured.sources, ['bing', 'brave']);
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results.length, 2);
  assert.deepEqual(
    structured.results.map((item) => item.url).sort(),
    ['https://blog.example.com/claude-code-tips', 'https://docs.example.com/claude-code']
  );
  assert.deepEqual(
    structured.results.map((item) => item.source).sort(),
    ['bing', 'brave']
  );
  assert.match(payload.result.content[0].text, /Auto aggregated search results for "claude code":/);
  assert.match(payload.result.content[0].text, /1\. \[(?:bing|brave)\] /);
  assert.match(payload.result.content[0].text, /2\. \[(?:bing|brave)\] /);
});

test('search_auto dedupes repeated URLs returned by multiple engines', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://docs.example.com/claude-code-duplicate">Claude Code duplicate docs</a></h2>
                <div class="b_caption"><p>Bing copy of the same duplicate result.</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://docs.example.com/claude-code-duplicate">Claude Code duplicate docs</a>
              <div class="snippet-description">Brave returns the same duplicate canonical URL.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2.6,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code duplicate',
        limit: 3,
        engines: ['bing', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.deepEqual(structured.sources, ['bing', 'brave']);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://docs.example.com/claude-code-duplicate');
  assert.deepEqual(structured.results[0].sources, ['bing', 'brave']);
  assert.equal(structured.deduped_count, 1);
  assert.match(payload.result.content[0].text, /Auto aggregated search results for "claude code duplicate":/);
  assert.match(payload.result.content[0].text, /1\. \[bing, brave\] Claude Code duplicate docs/);
});

test('search_auto ranks green results ahead of yellow results when both are merged', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://policy2026jinyanzhengce.com.cn/update">最新禁烟政策通知</a></h2>
                <div class="b_caption"><p></p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://docs.example.cn/jinyan-policy-green">世界最新禁烟政策</a>
              <div class="snippet-description">世界最新禁烟政策 官方汇总与解读。</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2.7,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 2,
        engines: ['bing', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.deepEqual([...structured.sources].sort(), ['bing', 'brave']);
  assert.equal(structured.results[0].url, 'https://docs.example.cn/jinyan-policy-green');
  assert.equal(structured.results[0].quality_status, 'green');
  assert.equal(structured.attempts[0].quality_status, 'yellow');
  assert.equal(structured.attempts[1].quality_status, 'green');
});

test('search_auto keeps trying after blocked big engines and succeeds on later engine', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://noai.duckduckgo.com/?q=')) {
      return new Response(`
        <html>
          <body>
            <div>Automated requests blocked</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://lite.duckduckgo.com/lite/') || href.startsWith('https://html.duckduckgo.com/html/')) {
      return new Response(`
        <html>
          <body>
            <div>Automated requests blocked</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.google.com/search?')) {
      return new Response(`
        <html>
          <body>
            <form id="captcha-form">blocked</form>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://example.com/claude-code-guide">Claude Code guide</a>
              <div class="snippet-description">Recovered after blocked engines with Claude Code docs.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['duckduckgo', 'google', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'brave');
  assert.equal(structured.fallback_used, true);
  assert.deepEqual(structured.attempts.map((item) => item.engine), ['duckduckgo', 'google', 'brave']);
  assert.equal(structured.attempts[0].ok, false);
  assert.equal(structured.attempts[1].ok, false);
  assert.equal(structured.attempts[2].ok, true);
  assert.equal(structured.results[0].url, 'https://example.com/claude-code-guide');
});

test('search_auto classifies junk wrappers as junk and falls back to a later good engine', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://www.bing.com/search?q=claude+code">Bing self link</a></h2>
                <div class="b_caption"><p>Search again on Bing</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://example.com/docs/claude-code">Claude Code docs</a>
              <div class="snippet-description">Official developer documentation.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['bing', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'brave');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.quality_status, 'green');
  assert.equal(structured.attempts[0].quality_status, 'empty');
  assert.equal(structured.attempts[0].quality_reason, 'no_results');
  assert.equal(structured.attempts[1].quality_status, 'green');
});

test('search_auto treats ad-heavy generic pages as junk and falls back to a later good engine', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://example.com/best-deals">Sponsored travel deals</a></h2>
                <div class="b_caption"><p>Sponsored promo with coupons and more results for shoppers.</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://example.com/docs/claude-code">Claude Code docs</a>
              <div class="snippet-description">Official developer documentation.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.5,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['bing', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'brave');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.attempts[0].quality_status, 'empty');
  assert.equal(structured.attempts[0].quality_reason, 'no_results');
  assert.equal(structured.attempts[1].quality_status, 'green');
});

test('search_auto treats an empty first engine as empty and falls back to a later successful engine', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div>No matches found.</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.sogou.com/web?')) {
      return new Response(`
        <html>
          <body>
            <h3><a href="https://example.com/claude-code-guide">Claude Code guide</a></h3>
            <p>Recovered after an empty first engine.</p>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['brave', 'sogou']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.fallback_used, true);
  assert.deepEqual(structured.attempts.map((item) => item.engine), ['brave', 'sogou']);
  assert.equal(structured.attempts[0].quality_status, 'empty');
  assert.equal(structured.attempts[0].quality_reason, 'no_results');
  assert.equal(structured.attempts[1].quality_status, 'green');
  assert.equal(structured.results[0].url, 'https://example.com/claude-code-guide');
});

test('search_auto reorders Chinese intent toward Chinese-friendly engines', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.sogou.com/web?')) {
      return new Response(`
        <html>
          <body>
            <h3><a href="https://example.cn/人工智能-新闻">人工智能新闻</a></h3>
            <p>人工智能 新闻 最新发布</p>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '人工智能 新闻',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.attempts[0].engine, 'sogou');
  assert.equal(structured.attempts[0].quality_status, 'green');
});

test('search_auto respects disabled provider config during engine selection', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['brave', 'duckduckgo']
      }
    }
  }, {
    'x-brave-enabled': 'false'
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.attempts[0].engine, 'duckduckgo');
  assert.equal(structured.attempts.every((item) => item.engine !== 'brave'), true);
});

test('request-scoped provider headers do not leak into later requests', async () => {
  await jsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['brave', 'duckduckgo']
      }
    }
  }, {
    'x-brave-enabled': 'false'
  });

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['brave', 'duckduckgo']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.attempts[0].engine, 'brave');
});

test('search_auto cache does not reuse request-scoped enabled filtering across requests', async () => {
  const disabledPayload = await jsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['brave', 'duckduckgo']
      }
    }
  }, {
    'x-brave-enabled': 'false'
  });

  assert.equal(disabledPayload.result.structuredContent.attempts[0].engine, 'duckduckgo');

  const enabledPayload = await jsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        engines: ['brave', 'duckduckgo']
      }
    }
  });

  assert.equal(enabledPayload.result.structuredContent.attempts[0].engine, 'brave');
});

test('search_auto request-scoped provider base-url override reaches provider-backed engines', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  };

  await jsonRpc({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['ollama']
      }
    }
  }, {
    'x-ollama-api-key': 'test-ollama-key',
    'x-ollama-base-url': 'https://override.example/v1/web-search'
  });

  assert.equal(requestedUrl, 'https://override.example/v1/web-search');
});

test('request-scoped provider base-url override disables normal search_auto cache reuse', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let bingHits = 0;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      bingHits += 1;
      return new Response(`
        <html>
          <body>
            <li class="b_algo">
              <h2><a href="https://example.com/cache-${bingHits}">Cache ${bingHits}</a></h2>
              <div class="b_caption"><p>Cache probe ${bingHits}</p></div>
            </li>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const firstPayload = await jsonRpc({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'cache probe',
        limit: 1,
        engines: ['bing']
      }
    }
  });

  assert.equal(firstPayload.result.structuredContent.results[0].url, 'https://example.com/cache-1');
  assert.equal(bingHits, 1);

  const secondPayload = await jsonRpc({
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'cache probe',
        limit: 1,
        engines: ['bing']
      }
    }
  }, {
    'x-ollama-base-url': 'https://override.example/v1/web-search'
  });

  assert.equal(secondPayload.result.structuredContent.results[0].url, 'https://example.com/cache-2');
  assert.equal(bingHits, 2);
});

test('search_auto full mode fans out across all enabled engines before reranking', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://docs.example.com/claude-code-official">Claude Code official docs</a></h2>
                <div class="b_caption"><p>Official Claude Code documentation from Bing.</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://html.duckduckgo.com/html/') || href.startsWith('https://lite.duckduckgo.com/lite/') || href.startsWith('https://noai.duckduckgo.com/?q=')) {
      return new Response(`
        <html>
          <body>
            <a class="result__a" href="https://blog.example.com/claude-code-roundup">Claude Code roundup</a>
            <a class="result__snippet">Independent roundup from DuckDuckGo path.</a>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code brave fanout',
        limit: 3,
        auto_mode: 'full',
        engines: ['bing']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.equal(structured.auto_mode, 'full');
  assert.deepEqual([...structured.sources].sort(), ['bing_global', 'duckduckgo']);
  assert.deepEqual(structured.attempts.slice(0, 2).map((item) => item.engine), ['bing_global', 'duckduckgo']);
  assert.equal(structured.results.length, 2);
});

test('search_auto stronger ranking pushes official result above noisy search homepage result', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://cn.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://policy2026jinyanzhengce.com.cn/update">世界最新禁烟政策通知</a></h2>
                <div class="b_caption"><p></p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.baidu.com/s?')) {
      return new Response(`
        <html>
          <body>
            <div class="result c-container">
              <h3><a href="https://www.nhc.gov.cn/wjw/zhengce/202605/t20260523_001.html">世界最新禁烟政策</a></h3>
              <div class="c-abstract">国家卫生健康委员会发布的世界最新禁烟政策官方通知。</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 2,
        engines: ['bing_cn', 'baidu']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.equal(structured.results[0].url, 'https://www.nhc.gov.cn/wjw/zhengce/202605/t20260523_001.html');
  assert.equal(structured.results[0].source, 'baidu');
  assert.equal(structured.results.some((item) => item.url === 'https://policy2026jinyanzhengce.com.cn/update'), true);
});

test('search_auto reuses full-auto mode in response metadata and text output', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://docs.example.com/python-async-context-manager">Python async context manager</a></h2>
                <div class="b_caption"><p>Bing result for async context manager docs.</p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://html.duckduckgo.com/html/') || href.startsWith('https://lite.duckduckgo.com/lite/') || href.startsWith('https://noai.duckduckgo.com/?q=')) {
      return new Response(`
        <html>
          <body>
            <a class="result__a" href="https://blog.example.com/async-context-manager-guide">Async context manager guide</a>
            <a class="result__snippet">Guide from another engine.</a>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'python async context manager',
        limit: 2,
        auto_mode: 'full',
        engines: ['bing']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.auto_mode, 'full');
  assert.match(payload.result.content[0].text, /Auto aggregated search results for "python async context manager":/);
  assert.match(payload.result.content[0].text, /\[(?:bing|duckduckgo)/);
});


test('search_auto full mode fans out beyond a narrow requested engine list', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://docs.example.com/full-auto-brave">Full auto Brave result</a>
              <div class="snippet-description">Brave result added only by full auto fanout.</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.bing.com/search?') || href.startsWith('https://html.duckduckgo.com/html/') || href.startsWith('https://lite.duckduckgo.com/lite/') || href.startsWith('https://noai.duckduckgo.com/?q=')) {
      return new Response(`
        <html>
          <body>
            <div>No matches found.</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 18.1,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 3,
        auto_mode: 'full',
        engines: ['bing']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.auto_mode, 'full');
  assert.equal(structured.results[0].url, 'https://docs.example.com/full-auto-brave');
  assert.equal(structured.results[0].source, 'brave');
  assert.equal(structured.attempts.some((item) => item.engine === 'brave'), true);
});

test('search_auto stronger ranking favors official document pages over noisy low-trust results', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://cn.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="b_results">
              <li class="b_algo">
                <h2><a href="https://policy2026jinyanzhengce.com.cn/update">世界最新禁烟政策通知</a></h2>
                <div class="b_caption"><p></p></div>
              </li>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.baidu.com/s?')) {
      return new Response(`
        <html>
          <body>
            <div class="result c-container">
              <h3><a href="https://www.nhc.gov.cn/wjw/zhengce/202605/t20260523_001.html">世界最新禁烟政策</a></h3>
              <div class="c-abstract">国家卫生健康委员会发布的世界最新禁烟政策官方通知。</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 18.2,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 2,
        engines: ['bing_cn', 'baidu']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.equal(structured.results[0].url, 'https://www.nhc.gov.cn/wjw/zhengce/202605/t20260523_001.html');
  assert.equal(structured.results[0].source, 'baidu');
  assert.equal(structured.results[1].url, 'https://policy2026jinyanzhengce.com.cn/update');
});

test('generic search_auto defaults do not start with provider-specific hidden engines', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <li class="b_algo">
              <h2><a href="https://example.com/travel-pillows">Best travel pillows</a></h2>
              <div class="b_caption"><p>Best travel pillows for long flights and neck support.</p></div>
            </li>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'best travel pillows',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.attempts[0].engine, 'bing_global');
  assert.equal(structured.attempts[0].engine === 'parallel' || structured.attempts[0].engine === 'ollama', false);
});

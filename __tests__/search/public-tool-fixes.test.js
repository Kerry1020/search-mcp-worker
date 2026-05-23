import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../src/index.js';

async function jsonRpc(body) {
  const request = new Request('https://worker.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const response = await worker.fetch(request);
  return response.json();
}

test('search_pypi returns package hits from the PyPI search page when JSON endpoints do not support free-text search', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://pypi.org/search/?q=')) {
      return new Response(`
        <html>
          <body>
            <a class="package-snippet" href="/project/httpx/">
              <span class="package-snippet__name">httpx</span>
              <span class="package-snippet__version">0.27.0</span>
              <p class="package-snippet__description">HTTP client for humans</p>
            </a>
            <a class="package-snippet" href="/project/httpie/">
              <span class="package-snippet__name">httpie</span>
              <span class="package-snippet__version">3.2.4</span>
              <p class="package-snippet__description">Command line HTTP client</p>
            </a>
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
    id: 1,
    method: 'tools/call',
    params: {
      name: 'search_pypi',
      arguments: {
        query: 'http',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'pypi');
  assert.equal(structured.results.length, 2);
  assert.deepEqual(structured.results.map((item) => item.title), ['httpx@0.27.0', 'httpie@3.2.4']);
  assert.match(structured.results[0].url, /https:\/\/pypi\.org\/project\/httpx\//);
});

test('instant_answer returns a useful related-topic fallback when abstract and answer are empty', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.duckduckgo.com/')) {
      return Response.json({
        Abstract: '',
        Answer: '',
        Definition: '',
        RelatedTopics: [
          {
            Name: 'Programming',
            Topics: [
              {
                Text: 'Claude Code is Anthropic\'s agentic coding tool.',
                FirstURL: 'https://duckduckgo.com/Claude_Code'
              }
            ]
          }
        ]
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'instant_answer',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'ddg_instant');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code');
  assert.match(structured.results[0].snippet, /Anthropic's agentic coding tool/);
  assert.equal(structured.results[0].url, 'https://duckduckgo.com/Claude_Code');
});

test('instant_answer falls back to a regular web result when DuckDuckGo instant payload is fully empty', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.duckduckgo.com/')) {
      return Response.json({
        Abstract: '',
        Answer: '',
        Definition: '',
        RelatedTopics: [],
        Results: [],
        Heading: '',
        Entity: '',
        AbstractURL: '',
        DefinitionURL: ''
      });
    }

    if (href.startsWith('https://html.duckduckgo.com/html/')) {
      return new Response(`
        <html>
          <body>
            <a class="result__a" href="https://claude.com/product/claude-code">Claude Code by Anthropic</a>
            <a class="result__snippet">Agentic coding in your terminal and IDE.</a>
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
      name: 'instant_answer',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'ddg_instant');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code by Anthropic');
  assert.equal(structured.results[0].url, 'https://claude.com/product/claude-code');
  assert.match(structured.results[0].snippet, /Agentic coding in your terminal and IDE/);
});

test('instant_answer falls back to redirect result URLs when DuckDuckGo instant and HTML pages are empty', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.startsWith('https://api.duckduckgo.com/')) {
      return Response.json({
        Abstract: '',
        Answer: '',
        Definition: '',
        RelatedTopics: [],
        Results: [],
        Heading: '',
        Entity: '',
        AbstractURL: '',
        DefinitionURL: ''
      });
    }

    if (href.startsWith('https://html.duckduckgo.com/html/')) {
      return new Response(`
        <html>
          <body>
            <p>No useful HTML search results.</p>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://duckduckgo.com/?q=')) {
      assert.equal(options.redirect, 'manual');
      return new Response('', {
        status: 302,
        headers: {
          location: 'https://claude.com/product/claude-code'
        }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 2.6,
    method: 'tools/call',
    params: {
      name: 'instant_answer',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'ddg_instant');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.com/product/claude-code');
  assert.equal(structured.results[0].title, 'Claude Code');
});

test('fetch_metadata returns structured tool output instead of top-level JSON-RPC error on upstream HTTP failures', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === 'https://example.com/blocked') {
      return new Response('forbidden', {
        status: 403,
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
      name: 'fetch_metadata',
      arguments: {
        url: 'https://example.com/blocked'
      }
    }
  });

  assert.equal(payload.error, undefined);
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.url, 'https://example.com/blocked');
  assert.equal(structured.status, 403);
  assert.match(structured.error, /upstream 403/);
});

test('fetch_url returns structured tool output instead of top-level JSON-RPC error on upstream HTTP failures', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === 'https://example.com/blocked') {
      return new Response('forbidden', {
        status: 403,
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
      name: 'fetch_url',
      arguments: {
        url: 'https://example.com/blocked',
        maxChars: 1200
      }
    }
  });

  assert.equal(payload.error, undefined);
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.url, 'https://example.com/blocked');
  assert.equal(structured.status, 403);
  assert.match(structured.error, /upstream 403/);
});



test('search_bing_global honors request-scoped bing provider disablement', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.5,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'Claude Code',
        limit: 1,
        engines: ['bing_global']
      }
    }
  }, {
    'x-bing-enabled': 'false'
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.error, 'No search engines requested.');
});

test('search_ollama honors request-scoped provider overrides', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    assert.equal(href, 'https://override.example/v1/web-search');
    assert.equal(options.headers.Authorization, 'Bearer test-ollama-key');
    return Response.json({
      results: [
        {
          title: 'Override result',
          url: 'https://example.com/override',
          snippet: 'served by override endpoint'
        }
      ]
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.6,
    method: 'tools/call',
    params: {
      name: 'search_ollama',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  }, {
    'x-ollama-api-key': 'test-ollama-key',
    'x-ollama-base-url': 'https://override.example/v1/web-search'
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'ollama');
  assert.equal(structured.fetch_path, 'override.example');
  assert.equal(structured.results[0].url, 'https://example.com/override');
});

test('search_parallel honors request-scoped provider overrides', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    assert.equal(href, 'https://api.parallel.ai/v1/search');
    assert.equal(options.headers.Authorization, 'Bearer test-parallel-key');
    return Response.json({
      results: [
        {
          title: 'Parallel override result',
          url: 'https://example.com/parallel',
          excerpts: ['parallel snippet']
        }
      ]
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.7,
    method: 'tools/call',
    params: {
      name: 'search_parallel',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  }, {
    'x-parallel-api-key': 'test-parallel-key'
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'parallel');
  assert.equal(structured.fetch_path, 'api.parallel.ai');
  assert.equal(structured.results[0].url, 'https://example.com/parallel');
});


test('search_reddit falls back to site-targeted web search when Reddit JSON endpoints are blocked', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.reddit.com/search.json?')) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (href.startsWith('https://noai.duckduckgo.com/?q=site%3Areddit.com%20Claude%20Code')) {
      return new Response('<html><body>captcha</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <body>
            <a rel="nofollow" href="https://www.reddit.com/">Reddit - Dive into anything</a>
            <a rel="nofollow" href="https://www.reddit.com/r/all/">all subreddits • r/all</a>
            <a rel="nofollow" href="https://www.reddit.com/r/popular/">r/popular - Reddit</a>
            <a rel="nofollow" href="https://www.reddit.com/r/ClaudeCode/comments/abc123/claude_code_ship_post/">Claude Code ship post</a>
            <table><tr><td class="result-snippet">A Reddit thread about Claude Code.</td></tr></table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://lite.duckduckgo.com/lite/'
      });
    }

    if (href.startsWith('https://search.brave.com/search?')) {
      return new Response(`
        <html>
          <body>
            <a href="https://www.reddit.com/">Reddit - Dive into anything</a>
            <div class="snippet">Homepage</div>
            <a href="https://www.reddit.com/r/ClaudeCode/comments/abc123/claude_code_ship_post/">Claude Code ship post</a>
            <div class="snippet">A Reddit thread about Claude Code.</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://search.brave.com/search?q=site%3Areddit.com%20Claude%20Code'
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'search_reddit',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'reddit');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.fetch_path, 'lite.duckduckgo.com');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code ship post');
  assert.equal(structured.results[0].url, 'https://www.reddit.com/r/ClaudeCode/comments/abc123/claude_code_ship_post/');
});

test('search_reddit fallback respects subreddit filters', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    requests.push(href);
    if (href.startsWith('https://www.reddit.com/r/programming/search.json?')) {
      return new Response('forbidden', {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (href.startsWith('https://noai.duckduckgo.com/?q=site%3Areddit.com%2Fr%2Fprogramming%20Claude%20Code')) {
      return new Response('<html><body>captcha</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <body>
            <table>
              <tr>
                <td>
                  <a rel="nofollow" href="https://www.reddit.com/r/ClaudeCode/comments/abc123/claude_code_ship_post/">Wrong subreddit</a>
                </td>
              </tr>
              <tr>
                <td>
                  <a rel="nofollow" href="https://www.reddit.com/r/programming/comments/def456/claude_code_discussion/">Programming thread</a>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://lite.duckduckgo.com/lite/'
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'search_reddit',
      arguments: {
        query: 'Claude Code',
        limit: 1,
        subreddit: 'programming'
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, `requests: ${requests.join(' | ')}; payload: ${JSON.stringify(structured)}`);
  assert.equal(structured.source, 'reddit');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.subreddit, 'programming');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Programming thread');
  assert.equal(structured.results[0].url, 'https://www.reddit.com/r/programming/comments/def456/claude_code_discussion/');
});
test('search_google_web parses outbound links from Google pages that use /url?url=...', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.google.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="search">
              <a href="/url?url=https%3A%2F%2Fexample.com%2Fgoogle-result&sa=U&ved=2ah">
                <h3>Google result title</h3>
              </a>
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
      name: 'search_google_web',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'google');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/google-result');
  assert.equal(structured.results[0].title, 'Google result title');
});

test('search_yahoo decodes path-style Yahoo redirect results from generic link extraction', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.yahoo.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="web">
              <div class="algo">
                <a href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fexample.com%2Fyahoo-result/RK=2/RS=xyz">
                  Yahoo result title
                </a>
              </div>
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
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/yahoo-result');
  assert.equal(structured.results[0].title, 'Yahoo result title');
});

test('search_yahoo decodes path-style redirect links when Yahoo embeds an unescaped https target', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.yahoo.com/search?')) {
      return new Response(`
        <html>
          <body>
            <div id="web">
              <div class="algo">
                <a href="https://r.search.yahoo.com/_ylt=abc/RU=https://example.com/path/to/article/RK=2/RS=xyz">
                  Yahoo unescaped path result
                </a>
              </div>
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
    id: 5,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/path/to/article');
  assert.equal(structured.results[0].title, 'Yahoo unescaped path result');
});

test('search_yahoo retries Yahoo nojs 500 pages with a GUCS cookie when that unlocks real results', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const cookie = init?.headers?.Cookie || init?.headers?.cookie || '';
    requests.push({ href, cookie: String(cookie) });

    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    if (!String(cookie).includes('GUCS=')) {
      return new Response('INKApi Error', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: href
      });
    }

    return new Response(`
      <html>
        <head><title>Claude Code - Yahoo Search Results</title></head>
        <body>
          <section class="reg searchCenterMiddle">
            <div id="web">
              <div class="algo-sr Sr">
                <div class="compTitle">
                  <h3>
                    <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.ai%2Fdownload/RK=2/RS=xyz">
                      Claude Code download
                    </a>
                  </h3>
                </div>
                <div class="compText aAbs">Agentic coding in your terminal.</div>
              </div>
            </div>
          </section>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 5.1,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/download');
  assert.equal(structured.results[0].title, 'Claude Code download');
  assert.ok(requests.some((request) => request.cookie.includes('GUCS=')));
});

test('search_yahoo retries a non-blocked empty nojs page with a GUCS cookie when that unlocks real results', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const cookie = String(init?.headers?.Cookie || init?.headers?.cookie || '');
    requests.push({ href, cookie });

    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    if (!cookie.includes('GUCS=')) {
      return new Response(`
        <html>
          <head><title>Yahoo Search</title></head>
          <body>
            <div class="search-assist">Refine your search</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    return new Response(`
      <html>
        <head><title>Claude Code - Yahoo Search Results</title></head>
        <body>
          <section class="reg searchCenterMiddle">
            <div id="web">
              <div class="algo-sr Sr">
                <div class="compTitle">
                  <h3>
                    <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.ai%2Fdownload/RK=2/RS=xyz">
                      Claude Code download
                    </a>
                  </h3>
                </div>
                <div class="compText aAbs">Agentic coding in your terminal.</div>
              </div>
            </div>
          </section>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 5.15,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/download');
  assert.equal(structured.results[0].title, 'Claude Code download');
  assert.ok(requests.some((request) => request.cookie.includes('GUCS=')));
});

test('search_yahoo bypasses Yahoo consent pages when a GUCS cookie unlocks real results', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    requests.push({ href, cookie: init?.headers?.Cookie || init?.headers?.cookie || '' });

    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    const cookie = String(init?.headers?.Cookie || init?.headers?.cookie || '');
    if (!cookie.includes('GUCS=')) {
      return new Response(`
        <!DOCTYPE html>
        <html dir="ltr" class="ltr yahoo-page height100">
          <head><title>Jouw privacykeuzes</title></head>
          <body>
            <form action="https://consent.yahoo.com/v2/collectConsent"></form>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=abc'
      });
    }

    return new Response(`
      <html>
        <body>
          <div id="web">
            <div class="algo">
              <a href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fexample.com%2Fyahoo-consent-bypass/RK=2/RS=xyz">
                Yahoo consent bypass result
              </a>
            </div>
          </div>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/yahoo-consent-bypass');
  assert.equal(structured.results[0].title, 'Yahoo consent bypass result');
  assert.ok(requests.some((request) => request.cookie.includes('GUCS=')));
});

test('search_yahoo does not block a real SERP just because inline consent bootstrap markers are present', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    return new Response(`
      <html>
        <head>
          <title>Claude Code - Yahoo Search Results</title>
          <script>window.__CMP__ = 'consent.js'; window.__GUCE__ = 'oath:guce:consent';</script>
        </head>
        <body>
          <section class="reg searchCenterMiddle">
            <div id="web">
              <div class="algo-sr Sr">
                <div class="compTitle">
                  <h3>
                    <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.com%2Fproduct%2Fclaude-code/RK=2/RS=xyz">
                      Claude Code by Anthropic | AI Coding Agent, Terminal, IDE
                    </a>
                  </h3>
                </div>
                <div class="compText aAbs">Build faster with Claude Code.</div>
              </div>
            </div>
          </section>
          <script src="https://consent.cmp.oath.com/cmp.js"></script>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: 'https://search.yahoo.com/search?p=Claude%20Code&n=1&nojs=1'
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.com/product/claude-code');
  assert.match(structured.results[0].title, /Claude Code by Anthropic/);
});

test('search_bbc filters generic navigation pages from search results', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bbc.co.uk/search?q=')) {
      return new Response(`
        <html>
          <body>
            <a href="https://www.bbc.com/worklife">BBC Worklife</a>
            <a href="https://www.bbc.com/weather">Weather</a>
            <a href="https://www.bbc.co.uk/news/articles/c1234567890o">Claude Code launch analysis</a>
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
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_bbc',
      arguments: {
        query: 'claude code',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.bbc.co.uk/news/articles/c1234567890o');
  assert.equal(structured.results[0].title, 'Claude Code launch analysis');
});

test('search_bing_global uses the international Bing route', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (!href.startsWith('https://www.bing.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }
    assert.match(href, /setlang=en/);
    assert.match(href, /cc=us/);

    return new Response(`
      <html>
        <body>
          <ol id="b_results">
            <li class="b_algo">
              <h2><a href="https://www.apple.com/newsroom/2026/06/ios-27-preview/">iOS 27 preview</a></h2>
              <p>Apple previews iOS 27.</p>
            </li>
          </ol>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 12.1,
    method: 'tools/call',
    params: {
      name: 'search_bing_global',
      arguments: {
        query: 'ios 27',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined);
  const structured = payload.result.structuredContent;
  assert.equal(structured.source, 'bing_global');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.apple.com/newsroom/2026/06/ios-27-preview/');
});

test('search_bing_cn uses the China Bing route', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (!href.startsWith('https://cn.bing.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    return new Response(`
      <html>
        <body>
          <ol id="b_results">
            <li class="b_algo">
              <h2><a href="https://www.gov.cn/zhengce/2026-05/20/content_123.htm">世界最新禁烟政策汇总</a></h2>
              <p>多国最新禁烟政策更新。</p>
            </li>
          </ol>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 12.2,
    method: 'tools/call',
    params: {
      name: 'search_bing_cn',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined);
  const structured = payload.result.structuredContent;
  assert.equal(structured.source, 'bing_cn');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.gov.cn/zhengce/2026-05/20/content_123.htm');
});

test('search_auto routes Chinese queries through bing_cn when requested', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    assert.ok(href.startsWith('https://cn.bing.com/search?'));
    return new Response(`
      <html>
        <body>
          <ol id="b_results">
            <li class="b_algo">
              <h2><a href="https://www.gov.cn/zhengce/2026-05/20/content_123.htm">世界最新禁烟政策汇总</a></h2>
              <p>多国最新禁烟政策更新。</p>
            </li>
          </ol>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 12.3,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 1,
        engines: ['bing_cn']
      }
    }
  });

  assert.equal(payload.error, undefined);
  const structured = payload.result.structuredContent;
  assert.equal(structured.source, 'bing_cn');
  assert.equal(structured.quality_status, 'green');
  assert.equal(structured.attempts.length, 1);
  assert.equal(structured.attempts[0].engine, 'bing_cn');
});

test('search_sec_edgar builds a canonical SEC filing URL when the API omits the direct link', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://efts.sec.gov/LATEST/search-index')) {
      return Response.json({
        hits: {
          hits: [
            {
              _source: {
                display_names: ['Apple Inc.'],
                ciks: ['0000320193'],
                adsh: '0000320193-24-000123',
                file_date: '2024-11-01',
                form: '10-K'
              }
            }
          ]
        }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.5,
    method: 'tools/call',
    params: {
      name: 'search_sec_edgar',
      arguments: {
        query: 'Apple',
        form_type: '10-K',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sec_edgar');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Apple Inc. 10-K');
  assert.equal(structured.results[0].url, 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm');
  assert.match(structured.results[0].snippet, /2024-11-01/);
});

test('search_wikipedia returns structured tool output instead of a top-level JSON-RPC error when both API and HTML fallback fail', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://en.wikipedia.org/w/api.php?')) {
      throw new Error('api unavailable');
    }
    if (href.startsWith('https://en.wikipedia.org/w/index.php?search=')) {
      throw new Error('html fallback unavailable');
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.55,
    method: 'tools/call',
    params: {
      name: 'search_wikipedia',
      arguments: {
        query: 'Claude Code',
        limit: 2,
        language: 'en'
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'wikipedia');
  assert.equal(structured.limit, 2);
  assert.equal(structured.language, 'en');
  assert.equal(structured.results.length, 0);
  assert.match(structured.error, /html fallback unavailable/i);
});

test('search_paperswithcode keeps the Crossref item URL when fallback items have no DOI', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.semanticscholar.org/graph/v1/paper/search?')) {
      throw new Error('semanticscholar unavailable');
    }
    if (href.startsWith('https://api.crossref.org/works?')) {
      return Response.json({
        message: {
          items: [
            {
              title: ['Paper without DOI'],
              author: [{ given: 'Ada', family: 'Lovelace' }],
              published: { 'date-parts': [[1843]] },
              URL: 'https://api.crossref.org/works/work-without-doi'
            }
          ]
        }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.56,
    method: 'tools/call',
    params: {
      name: 'search_paperswithcode',
      arguments: {
        query: 'analytical engine',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'paperswithcode');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Paper without DOI');
  assert.equal(structured.results[0].url, 'https://api.crossref.org/works/work-without-doi');
  assert.match(structured.results[0].snippet, /Ada Lovelace \(1843\)/);
});

test('search_yahoo retries the final mobile nojs fallback with a GUCS cookie when the first mobile response is a non-blocked empty page', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let desktopAttempts = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const headers = init?.headers || {};
    const userAgent = String(headers['User-Agent'] || headers['user-agent'] || '');
    const cookie = String(headers['Cookie'] || headers['cookie'] || '');
    requests.push({ href, userAgent, cookie });

    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    const isMobileFallback = userAgent.includes('Pixel 7') && href.includes('nojs=1');
    if (!isMobileFallback) {
      desktopAttempts += 1;
      if (desktopAttempts <= 3) {
        return new Response(`
          <html>
            <head><title>Privacy Choices</title></head>
            <body>
              <form action="https://consent.yahoo.com/v2/collectConsent"></form>
            </body>
          </html>
        `, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=abc'
        });
      }
      throw new Error(`unexpected extra desktop attempt: ${href}`);
    }

    if (!cookie.includes('GUCS=')) {
      return new Response(`
        <html>
          <head><title>Yahoo Search</title></head>
          <body>
            <div class="search-assist">Refine your search</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    return new Response(`
      <html>
        <head><title>Claude Code - Yahoo Search Results</title></head>
        <body>
          <section class="reg searchCenterMiddle">
            <div id="web">
              <div class="algo-sr Sr">
                <div class="compTitle">
                  <h3>
                    <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.ai%2Fdownload/RK=2/RS=xyz">
                      Claude Code download
                    </a>
                  </h3>
                </div>
                <div class="compText aAbs">Agentic coding in your terminal.</div>
              </div>
            </div>
          </section>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.5,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/download');
  assert.equal(structured.results[0].title, 'Claude Code download');
  assert.ok(requests.some((request) => request.userAgent.includes('Pixel 7') && request.cookie.includes('GUCS=')));
});

test('search_yahoo follows a consent form POST before retrying the original Yahoo search URL when fixed GUCS retries still hit consent', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const method = String(init?.method || 'GET').toUpperCase();
    const headers = init?.headers || {};
    const cookie = String(headers['Cookie'] || headers['cookie'] || '');
    const body = typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? String(init.body)
          : '';
    requests.push({ href, method, cookie, body });

    if (method === 'POST' && href === 'https://consent.yahoo.com/v2/collectConsent') {
      assert.match(body, /agree=agree/);
      assert.match(body, /csrfToken=token123/);
      assert.match(body, /sessionId=session-abc/);
      return new Response('', {
        status: 302,
        headers: {
          Location: 'https://search.yahoo.com/search?p=Claude+Code&n=1&ei=UTF-8&nojs=1&guccounter=1',
          'Set-Cookie': 'A1=accepted; Domain=.yahoo.com; Path=/, EuConsent=accepted; Domain=.yahoo.com; Path=/'
        }
      });
    }

    if (!href.startsWith('https://search.yahoo.com/search?')) {
      throw new Error(`unexpected url: ${href}`);
    }

    const hasYahooConsentCookies = cookie.includes('A1=accepted') || cookie.includes('EuConsent=accepted');
    if (!hasYahooConsentCookies) {
      return new Response(`
        <html>
          <head><title>Privacy Choices</title></head>
          <body>
            <form action="https://consent.yahoo.com/v2/collectConsent" method="post">
              <input type="hidden" name="csrfToken" value="token123">
              <input type="hidden" name="sessionId" value="session-abc">
              <input type="hidden" name="originalDoneUrl" value="https://search.yahoo.com/search?p=Claude+Code&amp;n=1&amp;ei=UTF-8&amp;nojs=1&amp;guccounter=1">
              <input type="hidden" name="namespace" value="yahoo">
              <button name="agree" value="agree">Agree</button>
            </form>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=session-abc'
      });
    }

    return new Response(`
      <html>
        <head><title>Claude Code - Yahoo Search Results</title></head>
        <body>
          <div id="web">
            <div class="algo-sr Sr">
              <div class="compTitle">
                <h3>
                  <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.ai%2Fproduct%2Fclaude-code/RK=2/RS=xyz">
                    Claude Code by Anthropic
                  </a>
                </h3>
              </div>
              <div class="compText aAbs">Code faster with Anthropic.</div>
            </div>
          </div>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.6,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify({ structured, requests }, null, 2));
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/product/claude-code');
  assert.match(structured.results[0].title, /Claude Code by Anthropic/);
  assert.ok(requests.some((request) => request.method === 'POST' && request.href === 'https://consent.yahoo.com/v2/collectConsent'));
  assert.ok(requests.some((request) => request.href.includes('guccounter=1') && request.cookie.includes('A1=accepted')));
});

test('search_yahoo replays live-shape Yahoo consent forms whose action is empty and posts back to the consent page URL', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const method = String(init?.method || 'GET').toUpperCase();
    const headers = init?.headers || {};
    const cookie = String(headers['Cookie'] || headers['cookie'] || '');
    const body = typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? String(init.body)
          : '';
    requests.push({ href, method, cookie, body });

    if (method === 'POST' && href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')) {
      assert.match(body, /agree=agree/);
      assert.match(body, /csrfToken=liveToken123/);
      assert.match(body, /sessionId=3_cc-session_live-abc/);
      return new Response('', {
        status: 302,
        headers: {
          Location: 'https://search.yahoo.com/search?p=Claude+Code&n=1&ei=UTF-8&nojs=1&geb=1&guccounter=1',
          'Set-Cookie': 'A1=accepted; Domain=.yahoo.com; Path=/, EuConsent=accepted; Domain=.yahoo.com; Path=/, GUCS=AV.1; Domain=.yahoo.com; Path=/'
        }
      });
    }

    if (!href.startsWith('https://search.yahoo.com/search?') && !href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')) {
      throw new Error(`unexpected url: ${href}`);
    }

    const hasYahooConsentCookies = cookie.includes('A1=accepted') || cookie.includes('EuConsent=accepted');
    if (!hasYahooConsentCookies) {
      return new Response(`
        <html>
          <body id="tcf2-layer1">
            <div id="consent-page">
              <form method="post" class="other-form" action="https://example.com/ignore-me">
                <input type="hidden" name="junk" value="1">
              </form>
              <form method="post" class="consent-form" action="">
                <div class="actions couple">
                  <input type="hidden" name="csrfToken" value="liveToken123">
                  <input type="hidden" name="sessionId" value="3_cc-session_live-abc">
                  <input type="hidden" name="originalDoneUrl" value="https://search.yahoo.com/search?p&#x3D;Claude%20Code&amp;n&#x3D;1&amp;ei&#x3D;UTF-8&amp;nojs&#x3D;1&amp;geb&#x3D;1&amp;guccounter&#x3D;1">
                  <input type="hidden" name="namespace" value="yahoo">
                  <button type="submit" class="btn secondary accept-all" name="agree" value="agree">Alle akzeptieren</button>
                  <button type="submit" class="btn secondary reject-all" name="reject" value="reject">Alle ablehnen</button>
                </div>
              </form>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=3_cc-session_live-abc'
      });
    }

    return new Response(`
      <html>
        <head><title>Claude Code - Yahoo Search Results</title></head>
        <body>
          <div id="web">
            <div class="algo-sr Sr">
              <div class="compTitle">
                <h3>
                  <a class="s-title fz-m" href="https://r.search.yahoo.com/_ylt=abc/RU=https%3A%2F%2Fclaude.ai%2Fproduct%2Fclaude-code/RK=2/RS=xyz">
                    Claude Code by Anthropic
                  </a>
                </h3>
              </div>
              <div class="compText aAbs">Code faster with Anthropic.</div>
            </div>
          </div>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.7,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify({ structured, requests }, null, 2));
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/product/claude-code');
  assert.ok(requests.some((request) => request.method === 'POST' && request.href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')));
  assert.ok(requests.some((request) => request.href.includes('guccounter=1') && request.cookie.includes('A1=accepted')));
});

test('search_yahoo reports blocked after consent form replay when the final retried Yahoo page is still a non-blocked empty page', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const method = String(init?.method || 'GET').toUpperCase();
    const headers = init?.headers || {};
    const cookie = String(headers['Cookie'] || headers['cookie'] || '');
    const body = typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? String(init.body)
          : '';
    requests.push({ href, method, cookie, body });

    if (method === 'POST' && href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')) {
      assert.match(body, /agree=agree/);
      assert.match(body, /csrfToken=liveToken123/);
      assert.match(body, /sessionId=3_cc-session_live-abc/);
      return new Response('', {
        status: 302,
        headers: {
          Location: 'https://search.yahoo.com/search?p=Claude+Code&n=1&ei=UTF-8&nojs=1&geb=1&guccounter=1',
          'Set-Cookie': 'A1=accepted; Domain=.yahoo.com; Path=/, EuConsent=accepted; Domain=.yahoo.com; Path=/, GUCS=AV.1; Domain=.yahoo.com; Path=/'
        }
      });
    }

    if (!href.startsWith('https://search.yahoo.com/search?') && !href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')) {
      throw new Error(`unexpected url: ${href}`);
    }

    const hasYahooConsentCookies = cookie.includes('A1=accepted') || cookie.includes('EuConsent=accepted');
    if (!hasYahooConsentCookies) {
      return new Response(`
        <html>
          <body id="tcf2-layer1">
            <div id="consent-page">
              <form method="post" class="other-form" action="https://example.com/ignore-me">
                <input type="hidden" name="junk" value="1">
              </form>
              <form method="post" class="consent-form" action="">
                <div class="actions couple">
                  <input type="hidden" name="csrfToken" value="liveToken123">
                  <input type="hidden" name="sessionId" value="3_cc-session_live-abc">
                  <input type="hidden" name="originalDoneUrl" value="https://search.yahoo.com/search?p&#x3D;Claude%20Code&amp;n&#x3D;1&amp;ei&#x3D;UTF-8&amp;nojs&#x3D;1&amp;geb&#x3D;1&amp;guccounter&#x3D;1">
                  <input type="hidden" name="namespace" value="yahoo">
                  <button type="submit" class="btn secondary accept-all" name="agree" value="agree">Alle akzeptieren</button>
                  <button type="submit" class="btn secondary reject-all" name="reject" value="reject">Alle ablehnen</button>
                </div>
              </form>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=3_cc-session_live-abc'
      });
    }

    return new Response(`
      <html>
        <head><title>Yahoo Search</title></head>
        <body>
          <div class="search-assist">Refine your search</div>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: href
    });
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8.71,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify({ structured, requests }, null, 2));
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.blocked, true);
  assert.equal(structured.block_reason, 'consent_page');
  assert.equal(structured.results.length, 0);
  assert.ok(requests.some((request) => request.method === 'POST' && request.href.startsWith('https://consent.yahoo.com/v2/collectConsent?sessionId=')));
  assert.ok(requests.some((request) => request.href.includes('guccounter=1') && request.cookie.includes('A1=accepted')));
});

test('search_sogou decodes wrapped sogou.com/link redirect targets into real result URLs', async (t) => {
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
            <h3>
              <a href="https://www.sogou.com/link?url=https%3A%2F%2Fexample.com%2Fsogou-result">Sogou result title</a>
            </h3>
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
      name: 'search_sogou',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/sogou-result');
  assert.equal(structured.results[0].title, 'Sogou result title');
});

test('search_sogou drops unresolved sogou.com/link wrappers instead of returning them as results', async (t) => {
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
            <h3>
              <a href="https://www.sogou.com/link?url=hedJja00000abc123">Wrapped result title</a>
            </h3>
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
    id: 7,
    method: 'tools/call',
    params: {
      name: 'search_sogou',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.results.length, 0);
});

test('search_baidu parses modern mobile result cards using data-log mu targets', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <body>
            <a class="se-main-tab-item" href="https://m.baidu.com/s?word=Claude+Code+Anthropic&sa=vs_tab">
              <span>综合</span>
            </a>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://example.com/baidu-result&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/from=0/tc?junk=1">
                  <h3>Modern Baidu result title</h3>
                </a>
              </div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: 'Claude Code Anthropic',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Modern Baidu result title');
  assert.equal(structured.results[0].url, 'https://example.com/baidu-result');
});

test('search_baidu skips facet-style junk cards and keeps the real web result', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <body>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://m.baidu.com/sf?pd=sd_ptime&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/sf?pd=sd_ptime">
                  <h3>24小时</h3>
                </a>
              </div>
            </div>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://m.baidu.com/sf?pd=sd_ptime_7d&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/sf?pd=sd_ptime_7d">
                  <h3>1周内</h3>
                </a>
              </div>
            </div>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://example.com/real-result&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/from=0/tc?junk=3">
                  <h3>Claude Code official docs</h3>
                </a>
              </div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: 'site:anthropic.com Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code official docs');
  assert.equal(structured.results[0].url, 'https://example.com/real-result');
});
test('search_baidu generic fallback skips AI promo links and keeps the real web result', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <body>
            <div class="some-other-layout">
              <a href="https://m.baidu.com/from=0/bd_page_type=1/ssid=0/uid=0/pu=usm%401/baiduid=abc/w=0_10_/l=1/tc?ct=24&cst=24&pd=csaitab&isAtom=1">
                点击即刻体验AI搜索！
              </a>
              <a href="https://example.com/real-baidu-result">
                Claude Code 官方文档
              </a>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code 官方文档');
  assert.equal(structured.results[0].url, 'https://example.com/real-baidu-result');
});

test('search_baidu uses desktop tn=json results when mobile Baidu is captcha-blocked', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <head><title>百度安全验证</title></head>
          <body>
            <div>请输入验证码</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=') && href.includes('&tn=json&')) {
      return Response.json({
        feed: {
          entry: [
            {
              title: 'Claude Code 官方文档',
              url: 'https://example.com/baidu-json-result',
              abs: 'Anthropic 的 Claude Code 说明页面'
            }
          ]
        }
      }, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop html fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code 官方文档');
  assert.equal(structured.results[0].url, 'https://example.com/baidu-json-result');
  assert.match(structured.results[0].snippet, /Claude Code/);
});

test('search_auto honors explicitly requested public engines like github_repos instead of silently skipping them', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.github.com/search/repositories?q=claude%20code')) {
      return Response.json({
        total_count: 1,
        items: [
          {
            full_name: 'anthropics/claude-code',
            stargazers_count: 1234,
            html_url: 'https://github.com/anthropics/claude-code',
            description: 'Agentic coding tool'
          }
        ]
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'claude code',
        limit: 1,
        engines: ['github_repos']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'github');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'anthropics/claude-code ★1234');
  assert.equal(structured.attempts[0].engine, 'github_repos');
  assert.equal(structured.attempts[0].ok, true);
});

test('fetch_metadata parses canonical links when href appears before rel', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === 'https://example.com/article') {
      return new Response(`
        <html>
          <head>
            <title>Example article</title>
            <meta content="Example description" name="description">
            <link href="/canonical-article" rel="canonical">
          </head>
          <body>Article</body>
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
      name: 'fetch_metadata',
      arguments: {
        url: 'https://example.com/article'
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.title, 'Example article');
  assert.equal(structured.description, 'Example description');
  assert.equal(structured.canonical, 'https://example.com/canonical-article');
});


test('search_reddit reranks simplified Chinese fallback results toward direct Chinese post matches', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.reddit.com/search.json?')) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (href.startsWith('https://noai.duckduckgo.com/?q=site%3Areddit.com%20%E4%BA%8C%E5%B7%A5%E5%A4%A7%E6%9D%80%E6%9D%80%E6%9D%80')) {
      return new Response('<html><body>captcha</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <body>
            <a rel="nofollow" href="https://www.reddit.com/r/China_irl/comments/old111/%E4%B8%8A%E6%B5%B7%E6%A0%A1%E5%9B%AD%E8%AE%A8%E8%AE%BA/">上海校园讨论串</a>
            <table><tr><td class="result-snippet">聊的是上海校园新闻，不是目标事件。</td></tr></table>
            <a rel="nofollow" href="https://www.reddit.com/r/real_China_irl/comments/target222/%E4%BA%8C%E5%B7%A5%E5%A4%A7%E6%9D%80%E6%9D%80%E6%9D%80%E4%BA%8B%E4%BB%B6/">二工大杀杀杀事件</a>
            <table><tr><td class="result-snippet">直接讨论二工大杀杀杀事件的帖子。</td></tr></table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://lite.duckduckgo.com/lite/'
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 11.5,
    method: 'tools/call',
    params: {
      name: 'search_reddit',
      arguments: {
        query: '二工大杀杀杀',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'reddit');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results.length, 2);
  assert.equal(structured.results[0].title, '二工大杀杀杀事件');
  assert.equal(structured.results[0].url, 'https://www.reddit.com/r/real_China_irl/comments/target222/%E4%BA%8C%E5%B7%A5%E5%A4%A7%E6%9D%80%E6%9D%80%E6%9D%80%E4%BA%8B%E4%BB%B6/');
  assert.equal(structured.fetch_path, 'lite.duckduckgo.com');
});

test('search_sogou deduplicates repeated organic results that decode to the same final URL', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.sogou.com/web?query=')) {
      return new Response(`
        <html>
          <body>
            <h3><a href="/link?url=https%3A%2F%2Fexample.com%2Fa">First title</a></h3>
            <h3><a href="/link?target=https%3A%2F%2Fexample.com%2Fa">Same target title</a></h3>
            <h3><a href="https://example.com/b">Second title</a></h3>
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
      name: 'search_sogou',
      arguments: {
        query: 'Claude Code',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.results.length, 2);
  assert.deepEqual(structured.results.map((item) => item.url), [
    'https://example.com/a',
    'https://example.com/b'
  ]);
});


test('search_google_web reports blocked when Google is blocked upstream', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
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

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_google_web',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'google');
  assert.equal(structured.blocked, true);
  assert.equal(structured.block_reason, 'captcha_or_verification');
  assert.equal(structured.results.length, 0);
});

test('search_bing strips site attribution text from result titles', async (t) => {
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
            <ol id="b_results">
              <li class="b_algo">
                <div class="b_tpcn">
                  <a class="tilk" href="https://claude.com/product/claude-code">claude.com</a>
                </div>
                <h2>
                  <a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9jbGF1ZGUuY29tL3Byb2R1Y3QvY2xhdWRlLWNvZGU">
                    claude.com https:// claude.com › product › claude-code Claude Code
                  </a>
                </h2>
                <div class="b_caption">
                  <p>Code with Claude.</p>
                </div>
              </li>
            </ol>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'search_bing',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bing');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code');
  assert.equal(structured.results[0].url, 'https://claude.com/product/claude-code');
});

test('search_bing derives a clean title from breadcrumb-only headline text', async (t) => {
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
            <ol id="b_results">
              <li class="b_algo">
                <div class="b_tpcn">
                  <a class="tilk" href="https://claude.com/product/claude-code">claude.com</a>
                </div>
                <h2>
                  <a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9jbGF1ZGUuY29tL3Byb2R1Y3QvY2xhdWRlLWNvZGU">
                    claude.com https:// claude.com › product › claude-code
                  </a>
                </h2>
                <div class="b_caption">
                  <p>Code with Claude.</p>
                </div>
              </li>
            </ol>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'search_bing',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bing');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code');
  assert.equal(structured.results[0].url, 'https://claude.com/product/claude-code');
});

test('search_duckduckgo does not false-block valid html SERP pages that contain benign robots text', async (t) => {
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

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <head>
            <title>Claude Code at DuckDuckGo</title>
            <meta name="robots" content="noindex,nofollow">
          </head>
          <body>
            <table>
              <tr class="result-sponsored">
                <td class="result-snippet">Sponsored coding tool ad</td>
                <td>
                  <a class="result-link" href="https://duckduckgo.com/duckduckgo-help-pages/company/ads-by-microsoft-on-duckduckgo-private-search/">more info</a>
                </td>
              </tr>
              <tr>
                <td class="result-snippet">Anthropic coding agent docs</td>
                <td>
                  <a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fclaude.ai%2Fcode">Claude Code</a>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_duckduckgo',
      arguments: {
        query: 'Claude Code',
        limit: 1,
        region: 'us-en'
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'duckduckgo');
  assert.equal(structured.region, 'us-en');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code');
  assert.equal(structured.results[0].url, 'https://claude.ai/code');
  assert.match(structured.results[0].snippet, /Anthropic coding agent docs/);
});

test('search_duckduckgo drops DuckDuckGo ad payloads and help links from lite results', async (t) => {
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

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <head><title>Claude Code at DuckDuckGo</title></head>
          <body>
            <table>
              <tr class="result-sponsored">
                <td class="result-snippet">Sponsored coding tool ad</td>
                <td>
                  <a class="result-link" href="https://duckduckgo.com/y.js?ad_domain=askgpt.app&ad_provider=bingv7aa&u3=https%3A%2F%2Fwww.bing.com%2Faclick">Claude code - Claude 4.7 Now Available</a>
                  <a class="result-link" href="https://duckduckgo.com/duckduckgo-help-pages/company/ads-by-microsoft-on-duckduckgo-private-search/">more info</a>
                </td>
              </tr>
              <tr>
                <td class="result-snippet">Anthropic coding agent docs</td>
                <td>
                  <a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fclaude.ai%2Fcode">Claude Code</a>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'search_duckduckgo',
      arguments: {
        query: 'Claude Code',
        limit: 3,
        region: 'us-en'
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.deepEqual(structured.results.map((item) => item.title), ['Claude Code']);
  assert.deepEqual(structured.results.map((item) => item.url), ['https://claude.ai/code']);
});

test('search_duckduckgo parses live-shape lite rows with href-before-class and single-quoted classes', async (t) => {
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

    if (href.startsWith('https://lite.duckduckgo.com/lite/')) {
      return new Response(`
        <html>
          <head><title>Claude Code at DuckDuckGo</title></head>
          <body>
            <table>
              <tr class="result-sponsored">
                <td valign="top">1.&nbsp;</td>
                <td>
                  <a rel="nofollow" href="https://duckduckgo.com/y.js?ad_domain=askgpt.app&ad_provider=bingv7aa&u3=https%3A%2F%2Fwww.bing.com%2Faclick" class='result-link'>Claude code - Claude 4.7 Now Available</a>
                  (Sponsored link - <a href="https://duckduckgo.com/duckduckgo-help-pages/company/ads-by-microsoft-on-duckduckgo-private-search/" rel="nofollow" class="result-link">more info</a>)
                </td>
              </tr>
              <tr>
                <td class="result-snippet">Anthropic coding agent docs</td>
                <td>
                  <a rel="nofollow" href="https://claude.com/product/claude-code" class='result-link'>Claude Code by Anthropic | AI Coding Agent, Terminal, IDE</a>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'search_duckduckgo',
      arguments: {
        query: 'Claude Code',
        limit: 2,
        region: 'us-en'
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.deepEqual(structured.results.map((item) => item.title), ['Claude Code by Anthropic | AI Coding Agent, Terminal, IDE']);
  assert.deepEqual(structured.results.map((item) => item.url), ['https://claude.com/product/claude-code']);
});

test('search_duckduckgo reports final upstream failure when all DuckDuckGo surfaces are blocked or unusable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
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
      throw new Error(`unexpected fallback probe: ${href} method=${options.method || 'GET'}`);
    }

    throw new Error(`unexpected url: ${href} method=${options.method || 'GET'}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_duckduckgo',
      arguments: {
        query: 'Claude Code',
        limit: 1,
        region: 'us-en'
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'duckduckgo');
  assert.equal(structured.error.includes('unexpected fallback probe'), true);
  assert.equal(Array.isArray(structured.fetch_attempts), true);
  assert.equal(structured.fetch_attempts.length, 3);
  assert.equal(structured.region, 'us-en');
  assert.equal(structured.results.length, 0);
});

test('search_auto uses later site-targeted engines when Yahoo native search is blocked for a site query', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    requests.push({ href, method: String(init?.method || 'GET').toUpperCase() });

    if (href.startsWith('https://search.yahoo.com/search?')) {
      return new Response(`
        <html>
          <body id="tcf2-layer1">
            <div id="consent-page">Yahoo consent wall</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=blocked'
      });
    }

    if (href.startsWith('https://search.brave.com/search?q=')) {
      assert.match(href, /site%3Aclaude\.ai%20Claude%20Code/);
      return new Response(`
        <html>
          <body>
            <div data-type="web">
              <a class="l1" href="https://claude.ai/download">Claude Code download</a>
              <div class="snippet-description">Official Claude Code asset page</div>
            </div>
            <div data-type="web">
              <a class="l1" href="https://example.com/not-allowed">Noise result</a>
              <div class="snippet-description">Should be filtered out by host targeting</div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
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
        query: 'site:claude.ai Claude Code',
        limit: 1,
        engines: ['yahoo', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify({ structured, requests }, null, 2));
  assert.equal(structured.source, 'site_targeted');
  assert.deepEqual(structured.sources, ['brave']);
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://claude.ai/download');
  assert.ok(structured.attempts.some((item) => item.engine === 'yahoo' && item.ok === false));
  assert.ok(structured.attempts.some((item) => item.engine === 'brave' && item.ok === true));
});

test('search_yahoo reports native Yahoo blocking without pretending a blocked site query succeeded', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.yahoo.com/search?')) {
      return new Response(`
        <html>
          <body id="tcf2-layer1">
            <div id="consent-page">Yahoo consent wall</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: 'https://consent.yahoo.com/v2/collectConsent?sessionId=still-blocked'
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_yahoo',
      arguments: {
        query: 'site:claude.ai Claude Code',
        limit: 1
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'yahoo');
  assert.equal(structured.blocked, true);
  assert.equal(structured.block_reason, 'consent_page');
  assert.equal(structured.results.length, 0);
});
test('search_auto falls through blocked big engines and succeeds on Brave later in the chain', async (t) => {
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
              <a class="l1" href="https://example.com/auto-fallback">Claude Code fallback guide</a>
              <div class="snippet-description">Recovered from blocked upstream engines with Claude Code docs.</div>
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
    id: 4.1,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: 'Claude Code',
        limit: 1,
        engines: ['duckduckgo', 'google', 'brave']
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'brave');
  assert.deepEqual(structured.sources, ['brave']);
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://example.com/auto-fallback');
  assert.deepEqual(structured.attempts.map((item) => item.engine), ['duckduckgo', 'google', 'brave']);
  assert.equal(structured.attempts[2].quality_status, 'green');
  assert.equal(structured.attempts[2].ok, true);
});

test('search_github_repos returns structured tool output instead of top-level JSON-RPC error on upstream HTTP failures', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.github.com/search/repositories?')) {
      return new Response('rate limited', {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.2,
    method: 'tools/call',
    params: {
      name: 'search_github_repos',
      arguments: {
        query: 'claude code',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false);
  assert.equal(structured.source, 'github');
  assert.equal(structured.limit, 3);
  assert.equal(structured.results.length, 0);
  assert.match(structured.error, /upstream 403/i);
});

test('search_github_repos reranks exact full_name matches ahead of broader higher-star partial matches', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.github.com/search/repositories?')) {
      return Response.json({
        total_count: 3,
        items: [
          {
            full_name: 'someone/claude-code-examples',
            stargazers_count: 50000,
            html_url: 'https://github.com/someone/claude-code-examples',
            description: 'Examples for Claude Code'
          },
          {
            full_name: 'anthropic/claude-code',
            stargazers_count: 12000,
            html_url: 'https://github.com/anthropic/claude-code',
            description: 'Official Claude Code repository'
          },
          {
            full_name: 'another/awesome-claude-code-list',
            stargazers_count: 30000,
            html_url: 'https://github.com/another/awesome-claude-code-list',
            description: 'Curated list'
          }
        ]
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.3,
    method: 'tools/call',
    params: {
      name: 'search_github_repos',
      arguments: {
        query: 'anthropic/claude-code',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.results.length, 3);
  assert.equal(structured.results[0].url, 'https://github.com/anthropic/claude-code');
  assert.equal(structured.results[0].title, 'anthropic/claude-code ★12000');
});

test('search_bing_news unwraps Bing redirect links from RSS items and reports empty results cleanly when HTML fallback has no usable stories', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/news/search?q=' ) && href.includes('&format=rss')) {
      return new Response(`
        <rss>
          <channel>
            <item>
              <title><![CDATA[Claude Code news roundup]]></title>
              <link><![CDATA[https://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3A%2F%2Fexample.com%2Fclaude-code-news&c=123]]></link>
            </item>
          </channel>
        </rss>
      `, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 15.1,
    method: 'tools/call',
    params: {
      name: 'search_bing_news',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bing_news');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].title, 'Claude Code news roundup');
  assert.equal(structured.results[0].url, 'https://example.com/claude-code-news');
});

test('search_bing_news falls back to a clean empty result when RSS and HTML pages expose no usable non-Bing stories', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/news/search?q=') && href.includes('&format=rss')) {
      return new Response(`
        <rss>
          <channel>
            <item>
              <title><![CDATA[Bing news self link]]></title>
              <link><![CDATA[https://www.bing.com/news/search?q=Claude+Code]]></link>
            </item>
          </channel>
        </rss>
      `, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.bing.com/news/search?q=')) {
      return new Response(`
        <html>
          <body>
            <a href="https://www.bing.com/news/search?q=Claude+Code">Search on Bing News</a>
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
    id: 15.2,
    method: 'tools/call',
    params: {
      name: 'search_bing_news',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bing_news');
  assert.equal(structured.results.length, 0);
});

test('search_bbc parses BBC result links when href attributes use single quotes', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bbc.co.uk/search?')) {
      return new Response(`
        <html>
          <body>
            <a href='https://www.bbc.com/news/articles/c1234567890o'>BBC single quote result title</a>
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
    id: 4.4,
    method: 'tools/call',
    params: {
      name: 'search_bbc',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.bbc.com/news/articles/c1234567890o');
  assert.equal(structured.results[0].title, 'BBC single quote result title');
});

test('search_bbc drops BBC navigation and policy pages that dominate unrelated queries', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bbc.co.uk/search?')) {
      return new Response(`
        <html>
          <body>
            <a href='https://www.bbc.com/worklife'>Worklife</a>
            <a href='https://www.bbc.co.uk/usingthebbc/terms'>Terms of Use</a>
            <a href='https://www.bbc.co.uk/aboutthebbc'>About the BBC</a>
            <a href='https://www.bbc.com/usingthebbc/privacy'>Privacy Policy</a>
            <a href='https://www.bbc.co.uk/iplayer/guidance'>Parental Guidance</a>
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
    id: 4.41,
    method: 'tools/call',
    params: {
      name: 'search_bbc',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 5
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 0);
});

test('search_bbc drops BBC pages whose titles only match stray query fragments', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bbc.co.uk/search?')) {
      return new Response(`
        <html>
          <body>
            <a href='https://www.bbc.com/worklife'>Worklife</a>
            <a href='https://www.bbc.co.uk/sounds/play/p0nh7cq5'>Rhaglen Sounds Tudur Owen. Metel Detect-io. Listen Now Rhaglen Sounds Tudur Owen Metel Detect‑io</a>
            <a href='https://www.bbc.co.uk/sport/football/articles/crl177pxrl4o'>Champions League: Which teams have qualified for 2026-27 tournament?</a>
            <a href='https://www.bbc.co.uk/news/articles/c4g07vng8z1o'>Everest: Record 274 climbers scale world's highest peak via Nepal in one day</a>
            <a href='https://www.bbc.co.uk/sport/rugby-union/articles/c172z45921do'>Alex Everett: Cornish Pirates captain agrees deal for 2026-27 campaign</a>
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
    id: 4.42,
    method: 'tools/call',
    params: {
      name: 'search_bbc',
      arguments: {
        query: 'ios 27',
        limit: 5
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 0);
});

test('search_bbc drops BBC culture section pages for unrelated tech queries', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bbc.co.uk/search?')) {
      return new Response(`
        <html>
          <body>
            <a href='https://www.bbc.com/culture/music'>Music</a>
            <a href='https://www.bbc.co.uk/news/articles/cx200000000o'>Some unrelated generic news page</a>
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
    id: 4.43,
    method: 'tools/call',
    params: {
      name: 'search_bbc',
      arguments: {
        query: 'ios 27',
        limit: 5
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 0);
});

test('search_bing_cn drops unrelated forum results for Chinese sports queries', async (t) => {
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
            <ol id="b_results">
              <li class="b_algo">
                <h2><a href="https://forum.mapillary.com/">Mapillary Community Forum</a></h2>
                <p>2026年5月12日 · A forum to discuss, share and learn about all things Mapillary.</p>
              </li>
              <li class="b_algo">
                <h2><a href="https://forum.mapillary.com/t/android-mapillary-2026-03-16-6-12-76-open-testing/10274">Android: Mapillary 2026.03.16-6.12.76 open testing</a></h2>
                <p>Android: Mapillary 2026.03.16-6.12.76 open testing - Android - Mapillary Community Forum</p>
              </li>
            </ol>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.45,
    method: 'tools/call',
    params: {
      name: 'search_bing_cn',
      arguments: {
        query: '2026 年 NBA 总决赛情况',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'bing_cn');
  assert.equal(structured.results.length, 0);
});

test('search_sogou drops empty-snippet WeChat policy pages for direct Chinese policy queries', async (t) => {
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
            <h3>
              <a href="https://mp.weixin.qq.com/s?foo=policy-1">不能合法买 烟!史上“最严”禁烟令要来了</a>
            </h3>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.46,
    method: 'tools/call',
    params: {
      name: 'search_sogou',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'sogou');
  assert.equal(structured.results.length, 0);
});

test('search_baidu drops placeholder-looking sports spam domains for Chinese factual queries', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <body>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://2026niannbazongjuesaixiliebifen.org.cn/&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/from=0/tc?junk=11">
                  <h3>2026年NBA总决赛系列比分 | 完整赛程、数据分析与球队动态</h3>
                </a>
              </div>
            </div>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://2026nbazongjuesaig7quanchuifang.com.cn/&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/from=0/tc?junk=12">
                  <h3>2026 NBA总决赛G7全场回放 | 巅峰对决完整录像</h3>
                </a>
              </div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.47,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: '2026 年 NBA 总决赛情况',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, false, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 0);
});

test('search_baidu json keeps legitimate hosts and drops placeholder slug spam for Chinese factual queries', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response('<html><body>百度安全验证</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      return Response.json({
        feed: {
          entry: [
            {
              title: '2026年NBA总决赛系列比分 | 完整赛程、数据分析与球队动态',
              url: 'https://2026niannbazongjuesaixiliebifen.org.cn/',
              abs: ''
            },
            {
              title: '腾讯体育：2026 年 NBA 总决赛最新情况',
              url: 'https://sports.qq.com/nba/finals-2026-status',
              abs: '总决赛赛程、比分与球队动态更新。'
            }
          ]
        }
      }, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.471,
    method: 'tools/call',
    params: {
      name: 'search_baidu',
      arguments: {
        query: '2026 年 NBA 总决赛情况',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true, JSON.stringify(payload, null, 2));
  assert.equal(structured.source, 'baidu');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://sports.qq.com/nba/finals-2026-status');
});

test('filtered direct-tool results keep filtered_count metadata without runtime errors', async (t) => {
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
            <h3>
              <a href="https://mp.weixin.qq.com/s?foo=policy-direct">不能合法买 烟!史上“最严”禁烟令要来了</a>
            </h3>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.472,
    method: 'tools/call',
    params: {
      name: 'search_sogou',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 3
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.error, undefined, JSON.stringify(payload, null, 2));
  assert.equal(structured.filtered_count, 1, JSON.stringify(payload, null, 2));
  assert.equal(structured.filtered_reason, 'intent_mismatch');
  assert.equal(structured.results.length, 0);
});

test('search_auto falls through direct Chinese engine junk and reaches Baidu policy result', async (t) => {
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
            <h3>
              <a href="https://mp.weixin.qq.com/s?foo=policy-2">不能合法买 烟!史上“最严”禁烟令要来了</a>
            </h3>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://cn.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <ol id="b_results">
              <li class="b_algo">
                <h2><a href="https://beian.miit.gov.cn/">京ICP备10036305号-7</a></h2>
              </li>
            </ol>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://m.baidu.com/s?word=')) {
      return new Response(`
        <html>
          <body>
            <div class="c-result result" data-log="{&quot;mu&quot;:&quot;https://www.nhc.gov.cn/guihuaxxs/c100132/202605/d29996ac4520469b85e284c21dc08d66.shtml&quot;}">
              <div class="c-container">
                <a href="https://m.baidu.com/from=0/tc?policy=1">
                  <h3>国家卫生健康委办公厅关于开展第39个世界无烟日活动的通知</h3>
                </a>
              </div>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.baidu.com/s?wd=')) {
      throw new Error(`unexpected desktop fallback: ${href}`);
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.48,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '世界最新禁烟政策',
        limit: 3,
        engines: ['sogou', 'bing_cn', 'baidu']
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'auto');
  assert.deepEqual([...structured.sources].sort(), ['baidu', 'bing_cn']);
  assert.equal(structured.attempts.length, 3);
  assert.equal(structured.attempts[0].engine, 'sogou');
  assert.equal(structured.attempts[0].error, undefined, JSON.stringify(payload, null, 2));
  assert.equal(structured.attempts[0].quality_status, 'yellow');
  assert.equal(structured.attempts[1].engine, 'bing_cn');
  assert.equal(structured.attempts[1].quality_status, 'yellow');
  assert.equal(structured.attempts[2].engine, 'baidu');
  assert.equal(structured.attempts[2].quality_status, 'yellow');
  assert.equal(structured.quality_status, 'yellow');
  assert.equal(structured.results.length, 2);
  assert.match(structured.results[0].url, /nhc\.gov\.cn|beian\.miit\.gov\.cn/);
});

test('search_auto falls through weak Chinese sports results and uses later engines', async (t) => {
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
            <h3>
              <a href="https://mp.weixin.qq.com/s?foo=1">2026 赛季 NBA 总冠军花落谁家?</a>
            </h3>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }
    if (href.startsWith('https://cn.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <ol id="b_results">
              <li class="b_algo">
                <h2><a href="https://sports.qq.com/nba/finals-2026-status">2026 年 NBA 总决赛最新情况</a></h2>
                <p>总决赛赛程、比分与球队动态更新。</p>
              </li>
            </ol>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4.44,
    method: 'tools/call',
    params: {
      name: 'search_auto',
      arguments: {
        query: '2026 年 NBA 总决赛情况',
        limit: 3,
        engines: ['sogou', 'bing_cn']
      }
    }
  });

  assert.equal(payload.error, undefined, JSON.stringify(payload, null, 2));
  const structured = payload.result.structuredContent;
  assert.equal(structured.source, 'bing_cn');
  assert.equal(structured.attempts.length, 2);
  assert.equal(structured.attempts[0].engine, 'sogou');
  assert.equal(structured.attempts[0].error, undefined, JSON.stringify(payload, null, 2));
  assert.equal(structured.attempts[0].quality_status, 'yellow');
  assert.equal(structured.attempts[1].engine, 'bing_cn');
  assert.equal(structured.results[0].url, 'https://sports.qq.com/nba/finals-2026-status');
});


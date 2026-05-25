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

test('search_xiaohongshu is no longer callable after the Xiaohongshu chain removal', async () => {
  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 0,
    method: 'tools/call',
    params: {
      name: 'search_xiaohongshu',
      arguments: {
        query: 'Claude Code',
        limit: 1
      }
    }
  });

  assert.equal(payload.error?.code, -32000);
  assert.match(String(payload.error?.message || ''), /search_xiaohongshu/i);
});

test('search_bbc ranks article pages ahead of topic and homepage style results', async (t) => {
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
            <a href="https://www.bbc.com/news">BBC News</a>
            <a href="https://www.bbc.com/news/topics/cx2pk70323et">AI topic hub</a>
            <a href="https://www.bbc.com/news/articles/cn42z47xv50o">Claude Code adoption rises</a>
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
      name: 'search_bbc',
      arguments: {
        query: 'claude code',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.bbc.com/news/articles/cn42z47xv50o');
});

test('search_bing_news drops generic news landing pages when an article result is present', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.bing.com/news/search?q=')) {
      return new Response(`
        <rss>
          <channel>
            <item>
              <title>Technology News</title>
              <link>https://www.bing.com/news</link>
            </item>
            <item>
              <title>Claude Code expands into enterprise teams</title>
              <link>https://www.example.com/news/claude-code-enterprise</link>
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
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_bing_news',
      arguments: {
        query: 'claude code',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bing_news');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.example.com/news/claude-code-enterprise');
});

test('search_reddit fallback keeps thread pages ahead of subreddit listing pages for Chinese queries', async (t) => {
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

    if (href.startsWith('https://noai.duckduckgo.com/?q=')) {
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
            <a rel="nofollow" href="https://www.reddit.com/r/ClaudeAI/">ClaudeAI subreddit</a>
            <a rel="nofollow" href="https://www.reddit.com/r/ClaudeAI/top/">Top posts</a>
            <a rel="nofollow" href="https://www.reddit.com/r/ClaudeAI/comments/abc123/claude_code_中文体验/">Claude Code 中文体验</a>
            <table><tr><td class="result-snippet">真实讨论帖。</td></tr></table>
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
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_reddit',
      arguments: {
        query: 'Claude Code 中文',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'reddit');
  assert.equal(structured.fallback_used, true);
  assert.equal(structured.results[0].url.includes('/r/ClaudeAI/comments/abc123/'), true);
});

test('search_stackoverflow ranks question pages ahead of tag and user pages', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://api.stackexchange.com/2.3/search/advanced?')) {
      return Response.json({
        items: [
          {
            title: '[python-asyncio] Questions tagged [python-asyncio]',
            link: 'https://stackoverflow.com/questions/tagged/python-asyncio',
            score: 10,
            answer_count: 0,
            tags: ['python-asyncio']
          },
          {
            title: 'How do async context managers work in Python?',
            link: 'https://stackoverflow.com/questions/12345/how-do-async-context-managers-work-in-python',
            score: 20,
            answer_count: 4,
            tags: ['python', 'async-await']
          },
          {
            title: 'User profile for async expert',
            link: 'https://stackoverflow.com/users/42/async-expert',
            score: 15,
            answer_count: 0,
            tags: []
          }
        ]
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_stackoverflow',
      arguments: {
        query: 'python async context manager',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'stackoverflow');
  assert.equal(
    structured.results[0].url,
    'https://stackoverflow.com/questions/12345/how-do-async-context-managers-work-in-python'
  );
});

test('search_wikipedia ranks a concrete article ahead of disambiguation-like entries', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://en.wikipedia.org/w/api.php?')) {
      return Response.json({
        query: {
          search: [
            {
              title: 'Mercury',
              snippet: 'Mercury may refer to many things.'
            },
            {
              title: 'Mercury (planet)',
              snippet: 'Mercury is the smallest planet in the Solar System.'
            }
          ]
        }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'search_wikipedia',
      arguments: {
        query: 'Mercury planet',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'wikipedia');
  assert.equal(structured.results[0].url, 'https://en.wikipedia.org/wiki/Mercury_(planet)');
});

test('search_bbc keeps scanning past many navigation links to reach later article results in live page shape', async (t) => {
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
            <a href="https://www.bbc.co.uk/accessibility/">Accessibility Help</a>
            <a href="https://www.bbc.com/news">News</a>
            <a href="https://www.bbc.com/sport">Sport</a>
            <a href="https://www.bbc.com/future/earth">Earth</a>
            <a href="https://www.bbc.com/reel">Reel</a>
            <a href="https://www.bbc.com/worklife">Worklife</a>
            <a href="https://www.bbc.com/travel">Travel</a>
            <a href="https://www.bbc.com/culture">Culture</a>
            <a href="https://www.bbc.com/future">Future</a>
            <a href="https://www.bbc.com/culture/music">Music</a>
            <a href="https://www.bbc.co.uk/schedules/p00fzl9m">TV</a>
            <a href="https://www.bbc.com/weather">Weather</a>
            <a href="https://www.bbc.co.uk/sounds">Sounds</a>
            <a href="https://www.bbc.co.uk/news/articles/ce8l2q5yq51o">Claude Code users hitting usage limits 'way faster than expected'</a>
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
      name: 'search_bbc',
      arguments: {
        query: 'Claude Code',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'bbc');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.bbc.co.uk/news/articles/ce8l2q5yq51o');
});

test('search_sina_news falls back when the live endpoint only returns a JS shell page', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.sina.com.cn/?q=')) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>新浪搜索</title>
            <script type="module" src="/assets/index.js"></script>
          </head>
          <body>
            <div id="app"></div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.sogou.com/web?query=')) {
      return new Response(`
        <html>
          <body>
            <h3><a href="https://news.sina.com.cn/c/2026-05-24/doc-ikqciyzk1234567.shtml">Claude Code 进入企业开发流</a></h3>
            <h3><a href="https://news.sina.com.cn/china/">国内频道</a></h3>
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
      name: 'search_sina_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sina_news');
  assert.equal(structured.strategy, 'site-targeted-fallback');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://news.sina.com.cn/c/2026-05-24/doc-ikqciyzk1234567.shtml');
});

test('search_163_news skips blocked Sogou fallback pages and continues to a later engine result', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://so.163.com/search?keyword=')) {
      return new Response('upstream unavailable', {
        status: 526,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.sogou.com/web?query=')) {
      return new Response(`
        <!DOCTYPE HTML>
        <html>
          <head><title>搜狗搜索</title></head>
          <body>
            <p>此验证码用于确认这些请求是您的正常行为而不是自动程序发出的，需要您协助验证。</p>
            <a href="/">返回首页&gt;&gt;</a>
            <a href="https://fankui.sogou.com/index.php/web/web/index?type=10">意见反馈</a>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <li class="b_algo">
              <h2><a href="https://www.163.com/news/article/J2ABCDEF0001899O.html">企业开发流观察</a></h2>
              <p>Claude Code 中文相关报道。</p>
            </li>
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
      name: 'search_163_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, '163_news');
  assert.equal(structured.strategy, 'site-targeted-fallback');
  assert.equal(structured.fetch_path, 'bing');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.163.com/news/article/J2ABCDEF0001899O.html');
});


test('search_sina_news uses Sina official news API and ranks article results ahead of channel pages', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.sina.com.cn/api/news?q=')) {
      return Response.json({
        code: 0,
        message: 'success',
        data: {
          list: [
            {
              title: 'Claude Code 中文频道',
              url: 'https://news.sina.com.cn/china/',
              searchSummary: '频道页标题里带完整关键词。',
              docType: 'news'
            },
            {
              title: '对标Claude Code！DeepSeek新业务招人了',
              url: 'https://finance.sina.com.cn/jjxw/2026-05-21/doc-inhyqyvv6527208.shtml',
              searchSummary: '中文新闻正文候选。',
              docType: 'news'
            },
            {
              title: 'Claude Code - 新浪搜索',
              url: 'https://search.sina.com.cn/?q=Claude%20Code%20%E4%B8%AD%E6%96%87',
              searchSummary: '站内搜索页。',
              docType: 'news'
            }
          ]
        }
      });
    }

    throw new Error(`unexpected url: ${href}`);
  };

  const payload = await jsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'search_sina_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sina_news');
  assert.equal(structured.strategy, undefined);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://finance.sina.com.cn/jjxw/2026-05-21/doc-inhyqyvv6527208.shtml');
});

test('search_163_news parses 163 official search HTML and keeps article results ahead of channel pages', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.163.com/search?keyword=')) {
      return new Response(`
        <html>
          <body>
            <div class="keyword_list">
              <div class="keyword_new keyword_new_simple">
                <h3><a href="https://www.163.com/dy/article/KTJ1GUME0550A7YJ.html">Anthropic推<em>Claude Code</em>新范式</a></h3>
                <div class="keyword_source">ZAKER科技</div>
                <div class="keyword_time">2026-05-23</div>
              </div>
              <div class="keyword_new keyword_new_simple">
                <h3><a href="https://www.163.com/news/">网易新闻</a></h3>
                <div class="keyword_source">频道页</div>
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
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_163_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, '163_news');
  assert.equal(structured.strategy, undefined);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.163.com/dy/article/KTJ1GUME0550A7YJ.html');
});


test('search_163_news keeps real article paths ahead of topic pages even when the topic page has a stronger exact phrase match', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://www.163.com/search?keyword=')) {
      return new Response(`
        <html>
          <body>
            <div class="keyword_list">
              <div class="keyword_new keyword_new_simple">
                <h3><a href="https://www.163.com/special/claude-code/">Claude Code 中文专题</a></h3>
                <div class="keyword_source">专题页</div>
                <div class="keyword_time">2026-05-24</div>
              </div>
              <div class="keyword_new keyword_new_simple">
                <h3><a href="https://www.163.com/tech/article/KTJ1GUME0550A7YJ.html">Anthropic 推 Claude Code 新范式</a></h3>
                <div class="keyword_source">网易科技</div>
                <div class="keyword_time">2026-05-23</div>
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
    id: 13,
    method: 'tools/call',
    params: {
      name: 'search_163_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, '163_news');
  assert.equal(structured.strategy, undefined);
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://www.163.com/tech/article/KTJ1GUME0550A7YJ.html');
});


test('search_sina_news site-targeted fallback keeps real Sina article hosts beyond news.sina.com.cn', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.sina.com.cn/api/news?q=')) {
      throw new Error('api unavailable');
    }

    if (href.startsWith('https://www.sogou.com/web?query=')) {
      return new Response(`
        <html>
          <body>
            <h3><a href="https://news.sina.com.cn/china/">Claude Code 中文频道</a></h3>
            <h3><a href="https://finance.sina.com.cn/jjxw/2026-05-24/doc-inhyqyvv9999999.shtml">Claude Code 中文落地观察</a></h3>
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
    id: 14,
    method: 'tools/call',
    params: {
      name: 'search_sina_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 2
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sina_news');
  assert.equal(structured.strategy, 'site-targeted-fallback');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://finance.sina.com.cn/jjxw/2026-05-24/doc-inhyqyvv9999999.shtml');
});


test('search_sina_news skips blocked Sogou fallback pages and continues to a later engine result', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith('https://search.sina.com.cn/?q=')) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>新浪搜索</title>
            <script type="module" src="/assets/index.js"></script>
          </head>
          <body>
            <div id="app"></div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://www.sogou.com/web?query=')) {
      return new Response(`
        <!DOCTYPE HTML>
        <html>
          <head><title>搜狗搜索</title></head>
          <body>
            <p>此验证码用于确认这些请求是您的正常行为而不是自动程序发出的，需要您协助验证。</p>
            <a href="/">返回首页&gt;&gt;</a>
            <a href="https://fankui.sogou.com/index.php/web/web/index?type=10">意见反馈</a>
          </body>
        </html>
      `, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        url: href
      });
    }

    if (href.startsWith('https://www.bing.com/search?')) {
      return new Response(`
        <html>
          <body>
            <li class="b_algo">
              <h2><a href="https://news.sina.com.cn/c/2026-05-24/doc-ikqciyzk7654321.shtml">企业开发流观察</a></h2>
              <p>Claude Code 中文相关报道。</p>
            </li>
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
    id: 9,
    method: 'tools/call',
    params: {
      name: 'search_sina_news',
      arguments: {
        query: 'Claude Code 中文',
        limit: 3
      }
    }
  });

  const structured = payload.result.structuredContent;
  assert.equal(structured.ok, true);
  assert.equal(structured.source, 'sina_news');
  assert.equal(structured.strategy, 'site-targeted-fallback');
  assert.equal(structured.fetch_path, 'bing');
  assert.equal(structured.results.length, 1);
  assert.equal(structured.results[0].url, 'https://news.sina.com.cn/c/2026-05-24/doc-ikqciyzk7654321.shtml');
});




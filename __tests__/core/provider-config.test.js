import test from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDER_DEFAULTS } from '../../src/core/provider-defaults.js';
import { getProviderConfig, headerValue, maskSecret, resolveProviderConfig } from '../../src/core/provider-config.js';
import { createRequestContext } from '../../src/core/request-context.js';

function makeRequest(headers = {}) {
  return {
    headers: {
      get(name) {
        const exact = headers[name];
        if (exact !== undefined) return exact;
        return headers[name.toLowerCase()] ?? '';
      }
    }
  };
}

test('maskSecret hides short and long secrets', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret('12345678'), '****');
  assert.equal(maskSecret('abcdefghijklmnop'), 'abcd****mnop');
});

test('headerValue reads exact and lowercase header names', () => {
  const request = makeRequest({ 'X-Test': 'A', 'x-lower': 'B' });
  assert.equal(headerValue(request, 'X-Test'), 'A');
  assert.equal(headerValue(request, 'X-Lower'), 'B');
  assert.equal(headerValue(request, 'X-Missing'), '');
});

test('resolveProviderConfig keeps defaults without headers', () => {
  const config = resolveProviderConfig(makeRequest());
  assert.deepEqual(config.bing, PROVIDER_DEFAULTS.bing);
  assert.equal(config.ollama.baseUrl, 'https://api.ollama.com/v1/web-search');
  assert.equal(config.parallel.enabled, true);
});

test('resolveProviderConfig applies api key, base url, and enabled overrides', () => {
  const config = resolveProviderConfig(makeRequest({
    'x-ollama-api-key': 'secret',
    'x-ollama-base-url': 'https://example.test/search',
    'x-ollama-enabled': 'false',
    'x-bing-enabled': 'true'
  }));

  assert.deepEqual(config.ollama, {
    apiKey: 'secret',
    baseUrl: 'https://example.test/search',
    enabled: false
  });
  assert.equal(config.bing.enabled, true);
});

test('getProviderConfig is case-insensitive and createRequestContext resolves provider config', () => {
  const request = makeRequest({ 'x-parallel-api-key': 'parallel-key' });
  const context = createRequestContext(request);

  assert.equal(getProviderConfig(context.providerConfig, 'PARALLEL').apiKey, 'parallel-key');
  assert.equal(context.request, request);
});

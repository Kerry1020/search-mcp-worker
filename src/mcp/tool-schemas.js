export function querySchema(extra = {}) {
  const properties = {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Maximum results, default 5, max 10' }
  };

  if (extra.region) {
    properties.region = { type: 'string', description: 'DuckDuckGo region, default us-en' };
  }

  if (extra.language) {
    properties.language = { type: 'string', description: 'Search language code, default en' };
  }

  if (extra.autoMode) {
    properties.auto_mode = {
      type: 'string',
      description: 'Auto aggregation mode: default uses intent-aware engines; full fans out across all enabled public search engines before reranking.'
    };
  }

  if (extra.engines) {
    properties.engines = {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional engine order: duckduckgo, bing, yahoo, google, yandex, baidu, naver, sogou, wikipedia, arxiv, pubmed, hackernews, stackoverflow, reddit, npm, devto, mastodon, peertube, bbc, bing_news, archive, paperswithcode, sec_edgar, osm, lemmy, wikidata, crates, pypi, ollama, xiaohongshu'
    };
  }

  return { type: 'object', properties, required: ['query'] };
}

export function providerConfigSchema({ provider, needsApiKey = true, needsBaseUrl = false, note = '' }) {
  const properties = {
    enabled: { type: 'boolean', description: note || `Enable/disable ${provider}`, default: true }
  };

  if (needsApiKey) {
    properties.api_key = { type: 'string', description: `${provider} API key` };
  }

  if (needsBaseUrl) {
    properties.base_url = { type: 'string', description: `${provider} base URL` };
  }

  const required = [];
  if (needsApiKey) {
    required.push('api_key');
  }

  return { type: 'object', properties, required };
}

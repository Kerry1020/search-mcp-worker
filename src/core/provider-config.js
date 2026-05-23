import { PROVIDER_DEFAULTS } from './provider-defaults.js';

export function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

export function headerValue(request, key) {
  try {
    return request?.headers?.get?.(key) || request?.headers?.get?.(key.toLowerCase()) || '';
  } catch {
    return '';
  }
}

export function resolveProviderConfig(request, baseConfig = PROVIDER_DEFAULTS) {
  const resolved = {};
  for (const [name, defaults] of Object.entries(baseConfig)) {
    const apiKey = headerValue(request, `x-${name}-api-key`) || defaults.apiKey || '';
    const baseUrl = headerValue(request, `x-${name}-base-url`) || defaults.baseUrl || '';
    const enabledHeader = headerValue(request, `x-${name}-enabled`);
    const enabled = enabledHeader === '' ? defaults.enabled : enabledHeader !== 'false';
    resolved[name] = { apiKey, baseUrl, enabled };
  }
  return resolved;
}

export function getProviderConfig(config, name) {
  return config[String(name || '').toLowerCase()] || null;
}

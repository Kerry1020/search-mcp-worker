import { resolveProviderConfig } from './provider-config.js';

export function createRequestContext(request) {
  return {
    request,
    providerConfig: resolveProviderConfig(request)
  };
}

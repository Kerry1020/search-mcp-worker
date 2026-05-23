export function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function sanitizeForJson(value) {
  if (typeof value === 'string') {
    return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForJson);
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = sanitizeForJson(nested);
    }
    return out;
  }

  return value;
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(sanitizeForJson(value)), { status, headers });
}

export function jsonRpcError(id, code, message, status, headers = {}) {
  return json(rpcError(id, code, message), status, headers);
}

export async function handleJsonRpc(message, context, { serverName, serverVersion, tools, callTool }) {
  const id = message?.id ?? null;

  try {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return rpcError(id, -32600, 'invalid request');
    }

    switch (message.method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: serverName, version: serverVersion }
        });
      case 'notifications/initialized':
        return undefined;
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools });
      case 'tools/call':
        return rpcResult(id, await callTool(message.params, context));
      default:
        return rpcError(id, -32601, `method not found: ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32000, error?.message || 'internal error');
  }
}

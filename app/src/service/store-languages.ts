import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from './admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from './admin-request-headers';

const contentType = 'application/json; charset=utf-8';
const visibleResponseHeaders = new Set(['content-type', 'content-length', 'date', 'server', 'cf-ray', 'x-request-id', 'traceid', 'x-trace-id', 'x-shopline-trace-id']);

function safeHeaderValue(name: string, value: string | null | undefined): string {
  if (!visibleResponseHeaders.has(name.toLowerCase()) || !value || !/^[\x20-\x7e]{1,128}$/.test(value)) return '[REDACTED]';
  return value;
}

async function summarizeErrorBody(response: Awaited<ReturnType<typeof fetch>>, accessToken: string): Promise<Record<string, unknown> | undefined> {
  const type = response.headers?.get('content-type')?.toLowerCase() ?? '';
  if (!/\b(?:json|html)\b/.test(type) || typeof response.text !== 'function') return undefined;
  const length = Number(response.headers?.get('content-length'));
  if (Number.isFinite(length) && length > 16_384) return { kind: type.includes('html') ? 'html' : 'json', omitted: 'body exceeds diagnostic limit' };
  try {
    const body = (await response.text()).slice(0, 16_384);
    const clean = (value: string) => value.split(accessToken).join('[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/[\r\n\t]/g, ' ').slice(0, 256);
    if (type.includes('html')) {
      const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
      return { kind: 'html', ...(title ? { title: clean(title) } : {}) };
    }
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const summary: Record<string, unknown> = { kind: 'json' };
    for (const key of ['code', 'error', 'message', 'traceId']) {
      if (typeof parsed[key] === 'string') summary[key] = clean(parsed[key]);
      else if (typeof parsed[key] === 'number') summary[key] = parsed[key];
    }
    return summary;
  } catch {
    return { kind: type.includes('html') ? 'html' : 'json', omitted: 'body could not be summarized' };
  }
}

export async function loadStoreLanguages(handle: string, accessToken: string, fetcher: typeof fetch = fetch, requestId?: string): Promise<{ defaultLanguage: string; languages: string[] }> {
  if (!/^[a-zA-Z0-9-]+$/.test(handle) || !accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  const url = `https://${handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}/store/languages.json`;
  if (requestId) console.info('Store languages trace', {
    requestId, stage: 'upstream_request', endpoint: '/store/languages.json', version: ADMIN_REST_VERSION,
    method: 'GET', url,
    requestHeaders: { Authorization: 'Bearer [REDACTED]', 'Content-Type': contentType, Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT },
    curl: `curl --request GET '${url}' -H 'Authorization: Bearer [REDACTED]' -H 'Content-Type: ${contentType}' -H 'Accept: ${SHOPLINE_ACCEPT}' -H 'User-Agent: ${SHOPLINE_USER_AGENT}'`,
  });
  const startedAt = Date.now();
  let response;
  try {
    response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType, Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT }, size: 65_536 });
  } catch (error) {
    if (requestId) console.error('Store languages trace', { requestId, stage: 'upstream_network_error', durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
    throw error;
  }
  const durationMs = Date.now() - startedAt;
  if (requestId) {
    const rawTraceId = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((name) => response.headers?.get(name)).find(Boolean);
    const traceId = rawTraceId && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTraceId) ? rawTraceId : null;
    const traceHeaderNames = response.headers?.keys ? [...response.headers.keys()].filter((name) => /^(?:x-)?(?:shopline-)?trace-?id$/i.test(name)) : [];
    const diagnosticHeaders: Record<string, string> = {};
    for (const name of ['content-type', 'cf-ray', 'x-request-id']) {
      const header = response.headers?.get(name);
      if (header && /^[\x20-\x7e]{1,128}$/.test(header)) diagnosticHeaders[name] = header;
    }
    const responseHeaders: Record<string, string> = {};
    if (response.headers?.keys) {
      for (const name of response.headers.keys()) responseHeaders[name] = safeHeaderValue(name, response.headers.get(name));
    }
    const responseBody = !response.ok ? await summarizeErrorBody(response, accessToken) : undefined;
    console.info('Store languages trace', { requestId, stage: 'upstream_response', status: response.status, statusText: response.statusText, durationMs, traceId, traceHeaderPresent: Boolean(rawTraceId), traceHeaderNames, diagnosticHeaders, responseHeaders, ...(responseBody ? { responseBody } : {}) });
  }
  if (!response.ok) throw new Error(`SHOPLINE languages API returned ${response.status}.`);
  const body = await response.json() as { data?: { default_language?: string; supported_languages?: string[] }; languages?: { default_language?: string; supported_languages?: string[] } };
  const languageData = body.languages ?? body.data;
  const languages = [...new Set(languageData?.supported_languages ?? [])];
  if (!languages.length || languages.some((code) => !code || typeof code !== 'string')) throw new Error('Storefront language list is empty or invalid.');
  if (!languageData?.default_language || !languages.includes(languageData.default_language)) throw new Error('Store default language is missing from enabled languages.');
  const result = { defaultLanguage: languageData.default_language, languages };
  if (requestId) console.info('Store languages trace', { requestId, stage: 'upstream_data', responseData: result });
  return result;
}

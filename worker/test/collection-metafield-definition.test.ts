import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeCollectionVariables } from '../src/services/collection-publication';

const session = { handle: 'demo', accessToken: 'access', scope: 'write_discounts' };
const namespace = 'app--103645--quantity-breaks';
const definition = { id: 12345, namespace, key: 'collection-membership', owner_resource: 'shop', type: 'json', name: 'Existing name', access: { admin: 'PRIVATE' } };

function platform(options: { missing?: boolean; access?: string; readback?: Record<string, unknown>; rejected?: boolean; invalidType?: boolean; definitionList?: unknown } = {}) {
  let savedDefinition = options.missing ? null : { ...definition, type: options.invalidType ? 'single_line_text_field' : 'json', access: { admin: options.access ?? 'PRIVATE' } };
  let field: Record<string, unknown> = {};
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/metafields_set.json')) {
      field = { ...JSON.parse(String(init?.body)).metafields[0], namespace, owner_resource: 'shop' };
      return Response.json({ metafields: [field] });
    }
    if (url.pathname.endsWith('/metafields.json')) return Response.json({ metafields: [field] });
    if (url.pathname.endsWith('/metafield_definitions.json')) {
      return Response.json({ data: { metafield_definitions: options.definitionList !== undefined ? options.definitionList : savedDefinition ? [savedDefinition] : [] } });
    }
    if (url.pathname.endsWith('/metafield_definition.json')) {
      if (init?.method === 'POST' || init?.method === 'PUT') {
        if (options.rejected) return Response.json({ errors: 'Permission denied', access_token: 'must-not-leak' }, { status: 403, headers: { Traceid: 'definition-rejected' } });
        savedDefinition = { ...definition, ...savedDefinition, ...JSON.parse(String(init.body)).definition, namespace, owner_resource: 'shop' };
        return Response.json({ definition: savedDefinition });
      }
      return Response.json({ definition: { ...savedDefinition, ...options.readback } }, { headers: { Traceid: 'definition-readback' } });
    }
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function definitionWrites(fetcher: ReturnType<typeof platform>) {
  return fetcher.mock.calls.filter(([input, init]) => String(input).includes('/metafield_definition.json') && (init?.method === 'POST' || init?.method === 'PUT'));
}

describe('collection metafield definition access', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('creates the missing Shop definition with MERCHANT_READ and confirms its permission', async () => {
    const fetcher = platform({ missing: true });
    await writeCollectionVariables(session, '42', ['c1']);
    expect(definitionWrites(fetcher)).toHaveLength(1);
    const [input, init] = definitionWrites(fetcher)[0];
    expect(String(input)).toBe('https://demo.myshopline.com/admin/openapi/v20260901/metafield_definition.json');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ definition: {
      namespace: '$app:quantity-breaks', key: 'collection-membership', owner_resource: 'shop', type: 'json', access: { admin: 'MERCHANT_READ' },
    } });
    const field = JSON.parse(String(fetcher.mock.calls[0][1]?.body)).metafields[0];
    expect(field).toMatchObject({ owner_resource: 'shop', value: '{"inCollections":["c1"]}' });
    expect(field).not.toHaveProperty('access');
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/metafield_definition.json?id=12345'))).toBe(true);
    for (const [, request] of fetcher.mock.calls) {
      const headers = new Headers(request?.headers);
      expect(headers.get('Authorization')).toBe('Bearer access');
      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
    }
  });

  it('updates a PRIVATE definition in place without replacing its name or type', async () => {
    const fetcher = platform();
    await writeCollectionVariables(session, '42', ['c1']);
    expect(definitionWrites(fetcher)).toHaveLength(1);
    expect(definitionWrites(fetcher)[0][1]?.method).toBe('PUT');
    expect(JSON.parse(String(definitionWrites(fetcher)[0][1]?.body))).toEqual({ definition: {
      namespace: '$app:quantity-breaks', key: 'collection-membership', owner_resource: 'shop', access: { admin: 'MERCHANT_READ' },
    } });
  });

  it('uses the persisted namespace to check the Shop definition without repeating permission writes', async () => {
    const fetcher = platform({ access: 'MERCHANT_READ' });
    await writeCollectionVariables(session, '42', ['c1']);
    const listCall = fetcher.mock.calls.find(([input]) => String(input).includes('/metafield_definitions.json'));
    expect(listCall).toBeDefined();
    const query = new URL(String(listCall![0])).searchParams;
    expect(query.get('namespace')).toBe(namespace);
    expect(query.get('key')).toBe('collection-membership');
    expect(query.get('owner_resource')).toBe('shop');
    expect(definitionWrites(fetcher)).toHaveLength(0);
  });

  it.each([
    { access: { admin: 'PRIVATE' } },
    { namespace: 'another-app' },
    { owner_resource: 'products' },
    { id: 67890 },
  ])('rejects an unconfirmed definition readback: %j', async (readback) => {
    platform({ readback });
    await expect(writeCollectionVariables(session, '42', ['c1'])).rejects.toMatchObject({
      diagnosticCode: 'COLLECTION_METAFIELD_DEFINITION_UNCONFIRMED', metadata: { upstreamRequestId: 'definition-readback' },
    });
  });

  it('does not overwrite a definition with an incompatible data type', async () => {
    const fetcher = platform({ invalidType: true });
    await expect(writeCollectionVariables(session, '42', ['c1'])).rejects.toThrow(/definition/);
    expect(definitionWrites(fetcher)).toHaveLength(0);
  });

  it.each([null, [null], [definition, definition]])('does not create or update definitions after an invalid list: %j', async (definitionList) => {
    const fetcher = platform({ definitionList });
    await expect(writeCollectionVariables(session, '42', ['c1'])).rejects.toThrow(/definition/);
    expect(definitionWrites(fetcher)).toHaveLength(0);
  });

  it('retains the permission failure response and TraceID with credentials redacted', async () => {
    platform({ rejected: true });
    const failure = await writeCollectionVariables(session, '42', ['c1']).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ metadata: {
      upstreamStatus: 403, upstreamRequestId: 'definition-rejected', upstreamPath: '/admin/openapi/v20260901/metafield_definition.json',
      upstreamResponseBody: expect.stringContaining('Permission denied'),
    } });
    expect(JSON.stringify(failure)).not.toContain('must-not-leak');
  });
});

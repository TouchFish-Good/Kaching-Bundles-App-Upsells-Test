import type { AuthContext } from '../auth/session';
import { diagnosticResponseBody } from '../observability/diagnostic-response';
import { DiscountRejectedError, DiscountUncertainError, type ShoplineRequestMetadata } from './discounts';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

export const COLLECTION_VARIABLE_NAMESPACE = '$app:quantity-breaks';
export const COLLECTION_VARIABLE_KEY = 'collection-membership';
const VERSION = 'v20260901';

type Definition = {
  id?: unknown; namespace?: unknown; key?: unknown; owner_resource?: unknown; type?: unknown;
  access?: { admin?: unknown };
};
type DefinitionResponse = { definition?: Definition; data?: { metafield_definitions?: Definition[] } };

function unconfirmed(metadata: ShoplineRequestMetadata): DiscountUncertainError {
  return new DiscountUncertainError('SHOPLINE collection metafield definition permission was not confirmed.', metadata, 'COLLECTION_METAFIELD_DEFINITION_UNCONFIRMED');
}

async function request(session: AuthContext, path: string, init: RequestInit = {}): Promise<{ body: DefinitionResponse; metadata: ShoplineRequestMetadata }> {
  const upstreamPath = `/admin/openapi/${VERSION}${path.split('?')[0]}`;
  let response: Response;
  try {
    response = await fetch(`https://${session.handle}.myshopline.com/admin/openapi/${VERSION}${path}`, {
      ...init, headers: shoplineAdminHeaders(session.accessToken),
    });
  } catch {
    throw unconfirmed({ upstreamStatus: 0, upstreamRequestId: null, upstreamPath });
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  const metadata: ShoplineRequestMetadata = {
    upstreamStatus: response.status, upstreamRequestId: response.headers.get('Traceid'), upstreamPath,
    upstreamResponseBody: diagnosticResponseBody(payload),
  };
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new DiscountRejectedError('SHOPLINE collection metafield definition permission was rejected.', metadata);
    }
    throw unconfirmed(metadata);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw unconfirmed(metadata);
  return { body: payload as DefinitionResponse, metadata };
}

function matches(definition: Definition | undefined, namespace: string): definition is Definition & { id: string | number } {
  return Boolean(definition && /^\d+$/.test(String(definition.id)) && definition.namespace === namespace
    && definition.key === COLLECTION_VARIABLE_KEY && String(definition.owner_resource).toLowerCase() === 'shop' && definition.type === 'json');
}

/** Make the app-owned Shop definition readable without granting merchants write access. */
export async function ensureCollectionMetafieldDefinition(session: AuthContext, persistedNamespace: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(session.handle) || !session.accessToken || !persistedNamespace) throw new Error('An authenticated SHOPLINE shop and persisted namespace are required.');
  const query = new URLSearchParams({ namespace: persistedNamespace, key: COLLECTION_VARIABLE_KEY, owner_resource: 'shop', limit: '2' });
  const listed = await request(session, `/metafield_definitions.json?${query}`);
  const definitions = listed.body.data?.metafield_definitions;
  if (!Array.isArray(definitions) || definitions.length > 1) throw unconfirmed(listed.metadata);
  const existing = definitions[0];
  if (definitions.length === 1 && !matches(existing, persistedNamespace)) throw unconfirmed(listed.metadata);
  if (existing?.access?.admin === 'MERCHANT_READ') return;

  const identity = { namespace: COLLECTION_VARIABLE_NAMESPACE, key: COLLECTION_VARIABLE_KEY, owner_resource: 'shop' };
  const definition = existing
    ? { ...identity, access: { admin: 'MERCHANT_READ' } }
    : { ...identity, name: 'Quantity Breaks collection membership', type: 'json', description: 'Quantity Breaks collection membership variables', access: { admin: 'MERCHANT_READ' } };
  const written = await request(session, '/metafield_definition.json', {
    method: existing ? 'PUT' : 'POST', body: JSON.stringify({ definition }),
  });
  const accepted = written.body.definition;
  if (!matches(accepted, persistedNamespace) || accepted.access?.admin !== 'MERCHANT_READ'
    || (existing && String(accepted.id) !== String(existing.id))) throw unconfirmed(written.metadata);
  const readback = await request(session, `/metafield_definition.json?${new URLSearchParams({ id: String(accepted.id) })}`);
  const verified = readback.body.definition;
  if (!matches(verified, persistedNamespace) || String(verified.id) !== String(accepted.id) || verified.access?.admin !== 'MERCHANT_READ') {
    throw unconfirmed(readback.metadata);
  }
}

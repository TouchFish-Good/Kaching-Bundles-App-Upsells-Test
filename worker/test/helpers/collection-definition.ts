/** Existing readable definition for tests whose subject is campaign orchestration. */
export function readableCollectionDefinition(input: RequestInfo | URL): Response {
  const query = new URL(String(input)).searchParams;
  return Response.json({ data: { metafield_definitions: [{
    id: 12345, namespace: query.get('namespace'), key: 'collection-membership',
    owner_resource: 'shop', type: 'json', access: { admin: 'MERCHANT_READ' },
  }] } });
}

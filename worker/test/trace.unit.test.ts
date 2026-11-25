import { describe, expect, it } from 'vitest';

import { traceIdFromRequest } from '../src/observability/trace';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('application trace ids', () => {
  it('rejects an invalid incoming trace id and creates a UUID', () => {
    expect(traceIdFromRequest(new Request('https://app.test', { headers: { 'X-Trace-Id': 'not-a-uuid' } }))).toMatch(UUID_PATTERN);
  });

  it('reuses a valid incoming trace id for the request', () => {
    const traceId = '550e8400-e29b-41d4-a716-446655440000';
    const request = new Request('https://app.test', { headers: { 'X-Trace-Id': traceId } });
    expect(traceIdFromRequest(request)).toBe(traceId);
    expect(traceIdFromRequest(request)).toBe(traceId);
  });
});

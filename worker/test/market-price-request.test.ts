import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketPriceRequest } from '../src/services/market-price-request';

afterEach(() => vi.useRealTimers());
describe('preview market price request pacing', () => {
  it('spaces starts for the same store but allows another store through', async () => {
    vi.useFakeTimers();
    const starts: Array<[string, number]> = [];
    const request = createMarketPriceRequest(async (url) => {
      starts.push([new URL(String(url)).hostname, Date.now()]);
      return Response.json({ market_prices: [] });
    });
    const session = { handle: 'one', accessToken: 'secret' };
    const first = request(session, '/markets/v1/price.json');
    const second = request(session, '/markets/v2/price.json');
    const other = request({ ...session, handle: 'two' }, '/markets/v3/price.json');
    await vi.advanceTimersByTimeAsync(0);
    expect(starts.map(([host]) => host)).toEqual(['one.myshopline.com', 'two.myshopline.com']);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([first, second, other]);
    expect(starts[2][1] - starts[0][1]).toBeGreaterThanOrEqual(500);
  });

  it('waits for Retry-After and resumes queued requests after the cooldown', async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const request = createMarketPriceRequest(async () => {
      starts.push(Date.now());
      return starts.length === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : Response.json({ market_prices: [] });
    });
    const result = request({ handle: 'one', accessToken: 'secret' }, '/markets/v1/price.json');
    await vi.advanceTimersByTimeAsync(1999);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).status).toBe(200);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2000);
  });

  it('times out a stalled upstream request instead of blocking prices indefinitely', async () => {
    vi.useFakeTimers();
    let failure: string | undefined;
    const request = createMarketPriceRequest(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    void request({ handle: 'one', accessToken: 'secret' }, '/markets/stalled/price.json').catch(error => { failure = error.name; });
    await vi.advanceTimersByTimeAsync(8000);
    expect(failure).toBe('TimeoutError');
  });

  it('bounds retries and cancels a queued lookup before sending it', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const request = createMarketPriceRequest(async () => { calls++; return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }); });
    const controller = new AbortController();
    const queued = request({ handle: 'one', accessToken: 'secret' }, '/markets/old/price.json', controller.signal).catch(error => error.name);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await queued).toBe('AbortError');
    expect(calls).toBe(0);
    const result = request({ handle: 'one', accessToken: 'secret' }, '/markets/new/price.json');
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(429);
    expect(calls).toBe(3);
  });
});

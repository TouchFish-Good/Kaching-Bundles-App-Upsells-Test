import { currentTime, type Env } from '../env';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 600;
const MAX_FEEDBACK_REQUESTS = 60;

export async function requirePublicRateLimit(request: Request, env: Env): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
  const key = `${ip}:${new URL(request.url).pathname}`;
  const now = currentTime(env);
  const row = await env.DB.prepare('SELECT window_started_at, request_count, expires_at FROM public_rate_limits WHERE rate_limit_key = ?').bind(key).first<{ window_started_at: number; request_count: number; expires_at: number }>();
  if (!row || row.expires_at <= now) {
    await env.DB.prepare(`INSERT INTO public_rate_limits (rate_limit_key, window_started_at, request_count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(rate_limit_key) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, expires_at = excluded.expires_at`).bind(key, now, now + WINDOW_MS).run();
    return null;
  }
  if (row.request_count >= MAX_REQUESTS) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } });
  await env.DB.prepare('UPDATE public_rate_limits SET request_count = request_count + 1 WHERE rate_limit_key = ?').bind(key).run();
  return null;
}

export async function requireFeedbackRateLimit(database: D1Database, storeId: string, route: string, now: number): Promise<Response | null> {
  const key = `${storeId}:${route}`;
  const row = await database.prepare('SELECT request_count, expires_at FROM feedback_rate_limits WHERE rate_limit_key = ?').bind(key).first<{ request_count: number; expires_at: number }>();
  if (!row || row.expires_at <= now) {
    await database.prepare(`INSERT INTO feedback_rate_limits (rate_limit_key, window_started_at, request_count, expires_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(rate_limit_key) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, expires_at = excluded.expires_at`)
      .bind(key, now, now + WINDOW_MS).run();
    return null;
  }
  if (row.request_count >= MAX_FEEDBACK_REQUESTS) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } });
  await database.prepare('UPDATE feedback_rate_limits SET request_count = request_count + 1 WHERE rate_limit_key = ?').bind(key).run();
  return null;
}

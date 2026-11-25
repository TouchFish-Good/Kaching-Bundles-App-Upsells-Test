import type { Hono } from 'hono';
import { D1TranslationRepository } from '../db/translations';
import type { Env } from '../env';
import { requireShoplineSession } from '../auth/session';
import type { AuthContext } from '../auth/session';
import { requireSubscriptionAccess } from './subscription-access';

export function registerTranslationRoutes(app: Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>): void {
  app.get('/api/quantity-breaks/translations/:locale', async (c) => {
    const session = await requireShoplineSession(c.req.raw, c.env);
    if (session instanceof Response) return session;
    try {
      return c.json({ translations: await new D1TranslationRepository(c.env.DB).read(session.handle, c.req.param('locale')) });
    } catch {
      return c.json({ error: 'Translation data is unavailable.', requestId: crypto.randomUUID() }, 502);
    }
  });
  app.put('/api/quantity-breaks/translations/:locale', async (c) => {
    const session = await requireShoplineSession(c.req.raw, c.env);
    if (session instanceof Response) return session;
    const denied = await requireSubscriptionAccess(c.env.DB, c.env.SHOPLINE_APP_KEY, session.handle);
    if (denied) return denied;
    try {
      const copy = await c.req.json<Record<string, string>>();
      await new D1TranslationRepository(c.env.DB).write(session.handle, c.req.param('locale'), copy);
      return c.json({ translations: copy });
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Translation request failed.' }, 400); }
  });
}

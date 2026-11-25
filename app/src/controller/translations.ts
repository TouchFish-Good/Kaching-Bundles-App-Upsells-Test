import type { Request, Response } from 'express';
import type { TranslationRepository } from '../service/translations';
import { loadStoreLanguages } from '../service/store-languages';

type LanguageLoader = typeof loadStoreLanguages;
type TranslationStore = Pick<TranslationRepository, 'read' | 'write'>;

export function createTranslationsController(repository: TranslationStore, loadLanguages: LanguageLoader = loadStoreLanguages) {
  return async (request: Request, response: Response) => {
    const requestId = response.locals.quantityBreaksRequestId as string | undefined;
    const session = response.locals.shopline?.session;
    if (!session?.handle || !session?.accessToken) {
      response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
      return;
    }
    const locale = request.params.locale;
    let enabled: string[];
    try { enabled = (await loadLanguages(session.handle, session.accessToken)).languages; }
    catch (error) {
      if (requestId) console.error('Translation trace', { requestId, stage: 'language_verification_failed', category: 'UPSTREAM_OR_INVALID_RESPONSE', errorType: error instanceof Error ? error.name : 'Unknown' });
      response.status(502).json({ error: 'Storefront languages could not be verified.' });
      return;
    }
    if (!enabled.includes(locale)) {
      response.status(400).json({ error: `Language ${locale} is not enabled for this store.` });
      return;
    }
    try {
      if (request.method === 'GET') {
        response.json({ translations: await repository.read(session.handle, locale) });
        return;
      }
      const copy = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      await repository.write(session.handle, locale, copy);
      response.json({ translations: copy });
    } catch (error) {
      const message = (error as Error).message;
      if (requestId) console.error('Translation trace', { requestId, stage: request.method === 'GET' ? 'read_failed' : 'write_failed', category: error instanceof SyntaxError || /translation|placeholder|unknown/i.test(message) ? 'INVALID_INPUT' : 'STORAGE_ERROR', errorType: error instanceof Error ? error.name : 'Unknown' });
      response.status(error instanceof SyntaxError || /translation|placeholder|unknown/i.test(message) ? 400 : 500).json({ error: message });
    }
  };
}

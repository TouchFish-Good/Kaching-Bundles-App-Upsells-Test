import type { Request, Response } from 'express';
export function createShopIdentityController() {
  return async (_request: Request, response: Response) => {
    const session = response.locals.shopline?.session;
    if (!session?.handle || !session?.accessToken) {
      response.status(401).json({ error: 'AUTH_REQUIRED' });
      return;
    }
    response.json({ shop: { storeId: session.handle } });
  };
}

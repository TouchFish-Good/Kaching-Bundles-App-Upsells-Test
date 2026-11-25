import express from 'express';
import { join } from 'path';
import shopline from './shopline';
import { readFileSync } from 'fs';
import serveStatic from 'serve-static';
import { webhooksController } from './controller/webhook';
import createProductController from './controller/product/create';
import { adminRegistry, adminRegistryReady } from './admin-read';
import { createInternalRouter } from './admin-read/internal-api';
import { marketsController } from './controller/markets';
import { quantityBreaksTrace } from './controller/quantity-breaks-trace';
import { storeLanguagesController, storeLanguagesTrace } from './controller/store-languages';
import { createTranslationsController } from './controller/translations';
import { TranslationRepository } from './service/translations';
import { CampaignRepository } from './service/campaign/repository';
import { startCollectionConflictMonitor } from './service/campaign/collection-conflicts';
import { createCampaignsController } from './controller/campaigns';
import { campaignProductsController } from './controller/campaign-products';
import { campaignCollectionsController } from './controller/campaign-collections';
import { createShopIdentityController } from './controller/shop-identity';
import { createStorefrontCampaignController } from './controller/storefront-campaign';
import { createCurrentAdminSessionLoader } from './auth/admin-session';
import sqlite3 from 'sqlite3';

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

const app = express();
const campaignRepository = new CampaignRepository(new sqlite3.Database(`${process.cwd()}/quantity-breaks.sqlite`));
const translationRepository = new TranslationRepository(new sqlite3.Database(`${process.cwd()}/quantity-breaks.sqlite`));
const loadAdminSession = createCurrentAdminSessionLoader({
  loadSession: (id) => shopline.config.sessionStorage.loadSession(id),
  refreshToken: async (handle) => (await shopline.api.auth.refreshToken({ handle })).session,
  storeSession: (session) => shopline.config.sessionStorage.storeSession(session),
});
startCollectionConflictMonitor(campaignRepository, async (handle) => {
  const session = await loadAdminSession(handle);
  if (!session.accessToken) throw new Error('SHOPLINE offline Admin session is unavailable');
  return { handle: session.handle, accessToken: session.accessToken };
});

// Public data is limited to currently published, product-matching widget settings.
app.get('/public/quantity-breaks/campaign', createStorefrontCampaignController(campaignRepository, translationRepository));

app.use('/internal/admin-read/v1', async (_req, _res, next) => {
  try { await adminRegistryReady; next(); } catch (error) { next(error); }
}, createInternalRouter(adminRegistry, process.env.ADMIN_INTERNAL_SECRET || ''));

app.get(shopline.config.auth.path, shopline.auth.begin());

app.get(shopline.config.auth.callbackPath, shopline.auth.callback(), shopline.redirectToAppHome());
app.post('/api/webhooks', express.text({ type: '*/*' }), webhooksController());
app.use('/api/quantity-breaks', quantityBreaksTrace);
app.use('/api/quantity-breaks/store-languages', storeLanguagesTrace);

// api path for frontend/vite.config
app.use('/api/*', express.text({ type: '*/*' }), shopline.validateAuthentication(), async (_request, response, next) => {
  try {
    response.locals.shopline.session = await loadAdminSession(response.locals.shopline.session.handle);
    next();
  } catch (error) { next(error); }
});

app.get('/api/products/create', createProductController);
app.get('/api/quantity-breaks/markets', marketsController);
app.get('/api/quantity-breaks/products', campaignProductsController);
app.get('/api/quantity-breaks/collections', campaignCollectionsController);
app.get('/api/quantity-breaks/collections/:id/products', campaignCollectionsController);
app.get('/api/quantity-breaks/collections/:id', campaignCollectionsController);
app.get('/api/quantity-breaks/shop', createShopIdentityController());
app.get('/api/quantity-breaks/store-languages', storeLanguagesController);
const translationsController = createTranslationsController(translationRepository);
app.get('/api/quantity-breaks/translations/:locale', translationsController);
app.put('/api/quantity-breaks/translations/:locale', translationsController);
const campaignsController = createCampaignsController(campaignRepository);
app.get('/api/quantity-breaks/campaigns', campaignsController);
app.post('/api/quantity-breaks/campaigns', campaignsController);
app.get('/api/quantity-breaks/campaigns/:id', campaignsController);
app.put('/api/quantity-breaks/campaigns/:id', campaignsController);
app.delete('/api/quantity-breaks/campaigns/:id', campaignsController);
app.post('/api/quantity-breaks/campaigns/:id/status', campaignsController);
app.post('/api/quantity-breaks/campaigns/:id/end', campaignsController);

app.use(express.json());

app.use(shopline.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use('/*', shopline.confirmInstallationStatus(), async (_req, res, _next) => {
  return res
    .status(200)
    .set('Content-Type', 'text/html')
    .send(readFileSync(join(STATIC_PATH, 'index.html')));
});

app.listen(PORT);
console.log(PORT);

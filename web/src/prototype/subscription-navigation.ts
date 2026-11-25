import { ADMIN_SECTION, Redirect } from '@shoplineos/app-bridge';

type App = Parameters<typeof Redirect.create>[0];
type RedirectFactory = (app: App) => Pick<ReturnType<typeof Redirect.create>, 'toAdminPage'>;

export function openNativePackagePurchase(app: App, createRedirect: RedirectFactory = Redirect.create): void {
  if (!app.config.appKey) throw new Error('SHOPLINE app key is required for package purchase.');
  createRedirect(app).toAdminPage(ADMIN_SECTION.PACKAGE_PURCHASE, { appKey: app.config.appKey });
}

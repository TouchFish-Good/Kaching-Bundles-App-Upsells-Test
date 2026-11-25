import { D1SubscriptionRepository } from '../db/subscriptions';
import { hasSubscriptionAccess } from '../domain/entitlement-access';
export { hasSubscriptionAccess } from '../domain/entitlement-access';

export async function requireSubscriptionAccess(database: D1Database, appKey: string, handle: string): Promise<Response | null> {
  const entitlement = await new D1SubscriptionRepository(database).readEntitlement(appKey, handle);
  if (hasSubscriptionAccess(entitlement)) return null;
  return Response.json({ error: 'Subscription required.', code: 'SUBSCRIPTION_REQUIRED' }, { status: 403 });
}

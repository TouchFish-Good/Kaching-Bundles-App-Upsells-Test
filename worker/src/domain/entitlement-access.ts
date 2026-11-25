import type { Entitlement } from '../db/subscriptions';

const VALID_STATES = new Set(['trial', 'active', 'grace']);
const REQUIRED_FEATURE_KEY = 'quantity_breaks_access';

export function hasSubscriptionAccess(entitlement: Entitlement | null, now = Date.now()): boolean {
  if (!entitlement || !VALID_STATES.has(entitlement.state) || !entitlement.featureKeys.includes(REQUIRED_FEATURE_KEY)) return false;
  if (entitlement.state === 'grace' && entitlement.graceUntil !== null && now > entitlement.graceUntil) return false;
  if (['trial', 'active'].includes(entitlement.state) && entitlement.validUntil !== null && now > entitlement.validUntil) {
    // Only an already verified period that joins the current one may cover sync lag.
    const { nextValidFrom, nextValidUntil } = entitlement;
    return nextValidFrom != null && nextValidUntil != null
      && nextValidFrom <= entitlement.validUntil && nextValidFrom <= now
      && nextValidUntil > nextValidFrom && now < nextValidUntil;
  }
  return true;
}

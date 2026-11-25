import type { SubscriptionRecord } from '../services/subscriptions';

// This summary describes the Partner subscription, never application access.
export function selectStoreSubscription(records: SubscriptionRecord[], handle: string, now: number): SubscriptionRecord | null {
  const candidates = records.filter(item => item.handle === null || item.handle === handle);
  const rank = (item: SubscriptionRecord): number => {
    const started = item.startAt === null || item.startAt <= now;
    const current = started && item.status === 'active' && (item.endAt === null || item.endAt > now);
    return current ? 3 : started ? 2 : 1;
  };
  return candidates.sort((a, b) => rank(b) - rank(a)
    || Number(b.spuKey === 'ultra') - Number(a.spuKey === 'ultra')
    || (b.startAt ?? b.endAt ?? 0) - (a.startAt ?? a.endAt ?? 0)
    || b.subId.localeCompare(a.subId))[0] ?? null;
}

export function storeSubscriptionSummary(row: Record<string, string | number | null>, now: number): Record<string, string | number | boolean | null> | null {
  const summary = storeSubscriptionSummaryCore(row, now);
  if (!summary) return null;
  const start = row.entitlement_next_display_from;
  const end = row.entitlement_next_display_until;
  const nextStartsAt = typeof start === 'number' && start > now ? start : null;
  const nextEndsAt = nextStartsAt !== null && typeof end === 'number' && end > nextStartsAt ? end : null;
  return { ...summary, nextStartsAt, nextEndsAt };
}

function storeSubscriptionSummaryCore(row: Record<string, string | number | null>, now: number): Record<string, string | number | boolean | null> | null {
  const legacy = row.entitlement_state === null ? null : {
    state: row.entitlement_state, plan: row.entitlement_plan, validUntil: row.entitlement_valid_until,
    graceUntil: row.entitlement_grace_until, lastVerifiedAt: row.entitlement_last_verified_at,
  };
  if (row.subscription_verified_at === null) return legacy;
  // Payment callbacks may verify a new period with a subscription-id-filtered read.
  // That newer confirmed period takes precedence until the next full snapshot refresh.
  const entitlementDeadline = row.entitlement_state === 'grace' ? row.entitlement_grace_until : row.entitlement_valid_until;
  if (legacy && Number(row.entitlement_last_verified_at) > Number(row.subscription_verified_at)
    && ['trial', 'active', 'grace'].includes(String(row.entitlement_state))
    && (entitlementDeadline === null || Number(entitlementDeadline) > now)) return legacy;
  let subscription: SubscriptionRecord | null;
  try { subscription = JSON.parse(String(row.subscription_json)) as SubscriptionRecord | null; }
  catch { return legacy; }
  if (!subscription) return { state: 'inactive', plan: null, validUntil: null, graceUntil: null, lastVerifiedAt: row.subscription_verified_at, isTrial: false };
  const isTrial = subscription.isTrial === true || subscription.type === 'trial';
  let state = ['unactive', 'pending', 'cancelled', 'expired'].includes(subscription.status) ? subscription.status : 'unknown';
  if (subscription.status === 'active') {
    state = subscription.startAt !== null && subscription.startAt > now ? 'scheduled'
      : subscription.endAt !== null && subscription.endAt <= now ? 'expired' : isTrial ? 'trial' : 'active';
  }
  if (subscription.status === 'unactive' && subscription.endAt !== null && subscription.endAt <= now) state = 'expired';
  const grace = state === 'expired' && ['active', 'expired'].includes(subscription.status) && row.entitlement_state === 'grace'
    && row.entitlement_subscription_id === subscription.subId
    && typeof row.entitlement_grace_until === 'number' && row.entitlement_grace_until > now;
  return {
    state: grace ? 'grace' : state, plan: subscription.spuKey, validUntil: subscription.endAt,
    graceUntil: grace ? row.entitlement_grace_until : null, lastVerifiedAt: row.subscription_verified_at, isTrial,
  };
}

export const storeSubscriptionFilterStates = ['all', 'unknown', 'trial', 'active', 'grace', 'review_pending', 'inactive', 'unactive', 'pending', 'cancelled', 'expired', 'scheduled', 'unverified'] as const;

// SQL counterpart of storeSubscriptionSummary, evaluated before counting/pagination.
// JSON extraction is guarded so a damaged snapshot falls back to the entitlement.
export function storeSubscriptionStateSql(): string {
  const field = (name: string) => `json_extract(CASE WHEN json_valid(subscription_json) THEN subscription_json ELSE 'null' END, '$.${name}')`;
  const status = field('status'), start = field('startAt'), end = field('endAt');
  const expired = `((${status} = 'active' AND (${start} IS NULL OR ${start} <= subscription_now) AND ${end} <= subscription_now) OR ${status} = 'expired')`;
  return `CASE
    WHEN subscription_verified_at IS NULL THEN entitlement_state
    WHEN entitlement_last_verified_at > subscription_verified_at
      AND entitlement_state IN ('trial', 'active', 'grace')
      AND (CASE WHEN entitlement_state = 'grace' THEN entitlement_grace_until ELSE entitlement_valid_until END IS NULL
        OR CASE WHEN entitlement_state = 'grace' THEN entitlement_grace_until ELSE entitlement_valid_until END > subscription_now)
      THEN entitlement_state
    WHEN NOT json_valid(subscription_json) THEN entitlement_state
    WHEN subscription_json IS NULL OR json_type(subscription_json) = 'null' THEN 'inactive'
    WHEN ${expired} AND entitlement_state = 'grace'
      AND entitlement_subscription_id = ${field('subId')} AND entitlement_grace_until > subscription_now THEN 'grace'
    WHEN ${status} = 'active' THEN CASE
      WHEN ${start} > subscription_now THEN 'scheduled'
      WHEN ${end} <= subscription_now THEN 'expired'
      WHEN ${field('isTrial')} = 1 OR ${field('type')} = 'trial' THEN 'trial'
      ELSE 'active' END
    WHEN ${status} = 'unactive' AND ${end} <= subscription_now THEN 'expired'
    WHEN ${status} IN ('unactive', 'pending', 'cancelled', 'expired') THEN ${status}
    ELSE 'unknown' END`;
}

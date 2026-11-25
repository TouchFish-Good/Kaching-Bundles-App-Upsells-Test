import type { SubscriptionRecord } from './subscriptions';
import { D1SubscriptionRepository, type Entitlement } from '../db/subscriptions';

const REQUIRED_FEATURE_KEY = 'quantity_breaks_access';
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const MAX_SUBSCRIPTION_PAGES = 100;

type PartnerSubscriptionReader = {
  listSubscriptions(input: { appKey: string; handle: string; pageNum?: number; subIds?: string[] }): Promise<{ subscriptions: SubscriptionRecord[]; lastPage: boolean }>;
  getSubscriptionDetail(input: { appKey: string; handle: string; subId: string }): Promise<{ featureKeys: string[] }>;
};

export class EntitlementService {
  constructor(private readonly repository: D1SubscriptionRepository, private readonly partner: PartnerSubscriptionReader, private readonly clock: () => number = Date.now) {}

  private async writeActive(appKey: string, handle: string, subscription: SubscriptionRecord, featureKeys: string[], next: SubscriptionRecord | null, displayNext: SubscriptionRecord | null, sourceEventId?: string): Promise<Entitlement> {
    const trial = subscription.type === 'trial' || subscription.isTrial === true;
    const entitlement = await this.repository.writeEntitlement({
      appKey, handle, state: trial ? 'trial' : 'active', featureKeys,
      activeSubscriptionId: subscription.subId, activeSpuKey: subscription.spuKey,
      validFrom: subscription.startAt, validUntil: subscription.endAt, nextValidFrom: next?.startAt ?? null, nextValidUntil: next?.endAt ?? null, graceUntil: null,
      nextDisplayFrom: displayNext?.startAt ?? null, nextDisplayUntil: displayNext?.endAt ?? null,
      autoRecurring: subscription.autoRecurring, absenceConfirmations: 0,
    });
    if (trial) await this.repository.consumeTrialOnce({ appKey, handle, subscriptionId: subscription.subId, sourceEventId: sourceEventId ?? null });
    await this.repository.cancelInvalidationOperations(appKey, handle);
    return entitlement;
  }

  private async reconcileAbsent(appKey: string, handle: string, existing: Entitlement | null, enqueueInvalidation = true): Promise<Entitlement> {
    const now = this.clock();
    if (!existing) return this.repository.writeEntitlement({
      appKey, handle, state: 'unknown', featureKeys: [], activeSubscriptionId: null, activeSpuKey: null,
      validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 0,
    });
    const graceUntil = existing.graceUntil ?? (existing.validUntil === null ? now + GRACE_PERIOD_MS : existing.validUntil + GRACE_PERIOD_MS);
    if (graceUntil !== null && now <= graceUntil) return this.repository.writeEntitlement({
      ...existing, state: 'grace', graceUntil, nextValidFrom: null, nextValidUntil: null, nextDisplayFrom: null, nextDisplayUntil: null, absenceConfirmations: 0,
    });
    const absenceConfirmations = existing.absenceConfirmations + 1;
    const inactive = absenceConfirmations >= 2;
    const entitlement = await this.repository.writeEntitlement({
      ...existing, state: inactive ? 'inactive' : 'review_pending', graceUntil, nextValidFrom: null, nextValidUntil: null, nextDisplayFrom: null, nextDisplayUntil: null, absenceConfirmations,
    });
    if (inactive && enqueueInvalidation) {
      await this.repository.enqueueExpiryOperations(appKey, handle, entitlement.version, now);
    } else if (!inactive) {
      await this.repository.enqueueOperationOnce({
        operationKey: `subscription-reconcile:${appKey}:${handle}:${entitlement.version}`,
        appKey, handle, entitlementVersion: entitlement.version, kind: 'reconcile', campaignId: null, nextAttemptAt: now,
      });
    }
    return entitlement;
  }

  private async writeRevoked(appKey: string, handle: string, existing: Entitlement | null, enqueueInvalidation = true): Promise<Entitlement> {
    if (existing?.state === 'unknown' && existing.featureKeys.length === 0 && existing.activeSubscriptionId === null && existing.validUntil === null && existing.graceUntil === null) {
      return existing;
    }
    const now = this.clock();
    const entitlement = await this.repository.writeEntitlement({
      appKey,
      handle,
      state: 'unknown',
      featureKeys: [],
      activeSubscriptionId: null,
      activeSpuKey: null,
      validFrom: null,
      validUntil: null,
      graceUntil: null,
      autoRecurring: null,
      absenceConfirmations: 0,
    });
    if (enqueueInvalidation) await this.repository.enqueueExpiryOperations(appKey, handle, entitlement.version, now);
    return entitlement;
  }

  private async reconcileExpired(appKey: string, handle: string, subscription: SubscriptionRecord, existing: Entitlement | null, enqueueInvalidation = true): Promise<Entitlement> {
    const now = this.clock();
    const validUntil = subscription.endAt;
    const hadAccess = existing && ['trial', 'active', 'grace'].includes(existing.state) && existing.featureKeys.includes(REQUIRED_FEATURE_KEY);
    if (!hadAccess || validUntil === null || validUntil > now) return this.writeRevoked(appKey, handle, existing, enqueueInvalidation);
    const graceUntil = validUntil + GRACE_PERIOD_MS;
    if (now > graceUntil) return this.writeRevoked(appKey, handle, existing, enqueueInvalidation);
    const entitlement = await this.repository.writeEntitlement({
      appKey,
      handle,
      state: 'grace',
      featureKeys: existing.featureKeys,
      activeSubscriptionId: subscription.subId,
      activeSpuKey: subscription.spuKey,
      validFrom: subscription.startAt,
      validUntil,
      graceUntil,
      autoRecurring: subscription.autoRecurring,
      absenceConfirmations: 0,
    });
    await this.repository.enqueueOperationOnce({
      operationKey: `subscription-expired-reconcile:${appKey}:${handle}:${subscription.subId}:${graceUntil}`,
      appKey,
      handle,
      entitlementVersion: entitlement.version,
      kind: 'reconcile',
      campaignId: null,
      nextAttemptAt: graceUntil,
    });
    return entitlement;
  }

  private async writeUnavailable(appKey: string, handle: string, subscription: SubscriptionRecord): Promise<Entitlement> {
    return this.repository.writeEntitlement({
      appKey,
      handle,
      state: 'inactive',
      featureKeys: [],
      activeSubscriptionId: subscription.subId,
      activeSpuKey: subscription.spuKey,
      validFrom: subscription.startAt,
      validUntil: subscription.endAt,
      graceUntil: null,
      autoRecurring: subscription.autoRecurring,
      absenceConfirmations: 0,
    });
  }

  private async writeUnknown(appKey: string, handle: string): Promise<Entitlement> {
    return this.repository.writeEntitlement({
      appKey,
      handle,
      state: 'unknown',
      featureKeys: [],
      activeSubscriptionId: null,
      activeSpuKey: null,
      validFrom: null,
      validUntil: null,
      graceUntil: null,
      autoRecurring: null,
      absenceConfirmations: 0,
    });
  }

  private async reconcilePending(input: { appKey: string; handle: string; subscriptionId?: string | null; sourceEventId?: string }, existing: Entitlement | null): Promise<Entitlement> {
    const now = this.clock();
    const preservesAccess = existing && ['trial', 'active', 'grace'].includes(existing.state);
    const entitlement = await this.repository.writeEntitlement({
      appKey: input.appKey,
      handle: input.handle,
      state: preservesAccess ? existing.state : 'review_pending',
      featureKeys: existing?.featureKeys ?? [],
      activeSubscriptionId: input.subscriptionId ?? existing?.activeSubscriptionId ?? null,
      activeSpuKey: existing?.activeSpuKey ?? 'ultra',
      validFrom: existing?.validFrom ?? null,
      validUntil: existing?.validUntil ?? null,
      nextValidFrom: existing?.nextValidFrom ?? null,
      nextValidUntil: existing?.nextValidUntil ?? null,
      nextDisplayFrom: existing?.nextDisplayFrom ?? null,
      nextDisplayUntil: existing?.nextDisplayUntil ?? null,
      graceUntil: existing?.graceUntil ?? null,
      autoRecurring: existing?.autoRecurring ?? null,
      absenceConfirmations: 0,
    });
    await this.repository.enqueueOperationOnce({
      // Background retries use their previous operation key as sourceEventId.
      // Embedding that source recursively grows both the row and primary-key index.
      // Without a subscription ID, deduplicate by store and retry window instead.
      operationKey: `subscription-reconcile-payment:${input.appKey}:${input.handle}:${input.subscriptionId ?? existing?.activeSubscriptionId ?? 'unknown'}:${Math.floor(now / 2_000)}`,
      appKey: input.appKey,
      handle: input.handle,
      entitlementVersion: entitlement.version,
      kind: 'reconcile',
      campaignId: null,
      nextAttemptAt: now + 2_000,
    });
    return entitlement;
  }

  async reconcileEntitlement(input: { appKey: string; handle: string; subscriptionId?: string | null; paymentPending?: boolean; sourceEventId?: string; requireFresh?: boolean }): Promise<Entitlement | null> {
    if (!this.repository.hasEntitlementLease) {
      return this.repository.withEntitlementLock(input.appKey, input.handle, (locked) =>
        new EntitlementService(locked, this.partner, this.clock).reconcileEntitlement(input));
    }
    await this.repository.assertEntitlementLease(input.appKey, input.handle);
    const existing = await this.repository.readEntitlement(input.appKey, input.handle);
    const now = this.clock();
    const paymentPending = input.paymentPending === true || (existing?.state === 'review_pending' && existing.validUntil === null);
    const subscriptionId = input.subscriptionId ?? (paymentPending ? existing?.activeSubscriptionId : null);
    try {
      // A notification's sub_id identifies an event, not the shop's complete entitlement.
      // Always list every period so an old expiry/payment event cannot hide a renewal.
      const subscriptions: SubscriptionRecord[] = [];
      for (let pageNum = 1; pageNum <= MAX_SUBSCRIPTION_PAGES; pageNum += 1) {
        const page = await this.partner.listSubscriptions({ appKey: input.appKey, handle: input.handle, pageNum });
        subscriptions.push(...page.subscriptions);
        if (page.lastPage) break;
        if (pageNum === MAX_SUBSCRIPTION_PAGES) throw new Error('SHOPLINE Partner subscription list did not terminate.');
      }
      try { await this.repository.writeSubscriptionSnapshot(input.appKey, input.handle, subscriptions); }
      catch { /* Display persistence cannot change application access; background reads retry it. */ }
      const activeSubscriptions = subscriptions.filter((subscription) =>
        (subscription.handle === null || subscription.handle === input.handle)
        && subscription.status === 'active'
        && (subscription.startAt === null || subscription.startAt <= now)
        && (subscription.endAt === null || subscription.endAt > now),
      );
      const otherPackage = activeSubscriptions.filter((subscription) => subscription.spuKey !== 'ultra')
        .sort((left, right) => (right.endAt ?? 0) - (left.endAt ?? 0))[0];
      const candidates = activeSubscriptions.filter((subscription) => subscription.spuKey === 'ultra')
        .sort((left, right) => (right.endAt ?? 0) - (left.endAt ?? 0));
      const unavailableUltra = subscriptions.filter((subscription) => (subscription.handle === null || subscription.handle === input.handle)
        && subscription.spuKey === 'ultra');
      const immediatelyRevokedUltra = unavailableUltra.find((subscription) => ['cancelled', 'unactive', 'pending'].includes(subscription.status));
      const expiredUltra = unavailableUltra
        .filter((subscription) => subscription.status === 'expired'
          || (subscription.status === 'active' && subscription.endAt !== null && subscription.endAt <= now))
        .sort((left, right) => (right.endAt ?? 0) - (left.endAt ?? 0))[0];
      let invalidUltra: SubscriptionRecord | null = null;
      for (const subscription of candidates) {
        const detail = await this.partner.getSubscriptionDetail({ appKey: input.appKey, handle: input.handle, subId: subscription.subId });
        if (detail.featureKeys.includes(REQUIRED_FEATURE_KEY)) {
          const upcoming = subscriptions.filter((period) =>
            (period.handle === null || period.handle === input.handle)
            && period.spuKey === 'ultra' && period.status === 'active' && period.type === 'preorder'
            && period.startAt !== null && period.startAt > now
            && period.endAt !== null && period.endAt > period.startAt,
          ).sort((left, right) => left.startAt! - right.startAt!);
          let next: SubscriptionRecord | null = null;
          for (const period of upcoming) {
            try {
              const upcomingDetail = await this.partner.getSubscriptionDetail({ appKey: input.appKey, handle: input.handle, subId: period.subId });
              if (upcomingDetail.featureKeys.includes(REQUIRED_FEATURE_KEY)) { next = period; break; }
            } catch { /* A future period cannot revoke already confirmed current access. */ }
          }
          // List-confirmed dates describe the next purchase. Only the separately
          // feature-verified period above can extend access across a sync delay.
          return this.writeActive(input.appKey, input.handle, subscription, detail.featureKeys, next, upcoming[0] ?? null, input.sourceEventId);
        }
        invalidUltra ??= subscription;
      }
      if (otherPackage) return this.writeUnavailable(input.appKey, input.handle, otherPackage);
      if (invalidUltra) return this.writeUnknown(input.appKey, input.handle);
      if (immediatelyRevokedUltra) return this.writeRevoked(input.appKey, input.handle, existing, !input.requireFresh);
      if (expiredUltra) return this.reconcileExpired(input.appKey, input.handle, expiredUltra, existing, !input.requireFresh);
      if (paymentPending) return this.reconcilePending({ ...input, subscriptionId }, existing);
      return this.reconcileAbsent(input.appKey, input.handle, existing, !input.requireFresh);
    } catch {
      if (paymentPending && !input.requireFresh) {
        return this.reconcilePending({ ...input, subscriptionId }, existing);
      }
      await this.repository.enqueueOperationOnce({
        operationKey: `subscription-reconcile-retry:${input.appKey}:${input.handle}:${Math.floor(this.clock() / (5 * 60 * 1000))}`,
        appKey: input.appKey, handle: input.handle, entitlementVersion: existing?.version ?? 0, kind: 'reconcile', campaignId: null, nextAttemptAt: this.clock() + 5 * 60 * 1000,
      });
      if (input.requireFresh) throw new Error('Fresh SHOPLINE subscription verification is unavailable.');
      return existing ?? this.repository.writeEntitlement({
        appKey: input.appKey,
        handle: input.handle,
        state: 'unknown',
        featureKeys: [],
        activeSubscriptionId: null,
        activeSpuKey: null,
        validFrom: null,
        validUntil: null,
        graceUntil: null,
        autoRecurring: null,
        absenceConfirmations: 0,
      });
    }
  }
}

import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { normalizeCommentContent, normalizeSuggestionContent } from '../src/domain/feedback';
import type { Env } from '../src/env';

describe('D1 migrations', () => {
  it('adds a nullable collection sync time without guessing historical sync or edit times', async () => {
    const database = (env as Env).DB;
    await applyMigrations(database);
    await database.prepare('DROP TABLE quantity_breaks_collection_conflicts').run();
    await database.prepare(`CREATE TABLE quantity_breaks_collection_conflicts (
      shop_handle TEXT NOT NULL, campaign_id TEXT NOT NULL, state TEXT NOT NULL,
      campaign_ids_json TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY (shop_handle, campaign_id)
    )`).run();
    await database.prepare('INSERT INTO quantity_breaks_collection_conflicts VALUES (?, ?, ?, ?, ?)')
      .bind('legacy-shop', 'legacy-campaign', 'conflict', '["other"]', '2026-11-20T03:00:00.000Z').run();
    await applyMigrations(database);
    await applyMigrations(database);
    await expect(database.prepare('SELECT state, campaign_ids_json, checked_at, synced_at FROM quantity_breaks_collection_conflicts WHERE shop_handle = ?')
      .bind('legacy-shop').first()).resolves.toEqual({
      state: 'conflict', campaign_ids_json: '["other"]', checked_at: '2026-11-20T03:00:00.000Z', synced_at: null,
    });
  });

  it('creates all tenant and operational tables idempotently', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    await applyMigrations(database);

    const result = await database
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'shopline_sessions',
        'quantity_breaks_campaigns',
        'quantity_breaks_publications',
        'quantity_breaks_staged_updates',
        'quantity_breaks_campaign_operation_batches',
        'quantity_breaks_campaign_operations',
        'quantity_breaks_shop_locks',
        'quantity_breaks_collection_conflicts',
        'quantity_breaks_translations',
        'webhook_events',
        'admin_stores',
        'admin_installations',
        'admin_error_events',
        'application_request_events',
        'campaign_diagnostic_events',
        'gdpr_deletion_tasks',
        'token_refresh_locks',
        'public_rate_limits',
      ]),
    );
  });

  it('backfills subscription-expired end times only from a matching confirmed deletion', async () => {
    const database = (env as Env).DB;
    await applyMigrations(database);
    const expiry = '2026-11-17T10:00:00.000Z';
    const inserted = '2026-11-16T00:00:00.000Z';
    const scenarios = [
      ['confirmed', 'entitlement_revoked', 'subscription_expired', expiry, null],
      ['unconfirmed', 'needs_reconciliation', 'subscription_expired', expiry, null],
      ['missing-time', 'entitlement_revoked', 'subscription_expired', null, null],
      ['invalid-time', 'entitlement_revoked', 'subscription_expired', 'not-a-date', null],
      ['still-linked', 'entitlement_revoked', 'subscription_expired', expiry, 'discount-1'],
      ['merchant-pause', 'paused', 'merchant_paused', expiry, 'discount-1'],
    ] as const;
    for (const [id, state, reason, verifiedAt, discountId] of scenarios) {
      const campaign = { id, name: id, status: 'paused', pauseReason: reason === 'subscription_expired' ? reason : undefined, neverExpires: true };
      await database.prepare('INSERT OR REPLACE INTO quantity_breaks_campaigns (shop_handle, id, campaign_json, revision, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind('legacy-expiry-shop', id, JSON.stringify(campaign), 3, inserted).run();
      await database.prepare('INSERT OR REPLACE INTO quantity_breaks_publications (shop_handle, campaign_id, state, discount_id, last_verified_at, state_reason, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('legacy-expiry-shop', id, state, discountId, verifiedAt, reason, inserted).run();
    }
    await applyMigrations(database);
    const row = await database.prepare('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?')
      .bind('legacy-expiry-shop', 'confirmed').first<{ campaign_json: string; revision: number; updated_at: string }>();
    expect(JSON.parse(row!.campaign_json)).toMatchObject({ endsAt: expiry, neverExpires: false });
    expect(row).toMatchObject({ revision: 4, updated_at: inserted });
    await applyMigrations(database);
    await expect(database.prepare('SELECT revision FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?').bind('legacy-expiry-shop', 'confirmed').first()).resolves.toEqual({ revision: 4 });
    for (const [id] of scenarios.slice(1)) {
      const skipped = await database.prepare('SELECT campaign_json, revision FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?')
        .bind('legacy-expiry-shop', id).first<{ campaign_json: string; revision: number }>();
      expect(JSON.parse(skipped!.campaign_json).neverExpires).toBe(true);
      expect(skipped!.revision).toBe(3);
    }
  });

  it('creates feedback discussion storage', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    const tables = await database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'feedback_requests',
      'feedback_replies',
      'feedback_comments',
    ]));
  });

  it('adds comment moderation columns with public defaults', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    const columns = await database.prepare('PRAGMA table_info(feedback_comments)').all<{ name: string }>();

    expect(columns.results.map((column) => column.name)).toEqual(expect.arrayContaining([
      'visibility',
      'deleted_at',
      'deleted_by_admin_id',
      'deletion_reason',
    ]));
  });

  it('adds publication resume metadata required by the campaign repository', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    const columns = await database.prepare('PRAGMA table_info(quantity_breaks_publications)').all<{ name: string }>();

    expect(columns.results.map((column) => column.name)).toEqual(expect.arrayContaining([
      'platform_node_id',
      'resume_status',
      'last_verified_at',
      'state_reason',
    ]));
  });

  it('hides historical public pending feedback and records the review column', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    await database.prepare('DELETE FROM feedback_requests WHERE id = ?').bind('legacy-pending').run();
    await database.prepare(`INSERT INTO feedback_requests
      (id, submitter_store_id, title, content, normalized_title, content_hash, status, visibility, vote_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'public', 0, ?, ?)`)
      .bind('legacy-pending', 'store-a', 'Legacy', 'Needs review', 'legacy', 'legacy-hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z').run();

    await applyMigrations(database);

    await expect(database.prepare('SELECT visibility, reviewed_at FROM feedback_requests WHERE id = ?').bind('legacy-pending').first())
      .resolves.toEqual({ visibility: 'hidden', reviewed_at: null });
  });

  it('preserves Owner-rejected hidden feedback when migrations run repeatedly', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    await database.prepare('DELETE FROM feedback_requests WHERE id = ?').bind('owner-hidden').run();
    await database.prepare(`INSERT INTO feedback_requests
      (id, submitter_store_id, title, content, normalized_title, content_hash, status, visibility, hidden_reason, vote_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'rejected', 'hidden', 'owner_rejected_display', 0, ?, ?)`).bind(
      'owner-hidden', 'store-a', 'Hidden', 'Do not publish', 'hidden', 'hidden-hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
    ).run();

    await applyMigrations(database);

    await expect(database.prepare('SELECT visibility, hidden_reason FROM feedback_requests WHERE id = ?').bind('owner-hidden').first())
      .resolves.toEqual({ visibility: 'hidden', hidden_reason: 'owner_rejected_display' });
  });

  it('allows 1000-code-point suggestion bodies and limits comments to 400 code points', () => {
    expect(normalizeSuggestionContent('文'.repeat(1000))).toHaveLength(1000);
    expect(() => normalizeSuggestionContent('文'.repeat(1001))).toThrow('Content must be between 1 and 1000 characters.');
    expect(normalizeCommentContent('文'.repeat(400))).toHaveLength(400);
    expect(() => normalizeCommentContent('文'.repeat(401))).toThrow('Comment must be between 1 and 400 characters.');
  });

  it('accepts updating publications and stores staged update metadata', async () => {
    const database = (env as Env).DB;

    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM quantity_breaks_staged_updates'),
      database.prepare('DELETE FROM quantity_breaks_publications'),
    ]);

    await database.prepare(
      `INSERT INTO quantity_breaks_publications
        (shop_handle, campaign_id, state, discount_id, owner, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind('shop-a', 'offer-a', 'updating', 'discount-1', 'owner-1', '2026-10-28T00:00:00.000Z').run();
    await database.prepare(
      `INSERT INTO quantity_breaks_staged_updates
        (shop_handle, campaign_id, candidate_json, expected_revision, discount_id)
        VALUES (?, ?, ?, ?, ?)`,
    ).bind('shop-a', 'offer-a', JSON.stringify({ id: 'offer-a' }), 2, 'discount-1').run();

    const publication = await database.prepare(
      'SELECT state, discount_id FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?',
    ).bind('shop-a', 'offer-a').first<{ state: string; discount_id: string }>();
    const stagedUpdate = await database.prepare(
      `SELECT candidate_json, expected_revision, discount_id
       FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?`,
    ).bind('shop-a', 'offer-a').first<{ candidate_json: string; expected_revision: number; discount_id: string }>();

    expect(publication).toEqual({ state: 'updating', discount_id: 'discount-1' });
    expect(stagedUpdate).toEqual({ candidate_json: JSON.stringify({ id: 'offer-a' }), expected_revision: 2, discount_id: 'discount-1' });
  });
});

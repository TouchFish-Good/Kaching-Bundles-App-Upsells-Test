import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { D1FeedbackRepository } from '../src/db/feedback';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const database = (env as Env).DB;
const now = () => Date.parse('2026-10-29T00:00:00.000Z');

describe('D1 feedback repository', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM feedback_comment_attachments'),
      database.prepare('DELETE FROM feedback_comments'),
      database.prepare('DELETE FROM feedback_replies'),
      database.prepare('DELETE FROM feedback_votes'),
      database.prepare('DELETE FROM feedback_submission_keys'),
      database.prepare('DELETE FROM feedback_requests'),
    ]);
  });

  it('projects anonymous comments without their handle and snapshots visible handles', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: '1', title: 'Title', content: 'Body', idempotencyKey: 'key-1' });
    await repository.updateStatus({ requestId: feedback.id, status: 'approved' });
    await repository.createComment({ requestId: feedback.id, storeId: '2', handle: 'visible-shop', content: 'Visible', isAnonymous: false });
    await repository.createComment({ requestId: feedback.id, storeId: '3', handle: 'secret-shop', content: 'Hidden', isAnonymous: true });

    const detail = await repository.readDetailForViewer(feedback.id, '4');

    expect(detail?.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ authorLabel: 'visible-shop', content: 'Visible' }),
      expect.objectContaining({ authorLabel: '匿名用户', content: 'Hidden' }),
    ]));
    expect(JSON.stringify(detail)).not.toContain('secret-shop');
  });

  it('counts public feedback by status with zero values for missing statuses', async () => {
    const repository = new D1FeedbackRepository(database, now);
    await repository.createSuggestion({ storeId: '1', title: 'Pending', content: 'One', idempotencyKey: 'count-pending' });
    const approved = await repository.createSuggestion({ storeId: '1', title: 'Approved', content: 'Two', idempotencyKey: 'count-approved' });
    await repository.updateStatus({ requestId: approved.id, status: 'approved' });

    await expect(repository.countForViewer('1', false)).resolves.toEqual({ all: 1, pending: 0, approved: 1, in_progress: 0, released: 0, rejected: 0 });
  });

  it('shows rejected feedback in the public feed and public status counts', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const rejected = await repository.createSuggestion({ storeId: 'author-store', title: 'Rejected', content: 'Reasoned response', idempotencyKey: 'rejected-public' });
    await repository.updateStatus({ requestId: rejected.id, status: 'rejected' });

    await expect(repository.listForViewer('other-store')).resolves.toMatchObject({
      items: [expect.objectContaining({ id: rejected.id, status: 'rejected' })],
    });
    await expect(repository.countForViewer('other-store', false)).resolves.toEqual({ all: 1, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 1 });
    await expect(repository.readDetailForViewer(rejected.id, 'other-store')).resolves.toMatchObject({ id: rejected.id, status: 'rejected' });
  });

  it('keeps a new hidden pending submission visible only to its author', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'author-store', handle: 'author-handle', title: 'Private', content: 'Needs review', idempotencyKey: 'author-only' });

    await expect(repository.listForViewer('other-store')).resolves.toMatchObject({ items: [] });
    await expect(repository.listForViewer('author-store', { mine: true })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: feedback.id, isMine: true, status: 'pending', commentCount: 0 })],
    });
    await expect(repository.readDetailForViewer(feedback.id, 'other-store')).resolves.toBeNull();
    await expect(repository.readDetailForViewer(feedback.id, 'author-store')).resolves.toMatchObject({ canWithdraw: true });
  });

  it('lets the author comment on an untouched pending suggestion but keeps it private to other stores', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'author-store', handle: 'author-handle', title: 'Private discussion', content: 'Needs review', idempotencyKey: 'author-comment' });

    await expect(repository.createComment({ requestId: feedback.id, storeId: 'author-store', handle: 'author-handle', content: '补充说明', isAnonymous: false })).resolves.toMatchObject({ authorLabel: 'author-handle', content: '补充说明' });
    await expect(repository.createComment({ requestId: feedback.id, storeId: 'other-store', handle: 'other-handle', content: '不应可见', isAnonymous: false })).resolves.toBeNull();
  });

  it('lets the author toggle a vote on an untouched pending suggestion but excludes other stores', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'author-store', handle: 'author-handle', title: 'Private vote', content: 'Needs review', idempotencyKey: 'author-vote' });

    await expect(repository.toggleVote(feedback.id, 'author-store')).resolves.toEqual({ voted: true, voteCount: 1 });
    await expect(repository.toggleVote(feedback.id, 'author-store')).resolves.toEqual({ voted: false, voteCount: 0 });
    await expect(repository.toggleVote(feedback.id, 'other-store')).resolves.toBeNull();
  });

  it('prevents a reviewed pending submission from being withdrawn', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'author-store', handle: 'author-handle', title: 'Held', content: 'Awaiting a decision', idempotencyKey: 'reviewed-pending' });

    await repository.updateStatus({ requestId: feedback.id, status: 'pending', note: 'Reviewed but held.' });

    await expect(repository.readDetailForViewer(feedback.id, 'author-store')).resolves.toMatchObject({ canWithdraw: false });
    await expect(repository.withdrawSuggestion(feedback.id, 'author-store')).resolves.toBe(false);
  });

  it('snapshots suggestion authors and separates anonymous identity from ownership', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const visible = await repository.createSuggestion({ storeId: '1', handle: 'visible-shop', isAnonymous: false, title: 'Visible', content: 'Body', idempotencyKey: 'author-visible' });
    const anonymous = await repository.createSuggestion({ storeId: '1', handle: 'hidden-shop', isAnonymous: true, title: 'Anonymous', content: 'Body', idempotencyKey: 'author-anonymous' });
    await repository.updateStatus({ requestId: visible.id, status: 'approved' });
    await repository.updateStatus({ requestId: anonymous.id, status: 'approved' });

    await expect(repository.listForViewer('1')).resolves.toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ id: visible.id, authorLabel: 'visible-shop', isMine: true }),
      expect.objectContaining({ id: anonymous.id, authorLabel: '匿名用户', isMine: true }),
    ]) });
    await expect(repository.readDetailForViewer(visible.id, '2')).resolves.toMatchObject({ authorLabel: 'visible-shop', isMine: false });
    await expect(repository.readDetailForViewer(anonymous.id, '2')).resolves.toMatchObject({ authorLabel: '匿名用户', isMine: false });
  });

  it('paginates the public feed and scopes the mine filter to the viewing store', async () => {
    const repository = new D1FeedbackRepository(database, now);
    await repository.createSuggestion({ storeId: 'mine', handle: 'my-shop', title: 'Mine one', content: 'Body', idempotencyKey: 'mine-one' });
    await repository.createSuggestion({ storeId: 'other', handle: 'other-shop', title: 'Other', content: 'Body', idempotencyKey: 'other-one' });
    await repository.createSuggestion({ storeId: 'mine', handle: 'my-shop', title: 'Mine two', content: 'Body', idempotencyKey: 'mine-two' });

    await expect(repository.listForViewer('mine', { mine: true, page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 2, items: [expect.objectContaining({ isMine: true, authorLabel: 'my-shop' })] });
    await expect(repository.listForViewer('mine', { mine: true, page: 2, pageSize: 1 })).resolves.toMatchObject({ total: 2, items: [expect.objectContaining({ isMine: true })] });
  });

  it('clamps a now-empty final page to the last available page after a withdrawal', async () => {
    const repository = new D1FeedbackRepository(database, now);
    await repository.createSuggestion({ storeId: 'mine', title: 'First', content: 'Body', idempotencyKey: 'first-page' });
    await repository.createSuggestion({ storeId: 'mine', title: 'Second', content: 'Body', idempotencyKey: 'second-page' });

    const finalPage = await repository.listForViewer('mine', { mine: true, page: 2, pageSize: 1 });
    await expect(repository.withdrawSuggestion(finalPage.items[0].id, 'mine')).resolves.toBe(true);

    await expect(repository.listForViewer('mine', { mine: true, page: 2, pageSize: 1 })).resolves.toMatchObject({
      page: 1,
      total: 1,
      items: [expect.objectContaining({ isMine: true })],
    });
  });

  it('withdraws only an unreviewed pending suggestion owned by the current store', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const withdrawable = await repository.createSuggestion({ storeId: 'mine', title: 'Withdraw', content: 'Body', idempotencyKey: 'withdrawable' });
    const reviewed = await repository.createSuggestion({ storeId: 'mine', title: 'Reviewed', content: 'Body', idempotencyKey: 'reviewed' });
    await repository.updateStatus({ requestId: reviewed.id, status: 'pending' });

    await expect(repository.withdrawSuggestion(withdrawable.id, 'mine')).resolves.toBe(true);
    await expect(repository.readDetailForViewer(withdrawable.id, 'mine')).resolves.toBeNull();
    const audit = await database.prepare("SELECT action, actor_service FROM feedback_admin_audit_logs WHERE request_id = ?").bind(withdrawable.id).all<{ action: string; actor_service: string }>();
    expect(audit.results).toEqual([{ action: 'withdrawn_by_submitter', actor_service: 'merchant' }]);
    await expect(repository.withdrawSuggestion(reviewed.id, 'mine')).resolves.toBe(false);
    await expect(repository.withdrawSuggestion(reviewed.id, 'other')).resolves.toBe(false);
  });

  it('rolls back a withdrawal when its required audit record cannot be persisted', async () => {
    let visibility = 'public';
    const failingAuditDatabase = {
      prepare(sql: string) {
        return {
          bind: (..._values: unknown[]) => ({
            run: async () => {
              if (sql.includes('UPDATE feedback_requests')) {
                visibility = 'hidden';
                return { meta: { changes: 1 } };
              }
              if (sql.includes('INSERT INTO feedback_admin_audit_logs')) throw new Error('Audit log unavailable');
              throw new Error(`Unexpected statement: ${sql}`);
            },
          }),
        };
      },
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        const snapshot = visibility;
        try {
          for (const statement of statements) await statement.run();
        } catch (error) {
          visibility = snapshot;
          throw error;
        }
        return [];
      },
    } as unknown as D1Database;
    const repository = new D1FeedbackRepository(failingAuditDatabase, now);

    await expect(repository.withdrawSuggestion('feedback-1', 'mine')).rejects.toThrow('Audit log unavailable');
    expect(visibility).toBe('public');
  });

  it('hides an Owner-rejected suggestion from its author and public readers while retaining it for the Owner', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'shop-1', handle: 'alpha', title: 'Spam', content: 'Inappropriate content', idempotencyKey: 'owner-hidden' });

    await repository.updateStatus({ requestId: feedback.id, status: 'rejected', hideFromMerchants: true, note: '违规内容' });

    await expect(repository.readDetailForViewer(feedback.id, 'shop-1')).resolves.toBeNull();
    await expect(repository.listForViewer('shop-1', { mine: true })).resolves.toMatchObject({ items: [] });
    await expect(repository.readDetailForOwner(feedback.id)).resolves.toMatchObject({
      id: feedback.id,
      storeId: 'shop-1',
      handle: 'alpha',
      displayStatus: 'rejected_hidden',
    });
  });

  it('hides a deleted comment from merchants while retaining its Owner moderation record', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'shop-1', handle: 'alpha', title: 'Feature', content: 'Please add this', idempotencyKey: 'comment-delete' });
    await repository.updateStatus({ requestId: feedback.id, status: 'approved' });
    const comment = await repository.createComment({ requestId: feedback.id, storeId: 'shop-2', handle: 'beta', isAnonymous: true, content: 'Personal attack' });

    await expect(repository.deleteComment({ requestId: feedback.id, commentId: comment!.id, reason: '人身攻击' })).resolves.toBe(true);
    await expect(repository.readDetailForViewer(feedback.id, 'shop-1')).resolves.not.toMatchObject({
      comments: [expect.objectContaining({ id: comment!.id })],
    });
    await expect(repository.readDetailForOwner(feedback.id)).resolves.toMatchObject({
      comments: [expect.objectContaining({
        id: comment!.id,
        authorHandle: 'beta',
        isAnonymous: true,
        isDeleted: true,
        content: 'Personal attack',
      })],
    });
  });

  it('sorts Owner feedback by public comment count and filters official replies', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const one = await repository.createSuggestion({ storeId: 'shop-1', handle: 'alpha', title: '一个评论', content: 'Body', idempotencyKey: 'owner-sort-one' });
    const two = await repository.createSuggestion({ storeId: 'shop-2', handle: 'beta', title: '两个评论', content: 'Body', idempotencyKey: 'owner-sort-two' });
    await repository.updateStatus({ requestId: one.id, status: 'approved' });
    await repository.updateStatus({ requestId: two.id, status: 'approved' });
    await repository.createComment({ requestId: one.id, storeId: 'shop-3', handle: 'gamma', content: 'one', isAnonymous: false });
    await repository.createComment({ requestId: two.id, storeId: 'shop-3', handle: 'gamma', content: 'one', isAnonymous: false });
    await repository.createComment({ requestId: two.id, storeId: 'shop-4', handle: 'delta', content: 'two', isAnonymous: false });
    await repository.createOfficialReply(two.id, '已加入开发计划。');

    await expect(repository.listForOwner({ sort: 'comments', limit: 25, offset: 0 })).resolves.toMatchObject({ items: [expect.objectContaining({ id: two.id }), expect.objectContaining({ id: one.id })] });
    await expect(repository.listForOwner({ replied: true, limit: 25, offset: 0 })).resolves.toMatchObject({ items: [expect.objectContaining({ id: two.id, hasOfficialReply: true })] });
  });

  it('lists all Owner comments with source suggestion and true handle, including deleted rows', async () => {
    const repository = new D1FeedbackRepository(database, now);
    const feedback = await repository.createSuggestion({ storeId: 'shop-1', handle: 'alpha', title: '结账优化', content: 'Body', idempotencyKey: 'owner-comments' });
    await repository.updateStatus({ requestId: feedback.id, status: 'approved' });
    const comment = await repository.createComment({ requestId: feedback.id, storeId: 'shop-2', handle: 'beta', content: '需要支持', isAnonymous: true });
    await repository.deleteComment({ requestId: feedback.id, commentId: comment!.id, reason: '异常内容' });

    await expect(repository.listCommentsForOwner({ limit: 25, offset: 0 })).resolves.toMatchObject({ items: [expect.objectContaining({
      id: comment!.id, feedbackId: feedback.id, feedbackTitle: '结账优化', authorHandle: 'beta', isAnonymous: true, isDeleted: true,
    })] });
  });
});

import {
  type FeedbackStatus,
  type FeedbackDisplayStatus,
  FeedbackValidationError,
  feedbackDisplayStatus,
  normalizeCommentContent,
  normalizeCommentDeletionReason,
  normalizeFeedbackTitle,
  normalizeOfficialReplyContent,
  normalizeStatusNote,
  normalizeSuggestionContent,
  visibilityForFeedbackChange,
} from '../domain/feedback';

type Clock = () => number;

type FeedbackRow = {
  id: string;
  submitter_store_id: string;
  submitter_handle_snapshot: string;
  is_anonymous: number;
  title: string;
  content: string;
  status: FeedbackStatus;
  visibility: 'public' | 'hidden';
  hidden_reason: string | null;
  reviewed_at: string | null;
  vote_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  hidden_at: string | null;
  hidden_by_admin_id: string | null;
  voted: number;
  has_official_reply: number;
};

type CommentRow = {
  id: string;
  author_handle_snapshot: string;
  is_anonymous: number;
  content: string;
  created_at: string;
};

type ReplyRow = { id: string; content: string; created_at: string };
type OwnerCommentRow = {
  id: string;
  author_store_id: string;
  author_handle_snapshot: string;
  is_anonymous: number;
  content: string;
  created_at: string;
  visibility: 'public' | 'hidden';
  deleted_at: string | null;
  deleted_by_admin_id: string | null;
  deletion_reason: string | null;
};
type StatusHistoryRow = {
  id: string;
  previous_status: FeedbackStatus | null;
  next_status: FeedbackStatus;
  public_note: string | null;
  created_at: string;
};
export type PublicFeedbackComment = {
  id: string;
  authorLabel: string;
  content: string;
  createdAt: string;
};

export type PublicFeedbackReply = {
  id: string;
  authorLabel: '多件折扣';
  isOfficial: true;
  content: string;
  createdAt: string;
};

export type PublicFeedbackSummary = {
  id: string;
  authorLabel: string;
  isMine: boolean;
  title: string;
  excerpt: string;
  status: FeedbackStatus;
  voteCount: number;
  commentCount: number;
  voted: boolean;
  createdAt: string;
  hasOfficialReply: boolean;
};

export type PublicFeedbackDetail = Omit<PublicFeedbackSummary, 'excerpt' | 'hasOfficialReply'> & {
  content: string;
  updatedAt: string;
  canWithdraw: boolean;
  comments: PublicFeedbackComment[];
  replies: PublicFeedbackReply[];
};

export type PublicFeedbackStatusCounts = {
  all: number;
  pending: number;
  approved: number;
  in_progress: number;
  released: number;
  rejected: number;
};

export type PublicFeedbackList = {
  items: PublicFeedbackSummary[];
  total: number;
  page: number;
};

export type OwnerFeedbackComment = {
  id: string;
  storeId: string;
  authorHandle: string;
  isAnonymous: boolean;
  content: string;
  createdAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionReason: string | null;
};

export type OwnerFeedbackCommentListItem = OwnerFeedbackComment & { feedbackId: string; feedbackTitle: string; feedbackStatus: FeedbackStatus };

export type OwnerFeedbackSummary = {
  id: string;
  storeId: string;
  handle: string;
  isAnonymous: boolean;
  title: string;
  excerpt: string;
  status: FeedbackStatus;
  displayStatus: FeedbackDisplayStatus;
  hiddenReason: string | null;
  voteCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  hasOfficialReply: boolean;
};

export type OwnerFeedbackDetail = OwnerFeedbackSummary & {
  content: string;
  hiddenAt: string | null;
  hiddenBy: string | null;
  statusHistory: Array<{ id: string; previousStatus: FeedbackStatus | null; nextStatus: FeedbackStatus; note: string | null; createdAt: string }>;
  comments: OwnerFeedbackComment[];
  replies: PublicFeedbackReply[];
};

const feedbackStatuses: FeedbackStatus[] = ['pending', 'approved', 'in_progress', 'released', 'rejected'];
const publicFeedbackWhere = "f.visibility = 'public' AND f.status IN ('approved', 'in_progress', 'released', 'rejected')";
const authorVisibleWhere = "f.submitter_store_id = ? AND COALESCE(f.hidden_reason, '') NOT IN ('withdrawn_by_submitter', 'owner_rejected_display')";
const publicFeedbackWhereWithoutAlias = "visibility = 'public' AND status IN ('approved', 'in_progress', 'released', 'rejected')";

const toIso = (clock: Clock): string => new Date(clock()).toISOString();
const excerpt = (content: string): string => Array.from(content).slice(0, 160).join('');

function publicSummary(row: FeedbackRow, viewerStoreId: string): PublicFeedbackSummary {
  return {
    id: row.id,
    authorLabel: row.is_anonymous === 1 ? '匿名用户' : (row.submitter_handle_snapshot || '商家'),
    isMine: row.submitter_store_id === viewerStoreId,
    title: row.title,
    excerpt: excerpt(row.content),
    status: row.status,
    voteCount: row.vote_count,
    commentCount: Math.max(0, Number(row.comment_count) || 0),
    voted: row.voted === 1,
    createdAt: row.created_at,
    hasOfficialReply: row.has_official_reply === 1,
  };
}

function ownerSummary(row: FeedbackRow): OwnerFeedbackSummary {
  return {
    id: row.id,
    storeId: row.submitter_store_id,
    handle: row.submitter_handle_snapshot || row.submitter_store_id,
    isAnonymous: row.is_anonymous === 1,
    title: row.title,
    excerpt: excerpt(row.content),
    status: row.status,
    displayStatus: feedbackDisplayStatus({ status: row.status, hiddenReason: row.hidden_reason }),
    hiddenReason: row.hidden_reason,
    voteCount: row.vote_count,
    commentCount: Math.max(0, Number(row.comment_count) || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasOfficialReply: row.has_official_reply === 1,
  };
}

export class D1FeedbackRepository {
  constructor(private readonly database: D1Database, private readonly clock: Clock = Date.now) {}

  async listForViewer(storeId: string, filters: { status?: FeedbackStatus; sort?: 'newest' | 'votes'; query?: string; mine?: boolean; page?: number; pageSize?: number } = {}): Promise<PublicFeedbackList> {
    const where = [filters.mine ? authorVisibleWhere : publicFeedbackWhere];
    const filterValues: unknown[] = filters.mine ? [storeId] : [];
    if (filters.status) { where.push('f.status = ?'); filterValues.push(filters.status); }
    if (filters.query) { where.push('(f.title LIKE ? OR f.content LIKE ?)'); filterValues.push(`%${filters.query}%`, `%${filters.query}%`); }
    const order = filters.sort === 'votes' ? 'f.vote_count DESC, f.created_at DESC, f.id DESC' : 'f.created_at DESC, f.id DESC';
    const requestedPage = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? 30);
    const totalResult = await this.database.prepare(`SELECT COUNT(*) AS count FROM feedback_requests f WHERE ${where.join(' AND ')}`).bind(...filterValues).first<{ count: number }>();
    const total = Number(totalResult?.count ?? 0);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const offset = (page - 1) * pageSize;
    const result = await this.database.prepare(`SELECT f.id, f.submitter_store_id, f.submitter_handle_snapshot, f.is_anonymous, f.title, f.content, f.status, f.visibility, f.hidden_reason, f.reviewed_at, f.vote_count, f.created_at, f.updated_at,
      (SELECT COUNT(*) FROM feedback_comments c WHERE c.request_id = f.id AND c.visibility = 'public') AS comment_count,
      EXISTS(SELECT 1 FROM feedback_votes v WHERE v.request_id = f.id AND v.store_id = ?) AS voted,
      EXISTS(SELECT 1 FROM feedback_replies r WHERE r.request_id = f.id AND r.visibility = 'public') AS has_official_reply
      FROM feedback_requests f WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(storeId, ...filterValues, pageSize, offset).all<FeedbackRow>();
    return { items: result.results.map((row) => publicSummary(row, storeId)), total, page };
  }

  async countForViewer(storeId: string, mine: boolean): Promise<PublicFeedbackStatusCounts> {
    const where = [mine ? authorVisibleWhere.replaceAll('f.', '') : publicFeedbackWhereWithoutAlias];
    const values: unknown[] = mine ? [storeId] : [];
    const result = await this.database.prepare(`SELECT status, COUNT(*) AS count FROM feedback_requests WHERE ${where.join(' AND ')} GROUP BY status`).bind(...values).all<{ status: FeedbackStatus; count: number }>();
    const counts: PublicFeedbackStatusCounts = { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 };
    for (const row of result.results) {
      if (!feedbackStatuses.includes(row.status)) continue;
      const count = Number(row.count);
      if (Number.isFinite(count) && count >= 0) counts[row.status] = Math.floor(count);
    }
    counts.all = feedbackStatuses.reduce((total, status) => total + counts[status], 0);
    return counts;
  }

  async createSuggestion(input: { storeId: string; handle?: string; isAnonymous?: boolean; title: unknown; content: unknown; idempotencyKey: string }): Promise<PublicFeedbackDetail> {
    if (!input.storeId || !input.idempotencyKey || input.idempotencyKey.length > 200) throw new FeedbackValidationError('A store and idempotency key are required.');
    const title = normalizeFeedbackTitle(input.title);
    const content = normalizeSuggestionContent(input.content);
    const handle = input.handle || input.storeId;
    const isAnonymous = input.isAnonymous === true;
    const contentHash = await this.hash(`${title}\n${content}\n${handle}\n${isAnonymous ? '1' : '0'}`);
    const known = await this.database.prepare('SELECT request_id, content_hash FROM feedback_submission_keys WHERE store_id = ? AND idempotency_key = ? AND expires_at > ?')
      .bind(input.storeId, input.idempotencyKey, this.clock()).first<{ request_id: string; content_hash: string }>();
    if (known) {
      if (known.content_hash !== contentHash) throw new FeedbackValidationError('This submission key has already been used.');
      const detail = await this.readDetailForViewer(known.request_id, input.storeId);
      if (!detail) throw new FeedbackValidationError('The saved suggestion is unavailable.');
      return detail;
    }

    const id = crypto.randomUUID();
    const timestamp = toIso(this.clock);
    await this.database.batch([
      this.database.prepare(`INSERT INTO feedback_requests
        (id, submitter_store_id, submitter_handle_snapshot, is_anonymous, title, content, normalized_title, content_hash, status, visibility, vote_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'hidden', 0, ?, ?)`)
        .bind(id, input.storeId, handle, isAnonymous ? 1 : 0, title, content, title.toLocaleLowerCase(), contentHash, timestamp, timestamp),
      this.database.prepare(`INSERT INTO feedback_submission_keys (store_id, idempotency_key, request_id, content_hash, expires_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(input.storeId, input.idempotencyKey, id, contentHash, this.clock() + 86_400_000),
    ]);
    const detail = await this.readDetailForViewer(id, input.storeId);
    if (!detail) throw new Error('Feedback suggestion was not persisted.');
    return detail;
  }

  async readDetailForViewer(id: string, storeId: string): Promise<PublicFeedbackDetail | null> {
    return this.readDetail(id, storeId, false);
  }

  private async readDetail(id: string, storeId: string, includeHiddenForAdmin: boolean): Promise<PublicFeedbackDetail | null> {
    const accessClause = includeHiddenForAdmin ? 'f.id = ?' : `f.id = ? AND (${publicFeedbackWhere} OR (${authorVisibleWhere}))`;
    const bindings: unknown[] = includeHiddenForAdmin ? [storeId, id] : [storeId, id, storeId];
    const row = await this.database.prepare(`SELECT f.id, f.submitter_store_id, f.submitter_handle_snapshot, f.is_anonymous, f.title, f.content, f.status, f.visibility, f.hidden_reason, f.reviewed_at, f.vote_count, f.created_at, f.updated_at,
      (SELECT COUNT(*) FROM feedback_comments c WHERE c.request_id = f.id AND c.visibility = 'public') AS comment_count,
      EXISTS(SELECT 1 FROM feedback_votes v WHERE v.request_id = f.id AND v.store_id = ?) AS voted,
      EXISTS(SELECT 1 FROM feedback_replies r WHERE r.request_id = f.id AND r.visibility = 'public') AS has_official_reply
      FROM feedback_requests f WHERE ${accessClause}`).bind(...bindings).first<FeedbackRow>();
    if (!row) return null;

    const [comments, replies] = await this.database.batch([
      this.database.prepare("SELECT id, author_handle_snapshot, is_anonymous, content, created_at FROM feedback_comments WHERE request_id = ? AND visibility = 'public' ORDER BY created_at ASC, id ASC").bind(id),
      this.database.prepare("SELECT id, content, created_at FROM feedback_replies WHERE request_id = ? AND visibility = 'public' ORDER BY created_at ASC, id ASC").bind(id),
    ]);

    return {
      ...publicSummary(row, storeId),
      content: row.content,
      updatedAt: row.updated_at,
      canWithdraw: row.submitter_store_id === storeId
        && row.status === 'pending'
        && row.visibility === 'hidden'
        && row.reviewed_at === null
        && row.hidden_reason !== 'withdrawn_by_submitter',
      comments: (comments.results as CommentRow[]).map((comment) => ({
        id: comment.id,
        authorLabel: comment.is_anonymous === 1 ? '匿名用户' : comment.author_handle_snapshot,
        content: comment.content,
        createdAt: comment.created_at,
      })),
      replies: (replies.results as ReplyRow[]).map((reply) => ({
        id: reply.id,
        authorLabel: '多件折扣',
        isOfficial: true,
        content: reply.content,
        createdAt: reply.created_at,
      })),
    };
  }

  async listForOwner(filters: { status?: FeedbackStatus; display?: 'visible' | 'rejected_hidden' | 'withdrawn'; query?: string; store?: string; from?: string; to?: string; sort?: 'newest' | 'comments' | 'votes'; replied?: boolean; limit?: number; offset?: number } = {}): Promise<{ items: OwnerFeedbackSummary[]; total: number; offset: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filters.status) { where.push('f.status = ?'); values.push(filters.status); }
    if (filters.display === 'rejected_hidden') where.push("f.hidden_reason = 'owner_rejected_display'");
    if (filters.display === 'withdrawn') where.push("f.hidden_reason = 'withdrawn_by_submitter'");
    if (filters.display === 'visible') where.push("COALESCE(f.hidden_reason, '') NOT IN ('owner_rejected_display', 'withdrawn_by_submitter')");
    if (filters.query) { where.push('(f.title LIKE ? OR f.content LIKE ?)'); values.push(`%${filters.query}%`, `%${filters.query}%`); }
    if (filters.store) { where.push('(f.submitter_store_id LIKE ? OR f.submitter_handle_snapshot LIKE ?)'); values.push(`%${filters.store}%`, `%${filters.store}%`); }
    if (filters.from) { where.push('f.created_at >= ?'); values.push(filters.from); }
    if (filters.to) { where.push('f.created_at <= ?'); values.push(filters.to); }
    if (filters.replied) where.push("EXISTS (SELECT 1 FROM feedback_replies rr WHERE rr.request_id = f.id AND rr.visibility = 'public')");
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const offset = Math.max(filters.offset ?? 0, 0);
    const count = await this.database.prepare(`SELECT COUNT(*) AS count FROM feedback_requests f${clause}`).bind(...values).first<{ count: number }>();
    const order = filters.sort === 'comments'
      ? "comment_count DESC, f.created_at DESC, f.id DESC"
      : filters.sort === 'votes' ? 'f.vote_count DESC, f.created_at DESC, f.id DESC' : 'f.created_at DESC, f.id DESC';
    const rows = await this.database.prepare(`SELECT f.id, f.submitter_store_id, f.submitter_handle_snapshot, f.is_anonymous, f.title, f.content, f.status, f.visibility, f.hidden_reason, f.reviewed_at, f.vote_count, f.created_at, f.updated_at, f.hidden_at, f.hidden_by_admin_id,
      (SELECT COUNT(*) FROM feedback_comments c WHERE c.request_id = f.id AND c.visibility = 'public') AS comment_count,
      0 AS voted,
      EXISTS(SELECT 1 FROM feedback_replies r WHERE r.request_id = f.id AND r.visibility = 'public') AS has_official_reply
      FROM feedback_requests f${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, limit, offset).all<FeedbackRow>();
    return { items: rows.results.map(ownerSummary), total: Number(count?.count ?? 0), offset };
  }

  async listCommentsForOwner(filters: { query?: string; store?: string; from?: string; to?: string; limit?: number; offset?: number } = {}): Promise<{ items: OwnerFeedbackCommentListItem[]; total: number; offset: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filters.query) { where.push('(c.content LIKE ? OR f.title LIKE ? OR c.author_handle_snapshot LIKE ?)'); values.push(`%${filters.query}%`, `%${filters.query}%`, `%${filters.query}%`); }
    if (filters.store) { where.push('(c.author_store_id LIKE ? OR c.author_handle_snapshot LIKE ?)'); values.push(`%${filters.store}%`, `%${filters.store}%`); }
    if (filters.from) { where.push('c.created_at >= ?'); values.push(filters.from); }
    if (filters.to) { where.push('c.created_at <= ?'); values.push(filters.to); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const offset = Math.max(filters.offset ?? 0, 0);
    const count = await this.database.prepare(`SELECT COUNT(*) AS count FROM feedback_comments c JOIN feedback_requests f ON f.id = c.request_id${clause}`).bind(...values).first<{ count: number }>();
    const rows = await this.database.prepare(`SELECT c.id, c.request_id, c.author_store_id, c.author_handle_snapshot, c.is_anonymous, c.content, c.created_at, c.visibility, c.deleted_at, c.deleted_by_admin_id, c.deletion_reason, f.title, f.status
      FROM feedback_comments c JOIN feedback_requests f ON f.id = c.request_id${clause} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all<OwnerCommentRow & { request_id: string; title: string; status: FeedbackStatus }>();
    return {
      items: rows.results.map((comment) => ({ id: comment.id, feedbackId: comment.request_id, feedbackTitle: comment.title, feedbackStatus: comment.status,
        storeId: comment.author_store_id, authorHandle: comment.author_handle_snapshot || comment.author_store_id, isAnonymous: comment.is_anonymous === 1,
        content: comment.content, createdAt: comment.created_at, isDeleted: comment.visibility === 'hidden', deletedAt: comment.deleted_at,
        deletedBy: comment.deleted_by_admin_id, deletionReason: comment.deletion_reason })),
      total: Number(count?.count ?? 0), offset,
    };
  }

  async readDetailForOwner(id: string): Promise<OwnerFeedbackDetail | null> {
    const row = await this.database.prepare(`SELECT f.id, f.submitter_store_id, f.submitter_handle_snapshot, f.is_anonymous, f.title, f.content, f.status, f.visibility, f.hidden_reason, f.reviewed_at, f.vote_count, f.created_at, f.updated_at, f.hidden_at, f.hidden_by_admin_id,
      (SELECT COUNT(*) FROM feedback_comments c WHERE c.request_id = f.id AND c.visibility = 'public') AS comment_count,
      0 AS voted,
      EXISTS(SELECT 1 FROM feedback_replies r WHERE r.request_id = f.id AND r.visibility = 'public') AS has_official_reply
      FROM feedback_requests f WHERE f.id = ?`).bind(id).first<FeedbackRow>();
    if (!row) return null;
    const [comments, history, replies] = await this.database.batch([
      this.database.prepare('SELECT id, author_store_id, author_handle_snapshot, is_anonymous, content, created_at, visibility, deleted_at, deleted_by_admin_id, deletion_reason FROM feedback_comments WHERE request_id = ? ORDER BY created_at ASC, id ASC').bind(id),
      this.database.prepare('SELECT id, previous_status, next_status, public_note, created_at FROM feedback_status_history WHERE request_id = ? ORDER BY created_at ASC, id ASC').bind(id),
      this.database.prepare("SELECT id, content, created_at FROM feedback_replies WHERE request_id = ? AND visibility = 'public' ORDER BY created_at ASC, id ASC").bind(id),
    ]);
    return {
      ...ownerSummary(row),
      content: row.content,
      hiddenAt: row.hidden_at,
      hiddenBy: row.hidden_by_admin_id,
      statusHistory: (history.results as StatusHistoryRow[]).map((entry) => ({ id: entry.id, previousStatus: entry.previous_status, nextStatus: entry.next_status, note: entry.public_note, createdAt: entry.created_at })),
      comments: (comments.results as OwnerCommentRow[]).map((comment) => ({
        id: comment.id,
        storeId: comment.author_store_id,
        authorHandle: comment.author_handle_snapshot || comment.author_store_id,
        isAnonymous: comment.is_anonymous === 1,
        content: comment.content,
        createdAt: comment.created_at,
        isDeleted: comment.visibility === 'hidden',
        deletedAt: comment.deleted_at,
        deletedBy: comment.deleted_by_admin_id,
        deletionReason: comment.deletion_reason,
      })),
      replies: (replies.results as ReplyRow[]).map((reply) => ({ id: reply.id, authorLabel: '多件折扣', isOfficial: true, content: reply.content, createdAt: reply.created_at })),
    };
  }

  async toggleVote(requestId: string, storeId: string): Promise<{ voted: boolean; voteCount: number } | null> {
    const feedback = await this.database.prepare(`SELECT id FROM feedback_requests
      WHERE id = ? AND (${publicFeedbackWhereWithoutAlias} OR (
        submitter_store_id = ? AND status = 'pending' AND visibility = 'hidden'
        AND reviewed_at IS NULL AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'
      ))`).bind(requestId, storeId).first<{ id: string }>();
    if (!feedback) return null;
    const existing = await this.database.prepare('SELECT 1 AS value FROM feedback_votes WHERE request_id = ? AND store_id = ?').bind(requestId, storeId).first<{ value: number }>();
    if (existing) await this.database.prepare('DELETE FROM feedback_votes WHERE request_id = ? AND store_id = ?').bind(requestId, storeId).run();
    else await this.database.prepare('INSERT INTO feedback_votes (request_id, store_id, created_at) VALUES (?, ?, ?)').bind(requestId, storeId, toIso(this.clock)).run();
    const count = await this.database.prepare('SELECT vote_count FROM feedback_requests WHERE id = ?').bind(requestId).first<{ vote_count: number }>();
    return { voted: !existing, voteCount: count?.vote_count ?? 0 };
  }

  async createComment(input: { requestId: string; storeId: string; handle: string; content: unknown; isAnonymous: boolean }): Promise<PublicFeedbackComment | null> {
    const content = normalizeCommentContent(input.content);
    if (!input.storeId || !input.handle) throw new FeedbackValidationError('Comment author is invalid.');
    const feedback = await this.database.prepare(`SELECT id FROM feedback_requests
      WHERE id = ? AND (${publicFeedbackWhereWithoutAlias} OR (
        submitter_store_id = ? AND status = 'pending' AND visibility = 'hidden'
        AND reviewed_at IS NULL AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'
      ))`).bind(input.requestId, input.storeId).first<{ id: string }>();
    if (!feedback) return null;
    const id = crypto.randomUUID();
    const timestamp = toIso(this.clock);
    await this.database.prepare(`INSERT INTO feedback_comments (id, request_id, author_store_id, author_handle_snapshot, is_anonymous, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, input.requestId, input.storeId, input.handle, input.isAnonymous ? 1 : 0, content, timestamp).run();
    return {
      id,
      authorLabel: input.isAnonymous ? '匿名用户' : input.handle,
      content,
      createdAt: timestamp,
    };
  }

  async withdrawSuggestion(requestId: string, storeId: string): Promise<boolean> {
    const timestamp = toIso(this.clock);
    const [withdrawal] = await this.database.batch([
      this.database.prepare(`UPDATE feedback_requests
        SET visibility = 'hidden', hidden_reason = 'withdrawn_by_submitter', hidden_at = ?, hidden_by_admin_id = 'submitter', updated_at = ?
        WHERE id = ? AND submitter_store_id = ? AND status = 'pending' AND visibility = 'hidden'
          AND reviewed_at IS NULL AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'`).bind(timestamp, timestamp, requestId, storeId),
      this.database.prepare(`INSERT INTO feedback_admin_audit_logs (id, request_id, target_type, target_id, action, actor_service, created_at)
        SELECT ?, ?, 'feedback', ?, 'withdrawn_by_submitter', 'merchant', ? WHERE changes() = 1`).bind(crypto.randomUUID(), requestId, requestId, timestamp),
    ]);
    return Number(withdrawal.meta.changes ?? 0) === 1;
  }

  async updateStatus(input: { requestId: string; status: FeedbackStatus; hideFromMerchants?: boolean; note?: unknown }): Promise<PublicFeedbackDetail | null> {
    const note = normalizeStatusNote(input.note);
    const existing = await this.database.prepare("SELECT status FROM feedback_requests WHERE id = ? AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'").bind(input.requestId).first<{ status: FeedbackStatus }>();
    if (!existing) return null;

    const timestamp = toIso(this.clock);
    const { visibility, hiddenReason } = visibilityForFeedbackChange(input.status, input.hideFromMerchants === true);
    const action = hiddenReason === 'owner_rejected_display' ? 'rejected_hidden_by_owner' : 'status_changed';
    await this.database.batch([
      this.database.prepare(`UPDATE feedback_requests
        SET status = ?, visibility = ?, reviewed_at = ?, updated_at = ?, hidden_reason = ?,
          hidden_at = CASE WHEN ? = 'hidden' THEN ? ELSE NULL END,
          hidden_by_admin_id = CASE WHEN ? = 'hidden' THEN 'developer-platform' ELSE NULL END
        WHERE id = ?`).bind(input.status, visibility, timestamp, timestamp, hiddenReason, visibility, timestamp, visibility, input.requestId),
      this.database.prepare(`INSERT INTO feedback_status_history (id, request_id, previous_status, next_status, public_note, changed_by_admin_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'developer-platform', ?)`).bind(crypto.randomUUID(), input.requestId, existing.status, input.status, note, timestamp),
      this.database.prepare(`INSERT INTO feedback_admin_audit_logs (id, request_id, target_type, target_id, action, actor_service, created_at)
        VALUES (?, ?, 'feedback', ?, ?, 'developer-platform', ?)`).bind(crypto.randomUUID(), input.requestId, input.requestId, action, timestamp),
    ]);
    return this.readDetail(input.requestId, '', true);
  }

  async deleteComment(input: { requestId: string; commentId: string; reason?: unknown }): Promise<boolean> {
    const reason = normalizeCommentDeletionReason(input.reason);
    const timestamp = toIso(this.clock);
    const [deleted] = await this.database.batch([
      this.database.prepare(`UPDATE feedback_comments
        SET visibility = 'hidden', deleted_at = ?, deleted_by_admin_id = 'developer-platform', deletion_reason = ?
        WHERE id = ? AND request_id = ? AND visibility = 'public'`).bind(timestamp, reason, input.commentId, input.requestId),
      this.database.prepare(`INSERT INTO feedback_admin_audit_logs (id, request_id, target_type, target_id, action, actor_service, created_at)
        SELECT ?, ?, 'feedback_comment', ?, 'comment_deleted', 'developer-platform', ? WHERE changes() = 1`).bind(crypto.randomUUID(), input.requestId, input.commentId, timestamp),
    ]);
    return Number(deleted.meta.changes ?? 0) === 1;
  }

  async createOfficialReply(requestId: string, content: unknown): Promise<PublicFeedbackReply | null> {
    const normalized = normalizeOfficialReplyContent(content);
    const feedback = await this.database.prepare(`SELECT id FROM feedback_requests WHERE id = ? AND ${publicFeedbackWhereWithoutAlias}`).bind(requestId).first<{ id: string }>();
    if (!feedback) return null;
    const id = crypto.randomUUID();
    const timestamp = toIso(this.clock);
    await this.database.prepare(`INSERT INTO feedback_replies (id, request_id, content, visibility, author_service, created_at, updated_at)
      VALUES (?, ?, ?, 'public', 'developer-platform', ?, ?)`).bind(id, requestId, normalized, timestamp, timestamp).run();
    return { id, authorLabel: '多件折扣', isOfficial: true, content: normalized, createdAt: timestamp };
  }

  private async hash(value: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

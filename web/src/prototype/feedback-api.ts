export type FeedbackStatus = 'pending' | 'approved' | 'in_progress' | 'released' | 'rejected';

export type FeedbackComment = { id: string; authorLabel: string; content: string; createdAt: string };
export type FeedbackReply = { id: string; authorLabel: '多件折扣'; isOfficial: true; content: string; createdAt: string };
export type FeedbackDetail = { id: string; authorLabel: string; isMine: boolean; title: string; content: string; status: FeedbackStatus; voteCount: number; commentCount: number; voted: boolean; createdAt: string; updatedAt: string; canWithdraw: boolean; comments: FeedbackComment[]; replies: FeedbackReply[] };
export type FeedbackSummary = { id: string; authorLabel: string; isMine: boolean; title: string; excerpt: string; status: FeedbackStatus; voteCount: number; commentCount: number; voted: boolean; createdAt: string; hasOfficialReply: boolean };
export type FeedbackStatusFilter = FeedbackStatus | 'all';
export type FeedbackStatusCounts = { all: number; pending: number; approved: number; in_progress: number; released: number; rejected: number };
export type FeedbackList = { items: FeedbackSummary[]; counts: FeedbackStatusCounts; mineCount: number; page: number; pageSize: number; total: number; totalPages: number };
export type FeedbackFilters = { query?: string; status?: FeedbackStatus; sort?: 'newest' | 'votes'; mine?: boolean; page?: number; pageSize?: number };

type ApiError = { error?: string | { message?: string } };

async function data<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T } & ApiError;
  if (!response.ok || !body.data) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message ?? '请求失败');
  }
  return body.data;
}

export const emptyStatusCounts = (): FeedbackStatusCounts => ({ all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 });

export function formatFeedbackTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function normalizeStatusCounts(input: Partial<FeedbackStatusCounts> | undefined, items: FeedbackSummary[]): FeedbackStatusCounts {
  const counts = emptyStatusCounts();
  for (const item of items) counts[item.status] += 1;
  if (!input) { counts.all = items.length; return counts; }
  for (const key of Object.keys(counts) as Array<keyof FeedbackStatusCounts>) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) counts[key] = Math.floor(value);
  }
  return counts;
}

export async function readFeedback(fetcher: typeof fetch, filters: FeedbackFilters = {}): Promise<FeedbackList> {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.mine) params.set('mine', '1');
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const suffix = params.size ? `?${params.toString()}` : '';
  const result = await data<{ items: FeedbackSummary[]; counts?: Partial<FeedbackStatusCounts>; mineCount?: number; page?: number; pageSize?: number; total?: number; totalPages?: number }>(await fetcher(`/api/quantity-breaks/feedback${suffix}`));
  const page = Number.isInteger(result.page) && result.page! > 0 ? result.page! : filters.page ?? 1;
  const pageSize = Number.isInteger(result.pageSize) && result.pageSize! > 0 ? result.pageSize! : filters.pageSize ?? Math.max(1, result.items.length);
  const total = Number.isInteger(result.total) && result.total! >= 0 ? result.total! : result.items.length;
  const totalPages = Number.isInteger(result.totalPages) && result.totalPages! > 0 ? result.totalPages! : Math.max(1, Math.ceil(total / pageSize));
  const counts = normalizeStatusCounts(result.counts, result.items);
  return { items: result.items, counts, mineCount: typeof result.mineCount === 'number' && result.mineCount >= 0 ? Math.floor(result.mineCount) : counts.all, page, pageSize, total, totalPages };
}

export async function createSuggestion(input: { title: string; content: string; isAnonymous: boolean; idempotencyKey: string }, fetcher: typeof fetch): Promise<FeedbackDetail> {
  return (await data<{ feedback: FeedbackDetail }>(await fetcher('/api/quantity-breaks/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ title: input.title, content: input.content, isAnonymous: input.isAnonymous }),
  }))).feedback;
}

export async function readFeedbackDetail(id: string, fetcher: typeof fetch): Promise<FeedbackDetail> {
  return (await data<{ feedback: FeedbackDetail }>(await fetcher(`/api/quantity-breaks/feedback/${id}`))).feedback;
}

export async function voteFeedback(id: string, fetcher: typeof fetch): Promise<{ voted: boolean; voteCount: number }> {
  return (await data<{ vote: { voted: boolean; voteCount: number } }>(await fetcher(`/api/quantity-breaks/feedback/${id}/vote`, { method: 'POST' }))).vote;
}

export async function postComment(id: string, body: { content: string; isAnonymous: boolean }, fetcher: typeof fetch): Promise<FeedbackComment> {
  return (await data<{ comment: FeedbackComment }>(await fetcher(`/api/quantity-breaks/feedback/${id}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))).comment;
}

export async function withdrawSuggestion(id: string, fetcher: typeof fetch): Promise<void> {
  await data<{ withdrawn: true }>(await fetcher(`/api/quantity-breaks/feedback/${id}`, { method: 'DELETE' }));
}

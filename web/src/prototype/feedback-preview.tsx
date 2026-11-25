export type FeedbackStatus = 'pending' | 'approved' | 'in_progress' | 'released' | 'rejected';

export type FeedbackPreviewItem = {
  id: string;
  authorLabel?: string;
  isMine?: boolean;
  title: string;
  excerpt: string;
  status: FeedbackStatus;
  voteCount: number;
  voted: boolean;
  createdAt: string;
  hasOfficialReply: boolean;
};

import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageCircle, Plus, Search, ThumbsUp } from 'lucide-react';
import { FeedbackStatusFilters } from './FeedbackStatusFilters';
import { feedbackStatusEmojis } from './feedback-messages';
import { Button } from './ui';
import { emptyStatusCounts, type FeedbackStatusCounts } from './feedback-api';
import styles from '../pages/quantity-breaks.module.css';

export function FeedbackPreviewPage({ items, notifySuccess }: { items: FeedbackPreviewItem[]; notifySuccess: (message: string) => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | FeedbackStatus>('all');
  const [sort, setSort] = useState<'newest' | 'votes'>('newest');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [previewItems, setPreviewItems] = useState(items);
  const [dialogOpen, setDialogOpen] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const mineItems = useMemo(() => previewItems.filter((item) => !mine || item.isMine), [mine, previewItems]);
  const counts = useMemo<FeedbackStatusCounts>(() => mineItems.reduce((result, item) => ({ ...result, all: result.all + 1, [item.status]: result[item.status] + 1 }), emptyStatusCounts()), [mineItems]);
  const filtered = useMemo(() => mineItems
    .filter((item) => (status === 'all' || item.status === status) && (!deferredQuery || `${item.title} ${item.excerpt}`.toLowerCase().includes(deferredQuery)))
    .toSorted((left, right) => sort === 'votes' ? right.voteCount - left.voteCount : right.createdAt.localeCompare(left.createdAt)), [deferredQuery, mineItems, sort, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 9));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filtered.slice((currentPage - 1) * 9, currentPage * 9);
  const toggleVote = (id: string) => setPreviewItems((current) => current.map((item) => item.id !== id ? item : { ...item, voted: !item.voted, voteCount: item.voteCount + (item.voted ? -1 : 1) }));

  return <main className={styles.feedbackPreview}>
    <header className={styles.feedbackHeader}>
      <div><h1>需求与建议</h1><p>分享你的想法，和其他商家一起决定下一步。</p></div>
      <Button type="button" onClick={() => setDialogOpen(true)}><Plus size={16} aria-hidden="true" />建议</Button>
    </header>
    <p className={styles.feedbackPreviewNotice}>仅供 UI 预览，本页面的数据与投票不会保存。</p>
    <section className={styles.feedbackSurface} aria-label="建议列表">
      <div className={styles.feedbackToolbar}>
        <label className={styles.feedbackSearch}><span className={styles.srOnly}>搜索建议</span><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索标题或内容" /></label>
        <label className={styles.feedbackSort}>排序<select value={sort} onChange={(event) => { setSort(event.target.value as 'newest' | 'votes'); setPage(1); }}><option value="newest">最新发布</option><option value="votes">票数最高</option></select></label>
      </div>
      <FeedbackStatusFilters value={status} counts={counts} mine={mine} mineCount={previewItems.filter((item) => item.isMine).length} onChange={(next) => { setStatus(next); setPage(1); }} onMineChange={(next) => { setMine(next); setPage(1); }} />
      <div className={styles.feedbackList}>{visibleItems.map((item) => <article className={styles.feedbackCard} key={item.id} onClick={() => { window.location.hash = item.id; }}>
        <button className={styles.feedbackCardOpen} type="button" aria-label={`查看建议：${item.title}`} onClick={(event) => { event.stopPropagation(); window.location.hash = item.id; }} />
        <div className={styles.feedbackCardBody}><div className={styles.feedbackCardTop}><span className={`${styles.feedbackStatus} ${styles[`feedbackStatus${item.status}`]}`} title={item.status === 'pending' ? '当前为未审核的状态，需等到审核后才能给大家看看' : undefined}><span className={styles.feedbackStatusEmoji} aria-hidden="true">{feedbackStatusEmojis[item.status]}</span>{{ pending: '待审核', approved: '已批准', in_progress: '开发中', released: '已上线', rejected: '已拒绝' }[item.status]}</span><span className={styles.feedbackCardMeta}>{item.isMine && <b className={styles.feedbackMineBadge}><span aria-hidden="true">{feedbackStatusEmojis.mine}</span>我的建议</b>}{item.hasOfficialReply && <span className={styles.feedbackReplyBadge}><span aria-hidden="true">🛡️</span>官方已回复</span>}</span></div><h3 className={styles.feedbackDetailLink}>{item.title}<ArrowUpRight size={16} aria-hidden="true" /></h3><p>{item.excerpt}</p><small>{item.authorLabel ?? '商家'} · {item.createdAt}</small></div>
        <footer className={styles.feedbackCardFooter}><span><MessageCircle size={14} aria-hidden="true" />{item.hasOfficialReply ? '已回复' : '参与讨论'}</span><button className={styles.feedbackVote} type="button" aria-pressed={item.voted} onClick={(event) => { event.stopPropagation(); toggleVote(item.id); }}><ThumbsUp size={14} aria-hidden="true" />{item.voted ? `已投票 ${item.voteCount}` : `投票 ${item.voteCount}`}</button></footer>
      </article>)}</div>
      {!filtered.length && <div className={styles.feedbackEmpty}><strong>没有找到匹配的建议</strong><p>尝试更换搜索词或状态筛选。</p></div>}
      {filtered.length > 9 && <nav className={styles.feedbackPagination} aria-label="建议列表分页"><Button type="button" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</Button><span>第 {currentPage} / {totalPages} 页 · 共 {filtered.length} 条</span><Button type="button" variant="secondary" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</Button></nav>}
    </section>
    <FeedbackSubmitPreviewDialog open={dialogOpen} onCancel={() => setDialogOpen(false)} onSubmit={() => { setDialogOpen(false); notifySuccess('提交成功'); }} />
  </main>;
}

function LegacyFeedbackSubmitPreviewDialog({ open, onCancel, onSubmit }: {
  open: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}): JSX.Element | null {
  if (!open) return null;
  const submitPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return <div className={styles.feedbackDialogBackdrop} role="presentation">
    <section className={styles.feedbackDialog} role="dialog" aria-modal="true" aria-labelledby="feedback-submit-title">
      <form onSubmit={submitPreview}>
        <header><h2 id="feedback-submit-title">提交建议</h2></header>
        <label>标题<input name="title" type="text" maxLength={100} required /></label>
        <label>内容<textarea name="content" rows={6} maxLength={5000} required /></label>
        <footer><label className={styles.feedbackAnonymousField}><input name="isAnonymous" value="true" type="checkbox" /><span><strong>匿名发布</strong><small>勾选后不会显示店铺 handle</small></span></label><Button type="button" variant="secondary" onClick={onCancel}>取消</Button><Button type="submit">提交</Button></footer>
      </form>
    </section>
  </div>;
}

export function FeedbackSubmitPreviewDialog({ open, onCancel, onSubmit }: {
  open: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}): JSX.Element | null {
  if (!open) return null;
  const submitPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return <div className={styles.feedbackDialogBackdrop} role="presentation">
    <section className={styles.feedbackDialog} role="dialog" aria-modal="true" aria-labelledby="feedback-submit-title">
      <form onSubmit={submitPreview}>
        <header><h2 id="feedback-submit-title">提交建议</h2></header>
        <label>标题<input name="title" type="text" maxLength={100} required /></label>
        <label>内容<textarea name="content" rows={6} maxLength={5000} required /></label>
        <footer><label className={styles.feedbackAnonymousField}><input name="isAnonymous" value="true" type="checkbox" /><span><strong>匿名发布</strong></span></label><Button type="button" variant="secondary" onClick={onCancel}>取消</Button><Button type="submit">提交</Button></footer>
      </form>
    </section>
  </div>;
}

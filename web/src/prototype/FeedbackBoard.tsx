import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Plus, Search, ThumbsUp, X } from 'lucide-react';

import { FeedbackDetailDialog } from './FeedbackDetailDialog';
import { FeedbackStatusFilters } from './FeedbackStatusFilters';
import { feedbackStatusEmojis } from './feedback-messages';
import { Button } from './ui';
import { createSuggestion, emptyStatusCounts, formatFeedbackTimestamp, postComment, readFeedback, readFeedbackDetail, voteFeedback, withdrawSuggestion, type FeedbackDetail, type FeedbackStatus, type FeedbackStatusCounts, type FeedbackSummary } from './feedback-api';
import styles from '../pages/quantity-breaks.module.css';

const pageSize = 10;

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

function limitCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('');
}

function feedbackStatusKey(status: FeedbackStatus | 'all'): string {
  return `feedbackStatus${status === 'in_progress' ? 'InProgress' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`}`;
}

export function FeedbackBoard({ fetcher, notify, initialSuggestionDialogOpen = false, languageControl = null }: {
  fetcher: typeof fetch;
  notify: (message: string, tone?: 'success' | 'error' | 'notice') => void;
  initialSuggestionDialogOpen?: boolean;
  languageControl?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedbackSummary[]>([]);
  const [counts, setCounts] = useState<FeedbackStatusCounts>(emptyStatusCounts);
  const [mineCount, setMineCount] = useState(0);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'votes'>('newest');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [suggestionDialogOpen, setSuggestionDialogOpen] = useState(initialSuggestionDialogOpen);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set());
  const [votePulseId, setVotePulseId] = useState<string | null>(null);
  const notifyRef = useRef(notify);
  const detailRequestRef = useRef<string | null>(null);
  const votePulseTimerRef = useRef<number | undefined>(undefined);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  notifyRef.current = notify;

  useEffect(() => () => window.clearTimeout(votePulseTimerRef.current), []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const isFirstPage = page === 1;
      if (isFirstPage) setLoadState('loading');
      else {
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
      }
      void readFeedback(fetcher, { query: query.trim() || undefined, status: status === 'all' ? undefined : status, sort, mine, page, pageSize })
        .then((result) => {
          if (!active) return;
          setItems((current) => isFirstPage ? result.items : [...current, ...result.items.filter((item) => !current.some((known) => known.id === item.id))]);
          setCounts(result.counts);
          setMineCount(result.mineCount);
          setTotal(result.total);
          setTotalPages(result.totalPages);
          if (result.page !== page) setPage(result.page);
          setLoadState('ready');
        })
        .catch((caught) => {
          if (!active) return;
          setLoadState('error');
          notifyRef.current((caught as Error).message, 'error');
        })
        .finally(() => {
          if (!active) return;
          loadingMoreRef.current = false;
          setIsLoadingMore(false);
        });
    }, query ? 350 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [fetcher, mine, page, query, refreshKey, sort, status]);

  const resetPage = () => {
    loadingMoreRef.current = false;
    setPage(1);
  };
  const reload = () => { resetPage(); setRefreshKey((current) => current + 1); };

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || loadState !== 'ready' || page >= totalPages || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setIsLoadingMore(true);
      setPage((current) => current < totalPages ? current + 1 : current);
    }, { rootMargin: '240px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadState, page, totalPages]);

  const closeDetail = () => {
    detailRequestRef.current = null;
    setDetailLoading(false);
    setDetail(null);
  };

  const open = async (id: string) => {
    detailRequestRef.current = id;
    setDetail(null);
    setDetailLoading(true);
    try {
      const loaded = await readFeedbackDetail(id, fetcher);
      if (detailRequestRef.current === id) setDetail(loaded);
    } catch (caught) {
      if (detailRequestRef.current === id) notify((caught as Error).message, 'error');
    } finally {
      if (detailRequestRef.current === id) setDetailLoading(false);
    }
  };

  const pulseVote = (id: string) => {
    setVotePulseId(id);
    window.clearTimeout(votePulseTimerRef.current);
    votePulseTimerRef.current = window.setTimeout(() => setVotePulseId(null), 360);
  };

  const toggleListVote = async (id: string) => {
    if (votingIds.has(id)) return;
    setVotingIds((current) => new Set(current).add(id));
    try {
      const vote = await voteFeedback(id, fetcher);
      setItems((current) => current.map((item) => item.id === id ? { ...item, ...vote } : item));
      pulseVote(id);
    } catch (caught) {
      notify((caught as Error).message, 'error');
    } finally {
      setVotingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const updateVote = async () => {
    if (!detail) return;
    const vote = await voteFeedback(detail.id, fetcher);
    setDetail((current) => current ? { ...current, ...vote } : current);
    setItems((current) => current.map((item) => item.id === detail.id ? { ...item, ...vote } : item));
  };

  const addComment = async (comment: { content: string; isAnonymous: boolean }) => {
    if (!detail) return;
    const created = await postComment(detail.id, comment, fetcher);
    setDetail((current) => current ? { ...current, commentCount: current.commentCount + 1, comments: [...current.comments, created] } : current);
    setItems((current) => current.map((item) => item.id === detail.id ? { ...item, commentCount: item.commentCount + 1 } : item));
    notify(t('feedbackSubmitComment'), 'success');
  };

  const withdraw = async () => {
    if (!detail) return;
    await withdrawSuggestion(detail.id, fetcher);
    const removed = detail;
    closeDetail();
    setItems((current) => current.filter((item) => item.id !== removed.id));
    setCounts((current) => ({ ...current, all: Math.max(0, current.all - 1), [removed.status]: Math.max(0, current[removed.status] - 1) }));
    setMineCount((current) => Math.max(0, current - 1));
    setTotal((current) => Math.max(0, current - 1));
    reload();
    notify(t('feedbackWithdrawn'), 'success');
  };

  const submitSuggestion = async (input: { title: string; content: string; isAnonymous: boolean; idempotencyKey: string }) => {
    await createSuggestion(input, fetcher);
    setSuggestionDialogOpen(false);
    resetPage();
    reload();
    notify(t('feedbackReviewNotice'), 'success');
  };

  return <section className={styles.feedbackPreview}>
    <header className={styles.feedbackHeader}><div><h1>{t('feedbackTitle')}</h1><p>{t('feedbackShareIntro')}</p><p className={styles.feedbackContact}>{t('feedbackContact')}<a href="mailto:appideasbox@gmail.com">appideasbox@gmail.com</a></p></div><div className={styles.feedbackHeaderActions}>{languageControl}<Button type="button" onClick={() => setSuggestionDialogOpen(true)}><Plus size={16} aria-hidden="true" />{t('feedbackAddSuggestion')}</Button></div></header>
    <section className={styles.feedbackSurface} aria-label={t('feedbackListLabel')}>
      <div className={styles.feedbackToolbar}>
        <label className={styles.feedbackSearch}><span className={styles.srOnly}>{t('feedbackSearchLabel')}</span><Search aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder={t('feedbackSearchPlaceholder')} /></label>
        <label className={styles.feedbackSort}>{t('feedbackSort')}<select value={sort} onChange={(event) => { setSort(event.target.value as 'newest' | 'votes'); resetPage(); }}><option value="newest">{t('feedbackSortNewest')}</option><option value="votes">{t('feedbackSortVotes')}</option></select></label>
      </div>
      <FeedbackStatusFilters value={status} counts={counts} mine={mine} mineCount={mineCount} onChange={(next) => { setStatus(next); resetPage(); }} onMineChange={(next) => { setMine(next); if (next || status === 'pending') setStatus('all'); resetPage(); }} />
      {loadState === 'loading' && <FeedbackBoardLoading />}
      {loadState === 'error' && <div className={styles.feedbackEmpty} role="alert"><strong>{t('feedbackLoadErrorTitle')}</strong><p>{t('feedbackLoadErrorBody')}</p><Button type="button" variant="secondary" onClick={reload}>{t('feedbackRetry')}</Button></div>}
      {loadState === 'ready' && <div className={styles.feedbackList}>{items.map((item) => <article className={`${styles.feedbackCard} ${styles[`feedbackCard${item.status}`]}`} key={item.id} onClick={() => void open(item.id)}>
        <button className={styles.feedbackCardOpen} type="button" aria-label={t('feedbackViewSuggestion', { title: item.title })} onClick={(event) => { event.stopPropagation(); void open(item.id); }} />
        <div className={styles.feedbackCardBody}>
          <div className={styles.feedbackCardTop}><span className={`${styles.feedbackStatus} ${styles[`feedbackStatus${item.status}`]}`} title={item.status === 'pending' ? t('feedbackPendingHint') : undefined}><span className={styles.feedbackStatusEmoji} aria-hidden="true">{feedbackStatusEmojis[item.status]}</span>{t(feedbackStatusKey(item.status) as never)}</span>{item.hasOfficialReply && <span className={`${styles.feedbackStatus} ${styles.feedbackStatusin_progress} ${styles.feedbackOfficialReply}`}><span aria-hidden="true">🛡️</span>{t('feedbackOfficialReply')}</span>}{item.isMine && <span className={`${styles.feedbackStatus} ${styles.feedbackStatusin_progress}`}><span aria-hidden="true">{feedbackStatusEmojis.mine}</span>{t('feedbackMySuggestions')}</span>}</div>
          <h3 className={styles.feedbackDetailLink}>{item.title}</h3>
          <p>{item.excerpt}</p>
        </div>
        <footer className={styles.feedbackCardFooter}><span><MessageCircle size={14} aria-hidden="true" />{t('feedbackComments')} {item.commentCount}</span><button className={`${styles.feedbackVote} ${votePulseId === item.id ? styles.feedbackVotePulse : ''}`} type="button" aria-pressed={item.voted} disabled={votingIds.has(item.id)} onClick={(event) => { event.stopPropagation(); void toggleListVote(item.id); }}><ThumbsUp size={14} aria-hidden="true" />{item.voted ? `${t('feedbackVoted')} ${item.voteCount}` : `${t('feedbackVote')} ${item.voteCount}`}</button></footer>
        <time className={styles.feedbackCardTime} dateTime={item.createdAt}>{formatFeedbackTimestamp(item.createdAt)}</time>
      </article>)}{isLoadingMore && <FeedbackLoadMoreCards />}</div>}
      {loadState === 'ready' && !items.length && <div className={styles.feedbackEmpty}><strong>{t('feedbackEmptyTitle')}</strong><p>{t('feedbackEmptyBody')}</p></div>}
      {loadState === 'ready' && page < totalPages && <div ref={loadMoreRef} className={styles.feedbackLoadMore} role="status" aria-live="polite" aria-label={t('feedbackLoading')}>{isLoadingMore && <span>{t('feedbackLoading')}</span>}</div>}
    </section>
    {suggestionDialogOpen && <SubmitFeedbackDialog onClose={() => setSuggestionDialogOpen(false)} onSubmit={submitSuggestion} />}
    {detailLoading && <FeedbackDetailLoadingDialog onClose={closeDetail} />}
    {detail && <FeedbackDetailDialog detail={detail} onClose={closeDetail} onVote={updateVote} onCommentSubmit={addComment} onWithdraw={withdraw} />}
  </section>;
}

function FeedbackDetailLoadingDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.feedbackDialogBackdrop} role="presentation"><section className={styles.feedbackDetailLoadingDialog} role="dialog" aria-modal="true" aria-busy="true" aria-labelledby="feedback-detail-loading-title"><header><h2 id="feedback-detail-loading-title">{t('feedbackDetailLoading')}</h2><button type="button" className={styles.feedbackCloseButton} aria-label={t('feedbackClose')} title={t('feedbackClose')} onClick={onClose}>×</button></header><div className={styles.feedbackDetailLoadingLines}><span /><span /><span /></div></section></div>;
}

export function FeedbackBoardLoading() {
  const { t } = useTranslation();
  return <div className={styles.feedbackSkeleton} role="status" aria-busy="true" aria-label={t('feedbackLoading')}><span /><span /><span /></div>;
}

function FeedbackLoadMoreCards() {
  return <>{[0, 1, 2].map((index) => <div className={`${styles.feedbackCard} ${styles.feedbackLoadMoreCard}`} aria-hidden="true" key={index}><span /><span /><span /></div>)}</>;
}

function LegacySubmitFeedbackDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { title: string; content: string; isAnonymous: boolean; idempotencyKey: string }) => Promise<void> }) {
  const { i18n, t } = useTranslation();
  const feedbackText = (_locale: string | undefined, key: string) => t(`feedback${key.charAt(0).toUpperCase()}${key.slice(1)}` as never);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const keyRef = useRef(idempotencyKey());
  const canSubmit = !isComposing && title.trim().length > 0 && content.trim().length > 0 && !isSubmitting;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError('');
    setIsSubmitting(true);
    try { await onSubmit({ title: title.trim(), content: content.trim(), isAnonymous, idempotencyKey: keyRef.current }); }
    catch (caught) { setError((caught as Error).message); }
    finally { setIsSubmitting(false); }
  };
  // @ts-expect-error The compact JSX form infers input targets as EventTarget in this generated line.
  return <div className={styles.feedbackDialogBackdrop} role="presentation"><section className={styles.feedbackDialog} role="dialog" aria-modal="true" aria-labelledby="feedback-submit-title"><form onSubmit={(event) => void submit(event)}><header className={styles.feedbackDialogHeader}><h2 id="feedback-submit-title">{feedbackText(i18n.language, 'suggestion')}</h2><button type="button" className={styles.feedbackCloseButton} aria-label="关闭" title="关闭" disabled={isSubmitting} onClick={onClose}><X aria-hidden="true" /></button></header><label htmlFor="feedback-title">标题<input id="feedback-title" name="title" type="text" value={title} disabled={isSubmitting} onCompositionStart={() => setIsComposing(true)} onCompositionEnd={(event) => { setIsComposing(false); setTitle(limitCodePoints(event.currentTarget.value, 100)); }} onChange={(event) => setTitle(isComposing ? event.target.value : limitCodePoints(event.target.value, 100))} /><small className={styles.feedbackFieldCounter}>{countCodePoints(title)}/100</small></label><label htmlFor="feedback-content">内容<textarea id="feedback-content" name="content" rows={6} value={content} disabled={isSubmitting} onCompositionStart={() => setIsComposing(true)} onCompositionEnd={(event) => { setIsComposing(false); setContent(limitCodePoints(event.target.value, 400)); }} onChange={(event) => setContent(isComposing ? event.target.value : limitCodePoints(event.target.value, 400))} /><small className={styles.feedbackFieldCounter}>{countCodePoints(content)}/400</small></label>{error && <p className={styles.feedbackFormError} role="alert">{error}</p>}<footer><label className={styles.feedbackAnonymousField}><input name="isAnonymous" checked={isAnonymous} type="checkbox" disabled={isSubmitting} onChange={(event) => setIsAnonymous(event.currentTarget.checked)} /><span><strong>{feedbackText(i18n.language, 'anonymous')}</strong><small>{feedbackText(i18n.language, 'anonymousHint')}</small></span></label><Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>{feedbackText(i18n.language, 'cancel')}</Button><Button type="submit" disabled={!canSubmit}>{isSubmitting ? feedbackText(i18n.language, 'submitting') : feedbackText(i18n.language, 'submit')}</Button></footer></form></section></div>;
}

export function SubmitFeedbackDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { title: string; content: string; isAnonymous: boolean; idempotencyKey: string }) => Promise<void> }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const keyRef = useRef(idempotencyKey());
  const canSubmit = !isComposing && title.trim().length > 0 && content.trim().length > 0 && !isSubmitting;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError('');
    setIsSubmitting(true);
    try { await onSubmit({ title: title.trim(), content: content.trim(), isAnonymous, idempotencyKey: keyRef.current }); }
    catch (caught) { setError((caught as Error).message); }
    finally { setIsSubmitting(false); }
  };

  return <div className={styles.feedbackDialogBackdrop} role="presentation">
    <section className={styles.feedbackDialog} role="dialog" aria-modal="true" aria-labelledby="feedback-submit-title">
      <form onSubmit={(event) => void submit(event)}>
        <header className={styles.feedbackDialogHeader}>
          <h2 id="feedback-submit-title">{t('feedbackSuggestion')}</h2>
          <button type="button" className={styles.feedbackCloseButton} aria-label={t('feedbackClose')} title={t('feedbackClose')} disabled={isSubmitting} onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <label htmlFor="feedback-title">{t('feedbackTitleLabel')}
          <input id="feedback-title" name="title" type="text" value={title} disabled={isSubmitting} onCompositionStart={() => setIsComposing(true)} onCompositionEnd={(event) => { setIsComposing(false); setTitle(limitCodePoints(event.currentTarget.value, 100)); }} onChange={(event) => setTitle(isComposing ? event.target.value : limitCodePoints(event.currentTarget.value, 100))} />
          <small className={styles.feedbackFieldCounter}>{countCodePoints(title)}/100</small>
        </label>
        <label htmlFor="feedback-content">{t('feedbackContentLabel')}
          <textarea id="feedback-content" name="content" rows={6} value={content} disabled={isSubmitting} onCompositionStart={() => setIsComposing(true)} onCompositionEnd={(event) => { setIsComposing(false); setContent(limitCodePoints(event.currentTarget.value, 1000)); }} onChange={(event) => setContent(isComposing ? event.target.value : limitCodePoints(event.target.value, 1000))} />
          <small className={styles.feedbackFieldCounter}>{countCodePoints(content)}/1000</small>
        </label>
        {error && <p className={styles.feedbackFormError} role="alert">{error}</p>}
        <footer>
          <label className={styles.feedbackAnonymousField}><input name="isAnonymous" checked={isAnonymous} type="checkbox" disabled={isSubmitting} onChange={(event) => setIsAnonymous(event.currentTarget.checked)} /><span><strong>{t('feedbackAnonymous')}</strong></span></label>
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>{t('feedbackCancel')}</Button>
          <Button type="submit" disabled={!canSubmit}>{isSubmitting ? t('feedbackSubmitting') : t('feedbackSubmit')}</Button>
        </footer>
      </form>
    </section>
  </div>;
}

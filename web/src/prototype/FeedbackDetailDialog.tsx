import { useState, type FormEvent } from 'react';
import { ThumbsUp, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from './ui';
import { BridgeConfirmation } from './BridgeConfirmation';
import { formatFeedbackTimestamp, type FeedbackDetail } from './feedback-api';
import styles from '../pages/quantity-breaks.module.css';
import { feedbackStatusEmojis } from './feedback-messages';

export const formatFeedbackDate = formatFeedbackTimestamp;

export function FeedbackDetailDialog({ detail, onClose, onVote, onCommentSubmit, onWithdraw }: {
  detail: FeedbackDetail;
  onClose: () => void;
  onVote: () => Promise<void>;
  onCommentSubmit: (comment: { content: string; isAnonymous: boolean }) => Promise<void>;
  onWithdraw: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [votePulse, setVotePulse] = useState(false);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const canSubmitComment = comment.trim().length > 0 && !isSubmitting;
  const discussion = [
    ...detail.comments.map((item) => ({ ...item, kind: 'comment' as const })),
    ...detail.replies.map((item) => ({ ...item, kind: 'official' as const })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitComment) return;
    setError('');
    setIsSubmitting(true);
    try {
      await onCommentSubmit({ content: comment.trim(), isAnonymous });
      setComment('');
      setIsAnonymous(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const vote = async () => {
    setIsVoting(true);
    try {
      await onVote();
      setVotePulse(true);
      window.setTimeout(() => setVotePulse(false), 360);
    }
    catch (caught) { setError((caught as Error).message); }
    finally { setIsVoting(false); }
  };

  const withdraw = async () => {
    setError('');
    setIsWithdrawing(true);
    try { await onWithdraw(); }
    catch (caught) { setError((caught as Error).message); }
    finally { setIsWithdrawing(false); }
  };

  return <div className={styles.feedbackDialogBackdrop} role="presentation">
    <section className={styles.feedbackDetailDialog} role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title">
      <header>
      <div><div className={styles.feedbackDetailBadges}><span className={`${styles.feedbackStatus} ${styles[`feedbackStatus${detail.status}`]}`} title={detail.status === 'pending' ? t('feedbackPendingHint') : undefined}><span className={styles.feedbackStatusEmoji} aria-hidden="true">{feedbackStatusEmojis[detail.status]}</span>{t(`feedbackStatus${detail.status === 'in_progress' ? 'InProgress' : `${detail.status.charAt(0).toUpperCase()}${detail.status.slice(1)}`}` as never)}</span>{detail.isMine && <b className={styles.feedbackMineBadge}><span aria-hidden="true">{feedbackStatusEmojis.mine}</span>{t('feedbackMySuggestions')}</b>}</div><h2 id="feedback-detail-title">{detail.title}</h2></div>
        <button type="button" className={styles.feedbackCloseButton} aria-label={t('feedbackClose')} title={t('feedbackClose')} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className={styles.feedbackDialogScroll}>
        <p className={styles.feedbackFullContent}>{detail.content}</p>
        <div className={styles.feedbackDetailAuthor}><strong>{detail.authorLabel}</strong><time dateTime={detail.createdAt}>{formatFeedbackDate(detail.createdAt)}</time></div>
        <div className={styles.feedbackDetailActions}><button type="button" className={`${styles.feedbackVote} ${votePulse ? styles.feedbackVotePulse : ''}`} aria-pressed={detail.voted} disabled={isVoting} onClick={() => void vote()}><ThumbsUp size={15} aria-hidden="true" />{detail.voted ? `${t('feedbackVoted')} ${detail.voteCount}` : `${t('feedbackVote')} ${detail.voteCount}`}</button></div>
        <div className={styles.feedbackCommentDivider} aria-label={t('feedbackCommentCount', { count: detail.commentCount })}><span />{t('feedbackCommentCount', { count: detail.commentCount })}<span /></div>
        <section className={styles.feedbackDiscussion} aria-label={t('feedbackDiscussion')}>
          {discussion.map((item) => item.kind === 'official' ? <article className={styles.feedbackOfficialReply} key={item.id}><p>{item.content}</p><footer className={styles.feedbackDiscussionMeta}><strong><img className={styles.feedbackOfficialAvatar} src="https://img.myshopline.com/image/devcenter/8888/91404ae5d921457299c4416c4706b292.png" alt="" aria-hidden="true" />{t('campaignTitle')}</strong><time dateTime={item.createdAt}>{formatFeedbackDate(item.createdAt)}</time></footer></article> : <article key={item.id}><p>{item.content}</p><footer className={styles.feedbackDiscussionMeta}><strong>{item.authorLabel}</strong><time dateTime={item.createdAt}>{formatFeedbackDate(item.createdAt)}</time></footer></article>)}
          {!discussion.length && <p className={styles.feedbackMuted}>{t('feedbackNoDiscussion')}</p>}
        </section>
        <form onSubmit={(event) => void submit(event)} className={styles.feedbackComposer}>
          <label htmlFor="feedback-comment">{t('feedbackComment')}</label><textarea id="feedback-comment" name="content" value={comment} maxLength={400} rows={4} disabled={isSubmitting} onChange={(event) => setComment(event.currentTarget.value)} /><small className={styles.feedbackFieldCounter}>{Array.from(comment).length}/400</small>
          {error && <p className={styles.feedbackFormError} role="alert">{error}</p>}
          <footer><label className={styles.feedbackCheckbox}><input name="isAnonymous" checked={isAnonymous} type="checkbox" disabled={isSubmitting} onChange={(event) => setIsAnonymous(event.currentTarget.checked)} /> {t('feedbackAnonymous')}</label>{detail.canWithdraw && <Button type="button" variant="quiet" className={styles.feedbackWithdrawButton} disabled={isWithdrawing || isSubmitting} onClick={() => setConfirmWithdrawal(true)}><Trash2 size={15} aria-hidden="true" />{t('feedbackWithdrawSuggestion')}</Button>}<Button type="submit" disabled={!canSubmitComment}>{isSubmitting ? t('feedbackSubmitting') : t('feedbackSubmitComment')}</Button></footer>
        </form>
      </div>
    </section>
    {confirmWithdrawal && <BridgeConfirmation title={t('feedbackWithdrawConfirmTitle')} content={t('feedbackWithdrawConfirmContent')} type="danger" onCancel={() => setConfirmWithdrawal(false)} onConfirm={() => { setConfirmWithdrawal(false); void withdraw(); }} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="feedback-withdraw-title"><h2 id="feedback-withdraw-title">{t('feedbackWithdrawConfirmTitle')}</h2><p>{t('feedbackWithdrawConfirmContent')}</p><div><Button type="button" variant="secondary" disabled={isWithdrawing} onClick={() => setConfirmWithdrawal(false)}>{t('feedbackCancel')}</Button><Button type="button" variant="danger" disabled={isWithdrawing} onClick={() => { setConfirmWithdrawal(false); void withdraw(); }}>{t('feedbackConfirmWithdraw')}</Button></div></div></div>} />}
  </div>;
}

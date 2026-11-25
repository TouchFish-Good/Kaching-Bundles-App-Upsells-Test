import { Button } from './ui';
import type { FeedbackStatus, FeedbackStatusCounts, FeedbackStatusFilter } from './feedback-api';
import { feedbackStatusEmojis } from './feedback-messages';
import { useTranslation } from 'react-i18next';
import styles from '../pages/quantity-breaks.module.css';
const filters: Array<{ value: FeedbackStatusFilter; key: 'all' | FeedbackStatus; emoji: string }> = [
  { value: 'all', key: 'all', emoji: feedbackStatusEmojis.all },
  { value: 'approved', key: 'approved', emoji: feedbackStatusEmojis.approved },
  { value: 'in_progress', key: 'in_progress', emoji: feedbackStatusEmojis.in_progress },
  { value: 'released', key: 'released', emoji: feedbackStatusEmojis.released },
  { value: 'rejected', key: 'rejected', emoji: feedbackStatusEmojis.rejected },
];

export function FeedbackStatusFilters({ value, counts, onChange, mine, mineCount, onMineChange }: {
  value: FeedbackStatusFilter;
  counts: FeedbackStatusCounts;
  onChange: (value: FeedbackStatusFilter) => void;
  mine: boolean;
  mineCount: number;
  onMineChange: (mine: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = (key: 'all' | FeedbackStatus): string => String(t(`feedbackStatus${key === 'in_progress' ? 'InProgress' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}` as never));
  return <div className={styles.feedbackStatusFilters} role="group" aria-label={t('feedbackStatusFilterLabel')}>
    {filters.map(({ value: filter, key, emoji }) => <Button
      key={filter}
      type="button"
      variant="quiet"
      className={`${styles.feedbackStatusFilter} ${styles[`feedbackStatusFilter${filter}`]} ${value === filter ? styles.feedbackStatusFilterActive : ''}`}
      aria-pressed={value === filter}
      onClick={() => onChange(filter)}
    >
      <span className={styles.feedbackStatusEmoji} role="img" aria-label={label(key)} title={label(key)}>{emoji}</span>
      <span>{label(key)}</span>
      <span className={styles.feedbackStatusCount}>{counts[filter]}</span>
    </Button>)}
    <Button
      type="button"
      variant="quiet"
      className={`${styles.feedbackStatusFilter} ${styles.feedbackMineFilter} ${mine ? styles.feedbackStatusFilterActive : ''}`}
      aria-pressed={mine}
      onClick={() => onMineChange(!mine)}
    >
      <span className={styles.feedbackStatusEmoji} role="img" aria-label={t('feedbackMySuggestions')} title={t('feedbackMySuggestions')}>{feedbackStatusEmojis.mine}</span>
      <span>{t('feedbackMySuggestions')}</span>
      <span className={styles.feedbackStatusCount}>{mineCount}</span>
    </Button>
    {mine && <Button
      type="button"
      variant="quiet"
      className={`${styles.feedbackStatusFilter} ${styles.feedbackStatusFilterpending} ${value === 'pending' ? styles.feedbackStatusFilterActive : ''}`}
      aria-pressed={value === 'pending'}
      onClick={() => onChange('pending')}
    >
      <span className={styles.feedbackStatusEmoji} role="img" aria-label={t('feedbackStatusPending')} title={t('feedbackStatusPending')}>{feedbackStatusEmojis.pending}</span>
      <span>{t('feedbackStatusPending')}</span>
      <span className={styles.feedbackStatusCount}>{counts.pending}</span>
    </Button>}
  </div>;
}

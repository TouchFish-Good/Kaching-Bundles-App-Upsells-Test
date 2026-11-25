export const FEEDBACK_STATUSES = ['pending', 'approved', 'in_progress', 'released', 'rejected'] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackDisplayStatus = FeedbackStatus | 'rejected_hidden' | 'withdrawn';

export class FeedbackValidationError extends Error {}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeFeedbackText(value: unknown, minimum: number, maximum: number, field: string): string {
  if (typeof value !== 'string') throw new FeedbackValidationError(`${field} is required.`);
  const normalized = value.normalize('NFC').replaceAll('\r\n', '\n').trim();
  const length = codePointLength(normalized);
  if (length < minimum || length > maximum) {
    throw new FeedbackValidationError(`${field} must be between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
}

export function normalizeFeedbackTitle(value: unknown): string {
  return normalizeFeedbackText(value, 1, 100, 'Title');
}

export function normalizeSuggestionContent(value: unknown): string {
  return normalizeFeedbackText(value, 1, 1000, 'Content');
}

export function normalizeCommentContent(value: unknown): string {
  return normalizeFeedbackText(value, 1, 400, 'Comment');
}

export function normalizeCommentDeletionReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return normalizeFeedbackText(value, 1, 500, 'Deletion reason');
}

export function normalizeOfficialReplyContent(value: unknown): string {
  return normalizeFeedbackText(value, 1, 5000, 'Reply');
}

export function normalizeStatusNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return normalizeFeedbackText(value, 1, 500, 'Status note');
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isPublicFeedbackStatus(status: FeedbackStatus): boolean {
  return status === 'approved' || status === 'in_progress' || status === 'released' || status === 'rejected';
}

export function visibilityForFeedbackStatus(status: FeedbackStatus): 'public' | 'hidden' {
  return isPublicFeedbackStatus(status) ? 'public' : 'hidden';
}

export function visibilityForFeedbackChange(status: FeedbackStatus, hideFromMerchants = false): { visibility: 'public' | 'hidden'; hiddenReason: string | null } {
  if (hideFromMerchants) {
    if (status !== 'rejected') throw new FeedbackValidationError('Only rejected feedback can be hidden from merchants.');
    return { visibility: 'hidden', hiddenReason: 'owner_rejected_display' };
  }
  const visibility = visibilityForFeedbackStatus(status);
  return { visibility, hiddenReason: visibility === 'hidden' ? 'reviewed_by_developer' : null };
}

export function feedbackDisplayStatus(input: { status: FeedbackStatus; hiddenReason: string | null }): FeedbackDisplayStatus {
  if (input.hiddenReason === 'withdrawn_by_submitter') return 'withdrawn';
  if (input.hiddenReason === 'owner_rejected_display') return 'rejected_hidden';
  return input.status;
}

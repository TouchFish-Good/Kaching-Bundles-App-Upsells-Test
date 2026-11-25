import { describe, expect, it } from 'vitest';

import { feedbackDisplayStatus, visibilityForFeedbackChange } from '../src/domain/feedback';

describe('feedback owner moderation visibility', () => {
  it('maps a rejected suggestion hidden by the Owner to the private moderation status', () => {
    expect(visibilityForFeedbackChange('rejected', true)).toEqual({ visibility: 'hidden', hiddenReason: 'owner_rejected_display' });
    expect(feedbackDisplayStatus({ status: 'rejected', hiddenReason: 'owner_rejected_display' })).toBe('rejected_hidden');
  });

  it('keeps an ordinary rejected suggestion public', () => {
    expect(visibilityForFeedbackChange('rejected', false)).toEqual({ visibility: 'public', hiddenReason: null });
    expect(feedbackDisplayStatus({ status: 'rejected', hiddenReason: null })).toBe('rejected');
  });

  it('does not permit hidden display mode for non-rejected workflow states', () => {
    expect(() => visibilityForFeedbackChange('approved', true)).toThrow('Only rejected feedback can be hidden from merchants.');
  });
});

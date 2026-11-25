import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('remote publication and feedback migrations contain no explicit transaction statements', async () => {
  const sources = await Promise.all([
    readFile(new URL('../migrations/0002_published_campaign_updates.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0004_feedback_board.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0005_feedback_authors.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0007_feedback_content_limits.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0008_feedback_rejected_public.sql', import.meta.url), 'utf8'),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /\bBEGIN(?:\s+TRANSACTION)?\s*;/i);
    assert.doesNotMatch(source, /\bCOMMIT\s*;/i);
  }
});

test('rejected feedback migration makes only non-withdrawn feedback public', async () => {
  const source = await readFile(new URL('../migrations/0008_feedback_rejected_public.sql', import.meta.url), 'utf8');

  assert.match(source, /SET visibility = 'public'/);
  assert.match(source, /status = 'rejected'/);
  assert.match(source, /withdrawn_by_submitter/);
});

test('campaign operation queue migration creates the remote tables used by draft deletion and expired cleanup', async () => {
  const source = await readFile(new URL('../migrations/0017_campaign_operation_queue.sql', import.meta.url), 'utf8');

  assert.match(source, /CREATE TABLE IF NOT EXISTS quantity_breaks_campaign_operation_batches/i);
  assert.match(source, /CREATE TABLE IF NOT EXISTS quantity_breaks_campaign_operations/i);
  assert.match(source, /idx_campaign_operations_due/i);
  assert.doesNotMatch(source, /\bBEGIN(?:\s+TRANSACTION)?\s*;/i);
  assert.doesNotMatch(source, /\bCOMMIT\s*;/i);
});

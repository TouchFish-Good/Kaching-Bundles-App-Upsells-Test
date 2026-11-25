import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('campaign editor lets the App Bridge SaveBar exit directly while the page exit confirms', async () => {
  const source = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ SaveBar \} from ['"]@shoplineos\/app-bridge['"]/);
  assert.match(source, /SaveBar\.create\(app\)/);
  assert.match(source, /saveBar\.show\(/);
  assert.match(source, /onSave: \(\) => \{ void saveRef\.current\(campaign \? 'update' : 'publish'\); \}/);
  assert.match(source, /onCancel: exitFromSaveBar/);
  assert.doesNotMatch(source, /onCancel: requestExit/);
  assert.match(source, /variant="secondary" onClick=\{requestExit\}/);
  assert.match(source, /exitConfirmationOpen/);
  assert.match(source, /BridgeConfirmation/);
  assert.match(source, /onConfirm=\{confirmExit\}/);
  assert.match(source, /save\('draft'\)/);
  assert.match(source, /saveBar\.hide\(\)/);
});

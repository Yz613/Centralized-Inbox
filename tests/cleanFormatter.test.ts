import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFormatText, applyEmphasis } from '../src/utils/cleanFormatter';

test('cleanFormatText converts bulleted and numbered items into real HTML lists', () => {
  const input = `Hey Sarah,
Here are the launch deliverables:
1. Complete the onboarding wizard
2. Fix responsive layout for mobile
3. Test Stripe checkout flow
Thanks!`;

  const result = cleanFormatText(input);

  assert.ok(result.hasLists, 'Should detect and generate lists');
  assert.ok(result.html.includes('<ol style="list-style-type: decimal;'), 'Should contain an <ol> list');
  assert.ok(result.html.includes('Complete the onboarding wizard</li>'), 'Should contain first list item');
  assert.ok(result.html.includes('Fix responsive layout for mobile</li>'), 'Should contain second list item');
  assert.ok(result.html.includes('Test Stripe checkout flow</li>'), 'Should contain third list item');
  assert.ok(result.html.includes('Hey Sarah,</p>'), 'Greeting should be separated');
});

test('cleanFormatText handles dash/bullet list items', () => {
  const input = `Team, please check these items:
- Update API keys
- Review the pull request
- Deploy to staging`;

  const result = cleanFormatText(input);

  assert.ok(result.hasLists);
  assert.ok(result.html.includes('<ul style="list-style-type: disc;'));
  assert.ok(result.html.includes('Update API keys</li>'));
  assert.ok(result.html.includes('Review the pull request</li>'));
});

test('cleanFormatText converts inline list after colon into list format', () => {
  const input = `We need to: prepare the presentation, verify churn metrics, review audit logs, and schedule the demo.`;

  const result = cleanFormatText(input);

  assert.ok(result.hasLists, 'Should detect inline list items');
  assert.ok(result.html.includes('prepare the presentation</li>'));
  assert.ok(result.html.includes('verify churn metrics</li>'));
  assert.ok(result.html.includes('schedule the demo</li>'));
});

test('cleanFormatText applies bold to deadlines, dates, times, and amounts', () => {
  const input = `Please finish the report by Friday at 5pm. The estimated cost is $12,500 with a 15% discount. Next steps: send the draft to finance by tomorrow.`;

  const result = cleanFormatText(input);

  assert.ok(result.hasBold, 'Should add bold styling');
  assert.ok(result.html.includes('<b>by Friday at 5pm</b>') || result.html.includes('<b>Friday</b>'), 'Should bold date/deadline');
  assert.ok(result.html.includes('<b>$12,500</b>'), 'Should bold dollar amount');
  assert.ok(result.html.includes('<b>15%</b>'), 'Should bold percentage');
  assert.ok(result.html.includes('<b>Next steps:</b>'), 'Should bold lead-in heading');
});

test('cleanFormatText applies underline to critical notices and instructions', () => {
  const input = `Please note that all changes must be submitted before testing. Make sure not to deploy directly to production.`;

  const result = cleanFormatText(input);

  assert.ok(result.hasUnderline, 'Should add underline styling');
  assert.ok(result.html.includes('<u>Please note</u>') || result.html.includes('<u>please note</u>'), 'Should underline please note');
  assert.ok(result.html.includes('<u>must be</u>') || result.html.includes('<u>Make sure not to</u>') || result.html.includes('<u>make sure not to</u>'), 'Should underline crucial instruction');
});

test('cleanFormatText breaks dense walls of text into airy 1-2 sentence paragraphs', () => {
  const input = `We noticed a spike in server load during the morning migration. The database connection pool reached capacity and caused transient 504 gateway timeouts. Our DevOps team increased the pool size and stabilized the cluster. We are now running additional load tests to ensure long term resilience.`;

  const result = cleanFormatText(input);

  const paragraphCount = (result.html.match(/<p style=/g) || []).length;
  assert.ok(paragraphCount >= 2, `Expected at least 2 paragraphs with skipped lines, got ${paragraphCount}`);
});

test('cleanFormatText handles empty or whitespace input safely', () => {
  const empty = cleanFormatText('   ');
  assert.strictEqual(empty.html, '');
  assert.strictEqual(empty.hasLists, false);
});

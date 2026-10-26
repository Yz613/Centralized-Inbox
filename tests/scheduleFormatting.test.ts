import test from 'node:test';
import assert from 'node:assert/strict';
import { plainTextFromHtml, styleEmailHtml } from '../src/utils/emailFormatting';
import { dueScheduled, formatScheduleLabel, schedulePresets } from '../src/utils/scheduledMail';
import { formatOutboundBody, formatOutboundHtml } from '../src/utils/operatorPrefs';

test('lists keep markers in plain text and inline styles in html', () => {
  const html = '<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol><p><b>Bold</b> and <a href="https://example.com">a link</a></p>';
  const text = plainTextFromHtml(html);
  assert.match(text, /• One/);
  assert.match(text, /• Two/);
  assert.match(text, /1\. First/);
  assert.match(text, /Bold/);
  const styled = styleEmailHtml(html);
  assert.match(styled, /<ul[^>]*list-style:disc/);
  assert.match(styled, /<ol[^>]*list-style:decimal/);
  assert.match(styled, /<li[^>]*display:list-item/);
  assert.match(styled, /<a[^>]*text-decoration:underline/);
  const again = styleEmailHtml(styled);
  assert.equal((again.match(/list-style:disc/g) || []).length, 1);

  const outbound = formatOutboundHtml({ html, signature: 'Sam' });
  assert.match(outbound, /list-style:disc/);
  assert.match(outbound, /gmail_signature/);
  const plain = formatOutboundBody({ text: html });
  assert.match(plain, /• One/);
});

test('schedule presets are in the future and Monday is not duplicated on Sunday', () => {
  const tuesdayMorning = new Date(2026, 9, 20, 9, 15, 0, 0);
  const presets = schedulePresets(tuesdayMorning);
  assert.ok(presets.every((preset) => preset.at.getTime() > tuesdayMorning.getTime()));
  assert.ok(presets.some((preset) => preset.id === 'later'));
  assert.equal(presets.find((preset) => preset.id === 'tomorrow-am')?.at.getHours(), 8);
  assert.ok(presets.some((preset) => preset.id === 'monday'));

  const sundayEvening = new Date(2026, 9, 25, 21, 0, 0, 0);
  const sunday = schedulePresets(sundayEvening);
  assert.equal(sunday.some((preset) => preset.id === 'monday'), false);
  assert.match(formatScheduleLabel(sunday.find((preset) => preset.id === 'tomorrow-am')!.at, sundayEvening), /Tomorrow/);

  const now = new Date('2026-10-25T15:00:00.000Z');
  const due = dueScheduled([
    { id: 'a', sendAt: '2026-10-25T14:00:00.000Z', kind: 'new', subject: 'Hi', preview: '', toLabel: 'Ada' },
    { id: 'b', sendAt: '2026-10-25T16:00:00.000Z', kind: 'new', subject: 'Later', preview: '', toLabel: 'Ada' },
    { id: 'c', sendAt: '2026-10-25T14:00:00.000Z', kind: 'new', subject: 'Retry', preview: '', toLabel: 'Ada', attemptAt: '2026-10-25T14:59:30.000Z' },
  ], now);
  assert.deepEqual(due.map((item) => item.id), ['a']);
});

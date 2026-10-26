import test from 'node:test';
import assert from 'node:assert/strict';
import { recipientInputSegments, splitRecipientAddresses } from '../src/utils/recipientAddresses';
import { appendAddress } from '../src/utils/replyMentions';

test('recipient fields support comma, semicolon and pasted newline separators', () => {
  assert.deepEqual(splitRecipientAddresses(' one@example.com, two@example.com;\nthree@example.com\r\nfour@example.com, '), [
    'one@example.com', 'two@example.com', 'three@example.com', 'four@example.com',
  ]);
  assert.deepEqual(splitRecipientAddresses(' ,;\r\n '), []);
});

test('quoted display names remain one recipient in send fields and autocomplete', () => {
  const named = '"Doe, Jane; Sales" <jane@example.com>';
  assert.deepEqual(splitRecipientAddresses(`${named}, other@example.com`), [named, 'other@example.com']);
  assert.deepEqual(recipientInputSegments(`${named}, jo`), [named, 'jo']);
  assert.deepEqual(recipientInputSegments(`${named}, `), [named, '']);
  assert.deepEqual(splitRecipientAddresses('"Jane \\"JD\\", Doe" <jane@example.com>, other@example.com'), [
    '"Jane \\"JD\\", Doe" <jane@example.com>', 'other@example.com',
  ]);
});

test('mention additions preserve quoted CC names and avoid duplicate addresses', () => {
  const named = '"Doe, Jane" <jane@example.com>';
  assert.equal(appendAddress(named, 'jane@example.com'), named);
  assert.equal(appendAddress(named, 'other@example.com'), `${named}, other@example.com`);
});

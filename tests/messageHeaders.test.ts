import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceLabel, formatAddressList } from '../src/utils/messageHeaders';

test('header details keep Cc and Bcc and ignore empty lists', () => {
  assert.deepEqual(formatAddressList(['admin@merissagross.com']), ['admin@merissagross.com']);
  assert.deepEqual(formatAddressList([]), []);
  assert.deepEqual(formatAddressList(undefined), []);
  assert.deepEqual(
    formatAddressList([{ name: 'Adina Turner', address: 'admin@merissagross.com' }]),
    ['Adina Turner <admin@merissagross.com>']
  );
  assert.equal(audienceLabel('mg@merissagross.com', ['admin@merissagross.com']), 'to mg@merissagross.com, cc admin@merissagross.com');
  assert.equal(audienceLabel('me', []), 'to me');
  assert.equal(audienceLabel('me', undefined), 'to me');
});

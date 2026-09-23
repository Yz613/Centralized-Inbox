import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAddress, insertMention, mentionAtCursor } from '../src/utils/replyMentions';

test('mention query follows the caret after @', () => {
  assert.deepEqual(mentionAtCursor('Hi @sa', 6), { start: 3, query: 'sa' });
  assert.equal(mentionAtCursor('email me at test@example.com', 27), null);
  assert.equal(mentionAtCursor('Hi @sam there', 'Hi @sam there'.length), null);
});

test('choosing a mention replaces the token and can be added once', () => {
  const inserted = insertMention('Loop in @sa', 11, 8, 'Sam Rivera');
  assert.equal(inserted.text, 'Loop in @Sam Rivera ');
  assert.equal(appendAddress('a@example.com', 'sam@example.com'), 'a@example.com, sam@example.com');
  assert.equal(appendAddress('sam@example.com', 'sam@example.com'), 'sam@example.com');
  assert.equal(appendAddress('', 'sam@example.com', ['sam@example.com']), '');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmtpMailOptions, type MailServerConfig } from '../mailService';

const config: MailServerConfig = {
  email: 'shadchanim@aizer.app',
  password: 'not-a-real-password',
  imapHost: 'imap.zoho.com',
  smtpHost: 'smtp.zoho.com',
  smtpPort: 465,
};

test('Zoho SMTP reply and new send both use cc and bcc, not the REST ccAddress field', () => {
  const reply = buildSmtpMailOptions({
    config,
    to: ['mg@merissagross.com'],
    cc: ['admin@merissagross.com'],
    bcc: ['yehudazahler@gmail.com'],
    subject: 'Re: Shanah tovah',
    text: 'hello',
    inReplyTo: '<orig@mail.gmail.com>',
    references: ['<orig@mail.gmail.com>'],
  });
  const created = buildSmtpMailOptions({
    config,
    to: 'mg@merissagross.com',
    cc: ['admin@merissagross.com'],
    bcc: [],
    subject: 'Hello',
    text: 'hello',
  });

  for (const options of [reply, created]) {
    assert.deepEqual(options.cc, ['admin@merissagross.com']);
    assert.equal('ccAddress' in options, false);
    assert.equal('bccAddress' in options, false);
  }
  assert.deepEqual(reply.bcc, ['yehudazahler@gmail.com']);
  assert.equal(reply.inReplyTo, '<orig@mail.gmail.com>');
  assert.deepEqual(reply.references, ['<orig@mail.gmail.com>']);
  assert.equal('bcc' in created, false);
  assert.equal('inReplyTo' in created, false);
});

test('blank cc and bcc are left off the SMTP payload', () => {
  const options = buildSmtpMailOptions({
    config,
    to: 'mg@example.net',
    cc: ['  ', 'not-an-email'],
    bcc: [],
    subject: 'Hi',
    text: 'body',
  });
  assert.equal('cc' in options, false);
  assert.equal('bcc' in options, false);
});

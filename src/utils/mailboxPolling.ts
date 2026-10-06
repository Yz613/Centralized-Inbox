import type { InboxAccount } from '../types';

/**
 * Whether the open tab should poll this mailbox over IMAP every minute.
 * Routing inboxes already receive mail in real time through Cloudflare Email Routing; their optional
 * history sync runs in the 5-minute background job, so polling them from every open tab only adds load
 * (and, when the provider refuses IMAP, a stream of failed logins).
 */
export function shouldPollMailboxFromTab(inbox: Partial<Pick<InboxAccount, 'receivingMode' | 'channel' | 'hasAppPassword' | 'appPassword' | 'zohoAppPassword'>>): boolean {
  if (inbox.receivingMode === 'routing' || inbox.channel === 'cloudflare') return false;
  return Boolean(inbox.hasAppPassword || inbox.appPassword || inbox.zohoAppPassword);
}

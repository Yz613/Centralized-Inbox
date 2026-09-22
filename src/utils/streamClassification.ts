import { Thread, InboxStream } from '../types';
export type { InboxStream };

const FEED_SENDER_PATTERNS = [
  /substack\.com/i,
  /beehiiv\.com/i,
  /medium\.com/i,
  /convertkit/i,
  /mailchimp/i,
  /morningbrew\.com/i,
  /tldr\.tech/i,
  /thehustle\.co/i,
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bweekly\b/i,
  /^news@/i,
  /^editor@/i,
  /^updates@/i,
];

const FEED_SUBJECT_PATTERNS = [
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\broundup\b/i,
  /\bweekly issue\b/i,
  /\bissue #\d+/i,
  /\bedition #\d+/i,
  /\bmonthly recap\b/i,
];

const PAPER_TRAIL_SENDER_PATTERNS = [
  /no-?reply@/i,
  /notifications?@/i,
  /billing@/i,
  /receipts?@/i,
  /invoices?@/i,
  /orders?@/i,
  /alerts?@/i,
  /security@/i,
  /stripe\.com/i,
  /aws\.amazon\.com/i,
  /cloudflare\.com/i,
  /github\.com/i,
  /gitlab\.com/i,
  /vercel\.com/i,
  /digitalocean\.com/i,
  /paypal\.com/i,
  /apple\.com/i,
  /uber\.com/i,
  /doordash\.com/i,
  /accounts\.google\.com/i,
];

const PAPER_TRAIL_SUBJECT_PATTERNS = [
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\border (?:confirmation|#|placed|shipped|delivered)\b/i,
  /\byour order\b/i,
  /\bpayment (?:received|processed|successful|failed|receipt)\b/i,
  /\bbilling statement\b/i,
  /\bsubscription renewed\b/i,
  /\brenewal confirmation\b/i,
  /\bsecurity alert\b/i,
  /\bverification code\b/i,
  /\bverify your\b/i,
  /\breset your password\b/i,
  /\bpassword reset\b/i,
  /\bconfirm your email\b/i,
  /\bsign-in from\b/i,
  /\bnew login\b/i,
  /\btwo-factor\b/i,
  /\b2fa\b/i,
  /^\[github\]/i,
  /^\[gitlab\]/i,
  /^\[jira\]/i,
  /\bdeployed to\b/i,
  /\bdeployment (?:succeeded|failed)\b/i,
];

/**
 * Classifies a thread into one of three purpose-built streams:
 * - 'primary': Human-to-human correspondence and direct conversations
 * - 'feed': Newsletters, digests, editorial content, and updates
 * - 'paper_trail': Receipts, invoices, security codes, and automated alerts
 */
export function classifyThreadStream(thread: Thread): 'primary' | 'feed' | 'paper_trail' {
  const tags = thread.tags || [];

  // 1. Explicit User Tag Overrides
  if (tags.includes('STREAM_PRIMARY')) return 'primary';
  if (tags.includes('STREAM_FEED')) return 'feed';
  if (tags.includes('STREAM_PAPER_TRAIL')) return 'paper_trail';

  const senderAddresses = (thread.participants || []).map((p) => p.address.toLowerCase());
  const subject = thread.subject || '';
  const snippet = thread.snippet || '';

  // 2. The Feed Detection (Newsletters / Digests)
  const isFeedSender = senderAddresses.some((addr) =>
    FEED_SENDER_PATTERNS.some((pattern) => pattern.test(addr))
  );
  const isFeedSubject = FEED_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
  const hasFeedTag = tags.some((t) => /feed|newsletter/i.test(t));

  if (isFeedSender || isFeedSubject || hasFeedTag) {
    return 'feed';
  }

  // 3. Paper Trail Detection (Receipts / Invoices / 2FA / Alerts)
  const isPaperSender = senderAddresses.some((addr) =>
    PAPER_TRAIL_SENDER_PATTERNS.some((pattern) => pattern.test(addr))
  );
  const isPaperSubject = PAPER_TRAIL_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
  const hasPaperTag = tags.some((t) => /receipt|paper_trail|transactional|invoice/i.test(t));

  if (isPaperSender || isPaperSubject || hasPaperTag) {
    return 'paper_trail';
  }

  // 4. Default: Primary
  return 'primary';
}

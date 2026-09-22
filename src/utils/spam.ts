export type SpamStatus = 'suspected' | 'not_spam';
export interface SpamState {
  spamStatus?: SpamStatus;
  spamReason?: string;
  spamReviewedAt?: string;
  tags?: string[];
}

/** A warning only: classification never decides whether mail is delivered or visible. */
export function assessSpam(input: {
  labels?: string[];
  folder?: string;
  specialUse?: string;
  headers?: { name?: string; key?: string; value: string }[];
  subject?: string;
}): Pick<SpamState, 'spamStatus' | 'spamReason'> {
  let reason: string | undefined;
  if (input.labels?.includes('SPAM')) reason = 'Gmail placed a message in Spam.';
  else if (input.specialUse?.toLowerCase() === '\\junk' || /(?:^|[/\\])(spam|junk|junk e-?mail)$/i.test(input.folder || '')) {
    reason = 'Your mail provider placed a message in its Spam or Junk folder.';
  } else {
    const headers = input.headers || [];
    const flagged = headers.some(header => {
      const name = (header.name || header.key || '').toLowerCase();
      return (name === 'x-spam-flag' && /^yes\b/i.test(header.value.trim())) ||
        (name === 'x-spam-status' && /^yes\b/i.test(header.value.trim()));
    });
    if (flagged) reason = 'A mail header flags this message as possible spam.';
    else if (/^\s*(\[spam\]|\*{3,}spam\*{3,})/i.test(input.subject || '')) reason = 'The subject includes a spam warning.';
  }
  return reason ? { spamStatus: 'suspected', spamReason: reason } : {};
}

export function getSpamStatus(thread: SpamState): SpamStatus | undefined {
  return thread.spamStatus || (thread.tags?.includes('SPAM') ? 'suspected' : undefined);
}

/** Human corrections win over provider flags, even when new messages arrive. */
export function mergeSpamState(previous: SpamState, incoming: SpamState): Pick<SpamState, 'spamStatus' | 'spamReason' | 'spamReviewedAt'> {
  const reviewed = [previous, incoming].filter(state => state.spamReviewedAt)
    .sort((a,b) => Date.parse(b.spamReviewedAt!) - Date.parse(a.spamReviewedAt!))[0];
  const state = reviewed || (getSpamStatus(incoming) ? incoming : previous);
  return { spamStatus: getSpamStatus(state), spamReason: state.spamReason, spamReviewedAt: state.spamReviewedAt };
}

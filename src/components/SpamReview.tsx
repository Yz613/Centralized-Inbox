import React, { useState } from 'react';
import type { Thread } from '../types';
import { getSpamStatus, type SpamStatus } from '../utils/spam';

export function SpamBadge({ thread }: { thread: Thread }) {
  const status = getSpamStatus(thread);
  if (!status) return null;
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${status === 'suspected'
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>
    {status === 'suspected' ? 'Possible spam' : 'Not spam'}
  </span>;
}

export function SpamReview({ thread, onReview }: {
  thread: Thread;
  onReview: (threadId: string, status: SpamStatus) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const status = getSpamStatus(thread);
  if (!status) return null;
  const review = async () => {
    setSaving(true); setError('');
    try { await onReview(thread.id, status === 'suspected' ? 'not_spam' : 'suspected'); }
    catch (error: any) { setError(error.message || 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  };
  return <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <SpamBadge thread={thread} />
      <p className="flex-1 min-w-40 text-slate-600 dark:text-slate-300">
        {status === 'suspected'
          ? `${thread.spamReason || 'Your mail provider flagged this conversation.'} It stays in your inbox for review.`
          : 'You marked this conversation as not spam in ProjectInbox.'}
      </p>
      <button type="button" disabled={saving} onClick={() => void review()}
        className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
        {saving ? 'Saving…' : status === 'suspected' ? 'Not spam' : 'Undo'}
      </button>
    </div>
    <p className="mt-1 text-[10px] text-slate-500">Your review is saved here; it does not change your provider’s spam settings.</p>
    {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}

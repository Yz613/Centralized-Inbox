import React, { useState } from 'react';
import type { Thread } from '../types';
import { getSpamStatus, type SpamStatus } from '../utils/spam';
import { AlertTriangle, ShieldCheck, RotateCcw, Check } from 'lucide-react';

export function SpamBadge({ thread }: { thread: Thread }) {
  const status = getSpamStatus(thread);
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
        status === 'suspected'
          ? 'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
          : 'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
      }`}
    >
      {status === 'suspected' ? (
        <>
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Possible spam</span>
        </>
      ) : (
        <>
          <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Verified not spam</span>
        </>
      )}
    </span>
  );
}

export function SpamReview({
  thread,
  onReview,
}: {
  thread: Thread;
  onReview: (threadId: string, status: SpamStatus) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const status = getSpamStatus(thread);
  if (!status) return null;

  const review = async () => {
    setSaving(true);
    setError('');
    try {
      await onReview(thread.id, status === 'suspected' ? 'not_spam' : 'suspected');
    } catch (error: any) {
      setError(error.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isSuspected = status === 'suspected';

  return (
    <div
      className={`border-b px-4 py-3 text-xs transition-colors ${
        isSuspected
          ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-900/50'
          : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-900/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-48 flex-1">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              isSuspected
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
            }`}
          >
            {isSuspected ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {isSuspected ? 'Provider Spam Warning' : 'Marked as Not Spam'}
              </span>
              <SpamBadge thread={thread} />
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {isSuspected
                ? `${
                    thread.spamReason || 'Your mail provider flagged this conversation.'
                  } It stays safely in your inbox for your review.`
                : 'You marked this conversation as not spam in ProjectInbox.'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Your decision is saved locally in ProjectInbox and will not be overwritten by future syncs.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void review()}
            className={`rounded-xl px-3.5 py-1.5 font-semibold text-xs transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              isSuspected
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {saving ? 'Saving…' : isSuspected ? 'Not spam' : 'Undo'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

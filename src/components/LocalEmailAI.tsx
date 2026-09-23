import React, { useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles, X } from 'lucide-react';
import { deviceAI, type DeviceAIResult } from '@deviceai/client';
import type { Message, Thread } from '../types';
import { createLocalEmailRequest, type LocalEmailAction } from '../utils/localEmailAI';

interface LocalEmailAIProps {
  thread: Thread;
  message?: Message;
}

const actionLabels: Record<LocalEmailAction, string> = {
  summarize: 'Summarize',
  analyze: 'Analyze',
  action_items: 'Action items',
  draft_reply: 'Draft reply',
};

function outputText(output: unknown): string {
  return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
}

export const LocalEmailAI: React.FC<LocalEmailAIProps> = ({ thread, message }) => {
  const [pending, setPending] = useState<LocalEmailAction | null>(null);
  const [outcome, setOutcome] = useState<{
    action: LocalEmailAction;
    result: DeviceAIResult;
    wasTruncated: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const runId = useRef(0);
  const actions: LocalEmailAction[] = message
    ? ['summarize', 'analyze']
    : ['summarize', 'analyze', 'action_items', 'draft_reply'];

  const run = async (action: LocalEmailAction) => {
    const id = ++runId.current;
    const { request, wasTruncated } = createLocalEmailRequest(thread, action, message);
    setPending(action);
    setOutcome(null);
    setCopied(false);
    try {
      const result = await deviceAI.run(request);
      if (runId.current === id) setOutcome({ action, result, wasTruncated });
    } catch (error) {
      if (runId.current === id) {
        setOutcome({
          action,
          wasTruncated,
          result: {
            status: 'local_failed',
            reasonCode: 'unexpected_error',
            reason: error instanceof Error ? error.message : 'The local AI request failed.',
          },
        });
      }
    } finally {
      if (runId.current === id) setPending(null);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const result = outcome?.result;
  const text = result?.status === 'local_success' ? outputText(result.output) : '';

  return (
    <section className={`border border-indigo-200 bg-indigo-50/70 rounded-xl p-3 ${message ? 'mx-3 sm:mx-4 my-3' : ''}`} aria-label={message ? 'Local AI for this email' : 'Local AI for this conversation'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900 mr-1">
          <Sparkles className="w-3.5 h-3.5" />
          Local AI {message ? '· email' : '· conversation'}
        </span>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => void run(action)}
            disabled={pending !== null}
            className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-wait text-[11px] font-semibold transition cursor-pointer"
          >
            {pending === action && <Loader2 className="inline-block w-3 h-3 animate-spin mr-1" />}
            {actionLabels[action]}
          </button>
        ))}
        <span className="text-[10px] text-indigo-700">On-device · text only</span>
      </div>

      {outcome && result && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs text-slate-800" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 mb-2">
            <strong className="text-indigo-900">{actionLabels[outcome.action]} {message ? 'email' : 'conversation'}</strong>
            <button type="button" onClick={() => setOutcome(null)} className="p-1 rounded-md hover:bg-slate-100 cursor-pointer" aria-label="Close local AI result">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {outcome.wasTruncated && <p className="mb-2 text-amber-800">Only the most recent 7,000 characters were analyzed to fit the device model.</p>}
          {result.status === 'local_success' && (
            <>
              <div className="whitespace-pre-wrap break-words leading-relaxed">{text}</div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-500">Generated on this device · review before acting</span>
                <button type="button" onClick={() => void copy(text)} className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-semibold cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          )}
          {result.status === 'local_failed' && (
            <p className="leading-relaxed">
              {result.reason}{' '}
              {result.reasonCode === 'bridge_unavailable' && 'Open this inbox in an approved Chromium browser with the DeviceAI extension and Mac app running, or in the DeviceAI Android browser. '}
              No email text was sent to a cloud AI.
            </p>
          )}
          {result.status === 'cloud_handoff_required' && (
            <p className="leading-relaxed">{result.reason} DeviceAI did not process this request locally. No email text was sent to a cloud AI.</p>
          )}
        </div>
      )}
    </section>
  );
};

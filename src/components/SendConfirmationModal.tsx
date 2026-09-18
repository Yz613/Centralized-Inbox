import React from 'react';
import { Mail, AlertTriangle, X, Check } from 'lucide-react';
import { ChannelBadge } from './ChannelBadge';
import { ChannelType } from '../types';

interface SendConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fromEmail: string;
  channel: ChannelType;
  toAddress: string;
  subject: string;
  bodyPreview: string;
  isSending?: boolean;
}

export const SendConfirmationModal: React.FC<SendConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fromEmail,
  channel,
  toAddress,
  subject,
  bodyPreview,
  isSending = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                Confirm Real Email Dispatch
              </h3>
              <p className="text-[11px] text-slate-400">
                Verify recipient and message details before sending
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 text-xs">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-amber-800 dark:text-amber-300 text-[11px]">
              This operation will send a live email directly through your connected{' '}
              <strong>{channel.toUpperCase()}</strong> account with your permission.
            </div>
          </div>

          <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">From:</span>
              <div className="flex items-center gap-1.5">
                <ChannelBadge channel={channel} size="sm" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{fromEmail}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">To:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{toAddress}</span>
            </div>

            <div>
              <span className="text-slate-500 font-medium block mb-0.5">Subject:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                {subject || '(No Subject)'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Message Preview:</span>
            <div className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg max-h-32 overflow-y-auto text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {bodyPreview || '(Empty message)'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSending}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Send Email</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Check,
  Copy,
  ArrowLeftToLine,
  FileCheck,
  RefreshCw,
} from 'lucide-react';

export interface AiSuggestionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (formattedHtml: string) => void;
  formattedHtml: string;
  originalText: string;
  summary?: string;
  isLoading?: boolean;
  onReformat?: () => void;
  className?: string;
}

export const AiSuggestionDrawer: React.FC<AiSuggestionDrawerProps> = ({
  isOpen,
  onClose,
  onApply,
  formattedHtml,
  originalText,
  summary,
  isLoading = false,
  onReformat,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'suggestion' | 'original'>('suggestion');
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(
          formattedHtml
            .replace(/<li[^>]*>/gi, '• ')
            .replace(/<\/li>/gi, '\n')
            .replace(/<\/(p|ul|ol)>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim()
        );
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-xl overflow-hidden transition-all duration-300 animate-in slide-in-from-right-4 ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white select-none">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-full bg-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight">AI Formatting Suggestion</span>
            <span className="text-[10px] text-indigo-100 font-medium">Clean lists, spacing & emphasis</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isLoading && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded-full text-white font-medium">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              <span>Polishing…</span>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
            title="Dismiss suggestion"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="px-3.5 py-1.5 bg-indigo-50/90 border-b border-indigo-100 flex items-center justify-between text-[11px] text-indigo-950 font-medium">
          <span className="truncate max-w-[280px] sm:max-w-[340px] flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{summary}</span>
          </span>
          {onReformat && (
            <button
              type="button"
              onClick={onReformat}
              disabled={isLoading}
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline shrink-0 cursor-pointer ml-2"
            >
              Reformat
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center px-3 pt-2 border-b border-slate-200 text-xs gap-2 bg-slate-50/50">
        <button
          type="button"
          onClick={() => setActiveTab('suggestion')}
          className={`pb-1.5 px-2 font-bold transition border-b-2 cursor-pointer ${
            activeTab === 'suggestion'
              ? 'border-indigo-600 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          ✨ Cleaned Suggestion
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('original')}
          className={`pb-1.5 px-2 font-semibold transition border-b-2 cursor-pointer ${
            activeTab === 'original'
              ? 'border-indigo-600 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Original Paste
        </button>
      </div>

      {/* Preview Container */}
      <div className="p-3 sm:p-4 max-h-[220px] sm:max-h-[260px] overflow-y-auto text-xs sm:text-sm bg-white">
        {activeTab === 'suggestion' ? (
          <div
            className="prose prose-xs max-w-none text-slate-800 font-sans leading-relaxed selection:bg-indigo-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1 [&_b]:font-bold [&_b]:text-slate-900 [&_u]:underline [&_u]:decoration-indigo-500 [&_u]:decoration-2 [&_u]:underline-offset-2 [&_p]:mb-2.5"
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        ) : (
          <div className="text-slate-600 whitespace-pre-wrap font-sans text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            {originalText}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyClipboard}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
            title="Copy formatted text to clipboard"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-black hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Keep Original
          </button>

          {/* Core User Request: "if I press copy to main thing, it'll move it into the main email response box or box." */}
          <button
            type="button"
            onClick={() => onApply(formattedHtml)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs rounded-full shadow-sm transition active:scale-95 cursor-pointer"
          >
            <ArrowLeftToLine className="w-3.5 h-3.5" />
            <span>Copy to main email</span>
          </button>
        </div>
      </div>
    </div>
  );
};

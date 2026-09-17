import React, { useState, useEffect } from 'react';
import { Thread, InboxAccount } from '../types';
import { useInbox } from '../context/InboxContext';
import {
  Send,
  Sparkles,
  Paperclip,
  X,
  ChevronDown,
  RefreshCw,
  FileText,
  Smile,
  CheckCircle2,
} from 'lucide-react';
import { ChannelBadge } from './ChannelBadge';

interface ReplyComposerProps {
  thread: Thread;
  onSent?: () => void;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({ thread, onSent }) => {
  const { inboxes, projectInboxes, sendReply } = useInbox();

  // Find the exact inbox that originally received this thread
  const defaultInbox =
    inboxes.find((i) => i.id === thread.inboxId) ||
    projectInboxes[0] ||
    inboxes[0];

  const [selectedInboxId, setSelectedInboxId] = useState<string>(defaultInbox?.id || '');
  const [replyText, setReplyText] = useState('');
  const [subjectText, setSubjectText] = useState(`Re: ${thread.subject}`);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; size: string; type: string }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<'support' | 'professional' | 'concise' | 'friendly'>('support');
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Update selected inbox if thread changes
  useEffect(() => {
    const target = inboxes.find((i) => i.id === thread.inboxId) || projectInboxes[0] || inboxes[0];
    if (target) {
      setSelectedInboxId(target.id);
      setSubjectText(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    }
  }, [thread.id, thread.inboxId, inboxes, projectInboxes]);

  const activeSenderInbox: InboxAccount | undefined = inboxes.find((i) => i.id === selectedInboxId);
  const isChatChannel = activeSenderInbox?.channel === 'whatsapp' || activeSenderInbox?.channel === 'instagram';

  const recipientParticipant = thread.participants.find(
    (p) => p.address !== activeSenderInbox?.email
  ) || thread.participants[0];

  // AI Smart Reply generator
  const handleGenerateSmartReply = async (tone = aiTone) => {
    setIsGeneratingAi(true);
    try {
      const latestMsg = thread.messages[thread.messages.length - 1];
      const res = await fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadSubject: thread.subject,
          latestMessage: latestMsg ? latestMsg.bodyText : thread.snippet,
          senderName: recipientParticipant?.name || 'Customer',
          inboxEmail: activeSenderInbox?.email,
          inboxRole: activeSenderInbox?.role,
          channel: activeSenderInbox?.channel,
          tone,
          userInstructions: customAiPrompt || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setReplyText(data.reply);
        }
        if (data.suggestions && Array.isArray(data.suggestions)) {
          setAiSuggestions(data.suggestions);
        }
      }
    } catch (err) {
      console.error('AI Smart Reply Error:', err);
    } finally {
      setIsGeneratingAi(false);
      setShowAiModal(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim()) return;

    sendReply(thread.id, {
      text: replyText.trim(),
      fromInboxId: selectedInboxId,
      subject: subjectText,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    setReplyText('');
    setAttachments([]);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
    if (onSent) onSent();
  };

  const handleSimulateAttachment = () => {
    const sampleFiles = [
      { name: 'solution_spec_v1.pdf', size: '184 KB', type: 'application/pdf' },
      { name: 'release_notes_patch.txt', size: '12 KB', type: 'text/plain' },
      { name: 'dashboard_screenshot.png', size: '640 KB', type: 'image/png' },
    ];
    const picked = sampleFiles[Math.floor(Math.random() * sampleFiles.length)];
    setAttachments((prev) => [...prev, picked]);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 transition-all">
      {/* Toast confirmation */}
      {showSuccessToast && (
        <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Reply dispatched successfully from <strong>{activeSenderInbox?.email}</strong> via {activeSenderInbox?.channel.toUpperCase()}!</span>
        </div>
      )}

      {/* Originating Account Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 font-medium">Replying from:</span>
          <div className="relative inline-block">
            <select
              value={selectedInboxId}
              onChange={(e) => setSelectedInboxId(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md py-1.5 pl-2.5 pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {/* Prioritize inboxes of this project */}
              <optgroup label="This Project's Inboxes">
                {projectInboxes.map((inbox) => (
                  <option key={inbox.id} value={inbox.id}>
                    {inbox.email} ({inbox.name} - {inbox.channel.toUpperCase()})
                  </option>
                ))}
              </optgroup>
              {inboxes.filter((i) => i.projectId !== thread.projectId).length > 0 && (
                <optgroup label="Other Account Inboxes">
                  {inboxes
                    .filter((i) => i.projectId !== thread.projectId)
                    .map((inbox) => (
                      <option key={inbox.id} value={inbox.id}>
                        {inbox.email} ({inbox.name})
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {activeSenderInbox && (
            <ChannelBadge
              channel={activeSenderInbox.channel}
              role={activeSenderInbox.role}
              showRole={true}
              size="sm"
            />
          )}
        </div>

        {/* AI Reply Trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiModal(!showAiModal)}
            disabled={isGeneratingAi}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 border border-indigo-200 hover:from-blue-100 hover:to-indigo-100 dark:from-indigo-950/40 dark:to-blue-950/40 dark:text-indigo-300 dark:border-indigo-800 transition shadow-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isGeneratingAi ? 'animate-spin' : ''}`} />
            <span>{isGeneratingAi ? 'Drafting with Gemini...' : 'AI Draft Assistant'}</span>
          </button>

          {!isChatChannel && (
            <button
              type="button"
              onClick={() => setShowCcBcc(!showCcBcc)}
              className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
            >
              {showCcBcc ? 'Hide CC/BCC' : 'CC/BCC'}
            </button>
          )}
        </div>
      </div>

      {/* AI Assistant Options Tray */}
      {showAiModal && (
        <div className="mb-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800/60 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Generate Smart Reply with Gemini AI
            </span>
            <button
              onClick={() => setShowAiModal(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-slate-600 dark:text-slate-400">Tone preset:</span>
            {(['support', 'professional', 'concise', 'friendly'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => {
                  setAiTone(tone);
                  handleGenerateSmartReply(tone);
                }}
                className={`px-2 py-1 rounded text-[11px] capitalize font-medium transition ${
                  aiTone === tone
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {tone === 'support' ? '🎧 Support Solution' : tone === 'professional' ? '👔 Formal / Admin' : tone === 'concise' ? '⚡ Quick Acknowledge' : '👋 Friendly'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Optional: specific instructions (e.g. mention refund approved, request logs)..."
              value={customAiPrompt}
              onChange={(e) => setCustomAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateSmartReply()}
              className="flex-1 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => handleGenerateSmartReply()}
              disabled={isGeneratingAi}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-xs flex items-center gap-1"
            >
              {isGeneratingAi ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {/* Suggested Quick Chips */}
      {aiSuggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Quick insert:</span>
          {aiSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setReplyText((prev) => (prev ? `${prev}\n\n${suggestion}` : suggestion))}
              className="text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 transition"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Optional CC/BCC inputs */}
      {showCcBcc && !isChatChannel && (
        <div className="space-y-1.5 mb-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-10 text-slate-400">CC:</span>
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              placeholder="e.g. manager@apexanalytics.io"
              className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-slate-400">BCC:</span>
            <input
              type="text"
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              placeholder="e.g. audit-archive@apexanalytics.io"
              className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
        </div>
      )}

      {/* Reply Message Input Area */}
      <div className="relative border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        <textarea
          rows={isChatChannel ? 3 : 5}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={
            isChatChannel
              ? `Type WhatsApp/Direct message from ${activeSenderInbox?.name}... (Press Shift+Enter for newline)`
              : `Reply from ${activeSenderInbox?.email} to ${recipientParticipant?.name || 'recipient'}...`
          }
          onKeyDown={(e) => {
            if (isChatChannel && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full p-3 text-xs md:text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-y"
        />

        {/* Attached files preview */}
        {attachments.length > 0 && (
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200"
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-medium truncate max-w-[140px]">{att.name}</span>
                <span className="text-[10px] text-slate-400">({att.size})</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-500 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Footer toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-1 text-slate-500">
            <button
              type="button"
              onClick={handleSimulateAttachment}
              title="Attach File"
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setReplyText((prev) => `${prev} 👍`)}
              title="Emoji"
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
            >
              <Smile className="w-4 h-4" />
            </button>
            {activeSenderInbox?.signature && !isChatChannel && (
              <span className="text-[11px] text-slate-400 ml-2 hidden sm:inline truncate max-w-[200px]">
                Sig: {activeSenderInbox.signature.split('\n')[0]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {replyText && (
              <button
                type="button"
                onClick={() => setReplyText('')}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 text-xs"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!replyText.trim()}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md font-medium text-xs shadow-xs transition ${
                replyText.trim()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>{isChatChannel ? 'Send Message' : 'Send Email'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

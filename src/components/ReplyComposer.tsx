import React, { useRef, useState, useEffect } from 'react';
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
  AlertCircle,
  BookmarkPlus,
} from 'lucide-react';
import { ChannelBadge } from './ChannelBadge';
import {
  deleteReplyTemplate,
  repliesForProject,
  saveReplyTemplate,
  SavedReply,
  getDraft,
  saveDraft,
  clearDraft,
} from '../utils/operatorPrefs';

interface ReplyComposerProps {
  thread: Thread;
  onSent?: () => void;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({ thread, onSent }) => {
  const { inboxes, projectInboxes, sendReply, isGoogleConnected, canSendFromInbox, connectGoogleAccount, canSendAsInbox, replyFocusToken } = useInbox();

  // Find the exact inbox that originally received this thread
  const defaultInbox =
    inboxes.find((i) => i.id === thread.inboxId) ||
    projectInboxes[0] ||
    inboxes[0];

  const [selectedInboxId, setSelectedInboxId] = useState<string>(defaultInbox?.id || '');
  const [replyText, setReplyText] = useState(() => getDraft(thread.id)?.text || '');
  const [subjectText, setSubjectText] = useState(`Re: ${thread.subject}`);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [attachments, setAttachments] = useState<
    { name: string; size: string; type: string; contentBase64?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>(() => repliesForProject(thread.projectId));
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<'support' | 'professional' | 'concise' | 'friendly'>('support');
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [includeQuote, setIncludeQuote] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Update selected inbox if thread changes
  useEffect(() => {
    const target = inboxes.find((i) => i.id === thread.inboxId) || projectInboxes[0] || inboxes[0];
    if (target) {
      setSelectedInboxId(target.id);
      setSubjectText(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    }
    const draft = getDraft(thread.id);
    if (draft) {
      if (draft.text) setReplyText(draft.text);
      if (draft.subject) setSubjectText(draft.subject);
      if (draft.cc) {
        setCcInput(draft.cc);
        setShowCcBcc(true);
      }
      if (draft.bcc) {
        setBccInput(draft.bcc);
        setShowCcBcc(true);
      }
      if (draft.fromInboxId) setSelectedInboxId(draft.fromInboxId);
    } else {
      setReplyText('');
    }
  }, [thread.id, thread.inboxId, inboxes, projectInboxes]);

  useEffect(() => {
    if (!replyText.trim() && !ccInput && !bccInput) return;
    saveDraft(thread.id, {
      text: replyText,
      subject: subjectText,
      cc: ccInput,
      bcc: bccInput,
      fromInboxId: selectedInboxId,
    });
  }, [replyText, subjectText, ccInput, bccInput, selectedInboxId, thread.id]);

  useEffect(() => {
    if (!replyFocusToken) return;
    setIsCollapsed(false);
    window.setTimeout(() => textareaRef.current?.focus(), 40);
  }, [replyFocusToken]);

  const activeSenderInbox: InboxAccount | undefined = inboxes.find((i) => i.id === selectedInboxId);
  const isChatChannel = false;

  const recipientParticipant = thread.participants.find(
    (p) => p.address !== activeSenderInbox?.email
  ) || thread.participants[0];

  const isLiveProvider = canSendFromInbox(activeSenderInbox);

  const splitAddresses = (raw: string) =>
    raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const refreshSavedReplies = () => setSavedReplies(repliesForProject(thread.projectId));

  useEffect(() => {
    refreshSavedReplies();
  }, [thread.projectId]);

  const executeSend = async () => {
    setIsSendingLive(true);
    setSendError(null);
    try {
      const res = await sendReply(thread.id, {
        text: replyText.trim(),
        fromInboxId: selectedInboxId,
        subject: subjectText,
        cc: splitAddresses(ccInput),
        bcc: splitAddresses(bccInput),
        includeQuote,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (res && res.success === false) {
        setSendError(res.error || 'Failed to dispatch email');
        return;
      }

      clearDraft(thread.id);
      setReplyText('');
      setAttachments([]);
      setShowSuccessToast(true);
      setIsCollapsed(true);
      setTimeout(() => setShowSuccessToast(false), 3500);
      if (onSent) onSent();
    } catch (err: any) {
      setSendError(err?.message || 'Error occurred while sending');
    } finally {
      setIsSendingLive(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim()) return;

    if (!isLiveProvider) {
      setSendError('Sign in with Gmail to send from this inbox — it is free and does not need paid SMTP.');
      return;
    }

    void executeSend();
  };

  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const next = await Promise.all(
      files.map(async (file) => {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        const kb = file.size / 1024;
        return {
          name: file.name,
          size: kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`,
          type: file.type || 'application/octet-stream',
          contentBase64: btoa(binary),
        };
      })
    );
    setAttachments((prev) => [...prev, ...next]);
    e.target.value = '';
  };

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

  const handleSaveCurrentReply = () => {
    if (!replyText.trim()) return;
    saveReplyTemplate({
      projectId: thread.projectId,
      title: replyText.trim().slice(0, 42),
      body: replyText.trim(),
    });
    refreshSavedReplies();
  };

  // If collapsed: render low-profile Gmail reply pill so the full email above is visible!
  if (isCollapsed) {
    return (
      <div className="p-3.5 md:p-4 border-t border-slate-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="w-full py-3 px-5 rounded-2xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#1f1f1f] text-xs md:text-sm font-medium flex items-center justify-between transition cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              <Send className="w-3.5 h-3.5" />
            </div>
            <span className="truncate text-[#1f1f1f]">
              Reply to <strong className="text-[#001d35] font-bold">{recipientParticipant?.name || recipientParticipant?.address || 'this conversation'}</strong>...
            </span>
            {replyText.trim() && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0 border border-amber-300">
                Draft in progress
              </span>
            )}
          </div>
          <div className="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 font-bold group-hover:bg-blue-100 group-hover:border-blue-400 transition flex items-center gap-1.5 shadow-2xs shrink-0">
            <span>Write Reply</span>
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border-t border-slate-200 p-4 md:p-5 shrink-0 transition-all shadow-lg space-y-3">
      {/* Toast confirmation */}
      {showSuccessToast && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2 shadow-2xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Queued from <strong className="text-black">{activeSenderInbox?.email}</strong> — 5 seconds to undo.</span>
        </div>
      )}

      {/* Originating Account Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#1f1f1f] font-bold">Replying from:</span>
          <div className="relative inline-block">
            <select
              value={selectedInboxId}
              onChange={(e) => setSelectedInboxId(e.target.value)}
              className="appearance-none bg-slate-100 border border-slate-300 rounded-full py-1.5 pl-3 pr-8 text-xs font-bold text-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
            <ChevronDown className="w-3.5 h-3.5 text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {activeSenderInbox && (
            <ChannelBadge
              channel={activeSenderInbox.channel}
              role={activeSenderInbox.role}
              showRole={true}
              size="sm"
            />
          )}
          {activeSenderInbox && isGoogleConnected && (
            <span className="text-xs text-[#3c4043] font-semibold">
              {canSendAsInbox(activeSenderInbox.email)
                ? 'Sending as this address'
                : 'Gmail relay · Reply-To this inbox'}
            </span>
          )}
        </div>

        {/* AI Reply Trigger, Templates Drawer & Minimize Control */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {savedReplies.length > 0 && (
            <button
              type="button"
              onClick={() => setTemplatesOpen(!templatesOpen)}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition cursor-pointer ${
                templatesOpen
                  ? 'bg-emerald-100 text-emerald-950 border border-emerald-400 font-bold'
                  : 'text-[#202124] hover:text-black hover:bg-slate-100 font-medium'
              }`}
              title={templatesOpen ? 'Hide templates' : 'Show saved reply templates'}
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-emerald-700" />
              <span>Templates ({savedReplies.length})</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${templatesOpen ? 'rotate-180' : ''}`} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAiModal(!showAiModal)}
            disabled={isGeneratingAi}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-900 border border-indigo-300 hover:from-blue-100 hover:to-indigo-100 transition shadow-2xs cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-700 ${isGeneratingAi ? 'animate-spin' : ''}`} />
            <span>{isGeneratingAi ? 'Drafting...' : 'AI Draft'}</span>
          </button>

          {!isChatChannel && (
            <button
              type="button"
              onClick={() => setShowCcBcc(!showCcBcc)}
              className={`text-xs px-2.5 py-1 rounded-full transition cursor-pointer font-bold ${
                showCcBcc
                  ? 'bg-slate-300 text-[#1f1f1f]'
                  : 'text-[#3c4043] hover:text-black hover:bg-slate-100'
              }`}
            >
              {showCcBcc ? 'Hide CC' : 'CC/BCC'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="inline-flex items-center gap-1.5 text-[#1f1f1f] hover:text-black font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 transition cursor-pointer shadow-2xs"
            title="Drop down / collapse composer to see full message"
          >
            <ChevronDown className="w-3.5 h-3.5 text-slate-700" />
            <span>Collapse</span>
          </button>
        </div>
      </div>

      {!isLiveProvider && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
          <span>Sign in with Gmail to send from this address for free. Replies still come back to {activeSenderInbox?.email}.</span>
          <button
            type="button"
            onClick={() => connectGoogleAccount().catch(() => {})}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Templates Collapsible Drawer */}
      {templatesOpen && savedReplies.length > 0 && (
        <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/70 dark:border-emerald-800/60 text-xs animate-in fade-in duration-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <BookmarkPlus className="w-3.5 h-3.5 text-emerald-600" />
              Saved Templates for this Project
            </span>
            <button
              type="button"
              onClick={() => setTemplatesOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {savedReplies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                onClick={() => setReplyText(reply.body)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  deleteReplyTemplate(reply.id);
                  refreshSavedReplies();
                }}
                title="Click to insert · right-click to delete"
                className="text-[11px] bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-700 transition shadow-2xs"
              >
                {reply.title}
              </button>
            ))}
            <button
              type="button"
              onClick={handleSaveCurrentReply}
              disabled={!replyText.trim()}
              className={`text-[11px] px-2.5 py-1 rounded-full border border-dashed transition flex items-center gap-1 ${
                replyText.trim()
                  ? 'border-emerald-400 text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer'
                  : 'border-slate-300 text-slate-400 cursor-not-allowed'
              }`}
              title="Save current reply text as a new reusable template"
            >
              <span>+ Save current text as template</span>
            </button>
          </div>
        </div>
      )}

      {/* AI Assistant Options Tray */}
      {showAiModal && (
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800/60 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Generate Smart Reply with Gemini AI
            </span>
            <button
              onClick={() => setShowAiModal(false)}
              className="text-[#202124] hover:text-black p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[#1f1f1f] font-bold">Tone preset:</span>
            {(['support', 'professional', 'concise', 'friendly'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => {
                  setAiTone(tone);
                  handleGenerateSmartReply(tone);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs capitalize font-bold transition cursor-pointer ${
                  aiTone === tone
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-[#1f1f1f] hover:bg-slate-100'
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
              className="flex-1 bg-white border border-indigo-300 rounded-lg px-3 py-1.5 text-xs text-[#1f1f1f] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => handleGenerateSmartReply()}
              disabled={isGeneratingAi}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isGeneratingAi ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {aiSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#202124] font-bold">Quick insert:</span>
          {aiSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setReplyText((prev) => (prev ? `${prev}\n\n${suggestion}` : suggestion))}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-[#1f1f1f] font-medium px-2.5 py-1 rounded-full border border-slate-300 transition cursor-pointer"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Optional CC/BCC inputs */}
      {showCcBcc && !isChatChannel && (
        <div className="space-y-2 mb-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-10 text-[#1f1f1f] font-bold">CC:</span>
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              placeholder="e.g. manager@apexanalytics.io"
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] placeholder:text-slate-500 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-[#1f1f1f] font-bold">BCC:</span>
            <input
              type="text"
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              placeholder="e.g. audit-archive@apexanalytics.io"
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] placeholder:text-slate-500 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Reply Message Input Area */}
      <div className="relative border border-slate-300 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 shadow-2xs">
        <textarea
          ref={textareaRef}
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
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full p-4 text-xs md:text-sm bg-transparent text-[#1f1f1f] placeholder:text-slate-500 focus:outline-none resize-y font-sans leading-relaxed"
        />

        {/* Attached files preview */}
        {attachments.length > 0 && (
          <div className="p-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-300 text-xs text-[#1f1f1f] font-semibold shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-bold truncate max-w-[140px]">{att.name}</span>
                <span className="text-[11px] text-[#3c4043]">({att.size})</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-600 hover:text-red-600 ml-1 rounded-full p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Footer toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-1.5 text-[#202124]">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handlePickFiles}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              className="p-1.5 hover:bg-slate-200 rounded-full transition cursor-pointer text-[#202124] hover:text-black"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSaveCurrentReply}
              title="Save as reply template"
              className="p-1.5 hover:bg-slate-200 rounded-full transition cursor-pointer text-[#202124] hover:text-black"
            >
              <BookmarkPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setReplyText((prev) => `${prev} 👍`)}
              title="Emoji"
              className="p-1.5 hover:bg-slate-200 rounded-full transition cursor-pointer text-[#202124] hover:text-black"
            >
              <Smile className="w-4 h-4" />
            </button>
            {activeSenderInbox?.signature && !isChatChannel && (
              <span className="text-xs text-[#3c4043] ml-2 hidden sm:inline truncate max-w-[200px] font-medium">
                Sig: {activeSenderInbox.signature.split('\n')[0]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden sm:flex items-center gap-1 text-xs text-[#202124] font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={includeQuote}
                onChange={(e) => setIncludeQuote(e.target.checked)}
              />
              Quote original
            </label>
            {replyText && (
              <button
                type="button"
                onClick={() => setReplyText('')}
                className="px-2.5 py-1 text-slate-700 hover:text-black font-semibold text-xs rounded-full cursor-pointer hover:bg-slate-200"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!replyText.trim()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-2xs transition cursor-pointer ${
                replyText.trim()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>{isSendingLive ? 'Queuing…' : isChatChannel ? 'Send Message' : 'Send'}</span>
              <span className="text-[10px] opacity-75 font-mono">⌘↵</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error alert if dispatch fails */}
      {sendError && (
        <div className="mt-2.5 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{sendError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSendError(null)}
            className="text-red-400 hover:text-red-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

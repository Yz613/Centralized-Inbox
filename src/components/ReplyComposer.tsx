import React, { useRef, useState, useEffect, useMemo } from 'react';
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
  CornerUpLeft,
  ReplyAll,
  Forward,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { ChannelBadge } from './ChannelBadge';
import { ContactAutosuggest } from './ContactAutosuggest';
import { parseAddress, searchContacts, type Contact } from '../utils/contacts';
import {
  appendAddress,
  defaultReplyRecipients,
  insertMention,
  mentionAtCursor,
  quotedReplyMessage,
  replyAllRecipients,
  resolveReplyInbox,
  uniqueRecipients,
  type RecipientChip,
} from '../utils/replyMentions';
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
  const {
    inboxes,
    projectInboxes,
    sendReply,
    isGoogleConnected,
    canSendFromInbox,
    connectGoogleAccount,
    canSendAsInbox,
    replyFocusToken,
    replyTargetMessage,
    contacts,
    openComposeToContact,
    startForward,
    gmailSendAs,
  } = useInbox();

  // Find the exact inbox that originally received this message or matching recipient email
  const defaultInbox = useMemo(
    () => resolveReplyInbox(thread, undefined, inboxes, projectInboxes, gmailSendAs),
    [thread, inboxes, projectInboxes, gmailSendAs]
  );

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
  const [toRecipients, setToRecipients] = useState<RecipientChip[]>([]);
  const [toInput, setToInput] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(true);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Update selected inbox if thread changes
  useEffect(() => {
    const targetMsg =
      [...(thread.messages || [])].reverse().find((m) => !m.isOutgoing) ||
      thread.messages?.[thread.messages.length - 1];
    const target = resolveReplyInbox(thread, targetMsg, inboxes, projectInboxes, gmailSendAs);
    if (target) {
      setSelectedInboxId(target.id);
      setSubjectText(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    }
    const draft = getDraft(thread.id);
    if (draft && (draft.text?.trim() || draft.toList || draft.subject)) {
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
      if (draft.fromInboxId && draft.text?.trim() && inboxes.some((i) => i.id === draft.fromInboxId)) {
        setSelectedInboxId(draft.fromInboxId);
      }
      if (draft.toList && draft.text?.trim()) {
        setToRecipients(
          uniqueRecipients(
            draft.toList.split(/[,;]/).map((raw) => {
              const parsed = parseAddress(raw);
              return { name: parsed.name || parsed.address, address: parsed.address };
            }),
            target?.email
          )
        );
      } else {
        setToRecipients(defaultReplyRecipients(thread, target?.email, targetMsg));
      }
    } else {
      setReplyText('');
      setToRecipients(defaultReplyRecipients(thread, target?.email, targetMsg));
    }
    setToInput('');
    setMention(null);
    setQuoteOpen(true);
  }, [thread.id, thread.inboxId, inboxes, projectInboxes, gmailSendAs]);

  useEffect(() => {
    const toList = toRecipients.map((person) => person.address).join(', ');
    if (!replyText.trim() && !ccInput && !bccInput && !toList) return;
    saveDraft(thread.id, {
      text: replyText,
      subject: subjectText,
      cc: ccInput,
      bcc: bccInput,
      fromInboxId: selectedInboxId,
      toList,
    });
  }, [replyText, subjectText, ccInput, bccInput, selectedInboxId, thread.id, toRecipients]);

  useEffect(() => {
    if (!replyFocusToken) return;
    setIsCollapsed(false);
    const targetMsg =
      replyTargetMessage ||
      [...(thread.messages || [])].reverse().find((m) => !m.isOutgoing) ||
      thread.messages?.[thread.messages.length - 1];
    const target = resolveReplyInbox(thread, targetMsg, inboxes, projectInboxes, gmailSendAs);
    if (target) {
      setSelectedInboxId(target.id);
    }
    setToRecipients(defaultReplyRecipients(thread, target?.email, targetMsg));
    window.setTimeout(() => textareaRef.current?.focus(), 40);
  }, [replyFocusToken, replyTargetMessage]);

  const activeSenderInbox: InboxAccount | undefined = useMemo(() => {
    const found = inboxes.find((i) => i.id === selectedInboxId);
    if (found) return found;
    if (selectedInboxId.startsWith('sent-to-')) {
      const email = selectedInboxId.replace(/^sent-to-/, '');
      const carrier = defaultInbox || inboxes[0];
      return {
        id: selectedInboxId,
        name: email.split('@')[0],
        email,
        channel: carrier?.channel || 'cloudflare',
        role: carrier?.role || 'general',
        projectId: thread.projectId || carrier?.projectId || 'default',
        badgeColor: carrier?.badgeColor || '#3B82F6',
        unreadCount: 0,
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
      };
    }
    return defaultInbox;
  }, [inboxes, selectedInboxId, defaultInbox, thread.projectId]);
  const isChatChannel = false;

  const recipientParticipant = toRecipients[0] || thread.participants.find(
    (p) => p.address !== activeSenderInbox?.email
  ) || thread.participants[0];
  const everyoneOnReply = replyAllRecipients(thread, activeSenderInbox?.email);
  const quotedMessage = quotedReplyMessage(thread);
  const mentionSuggestions = useMemo(() => {
    if (!mention) return [];
    return searchContacts(contacts, mention.query, {
      currentProjectId: thread.projectId,
      limit: 6,
      excludeAddresses: activeSenderInbox?.email ? [activeSenderInbox.email] : [],
    });
  }, [mention, contacts, thread.projectId, activeSenderInbox?.email]);

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

  const addToRecipient = (person: RecipientChip) => {
    setToRecipients((current) => uniqueRecipients([...current, person], activeSenderInbox?.email));
    setToInput('');
  };

  const commitToInput = () => {
    const parsed = parseAddress(toInput);
    if (!parsed.address.includes('@')) return false;
    addToRecipient({ name: parsed.name || parsed.address, address: parsed.address });
    return true;
  };

  const addMentionedPerson = (contact: Contact) => {
    const address = contact.address.toLowerCase();
    if (toRecipients.some((person) => person.address === address)) return;
    setCcInput((current) => appendAddress(current, contact.address, toRecipients.map((person) => person.address)));
    setShowCcBcc(true);
  };

  const chooseMention = (contact: Contact) => {
    if (!mention) return;
    const cursor = textareaRef.current?.selectionStart ?? replyText.length;
    const label = contact.name && !contact.name.includes('@') ? contact.name : contact.address;
    const inserted = insertMention(replyText, cursor, mention.start, label);
    setReplyText(inserted.text);
    setMention(null);
    addMentionedPerson(contact);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    }, 0);
  };

  const syncMention = (text: string, cursor: number) => {
    const next = mentionAtCursor(text, cursor);
    setMention((current) => {
      if (current?.start !== next?.start || current?.query !== next?.query) setMentionIndex(0);
      return next;
    });
  };

  const executeSend = async () => {
    setIsSendingLive(true);
    setSendError(null);
    const pending = parseAddress(toInput);
    const recipients = uniqueRecipients(
      [
        ...toRecipients,
        ...(pending.address.includes('@')
          ? [{ name: pending.name || pending.address, address: pending.address }]
          : []),
      ],
      activeSenderInbox?.email
    );
    if (recipients.length === 0) {
      setIsSendingLive(false);
      setSendError('Add at least one person in To.');
      return;
    }
    try {
      const res = await sendReply(thread.id, {
        text: replyText.trim(),
        fromInboxId: selectedInboxId,
        subject: subjectText,
        to: recipients.map((person) => person.address),
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

  // If collapsed: render authentic Gmail action pills (Reply / Reply all / Forward)
  if (isCollapsed) {
    return (
      <div id="reply-composer-anchor" className="pt-2 pb-6">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const targetMsg =
                [...(thread.messages || [])].reverse().find((m) => !m.isOutgoing) ||
                thread.messages?.[thread.messages.length - 1];
              const target = resolveReplyInbox(thread, targetMsg, inboxes, projectInboxes, gmailSendAs);
              if (target) {
                setSelectedInboxId(target.id);
              }
              setToRecipients(defaultReplyRecipients(thread, target?.email, targetMsg));
              setIsCollapsed(false);
              window.setTimeout(() => textareaRef.current?.focus(), 50);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-[#1f1f1f] text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs group"
          >
            <CornerUpLeft className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
            <span>Reply</span>
          </button>

          {thread.participants.length > 2 && (
            <button
              type="button"
              onClick={() => {
                const targetMsg =
                  [...(thread.messages || [])].reverse().find((m) => !m.isOutgoing) ||
                  thread.messages?.[thread.messages.length - 1];
                const target = resolveReplyInbox(thread, targetMsg, inboxes, projectInboxes, gmailSendAs);
                if (target) {
                  setSelectedInboxId(target.id);
                }
                setToRecipients(replyAllRecipients(thread, target?.email, targetMsg));
                setIsCollapsed(false);
                window.setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-[#1f1f1f] text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs group"
            >
              <ReplyAll className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
              <span>Reply all</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              startForward(thread.id);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-[#1f1f1f] text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs group"
          >
            <Forward className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
            <span>Forward</span>
          </button>

          {replyText.trim() && (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200 cursor-pointer"
            >
              <span>Draft in progress · Resume</span>
              <ChevronDown className="w-3 h-3 rotate-180" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="reply-composer-anchor" className="rounded-2xl border border-slate-300 bg-white shadow-md p-3 sm:p-5 my-2">
      <div className="w-full space-y-2.5 sm:space-y-3">
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
              {!inboxes.some((i) => i.id === selectedInboxId) && activeSenderInbox && (
                <optgroup label="Original Recipient Address">
                  <option value={activeSenderInbox.id}>
                    {activeSenderInbox.email} (Sent to this address)
                  </option>
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
              {activeSenderInbox.channel === 'cloudflare' || canSendAsInbox(activeSenderInbox.email)
                ? 'Sending as this address'
                : 'Gmail relay · Reply-To this inbox'}
            </span>
          )}
        </div>

        {/* AI Reply Trigger, Templates Drawer & Controls */}
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

          {/* Pop out to bottom-right floating window */}
          <button
            type="button"
            onClick={() => {
              openComposeToContact({
                toAddress: toRecipients.map((r) => r.address).join(', '),
                toName: toRecipients[0]?.name,
                projectId: thread.projectId,
                fromInboxId: selectedInboxId,
                subject: subjectText,
                body: replyText,
              });
              setIsCollapsed(true);
            }}
            className="inline-flex items-center gap-1.5 text-[#1f1f1f] hover:text-black font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 transition cursor-pointer shadow-2xs"
            title="Pop out reply to bottom-right floating window"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-700" />
            <span className="hidden sm:inline">Pop out</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="inline-flex items-center gap-1.5 text-[#1f1f1f] hover:text-black font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 transition cursor-pointer shadow-2xs"
            title="Drop down / collapse composer"
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

      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <span className="w-10 pt-2 text-[#1f1f1f] font-bold">To</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
            {toRecipients.map((person) => (
              <span
                key={person.address}
                className="inline-flex items-center gap-1 rounded-full bg-[#e8f0fe] border border-blue-200 px-2 py-0.5 font-semibold text-[#1f1f1f]"
              >
                <span className="max-w-[180px] truncate">{person.name && person.name !== person.address ? person.name : person.address}</span>
                <button
                  type="button"
                  onClick={() => setToRecipients((current) => current.filter((item) => item.address !== person.address))}
                  className="text-slate-500 hover:text-red-600"
                  title={`Remove ${person.address}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex-1 min-w-[140px]">
              <ContactAutosuggest
                contacts={contacts}
                currentProjectId={thread.projectId}
                value={toInput}
                onChange={setToInput}
                onSelectContact={(contact) => addToRecipient({ name: contact.name, address: contact.address })}
                placeholder={toRecipients.length ? 'Add someone' : 'Name or email'}
                mode="single"
                excludeAddresses={[...toRecipients.map((person) => person.address), activeSenderInbox?.email || ''].filter(Boolean)}
                className="w-full border-0 bg-transparent px-1 py-1 text-xs text-[#1f1f1f] placeholder:text-slate-500 focus:outline-none focus:ring-0"
                onInputKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ',' || event.key === 'Tab') && toInput.trim()) {
                    if (commitToInput()) event.preventDefault();
                  } else if (event.key === 'Backspace' && !toInput && toRecipients.length) {
                    setToRecipients((current) => current.slice(0, -1));
                  }
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 font-bold text-[#3c4043] shrink-0">
            <button type="button" onClick={() => setShowCcBcc(true)} className="hover:text-black">Cc</button>
            <button type="button" onClick={() => setShowCcBcc(true)} className="hover:text-black">Bcc</button>
            {everyoneOnReply.length > toRecipients.length && (
              <button
                type="button"
                onClick={() => setToRecipients(everyoneOnReply)}
                className="text-blue-700 hover:text-blue-900"
              >
                Reply all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Optional CC/BCC inputs */}
      {showCcBcc && !isChatChannel && (
        <div className="space-y-2 mb-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-10 text-[#1f1f1f] font-bold">CC:</span>
            <div className="flex-1">
              <ContactAutosuggest
                contacts={contacts}
                currentProjectId={thread.projectId}
                value={ccInput}
                onChange={setCcInput}
                placeholder="e.g. manager@apexanalytics.io, Sarah..."
                mode="multiple"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-[#1f1f1f] font-bold">BCC:</span>
            <div className="flex-1">
              <ContactAutosuggest
                contacts={contacts}
                currentProjectId={thread.projectId}
                value={bccInput}
                onChange={setBccInput}
                placeholder="e.g. audit-archive@apexanalytics.io..."
                mode="multiple"
              />
            </div>
          </div>
        </div>
      )}

      {/* Reply Message Input Area */}
      <div className="relative border border-slate-300 rounded-2xl overflow-visible focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 shadow-2xs">
        {mention && (
          <div className="absolute left-3 right-3 bottom-full mb-2 z-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100">
              Add to this reply
            </div>
            {mentionSuggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">No matching people</p>
            ) : (
              mentionSuggestions.map((contact, index) => (
                <button
                  key={contact.address}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseMention(contact);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-3 ${
                    index === mentionIndex ? 'bg-[#e8f0fe]' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold text-[#1f1f1f] truncate">{contact.name || contact.address}</span>
                  <span className="text-slate-500 truncate">{contact.address}</span>
                </button>
              ))
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={isChatChannel ? 3 : 5}
          value={replyText}
          onChange={(e) => {
            setReplyText(e.target.value);
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
            syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
          }}
          placeholder={
            isChatChannel
              ? `Type WhatsApp/Direct message from ${activeSenderInbox?.name}... (Press Shift+Enter for newline)`
              : `Reply to ${recipientParticipant?.name || 'recipient'}… Type @ to add someone`
          }
          onKeyDown={(e) => {
            if (mention && mentionSuggestions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionSuggestions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                chooseMention(mentionSuggestions[Math.min(mentionIndex, mentionSuggestions.length - 1)]);
                return;
              }
            }
            if (mention && e.key === 'Escape') {
              e.preventDefault();
              setMention(null);
              return;
            }
            if (isChatChannel && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full p-4 text-xs md:text-sm bg-transparent text-[#1f1f1f] placeholder:text-slate-500 focus:outline-none resize-y font-sans leading-relaxed min-h-[72px] max-h-[220px] rounded-t-2xl"
        />
        {includeQuote && quotedMessage && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setQuoteOpen((open) => !open)}
              className="text-[11px] font-bold text-slate-600 hover:text-black"
            >
              {quoteOpen ? 'Hide original' : 'Show original'}
            </button>
            {quoteOpen && (
              <div className="mt-2 max-h-40 overflow-y-auto border-l-2 border-slate-300 pl-3 text-xs text-slate-700 whitespace-pre-wrap">
                <p className="font-semibold text-slate-800">
                  {quotedMessage.from?.name || quotedMessage.from?.address || 'Original message'}
                  {' · '}
                  {new Date(quotedMessage.timestamp).toLocaleString()}
                </p>
                {(quotedMessage.to?.length || quotedMessage.cc?.length) ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    To: {(quotedMessage.to || []).map((person) => person.name || person.address).join(', ') || '—'}
                    {quotedMessage.cc?.length ? ` · Cc: ${quotedMessage.cc.join(', ')}` : ''}
                  </p>
                ) : null}
                <p className="mt-1">{quotedMessage.bodyText || thread.snippet || '(No message body)'}</p>
              </div>
            )}
          </div>
        )}

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
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!replyText.trim()}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-xs shadow-2xs transition active:scale-95 cursor-pointer ${
                replyText.trim()
                  ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="Send (⌘+Enter)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingLive ? 'Sending…' : isChatChannel ? 'Send Message' : 'Send'}</span>
              <span className="text-[10px] opacity-75 font-mono hidden sm:inline ml-0.5">⌘↵</span>
            </button>

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
              title="Attach files"
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
            <button
              type="button"
              onClick={() => {
                clearDraft(thread.id);
                setReplyText('');
                setAttachments([]);
                setIsCollapsed(true);
              }}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition cursor-pointer"
              title="Discard draft"
            >
              <Trash2 className="w-4 h-4" />
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
    </div>
  );
};

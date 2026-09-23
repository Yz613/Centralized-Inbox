import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { ContactAutosuggest } from './ContactAutosuggest';
import { getAvatarColor } from '../utils/contacts';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Paperclip,
  AlertCircle,
  Trash2,
  ArrowLeft,
  Smile,
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { ChannelType } from '../types';
import { getComposeDraft, saveComposeDraft, clearComposeDraft } from '../utils/operatorPrefs';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewMessageModal: React.FC<NewMessageModalProps> = ({ isOpen, onClose }) => {
  const {
    projects,
    inboxes,
    selectedProjectId,
    sendNewMessage,
    isGoogleConnected,
    canSendFromInbox,
    connectGoogleAccount,
    canSendAsInbox,
    forwardPrefill,
    clearForwardPrefill,
    composePrefill,
    clearComposePrefill,
    contacts,
  } = useInbox();

  const [projectId, setProjectId] = useState<string>(
    selectedProjectId === 'all' ? projects[0]?.id || '' : selectedProjectId
  );
  const [fromInboxId, setFromInboxId] = useState<string>('');
  const [toAddress, setToAddress] = useState('');
  const [toName, setToName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showNameField, setShowNameField] = useState(false);
  const [attachments, setAttachments] = useState<
    { name: string; size: string; type: string; contentBase64?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraftingAi, setIsDraftingAi] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const hydratedOpenRef = useRef(false);

  // Gmail Window State: Minimized (docked bar), Normal (floating pop-out), or Maximized
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Available inboxes for the selected project
  const availableInboxes = inboxes.filter((i) => i.projectId === projectId);

  useEffect(() => {
    if (availableInboxes.length > 0 && (!fromInboxId || !availableInboxes.some((i) => i.id === fromInboxId))) {
      setFromInboxId(availableInboxes[0].id);
    }
  }, [projectId, availableInboxes, fromInboxId]);

  useEffect(() => {
    if (selectedProjectId !== 'all') {
      setProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isOpen) {
      hydratedOpenRef.current = false;
      setIsMinimized(false);
      return;
    }
    // When newly opened, ensure it's not minimized
    setIsMinimized(false);

    if (forwardPrefill) {
      setProjectId(forwardPrefill.projectId);
      setFromInboxId(forwardPrefill.fromInboxId);
      setToAddress(forwardPrefill.toAddress);
      setSubject(forwardPrefill.subject);
      setBody(forwardPrefill.body);
      hydratedOpenRef.current = true;
      clearForwardPrefill();
      return;
    }
    if (composePrefill) {
      if (composePrefill.projectId) setProjectId(composePrefill.projectId);
      if (composePrefill.fromInboxId) setFromInboxId(composePrefill.fromInboxId);
      if (composePrefill.toAddress) setToAddress(composePrefill.toAddress);
      if (composePrefill.toName) setToName(composePrefill.toName);
      if (composePrefill.subject) setSubject(composePrefill.subject);
      if (composePrefill.body) setBody(composePrefill.body);
      hydratedOpenRef.current = true;
      clearComposePrefill();
      return;
    }
    if (hydratedOpenRef.current) return;
    hydratedOpenRef.current = true;
    const draft = getComposeDraft();
    if (draft) {
      if (draft.fromInboxId) setFromInboxId(draft.fromInboxId);
      if (draft.toAddress) setToAddress(draft.toAddress);
      if (draft.toName) setToName(draft.toName);
      if (draft.subject) setSubject(draft.subject);
      if (draft.text) setBody(draft.text);
      if (draft.cc) {
        setCcInput(draft.cc);
        setShowCcBcc(true);
      }
      if (draft.bcc) {
        setBccInput(draft.bcc);
        setShowCcBcc(true);
      }
    }
  }, [isOpen, forwardPrefill, clearForwardPrefill, composePrefill, clearComposePrefill]);

  const recentSenders = useMemo(() => {
    return contacts
      .filter((c) => c.isSender)
      .slice(0, 5);
  }, [contacts]);

  useEffect(() => {
    if (!isOpen) return;
    if (!body.trim() && !subject.trim() && !toAddress.trim()) return;
    saveComposeDraft({
      text: body,
      subject,
      cc: ccInput,
      bcc: bccInput,
      fromInboxId,
      toAddress,
      toName,
    });
  }, [isOpen, body, subject, ccInput, bccInput, fromInboxId, toAddress, toName]);

  if (!isOpen) return null;

  const currentInbox = inboxes.find((i) => i.id === fromInboxId);
  const isLiveProvider = canSendFromInbox(currentInbox);

  const splitAddresses = (raw: string) =>
    raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleDiscardDraft = () => {
    clearComposeDraft();
    setToAddress('');
    setToName('');
    setSubject('');
    setBody('');
    setCcInput('');
    setBccInput('');
    setAttachments([]);
    setSendError(null);
    onClose();
  };

  const executeSend = async () => {
    setIsSendingLive(true);
    setSendError(null);
    try {
      const res = await sendNewMessage({
        projectId,
        fromInboxId,
        toAddress: toAddress.trim(),
        toName: toName.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        channel: (currentInbox?.channel as ChannelType) || 'gmail',
        cc: splitAddresses(ccInput),
        bcc: splitAddresses(bccInput),
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (res && res.success === false) {
        setSendError(res.error || 'Failed to send outbound message');
        return;
      }

      clearComposeDraft();
      onClose();
      // reset form
      setToAddress('');
      setToName('');
      setSubject('');
      setBody('');
      setCcInput('');
      setBccInput('');
      setAttachments([]);
    } catch (err: any) {
      setSendError(err?.message || 'Error occurred while sending message');
    } finally {
      setIsSendingLive(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!toAddress.trim() || !subject.trim() || !body.trim() || !fromInboxId) return;

    if (isLiveProvider) {
      void executeSend();
    } else {
      setSendError('Sign in with Gmail to send from this inbox — it is free and does not need paid SMTP.');
    }
  };

  const handleAiDraftSubjectAndBody = async () => {
    setIsDraftingAi(true);
    try {
      const res = await fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadSubject: subject || 'Project status update',
          latestMessage: `Drafting outbound message to ${toName || toAddress || 'client'}. Context: ${body || 'Project milestone progress check-in'}`,
          senderName: toName || 'Client',
          inboxEmail: currentInbox?.email,
          inboxRole: currentInbox?.role,
          channel: currentInbox?.channel,
          tone: 'professional',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setBody(data.reply);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDraftingAi(false);
    }
  };

  // 1. Minimized View (docked pill at bottom right, identical to Gmail)
  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-4 sm:right-8 z-50 animate-in slide-in-from-bottom-2 duration-150 pointer-events-auto">
        <div
          onClick={() => setIsMinimized(false)}
          className="h-10 w-64 sm:w-72 bg-[#202124] dark:bg-[#1e1e1e] text-white rounded-t-xl px-4 flex items-center justify-between cursor-pointer shadow-xl border-t border-x border-slate-700 hover:bg-[#2c2d30] transition select-none"
        >
          <div className="flex items-center gap-2 truncate text-xs font-semibold">
            <span className="truncate">{subject.trim() || 'New Message'}</span>
            {toAddress && (
              <span className="text-slate-400 text-[11px] truncate">({toName || toAddress})</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1 hover:bg-white/20 rounded transition text-slate-300 hover:text-white"
              title="Expand"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded transition text-slate-300 hover:text-white"
              title="Close & Save Draft"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Common Header title
  const headerTitle = subject.trim() ? subject : 'New Message';

  return (
    <>
      {/* 
        NO full-screen blocking overlay on desktop!
        Background remains completely visible and interactive, exact same as Gmail.
        On mobile, renders as full-screen slide-up view.
      */}
      <div
        className={
          isMaximized
            ? 'fixed inset-2 sm:inset-6 md:inset-10 lg:inset-x-28 lg:inset-y-12 z-50 flex flex-col pointer-events-auto shadow-2xl animate-in zoom-in-95 duration-150'
            : 'fixed bottom-0 right-0 sm:right-6 lg:right-10 z-50 w-full sm:w-[560px] md:w-[600px] max-w-full sm:max-w-[calc(100vw-32px)] h-full sm:h-[540px] max-h-full sm:max-h-[calc(100vh-60px)] flex flex-col pointer-events-auto shadow-2xl animate-in slide-in-from-bottom-4 duration-150'
        }
      >
        <div className="bg-white dark:bg-slate-900 sm:rounded-t-2xl shadow-2xl border border-slate-300 dark:border-slate-800 w-full h-full flex flex-col overflow-hidden">
          {/* Gmail Header */}
          <div className="px-3.5 py-2.5 bg-[#f2f6fc] dark:bg-[#1e232d] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between select-none">
            {/* Mobile Back Button (on small screens) */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="sm:hidden p-1 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 rounded-full"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="text-xs md:text-sm font-semibold text-[#1f1f1f] dark:text-slate-100 truncate">
                {headerTitle}
              </h3>
            </div>

            {/* Desktop Window Controls */}
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="hidden sm:inline-flex p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="hidden sm:inline-flex p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                title={isMaximized ? 'Exit full screen' : 'Full screen'}
              >
                {isMaximized ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white rounded transition cursor-pointer"
                title="Save & Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Form Content */}
          <form
            onSubmit={handleSend}
            className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white dark:bg-slate-900 text-xs"
          >
            {/* Account & Project Row (subtle Gmail From dropdown) */}
            <div className="px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/30 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 font-semibold text-[11px]">From:</span>
                <select
                  value={fromInboxId}
                  onChange={(e) => setFromInboxId(e.target.value)}
                  className="bg-transparent border-0 text-[11px] font-bold text-[#1f1f1f] dark:text-slate-200 focus:outline-none cursor-pointer py-0.5"
                >
                  {availableInboxes.map((inbox) => (
                    <option key={inbox.id} value={inbox.id}>
                      {inbox.email} ({inbox.channel.toUpperCase()} · {inbox.role})
                    </option>
                  ))}
                </select>
                {currentInbox && (
                  <ChannelBadge
                    channel={currentInbox.channel}
                    role={currentInbox.role}
                    showRole={false}
                    size="sm"
                  />
                )}
              </div>

              {projects.length > 1 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">Project:</span>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="bg-transparent border-0 text-[11px] font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer py-0.5"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!isLiveProvider && (
              <div className="m-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center justify-between gap-2">
                <span>Sign in with Gmail to send. Free with no paid SMTP.</span>
                <button
                  type="button"
                  onClick={() => connectGoogleAccount().catch(() => {})}
                  className="shrink-0 px-2 py-0.5 rounded bg-blue-600 text-white font-semibold text-[11px]"
                >
                  Sign in
                </button>
              </div>
            )}

            {/* Quick-select recent senders (if To is empty) */}
            {recentSenders.length > 0 && !toAddress && (
              <div className="px-3.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <UserCheck className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="text-slate-500 shrink-0 font-medium">Recent:</span>
                {recentSenders.map((sender) => {
                  const colors = getAvatarColor(sender.address);
                  return (
                    <button
                      key={sender.address}
                      type="button"
                      onClick={() => {
                        setToAddress(sender.address);
                        if (sender.name) setToName(sender.name);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-blue-50 text-[11px] text-[#1f1f1f] font-semibold shrink-0 cursor-pointer border border-slate-200"
                    >
                      <span className={`w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center font-bold ${colors.bg} ${colors.text}`}>
                        {sender.avatar || sender.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate max-w-[110px]">{sender.name || sender.address}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recipients (To) Row */}
            <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-slate-500 font-medium text-xs w-7 shrink-0">To</span>
              <div className="flex-1 min-w-0">
                <ContactAutosuggest
                  contacts={contacts}
                  currentProjectId={projectId}
                  placeholder={toName ? `${toName} <${toAddress}>` : 'Recipients'}
                  required
                  value={toAddress}
                  onChange={setToAddress}
                  onSelectContact={(contact) => {
                    setToAddress(contact.address);
                    if (contact.name) setToName(contact.name);
                  }}
                  mode="single"
                  className="w-full text-xs text-[#1f1f1f] dark:text-slate-100 placeholder:text-slate-400 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-slate-500 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setShowCcBcc((v) => !v)}
                  className="hover:text-black dark:hover:text-white px-1 cursor-pointer"
                >
                  {showCcBcc ? 'Hide' : 'Cc/Bcc'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNameField((v) => !v)}
                  className="hover:text-black dark:hover:text-white px-1 cursor-pointer"
                  title="Edit display name"
                >
                  {showNameField ? '−Name' : '+Name'}
                </button>
              </div>
            </div>

            {/* Optional Name field */}
            {showNameField && (
              <div className="px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50">
                <span className="text-slate-500 font-medium text-[11px] w-12 shrink-0">Name:</span>
                <input
                  type="text"
                  placeholder="Recipient Name (e.g. John Doe)"
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  className="flex-1 text-xs text-[#1f1f1f] dark:text-slate-100 bg-transparent border-0 p-0 focus:outline-none"
                />
              </div>
            )}

            {/* CC / BCC rows */}
            {showCcBcc && (
              <>
                <div className="px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <span className="text-slate-500 font-medium text-xs w-7 shrink-0">Cc</span>
                  <div className="flex-1 min-w-0">
                    <ContactAutosuggest
                      contacts={contacts}
                      currentProjectId={projectId}
                      value={ccInput}
                      onChange={setCcInput}
                      placeholder="Cc recipients (comma separated)"
                      mode="multiple"
                      className="w-full text-xs text-[#1f1f1f] dark:text-slate-100 placeholder:text-slate-400 bg-transparent border-0 p-0 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <span className="text-slate-500 font-medium text-xs w-7 shrink-0">Bcc</span>
                  <div className="flex-1 min-w-0">
                    <ContactAutosuggest
                      contacts={contacts}
                      currentProjectId={projectId}
                      value={bccInput}
                      onChange={setBccInput}
                      placeholder="Bcc recipients (comma separated)"
                      mode="multiple"
                      className="w-full text-xs text-[#1f1f1f] dark:text-slate-100 placeholder:text-slate-400 bg-transparent border-0 p-0 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Subject Line */}
            <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800">
              <input
                type="text"
                required
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs md:text-sm text-[#1f1f1f] dark:text-slate-100 placeholder:text-slate-400 font-medium bg-transparent border-0 p-0 focus:outline-none"
              />
            </div>

            {/* Body */}
            <div className="flex-1 min-h-[160px] p-3.5 flex flex-col">
              <textarea
                required
                placeholder="Write your email here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="flex-1 w-full text-xs md:text-sm text-[#1f1f1f] dark:text-slate-100 placeholder:text-slate-400 bg-transparent border-0 p-0 focus:outline-none resize-none font-sans leading-relaxed"
              />
            </div>

            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-wrap gap-1.5">
                {attachments.map((att, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-[#1f1f1f] dark:text-slate-200 font-medium shadow-2xs"
                  >
                    <Paperclip className="w-3 h-3 text-blue-600" />
                    <span className="truncate max-w-[130px]">{att.name}</span>
                    <span className="text-[10px] text-slate-500">({att.size})</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-600 ml-1 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Error banner */}
            {sendError && (
              <div className="m-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
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

            {/* Gmail Signature Bottom Action Bar */}
            <div className="px-3.5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-[#f8fafc] dark:bg-[#181d26] flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                {/* Gmail Primary Blue Send Pill */}
                <button
                  type="submit"
                  disabled={isSendingLive}
                  className="px-5 py-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white font-semibold text-xs rounded-full shadow-2xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Send (⌘+Enter)"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingLive ? 'Sending…' : 'Send'}</span>
                  <span className="text-[10px] opacity-75 hidden sm:inline ml-0.5">⌘↵</span>
                </button>

                {/* Attachment Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
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
                  }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
                  title="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* AI Assist */}
                <button
                  type="button"
                  onClick={handleAiDraftSubjectAndBody}
                  disabled={isDraftingAi}
                  className="p-2 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-full transition cursor-pointer flex items-center gap-1"
                  title="AI Draft Assistant"
                >
                  <Sparkles className={`w-4 h-4 ${isDraftingAi ? 'animate-spin' : ''}`} />
                </button>

                {/* Emoji Quick Insert */}
                <button
                  type="button"
                  onClick={() => setBody((prev) => `${prev} 👍`)}
                  className="p-2 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
                  title="Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              {/* Discard Draft Trash Button on Right */}
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition cursor-pointer"
                title="Discard draft"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};


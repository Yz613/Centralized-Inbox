import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { ContactAutosuggest } from './ContactAutosuggest';
import { getAvatarColor } from '../utils/contacts';
import { X, Send, Sparkles, Paperclip, AlertCircle, UserCheck } from 'lucide-react';
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
      return;
    }
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
              Compose Outbound Message
            </h3>
            <span className="text-[11px] text-slate-400">• Unified Project Sender</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} className="p-4 space-y-3 text-xs">
          {/* Project & Sender selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-[#1f1f1f] mb-1">
                Select Target Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] font-semibold"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#1f1f1f] mb-1">
                Send From Inbox / Channel
              </label>
              <select
                value={fromInboxId}
                onChange={(e) => setFromInboxId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] font-semibold"
              >
                {availableInboxes.map((inbox) => (
                  <option key={inbox.id} value={inbox.id}>
                    {inbox.email} ({inbox.channel.toUpperCase()} - {inbox.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentInbox && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-slate-50 border border-slate-300">
              <span className="text-[#1f1f1f] font-bold">Originating as:</span>
              <ChannelBadge
                channel={currentInbox.channel}
                role={currentInbox.role}
                showRole={true}
                size="sm"
                customEmail={currentInbox.email}
              />
              {isGoogleConnected && (
                <span className="text-xs text-emerald-800 font-bold">
                  {currentInbox.channel === 'cloudflare'
                    ? 'From this address'
                    : canSendAsInbox(currentInbox.email)
                    ? 'Verified send-as — From this address'
                    : 'Sends via Gmail, replies to this address'}
                </span>
              )}
            </div>
          )}

          {!isLiveProvider && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
              <span>Sign in with Gmail to send. No paid SMTP required.</span>
              <button
                type="button"
                onClick={() => connectGoogleAccount().catch(() => {})}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold"
              >
                Sign in
              </button>
            </div>
          )}

          {/* Quick-select recent inbound senders */}
          {recentSenders.length > 0 && !toAddress && (
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Quick Email Back (Recent Senders):</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:border-blue-400 text-xs font-semibold text-[#1f1f1f] dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs group"
                      title={`Email ${sender.name} <${sender.address}>`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${colors.bg} ${colors.text}`}
                      >
                        {sender.avatar || sender.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate max-w-[140px] font-bold group-hover:text-blue-600">
                        {sender.name || sender.address}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recipient */}
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-[#1f1f1f] dark:text-slate-200">
                  Recipient Address / Phone
                </label>
                {toName ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Recipient: <strong className="text-slate-800 dark:text-slate-200">{toName}</strong></span>
                    <button
                      type="button"
                      onClick={() => setShowNameField((v) => !v)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                    >
                      {showNameField ? 'Hide' : 'Edit name'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNameField((v) => !v)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                  >
                    {showNameField ? 'Hide Name' : '+ Add Display Name'}
                  </button>
                )}
              </div>
              <ContactAutosuggest
                contacts={contacts}
                currentProjectId={projectId}
                placeholder="e.g. client@acmecorp.com or type name / email to search"
                required
                value={toAddress}
                onChange={setToAddress}
                onSelectContact={(contact) => {
                  setToAddress(contact.address);
                  if (contact.name) {
                    setToName(contact.name);
                  }
                }}
                mode="single"
              />
            </div>

            {showNameField && (
              <div>
                <label className="block font-bold text-[#1f1f1f] dark:text-slate-200 mb-1">
                  Recipient Name (Optional)
                </label>
                <ContactAutosuggest
                  contacts={contacts}
                  currentProjectId={projectId}
                  placeholder="e.g. Sarah Jenkins"
                  value={toName}
                  onChange={setToName}
                  onSelectContact={(contact) => {
                    setToName(contact.name);
                    if (contact.address && !toAddress) {
                      setToAddress(contact.address);
                    }
                  }}
                  mode="single"
                />
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-[#1f1f1f]">
                Subject Line
              </label>
              <button
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="text-xs text-[#202124] font-bold hover:text-black hover:underline cursor-pointer"
              >
                {showCcBcc ? 'Hide CC/BCC' : 'CC/BCC'}
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Milestone 2 Deliverables & Next Steps"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] placeholder:text-slate-500 font-medium"
            />
          </div>

          {showCcBcc && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-[#1f1f1f] dark:text-slate-300 mb-1">
                  CC
                </label>
                <ContactAutosuggest
                  contacts={contacts}
                  currentProjectId={projectId}
                  value={ccInput}
                  onChange={setCcInput}
                  placeholder="CC addresses (comma separated)"
                  mode="multiple"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#1f1f1f] dark:text-slate-300 mb-1">
                  BCC
                </label>
                <ContactAutosuggest
                  contacts={contacts}
                  currentProjectId={projectId}
                  value={bccInput}
                  onChange={setBccInput}
                  placeholder="BCC addresses (comma separated)"
                  mode="multiple"
                />
              </div>
            </div>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-[#1f1f1f]">
                Message Body
              </label>
              <button
                type="button"
                onClick={handleAiDraftSubjectAndBody}
                disabled={isDraftingAi}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-800 hover:text-indigo-950 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isDraftingAi ? 'Drafting...' : 'AI Assist Draft'}</span>
              </button>
            </div>
            <textarea
              rows={6}
              required
              placeholder="Write your email or message content here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] placeholder:text-slate-500 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
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
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Attach
            </button>
            {attachments.map((att) => (
              <span key={att.name} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                {att.name}
              </span>
            ))}
          </div>

          {/* Error alert if send failed */}
          {sendError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
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

          {/* Footer toolbar */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSendingLive}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingLive ? 'Queuing…' : 'Send Message'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

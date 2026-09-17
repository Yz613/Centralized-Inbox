import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { X, Send, Sparkles, Paperclip, ChevronDown, AlertCircle } from 'lucide-react';
import { ChannelType } from '../types';
import { SendConfirmationModal } from './SendConfirmationModal';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewMessageModal: React.FC<NewMessageModalProps> = ({ isOpen, onClose }) => {
  const { projects, inboxes, selectedProjectId, sendNewMessage, isGoogleConnected } = useInbox();

  const [projectId, setProjectId] = useState<string>(
    selectedProjectId === 'all' ? projects[0]?.id || '' : selectedProjectId
  );
  const [fromInboxId, setFromInboxId] = useState<string>('');
  const [toAddress, setToAddress] = useState('');
  const [toName, setToName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isDraftingAi, setIsDraftingAi] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  if (!isOpen) return null;

  const currentInbox = inboxes.find((i) => i.id === fromInboxId);

  const isLiveProvider =
    (currentInbox?.channel === 'gmail' && isGoogleConnected) ||
    (currentInbox?.channel === 'zoho' && !!currentInbox?.zohoAppPassword);

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
      });

      if (res && res.success === false) {
        setSendError(res.error || 'Failed to send outbound message');
        return;
      }

      setShowConfirmModal(false);
      onClose();
      // reset form
      setToAddress('');
      setToName('');
      setSubject('');
      setBody('');
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
      setShowConfirmModal(true);
    } else {
      executeSend();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Compose Outbound Message
            </h3>
            <span className="text-[11px] text-slate-500">• Unified Project Sender</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} className="p-4 space-y-3 text-xs">
          {/* Project & Sender selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Select Target Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Send From Inbox / Channel
              </label>
              <select
                value={fromInboxId}
                onChange={(e) => setFromInboxId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 font-medium"
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
            <div className="flex items-center gap-2 p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500">Originating as:</span>
              <ChannelBadge
                channel={currentInbox.channel}
                role={currentInbox.role}
                showRole={true}
                size="sm"
                customEmail={currentInbox.email}
              />
            </div>
          )}

          {/* Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Recipient Address / Phone
              </label>
              <input
                type="text"
                required
                placeholder="e.g. client@acmecorp.com or +1415..."
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Recipient Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah Jenkins"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Subject Line
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Milestone 2 Deliverables & Next Steps"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">
                Message Body
              </label>
              <button
                type="button"
                onClick={handleAiDraftSubjectAndBody}
                disabled={isDraftingAi}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <Sparkles className="w-3 h-3" />
                <span>{isDraftingAi ? 'Drafting...' : 'AI Assist Draft'}</span>
              </button>
            </div>
            <textarea
              rows={6}
              required
              placeholder="Write your email or message content here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
              className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Message</span>
            </button>
          </div>
        </form>

        {/* Confirmation Modal for Live Workspace / Zoho Send */}
        {currentInbox && (
          <SendConfirmationModal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            onConfirm={executeSend}
            fromEmail={currentInbox.email}
            channel={currentInbox.channel}
            toAddress={toAddress}
            subject={subject}
            bodyPreview={body}
            isSending={isSendingLive}
          />
        )}
      </div>
    </div>
  );
};

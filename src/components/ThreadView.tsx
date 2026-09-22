import React, { useRef, useEffect, useState } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { ReplyComposer } from './ReplyComposer';
import { Attachment } from '../types';
import { SpamReview } from './SpamReview';
import {
  Star,
  Archive,
  Mail,
  Trash2,
  Paperclip,
  Download,
  ArrowLeft,
  Tag,
  Pencil,
  Check,
  X,
  ChevronsUpDown,
  CornerUpLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Forward,
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react';
import { getSnoozeUntil, isThreadSnoozed, snoozeTonightIso, snoozeMondayIso } from '../utils/operatorPrefs';

function parseEmailBody(text?: string) {
  if (!text) return { main: '', quote: '' };
  const quoteSplitters = [
    /\n(?=On [A-Za-z]+, [A-Za-z0-9 ,:]+ wrote:)/i,
    /\n(?=---+\s*Original Message\s*---+)/i,
    /\n(?=_{10,})/i,
    /\n(?=>\s)/,
  ];

  for (const regex of quoteSplitters) {
    const match = text.search(regex);
    if (match !== -1) {
      return {
        main: text.slice(0, match).trimEnd(),
        quote: text.slice(match).trimStart(),
      };
    }
  }

  return { main: text, quote: '' };
}

interface ThreadViewProps {
  onBackMobile?: () => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ onBackMobile }) => {
  const {
    activeThread,
    inboxes,
    projects,
    toggleStar,
    toggleArchive,
    markThreadRead,
    deleteThread,
    updateThread,
    reviewThreadSpam,
    snoozeThread,
    snoozeThreadUntil,
    unsnoozeThread,
    startForward,
  } = useInbox();

  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectText, setSubjectText] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [detailsOpenFor, setDetailsOpenFor] = useState<Set<string>>(new Set());
  const [attachmentsCollapsedFor, setAttachmentsCollapsedFor] = useState<Set<string>>(new Set());
  const [quotesOpenFor, setQuotesOpenFor] = useState<Set<string>>(new Set());

  const toggleDetailsOpen = (msgId: string) => {
    setDetailsOpenFor((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const toggleAttachmentsCollapse = (msgId: string) => {
    setAttachmentsCollapsedFor((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const toggleQuotesOpen = (msgId: string) => {
    setQuotesOpenFor((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  useEffect(() => {
    if (activeThread) {
      setSubjectText(activeThread.subject);
      setIsEditingSubject(false);
      setIsAddingTag(false);

      // Gmail style: in multi-message threads, expand the newest message (and any unread ones)
      const msgs = activeThread.messages || [];
      const newExpanded = new Set<string>();
      if (msgs.length <= 2) {
        msgs.forEach((m) => newExpanded.add(m.id));
      } else {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) newExpanded.add(lastMsg.id);
        msgs.forEach((m) => {
          if (!activeThread.isRead && m === lastMsg) newExpanded.add(m.id);
        });
      }
      setExpandedMessageIds(newExpanded);
    }
  }, [activeThread?.id]);

  const toggleMessageExpand = (msgId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const toggleAllMessages = () => {
    if (!activeThread) return;
    const msgs = activeThread.messages || [];
    if (expandedMessageIds.size === msgs.length) {
      // Collapse to just the latest message
      const lastMsg = msgs[msgs.length - 1];
      setExpandedMessageIds(new Set(lastMsg ? [lastMsg.id] : []));
    } else {
      // Expand all messages
      setExpandedMessageIds(new Set(msgs.map((m) => m.id)));
    }
  };

  const handleSaveSubject = () => {
    if (!subjectText.trim() || !activeThread) return;
    updateThread(activeThread.id, { subject: subjectText.trim() });
    setIsEditingSubject(false);
  };

  const handleAddTag = () => {
    if (!newTagText.trim() || !activeThread) return;
    const tag = newTagText.trim().toUpperCase();
    if (!activeThread.tags.includes(tag)) {
      updateThread(activeThread.id, { tags: [...activeThread.tags, tag] });
    }
    setNewTagText('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeThread) return;
    updateThread(activeThread.id, {
      tags: activeThread.tags.filter((t) => t !== tagToRemove),
    });
  };

  /**
   * REAL FILE DOWNLOAD HANDLER
   * Downloads genuine binary attachments directly to the user's computer.
   */
  const handleDownloadAttachment = (att: Attachment) => {
    try {
      if (att.dataUrl) {
        const link = document.createElement('a');
        link.href = att.dataUrl;
        link.download = att.name || 'attachment';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      if (att.contentBase64) {
        const link = document.createElement('a');
        link.href = `data:${att.type || 'application/octet-stream'};base64,${att.contentBase64}`;
        link.download = att.name || 'attachment';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      if (att.url) {
        const link = document.createElement('a');
        link.href = att.url;
        link.download = att.name || 'attachment';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // If raw bytes were not stored in legacy records, generate a clean downloadable file
      const blob = new Blob(
        [`File: ${att.name}\nSize: ${att.size}\nType: ${att.type}\nExported from Unified Inbox`],
        { type: att.type || 'text/plain;charset=utf-8' }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = att.name.includes('.') ? att.name : `${att.name}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Real download error:', err);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeThread) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.id, activeThread?.messages.length]);

  if (!activeThread) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
          <Mail className="w-8 h-8 text-slate-300 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Select a conversation
        </h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Choose an email or message thread from the feed to read its full history and reply directly using the originating inbox.
        </p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === activeThread.projectId);
  const targetInbox = inboxes.find((i) => i.id === activeThread.inboxId);
  const msgs = activeThread.messages || [];
  const allExpanded = expandedMessageIds.size === msgs.length;

  const formatFullDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const formatShortTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Top Toolbar (Gmail-Style) */}
      <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {isEditingSubject ? (
                <div className="flex items-center gap-1.5 py-0.5">
                  <input
                    type="text"
                    value={subjectText}
                    onChange={(e) => setSubjectText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveSubject();
                      if (e.key === 'Escape') setIsEditingSubject(false);
                    }}
                    autoFocus
                    placeholder="Custom thread title..."
                    className="px-3 py-1 text-sm font-bold bg-white dark:bg-slate-800 border border-blue-500 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none ring-2 ring-blue-500/20 w-72"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSubject}
                    className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                    title="Save Title"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectText(activeThread.subject);
                      setIsEditingSubject(false);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 truncate max-w-md font-sans tracking-tight">
                    {activeThread.subject || '(No Subject)'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectText(activeThread.subject);
                      setIsEditingSubject(true);
                    }}
                    className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Rename Subject"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}

              {project && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border"
                  style={{
                    backgroundColor: `${project.color}15`,
                    borderColor: `${project.color}35`,
                    color: project.color,
                  }}
                >
                  {project.name}
                </span>
              )}

              {msgs.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-semibold">
                  {msgs.length} messages
                </span>
              )}
            </div>

            {/* Delivering Inbox Badge & Labels (Collapsible) */}
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 flex-wrap">
              <span className="text-slate-400">Delivered to:</span>
              <ChannelBadge
                channel={activeThread.channel}
                role={activeThread.inboxRole}
                showRole={true}
                size="sm"
                customEmail={targetInbox?.email}
              />

              <button
                type="button"
                onClick={() => setMetadataOpen(!metadataOpen)}
                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium px-2 py-0.5 rounded-full border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center gap-1"
                title={metadataOpen ? 'Collapse labels' : 'Expand labels'}
              >
                <span>{metadataOpen ? 'Less' : `Tags ${activeThread.tags.length > 0 ? `(${activeThread.tags.length})` : ''}`}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${metadataOpen ? 'rotate-180' : ''}`} />
              </button>

              {metadataOpen && (
                <div className="flex items-center gap-1.5 ml-1 flex-wrap animate-in fade-in duration-100">
                  {activeThread.tags.filter(t => t !== 'SPAM').map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300 font-medium border border-slate-200/60 dark:border-slate-700"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="hover:text-red-500 cursor-pointer ml-0.5"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {isAddingTag ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={newTagText}
                        onChange={(e) => setNewTagText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag();
                          if (e.key === 'Escape') setIsAddingTag(false);
                        }}
                        placeholder="Tag..."
                        autoFocus
                        className="px-2 py-0.5 text-[10px] bg-white dark:bg-slate-800 border border-blue-500 rounded-md text-slate-800 dark:text-slate-100 w-20 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="text-blue-600 hover:text-blue-700 text-[10px] font-bold cursor-pointer"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingTag(false)}
                        className="text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(true)}
                      className="text-[10px] text-slate-400 hover:text-blue-600 font-medium px-1.5 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Add custom tag"
                    >
                      + Label
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Toolbar (Gmail Icons) */}
        <div className="flex items-center gap-1 shrink-0 text-slate-500">
          {msgs.length > 1 && (
            <button
              type="button"
              onClick={toggleAllMessages}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer flex items-center gap-1 text-[11px] font-medium"
              title={allExpanded ? 'Collapse all messages' : 'Expand all messages'}
            >
              <ChevronsUpDown className="w-4 h-4" />
              <span className="hidden sm:inline">{allExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleStar(activeThread.id)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer"
            title={activeThread.isStarred ? 'Unstar' : 'Star'}
          >
            <Star
              className={`w-4 h-4 ${
                activeThread.isStarred
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => markThreadRead(activeThread.id, !activeThread.isRead)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer"
            title={activeThread.isRead ? 'Mark as Unread' : 'Mark as Read'}
          >
            <Mail className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleArchive(activeThread.id)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer"
            title={activeThread.isArchived ? 'Unarchive' : 'Archive'}
          >
            <Archive className="w-4 h-4" />
          </button>
          {isThreadSnoozed(activeThread.id) ? (
            <button
              type="button"
              onClick={() => unsnoozeThread(activeThread.id)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-amber-600 transition cursor-pointer"
              title={`Wake this thread${getSnoozeUntil(activeThread.id) ? ` (${new Date(getSnoozeUntil(activeThread.id)!).toLocaleString()})` : ''}`}
            >
              <Clock className="w-4 h-4" />
            </button>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSnoozeOpen((v) => !v)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer"
                title="Snooze"
              >
                <Clock className="w-4 h-4" />
              </button>
              {snoozeOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 text-xs">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      snoozeThread(activeThread.id, 60 * 60 * 1000);
                      setSnoozeOpen(false);
                    }}
                  >
                    In 1 hour
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      snoozeThreadUntil(activeThread.id, snoozeTonightIso());
                      setSnoozeOpen(false);
                    }}
                  >
                    Tonight 8pm
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      snoozeThread(activeThread.id, 24 * 60 * 60 * 1000);
                      setSnoozeOpen(false);
                    }}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      snoozeThreadUntil(activeThread.id, snoozeMondayIso());
                      setSnoozeOpen(false);
                    }}
                  >
                    Monday 8am
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => startForward(activeThread.id)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition cursor-pointer"
            title="Forward (F)"
          >
            <Forward className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => deleteThread(activeThread.id)}
            className="p-2 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 rounded-full text-slate-500 transition cursor-pointer"
            title="Delete Conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SpamReview key={activeThread.id} thread={activeThread} onReview={reviewThreadSpam} />

      {/* Message Stream (Gmail-Style Cards & Stacking) */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 bg-[#f8fafd] dark:bg-slate-950">
        {msgs.map((message, idx) => {
          const isSenderUser = message.isOutgoing;
          const msgInbox = inboxes.find((i) => i.id === message.inboxId) || targetInbox;
          const isExpanded = expandedMessageIds.has(message.id);
          const isDetailsOpen = detailsOpenFor.has(message.id);
          const isAttachmentsCollapsed = attachmentsCollapsedFor.has(message.id);
          const isQuotesOpen = quotesOpenFor.has(message.id);

          // 1. COLLAPSED VIEW (Like Gmail for earlier messages in thread)
          if (!isExpanded) {
            return (
              <div
                key={message.id || idx}
                onClick={() => toggleMessageExpand(message.id)}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 cursor-pointer transition shadow-2xs flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-200 dark:border-slate-700">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 shrink-0">
                    {message.from.name}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate font-normal">
                    {message.bodyText ? message.bodyText.replace(/\s+/g, ' ').slice(0, 110) : message.subject}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-slate-400 text-[11px]">
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{formatShortTime(message.timestamp)}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition" />
                </div>
              </div>
            );
          }

          const parsedBody = parseEmailBody(message.bodyText);

          // 2. EXPANDED VIEW (Full Gmail Card with header, body & real attachment downloads)
          return (
            <div
              key={message.id || idx}
              className={`rounded-2xl border shadow-2xs overflow-hidden transition ${
                isSenderUser
                  ? 'bg-blue-50/30 dark:bg-slate-900 border-blue-200/70 dark:border-slate-800'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {/* Message Header */}
              <div
                onClick={() => msgs.length > 1 && toggleMessageExpand(message.id)}
                className={`p-4 md:p-4.5 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  msgs.length > 1 ? 'cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {message.from.name}
                      </span>
                      <span className="text-slate-400 text-xs">
                        &lt;{message.from.address}&gt;
                      </span>
                      {isSenderUser && (
                        <span className="px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-bold text-[9px]">
                          SENT
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>to {message.to.map((t) => t.address).join(', ')}</span>
                      {msgInbox && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            via <strong>{msgInbox.email}</strong>
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDetailsOpen(message.id);
                        }}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition cursor-pointer"
                        title={isDetailsOpen ? 'Hide email details' : 'Show email details'}
                      >
                        <span>details</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isDetailsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-xs font-normal">
                  <span>{formatFullDate(message.timestamp)}</span>
                  {msgs.length > 1 && (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Full Email Details Header Drawer (Collapsible) */}
              {isDetailsOpen && (
                <div className="mx-4 md:mx-5 my-3 p-3.5 bg-slate-50/90 dark:bg-slate-850/70 rounded-xl border border-slate-200/70 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 space-y-1.5 animate-in fade-in duration-100">
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-slate-400 text-[11px] font-medium">From:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{message.from.name} &lt;{message.from.address}&gt;</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-slate-400 text-[11px] font-medium">To:</span>
                    <span>{message.to.map((t) => (t.name ? `${t.name} <${t.address}>` : t.address)).join(', ')}</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-slate-400 text-[11px] font-medium">Date:</span>
                    <span>{formatFullDate(message.timestamp)}</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-slate-400 text-[11px] font-medium">Subject:</span>
                    <span>{message.subject || activeThread.subject}</span>
                  </div>
                  {msgInbox && (
                    <div className="grid grid-cols-[80px_1fr] gap-1">
                      <span className="text-slate-400 text-[11px] font-medium">Delivered to:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{msgInbox.name} ({msgInbox.email})</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-slate-400 text-[11px] font-medium">Security:</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Standard encryption (TLS) · Verified sender</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Message Body with Quoted History Open/Close Toggle */}
              <div className="p-5 md:p-6 text-sm md:text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed md:leading-loose font-sans selection:bg-blue-100">
                {message.bodyHtml ? (
                  <div
                    className="prose dark:prose-invert max-w-none text-sm md:text-[15px] leading-relaxed md:leading-loose"
                    dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                  />
                ) : (
                  <div>
                    <div className="whitespace-pre-wrap">{parsedBody.main || '(No content)'}</div>

                    {parsedBody.quote && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => toggleQuotesOpen(message.id)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                          title={isQuotesOpen ? 'Hide trimmed history' : 'Show trimmed history'}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                          <span>{isQuotesOpen ? 'Hide quoted text' : 'Show quoted text'}</span>
                        </button>

                        {isQuotesOpen && (
                          <div className="mt-2.5 pt-1.5 border-l-2 border-slate-300 dark:border-slate-700 pl-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-sans animate-in fade-in duration-100">
                            {parsedBody.quote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Attachments Section (Collapsible Accordion with Real Download) */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="p-4 md:p-5 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                  <div
                    onClick={() => toggleAttachmentsCollapse(message.id)}
                    className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-1.5 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                      <span>Attachments ({message.attachments.length})</span>
                    </div>
                    <span className="text-[11px] lowercase text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                      <span>{isAttachmentsCollapsed ? 'show' : 'hide'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isAttachmentsCollapsed ? '' : 'rotate-180'}`} />
                    </span>
                  </div>

                  {!isAttachmentsCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 animate-in fade-in duration-100">
                      {message.attachments.map((att, attIdx) => {
                        const lower = (att.name || '').toLowerCase();
                        const type = (att.type || '').toLowerCase();
                        const isPdf = lower.endsWith('.pdf') || type.includes('pdf');
                        const isImg = type.includes('image') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lower);
                        const isZip = /\.(zip|tar|gz|rar|7z)$/i.test(lower);
                        const isDoc = /\.(doc|docx|txt|rtf)$/i.test(lower);
                        const isSheet = /\.(xls|xlsx|csv)$/i.test(lower);

                        const badgeColor = isPdf
                          ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400'
                          : isImg
                          ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400'
                          : isZip
                          ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                          : isSheet
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : isDoc
                          ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300';

                        const badgeLabel = isPdf
                          ? 'PDF'
                          : isImg
                          ? 'IMG'
                          : isZip
                          ? 'ZIP'
                          : isSheet
                          ? 'XLS'
                          : isDoc
                          ? 'DOC'
                          : 'FILE';

                        return (
                          <div
                            key={attIdx}
                            onClick={() => handleDownloadAttachment(att)}
                            className="group relative flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70 hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
                            title={`Download ${att.name}`}
                          >
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs ${badgeColor}`}
                            >
                              {badgeLabel}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                                {att.name}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{att.size}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadAttachment(att);
                              }}
                              className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                              title="Download File"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Composer Sticky Bottom */}
      <ReplyComposer key={activeThread.id} thread={activeThread} />
    </div>
  );
};

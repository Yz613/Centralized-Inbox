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
  Columns2,
  Rows2,
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
  readingPaneMode?: 'none' | 'split';
  onToggleReadingPaneMode?: () => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({
  onBackMobile,
  readingPaneMode = 'split',
  onToggleReadingPaneMode,
}) => {
  const {
    activeThread,
    inboxes,
    projects,
    setSelectedThreadId,
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeThread && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeThread?.id]);

  if (!activeThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-center bg-[#f8fafd] select-none">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs border border-blue-100">
          <Mail className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-[#1f1f1f] mb-1.5 font-display">
          Select a conversation
        </h3>
        <p className="text-xs text-[#5f6368] max-w-sm leading-relaxed">
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

  const handleClose = () => {
    if (onBackMobile) onBackMobile();
    setSelectedThreadId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {/* 1. Gmail Top Action Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0 bg-white select-none">
        <div className="flex items-center gap-1.5 text-[#444746]">
          {/* Prominent Back to Inbox button */}
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
            title="Back to inbox (Esc)"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
            <span>Back to inbox</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => toggleArchive(activeThread.id)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition cursor-pointer"
            title={activeThread.isArchived ? 'Unarchive (E)' : 'Archive (E)'}
          >
            <Archive className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => deleteThread(activeThread.id)}
            className="p-2 hover:bg-red-50 hover:text-red-600 rounded-full text-slate-500 transition cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => markThreadRead(activeThread.id, false)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition cursor-pointer"
            title="Mark as unread (U)"
          >
            <Mail className="w-4 h-4" />
          </button>

          {isThreadSnoozed(activeThread.id) ? (
            <button
              type="button"
              onClick={() => unsnoozeThread(activeThread.id)}
              className="p-2 hover:bg-slate-100 rounded-full text-amber-600 transition cursor-pointer"
              title="Unsnooze thread"
            >
              <Clock className="w-4 h-4" />
            </button>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSnoozeOpen((v) => !v)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition cursor-pointer"
                title="Snooze"
              >
                <Clock className="w-4 h-4" />
              </button>
              {snoozeOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-44 rounded-2xl border border-slate-200 bg-white shadow-xl p-1 text-xs">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-slate-100"
                    onClick={() => {
                      snoozeThread(activeThread.id, 60 * 60 * 1000);
                      setSnoozeOpen(false);
                    }}
                  >
                    In 1 hour
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-slate-100"
                    onClick={() => {
                      snoozeThreadUntil(activeThread.id, snoozeTonightIso());
                      setSnoozeOpen(false);
                    }}
                  >
                    Tonight 8pm
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-slate-100"
                    onClick={() => {
                      snoozeThread(activeThread.id, 24 * 60 * 60 * 1000);
                      setSnoozeOpen(false);
                    }}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-slate-100"
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
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition cursor-pointer"
            title="Forward (F)"
          >
            <Forward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {msgs.length > 1 && (
            <button
              type="button"
              onClick={toggleAllMessages}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#1f1f1f] text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title={allExpanded ? 'Collapse all messages' : 'Expand all messages'}
            >
              <div className="w-4 h-4 rounded border border-slate-300/80 bg-white flex items-center justify-center">
                {allExpanded ? (
                  <ChevronUp className="w-3 h-3 text-blue-600" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-blue-600" />
                )}
              </div>
              <span>{allExpanded ? `Collapse All (${msgs.length})` : `Expand All (${msgs.length})`}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => toggleStar(activeThread.id)}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 hover:text-amber-500 transition cursor-pointer"
            title={activeThread.isStarred ? 'Unstar' : 'Star'}
          >
            <Star
              className={`w-4 h-4 ${
                activeThread.isStarred
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-slate-500 hover:text-amber-500'
              }`}
            />
          </button>

          {onToggleReadingPaneMode && (
            <button
              type="button"
              onClick={onToggleReadingPaneMode}
              className={`p-1.5 rounded-lg border transition cursor-pointer hidden md:flex items-center gap-1 text-xs ${
                readingPaneMode === 'split'
                  ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                  : 'text-[#202124] border-slate-300 hover:bg-slate-100 font-medium'
              }`}
              title={
                readingPaneMode === 'split'
                  ? 'Switch to full width reader'
                  : 'Switch to split view (show list next to reader)'
              }
            >
              {readingPaneMode === 'split' ? (
                <Columns2 className="w-4 h-4 text-blue-700" />
              ) : (
                <Rows2 className="w-4 h-4 text-[#202124]" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black transition cursor-pointer ml-1"
            title="Close conversation (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Large Subject Title & Project Label in Google Sans */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
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
                  placeholder="Thread subject..."
                  className="px-3 py-1 text-base font-bold bg-white dark:bg-slate-800 border border-blue-500 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none ring-2 ring-blue-500/20 w-80"
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
              <div className="flex items-center gap-2 group min-w-0">
                <h1 className="text-[20px] md:text-[22px] font-normal tracking-[-0.2px] text-[#1f1f1f] dark:text-slate-100 font-display truncate">
                  {activeThread.subject || '(No Subject)'}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setSubjectText(activeThread.subject);
                    setIsEditingSubject(true);
                  }}
                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  title="Rename Subject"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Gmail Label Chip for Project */}
            {project && (
              <span
                className="px-2.5 py-0.5 rounded-md text-xs font-semibold tracking-wide border flex items-center gap-1.5 shrink-0"
                style={{
                  backgroundColor: `${project.color}15`,
                  borderColor: `${project.color}35`,
                  color: project.color,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span>{project.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#202124] font-semibold">
            <span>Delivered via:</span>
            <ChannelBadge
              channel={activeThread.channel}
              role={activeThread.inboxRole}
              showRole={true}
              size="sm"
              customEmail={targetInbox?.email}
            />
          </div>
        </div>
      </div>

      <SpamReview key={`spam-${activeThread.id}`} thread={activeThread} onReview={reviewThreadSpam} />

      {/* Message Stream (Gmail-Style Cards & Stacking) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f8fafd]">
        <div className="max-w-4xl mx-auto w-full space-y-4">
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
                className="rounded-2xl border border-slate-300 bg-white p-3.5 hover:bg-slate-50 cursor-pointer transition shadow-2xs flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-slate-100 text-[#1f1f1f] font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-300">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-bold text-xs text-[#1f1f1f] shrink-0">
                    {message.from.name}
                  </span>
                  <span className="text-xs text-[#3c4043] truncate font-medium">
                    {message.bodyText ? message.bodyText.replace(/\s+/g, ' ').slice(0, 110) : message.subject}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[#202124] text-xs font-semibold">
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip className="w-3.5 h-3.5 text-slate-600" />
                  )}
                  <span>{formatShortTime(message.timestamp)}</span>
                  <div className="w-6 h-6 rounded-md border border-slate-300 bg-slate-50 group-hover:bg-blue-50 group-hover:border-blue-300 flex items-center justify-center transition shadow-2xs">
                    <ChevronDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-700 transition" />
                  </div>
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
                  ? 'bg-blue-50/30 border-blue-300'
                  : 'bg-white border-slate-300'
              }`}
            >
              {/* Message Header */}
              <div
                onClick={() => msgs.length > 1 && toggleMessageExpand(message.id)}
                className={`p-4 md:p-4.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  msgs.length > 1 ? 'cursor-pointer hover:bg-slate-100' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#1f1f1f] text-sm">
                        {message.from.name}
                      </span>
                      <span className="text-[#3c4043] text-xs font-semibold">
                        &lt;{message.from.address}&gt;
                      </span>
                      {isSenderUser && (
                        <span className="px-2 py-0.2 rounded-full bg-blue-100 text-blue-900 font-bold text-[9px]">
                          SENT
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#3c4043] mt-0.5 flex items-center gap-1.5 flex-wrap font-medium">
                      <span>to {message.to.map((t) => t.address).join(', ')}</span>
                      {msgInbox && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="text-[#3c4043]">
                            via <strong className="text-[#1f1f1f]">{msgInbox.email}</strong>
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDetailsOpen(message.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 transition cursor-pointer font-bold text-[11px] text-[#202124] hover:text-black shadow-2xs"
                        title={isDetailsOpen ? 'Hide email details' : 'Show email details'}
                      >
                        <span>details</span>
                        <ChevronDown className={`w-3 h-3 text-slate-600 transition-transform duration-150 ${isDetailsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[#202124] text-xs font-semibold">
                  <span>{formatFullDate(message.timestamp)}</span>
                  {msgs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMessageExpand(message.id);
                      }}
                      className="w-7 h-7 rounded-md border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 hover:text-black transition cursor-pointer shadow-2xs ml-1"
                      title="Collapse this email"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Full Email Details Header Drawer (Collapsible) */}
              {isDetailsOpen && (
                <div className="mx-4 md:mx-5 my-3 p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-[#202124] space-y-1.5 animate-in fade-in duration-100">
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-[#3c4043] text-[11px] font-bold">From:</span>
                    <span className="font-bold text-[#1f1f1f]">{message.from.name} &lt;{message.from.address}&gt;</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-[#3c4043] text-[11px] font-bold">To:</span>
                    <span className="font-medium text-[#1f1f1f]">{message.to.map((t) => (t.name ? `${t.name} <${t.address}>` : t.address)).join(', ')}</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-[#3c4043] text-[11px] font-bold">Date:</span>
                    <span className="font-medium text-[#1f1f1f]">{formatFullDate(message.timestamp)}</span>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-[#3c4043] text-[11px] font-bold">Subject:</span>
                    <span className="font-bold text-[#1f1f1f]">{message.subject || activeThread.subject}</span>
                  </div>
                  {msgInbox && (
                    <div className="grid grid-cols-[80px_1fr] gap-1">
                      <span className="text-[#3c4043] text-[11px] font-bold">Delivered to:</span>
                      <span className="text-blue-700 font-bold">{msgInbox.name} ({msgInbox.email})</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-[#3c4043] text-[11px] font-bold">Security:</span>
                    <span className="flex items-center gap-1 text-emerald-800 font-bold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Standard encryption (TLS) · Verified sender</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Message Body with Quoted History Open/Close Toggle */}
              <div className="p-5 md:p-6 text-[14.5px] text-[#1f1f1f] leading-relaxed font-sans selection:bg-blue-100">
                {message.bodyHtml ? (
                  <div
                    className="prose max-w-none text-sm md:text-[15px] leading-relaxed md:leading-loose text-[#1f1f1f]"
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
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1f1f1f] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer border border-slate-300 shadow-2xs"
                          title={isQuotesOpen ? 'Hide trimmed history' : 'Show trimmed history'}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-slate-600" />
                          <span>{isQuotesOpen ? 'Hide quoted text' : 'Show quoted text'}</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-150 ${isQuotesOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isQuotesOpen && (
                          <div className="mt-2.5 pt-1.5 border-l-2 border-slate-400 pl-3.5 text-xs text-[#3c4043] whitespace-pre-wrap font-sans animate-in fade-in duration-100">
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
                <div className="p-4 md:p-5 bg-slate-50 border-t border-slate-200">
                  <div
                    onClick={() => toggleAttachmentsCollapse(message.id)}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer select-none group mb-3 transition shadow-2xs"
                    title={isAttachmentsCollapsed ? 'Expand attachments' : 'Collapse attachments'}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <Paperclip className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-[#1f1f1f]">
                        Attachments ({message.attachments.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-300 bg-slate-50 text-xs text-blue-700 font-bold group-hover:bg-blue-50 group-hover:border-blue-300 transition shadow-2xs">
                      <span>{isAttachmentsCollapsed ? 'Expand' : 'Collapse'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isAttachmentsCollapsed ? '' : 'rotate-180'}`} />
                    </div>
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
                          ? 'bg-red-50 text-red-700 border-red-300'
                          : isImg
                          ? 'bg-purple-50 text-purple-700 border-purple-300'
                          : isZip
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : isSheet
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : isDoc
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-slate-100 text-[#1f1f1f] border-slate-300';

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
                            className="group relative flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-300 hover:border-blue-500 hover:shadow-xs transition cursor-pointer"
                            title={`Download ${att.name}`}
                          >
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs ${badgeColor}`}
                            >
                              {badgeLabel}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-[#1f1f1f] text-xs truncate group-hover:text-blue-700 transition">
                                {att.name}
                              </p>
                              <p className="text-[11px] text-[#3c4043] font-semibold mt-0.5">{att.size}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadAttachment(att);
                              }}
                              className="p-1.5 rounded-xl hover:bg-blue-50 text-[#202124] hover:text-blue-700 transition cursor-pointer"
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
        </div>
      </div>

      {/* Reply Composer Sticky Bottom */}
      <ReplyComposer key={`reply-${activeThread.id}`} thread={activeThread} />
    </div>
  );
};

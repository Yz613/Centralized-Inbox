import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { ReplyComposer } from './ReplyComposer';
import { Attachment } from '../types';
import { deduplicateMessages } from '../utils/mergeThreads';
import { SpamReview } from './SpamReview';
import { LocalEmailAI } from './LocalEmailAI';
import { ImageAttachmentViewer } from './ImageAttachmentViewer';
import { getImageMimeType } from '../utils/attachments';
import { loadAttachmentSource, downloadAttachmentSource } from '../services/attachmentSource';
import {
  Star,
  Archive,
  Mail,
  Trash2,
  Paperclip,
  Download,
  ArrowLeft,
  Pencil,
  Check,
  X,
  ChevronsUpDown,
  CornerUpLeft,
  ChevronDown,
  Clock,
  Forward,
  ShieldCheck,
  MoreVertical,
  Columns2,
  Rows2,
  Inbox as InboxIcon,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Printer,
  ExternalLink,
  Sparkles,
  Smile,
  ReplyAll,
} from 'lucide-react';
import { getSpamStatus } from '../utils/spam';
import { getSnoozeUntil, isThreadSnoozed, snoozeTonightIso, snoozeMondayIso } from '../utils/operatorPrefs';
import { sanitizeEmailHtml } from '../utils/trackerBlocking';
import { classifyThreadStream } from '../utils/streamClassification';
import { hasMultipleReplyRecipients, resolveReplyInbox } from '../utils/replyMentions';

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

const AVATAR_COLORS = [
  '#7c3aed', // purple (matches Rose Paulino in Gmail screenshot)
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#e11d48', // rose
  '#0d9488', // teal
  '#4f46e5', // indigo
  '#c026d3', // fuchsia
  '#ea580c', // orange
];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatGmailDate(isoStr: string, isExpanded = false) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));

    let relative = '';
    if (diffMins < 1) relative = 'just now';
    else if (diffMins < 60) relative = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    else if (diffHours < 24) relative = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    else if (diffDays === 1) relative = '1 day ago';
    else if (diffDays < 30) relative = `${diffDays} days ago`;
    else relative = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isExpanded) {
      if (diffDays === 0) {
        return `${timeStr} (${relative})`;
      }
      const fullDateStr = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
      return `${fullDateStr}, ${timeStr} (${relative})`;
    }

    // Collapsed message format: Mon, Oct 19, 4:39 PM (2 days ago)
    if (diffDays === 0) {
      return `${timeStr} (${relative})`;
    }
    const weekdayDateStr = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return `${weekdayDateStr}, ${timeStr} (${relative})`;
  } catch {
    return isoStr;
  }
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
    projectInboxes,
    gmailSendAs,
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
    requestReply,
    setThreadStream,
    filteredThreads,
    selectAdjacentThread,
  } = useInbox();

  const currentThreadIdx = filteredThreads.findIndex((t) => t.id === activeThread?.id);
  const threadPosText = currentThreadIdx >= 0 ? `${currentThreadIdx + 1} of ${filteredThreads.length}` : '';

  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectText, setSubjectText] = useState(activeThread?.subject || '');
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const msgsList = activeThread?.messages || [];
    if (msgsList.length <= 1) {
      msgsList.forEach((m) => initial.add(m.id));
    } else {
      msgsList.forEach((m, idx) => {
        if (idx === msgsList.length - 1 || (!activeThread?.isRead && !m.isOutgoing)) {
          initial.add(m.id);
        }
      });
    }
    return initial;
  });
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [detailsOpenFor, setDetailsOpenFor] = useState<Set<string>>(new Set());
  const [quotesOpenFor, setQuotesOpenFor] = useState<Set<string>>(new Set());
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ threadId: string; attachments: Attachment[]; index: number } | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const closeImagePreview = useCallback(() => setImagePreview(null), []);

  const rawMsgs = activeThread?.messages || [];
  const msgs = useMemo(() => deduplicateMessages(rawMsgs), [rawMsgs]);

  const lastActiveThreadIdRef = useRef<string | null>(activeThread?.id || null);

  useEffect(() => {
    setImagePreview(null);
    setAttachmentError('');
    if (!activeThread) {
      lastActiveThreadIdRef.current = null;
      return;
    }
    if (lastActiveThreadIdRef.current !== activeThread.id) {
      lastActiveThreadIdRef.current = activeThread.id;
      setSubjectText(activeThread.subject || '');
      setIsEditingSubject(false);
      const newExpanded = new Set<string>();
      if (msgs.length <= 1) {
        msgs.forEach((m) => newExpanded.add(m.id));
      } else {
        msgs.forEach((m, idx) => {
          if (idx === msgs.length - 1 || (!activeThread?.isRead && !m.isOutgoing)) {
            newExpanded.add(m.id);
          }
        });
      }
      setExpandedMessageIds(newExpanded);
    }
  }, [activeThread?.id, activeThread?.subject, msgs]);

  const toggleDetailsOpen = (msgId: string) => {
    setDetailsOpenFor((prev) => {
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

  const handleDownloadAttachment = async (att: Attachment) => {
    setAttachmentError('');
    try {
      const source = await loadAttachmentSource(att);
      downloadAttachmentSource(att, source.url);
      setTimeout(source.release, 60_000);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Could not download this attachment.');
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);

  const scrollToLatest = useCallback(() => {
    const container = scrollContainerRef.current;
    const target = latestMessageRef.current;
    if (container && target) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top;
      if (Math.abs(offset) > 2) {
        container.scrollTop += offset;
      }
    } else if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    if (msgs.length <= 1) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      return;
    }

    scrollToLatest();
    const raf = requestAnimationFrame(scrollToLatest);
    const timer1 = setTimeout(scrollToLatest, 50);
    const timer2 = setTimeout(scrollToLatest, 150);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [activeThread?.id, msgs.length, scrollToLatest]);

  if (!activeThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-center bg-white select-none">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
          <Mail className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-[#1f1f1f] mb-1.5 font-display">
          Select a conversation
        </h3>
        <p className="text-xs text-[#5f6368] max-w-sm leading-relaxed">
          Choose an email or message thread from the feed to read its full history and reply.
        </p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === activeThread.projectId);
  const targetInbox = inboxes.find((i) => i.id === activeThread.inboxId);
  const allExpanded = expandedMessageIds.size === msgs.length;
  const currentStream = classifyThreadStream(activeThread);

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

  const handleClose = () => {
    if (onBackMobile) onBackMobile();
    setSelectedThreadId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden relative">
      {imagePreview?.threadId === activeThread.id && (
        <ImageAttachmentViewer
          attachments={imagePreview.attachments}
          initialIndex={imagePreview.index}
          onClose={closeImagePreview}
        />
      )}
      {attachmentError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <span>{attachmentError}</span>
          <button type="button" onClick={() => setAttachmentError('')} aria-label="Dismiss attachment error" className="shrink-0 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 1. Gmail Top Action Toolbar */}
      {/* MOBILE TOP BAR (< md) */}
      <div className="flex md:hidden items-center justify-between px-3 py-2 border-b border-slate-200 bg-white shrink-0 select-none">
        <button
          type="button"
          onClick={handleClose}
          className="p-2 -ml-1 text-[#444746] hover:bg-slate-100 rounded-full transition cursor-pointer"
          title="Back to inbox"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1 text-[#444746]">
          <button
            type="button"
            onClick={() => {
              toggleArchive(activeThread.id);
              handleClose();
            }}
            className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Archive"
          >
            <Archive className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              deleteThread(activeThread.id);
              handleClose();
            }}
            className="p-2 hover:bg-red-50 hover:text-red-600 rounded-full transition cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              markThreadRead(activeThread.id, false);
              handleClose();
            }}
            className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Mark as unread"
          >
            <Mail className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
              className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer"
              title="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {mobileMoreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl p-1.5 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100 font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      toggleStar(activeThread.id);
                      setMobileMoreOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-2.5 text-slate-800 cursor-pointer"
                  >
                    <Star className={`w-4 h-4 ${activeThread.isStarred ? 'fill-amber-400 text-amber-500' : 'text-slate-500'}`} />
                    <span>{activeThread.isStarred ? 'Unstar' : 'Add star'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      snoozeThreadUntil(activeThread.id, snoozeTonightIso());
                      setMobileMoreOpen(false);
                      handleClose();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-2.5 text-slate-800 cursor-pointer"
                  >
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Snooze until tonight</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      startForward(activeThread.id);
                      setMobileMoreOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-2.5 text-slate-800 cursor-pointer"
                  >
                    <Forward className="w-4 h-4 text-blue-600" />
                    <span>Forward</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* DESKTOP TOP TOOLBAR (>= md): Authentic Gmail 40px circular buttons */}
      <div className="hidden md:flex px-4 sm:px-6 md:px-8 py-1.5 border-b border-slate-200 items-center justify-between gap-3 shrink-0 bg-white select-none">
        <div className="flex items-center gap-1 text-[#444746]">
          {/* Back to Inbox */}
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
            title="Back to inbox (Esc)"
            aria-label="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Archive */}
          <button
            type="button"
            onClick={() => toggleArchive(activeThread.id)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
            title={activeThread.isArchived ? 'Unarchive (e)' : 'Archive (e)'}
          >
            <Archive className="w-5 h-5" />
          </button>

          {/* Report Spam */}
          <button
            type="button"
            onClick={() => void reviewThreadSpam(
              activeThread.id,
              getSpamStatus(activeThread) === 'suspected' ? 'not_spam' : 'suspected'
            )}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
            title={getSpamStatus(activeThread) === 'suspected' ? 'Not spam' : 'Report spam (!)'}
          >
            <ShieldAlert className="w-5 h-5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => deleteThread(activeThread.id)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-red-600"
            title="Delete (#)"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Mark as Unread */}
          <button
            type="button"
            onClick={() => markThreadRead(activeThread.id, false)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
            title="Mark as unread (u)"
          >
            <Mail className="w-5 h-5" />
          </button>

          {/* Snooze */}
          {isThreadSnoozed(activeThread.id) ? (
            <button
              type="button"
              onClick={() => unsnoozeThread(activeThread.id)}
              className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-amber-600"
              title="Unsnooze thread"
            >
              <Clock className="w-5 h-5" />
            </button>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSnoozeOpen((v) => !v)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
                title="Snooze (b)"
              >
                <Clock className="w-5 h-5" />
              </button>
              {snoozeOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSnoozeOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-40 w-44 rounded-xl border border-slate-200 bg-white shadow-xl p-1 text-xs">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100"
                      onClick={() => {
                        snoozeThread(activeThread.id, 60 * 60 * 1000);
                        setSnoozeOpen(false);
                      }}
                    >
                      In 1 hour
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100"
                      onClick={() => {
                        snoozeThreadUntil(activeThread.id, snoozeTonightIso());
                        setSnoozeOpen(false);
                      }}
                    >
                      Tonight 8pm
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100"
                      onClick={() => {
                        snoozeThread(activeThread.id, 24 * 60 * 60 * 1000);
                        setSnoozeOpen(false);
                      }}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100"
                      onClick={() => {
                        snoozeThreadUntil(activeThread.id, snoozeMondayIso());
                        setSnoozeOpen(false);
                      }}
                    >
                      Monday 8am
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Star */}
          <button
            type="button"
            onClick={() => toggleStar(activeThread.id)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746]"
            title={activeThread.isStarred ? 'Unstar (s)' : 'Star (s)'}
          >
            <Star
              className={`w-5 h-5 ${
                activeThread.isStarred
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-[#444746] hover:text-amber-500'
              }`}
            />
          </button>

          {/* Forward */}
          <button
            type="button"
            onClick={() => startForward(activeThread.id)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-[#444746] hover:text-[#202124]"
            title="Forward (f)"
          >
            <Forward className="w-5 h-5" />
          </button>
        </div>

        {/* Right side: Pagination & Reading pane toggle */}
        <div className="flex items-center gap-1.5">
          {threadPosText && (
            <div className="flex items-center text-xs text-[#5f6368] font-medium select-none mr-2">
              <span className="px-2">{threadPosText}</span>
              <button
                type="button"
                onClick={() => selectAdjacentThread(-1)}
                disabled={currentThreadIdx <= 0}
                className="w-8 h-8 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-[#444746] transition cursor-pointer disabled:cursor-default"
                title="Newer (k)"
                aria-label="Newer conversation"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => selectAdjacentThread(1)}
                disabled={currentThreadIdx < 0 || currentThreadIdx >= filteredThreads.length - 1}
                className="w-8 h-8 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-[#444746] transition cursor-pointer disabled:cursor-default"
                title="Older (j)"
                aria-label="Older conversation"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {onToggleReadingPaneMode && (
            <button
              type="button"
              onClick={onToggleReadingPaneMode}
              className="p-1.5 rounded-lg border border-slate-200 text-[#444746] hover:bg-slate-100 transition cursor-pointer"
              title={readingPaneMode === 'split' ? 'Full width view' : 'Split view'}
            >
              {readingPaneMode === 'split' ? <Columns2 className="w-4 h-4 text-blue-600" /> : <Rows2 className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#444746] transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Top Subject Header Row (Identical to Gmail Screenshot) */}
      <div className="px-4 sm:px-6 md:px-8 pt-4 pb-3 flex items-start justify-between gap-4 select-none shrink-0 bg-white">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0 flex-1">
          {isEditingSubject ? (
            <div className="flex items-center gap-1.5 py-0.5 w-full sm:w-auto">
              <input
                type="text"
                value={subjectText}
                onChange={(e) => setSubjectText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveSubject();
                  if (e.key === 'Escape') setIsEditingSubject(false);
                }}
                autoFocus
                placeholder="Subject..."
                className="px-3 py-1 text-base font-normal bg-white border border-blue-500 rounded text-[#202124] focus:outline-none ring-2 ring-blue-500/20 w-full sm:w-96"
              />
              <button
                type="button"
                onClick={handleSaveSubject}
                className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer shrink-0"
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
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer shrink-0"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group min-w-0">
              <h1 className="text-[20px] sm:text-[22px] font-normal tracking-tight text-[#202124] font-display break-words">
                {activeThread.subject || '(No Subject)'}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setSubjectText(activeThread.subject);
                  setIsEditingSubject(true);
                }}
                className="p-1 text-slate-400 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition cursor-pointer shrink-0"
                title="Rename Subject"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Authentic Gmail "Inbox ✕" label chip */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-[#dddedf] text-[#444746] shrink-0">
            <span>Inbox</span>
            <button
              type="button"
              onClick={() => toggleArchive(activeThread.id)}
              className="hover:text-black cursor-pointer"
              title="Archive conversation"
            >
              <X className="w-3 h-3" />
            </button>
          </span>

          {/* Project Label Chip */}
          {project && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium border shrink-0"
              style={{
                backgroundColor: `${project.color}15`,
                borderColor: `${project.color}35`,
                color: project.color,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
              <span>{project.name}</span>
            </span>
          )}

          {/* Purpose-built Stream Chip if not Primary */}
          {currentStream !== 'primary' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
              <span>{currentStream === 'feed' ? 'The Feed' : 'Reports'}</span>
            </span>
          )}
        </div>

        {/* Right side icons in Subject Row: Expand All (↕), Print (🖨), Pop-out (⤢), Gemini AI (✦) */}
        <div className="flex items-center gap-1 shrink-0 text-[#444746]">
          {/* Gemini AI Sparkle Button */}
          <button
            type="button"
            onClick={() => setAiDrawerOpen((v) => !v)}
            className={`p-1.5 rounded-full transition cursor-pointer ${
              aiDrawerOpen ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 text-[#444746] hover:text-indigo-600'
            }`}
            title="Gemini AI Summary & Triage"
            aria-label="Gemini AI Summary"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Expand / Collapse All messages: ↕ */}
          {msgs.length > 1 && (
            <button
              type="button"
              onClick={toggleAllMessages}
              className="p-1.5 hover:bg-slate-100 rounded-full text-[#444746] hover:text-[#202124] transition cursor-pointer"
              title={allExpanded ? 'Collapse all messages' : 'Expand all messages'}
              aria-label={allExpanded ? 'Collapse all messages' : 'Expand all messages'}
            >
              <ChevronsUpDown className="w-4 h-4" />
            </button>
          )}

          {/* Print all */}
          <button
            type="button"
            onClick={() => window.print()}
            className="p-1.5 hover:bg-slate-100 rounded-full text-[#444746] hover:text-[#202124] transition cursor-pointer"
            title="Print all"
            aria-label="Print all"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Pop-out to new window */}
          <button
            type="button"
            onClick={() => {
              window.open(
                `/?thread=${activeThread.id}&popout=true`,
                '_blank',
                'width=960,height=820,menubar=no,status=no,toolbar=no'
              );
            }}
            className="p-1.5 hover:bg-slate-100 rounded-full text-[#444746] hover:text-[#202124] transition cursor-pointer"
            title="In new window"
            aria-label="In new window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SpamReview key={`spam-${activeThread.id}`} thread={activeThread} onReview={reviewThreadSpam} />

      {/* 3. The Seamless Gmail Message Stack (No random cards or heavy borders) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-2 bg-white">
        <div className="w-full max-w-none">
          {msgs.map((message, idx) => {
            const isSenderUser = message.isOutgoing;
            const isLatestMessage = idx === msgs.length - 1;
            const msgInbox = inboxes.find((i) => i.id === message.inboxId) || targetInbox;
            const isExpanded = expandedMessageIds.has(message.id);
            const isDetailsOpen = detailsOpenFor.has(message.id);
            const isQuotesOpen = quotesOpenFor.has(message.id);
            const sanitizedBody = message.bodyHtml ? sanitizeEmailHtml(message.bodyHtml) : null;
            const avatarColor = getAvatarColor(message.from?.address || message.from?.name || 'user');
            const initialLetter = (message.from?.name || message.from?.address || 'U').slice(0, 1).toUpperCase();

            // 1. COLLAPSED VIEW (Like Messages 1 & 2 in Gmail Screenshot)
            if (!isExpanded) {
              return (
                <div
                  key={message.id || idx}
                  ref={isLatestMessage ? latestMessageRef : undefined}
                  onClick={() => toggleMessageExpand(message.id)}
                  className="border-b border-[#f1f3f4] hover:bg-[#f8fafd] py-2.5 px-1 cursor-pointer transition flex items-center justify-between gap-3 group select-none"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* 32px Circular Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-xs text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initialLetter}
                    </div>

                    {/* Sender Name */}
                    <span className="font-semibold text-sm text-[#202124] shrink-0 whitespace-nowrap">
                      {message.from?.name || message.from?.address || 'Unknown'}
                    </span>

                    {/* Message Preview Snippet right beside sender name */}
                    <span className="text-sm text-[#5f6368] font-normal truncate flex-1 min-w-0">
                      {message.bodyText ? message.bodyText.replace(/\s+/g, ' ').slice(0, 140) : message.subject}
                    </span>
                  </div>

                  {/* Right: Paperclip + Timestamp */}
                  <div className="flex items-center gap-2 shrink-0 text-[#5f6368] text-xs font-normal whitespace-nowrap">
                    {message.attachments && message.attachments.length > 0 && (
                      <Paperclip className="w-3.5 h-3.5 text-[#5f6368]" />
                    )}
                    <span>{formatGmailDate(message.timestamp, false)}</span>
                  </div>
                </div>
              );
            }

            const parsedBody = parseEmailBody(message.bodyText);
            const recipientName =
              (message.to || []).length === 1 && targetInbox?.email && message.to[0]?.address?.toLowerCase() === targetInbox.email.toLowerCase()
                ? 'me'
                : message.to?.[0]?.name || message.to?.[0]?.address || 'me';

            // 2. EXPANDED VIEW (Like Message 3 in Gmail Screenshot)
            return (
              <div
                key={message.id || idx}
                ref={isLatestMessage ? latestMessageRef : undefined}
                className="border-b border-[#f1f3f4] py-4"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 select-none">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* 40px Circular Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-medium text-base text-white shrink-0 mt-0.5 shadow-2xs"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initialLetter}
                    </div>

                    {/* Sender & Recipient Information */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-[#202124] truncate">
                          {message.from?.name || message.from?.address || 'Unknown'}
                        </span>
                        {message.from?.address && (
                          <span className="text-xs text-[#5f6368] font-normal truncate hidden sm:inline">
                            &lt;{message.from.address}&gt;
                          </span>
                        )}
                        {isSenderUser && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 font-bold text-[9px] shrink-0">
                            SENT
                          </span>
                        )}
                      </div>

                      {/* "to me ▾" with authentic floating popover */}
                      <div className="relative inline-block mt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleDetailsOpen(message.id)}
                          className="text-xs text-[#5f6368] hover:text-[#202124] inline-flex items-center gap-0.5 cursor-pointer font-normal"
                        >
                          <span>to {recipientName}</span>
                          <ChevronDown className="w-3 h-3 text-[#5f6368]" />
                        </button>

                        {/* Floating Header Details Popover */}
                        {isDetailsOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => toggleDetailsOpen(message.id)}
                            />
                            <div className="absolute top-full left-0 mt-1 z-40 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-slate-200 p-3.5 text-xs text-[#202124] space-y-2 animate-in fade-in zoom-in-95 duration-100">
                              <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                <span className="text-[#5f6368] font-medium text-right">from:</span>
                                <span className="font-semibold text-[#202124]">
                                  {message.from?.name || message.from?.address}
                                  {message.from?.address ? ` <${message.from.address}>` : ''}
                                </span>
                              </div>
                              <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                <span className="text-[#5f6368] font-medium text-right">to:</span>
                                <span className="font-normal text-[#202124]">
                                  {(message.to || [])
                                    .map((t) => (t?.name ? `${t.name} <${t.address}>` : t?.address || ''))
                                    .filter(Boolean)
                                    .join(', ') || 'me'}
                                </span>
                              </div>
                              <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                <span className="text-[#5f6368] font-medium text-right">date:</span>
                                <span className="font-normal text-[#202124]">
                                  {formatFullDate(message.timestamp)}
                                </span>
                              </div>
                              <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                <span className="text-[#5f6368] font-medium text-right">subject:</span>
                                <span className="font-semibold text-[#202124]">
                                  {message.subject || activeThread.subject || '(No Subject)'}
                                </span>
                              </div>
                              {msgInbox && (
                                <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                  <span className="text-[#5f6368] font-medium text-right">mailed-by:</span>
                                  <span className="font-normal text-blue-700">{msgInbox.email}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-[70px_1fr] gap-1.5">
                                <span className="text-[#5f6368] font-medium text-right">security:</span>
                                <span className="flex items-center gap-1 text-[#137333] font-medium">
                                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[#137333]" />
                                  <span>Standard encryption (TLS)</span>
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side of header: Timestamp, Star, Smile, Reply, More */}
                  <div className="flex items-center gap-1 shrink-0 text-[#5f6368]">
                    <span className="text-xs text-[#5f6368] font-normal whitespace-nowrap mr-2">
                      {formatGmailDate(message.timestamp, true)}
                    </span>

                    {/* Star icon */}
                    <button
                      type="button"
                      onClick={() => toggleStar(activeThread.id)}
                      className="p-1.5 hover:bg-slate-100 rounded-full hover:text-[#202124] transition cursor-pointer"
                      title={activeThread.isStarred ? 'Starred' : 'Not starred'}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          activeThread.isStarred ? 'fill-amber-400 text-amber-500' : 'text-[#5f6368]'
                        }`}
                      />
                    </button>

                    {/* Reply icon: defaults to Reply All if there are multiple people on thread/message */}
                    {!isSenderUser && (() => {
                      const senderInbox = resolveReplyInbox(activeThread, message, inboxes, projectInboxes, gmailSendAs);
                      const isMsgMultiple = hasMultipleReplyRecipients(activeThread, senderInbox?.email, message);
                      return (
                        <button
                          type="button"
                          onClick={() => requestReply(message)}
                          className="p-1.5 hover:bg-slate-100 rounded-full hover:text-[#202124] transition cursor-pointer"
                          title={isMsgMultiple ? 'Reply all' : 'Reply'}
                        >
                          {isMsgMultiple ? (
                            <ReplyAll className="w-4 h-4 text-[#5f6368]" />
                          ) : (
                            <CornerUpLeft className="w-4 h-4 text-[#5f6368]" />
                          )}
                        </button>
                      );
                    })()}

                    {/* Three dots / collapse toggle */}
                    <button
                      type="button"
                      onClick={() => toggleMessageExpand(message.id)}
                      className="p-1.5 hover:bg-slate-100 rounded-full hover:text-[#202124] transition cursor-pointer"
                      title="Collapse email"
                    >
                      <MoreVertical className="w-4 h-4 text-[#5f6368]" />
                    </button>
                  </div>
                </div>

                {/* Message Body: Indented to align with sender name (ml-[52px]) */}
                <div className="ml-0 sm:ml-[52px] mt-4 text-[14px] text-[#202124] leading-relaxed font-sans break-words overflow-x-auto max-w-full">
                  {message.bodyHtml ? (
                    <div
                      className="prose max-w-none text-[14px] text-[#202124] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizedBody ? sanitizedBody.cleanHtml : '' }}
                    />
                  ) : (
                    <div>
                      <div className="whitespace-pre-wrap">{parsedBody.main || '(No content)'}</div>

                      {parsedBody.quote && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => toggleQuotesOpen(message.id)}
                            className="px-2 py-0.5 rounded-sm bg-[#e8eaed] hover:bg-[#dadce0] text-[#444746] text-xs font-bold transition cursor-pointer tracking-widest inline-flex items-center justify-center leading-none"
                            title={isQuotesOpen ? 'Hide trimmed content' : 'Show trimmed content'}
                          >
                            ···
                          </button>

                          {isQuotesOpen && (
                            <div className="mt-2.5 pt-1.5 border-l-2 border-[#dadce0] pl-3.5 text-xs text-[#5f6368] whitespace-pre-wrap font-sans animate-in fade-in duration-100">
                              {parsedBody.quote}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clean Attachment Cards */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex flex-wrap gap-2.5">
                        {message.attachments.map((att, attIdx) => {
                          const isImg = Boolean(getImageMimeType(att));
                          return (
                            <div
                              key={attIdx}
                              className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition px-3 py-2 cursor-pointer max-w-xs"
                              onClick={() => {
                                if (isImg) {
                                  const images = message.attachments!.filter((item) => getImageMimeType(item));
                                  setImagePreview({ threadId: activeThread.id, attachments: images, index: images.indexOf(att) });
                                } else {
                                  void handleDownloadAttachment(att);
                                }
                              }}
                            >
                              <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <span className="block text-xs font-medium text-[#202124] truncate">{att.name}</span>
                                <span className="block text-[11px] text-[#5f6368]">{att.size}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDownloadAttachment(att);
                                }}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-black"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 4. Reply Composer inline at the bottom */}
          <ReplyComposer key={`reply-${activeThread.id}`} thread={activeThread} />
        </div>
      </div>

      {/* 5. Gemini AI & Clef Triage Slide-Out Drawer (Clean on demand, never cluttering email view) */}
      {aiDrawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setAiDrawerOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-sm text-[#202124]">Gemini AI Assistant</span>
              </div>
              <button
                type="button"
                onClick={() => setAiDrawerOpen(false)}
                className="p-1 text-slate-500 hover:text-black rounded-md hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Clef Triage Info */}
              {activeThread.decision?.selectedChoices && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/80 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-950">⚡ Clef Triage</span>
                    <span className="px-2 py-0.5 rounded-full bg-white text-indigo-800 font-semibold capitalize border border-indigo-200">
                      {activeThread.decision.selectedChoices.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                      Urgency: <strong>{activeThread.decision.selectedChoices.urgency}</strong>
                    </span>
                    {activeThread.decision.selectedChoices.needs_reply && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        Needs reply
                      </span>
                    )}
                    {activeThread.decision.selectedChoices.contains_action_item && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                        Action items
                      </span>
                    )}
                  </div>
                  {activeThread.decision.selectedChoices.project_route &&
                    activeThread.decision.selectedChoices.project_route !== 'uncertain' &&
                    activeThread.projectId !== activeThread.decision.selectedChoices.project_route && (
                      <div className="pt-1 border-t border-indigo-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-600">
                          Route: <strong>{projects.find((p) => p.id === activeThread.decision?.selectedChoices.project_route)?.name || activeThread.decision.selectedChoices.project_route}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void updateThread(activeThread.id, {
                              projectId: activeThread.decision?.selectedChoices.project_route,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                        >
                          Move
                        </button>
                      </div>
                    )}
                </div>
              )}

              {/* Local AI Conversation Tools */}
              <div>
                <h4 className="text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-2">
                  On-Device AI Actions
                </h4>
                <LocalEmailAI thread={activeThread} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

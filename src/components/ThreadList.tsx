import React, { useRef } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import {
  Star,
  Paperclip,
  Clock,
  Inbox as InboxIcon,
  FolderPlus,
  Archive,
  Mail,
  MailOpen,
  Trash2,
  Square,
  CheckSquare,
  Check,
} from 'lucide-react';
import { SpamBadge } from './SpamReview';
import { getSpamStatus } from '../utils/spam';
import { getSnoozeUntil } from '../utils/operatorPrefs';

interface ThreadListProps {
  onOpenNewProject?: () => void;
  readingPaneMode?: 'none' | 'split';
}

export const ThreadList: React.FC<ThreadListProps> = ({
  onOpenNewProject,
  readingPaneMode = 'none',
}) => {
  const {
    projects,
    filteredThreads,
    selectedThreadId,
    setSelectedThreadId,
    toggleStar,
    toggleArchive,
    markThreadRead,
    deleteThread,
    inboxes,
    activeProject,
    selectedProjectId,
    selectedInboxId,
    selectionMode,
    selectedThreadIds,
    toggleThreadSelection,
    replaceThreadSelection,
    viewFilter,
    activeStream,
    reviewThreadSpam,
  } = useInbox();

  const lastCheckedIndex = useRef<number | null>(null);

  const formatGmailDate = (timestamp: string) => {
    try {
      const now = new Date();
      const date = new Date(timestamp);
      const isToday = now.toDateString() === date.toDateString();
      if (isToday) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      const isThisYear = now.getFullYear() === date.getFullYear();
      if (isThisYear) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
    } catch {
      return '';
    }
  };

  const getInboxInfo = (inboxId: string) => {
    return inboxes.find((i) => i.id === inboxId);
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      'bg-red-600',
      'bg-blue-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-purple-600',
      'bg-indigo-600',
      'bg-pink-600',
      'bg-teal-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const handleRowClick = (
    e: React.MouseEvent,
    threadId: string,
    idx: number,
    isRead: boolean
  ) => {
    // Cmd / Ctrl click toggles selection
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleThreadSelection(threadId);
      lastCheckedIndex.current = idx;
      return;
    }
    // Shift click selects range
    if (e.shiftKey && lastCheckedIndex.current !== null) {
      e.preventDefault();
      const start = Math.min(lastCheckedIndex.current, idx);
      const end = Math.max(lastCheckedIndex.current, idx);
      const rangeIds = filteredThreads.slice(start, end + 1).map((item) => item.id);
      const next = new Set(selectedThreadIds);
      rangeIds.forEach((id) => next.add(id));
      replaceThreadSelection(Array.from(next));
      lastCheckedIndex.current = idx;
      return;
    }
    // If in multi-select mode, clicking a row toggles its selection
    if (selectedThreadIds.length > 0) {
      toggleThreadSelection(threadId);
      lastCheckedIndex.current = idx;
      return;
    }
    setSelectedThreadId(threadId);
    lastCheckedIndex.current = idx;
    if (!isRead) {
      markThreadRead(threadId, true);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent, threadId: string, idx: number) => {
    e.stopPropagation();
    if (e.shiftKey && lastCheckedIndex.current !== null) {
      const start = Math.min(lastCheckedIndex.current, idx);
      const end = Math.max(lastCheckedIndex.current, idx);
      const rangeIds = filteredThreads.slice(start, end + 1).map((item) => item.id);
      const next = new Set(selectedThreadIds);
      rangeIds.forEach((id) => next.add(id));
      replaceThreadSelection(Array.from(next));
    } else {
      toggleThreadSelection(threadId);
    }
    lastCheckedIndex.current = idx;
  };

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-white">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1 shadow-xs">
          <FolderPlus className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#1f1f1f]">
            No Projects Created Yet
          </h3>
          <p className="text-xs text-slate-600 max-w-xs mt-1 leading-relaxed">
            Create a project workspace to connect and organize your Zoho, Gmail, and client communication channels.
          </p>
        </div>
        {onOpenNewProject && (
          <button
            type="button"
            onClick={onOpenNewProject}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create New Project</span>
          </button>
        )}
      </div>
    );
  }

  if (filteredThreads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-3 shadow-xs">
          <InboxIcon className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-bold text-[#1f1f1f] mb-1">
          {viewFilter === 'spam'
            ? 'Spam is empty'
            : viewFilter === 'all' && activeStream === 'paper_trail'
            ? 'No reports'
            : 'Your inbox is clean'}
        </h3>
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
          {viewFilter === 'spam'
            ? 'Messages your provider flags, or that you mark as spam, show up here.'
            : viewFilter === 'all' && activeStream === 'paper_trail'
            ? 'DMARC reports, receipts, and automated alerts stay here instead of your inbox.'
            : selectedInboxId !== 'all'
            ? `Nothing in ${inboxes.find((i) => i.id === selectedInboxId)?.email || 'this mailbox'} matches the current filter.`
            : activeProject
            ? `All inboxes for "${activeProject.name}" are caught up.`
            : 'No messages match your selected search or filter.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
      {filteredThreads.map((thread, idx) => {
        const isSelected = thread.id === selectedThreadId;
        const isChecked = selectedThreadIds.includes(thread.id);
        const targetInbox = getInboxInfo(thread.inboxId);
        const hasAttachments = thread.messages.some(
          (m) => m.attachments && m.attachments.length > 0
        );
        const snoozeUntil = getSnoozeUntil(thread.id);
        const primaryParticipant =
          thread.participants.find((p) => p.address !== targetInbox?.email) ||
          thread.participants[0];
        const isSentView = viewFilter === 'sent';
        const participantLabel = isSentView
          ? `To: ${primaryParticipant?.name || primaryParticipant?.address || 'Unknown'}`
          : primaryParticipant?.name || primaryParticipant?.address;
        const project = projects.find((p) => p.id === thread.projectId);
        const avatarInitial = (participantLabel || 'U').replace(/^To:\s*/i, '').trim().charAt(0).toUpperCase();

        const renderMobileRow = () => (
          <div
            onClick={(e) => handleRowClick(e, thread.id, idx, thread.isRead)}
            className={`md:hidden flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors active:bg-slate-100 border-l-4 ${
              isChecked
                ? 'bg-[#c2e7ff]/70 border-blue-600'
                : isSelected
                ? 'bg-[#c2e7ff]/40 border-blue-600'
                : !thread.isRead
                ? 'bg-white border-transparent'
                : 'bg-[#f7f9fc] border-transparent'
            }`}
          >
            {/* Left: Tap-to-select Avatar */}
            <div className="relative shrink-0 mt-0.5">
              <button
                type="button"
                onClick={(e) => handleCheckboxClick(e, thread.id, idx)}
                className="block cursor-pointer transition active:scale-95"
                title={isChecked ? 'Deselect conversation' : 'Select conversation'}
              >
                {isChecked ? (
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                ) : (
                  <div
                    className={`w-10 h-10 rounded-full ${getAvatarBg(participantLabel || '')} text-white flex items-center justify-center font-bold text-sm shadow-xs`}
                  >
                    {avatarInitial}
                  </div>
                )}
              </button>
              {targetInbox && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-2xs"
                  style={{ backgroundColor: targetInbox.badgeColor || '#475569' }}
                  title={`${targetInbox.email} (${targetInbox.channel.toUpperCase()})`}
                />
              )}
            </div>

            {/* Middle & Right: Content */}
            <div className="flex-1 min-w-0">
              {/* Line 1: Sender Name & Date */}
              <div className="flex items-baseline justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!thread.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  )}
                  <span
                    className={`text-[14px] truncate ${
                      !thread.isRead
                        ? 'font-bold text-[#1f1f1f]'
                        : 'font-semibold text-slate-800'
                    }`}
                  >
                    {participantLabel}
                  </span>
                  {thread.messageCount > 1 && (
                    <span className="text-xs text-slate-500 font-semibold shrink-0">
                      ({thread.messageCount})
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] shrink-0 whitespace-nowrap ${
                    !thread.isRead ? 'font-bold text-blue-700' : 'text-slate-500 font-medium'
                  }`}
                >
                  {formatGmailDate(thread.lastMessageTimestamp)}
                </span>
              </div>

              {/* Line 2: Subject */}
              <div
                className={`text-[13px] leading-snug truncate mt-0.5 ${
                  !thread.isRead ? 'font-bold text-[#1f1f1f]' : 'font-normal text-slate-700'
                }`}
              >
                {thread.subject || '(No Subject)'}
              </div>

              {/* Line 3: Snippet Preview + Badges + Star */}
              <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                <p className="text-xs text-[#5f6368] truncate flex-1 leading-normal font-normal">
                  {thread.snippet || 'No message preview'}
                </p>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasAttachments && (
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  {snoozeUntil && (
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                  {project && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 border"
                      style={{
                        backgroundColor: `${project.color}15`,
                        borderColor: `${project.color}35`,
                        color: project.color,
                      }}
                      title={`Project: ${project.name}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="max-w-[70px] truncate">{project.name}</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(thread.id);
                    }}
                    className="p-1 hover:text-amber-500 transition cursor-pointer shrink-0 ml-0.5"
                    title={thread.isStarred ? 'Starred' : 'Not starred'}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        thread.isStarred
                          ? 'fill-amber-400 text-amber-500'
                          : 'text-slate-300 hover:text-amber-500'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Mobile Spam actions */}
              {viewFilter === 'spam' && (
                <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => void reviewThreadSpam(thread.id, 'not_spam').catch(() => {})}
                    className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold"
                  >
                    Not spam
                  </button>
                  {!thread.spamReviewedAt && (
                    <button
                      type="button"
                      onClick={() => void reviewThreadSpam(thread.id, 'suspected').catch(() => {})}
                      className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 text-[10px] font-bold border border-amber-300"
                    >
                      Spam
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );

        // A. Compact Multi-Line Card for Split Pane Mode (Never crushed, perfectly responsive)
        if (readingPaneMode === 'split') {
          return (
            <React.Fragment key={`${thread.id}-${idx}`}>
              {renderMobileRow()}
              <div
                onClick={(e) => handleRowClick(e, thread.id, idx, thread.isRead)}
                className={`hidden md:flex group relative flex-col gap-1 px-3.5 py-2.5 cursor-pointer transition-colors border-l-4 ${
                  isChecked
                    ? 'bg-[#c2e7ff]/70 border-blue-600'
                    : isSelected
                    ? 'bg-[#c2e7ff]/50 border-blue-600'
                    : !thread.isRead
                    ? 'bg-white border-transparent hover:bg-slate-100/70'
                    : 'bg-[#f8fafd] border-transparent hover:bg-slate-100/90'
                }`}
              >
              {/* Row 1: Checkbox, Star, Sender Name, Badges & Date */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => handleCheckboxClick(e, thread.id, idx)}
                    className={`p-1 rounded-md transition cursor-pointer shrink-0 ${
                      isChecked
                        ? 'text-blue-700 bg-blue-100/70'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/80'
                    }`}
                    title={isChecked ? 'Deselect conversation' : 'Select conversation'}
                    aria-pressed={isChecked}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-blue-700" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(thread.id);
                    }}
                    className="p-1 hover:text-amber-500 rounded-full hover:bg-slate-200/60 transition cursor-pointer shrink-0"
                    title={thread.isStarred ? 'Starred' : 'Not starred'}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        thread.isStarred
                          ? 'fill-amber-400 text-amber-500'
                          : 'text-slate-400 hover:text-amber-500'
                      }`}
                    />
                  </button>

                  {!thread.isRead && (
                    <span
                      className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                      title="Unread message"
                    />
                  )}

                  <span
                    className={`text-xs truncate ${
                      !thread.isRead
                        ? 'font-bold text-[#1f1f1f]'
                        : 'font-semibold text-slate-800'
                    }`}
                  >
                    {participantLabel}
                  </span>

                  {thread.messageCount > 1 && (
                    <span className="text-[10px] font-bold text-slate-500 shrink-0">
                      ({thread.messageCount})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-slate-500 font-medium">
                  {hasAttachments && (
                    <span title="Has attachment">
                      <Paperclip className="w-3 h-3 text-slate-400" />
                    </span>
                  )}
                  {snoozeUntil && (
                    <span title="Snoozed">
                      <Clock className="w-3 h-3 text-amber-600" />
                    </span>
                  )}
                  <span className={!thread.isRead ? 'font-bold text-[#1f1f1f]' : 'text-slate-500'}>
                    {formatGmailDate(thread.lastMessageTimestamp)}
                  </span>
                </div>
              </div>

              {/* Row 2: Subject */}
              <div
                className={`text-xs leading-snug truncate ${
                  !thread.isRead
                    ? 'font-bold text-[#1f1f1f]'
                    : 'font-semibold text-slate-800'
                }`}
              >
                {thread.subject || '(No Subject)'}
              </div>

              {/* Row 3: Snippet & Labels */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className="text-[11px] text-[#5f6368] truncate flex-1 leading-normal font-normal">
                  {thread.snippet || 'No message preview'}
                </p>

                <div className="flex items-center gap-1 shrink-0">
                  {project && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold tracking-tight shrink-0 border"
                      style={{
                        backgroundColor: `${project.color}15`,
                        borderColor: `${project.color}40`,
                        color: project.color,
                      }}
                      title={`Project: ${project.name}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="max-w-[75px] truncate">{project.name}</span>
                    </span>
                  )}

                  {getSpamStatus(thread) && (
                    <div className="shrink-0 scale-90 origin-right">
                      <SpamBadge thread={thread} />
                    </div>
                  )}
                </div>
              </div>
              {viewFilter === 'spam' && (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => void reviewThreadSpam(thread.id, 'not_spam').catch(() => {})}
                    className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold"
                  >
                    Not spam
                  </button>
                  {!thread.spamReviewedAt && (
                    <button
                      type="button"
                      onClick={() => void reviewThreadSpam(thread.id, 'suspected').catch(() => {})}
                      className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 text-[10px] font-bold border border-amber-300"
                    >
                      Spam
                    </button>
                  )}
                </div>
              )}
            </div>
            </React.Fragment>
          );
        }

        // B. Authentic Full-Width 1-Line Gmail Layout (Used when readingPaneMode === 'none')
        return (
          <React.Fragment key={`${thread.id}-${idx}`}>
            {renderMobileRow()}
            <div
              onClick={(e) => handleRowClick(e, thread.id, idx, thread.isRead)}
              className={`hidden md:flex group relative items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-4 ${
                isChecked
                  ? 'bg-[#c2e7ff]/70 border-blue-600'
                  : isSelected
                  ? 'bg-[#c2e7ff]/50 border-blue-600'
                  : !thread.isRead
                ? 'bg-white border-transparent hover:bg-slate-100/70'
                : 'bg-[#f4f7fc] border-transparent hover:bg-slate-100/90'
            }`}
          >
            {/* 1. Multi-select + Star */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => handleCheckboxClick(e, thread.id, idx)}
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  isChecked
                    ? 'text-blue-700 opacity-100 bg-blue-100/60'
                    : 'text-slate-400 hover:text-slate-700 opacity-70 group-hover:opacity-100 hover:bg-slate-200/70'
                }`}
                title={isChecked ? 'Deselect conversation' : 'Select conversation'}
                aria-pressed={isChecked}
              >
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-blue-700" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(thread.id);
                }}
                className="p-1 hover:text-amber-500 rounded-full hover:bg-slate-200/60 transition cursor-pointer"
                title={thread.isStarred ? 'Starred' : 'Not starred'}
              >
                <Star
                  className={`w-4 h-4 ${
                    thread.isStarred
                      ? 'fill-amber-400 text-amber-500'
                      : 'text-slate-500 hover:text-amber-500'
                  }`}
                />
              </button>
            </div>

            {/* 2. Sender Name & Unread Dot */}
            <div className="flex items-center gap-2 w-36 sm:w-44 md:w-48 shrink-0 min-w-0">
              {!thread.isRead && (
                <span
                  className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                  title="Unread message"
                />
              )}
              <span
                className={`text-xs md:text-[13px] truncate ${
                  !thread.isRead
                    ? 'font-bold text-[#1f1f1f]'
                    : 'font-semibold text-[#1f1f1f]'
                }`}
              >
                {participantLabel}
              </span>
              {thread.messageCount > 1 && (
                <span className="text-[11px] font-bold text-[#1f1f1f] shrink-0">
                  ({thread.messageCount})
                </span>
              )}
            </div>

            {/* 3. Subject + Snippet preview on continuous line (High contrast) */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="truncate text-xs md:text-[13px] leading-relaxed">
                <span
                  className={`${
                    !thread.isRead
                      ? 'font-bold text-[#1f1f1f]'
                      : 'font-semibold text-[#1f1f1f]'
                  }`}
                >
                  {thread.subject || '(No Subject)'}
                </span>
                <span className="text-[#202124] font-medium">
                  {' — '}
                  {thread.snippet || 'No message preview'}
                </span>
              </div>

              {/* Project Label Tag (Bold, high-contrast chip) */}
              {project && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-tight shrink-0 border"
                  style={{
                    backgroundColor: `${project.color}18`,
                    borderColor: `${project.color}50`,
                    color: project.color,
                  }}
                  title={`Project: ${project.name}`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: project.color }}
                  />
                  <span>{project.name}</span>
                </span>
              )}

              {/* Origin Mailbox Badge */}
              <div className="hidden lg:block shrink-0">
                <ChannelBadge
                  channel={thread.channel}
                  role={thread.inboxRole}
                  showRole={false}
                  size="sm"
                />
              </div>

              {getSpamStatus(thread) && (
                <div className="shrink-0 hidden sm:block">
                  <SpamBadge thread={thread} />
                </div>
              )}
            </div>

            {/* 4. Right: Attachment icon, Date & Hover Action Bar */}
            <div className="flex items-center gap-2 shrink-0">
              {hasAttachments && (
                <span title="Has attachment">
                  <Paperclip className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                </span>
              )}
              {snoozeUntil && (
                <span title="Snoozed">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                </span>
              )}

              {/* Timestamp (high contrast) */}
              <span
                className={`text-xs font-semibold group-hover:hidden transition-all shrink-0 ${
                  !thread.isRead
                    ? 'text-[#1f1f1f] font-bold'
                    : 'text-[#202124]'
                }`}
              >
                {formatGmailDate(thread.lastMessageTimestamp)}
              </span>

              {/* Gmail Hover Quick Actions Toolbar */}
              <div className="hidden group-hover:flex items-center gap-0.5 animate-in fade-in duration-75">
                {viewFilter === 'spam' && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void reviewThreadSpam(thread.id, 'not_spam').catch(() => {});
                      }}
                      className="px-2 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold"
                    >
                      Not spam
                    </button>
                    {!thread.spamReviewedAt && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void reviewThreadSpam(thread.id, 'suspected').catch(() => {});
                        }}
                        className="px-2 py-1 rounded-full bg-amber-100 text-amber-950 text-[10px] font-bold"
                      >
                        Spam
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArchive(thread.id);
                  }}
                  className="p-1.5 text-slate-600 hover:text-[#1f1f1f] hover:bg-slate-200/80 rounded-full transition cursor-pointer"
                  title={thread.isArchived ? 'Unarchive (E)' : 'Archive (E)'}
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteThread(thread.id);
                  }}
                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-full transition cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    markThreadRead(thread.id, !thread.isRead);
                  }}
                  className="p-1.5 text-slate-600 hover:text-[#1f1f1f] hover:bg-slate-200/80 rounded-full transition cursor-pointer"
                  title={thread.isRead ? 'Mark as unread (U)' : 'Mark as read'}
                >
                  {thread.isRead ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

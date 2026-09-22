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
} from 'lucide-react';
import { SpamBadge } from './SpamReview';
import { getSpamStatus } from '../utils/spam';
import { getSnoozeUntil } from '../utils/operatorPrefs';

interface ThreadListProps {
  onOpenNewProject?: () => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({ onOpenNewProject }) => {
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
          Your inbox is clean
        </h3>
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
          {selectedInboxId !== 'all'
            ? `Nothing in ${inboxes.find((i) => i.id === selectedInboxId)?.email || 'this mailbox'} matches the current filter.`
            : activeProject
            ? `All inboxes for "${activeProject.name}" are caught up.`
            : 'No messages match your selected search or filter.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white">
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
        const project = projects.find((p) => p.id === thread.projectId);

        return (
          <div
            key={`${thread.id}-${idx}`}
            onClick={(e) => {
              // Cmd / Ctrl click toggles selection
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                toggleThreadSelection(thread.id);
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
                toggleThreadSelection(thread.id);
                lastCheckedIndex.current = idx;
                return;
              }
              setSelectedThreadId(thread.id);
              lastCheckedIndex.current = idx;
              if (!thread.isRead) {
                markThreadRead(thread.id, true);
              }
            }}
            className={`group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-4 ${
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey && lastCheckedIndex.current !== null) {
                    const start = Math.min(lastCheckedIndex.current, idx);
                    const end = Math.max(lastCheckedIndex.current, idx);
                    const rangeIds = filteredThreads.slice(start, end + 1).map((item) => item.id);
                    const next = new Set(selectedThreadIds);
                    rangeIds.forEach((id) => next.add(id));
                    replaceThreadSelection(Array.from(next));
                  } else {
                    toggleThreadSelection(thread.id);
                  }
                  lastCheckedIndex.current = idx;
                }}
                className={`p-1 rounded-md transition cursor-pointer ${
                  isChecked
                    ? 'text-blue-700 opacity-100 hover:bg-blue-100/60'
                    : 'text-slate-400 hover:text-slate-700 opacity-50 group-hover:opacity-100 hover:bg-slate-200/70'
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
                {primaryParticipant?.name || primaryParticipant?.address}
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
        );
      })}
    </div>
  );
};

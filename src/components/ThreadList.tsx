import React from 'react';
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
} from 'lucide-react';
import { Thread } from '../types';
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
  } = useInbox();

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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1 shadow-2xs">
          <FolderPlus className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            No Projects Created Yet
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
          <InboxIcon className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
          No conversations found
        </h3>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
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
    <div className="flex-1 overflow-y-auto p-3.5 md:p-4 space-y-2.5">
      {filteredThreads.map((thread) => {
        const isSelected = thread.id === selectedThreadId;
        const targetInbox = getInboxInfo(thread.inboxId);
        const hasAttachments = thread.messages.some(
          (m) => m.attachments && m.attachments.length > 0
        );
        const snoozeUntil = getSnoozeUntil(thread.id);
        const primaryParticipant =
          thread.participants.find((p) => p.address !== targetInbox?.email) ||
          thread.participants[0];

        return (
          <div
            key={thread.id}
            onClick={() => {
              setSelectedThreadId(thread.id);
              if (!thread.isRead) {
                markThreadRead(thread.id, true);
              }
            }}
            className={`group relative p-4 rounded-2xl cursor-pointer transition-all ${
              isSelected
                ? 'bg-blue-50/90 dark:bg-blue-950/50 ring-1 ring-blue-500/30 shadow-2xs'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
            } ${!thread.isRead ? 'font-medium' : ''}`}
          >
            {/* Top row: Sender Name + Message Count + Date + Star */}
            <div className="flex items-center justify-between gap-2.5 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {!thread.isRead && (
                  <span
                    className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                    title="Unread"
                  />
                )}
                <span
                  className={`text-xs truncate ${
                    !thread.isRead
                      ? 'font-bold text-slate-900 dark:text-slate-100'
                      : 'font-semibold text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {primaryParticipant?.name || primaryParticipant?.address}
                </span>

                {thread.messageCount > 1 && (
                  <span className="text-[11px] font-normal text-slate-500 shrink-0">
                    ({thread.messageCount})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                {snoozeUntil && (
                  <span title={`Snoozed until ${new Date(snoozeUntil).toLocaleString()}`}>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </span>
                )}
                {hasAttachments && (
                  <span title="Has attachment">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                )}
                {/* Regular date timestamp: hidden on hover so quick actions reveal */}
                <span
                  className={`text-[11px] font-medium group-hover:hidden transition-all ${
                    !thread.isRead ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {formatGmailDate(thread.lastMessageTimestamp)}
                </span>

                {/* Quick Action Toolbar on Hover */}
                <div className="hidden group-hover:flex items-center gap-0.5 animate-in fade-in duration-75">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      markThreadRead(thread.id, !thread.isRead);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                    title={thread.isRead ? 'Mark as unread (U)' : 'Mark as read'}
                  >
                    {thread.isRead ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArchive(thread.id);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
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
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(thread.id);
                  }}
                  className="p-1 hover:text-amber-500 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition cursor-pointer"
                  title={thread.isStarred ? 'Unstar' : 'Star'}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      thread.isStarred
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300 hover:text-slate-500'
                    }`}
                  />
                </button>
              </div>
            </div>

            {getSpamStatus(thread) && (
              <div className="mb-1.5">
                <SpamBadge thread={thread} />
              </div>
            )}

            {/* Subject + Snippet continuous line (Exact Gmail style) */}
            <div className="text-xs md:text-[13px] truncate mb-2.5 leading-relaxed">
              <span
                className={`${
                  !thread.isRead
                    ? 'font-bold text-slate-900 dark:text-slate-100'
                    : 'font-medium text-slate-800 dark:text-slate-200'
                }`}
              >
                {thread.subject || '(No Subject)'}
              </span>
              <span className="text-slate-400 dark:text-slate-500 font-normal">
                {' — '}
                {thread.snippet || 'No message preview'}
              </span>
            </div>

            {/* Footer row: Channel Badge + Project Tag */}
            <div className="flex items-center gap-2.5 pt-1.5 min-w-0">
              <ChannelBadge
                channel={thread.channel}
                role={thread.inboxRole}
                showRole={true}
                size="sm"
                customEmail={targetInbox?.email}
              />
              {selectedInboxId === 'all' && (
                <span
                  className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[180px]"
                  title={targetInbox?.email || 'Mailbox'}
                >
                  {targetInbox?.email || 'Unknown mailbox'}
                </span>
              )}
              {selectedProjectId === 'all' && selectedInboxId === 'all' && (
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md truncate">
                  {projects.find((p) => p.id === thread.projectId)?.name || 'No project'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

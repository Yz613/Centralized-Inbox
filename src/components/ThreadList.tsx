import React from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { Star, Paperclip, Clock, Inbox as InboxIcon, FolderPlus } from 'lucide-react';
import { Thread } from '../types';

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
    markThreadRead,
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
            ? 'No messages in this specific inbox for the current filter.'
            : activeProject
            ? `All inboxes for "${activeProject.name}" are caught up!`
            : 'No messages match your selected search or filter criteria.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {filteredThreads.map((thread) => {
        const isSelected = thread.id === selectedThreadId;
        const targetInbox = getInboxInfo(thread.inboxId);
        const hasAttachments = thread.messages.some(
          (m) => m.attachments && m.attachments.length > 0
        );
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
            className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
              isSelected
                ? 'bg-blue-50/90 dark:bg-blue-950/50 ring-1 ring-blue-500/30 shadow-2xs'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
            } ${!thread.isRead ? 'font-medium' : ''}`}
          >
            {/* Top row: Sender Name + Message Count + Date + Star */}
            <div className="flex items-center justify-between gap-2 mb-1">
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
                {hasAttachments && (
                  <span title="Has attachment">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                )}
                <span
                  className={`text-[11px] font-medium ${
                    !thread.isRead ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {formatGmailDate(thread.lastMessageTimestamp)}
                </span>
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

            {/* Subject + Snippet continuous line (Exact Gmail style) */}
            <div className="text-xs truncate mb-1.5">
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
            <div className="flex items-center gap-2 pt-0.5">
              <ChannelBadge
                channel={thread.channel}
                role={thread.inboxRole}
                showRole={true}
                size="sm"
                customEmail={targetInbox?.email}
              />
              {selectedProjectId === 'all' && (
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.2 rounded-md">
                  {thread.projectId.replace('proj-', '')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

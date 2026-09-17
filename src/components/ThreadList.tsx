import React from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { Star, Paperclip, Clock, CheckCheck, Inbox as InboxIcon } from 'lucide-react';
import { Thread } from '../types';

export const ThreadList: React.FC = () => {
  const {
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

  const formatRelativeTime = (timestamp: string) => {
    try {
      const now = new Date();
      const date = new Date(timestamp);
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const getInboxInfo = (inboxId: string) => {
    return inboxes.find((i) => i.id === inboxId);
  };

  if (filteredThreads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
          <InboxIcon className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
          No conversations found
        </h3>
        <p className="text-xs text-slate-500 max-w-xs">
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
    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
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
            className={`group relative p-3.5 cursor-pointer transition-colors ${
              isSelected
                ? 'bg-blue-50/70 dark:bg-blue-950/30 border-l-4 border-l-blue-600'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border-l-4 border-l-transparent'
            } ${!thread.isRead ? 'font-medium' : ''}`}
          >
            {/* Top row: Originating Inbox Badge + Timestamp + Star */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 truncate">
                {/* Visual indicator of originating account */}
                <ChannelBadge
                  channel={thread.channel}
                  role={thread.inboxRole}
                  showRole={true}
                  size="sm"
                  customEmail={targetInbox?.email}
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                <span className="text-[11px] font-normal flex items-center gap-0.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {formatRelativeTime(thread.lastMessageTimestamp)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(thread.id);
                  }}
                  className="p-1 hover:text-amber-500 rounded transition"
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

            {/* Sender & Message Count */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 truncate">
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
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {primaryParticipant?.name || primaryParticipant?.address}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {hasAttachments && (
                  <span title="Has attachment">
                    <Paperclip className="w-3 h-3 text-slate-400" />
                  </span>
                )}
                {thread.messageCount > 1 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    {thread.messageCount}
                  </span>
                )}
              </div>
            </div>

            {/* Subject */}
            <h4
              className={`text-xs mb-1 line-clamp-1 ${
                !thread.isRead
                  ? 'font-semibold text-slate-900 dark:text-slate-100'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {thread.subject}
            </h4>

            {/* Snippet */}
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              {thread.snippet}
            </p>

            {/* Tags / Project preview */}
            {selectedProjectId === 'all' && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  Project: {thread.projectId.replace('proj-', '')}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

import React, { useRef, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import { ReplyComposer } from './ReplyComposer';
import {
  Star,
  Archive,
  Mail,
  Trash2,
  Paperclip,
  Download,
  ArrowLeft,
  Share2,
  Tag,
  ExternalLink,
} from 'lucide-react';

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
  } = useInbox();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when opening thread
    if (activeThread) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.id, activeThread?.messages.length]);

  if (!activeThread) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center p-12 text-center bg-slate-50 dark:bg-slate-950 text-slate-400">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-3">
          <Mail className="w-8 h-8 text-slate-300 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Select a conversation
        </h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Choose an email or message thread from the project feed to read its full history and reply directly using the originating inbox.
        </p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === activeThread.projectId);
  const targetInbox = inboxes.find((i) => i.id === activeThread.inboxId);

  const formatFullDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950 overflow-hidden">
      {/* Top Toolbar */}
      <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 truncate max-w-md">
                {activeThread.subject}
              </h2>
              {project && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase border"
                  style={{
                    backgroundColor: `${project.color}15`,
                    borderColor: `${project.color}35`,
                    color: project.color,
                  }}
                >
                  {project.name}
                </span>
              )}
            </div>

            {/* Receiving context badge */}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Origin Box:</span>
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

        {/* Action Toolbar */}
        <div className="flex items-center gap-1 shrink-0 text-slate-500">
          <button
            type="button"
            onClick={() => toggleStar(activeThread.id)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 transition"
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
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 transition"
            title={activeThread.isRead ? 'Mark as Unread' : 'Mark as Read'}
          >
            <Mail className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleArchive(activeThread.id)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 transition"
            title={activeThread.isArchived ? 'Unarchive' : 'Archive'}
          >
            <Archive className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => deleteThread(activeThread.id)}
            className="p-2 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 rounded text-slate-500 transition"
            title="Delete Conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeThread.messages.map((message, idx) => {
          const isSenderUser = message.isOutgoing;
          const msgInbox = inboxes.find((i) => i.id === message.inboxId) || targetInbox;

          return (
            <div
              key={message.id || idx}
              className={`rounded-xl border shadow-2xs overflow-hidden transition ${
                isSenderUser
                  ? 'bg-blue-50/40 dark:bg-slate-900 border-blue-200 dark:border-slate-800'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Message Header */}
              <div className="p-3.5 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs shadow-xs">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {message.from.name}
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        &lt;{message.from.address}&gt;
                      </span>
                      {isSenderUser && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-semibold text-[10px]">
                          OUTGOING
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>To: {message.to.map((t) => t.address).join(', ')}</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        Delivered to: <strong>{msgInbox?.email}</strong> via {message.channel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-slate-400 text-[11px] text-right">
                  {formatFullDate(message.timestamp)}
                </div>
              </div>

              {/* Message Body */}
              <div className="p-4 text-xs md:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                {message.bodyText}
              </div>

              {/* Attachments (if any) */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Attachments ({message.attachments.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((att, attIdx) => (
                      <div
                        key={attIdx}
                        className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs shadow-2xs"
                      >
                        <div className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
                          DOC
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400">{att.size}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => alert(`Simulating download of ${att.name}`)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Composer Sticky Bottom */}
      <ReplyComposer thread={activeThread} />
    </div>
  );
};

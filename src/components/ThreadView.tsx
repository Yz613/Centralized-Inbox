import React, { useRef, useEffect, useState } from 'react';
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
  Pencil,
  Check,
  X,
  Plus,
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
    updateThread,
  } = useInbox();

  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectText, setSubjectText] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');

  useEffect(() => {
    if (activeThread) {
      setSubjectText(activeThread.subject);
      setIsEditingSubject(false);
      setIsAddingTag(false);
    }
  }, [activeThread?.id]);

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
      <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
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
                  <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 truncate max-w-md font-sans">
                    {activeThread.subject}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectText(activeThread.subject);
                      setIsEditingSubject(true);
                    }}
                    className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Rename Thread Subject"
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
            </div>

            {/* Receiving context badge & Tags */}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              <span className="text-slate-400">Delivered to:</span>
              <ChannelBadge
                channel={activeThread.channel}
                role={activeThread.inboxRole}
                showRole={true}
                size="sm"
                customEmail={targetInbox?.email}
              />

              <div className="flex items-center gap-1 ml-2 flex-wrap">
                {activeThread.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300 font-medium"
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
                      className="px-2 py-0.5 text-[10px] bg-white dark:bg-slate-800 border border-blue-500 rounded-full text-slate-800 dark:text-slate-100 w-20 focus:outline-none"
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
                    className="text-[10px] text-slate-400 hover:text-blue-600 font-medium px-1.5 py-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Add custom tag"
                  >
                    + Tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1 shrink-0 text-slate-500">
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

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeThread.messages.map((message, idx) => {
          const isSenderUser = message.isOutgoing;
          const msgInbox = inboxes.find((i) => i.id === message.inboxId) || targetInbox;

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
              <div className="p-3.5 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs shadow-2xs">
                    {message.from.avatar || message.from.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {message.from.name}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        &lt;{message.from.address}&gt;
                      </span>
                      {isSenderUser && (
                        <span className="px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-bold text-[9px]">
                          SENT
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>To: {message.to.map((t) => t.address).join(', ')}</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        Via <strong>{msgInbox?.email}</strong> ({message.channel.toUpperCase()})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-slate-400 text-[11px] text-right font-normal">
                  {formatFullDate(message.timestamp)}
                </div>
              </div>

              {/* Message Body */}
              <div className="p-4 text-xs md:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                {message.bodyText}
              </div>

              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Attachments ({message.attachments.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((att, attIdx) => (
                      <div
                        key={attIdx}
                        className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs shadow-2xs"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-[10px]">
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
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1 cursor-pointer"
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

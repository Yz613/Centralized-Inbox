import React, { useEffect, useMemo, useState } from 'react';
import { useInbox } from '../context/InboxContext';
import { Command, Mail, Search, Star, Archive, RotateCw, Plus, Folder, Inbox, Bell, Clock, CornerUpLeft, Forward, Filter, Layers, Keyboard } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewMessage: () => void;
  onOpenAccountManager: () => void;
  onOpenShortcuts?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenNewMessage,
  onOpenAccountManager,
  onOpenShortcuts,
}) => {
  const {
    projects,
    inboxes,
    threads,
    setSelectedProjectId,
    selectMailbox,
    setSelectedThreadId,
    setSearchQuery,
    syncAllInboxes,
    toggleStar,
    toggleArchive,
    selectedThreadId,
    setViewFilter,
    requestReply,
    startForward,
    snoozeThread,
    enableNotifications,
    notificationsEnabled,
  } = useInbox();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const actions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const staticActions: {
      id: string;
      label: string;
      hint?: string;
      icon: typeof Plus;
      run: () => void;
    }[] = [
      {
        id: 'all-mail',
        label: 'View all mail',
        icon: Layers,
        run: () => {
          setSelectedProjectId('all');
          setViewFilter('all');
          onClose();
        },
      },
      {
        id: 'compose',
        label: 'Compose new message',
        hint: 'C / N',
        icon: Plus,
        run: () => {
          onOpenNewMessage();
          onClose();
        },
      },
      {
        id: 'sync',
        label: 'Sync all inboxes',
        hint: 'R',
        icon: RotateCw,
        run: () => {
          syncAllInboxes();
          onClose();
        },
      },
      {
        id: 'connect',
        label: 'Connect Gmail (free send)',
        icon: Mail,
        run: () => {
          onOpenAccountManager();
          onClose();
        },
      },
      {
        id: 'star',
        label: 'Star current thread',
        icon: Star,
        run: () => {
          if (selectedThreadId) toggleStar(selectedThreadId);
          onClose();
        },
      },
      {
        id: 'archive',
        label: 'Archive current thread',
        hint: 'E',
        icon: Archive,
        run: () => {
          if (selectedThreadId) toggleArchive(selectedThreadId);
          onClose();
        },
      },
      {
        id: 'reply',
        label: 'Reply to current thread',
        hint: 'R',
        icon: CornerUpLeft,
        run: () => {
          requestReply();
          onClose();
        },
      },
      {
        id: 'forward',
        label: 'Forward current thread',
        hint: 'F',
        icon: Forward,
        run: () => {
          if (selectedThreadId) startForward(selectedThreadId);
          onClose();
        },
      },
      {
        id: 'snooze',
        label: 'Snooze current thread 1 hour',
        icon: Clock,
        run: () => {
          if (selectedThreadId) snoozeThread(selectedThreadId, 60 * 60 * 1000);
          onClose();
        },
      },
      {
        id: 'needs',
        label: 'Filter: Needs you',
        icon: Filter,
        run: () => {
          setViewFilter('needs_reply');
          onClose();
        },
      },
      {
        id: 'waiting',
        label: 'Filter: Waiting',
        icon: Filter,
        run: () => {
          setViewFilter('waiting');
          onClose();
        },
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts help',
        hint: '?',
        icon: Keyboard,
        run: () => {
          onClose();
          if (onOpenShortcuts) onOpenShortcuts();
        },
      },
    ];

    const mailboxActions: typeof staticActions = inboxes.map((inbox) => ({
      id: `inbox-${inbox.id}`,
      label: `Open mailbox: ${inbox.email}`,
      hint: inbox.name && inbox.name !== inbox.email ? inbox.name : undefined,
      icon: Mail,
      run: () => {
        selectMailbox(inbox.id);
        setViewFilter('all');
        onClose();
      },
    }));

    const projectActions: typeof staticActions = projects.map((p) => ({
      id: `proj-${p.id}`,
      label: `Open project: ${p.name}`,
      icon: Folder,
      run: () => {
        setSelectedProjectId(p.id);
        onClose();
      },
    }));

    const threadActions: typeof staticActions = threads.slice(0, 40).map((t) => ({
      id: `th-${t.id}`,
      label: t.subject || '(No subject)',
      hint: t.participants[0]?.name,
      icon: Inbox,
      run: () => {
        setSelectedProjectId(t.projectId);
        setSelectedThreadId(t.id);
        onClose();
      },
    }));

    return [...staticActions, ...mailboxActions, ...projectActions, ...threadActions].filter((item) => {
      if (!q) return true;
      return `${item.label} ${item.hint || ''}`.toLowerCase().includes(q);
    });
  }, [
    query,
    projects,
    inboxes,
    threads,
    selectedThreadId,
    onClose,
    onOpenAccountManager,
    onOpenNewMessage,
    setSelectedProjectId,
    selectMailbox,
    setSelectedThreadId,
    syncAllInboxes,
    toggleArchive,
    toggleStar,
    requestReply,
    startForward,
    snoozeThread,
    setViewFilter,
    enableNotifications,
    notificationsEnabled,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/40 backdrop-blur-sm p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3.5 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-[#202124]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder="Jump to mail, project, or action…"
            className="flex-1 bg-transparent text-sm text-[#1f1f1f] font-medium placeholder:text-slate-500 focus:outline-none"
          />
          <span className="text-xs font-mono text-[#202124] font-bold flex items-center gap-0.5 border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50">
            <Command className="w-3 h-3" />K
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {actions.length === 0 ? (
            <p className="text-xs text-slate-600 font-medium p-3">No matches.</p>
          ) : (
            actions.slice(0, 18).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.run}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs hover:bg-slate-100 text-[#1f1f1f] font-semibold cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span className="flex-1 truncate">{action.label}</span>
                  {action.hint && <span className="text-xs text-[#3c4043] font-medium truncate max-w-[140px]">{action.hint}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

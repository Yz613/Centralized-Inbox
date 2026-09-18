import React, { useEffect, useMemo, useState } from 'react';
import { useInbox } from '../context/InboxContext';
import { Command, Mail, Search, Star, Archive, RotateCw, Plus, Folder, Inbox } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewMessage: () => void;
  onOpenAccountManager: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenNewMessage,
  onOpenAccountManager,
}) => {
  const {
    projects,
    threads,
    setSelectedProjectId,
    setSelectedThreadId,
    setSearchQuery,
    syncAllInboxes,
    toggleStar,
    toggleArchive,
    selectedThreadId,
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
        id: 'compose',
        label: 'Compose new message',
        hint: 'N',
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
        icon: Archive,
        run: () => {
          if (selectedThreadId) toggleArchive(selectedThreadId);
          onClose();
        },
      },
    ];

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

    return [...staticActions, ...projectActions, ...threadActions].filter((item) => {
      if (!q) return true;
      return `${item.label} ${item.hint || ''}`.toLowerCase().includes(q);
    });
  }, [
    query,
    projects,
    threads,
    selectedThreadId,
    onClose,
    onOpenAccountManager,
    onOpenNewMessage,
    setSelectedProjectId,
    setSelectedThreadId,
    syncAllInboxes,
    toggleArchive,
    toggleStar,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/40 backdrop-blur-sm p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder="Jump to mail, project, or action…"
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-0.5">
            <Command className="w-3 h-3" />K
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {actions.length === 0 ? (
            <p className="text-xs text-slate-400 p-3">No matches.</p>
          ) : (
            actions.slice(0, 18).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.run}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="flex-1 truncate">{action.label}</span>
                  {action.hint && <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{action.hint}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

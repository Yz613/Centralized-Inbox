import React, { useState } from 'react';
import { useInbox } from '../context/InboxContext';
import {
  Plus,
  Mail,
  Inbox,
  Star,
  Clock,
  Archive,
  ChevronDown,
  Pencil,
  RotateCw,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { threadInMailbox } from '../utils/mergeThreads';
import { isThreadSnoozed, lastMessageOutgoing } from '../utils/operatorPrefs';

interface SidebarProps {
  onOpenNewProject: () => void;
  onOpenAccountManager: (tab?: 'list' | 'add' | 'import_archive' | 'free_guide') => void;
  onOpenNewMessage: () => void;
  onOpenImportArchive?: () => void;
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewProject,
  onOpenAccountManager,
  onOpenNewMessage,
  onOpenImportArchive,
  onNavigate,
}) => {
  const {
    projects,
    inboxes,
    threads,
    selectedProjectId,
    setSelectedProjectId,
    selectedInboxId,
    setSelectedInboxId,
    setSelectedThreadId,
    viewFilter,
    setViewFilter,
    selectMailbox,
    setEditingProject,
    loadDemoAccount,
  } = useInbox();

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [allMailboxesOpen, setAllMailboxesOpen] = useState(false);
  // Default: start with all projects expanded so connected emails are immediately visible
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id))
  );

  const toggleProjectExpand = (projId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) {
        next.delete(projId);
      } else {
        next.add(projId);
      }
      return next;
    });
  };

  const unreadTotal = threads.filter((t) => !t.isRead && !t.isArchived).length;
  const starredTotal = threads.filter((t) => t.isStarred && !t.isArchived).length;
  const snoozedTotal = threads.filter((t) => isThreadSnoozed(t.id)).length;
  const needsReplyTotal = threads.filter((t) => !t.isArchived && t.messages.length > 0 && !lastMessageOutgoing(t.messages)).length;
  const archivedTotal = threads.filter((t) => t.isArchived).length;

  return (
    <aside className="w-full bg-[#f6f8fc] text-[#1f1f1f] flex flex-col h-full shrink-0 select-none pr-3 py-2 overflow-y-auto no-scrollbar">
      {/* 1. Iconic Material 3 Compose Button */}
      <div className="px-3 py-2 mb-2">
        <button
          type="button"
          onClick={onOpenNewMessage}
          className="h-14 px-6 bg-[#c2e7ff] hover:bg-[#b3ddfc] text-[#001d35] rounded-2xl text-sm font-bold flex items-center gap-3.5 transition-all shadow-xs hover:shadow-md cursor-pointer group"
        >
          {/* Authentic Google Compose Pencil */}
          <div className="w-5 h-5 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </div>
          <span className="tracking-tight text-[15px]">Compose</span>
        </button>
      </div>

      {/* 2. Primary Gmail Folders (High Contrast) */}
      <nav className="space-y-0.5">
        {/* Inbox */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('all');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && selectedInboxId === 'all' && viewFilter === 'all'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <Inbox className="w-4 h-4 shrink-0 text-[#202124]" />
            <span>Inbox</span>
          </div>
          {unreadTotal > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                selectedProjectId === 'all' && viewFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-300/80 text-[#202124]'
              }`}
            >
              {unreadTotal}
            </span>
          )}
        </button>

        {/* Starred */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('starred');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'starred'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
            <span>Starred</span>
          </div>
          {starredTotal > 0 && (
            <span className="text-xs text-[#202124] font-bold">
              {starredTotal}
            </span>
          )}
        </button>

        {/* Snoozed */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('snoozed');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'snoozed'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <Clock className="w-4 h-4 shrink-0 text-[#202124]" />
            <span>Snoozed</span>
          </div>
          {snoozedTotal > 0 && (
            <span className="text-xs text-[#202124] font-bold">{snoozedTotal}</span>
          )}
        </button>

        {/* Needs Reply */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('needs_reply');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'needs_reply'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <AlertCircle className="w-4 h-4 text-blue-700 shrink-0" />
            <span>Needs Reply</span>
          </div>
          {needsReplyTotal > 0 && (
            <span className="text-xs px-2 py-0.2 rounded-full bg-blue-100 text-blue-900 font-bold">
              {needsReplyTotal}
            </span>
          )}
        </button>

        {/* All Mail — inbox, archive, and snoozed together */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('all_mail');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && selectedInboxId === 'all' && viewFilter === 'all_mail'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <Mail className="w-4 h-4 shrink-0 text-[#202124]" />
            <span>All Mail</span>
          </div>
          <span className="text-xs text-[#202124] font-bold">{threads.length}</span>
        </button>

        {/* Archived */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
            setViewFilter('archived');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between pl-6 pr-4 py-2.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'archived'
              ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
              : 'text-[#202124] hover:bg-slate-200/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <Archive className="w-4 h-4 shrink-0 text-[#202124]" />
            <span>Archive</span>
          </div>
          {archivedTotal > 0 && (
            <span className="text-xs text-[#202124] font-bold">{archivedTotal}</span>
          )}
        </button>
      </nav>

      <div className="my-3 border-t border-slate-300 mx-4" />

      {/* 3. Projects (Labels & Connected Mailboxes Tree) */}
      <div className="flex-1 space-y-1">
        {/* Main Projects Section Header with prominent Collapse/Expand box */}
        <div className="flex items-center justify-between pl-4 pr-3 py-1 text-xs font-bold text-[#202124]">
          <div
            onClick={() => setProjectsOpen((v) => !v)}
            className="flex items-center gap-1.5 cursor-pointer hover:text-black group py-1 select-none"
            title={projectsOpen ? 'Collapse all projects' : 'Expand all projects'}
          >
            <div className="w-5 h-5 rounded-md border border-slate-300/80 bg-white group-hover:bg-slate-200 flex items-center justify-center transition shadow-2xs">
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#202124] transition-transform duration-200 ${
                  projectsOpen ? '' : '-rotate-90'
                }`}
              />
            </div>
            <span className="text-[13px] tracking-tight font-bold">Projects</span>
            <span className="text-[11px] text-[#3c4043] font-semibold bg-slate-200/80 px-1.5 py-0.2 rounded-md">
              {projects.length}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNewProject();
            }}
            className="w-6 h-6 rounded-md hover:bg-slate-200 text-[#202124] hover:text-black flex items-center justify-center transition cursor-pointer border border-transparent hover:border-slate-300"
            title="Create new project workspace"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {projectsOpen && (
          <div className="space-y-1">
            {projects.map((proj) => {
              const isProjectSelected = selectedProjectId === proj.id;
              const isAllInboxesSelected = isProjectSelected && selectedInboxId === 'all';
              const projInboxes = inboxes.filter((i) => i.projectId === proj.id);
              const projThreads = threads.filter((t) => t.projectId === proj.id && !t.isArchived);
              const unreadCount = projThreads.filter((t) => !t.isRead).length;
              const isExpanded = expandedProjectIds.has(proj.id);

              return (
                <div key={proj.id} className="space-y-0.5">
                  {/* Project Row with explicit Collapse/Expand Box */}
                  <div
                    onClick={() => {
                      setSelectedProjectId(proj.id);
                      setSelectedInboxId('all');
                      setSelectedThreadId(null);
                      if (!isExpanded) {
                        toggleProjectExpand(proj.id);
                      }
                      onNavigate?.();
                    }}
                    className={`group w-full flex items-center justify-between pl-3 pr-3 py-1.5 rounded-r-full text-sm font-semibold transition cursor-pointer ${
                      isAllInboxesSelected
                        ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
                        : isProjectSelected
                        ? 'bg-slate-200/70 text-[#001d35] font-bold'
                        : 'text-[#202124] hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Explicit Collapse/Expand Box for this Project */}
                      <button
                        type="button"
                        onClick={(e) => toggleProjectExpand(proj.id, e)}
                        className="w-5 h-5 rounded-md border border-slate-300/80 bg-white hover:bg-slate-200 flex items-center justify-center text-[#202124] hover:text-black transition shrink-0 cursor-pointer shadow-2xs"
                        title={isExpanded ? `Collapse ${proj.name} emails` : `Expand ${proj.name} emails`}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            isExpanded ? '' : '-rotate-90'
                          }`}
                        />
                      </button>

                      {/* Project Color Circle */}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs border border-black/15"
                        style={{ backgroundColor: proj.color }}
                      />

                      <span className="truncate text-[13px] font-bold">{proj.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Email Count Badge */}
                      <span
                        className="text-[10px] font-bold text-[#3c4043] bg-slate-200/90 px-1.5 py-0.2 rounded-md"
                        title={`${projInboxes.length} connected mailboxes`}
                      >
                        {projInboxes.length}
                      </span>

                      {unreadCount > 0 && (
                        <span className="text-xs font-bold text-blue-800">
                          {unreadCount}
                        </span>
                      )}

                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProject(proj);
                          }}
                          className="p-1 text-slate-600 hover:text-blue-700 rounded hover:bg-slate-200 transition"
                          title="Edit Project"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Connected Emails / Mailboxes listed under this Project */}
                  {isExpanded && (
                    <div className="ml-5 pl-2.5 border-l-2 border-slate-300/80 space-y-0.5 my-0.5 animate-in fade-in duration-100">
                      {projInboxes.map((inbox) => {
                        const isInboxSelected = selectedProjectId === proj.id && selectedInboxId === inbox.id;
                        const boxThreads = threads.filter(
                          (t) => !t.isArchived && t.projectId === proj.id && threadInMailbox(t, inbox.id)
                        );
                        const inboxUnread = boxThreads.filter((t) => !t.isRead).length;

                        return (
                          <button
                            key={inbox.id}
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              setSelectedInboxId(inbox.id);
                              setSelectedThreadId(null);
                              onNavigate?.();
                            }}
                            className={`w-full flex items-center justify-between pl-3 pr-2.5 py-1 rounded-r-full text-xs transition cursor-pointer ${
                              isInboxSelected
                                ? 'bg-[#c2e7ff] text-[#001d35] font-bold shadow-2xs'
                                : 'text-[#202124] hover:bg-slate-200/60 font-medium'
                            }`}
                            title={`${inbox.email} (${inbox.channel.toUpperCase()})`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 border border-black/10 shadow-2xs"
                                style={{ backgroundColor: inbox.badgeColor || proj.color }}
                              />
                              <span className="truncate text-xs text-[#1f1f1f]">
                                {inbox.email}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-200 text-[#3c4043]">
                                {inbox.channel}
                              </span>
                              {inboxUnread > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900">
                                  {inboxUnread}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {projInboxes.length === 0 && (
                        <div className="pl-3 py-1 text-[11px] text-slate-500 italic flex items-center justify-between pr-2">
                          <span>No emails connected</span>
                          <button
                            type="button"
                            onClick={() => onOpenAccountManager('add')}
                            className="text-blue-700 hover:underline font-bold text-[10px]"
                          >
                            + Connect
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {projects.length === 0 && (
              <div className="px-6 py-3 text-xs text-slate-600 font-medium">
                <span>No projects yet. Click + to group mailboxes.</span>
              </div>
            )}
          </div>
        )}

        <div className="my-3 border-t border-slate-300 mx-4" />

        {/* 4. All Mailboxes Overview Section (Collapsible) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between pl-4 pr-3 py-1 text-xs font-bold text-[#202124]">
            <div
              onClick={() => setAllMailboxesOpen((v) => !v)}
              className="flex items-center gap-1.5 cursor-pointer hover:text-black group py-1 select-none"
              title={allMailboxesOpen ? 'Collapse all mailboxes overview' : 'Expand all mailboxes overview'}
            >
              <div className="w-5 h-5 rounded-md border border-slate-300/80 bg-white group-hover:bg-slate-200 flex items-center justify-center transition shadow-2xs">
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#202124] transition-transform duration-200 ${
                    allMailboxesOpen ? '' : '-rotate-90'
                  }`}
                />
              </div>
              <span className="text-[13px] tracking-tight font-bold">All Mailboxes</span>
              <span className="text-[11px] text-[#3c4043] font-semibold bg-slate-200/80 px-1.5 py-0.2 rounded-md">
                {inboxes.length}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAccountManager('add');
              }}
              className="w-6 h-6 rounded-md hover:bg-slate-200 text-[#202124] hover:text-black flex items-center justify-center transition cursor-pointer border border-transparent hover:border-slate-300"
              title="Connect a new mailbox"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {allMailboxesOpen && (
            <div className="space-y-0.5 animate-in fade-in duration-100">
              {inboxes.map((inbox) => {
                const isSelected = selectedInboxId === inbox.id;
                const boxThreads = threads.filter(
                  (t) => !t.isArchived && threadInMailbox(t, inbox.id)
                );
                const unreadCount = boxThreads.filter((t) => !t.isRead).length;

                return (
                  <button
                    key={inbox.id}
                    type="button"
                    onClick={() => {
                      selectMailbox(inbox.id);
                      setSelectedThreadId(null);
                      onNavigate?.();
                    }}
                    className={`w-full flex items-center justify-between pl-6 pr-4 py-1.5 rounded-r-full text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#d3e3fd] text-[#001d35] font-bold'
                        : 'text-[#202124] hover:bg-slate-200/70'
                    }`}
                    title={inbox.email}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: inbox.badgeColor || '#475569' }}
                      />
                      <span className="truncate text-xs font-semibold text-[#1f1f1f]">
                        {inbox.name || inbox.email}
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="text-[11px] font-bold text-blue-700">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Bottom Quick Action Footer */}
      <div className="mt-auto pt-3 px-4 border-t border-slate-300 flex items-center justify-between text-xs text-[#202124]">
        <button
          type="button"
          onClick={() => onOpenAccountManager('list')}
          className="flex items-center gap-1.5 hover:text-blue-700 font-semibold transition cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Accounts</span>
        </button>

        <button
          type="button"
          onClick={loadDemoAccount}
          className="px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-300 rounded-md hover:bg-blue-50 transition cursor-pointer"
        >
          Demo Mode
        </button>
      </div>
    </aside>
  );
};

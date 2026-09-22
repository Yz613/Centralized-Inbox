import React, { useState } from 'react';
import { useInbox } from '../context/InboxContext';
import {
  FolderKanban,
  Plus,
  Settings,
  Mail,
  Layers,
  Inbox,
  Star,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  RotateCw,
  Sparkles,
  ShieldCheck,
  FolderArchive,
  LogOut,
} from 'lucide-react';
import { handleLogout } from '../utils/logout';
import { threadInMailbox } from '../utils/mergeThreads';

interface SidebarProps {
  onOpenNewProject: () => void;
  onOpenAccountManager: () => void;
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
    viewFilter,
    setViewFilter,
    selectMailbox,
    setEditingProject,
    deleteProject,
    isSyncing,
    syncAllInboxes,
    isGoogleConnected,
    loadDemoAccount,
  } = useInbox();

  const [mailboxesOpen, setMailboxesOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [accountsTrayOpen, setAccountsTrayOpen] = useState(true);

  const cloudflareCount = inboxes.filter((i) => i.channel === 'cloudflare').length;
  const zohoCount = inboxes.filter((i) => i.channel === 'zoho').length;
  const gmailCount = inboxes.filter((i) => i.channel === 'gmail').length;
  const waCount = inboxes.filter((i) => i.channel === 'whatsapp').length;
  const totalConnected = inboxes.length;
  const unreadTotal = threads.filter((t) => !t.isRead && !t.isArchived).length;
  const starredTotal = threads.filter((t) => t.isStarred && !t.isArchived).length;

  return (
    <aside className="w-64 md:w-72 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex flex-col h-full rounded-2xl border border-slate-200/80 dark:border-slate-800 shrink-0 select-none shadow-xs overflow-hidden">
      {/* Brand Header */}
      <div className="p-4 md:p-4.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black shadow-sm">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-sans">
              ProjectInbox
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 font-semibold">
                Unified
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 font-normal">Gmail • Zoho • Cloudflare</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadDemoAccount}
          className="px-2.5 py-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 transition cursor-pointer shrink-0"
          title="Reset demo account workspaces and messages"
        >
          Demo Mode
        </button>
      </div>

      {/* Gmail-Style Floating Compose Button */}
      <div className="p-3.5 md:p-4">
        <button
          type="button"
          onClick={onOpenNewMessage}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow-md cursor-pointer group"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
          <span className="tracking-wide">Compose Message</span>
        </button>
      </div>

      {/* Primary Navigation / Views */}
      <div className="px-3.5 space-y-2">
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setViewFilter('all');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
            selectedProjectId === 'all' && selectedInboxId === 'all' && viewFilter === 'all'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>All mail</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
            {threads.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setViewFilter('unread');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'unread'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <Inbox className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Unread Messages</span>
          </div>
          {unreadTotal > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">
              {unreadTotal}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setViewFilter('starred');
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
            selectedProjectId === 'all' && viewFilter === 'starred'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Starred</span>
          </div>
          {starredTotal > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
              {starredTotal}
            </span>
          )}
        </button>
      </div>

      <div className="my-2.5 border-t border-slate-100 dark:border-slate-800" />

      {/* Mailboxes — Collapsible Section */}
      <div className="px-3.5 pb-1.5">
        <div
          onClick={() => setMailboxesOpen((v) => !v)}
          className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition select-none group"
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${mailboxesOpen ? '' : '-rotate-90'}`} />
            <Mail className="w-3.5 h-3.5" />
            <span>Mailboxes</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 font-normal normal-case">{inboxes.length}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAccountManager();
              }}
              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Connect a mailbox"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {mailboxesOpen && (
          <div className="mt-1.5">
            {inboxes.length === 0 ? (
              <button
                type="button"
                onClick={onOpenAccountManager}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Connect a mailbox to read it on its own.
              </button>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInboxId('all');
                    onNavigate?.();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                    selectedInboxId === 'all'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate font-medium">All mailboxes</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium shrink-0">{inboxes.length}</span>
                </button>
                {inboxes.map((inbox) => {
                  const isSelected = selectedInboxId === inbox.id;
                  const mailboxThreads = threads.filter(
                    (t) => !t.isArchived && threadInMailbox(t, inbox.id)
                  );
                  const unreadCount = mailboxThreads.filter((t) => !t.isRead).length;
                  return (
                    <button
                      key={inbox.id}
                      type="button"
                      onClick={() => {
                        selectMailbox(inbox.id);
                        onNavigate?.();
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500/20'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                      }`}
                      title={inbox.email}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: inbox.badgeColor || '#64748b' }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{inbox.name || inbox.email}</span>
                          {inbox.name && inbox.name !== inbox.email && (
                            <span className="block truncate text-[10px] font-normal text-slate-400">{inbox.email}</span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold text-[10px]">
                            {unreadCount}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium">{mailboxThreads.length}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="my-2.5 border-t border-slate-100 dark:border-slate-800" />

      {/* Projects — Collapsible Section */}
      <div className="flex-1 overflow-y-auto px-3.5 space-y-1.5">
        <div
          onClick={() => setProjectsOpen((v) => !v)}
          className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition select-none group"
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${projectsOpen ? '' : '-rotate-90'}`} />
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Projects</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 font-normal normal-case">{projects.length}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNewProject();
              }}
              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Create new project workspace"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {projectsOpen && (
          <div className="mt-1.5 space-y-1.5">
            {projects.length === 0 && (
              <div className="p-4 my-2 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No projects yet</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">Organize your Zoho and Gmail accounts by project.</p>
                <button
                  type="button"
                  onClick={onOpenNewProject}
                  className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Project</span>
                </button>
              </div>
            )}

            {projects.map((proj) => {
              const isSelected = selectedProjectId === proj.id;
              const projInboxes = inboxes.filter((i) => i.projectId === proj.id);
              const projThreads = threads.filter((t) => t.projectId === proj.id);
              const unreadCount = projThreads.filter((t) => !t.isRead && !t.isArchived).length;

              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    setSelectedProjectId(proj.id);
                    onNavigate?.();
                  }}
                  className={`group flex items-center justify-between p-3 rounded-xl text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500/20 shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: proj.color }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{proj.name}</p>
                      <p className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{projInboxes.length} connected</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold text-[10px] group-hover:hidden">
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
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                        title="Edit Project"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(proj);
                        }}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-slate-400 group-hover:hidden transition ${
                        isSelected ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connected Accounts & Fast Connect Tray — Collapsible Section */}
      <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs">
        <div
          onClick={() => setAccountsTrayOpen((v) => !v)}
          className="flex items-center justify-between mb-2 cursor-pointer select-none group"
        >
          <div className="flex items-center gap-1.5">
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${accountsTrayOpen ? '' : '-rotate-90'}`} />
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group-hover:text-slate-700 dark:group-hover:text-slate-300 transition">
              Connected Mailboxes
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
              {totalConnected} Live
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onOpenImportArchive || onOpenAccountManager}
              className="text-[11px] text-slate-500 hover:text-blue-600 dark:text-slate-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              title="Import Email Archive (.zip, .mbox, .eml)"
            >
              <FolderArchive className="w-3 h-3" />
              Import
            </button>
            <button
              type="button"
              onClick={onOpenAccountManager}
              className="text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Connect
            </button>
          </div>
        </div>

        {accountsTrayOpen && (
          <div className="space-y-2.5 animate-in fade-in duration-100">
            {/* Quick channel indicators */}
            <div
              onClick={onOpenAccountManager}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs hover:border-slate-300 transition cursor-pointer text-[11px]"
              title="Click to manage connected mailboxes"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span>CF ({cloudflareCount})</span>
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Zoho ({zohoCount})</span>
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>{isGoogleConnected ? 'Gmail Live' : `Gmail (${gmailCount})`}</span>
                </span>
              </div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[10px] shrink-0 ml-1">
                {totalConnected} Active
              </span>
            </div>

            {/* Sync Status & Settings Footer */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => syncAllInboxes()}
                disabled={isSyncing}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition cursor-pointer disabled:opacity-50"
                title="Sync all mailboxes now"
              >
                <RotateCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenImportArchive || onOpenAccountManager}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition cursor-pointer"
                title="Import Email Archive (.zip, .mbox, .eml)"
              >
                <FolderArchive className="w-3 h-3" />
                <span>Import</span>
              </button>

              <button
                type="button"
                onClick={onOpenAccountManager}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition cursor-pointer"
                title="Manage Accounts & Settings"
              >
                <Settings className="w-3 h-3" />
                <span>Accounts</span>
              </button>

              <a
                href="/logout"
                onClick={handleLogout}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                title="Log out of ProjectInbox"
              >
                <LogOut className="w-3 h-3" />
                <span>Log out</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

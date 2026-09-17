import React from 'react';
import { useInbox } from '../context/InboxContext';
import {
  FolderKanban,
  Plus,
  Settings,
  Mail,
  Layers,
  Inbox,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { ChannelBadge } from './ChannelBadge';

interface SidebarProps {
  onOpenNewProject: () => void;
  onOpenAccountManager: () => void;
  onOpenNewMessage: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewProject,
  onOpenAccountManager,
  onOpenNewMessage,
}) => {
  const {
    projects,
    inboxes,
    threads,
    selectedProjectId,
    setSelectedProjectId,
    lastSyncTime,
  } = useInbox();

  const gmailCount = inboxes.filter((i) => i.channel === 'gmail').length;
  const zohoCount = inboxes.filter((i) => i.channel === 'zoho').length;
  const waCount = inboxes.filter((i) => i.channel === 'whatsapp').length;
  const socialCount = inboxes.filter((i) => i.channel === 'instagram' || i.channel === 'facebook').length;

  return (
    <aside className="w-64 md:w-72 bg-slate-900 text-slate-100 flex flex-col h-full border-r border-slate-800 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black shadow-md shadow-blue-900/30">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              ProjectInbox
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                Unified
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Gmail • Zoho • Social Hub</p>
          </div>
        </div>
      </div>

      {/* Compose CTA */}
      <div className="p-3">
        <button
          type="button"
          onClick={onOpenNewMessage}
          className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-blue-900/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Project Message</span>
        </button>
      </div>

      {/* Navigation / Feeds */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => setSelectedProjectId('all')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
            selectedProjectId === 'all'
              ? 'bg-slate-800 text-white shadow-2xs font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>All Projects Feed</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            {threads.length}
          </span>
        </button>
      </div>

      {/* Projects Section */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5" />
            Projects
          </span>
          <button
            type="button"
            onClick={onOpenNewProject}
            className="text-slate-400 hover:text-blue-400 p-0.5 rounded transition"
            title="Create new project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {projects.map((proj) => {
          const isSelected = selectedProjectId === proj.id;
          const projInboxes = inboxes.filter((i) => i.projectId === proj.id);
          const projThreads = threads.filter((t) => t.projectId === proj.id);
          const unreadCount = projThreads.filter((t) => !t.isRead && !t.isArchived).length;

          return (
            <div
              key={proj.id}
              onClick={() => setSelectedProjectId(proj.id)}
              className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition ${
                isSelected
                  ? 'bg-slate-800 text-white font-semibold ring-1 ring-slate-700'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: proj.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs">{proj.name}</p>
                  <p className="text-[10px] text-slate-400 font-normal">
                    {projInboxes.length} {projInboxes.length === 1 ? 'inbox' : 'inboxes'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold text-[10px]">
                    {unreadCount}
                  </span>
                )}
                <ChevronRight
                  className={`w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Accounts Snapshot & Manager */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Connected Accounts
          </span>
          <button
            type="button"
            onClick={onOpenAccountManager}
            className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            Manage
          </button>
        </div>

        {/* Quick channel pills */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-slate-800/80 border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-slate-300">Gmail:</span>
            <span className="font-semibold text-white ml-auto">{gmailCount}</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-slate-800/80 border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-slate-300">Zoho:</span>
            <span className="font-semibold text-white ml-auto">{zohoCount}</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-slate-800/80 border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-300">WhatsApp:</span>
            <span className="font-semibold text-white ml-auto">{waCount}</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-slate-800/80 border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-pink-500" />
            <span className="text-slate-300">Social:</span>
            <span className="font-semibold text-white ml-auto">{socialCount}</span>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Sync Status: Active
          </span>
          <span>{lastSyncTime}</span>
        </div>
      </div>
    </aside>
  );
};

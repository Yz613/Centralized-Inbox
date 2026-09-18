import React, { useMemo } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import {
  Search,
  RotateCw,
  Sparkles,
  Zap,
  Filter,
  Plus,
  Layers,
  Inbox as InboxIcon,
  Pencil,
  Trash2,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { InboxRole, ViewFilter } from '../types';

interface InboxHeaderProps {
  onOpenNewMessage: () => void;
  onOpenAiSummary: () => void;
  onOpenAccountManager: () => void;
  onOpenNewProject?: () => void;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  onOpenNewMessage,
  onOpenAiSummary,
  onOpenAccountManager,
  onOpenNewProject,
}) => {
  const {
    projects,
    inboxes,
    activeProject,
    selectedProjectId,
    projectInboxes,
    selectedInboxId,
    setSelectedInboxId,
    selectedRole,
    setSelectedRole,
    viewFilter,
    setViewFilter,
    searchQuery,
    setSearchQuery,
    isSyncing,
    syncAllInboxes,
    simulateIncomingMessage,
    filteredThreads,
    isGoogleConnected,
    googleUser,
    setEditingProject,
    setEditingInbox,
  } = useInbox();

  const roles = useMemo(() => {
    const list: { value: InboxRole | 'all'; label: string }[] = [
      { value: 'all', label: 'All Roles' },
      { value: 'support', label: 'Support' },
      { value: 'admin', label: 'Admin' },
      { value: 'notifications', label: 'Alerts' },
      { value: 'client', label: 'Clients' },
      { value: 'sales', label: 'Sales' },
      { value: 'billing', label: 'Billing' },
      { value: 'general', label: 'General' },
    ];
    inboxes.forEach((ib) => {
      if (ib.role && !list.some((r) => r.value === ib.role)) {
        list.push({
          value: ib.role,
          label: ib.role.charAt(0).toUpperCase() + ib.role.slice(1).replace(/_/g, ' '),
        });
      }
    });
    return list;
  }, [inboxes]);

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-3 space-y-2.5 shrink-0 select-none">
      {/* 1. Gmail-Style Top Search Bar & Compact Actions */}
      <div className="flex items-center gap-2">
        {/* Search Input Pill */}
        <div className="relative flex-1 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-full px-3.5 py-1.5 flex items-center gap-2 border border-transparent focus-within:border-blue-500/40 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mail, sender, subject..."
            className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Global Toolbar Icon Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Mailbox Sync */}
          <button
            type="button"
            onClick={() => syncAllInboxes()}
            disabled={isSyncing}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition cursor-pointer disabled:opacity-50"
            title="Sync all mailboxes"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Test Incoming simulation */}
          <button
            type="button"
            onClick={() => simulateIncomingMessage()}
            className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-full transition cursor-pointer"
            title="Simulate incoming email"
          >
            <Zap className="w-3.5 h-3.5 fill-amber-500" />
          </button>

          {/* AI Project Briefing */}
          <button
            type="button"
            onClick={onOpenAiSummary}
            className="p-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-full transition cursor-pointer"
            title="AI Project Briefing & Summary"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Connect Account Indicator / Quick Action */}
          {isGoogleConnected ? (
            <button
              type="button"
              onClick={onOpenAccountManager}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 hover:bg-emerald-100 transition cursor-pointer"
              title={`Live Gmail Connected: ${googleUser?.email || ''}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Gmail Live</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAccountManager}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              title="Connect Zoho or Gmail Account"
            >
              <Plus className="w-3 h-3 text-blue-600" />
              <span>Connect</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Context & View Filter Row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {/* Active View / Project title */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
            style={{ backgroundColor: activeProject ? activeProject.color : '#2563EB' }}
          />
          <h1 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            {activeProject ? activeProject.name : 'Unified Feed'}
          </h1>
          <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800">
            {filteredThreads.length}
          </span>

          {activeProject && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setEditingProject(activeProject)}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition cursor-pointer"
                title="Edit Project"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* View Filter segmented pill tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/90 p-0.5 rounded-full text-[11px] font-medium shrink-0">
          {(['all', 'unread', 'starred', 'archived'] as ViewFilter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setViewFilter(tab)}
              className={`px-2.5 py-0.5 rounded-full capitalize transition cursor-pointer ${
                viewFilter === tab
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Connected Inboxes & Role Bar */}
      <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
        {/* Connected Project Inboxes pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar flex-1">
          {projectInboxes.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedInboxId('all')}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                  selectedInboxId === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                All Boxes ({projectInboxes.length})
              </button>

              {projectInboxes.map((inbox) => {
                const isSelected = selectedInboxId === inbox.id;
                return (
                  <div
                    key={inbox.id}
                    className={`shrink-0 flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700 ring-1 ring-blue-400/30'
                        : 'border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedInboxId(inbox.id)}
                      className="flex items-center gap-1 cursor-pointer"
                    >
                      <ChannelBadge channel={inbox.channel} size="sm" />
                      <span className="font-medium truncate max-w-[120px]">{inbox.name || inbox.email}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingInbox(inbox);
                      }}
                      className="p-0.5 text-slate-400 hover:text-blue-600 rounded-full"
                      title="Edit Inbox"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Organized cross-channel stream</span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenAccountManager}
            className="shrink-0 text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-0.5 pl-1"
          >
            + Box
          </button>
        </div>

        {/* Role Selector */}
        <div className="shrink-0">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as InboxRole | 'all')}
            className="text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

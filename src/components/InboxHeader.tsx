import React from 'react';
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
} from 'lucide-react';
import { InboxRole, ViewFilter } from '../types';

interface InboxHeaderProps {
  onOpenNewMessage: () => void;
  onOpenAiSummary: () => void;
  onOpenAccountManager: () => void;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  onOpenNewMessage,
  onOpenAiSummary,
  onOpenAccountManager,
}) => {
  const {
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
  } = useInbox();

  const roles: { value: InboxRole | 'all'; label: string }[] = [
    { value: 'all', label: 'All Roles' },
    { value: 'support', label: 'Support' },
    { value: 'admin', label: 'Admin' },
    { value: 'notifications', label: 'Alerts' },
    { value: 'client', label: 'Clients' },
    { value: 'sales', label: 'Sales' },
    { value: 'billing', label: 'Billing' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3.5 space-y-3 shrink-0">
      {/* Upper bar: Project identity + Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 shadow-xs"
            style={{ backgroundColor: activeProject ? activeProject.color : '#4F46E5' }}
          >
            {activeProject ? activeProject.name.slice(0, 1) : <Layers className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
              {activeProject ? activeProject.name : 'All Projects Unified Feed'}
              <span className="text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {filteredThreads.length} threads
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
              {activeProject ? activeProject.description : 'Cross-project chronological inbox stream'}
            </p>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Button */}
          <button
            type="button"
            onClick={() => syncAllInboxes()}
            disabled={isSyncing}
            className="p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition"
            title="Sync all connected mailboxes"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden md:inline">{isSyncing ? 'Syncing...' : 'Sync Mailboxes'}</span>
          </button>

          {/* Test Incoming Email Simulation */}
          <button
            type="button"
            onClick={() => simulateIncomingMessage()}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300 flex items-center gap-1.5 transition"
            title="Simulate a new incoming email to test chronological ordering & origin badge"
          >
            <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
            <span className="hidden sm:inline">Simulate Incoming</span>
          </button>

          {/* AI Project Briefing */}
          <button
            type="button"
            onClick={onOpenAiSummary}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-gradient-to-r from-indigo-50 to-purple-50 text-purple-700 border border-purple-200 hover:from-indigo-100 hover:to-purple-100 dark:from-purple-950/40 dark:to-indigo-950/40 dark:text-purple-300 dark:border-purple-800 flex items-center gap-1.5 transition shadow-2xs"
            title="Generate AI briefing across all project inboxes"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline">Project AI Briefing</span>
          </button>

          {/* Compose New Message */}
          <button
            type="button"
            onClick={onOpenNewMessage}
            className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Compose</span>
          </button>
        </div>
      </div>

      {/* Connected Project Inboxes Bar */}
      {projectInboxes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 shrink-0 font-medium text-[11px] uppercase tracking-wider">
            Connected Inboxes ({projectInboxes.length}):
          </span>

          {/* All Inboxes pill */}
          <button
            type="button"
            onClick={() => setSelectedInboxId('all')}
            className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition ${
              selectedInboxId === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            All Project Inboxes
          </button>

          {/* Individual Inbox pills */}
          {projectInboxes.map((inbox) => {
            const isSelected = selectedInboxId === inbox.id;
            return (
              <button
                key={inbox.id}
                type="button"
                onClick={() => setSelectedInboxId(inbox.id)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700 ring-2 ring-blue-400/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <ChannelBadge channel={inbox.channel} size="sm" />
                <span className="font-semibold">{inbox.email}</span>
                <span className="text-[10px] opacity-75 font-normal uppercase">
                  ({inbox.role})
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onOpenAccountManager}
            className="shrink-0 px-2 py-1 text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
          >
            + Connect Box
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg text-xs font-medium">
          {(['all', 'unread', 'starred', 'archived'] as ViewFilter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setViewFilter(tab)}
              className={`px-3 py-1 rounded-md capitalize transition ${
                viewFilter === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Role filter & Search box */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          {/* Role selector */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as InboxRole | 'all')}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, body, sender..."
              className="w-full text-xs pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

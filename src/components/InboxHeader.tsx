import React, { useMemo, useState } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelBadge } from './ChannelBadge';
import {
  Search,
  RotateCw,
  Sparkles,
  Zap,
  Plus,
  X,
  Pencil,
  Bell,
  BellOff,
  CheckSquare,
  ShieldCheck,
  ShieldAlert,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { handleLogout } from '../utils/logout';
import { isLocalDevHost } from '../utils/operatorPrefs';
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
    inboxes,
    activeProject,
    selectedProjectId,
    projectInboxes,
    selectedInboxId,
    setSelectedInboxId,
    selectMailbox,
    selectedRole,
    setSelectedRole,
    viewFilter,
    setViewFilter,
    searchQuery,
    setSearchQuery,
    isSyncing,
    syncError,
    lastSyncTime,
    syncAllInboxes,
    simulateIncomingMessage,
    filteredThreads,
    isGoogleConnected,
    googleUser,
    setEditingProject,
    setEditingInbox,
    notificationsEnabled,
    enableNotifications,
    hasSampleData,
    removeSampleWorkspaces,
    loadDemoAccount,
    followUps,
    toggleFollowUpItem,
  } = useInbox();

  const [isCoverageOpen, setIsCoverageOpen] = useState(false);
  const [isDemoBannerDismissed, setIsDemoBannerDismissed] = useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(true);

  const coverageNeedsAttention = Boolean(
    syncError ||
    inboxes.some(
      (i) => i.deliveryError || i.syncError || (i.receivingMode !== 'routing' && !i.lastMailboxSyncAt)
    )
  );

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

  const activeInbox =
    selectedInboxId === 'all' ? null : inboxes.find((inbox) => inbox.id === selectedInboxId);
  const viewTitle = activeInbox
    ? activeInbox.name || activeInbox.email
    : activeProject
      ? activeProject.name
      : 'All mail';

  const openFollowUps = followUps.filter(
    (f) => !f.done && (selectedProjectId === 'all' || f.projectId === 'all' || f.projectId === selectedProjectId)
  );

  const viewTabs: { id: ViewFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'needs_reply', label: 'Needs you' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'unread', label: 'Unread' },
    { id: 'starred', label: 'Starred' },
    { id: 'snoozed', label: 'Snoozed' },
    { id: 'archived', label: 'Archived' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-3.5 space-y-3 shrink-0 select-none">
      {/* Demo Account Indicator Banner */}
      {hasSampleData && !isDemoBannerDismissed && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/80 text-[11px] text-blue-900 dark:text-blue-200 shadow-2xs">
          <span className="flex items-center gap-1.5 font-medium truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
            <span><strong>Demo Workspace:</strong> Apex SaaS, Nordic & Zenith active.</span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={loadDemoAccount}
              className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px] transition cursor-pointer"
              title="Reset sample data and threads"
            >
              Reset Demo
            </button>
            <button
              type="button"
              onClick={removeSampleWorkspaces}
              className="px-2 py-0.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-[10px] transition cursor-pointer"
              title="Clear sample workspaces to connect real accounts"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsDemoBannerDismissed(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              title="Dismiss banner"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 1. Gmail-Style Top Search Bar & Compact Actions */}
      <div className="flex items-center gap-2">
        {/* Search Input Pill */}
        <div className="relative flex-1 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-full px-3.5 py-1.5 flex items-center gap-2 border border-transparent focus-within:border-blue-500/40 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mail, sender, subject, or message body..."
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
          {/* Mail Coverage Quick Status */}
          <button
            type="button"
            onClick={() => setIsCoverageOpen(true)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition cursor-pointer ${
              coverageNeedsAttention
                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={`Mail Coverage: ${inboxes.length} accounts (${coverageNeedsAttention ? 'Needs attention' : 'All healthy'})`}
          >
            {coverageNeedsAttention ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="hidden sm:inline">Coverage</span>
            <span className="font-semibold">{inboxes.length}</span>
          </button>

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
          <span className="hidden md:inline text-[10px] font-mono text-slate-400 px-1" title="Command palette">
            ⌘K
          </span>

          {/* Test Incoming simulation — local only */}
          {isLocalDevHost() && (
            <button
              type="button"
              onClick={() => simulateIncomingMessage()}
              className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-full transition cursor-pointer"
              title="Simulate incoming email"
            >
              <Zap className="w-3.5 h-3.5 fill-amber-500" />
            </button>
          )}

          {/* AI Project Briefing */}
          <button
            type="button"
            onClick={onOpenAiSummary}
            className="p-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-full transition cursor-pointer"
            title="AI Project Briefing & Summary"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!notificationsEnabled) void enableNotifications();
            }}
            className={`p-2 rounded-full transition cursor-pointer ${
              notificationsEnabled
                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={notificationsEnabled ? 'Desktop notifications on' : 'Enable desktop notifications'}
          >
            {notificationsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
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

      {/* Coverage Details Modal */}
      {isCoverageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Mail Coverage & Ingestion Status</h3>
                  <p className="text-[11px] text-slate-400">{inboxes.length} accounts · Refreshed: {lastSyncTime}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverageOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {syncError && (
              <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                {syncError}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Domain mail arrives even when this app is closed. Saved mailbox connections are checked in the background. Google Sign-In needs this page open and periodically requires reconnection.
            </p>

            <div className="mt-3 max-h-64 overflow-y-auto space-y-2 text-xs">
              {inboxes.map((inbox) => {
                const routing = inbox.receivingMode === 'routing' || inbox.channel === 'cloudflare';
                const stale =
                  !routing &&
                  inbox.hasAppPassword &&
                  (!inbox.lastMailboxSyncAt || Date.now() - Date.parse(inbox.lastMailboxSyncAt) > 20 * 60000);
                const hasError = Boolean(inbox.deliveryError || inbox.syncError || stale);

                return (
                  <div
                    key={inbox.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{inbox.email}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          hasError
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {hasError ? 'Attention' : 'Healthy'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {routing
                        ? `Domain routing · Last received: ${inbox.lastReceivedAt ? new Date(inbox.lastReceivedAt).toLocaleString() : 'No delivery recorded yet'}`
                        : inbox.hasAppPassword
                        ? `Background sync · Last check: ${inbox.lastMailboxSyncAt ? new Date(inbox.lastMailboxSyncAt).toLocaleString() : 'Not checked yet'}`
                        : inbox.channel === 'gmail'
                        ? isGoogleConnected && googleUser?.email.toLowerCase() === inbox.email.toLowerCase()
                          ? 'Google Sign-In · Active in this browser'
                          : 'Reconnect this Google account'
                        : 'No verified connection'}
                    </p>
                    {Boolean(inbox.syncPending) && (
                      <p className="text-[11px] text-blue-600">History recovery is still in progress across all folders.</p>
                    )}
                    {hasError && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        {inbox.deliveryError ||
                          (inbox.syncError
                            ? `${routing ? 'Old mailbox history needs attention: ' : ''}${inbox.syncError}`
                            : 'Mailbox checks are overdue. Try Sync or review the connection.')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => syncAllInboxes()}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync All'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCoverageOpen(false);
                  onOpenAccountManager();
                }}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Manage Accounts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Context & View Filter Row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {/* Active View / Project title */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
            style={{ backgroundColor: activeInbox?.badgeColor || activeProject?.color || '#2563EB' }}
          />
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {viewTitle}
            </h1>
            {activeInbox && activeInbox.name && activeInbox.name !== activeInbox.email && (
              <p className="text-[10px] text-slate-400 truncate">{activeInbox.email}</p>
            )}
          </div>
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

        {/* View Filter segmented pill tabs and toggle */}
        <div className="flex items-center gap-1.5 shrink-0 max-w-[70%]">
          <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/90 p-0.5 rounded-full text-[11px] font-medium overflow-x-auto no-scrollbar">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewFilter(tab.id)}
                className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
                  viewFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFiltersDrawerOpen(!filtersDrawerOpen)}
            className={`p-1 rounded-full transition cursor-pointer shrink-0 ${
              filtersDrawerOpen
                ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 ring-1 ring-blue-500/20'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={filtersDrawerOpen ? 'Collapse mailbox filter bar' : 'Expand mailbox filter bar'}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Connected Inboxes & Role Bar — Collapsible */}
      {filtersDrawerOpen && (
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs animate-in fade-in duration-100">
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
                  All mail ({projectInboxes.length})
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
                        onClick={() => selectMailbox(inbox.id)}
                        className="flex items-center gap-1 cursor-pointer"
                      >
                        <ChannelBadge channel={inbox.channel} size="sm" />
                        <span className="font-medium truncate max-w-[160px]" title={inbox.email}>
                          {inbox.email}
                        </span>
                        {inbox.unreadCount > 0 && (
                          <span
                            className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                              isSelected ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                            }`}
                          >
                            {inbox.unreadCount}
                          </span>
                        )}
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
      )}

      {openFollowUps.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          <CheckSquare className="w-3 h-3 text-emerald-600 shrink-0" />
          {openFollowUps.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleFollowUpItem(item.id)}
              className="shrink-0 px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              title="Click to mark done"
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

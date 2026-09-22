import React, { useState } from 'react';
import { useInbox } from '../context/InboxContext';
import {
  Menu,
  Search,
  X,
  RotateCw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Bell,
  BellOff,
  Settings,
  LogOut,
  FolderArchive,
  Plus,
  Zap,
} from 'lucide-react';
import { handleLogout } from '../utils/logout';
import { isLocalDevHost } from '../utils/operatorPrefs';

interface GmailTopBarProps {
  onToggleSidebar: () => void;
  onOpenNewMessage: () => void;
  onOpenAiSummary: () => void;
  onOpenAccountManager: (tab?: 'list' | 'add' | 'import_archive' | 'free_guide') => void;
  onOpenNewProject: () => void;
}

export const GmailTopBar: React.FC<GmailTopBarProps> = ({
  onToggleSidebar,
  onOpenAiSummary,
  onOpenAccountManager,
}) => {
  const {
    inboxes,
    searchQuery,
    setSearchQuery,
    isSyncing,
    syncError,
    lastSyncTime,
    syncAllInboxes,
    simulateIncomingMessage,
    googleUser,
    notificationsEnabled,
    enableNotifications,
    hasSampleData,
    removeSampleWorkspaces,
  } = useInbox();

  const [isCoverageOpen, setIsCoverageOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const coverageNeedsAttention = Boolean(
    syncError ||
    inboxes.some(
      (i) => i.deliveryError || i.syncError || (i.receivingMode !== 'routing' && !i.lastMailboxSyncAt)
    )
  );

  return (
    <header className="h-16 px-3 md:px-4 bg-[#f6f8fc] flex items-center justify-between gap-3 shrink-0 select-none z-30 border-b border-slate-200/60">
      {/* Left: Hamburger & Gmail Logo */}
      <div className="flex items-center gap-3 w-60 md:w-64 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2.5 hover:bg-slate-200/80 rounded-full text-[#202124] transition cursor-pointer"
          title="Main menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSearchQuery('')}>
          {/* Authentic Gmail-styled SVG Logo Icon */}
          <div className="w-9 h-9 flex items-center justify-center relative">
            <svg viewBox="0 0 48 48" className="w-8 h-8">
              <path fill="#4285F4" d="M45,16.2l-5,3.8V38c0,2.2-1.8,4-4,4H12c-2.2,0-4-1.8-4-4V20l-5-3.8c-1.9-1.4-3-3.6-3-6c0-4.6,4.6-7.8,8.8-5.8L24,11.5l15.2-7.1c4.2-2,8.8,1.2,8.8,5.8C48,12.6,46.9,14.8,45,16.2z"/>
              <path fill="#34A853" d="M8,38V20l16,10.7L40,20v18c0,2.2-1.8,4-4,4H12C9.8,42,8,40.2,8,38z"/>
              <path fill="#EA4335" d="M40,20l-16,10.7L8,20V11l16,10.7L40,11V20z"/>
              <path fill="#FBBC05" d="M24,21.7L8,11v-0.8c0-2.2,1.8-4,4-4h24c2.2,0,4,1.8,4,4v0.8L24,21.7z"/>
            </svg>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[21px] font-bold tracking-[-0.3px] text-[#1f1f1f] font-display">
              ProjectInbox
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 font-bold tracking-wide uppercase border border-blue-200">
              Unified
            </span>
          </div>
        </div>
      </div>

      {/* Center: Iconic Gmail Wide Search Pill */}
      <div className="flex-1 max-w-[720px] mx-2 hidden sm:block">
        <div
          className={`relative flex items-center h-12 rounded-full transition-all px-4 border ${
            isSearchFocused
              ? 'bg-white shadow-md ring-2 ring-blue-500/30 border-blue-400 text-[#1f1f1f]'
              : 'bg-[#eaf1fb] hover:bg-[#e1e9f5] border-slate-300/80 text-[#1f1f1f]'
          }`}
        >
          <Search className="w-5 h-5 text-slate-600 shrink-0 mr-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search mail, sender, subject, or message content..."
            className="w-full text-[14px] bg-transparent text-[#1f1f1f] placeholder:text-slate-500 font-medium focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1.5 text-slate-600 hover:text-black rounded-full hover:bg-slate-200"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Quick Tools, Sync, Coverage & User Avatar */}
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        {/* Coverage Indicator */}
        <button
          type="button"
          onClick={() => setIsCoverageOpen(true)}
          className={`h-9 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
            coverageNeedsAttention
              ? 'bg-amber-50 text-amber-900 border-amber-400'
              : 'bg-white border-slate-300 text-[#1f1f1f] hover:bg-slate-100 shadow-2xs'
          }`}
          title={`Mail Coverage: ${inboxes.length} accounts (${coverageNeedsAttention ? 'Needs attention' : 'All healthy'})`}
        >
          {coverageNeedsAttention ? (
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          )}
          <span className="hidden md:inline font-bold">Coverage</span>
          <span className="font-bold text-[11px] px-1.5 py-0.2 rounded-full bg-slate-200 text-[#1f1f1f]">
            {inboxes.length}
          </span>
        </button>

        {/* Sync Button */}
        <button
          type="button"
          onClick={() => syncAllInboxes()}
          disabled={isSyncing}
          className="p-2 hover:bg-slate-200/80 rounded-full text-slate-700 hover:text-black transition cursor-pointer disabled:opacity-50"
          title="Refresh / Sync all mailboxes"
        >
          <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
        </button>

        {/* Local Incoming Simulator */}
        {isLocalDevHost() && (
          <button
            type="button"
            onClick={() => simulateIncomingMessage()}
            className="p-2 hover:bg-amber-100 rounded-full text-amber-700 transition cursor-pointer"
            title="Simulate incoming test email"
          >
            <Zap className="w-4 h-4 fill-amber-500" />
          </button>
        )}

        {/* AI Briefing */}
        <button
          type="button"
          onClick={onOpenAiSummary}
          className="p-2 hover:bg-purple-100 rounded-full text-purple-700 transition cursor-pointer"
          title="Gemini AI Project Briefing"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={() => {
            if (!notificationsEnabled) void enableNotifications();
          }}
          className={`p-2 rounded-full transition cursor-pointer ${
            notificationsEnabled
              ? 'text-emerald-700 hover:bg-emerald-50'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
          title={notificationsEnabled ? 'Desktop notifications on' : 'Enable desktop notifications'}
        >
          {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>

        {/* User Account / Avatar Circle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-9 h-9 rounded-full ring-2 ring-white hover:ring-blue-500 bg-gradient-to-tr from-blue-700 to-indigo-700 text-white font-bold text-xs flex items-center justify-center shadow-xs cursor-pointer overflow-hidden transition"
            title={googleUser?.email || 'User Account'}
          >
            {googleUser?.photoURL ? (
              <img src={googleUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{(googleUser?.email || 'U').charAt(0).toUpperCase()}</span>
            )}
          </button>

          {/* Profile Dropdown Menu */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-300 shadow-xl p-3 z-50 animate-in fade-in duration-100">
              <div className="flex items-center gap-3 p-2 border-b border-slate-200 mb-2">
                <div className="w-10 h-10 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                  {(googleUser?.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1f1f1f] truncate">
                    {googleUser?.displayName || 'ProjectInbox User'}
                  </p>
                  <p className="text-[11px] text-slate-600 font-medium truncate">
                    {googleUser?.email || 'Local Operator'}
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onOpenAccountManager('list');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#202124] hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-600" />
                  <span>Manage Mailboxes ({inboxes.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onOpenAccountManager('add');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#202124] hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-blue-700" />
                  <span>Connect New Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onOpenAccountManager('import_archive');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#202124] hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  <FolderArchive className="w-4 h-4 text-emerald-700" />
                  <span>Import Archive (.zip, .mbox)</span>
                </button>

                {hasSampleData && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      removeSampleWorkspaces();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-800 hover:bg-amber-50 font-semibold transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Clear Demo Workspaces</span>
                  </button>
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200">
                <a
                  href="/logout"
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl font-bold transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coverage Modal */}
      {isCoverageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-300 shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1f1f1f]">
                    Mail Coverage & Ingestion Status
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    {inboxes.length} accounts configured · Last refreshed: {lastSyncTime}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverageOpen(false)}
                className="p-1.5 rounded-full text-slate-600 hover:text-black hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {syncError && (
              <div className="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 font-medium">
                {syncError}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-700 leading-relaxed font-medium">
              Domain mail arrives even when this tab is closed. Saved mailbox connections are verified in the background. Google Sign-In needs this page open and periodically requires reconnection.
            </p>

            <div className="mt-4 max-h-64 overflow-y-auto space-y-2.5 text-xs">
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
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#1f1f1f] truncate">
                        {inbox.email}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          hasError
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {hasError ? 'Attention' : 'Healthy'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {routing
                        ? `Domain routing · Last received: ${
                            inbox.lastReceivedAt ? new Date(inbox.lastReceivedAt).toLocaleString() : 'No delivery recorded yet'
                          }`
                        : inbox.hasAppPassword
                        ? `Background sync · Last check: ${
                            inbox.lastMailboxSyncAt ? new Date(inbox.lastMailboxSyncAt).toLocaleString() : 'Not checked yet'
                          }`
                        : inbox.channel === 'gmail'
                        ? 'Google Sign-In · Active in this browser'
                        : 'No verified connection'}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => syncAllInboxes()}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-[#1f1f1f] hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync All'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCoverageOpen(false);
                  onOpenAccountManager('list');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                Manage Accounts
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

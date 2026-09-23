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
import { AlertSettingsModal } from './AlertSettingsModal';

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
    phoneAlertsOn,
    notificationHint,
    enableNotifications,
    retryBackgroundAlerts,
    disableNotifications,
    hasSampleData,
    removeSampleWorkspaces,
  } = useInbox();

  const [isCoverageOpen, setIsCoverageOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState(false);

  const coverageNeedsAttention = Boolean(
    syncError ||
    inboxes.some(
      (i) => i.deliveryError || i.syncError || (i.receivingMode !== 'routing' && !i.lastMailboxSyncAt)
    )
  );

  const handleToggleAlerts = () => {
    if (!notificationsEnabled) {
      void enableNotifications();
    } else if (!phoneAlertsOn && notificationHint?.toLowerCase().includes('retry')) {
      void retryBackgroundAlerts();
    } else {
      void disableNotifications();
    }
  };

  const alertTooltip = notificationHint
    || (phoneAlertsOn
      ? 'Background mail alerts are ON. Click slider to turn off.'
      : notificationsEnabled
        ? 'Foreground mail alerts are ON. Click slider to turn off, or click to retry background alerts.'
        : 'Mail alerts are OFF. Click slider to turn on.');

  return (
    <>
    <header className="min-h-14 md:h-16 pt-[env(safe-area-inset-top,0px)] px-2 sm:px-3 md:px-4 bg-[#f6f8fc] flex items-center justify-between gap-2 md:gap-3 shrink-0 select-none z-30 border-b border-slate-200/60">
      {/* MOBILE TOP BAR: Authentic Gmail Mobile Search Pill (< md) */}
      <div className="flex md:hidden items-center w-full">
        <div
          className={`flex items-center w-full h-11 px-2 sm:px-2.5 rounded-full transition-all border ${
            isSearchFocused
              ? 'bg-white shadow-md ring-2 ring-blue-500/30 border-blue-400'
              : 'bg-[#eaf1fb] hover:bg-[#e1e9f5] border-slate-300/80 shadow-2xs'
          }`}
        >
          {/* Hamburger Menu */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-200/80 rounded-full text-[#202124] transition cursor-pointer shrink-0"
            title="Main menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search Input - text-base prevents iOS Safari zoom */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search in mail"
            className="flex-1 min-w-0 mx-1.5 sm:mx-2 text-base md:text-sm bg-transparent text-[#1f1f1f] placeholder:text-slate-500 font-medium focus:outline-none"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-600 hover:text-black rounded-full hover:bg-slate-200 shrink-0"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Sync indicator if syncing */}
          {isSyncing && (
            <RotateCw className="w-4 h-4 animate-spin text-blue-600 shrink-0 mx-1" />
          )}


          {/* Mobile Profile Avatar with Coverage Alert Badge */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="w-8 h-8 rounded-full ring-2 ring-white hover:ring-blue-500 bg-gradient-to-tr from-blue-700 to-indigo-700 text-white font-bold text-xs flex items-center justify-center shadow-xs cursor-pointer overflow-hidden transition"
              title={googleUser?.email || 'User Account'}
            >
              {googleUser?.photoURL ? (
                <img src={googleUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{(googleUser?.email || 'U').charAt(0).toUpperCase()}</span>
              )}
            </button>
            {coverageNeedsAttention && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white" />
            )}
          </div>
        </div>
      </div>

      {/* DESKTOP TOP BAR: Authentic Full-Width Gmail Header (>= md) */}
      <div className="hidden md:flex items-center gap-3 w-60 md:w-64 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2.5 hover:bg-slate-200/80 rounded-full text-[#202124] transition cursor-pointer"
          title="Main menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSearchQuery('')}>
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

      {/* Desktop Search Pill */}
      <div className="flex-1 max-w-[720px] mx-2 hidden md:block">
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

      {/* Desktop Right Quick Actions */}
      <div className="hidden md:flex items-center gap-1.5 md:gap-2 shrink-0">
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
          <span className="font-bold">Coverage</span>
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

        {/* Desktop Alert Settings Button */}
        <button
          type="button"
          onClick={() => setIsAlertSettingsOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition shadow-2xs cursor-pointer ${
            phoneAlertsOn
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              : notificationsEnabled
              ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Configure mail alerts & push notifications"
        >
          {phoneAlertsOn ? (
            <Bell className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : notificationsEnabled ? (
            <Bell className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          ) : (
            <BellOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">
            {phoneAlertsOn ? 'Alerts On' : notificationsEnabled ? 'Alerts Tab' : 'Alerts'}
          </span>
        </button>

        {/* Desktop User Avatar */}
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
        </div>
      </div>

      {/* Shared Profile Dropdown Menu (Positioned for both mobile & desktop) */}
      {isProfileMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-2 md:p-0 md:absolute md:inset-auto md:right-4 md:top-16">
          <div
            className="fixed inset-0 bg-slate-900/40 md:hidden"
            onClick={() => setIsProfileMenuOpen(false)}
          />
          <div className="relative z-50 w-full max-w-xs md:w-80 bg-white rounded-3xl md:rounded-2xl border border-slate-300 shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
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
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(false)}
                className="p-1 rounded-full text-slate-500 hover:text-black md:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile-only Quick Action Buttons inside Profile Menu */}
            <div className="md:hidden grid grid-cols-2 gap-2 mb-2 pb-2 border-b border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  setIsCoverageOpen(true);
                }}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1f1f1f] transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="truncate">Coverage ({inboxes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  onOpenAiSummary();
                }}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-xs font-bold text-purple-800 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>AI Briefing</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  syncAllInboxes();
                }}
                disabled={isSyncing}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1f1f1f] transition cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 text-blue-600 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Mail'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  setIsAlertSettingsOpen(true);
                }}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1f1f1f] transition cursor-pointer select-none"
                title="Configure alerts & push notifications"
              >
                {phoneAlertsOn ? (
                  <Bell className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : notificationsEnabled ? (
                  <Bell className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <BellOff className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="truncate">{phoneAlertsOn ? 'Alerts On' : notificationsEnabled ? 'Alerts Tab' : 'Alerts Setup'}</span>
              </button>
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
        </div>
      )}
    </header>

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
      <AlertSettingsModal
        isOpen={isAlertSettingsOpen}
        onClose={() => setIsAlertSettingsOpen(false)}
      />
    </>
  );
};

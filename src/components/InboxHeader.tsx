import React, { useState } from 'react';
import { useInbox } from '../context/InboxContext';
import {
  RotateCw,
  Archive,
  Trash2,
  Mail,
  MailOpen,
  Square,
  CheckSquare,
  Minus,
  Star,
  Columns2,
  Rows2,
  X,
  ChevronDown,
  FolderInput,
  Newspaper,
  Receipt,
  Inbox as InboxIcon,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { InboxStream } from '../types';

interface InboxHeaderProps {
  onOpenNewMessage?: () => void;
  onOpenAiSummary?: () => void;
  onOpenAccountManager?: () => void;
  onOpenNewProject?: () => void;
  readingPaneMode?: 'none' | 'split';
  onToggleReadingPaneMode?: () => void;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  readingPaneMode = 'none',
  onToggleReadingPaneMode,
}) => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedInboxId,
    setSelectedInboxId,
    setSelectedThreadId,
    viewFilter,
    setViewFilter,
    activeStream,
    setActiveStream,
    streamCounts,
    setThreadStream,
    filteredThreads,
    isSyncing,
    syncAllInboxes,
    archiveThreads,
    markThreadsRead,
    deleteThreads,
    starThreads,
    selectedThreadIds,
    replaceThreadSelection,
    clearThreadSelection,
    searchQuery,
    setSearchQuery,
  } = useInbox();

  const [moveStreamMenuOpen, setMoveStreamMenuOpen] = useState(false);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);

  const streamTabs: { id: InboxStream; label: string; icon: typeof InboxIcon; count: number; color: string }[] = [
    { id: 'primary', label: 'Primary', icon: InboxIcon, count: streamCounts.primary, color: '#0b57d0' },
    { id: 'feed', label: 'The Feed', icon: Newspaper, count: streamCounts.feed, color: '#b06000' },
    { id: 'paper_trail', label: 'Reports', icon: Receipt, count: streamCounts.paper_trail, color: '#137333' },
  ];

  const visibleIds = filteredThreads.map((thread) => thread.id);
  const selectedCount = selectedThreadIds.length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedThreadIds.includes(id));
  const selectedThreads = filteredThreads.filter((thread) => selectedThreadIds.includes(thread.id));
  const allSelectedRead = selectedThreads.length > 0 && selectedThreads.every((thread) => thread.isRead);
  const allSelectedStarred = selectedThreads.length > 0 && selectedThreads.every((thread) => thread.isStarred);

  const activeProjectObj = selectedProjectId !== 'all' ? projects.find((p) => p.id === selectedProjectId) : null;

  // View title helper
  const getViewTitle = () => {
    switch (viewFilter) {
      case 'starred': return 'Starred';
      case 'snoozed': return 'Snoozed';
      case 'sent': return 'Sent';
      case 'needs_reply': return 'Needs Reply';
      case 'all_mail': return 'All Mail';
      case 'unread': return 'Unread';
      case 'waiting': return 'Waiting';
      case 'spam': return 'Spam';
      case 'archived': return 'Archive';
      default: return null;
    }
  };

  const viewTitle = getViewTitle();
  const isCustomView = Boolean(viewTitle || searchQuery.trim() || activeProjectObj);

  return (
    <div className="bg-white border-b border-slate-200 select-none shrink-0 w-full">
      {/* 1. Authentic Gmail Top Action Toolbar (48px) */}
      <div className="h-12 px-3 sm:px-4 flex items-center justify-between gap-2 min-w-0">
        {/* Left: Checkbox with Dropdown, Refresh, and Bulk Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-[#444746] min-w-0 flex-1">
          {/* Authentic Gmail Select-All Checkbox with dropdown caret */}
          <div className="relative flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                if (selectedCount > 0) {
                  clearThreadSelection();
                } else {
                  replaceThreadSelection(visibleIds);
                }
              }}
              className={`p-1.5 rounded-l-md border transition cursor-pointer flex items-center justify-center ${
                selectedCount > 0
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
              title={
                allVisibleSelected
                  ? 'Deselect all messages'
                  : selectedCount > 0
                  ? 'Clear selection'
                  : 'Select all visible messages'
              }
              aria-pressed={allVisibleSelected}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-700" />
              ) : selectedCount > 0 ? (
                <Minus className="w-4 h-4 text-blue-700" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {/* Caret */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectMenuOpen((v) => !v);
              }}
              className={`p-1.5 rounded-r-md border-y border-r transition cursor-pointer flex items-center justify-center -ml-px ${
                selectedCount > 0
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
              title="Selection options"
            >
              <ChevronDown className="w-3 h-3 text-slate-600" />
            </button>

            {selectMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSelectMenuOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 z-50 w-36 rounded-xl border border-slate-200 bg-white shadow-xl py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      replaceThreadSelection(visibleIds);
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearThreadSelection();
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    None
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const readIds = filteredThreads.filter((t) => t.isRead).map((t) => t.id);
                      replaceThreadSelection(readIds);
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const unreadIds = filteredThreads.filter((t) => !t.isRead).map((t) => t.id);
                      replaceThreadSelection(unreadIds);
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const starredIds = filteredThreads.filter((t) => t.isStarred).map((t) => t.id);
                      replaceThreadSelection(starredIds);
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    Starred
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const unstarredIds = filteredThreads.filter((t) => !t.isStarred).map((t) => t.id);
                      replaceThreadSelection(unstarredIds);
                      setSelectMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 font-semibold text-[#1f1f1f] cursor-pointer"
                  >
                    Unstarred
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => syncAllInboxes()}
            disabled={isSyncing}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Bulk Action Toolbar when items are selected */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-0.5 sm:gap-1 pl-1.5 sm:pl-2 border-l border-slate-300 animate-in fade-in duration-100 shrink-0">
              <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full mr-0.5 shrink-0 whitespace-nowrap">
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={() => archiveThreads(selectedThreadIds)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer shrink-0"
                title="Archive selected (E)"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteThreads(selectedThreadIds)}
                className="p-1.5 hover:bg-red-50 rounded-full text-slate-700 hover:text-red-600 transition cursor-pointer shrink-0"
                title="Delete selected (#)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => markThreadsRead(selectedThreadIds, !allSelectedRead)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer shrink-0"
                title={allSelectedRead ? 'Mark as unread (U)' : 'Mark as read (U)'}
              >
                {allSelectedRead ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => starThreads(selectedThreadIds, !allSelectedStarred)}
                className="p-1.5 hover:bg-amber-50 rounded-full text-slate-700 hover:text-amber-600 transition cursor-pointer shrink-0"
                title={allSelectedStarred ? 'Unstar selected' : 'Star selected'}
              >
                <Star className={`w-4 h-4 ${allSelectedStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>

              {/* Move to Stream Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoveStreamMenuOpen((v) => !v)}
                  className="px-2 py-1 hover:bg-slate-100 rounded-lg text-slate-700 hover:text-black transition cursor-pointer text-xs font-semibold flex items-center gap-1 border border-slate-300 bg-white shadow-2xs"
                  title="Move selected threads to stream"
                >
                  <FolderInput className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Move</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>
                {moveStreamMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-30 w-44 rounded-xl border border-slate-200 bg-white shadow-xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-slate-700 cursor-pointer"
                      onClick={() => {
                        selectedThreadIds.forEach((id) => void setThreadStream(id, 'primary'));
                        setMoveStreamMenuOpen(false);
                      }}
                    >
                      <InboxIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Primary</span>
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-slate-700 cursor-pointer"
                      onClick={() => {
                        selectedThreadIds.forEach((id) => void setThreadStream(id, 'feed'));
                        setMoveStreamMenuOpen(false);
                      }}
                    >
                      <Newspaper className="w-3.5 h-3.5 text-amber-600" />
                      <span>The Feed</span>
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-slate-700 cursor-pointer"
                      onClick={() => {
                        selectedThreadIds.forEach((id) => void setThreadStream(id, 'paper_trail'));
                        setMoveStreamMenuOpen(false);
                      }}
                    >
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Reports</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={clearThreadSelection}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition cursor-pointer shrink-0"
                title="Clear selection (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Message range / count & Reading Pane switcher */}
        <div className="flex items-center gap-2 shrink-0 text-[#5f6368] text-xs font-medium">
          <span>
            {filteredThreads.length === 0
              ? '0 conversations'
              : `1–${filteredThreads.length} of ${filteredThreads.length}`}
          </span>

          {/* Toggle Reading Pane Mode Button */}
          {onToggleReadingPaneMode && (
            <button
              type="button"
              onClick={onToggleReadingPaneMode}
              className={`p-1.5 rounded-md hover:bg-slate-100 transition cursor-pointer hidden md:flex items-center ${
                readingPaneMode === 'split' ? 'text-blue-700 bg-blue-50' : 'text-[#5f6368]'
              }`}
              title={
                readingPaneMode === 'split'
                  ? 'Switch to No split (Full width reading)'
                  : 'Switch to Split view (Reading pane on right)'
              }
            >
              {readingPaneMode === 'split' ? (
                <Columns2 className="w-4 h-4" />
              ) : (
                <Rows2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Authentic Gmail Category Tabs (Only shown in standard inbox mode) */}
      {!isCustomView && (
        <div className="flex items-center border-t border-slate-200 overflow-x-auto no-scrollbar">
          {streamTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeStream === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveStream(tab.id);
                  setSelectedThreadId(null);
                }}
                className={`relative flex items-center gap-3 px-5 sm:px-6 h-12 text-sm font-semibold transition cursor-pointer shrink-0 border-b-[3px] -mb-[1px] ${
                  isActive
                    ? 'border-[#0b57d0] text-[#0b57d0] font-bold'
                    : 'border-transparent text-[#5f6368] hover:text-[#1f1f1f] hover:bg-[#f1f3f4]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#0b57d0]' : 'text-[#5f6368]'
                  }`}
                />
                <span className="tracking-tight">{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-xs px-2 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Authentic Single-Row Filter / Search / Project Banner (When not in standard inbox tabs) */}
      {isCustomView && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-[#f8fafd] text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {searchQuery.trim() ? (
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-[#1f1f1f] font-semibold truncate">
                  Search results for: <strong>"{searchQuery}"</strong>
                </span>
                <span className="text-slate-500 font-medium shrink-0">
                  ({filteredThreads.length} conversation{filteredThreads.length === 1 ? '' : 's'})
                </span>
              </div>
            ) : activeProjectObj ? (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: activeProjectObj.color }}
                />
                <span className="text-[#1f1f1f] font-bold truncate">
                  Project: {activeProjectObj.name}
                </span>
                <span className="text-slate-500 font-medium shrink-0">
                  ({filteredThreads.length} conversation{filteredThreads.length === 1 ? '' : 's'})
                </span>
              </div>
            ) : viewTitle ? (
              <div className="flex items-center gap-2 min-w-0">
                {viewFilter === 'spam' && <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />}
                <span className="text-[#1f1f1f] font-bold truncate">{viewTitle}</span>
                <span className="text-slate-500 font-medium shrink-0">
                  ({filteredThreads.length} conversation{filteredThreads.length === 1 ? '' : 's'})
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Clear search
              </button>
            ) : activeProjectObj ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedProjectId('all');
                  setSelectedInboxId('all');
                }}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Show all projects
              </button>
            ) : viewTitle && viewFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setViewFilter('all')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Back to Inbox
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

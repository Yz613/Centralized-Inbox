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
  Plus,
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
  onOpenNewProject,
  readingPaneMode = 'none',
  onToggleReadingPaneMode,
}) => {
  const {
    projects,
    inboxes,
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
  const isCustomView = Boolean(viewTitle || searchQuery.trim());

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

      {/* 2. Horizontal Project-by-Project View Bar */}
      <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-t border-slate-200/80 bg-[#fbfcfe] overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-bold text-[#5f6368] uppercase tracking-wider mr-1 shrink-0">
          Projects:
        </span>

        {/* All Projects Chip */}
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId('all');
            setSelectedInboxId('all');
            setSelectedThreadId(null);
          }}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
            selectedProjectId === 'all'
              ? 'bg-[#c2e7ff] text-[#001d35] font-bold border-blue-400 shadow-2xs'
              : 'bg-white text-[#444746] hover:text-[#1f1f1f] border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>All Projects</span>
        </button>

        {/* Each Project Label Chip */}
        {projects.map((proj) => {
          const isSelected = selectedProjectId === proj.id;
          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => {
                setSelectedProjectId(proj.id);
                setSelectedInboxId('all');
                setSelectedThreadId(null);
              }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 transition cursor-pointer border ${
                isSelected
                  ? 'border-2 shadow-2xs font-bold'
                  : 'bg-white text-[#444746] hover:text-[#1f1f1f] border-slate-300 hover:bg-slate-100'
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: `${proj.color}18`,
                      borderColor: proj.color,
                      color: proj.color,
                    }
                  : undefined
              }
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/10"
                style={{ backgroundColor: proj.color }}
              />
              <span className="truncate max-w-[150px]">{proj.name}</span>
            </button>
          );
        })}

        {onOpenNewProject && (
          <button
            type="button"
            onClick={onOpenNewProject}
            className="shrink-0 text-xs text-blue-700 font-bold hover:underline flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-blue-50 border border-transparent hover:border-blue-200 transition cursor-pointer"
            title="Create a new project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        )}
      </div>

      {/* 3. Active Project & Mailbox Scope Indicator Bar */}
      {selectedProjectId !== 'all' && activeProjectObj && (() => {
        const currentProjInboxes = inboxes.filter((i) => i.projectId === activeProjectObj.id);
        const singleInbox = selectedInboxId !== 'all' ? inboxes.find((i) => i.id === selectedInboxId) : null;

        return (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 bg-slate-50 border-t border-slate-200 text-xs">
            <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-2xs border border-black/10"
                style={{ backgroundColor: activeProjectObj.color }}
              />
              <span className="font-bold text-[#1f1f1f] shrink-0">{activeProjectObj.name}</span>

              {currentProjInboxes.length > 1 ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400">/</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInboxId('all');
                      setSelectedThreadId(null);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer shrink-0 ${
                      selectedInboxId === 'all'
                        ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    All ({currentProjInboxes.length})
                  </button>
                  {currentProjInboxes.map((ib) => {
                    const isIbSelected = selectedInboxId === ib.id;
                    return (
                      <button
                        key={ib.id}
                        type="button"
                        onClick={() => {
                          setSelectedInboxId(ib.id);
                          setSelectedThreadId(null);
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold truncate transition cursor-pointer shrink-0 ${
                          isIbSelected
                            ? 'bg-blue-100 text-blue-900 font-bold border border-blue-300'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title={ib.email}
                      >
                        <span className="truncate max-w-[140px]">{ib.email}</span>
                        {ib.channel && (
                          <span className="text-[9px] uppercase opacity-70">({ib.channel})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : singleInbox ? (
                <div className="flex items-center gap-1.5 min-w-0 truncate text-[11px]">
                  <span className="text-slate-400">/</span>
                  <span className="text-blue-900 font-semibold truncate bg-blue-100/70 px-2 py-0.5 rounded-md">
                    {singleInbox.email}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.2 rounded">
                    {singleInbox.channel}
                  </span>
                </div>
              ) : (
                <span className="text-emerald-900 font-semibold text-[11px] bg-emerald-100/80 px-2 py-0.5 rounded-md shrink-0">
                  Unified Feed ({currentProjInboxes.length} {currentProjInboxes.length === 1 ? 'inbox' : 'inboxes'})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {singleInbox ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInboxId('all');
                    setSelectedThreadId(null);
                  }}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                >
                  ← Show All {currentProjInboxes.length} Inboxes
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 hidden sm:inline font-medium">
                  {filteredThreads.length} conversation{filteredThreads.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {selectedProjectId === 'all' && selectedInboxId !== 'all' && (() => {
        const singleInbox = inboxes.find((i) => i.id === selectedInboxId);
        if (!singleInbox) return null;
        return (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 bg-slate-50 border-t border-slate-200 text-xs">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="font-bold text-[#1f1f1f]">Single Mailbox:</span>
              <span className="text-blue-900 font-semibold truncate bg-blue-100/70 px-2 py-0.5 rounded-md text-[11px]">
                {singleInbox.email}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.2 rounded">
                {singleInbox.channel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedInboxId('all');
                setSelectedThreadId(null);
              }}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline shrink-0 cursor-pointer"
            >
              Show All Mailboxes
            </button>
          </div>
        );
      })()}

      {/* 4. Authentic Gmail Category Tabs (Only shown in standard inbox mode) */}
      {!isCustomView && (
        <div className="flex items-center border-t border-slate-200 w-full overflow-x-auto no-scrollbar">
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
                className={`relative flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2.5 px-2 sm:px-5 h-10 sm:h-11 text-xs sm:text-sm font-semibold transition cursor-pointer border-b-[3px] -mb-[1px] min-w-0 ${
                  isActive
                    ? 'border-[#0b57d0] text-[#0b57d0] font-bold bg-blue-50/30 sm:bg-transparent'
                    : 'border-transparent text-[#5f6368] hover:text-[#1f1f1f] hover:bg-[#f1f3f4]'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isActive ? 'text-[#0b57d0]' : 'text-[#5f6368]'
                  }`}
                />
                <span className="tracking-tight truncate">{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.2 rounded-full font-bold shrink-0 ${
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

      {/* 5. Filter / Search Banner (When search query is active or viewing special folder) */}
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

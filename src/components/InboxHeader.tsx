import React from 'react';
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
  Plus,
  Columns2,
  Rows2,
  X,
} from 'lucide-react';
import { ViewFilter } from '../types';

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
    selectedThreadId,
    setSelectedThreadId,
    viewFilter,
    setViewFilter,
    filteredThreads,
    isSyncing,
    syncAllInboxes,
    toggleArchive,
    archiveThreads,
    markThreadRead,
    markThreadsRead,
    deleteThread,
    deleteThreads,
    starThreads,
    selectionMode,
    selectedThreadIds,
    setSelectionMode,
    replaceThreadSelection,
    clearThreadSelection,
    followUps,
    toggleFollowUpItem,
  } = useInbox();

  const viewTabs: { id: ViewFilter; label: string }[] = [
    { id: 'all', label: 'Primary' },
    ...(viewFilter === 'all_mail' ? [{ id: 'all_mail' as const, label: 'All mail' }] : []),
    { id: 'needs_reply', label: 'Needs You' },
    { id: 'unread', label: 'Unread' },
    { id: 'starred', label: 'Starred' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'snoozed', label: 'Snoozed' },
  ];

  const visibleIds = filteredThreads.map((thread) => thread.id);
  const selectedCount = selectedThreadIds.length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedThreadIds.includes(id));
  const selectedThreads = filteredThreads.filter((thread) => selectedThreadIds.includes(thread.id));
  const allSelectedRead = selectedThreads.length > 0 && selectedThreads.every((thread) => thread.isRead);
  const allSelectedStarred = selectedThreads.length > 0 && selectedThreads.every((thread) => thread.isStarred);

  const openFollowUps = followUps.filter(
    (f) =>
      !f.done &&
      (selectedProjectId === 'all' || f.projectId === 'all' || f.projectId === selectedProjectId)
  );

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2.5 space-y-2 select-none shrink-0">
      {/* 1. Gmail Toolbar: Checkbox, Refresh, Bulk Actions & Primary Tabs */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Standard Gmail List Toolbar Icons */}
        <div className="flex items-center gap-1 sm:gap-2 text-[#202124]">
          {!selectionMode ? (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="h-8 px-2.5 hover:bg-slate-100 rounded-lg text-slate-700 hover:text-black transition cursor-pointer flex items-center gap-1.5 border border-transparent hover:border-slate-300"
              title="Select multiple messages"
            >
              <Square className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold">Select</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (allVisibleSelected) {
                    replaceThreadSelection([]);
                  } else {
                    replaceThreadSelection(visibleIds);
                  }
                }}
                className="h-8 px-2.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 border border-blue-300 bg-blue-50 text-blue-800"
                title={allVisibleSelected ? 'Clear selected messages' : 'Select all visible messages'}
                aria-pressed={allVisibleSelected}
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-4 h-4" />
                ) : selectedCount > 0 ? (
                  <Minus className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span className="text-xs font-bold">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
                </span>
              </button>
              <button
                type="button"
                onClick={clearThreadSelection}
                className="h-8 px-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                title="Leave multi-select"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Done</span>
              </button>
            </>
          )}

          {/* Refresh / Sync */}
          <button
            type="button"
            onClick={() => syncAllInboxes()}
            disabled={isSyncing}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {selectionMode && selectedCount > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-300 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={() => archiveThreads(selectedThreadIds)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer"
                title="Archive selected"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteThreads(selectedThreadIds)}
                className="p-1.5 hover:bg-red-50 rounded-full text-slate-700 hover:text-red-600 transition cursor-pointer"
                title="Delete selected"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => markThreadsRead(selectedThreadIds, !allSelectedRead)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer"
                title={allSelectedRead ? 'Mark selected as unread' : 'Mark selected as read'}
              >
                {allSelectedRead ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => starThreads(selectedThreadIds, !allSelectedStarred)}
                className="p-1.5 hover:bg-amber-50 rounded-full text-slate-700 hover:text-amber-600 transition cursor-pointer"
                title={allSelectedStarred ? 'Unstar selected' : 'Star selected'}
              >
                <Star className={`w-4 h-4 ${allSelectedStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>
            </div>
          )}

          {!selectionMode && selectedThreadId && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-300 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={() => toggleArchive(selectedThreadId)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer"
                title="Archive (E)"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteThread(selectedThreadId)}
                className="p-1.5 hover:bg-red-50 rounded-full text-slate-700 hover:text-red-600 transition cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => markThreadRead(selectedThreadId, false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 hover:text-black transition cursor-pointer"
                title="Mark as unread (U)"
              >
                <Mail className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right: View Filter Tabs, Thread Count & Split Pane Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-200/90 p-0.5 rounded-full text-xs overflow-x-auto no-scrollbar border border-slate-300">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewFilter(tab.id)}
                className={`px-3 py-1 rounded-full whitespace-nowrap text-xs transition cursor-pointer ${
                  viewFilter === tab.id
                    ? 'bg-white text-[#001d35] font-bold shadow-xs border border-slate-200'
                    : 'text-[#202124] font-semibold hover:text-black hover:bg-slate-100/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-[#202124] font-bold pl-1 hidden sm:inline">
            {filteredThreads.length} msgs
          </span>

          {/* Reading Pane Mode Switcher (No split vs Split pane) */}
          {onToggleReadingPaneMode && (
            <button
              type="button"
              onClick={onToggleReadingPaneMode}
              className={`p-1.5 rounded-lg border transition cursor-pointer hidden md:flex items-center gap-1 text-xs ${
                readingPaneMode === 'split'
                  ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                  : 'text-[#202124] border-slate-300 hover:bg-slate-100 font-medium'
              }`}
              title={
                readingPaneMode === 'split'
                  ? 'Switch to Standard Gmail mode (Full width)'
                  : 'Switch to Split view mode (Reading pane on right)'
              }
            >
              {readingPaneMode === 'split' ? (
                <Columns2 className="w-4 h-4 text-blue-700" />
              ) : (
                <Rows2 className="w-4 h-4 text-[#202124]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Grouped By Projects: High-Contrast Gmail Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
        <span className="text-[11px] font-bold text-[#202124] uppercase tracking-wider mr-1 shrink-0">
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
          className={`shrink-0 px-3 py-1 rounded-full text-xs flex items-center gap-1.5 transition cursor-pointer border ${
            selectedProjectId === 'all'
              ? 'bg-[#c2e7ff] text-[#001d35] font-bold border-blue-400 shadow-2xs'
              : 'bg-white text-[#202124] font-semibold border-slate-300 hover:bg-slate-100'
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
              className={`shrink-0 px-3 py-1 rounded-full text-xs flex items-center gap-2 transition cursor-pointer border ${
                isSelected
                  ? 'border-2 shadow-2xs font-bold'
                  : 'bg-white text-[#202124] font-semibold border-slate-300 hover:bg-slate-100'
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: `${proj.color}20`,
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
            className="shrink-0 text-xs text-blue-700 font-bold hover:underline flex items-center gap-0.5 px-2 py-1 rounded-full hover:bg-blue-50 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        )}
      </div>

      {/* 3. Active Project & Mailbox Scope Indicator Bar */}
      {selectedProjectId !== 'all' && (() => {
        const currentProj = projects.find((p) => p.id === selectedProjectId);
        if (!currentProj) return null;
        const currentProjInboxes = inboxes.filter((i) => i.projectId === currentProj.id);
        const singleInbox = selectedInboxId !== 'all' ? inboxes.find((i) => i.id === selectedInboxId) : null;

        return (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/10"
                style={{ backgroundColor: currentProj.color }}
              />
              {singleInbox ? (
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="font-bold text-[#1f1f1f]">{currentProj.name}</span>
                  <span className="text-slate-400">/</span>
                  <span className="text-blue-900 font-semibold truncate bg-blue-100/70 px-2 py-0.5 rounded-md text-[11px]">
                    {singleInbox.email}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.2 rounded">
                    {singleInbox.channel}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-[#1f1f1f]">{currentProj.name}</span>
                  <span className="text-emerald-900 font-semibold text-[11px] bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    Unified Feed ({currentProjInboxes.length} {currentProjInboxes.length === 1 ? 'inbox' : 'inboxes'})
                  </span>
                </div>
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
                currentProjInboxes.length > 1 && (
                  <span className="text-[11px] text-slate-500 hidden sm:inline font-medium">
                    Showing combined emails
                  </span>
                )
              )}
            </div>
          </div>
        );
      })()}

      {selectedProjectId === 'all' && selectedInboxId !== 'all' && (() => {
        const singleInbox = inboxes.find((i) => i.id === selectedInboxId);
        if (!singleInbox) return null;
        return (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
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

      {/* Follow-up tasks row */}
      {openFollowUps.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 border-t border-slate-200">
          <span className="text-[11px] text-[#202124] shrink-0 font-bold">Reminders:</span>
          {openFollowUps.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleFollowUpItem(item.id)}
              className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:line-through transition cursor-pointer"
              title="Click to complete reminder"
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

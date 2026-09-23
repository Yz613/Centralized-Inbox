import React, { useState, useEffect, useCallback } from 'react';
import { InboxProvider, useInbox } from './context/InboxContext';
import { GmailTopBar } from './components/GmailTopBar';
import { Sidebar } from './components/Sidebar';
import { InboxHeader } from './components/InboxHeader';
import { ThreadList } from './components/ThreadList';
import { ThreadView } from './components/ThreadView';
import { NewMessageModal } from './components/NewMessageModal';
import { NewProjectModal } from './components/NewProjectModal';
import { AccountManagerModal } from './components/AccountManagerModal';
import { ProjectSummaryModal } from './components/ProjectSummaryModal';
import { EditProjectModal } from './components/EditProjectModal';
import { EditInboxModal } from './components/EditInboxModal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { UndoToast } from './components/UndoToast';
import { snoozeTonightIso } from './utils/operatorPrefs';

const MainLayout: React.FC = () => {
  const {
    selectedThreadId,
    setSelectedThreadId,
    selectAdjacentThread,
    toggleArchive,
    archiveThreads,
    markThreadRead,
    markThreadsRead,
    deleteThreads,
    requestReply,
    startForward,
    forwardPrefill,
    composePrefill,
    activeThread,
    selectionMode,
    selectedThreadIds,
    toggleThreadSelection,
    clearThreadSelection,
    toggleStar,
    starThreads,
    snoozeThreadUntil,
    filteredThreads,
  } = useInbox();

  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [accountManagerTab, setAccountManagerTab] = useState<'list' | 'add' | 'import_archive' | 'free_guide'>('list');
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Split pane mode (Sidebar + Feed List + Reader) is the preferred desktop layout
  const [readingPaneMode, setReadingPaneMode] = useState<'none' | 'split'>(() => {
    try {
      const saved = localStorage.getItem('inbox_reading_pane_mode_v2');
      if (saved === 'none' || saved === 'split') return saved;
      return 'split';
    } catch {
      return 'split';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('inbox_reading_pane_mode_v2', readingPaneMode);
    } catch {}
  }, [readingPaneMode]);

  // Panel sizing states with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('inbox_sidebar_width');
      return saved ? Math.max(180, Math.min(480, Number(saved))) : 256;
    } catch {
      return 256;
    }
  });

  const [feedWidth, setFeedWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('inbox_feed_width');
      return saved ? Math.max(280, Math.min(750, Number(saved))) : 430;
    } catch {
      return 430;
    }
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingFeed, setIsResizingFeed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      const currentSidebar = isSidebarCollapsed ? 0 : sidebarWidth;
      const maxFeed = Math.max(280, window.innerWidth - currentSidebar - 350);
      setFeedWidth((current) => Math.min(current, maxFeed));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarWidth, isSidebarCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      if (e.key === 'Escape' && isShortcutsModalOpen) {
        e.preventDefault();
        setIsShortcutsModalOpen(false);
        return;
      }

      if (e.key === 'Escape' && selectionMode && !isCommandPaletteOpen && !isNewMessageOpen) {
        e.preventDefault();
        clearThreadSelection();
        return;
      }

      // Close reading view on Escape!
      if (e.key === 'Escape' && selectedThreadId && !isCommandPaletteOpen && !isNewMessageOpen) {
        e.preventDefault();
        setSelectedThreadId(null);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
        return;
      }
      if (typing || isCommandPaletteOpen || isShortcutsModalOpen) return;

      const key = e.key.toLowerCase();

      // Help cheatsheet: ?
      if (e.key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
        return;
      }

      // Quick Search Focus: /
      if (key === '/' && !e.shiftKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="search"]') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Open email: Enter or o
      if ((key === 'enter' || key === 'o') && !selectedThreadId) {
        if (filteredThreads.length > 0) {
          e.preventDefault();
          setSelectedThreadId(filteredThreads[0].id);
          return;
        }
      }

      if (key === 'n' || key === 'c') {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        setIsNewMessageOpen(true);
        return;
      }
      if (key === 'j') {
        e.preventDefault();
        selectAdjacentThread(1);
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        selectAdjacentThread(-1);
        return;
      }
      if (key === 's') {
        if (selectionMode && selectedThreadIds.length > 0) {
          e.preventDefault();
          starThreads(selectedThreadIds, true);
          return;
        }
        if (selectedThreadId) {
          e.preventDefault();
          toggleStar(selectedThreadId);
          return;
        }
      }
      if (key === 'h' && selectedThreadId) {
        e.preventDefault();
        snoozeThreadUntil(selectedThreadId, snoozeTonightIso());
        return;
      }
      if (key === 'e') {
        if (selectionMode && selectedThreadIds.length > 0) {
          e.preventDefault();
          archiveThreads(selectedThreadIds);
          return;
        }
        if (selectedThreadId) {
          e.preventDefault();
          toggleArchive(selectedThreadId);
          return;
        }
      }
      if (key === 'u') {
        if (selectionMode && selectedThreadIds.length > 0) {
          e.preventDefault();
          markThreadsRead(selectedThreadIds, false);
          return;
        }
        if (selectedThreadId) {
          e.preventDefault();
          markThreadRead(selectedThreadId, false);
          setSelectedThreadId(null);
          return;
        }
      }
      if (key === '#' && selectionMode && selectedThreadIds.length > 0) {
        e.preventDefault();
        deleteThreads(selectedThreadIds);
        return;
      }
      if (key === 'r' && selectedThreadId) {
        e.preventDefault();
        requestReply();
        return;
      }
      if (key === 'f' && selectedThreadId) {
        e.preventDefault();
        startForward(selectedThreadId);
        setIsNewMessageOpen(true);
        return;
      }
      if (key === 'x' && selectedThreadId) {
        e.preventDefault();
        toggleThreadSelection(selectedThreadId);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isCommandPaletteOpen,
    isShortcutsModalOpen,
    isNewMessageOpen,
    selectedThreadId,
    activeThread,
    filteredThreads,
    selectAdjacentThread,
    toggleStar,
    starThreads,
    snoozeThreadUntil,
    toggleArchive,
    archiveThreads,
    markThreadRead,
    markThreadsRead,
    deleteThreads,
    requestReply,
    startForward,
    setSelectedThreadId,
    selectionMode,
    selectedThreadIds,
    toggleThreadSelection,
    clearThreadSelection,
  ]);

  useEffect(() => {
    if (forwardPrefill || composePrefill) setIsNewMessageOpen(true);
  }, [forwardPrefill, composePrefill]);

  useEffect(() => {
    try {
      localStorage.setItem('inbox_sidebar_width', String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('inbox_feed_width', String(feedWidth));
    } catch {
      // ignore
    }
  }, [feedWidth]);

  const startResizingSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startSidebarW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      // Allow sidebar to resize between 180 and 420px, ensuring plenty of space for main content
      const maxSidebarW = Math.max(180, Math.min(420, window.innerWidth - 500));
      const newSidebarW = Math.max(180, Math.min(maxSidebarW, startSidebarW + dx));
      setSidebarWidth(newSidebarW);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setIsResizingSidebar(true);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  const startResizingFeed = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = feedWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      // Ensure feed list stays between 280px and available content width minus 350px for reader
      const currentSidebar = isSidebarCollapsed ? 0 : sidebarWidth;
      const maxFeedW = Math.max(280, window.innerWidth - currentSidebar - 350);
      const newWidth = Math.max(280, Math.min(maxFeedW, startW + dx));
      setFeedWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizingFeed(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setIsResizingFeed(true);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [feedWidth, isSidebarCollapsed, sidebarWidth]);

  const handleOpenAccountManager = (tab: 'list' | 'add' | 'import_archive' | 'free_guide' = 'list') => {
    setAccountManagerTab(tab);
    setIsAccountManagerOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-full overflow-hidden bg-[#f6f8fc] font-sans text-[#1f1f1f]">
      {/* 1. Authentic Full-Width Gmail Header (Hidden on mobile when thread is selected so message goes straight to the top) */}
      <div className={selectedThreadId ? 'hidden md:block' : 'block'}>
        <GmailTopBar
          onToggleSidebar={() => {
            if (!isDesktop) {
              setIsMobileSidebarOpen(true);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}
          onOpenNewMessage={() => setIsNewMessageOpen(true)}
          onOpenAiSummary={() => setIsAiSummaryOpen(true)}
          onOpenAccountManager={handleOpenAccountManager}
          onOpenNewProject={() => setIsNewProjectOpen(true)}
        />
      </div>

      {/* 2. Main Workspace Body (Sidebar + White Rounded Content Canvas) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative z-50 w-72 h-full flex flex-col p-2 bg-[#f6f8fc] shadow-2xl">
              <Sidebar
                onOpenNewProject={() => {
                  setIsNewProjectOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenAccountManager={(tab) => {
                  handleOpenAccountManager(tab);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenImportArchive={() => {
                  handleOpenAccountManager('import_archive');
                  setIsMobileSidebarOpen(false);
                }}
                onOpenNewMessage={() => {
                  setIsNewMessageOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                onNavigate={() => setIsMobileSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Desktop Sidebar (Left Navigation Drawer) */}
        {!isSidebarCollapsed && (
          <div
            className="hidden md:flex flex-col h-full shrink-0"
            style={{ width: `${sidebarWidth}px` }}
          >
            <Sidebar
              onOpenNewProject={() => setIsNewProjectOpen(true)}
              onOpenAccountManager={handleOpenAccountManager}
              onOpenImportArchive={() => handleOpenAccountManager('import_archive')}
              onOpenNewMessage={() => setIsNewMessageOpen(true)}
            />
          </div>
        )}

        {/* Drag handle between Sidebar & Main Content */}
        {!isSidebarCollapsed && (
          <div
            onMouseDown={startResizingSidebar}
            onDoubleClick={() => {
              setSidebarWidth(256);
              setFeedWidth(430);
            }}
            className={`hidden md:flex w-2.5 -mx-0.5 z-20 cursor-col-resize items-center justify-center group shrink-0 transition-colors select-none ${
              isResizingSidebar ? 'bg-blue-500/10' : ''
            }`}
            title="Drag to resize sidebar & feed (double-click to reset)"
          >
            <div
              className={`w-1 h-10 rounded-full transition-all ${
                isResizingSidebar
                  ? 'bg-blue-600 scale-y-125'
                  : 'bg-transparent group-hover:bg-slate-400/60 group-hover:scale-y-125'
              }`}
            />
          </div>
        )}

        {/* Main Content Area: Pure Light Mode Gmail Rounded Container */}
        <div className="flex-1 flex overflow-hidden min-w-0 md:pr-3 md:pb-3">
          <div className="flex-1 flex h-full bg-white rounded-none md:rounded-2xl lg:rounded-3xl border-0 md:border md:border-slate-200 shadow-none md:shadow-xs overflow-hidden">
            {readingPaneMode === 'none' ? (
              /* Full Width Mode */
              !selectedThreadId ? (
                <div className="flex flex-col h-full w-full bg-white overflow-hidden">
                  <InboxHeader
                    onOpenNewMessage={() => setIsNewMessageOpen(true)}
                    onOpenAiSummary={() => setIsAiSummaryOpen(true)}
                    onOpenAccountManager={handleOpenAccountManager}
                    onOpenNewProject={() => setIsNewProjectOpen(true)}
                    readingPaneMode={readingPaneMode}
                    onToggleReadingPaneMode={() => setReadingPaneMode('split')}
                  />
                  <ThreadList
                    onOpenNewProject={() => setIsNewProjectOpen(true)}
                    readingPaneMode={readingPaneMode}
                  />
                </div>
              ) : (
                <div className="flex flex-col h-full w-full bg-white overflow-hidden animate-in fade-in duration-75">
                  <ThreadView
                    onBackMobile={() => setSelectedThreadId(null)}
                    readingPaneMode={readingPaneMode}
                    onToggleReadingPaneMode={() => setReadingPaneMode('split')}
                  />
                </div>
              )
            ) : (
              /* Split View Mode: 3-pane layout on desktop (Feed List + Reading Pane) */
              <>
                <div
                  style={isDesktop ? { width: `${feedWidth}px` } : undefined}
                  className={`flex flex-col h-full bg-white border-r border-slate-200 overflow-hidden shrink-0 ${
                    selectedThreadId ? 'hidden lg:flex' : 'flex w-full lg:w-auto'
                  }`}
                >
                  <InboxHeader
                    onOpenNewMessage={() => setIsNewMessageOpen(true)}
                    onOpenAiSummary={() => setIsAiSummaryOpen(true)}
                    onOpenAccountManager={handleOpenAccountManager}
                    onOpenNewProject={() => setIsNewProjectOpen(true)}
                    readingPaneMode={readingPaneMode}
                    onToggleReadingPaneMode={() => setReadingPaneMode('none')}
                  />
                  <ThreadList
                    onOpenNewProject={() => setIsNewProjectOpen(true)}
                    readingPaneMode={readingPaneMode}
                  />
                </div>

                <div
                  onMouseDown={startResizingFeed}
                  onDoubleClick={() => setFeedWidth(420)}
                  className={`hidden lg:flex w-2.5 -mx-0.5 z-20 cursor-col-resize items-center justify-center group shrink-0 transition-colors select-none ${
                    isResizingFeed ? 'bg-blue-500/10' : ''
                  }`}
                  title="Drag to resize feed list & reader (double-click to reset)"
                >
                  <div
                    className={`w-1 h-10 rounded-full transition-all ${
                      isResizingFeed
                        ? 'bg-blue-600 scale-y-125'
                        : 'bg-transparent group-hover:bg-slate-400/60 group-hover:scale-y-125'
                    }`}
                  />
                </div>

                <div
                  className={`flex-1 h-full min-w-0 bg-white overflow-hidden ${
                    selectedThreadId ? 'flex' : 'hidden lg:flex'
                  }`}
                >
                  <ThreadView
                    onBackMobile={() => setSelectedThreadId(null)}
                    readingPaneMode={readingPaneMode}
                    onToggleReadingPaneMode={() => setReadingPaneMode('none')}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Gmail Floating Compose Button (FAB) */}
      {!selectedThreadId && (
        <button
          type="button"
          onClick={() => setIsNewMessageOpen(true)}
          className="md:hidden fixed right-4 bottom-5 z-40 h-14 px-5 rounded-2xl bg-[#c2e7ff] text-[#001d35] hover:bg-[#b3ddfc] shadow-lg hover:shadow-xl flex items-center gap-3 font-bold text-sm tracking-tight transition active:scale-95 cursor-pointer border border-blue-200/60"
          title="Compose new message"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
          <span>Compose</span>
        </button>
      )}

      {/* Modals */}
      <NewMessageModal
        isOpen={isNewMessageOpen}
        onClose={() => setIsNewMessageOpen(false)}
      />
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
      />
      <AccountManagerModal
        isOpen={isAccountManagerOpen}
        onClose={() => setIsAccountManagerOpen(false)}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        initialTab={accountManagerTab}
      />
      <ProjectSummaryModal
        isOpen={isAiSummaryOpen}
        onClose={() => setIsAiSummaryOpen(false)}
      />
      <EditProjectModal />
      <EditInboxModal />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewMessage={() => setIsNewMessageOpen(true)}
        onOpenAccountManager={() => handleOpenAccountManager('list')}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
      <UndoToast />
    </div>
  );
};

export default function App() {
  return (
    <InboxProvider>
      <MainLayout />
    </InboxProvider>
  );
}

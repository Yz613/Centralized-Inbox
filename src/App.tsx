import React, { useState, useEffect, useCallback } from 'react';
import { InboxProvider, useInbox } from './context/InboxContext';
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
import { UndoToast } from './components/UndoToast';
import { Menu, LogOut } from 'lucide-react';
import { handleLogout } from './utils/logout';

const MainLayout: React.FC = () => {
  const {
    selectedThreadId,
    setSelectedThreadId,
    selectAdjacentThread,
    toggleArchive,
    markThreadRead,
    requestReply,
    startForward,
    forwardPrefill,
    activeThread,
  } = useInbox();

  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [accountManagerTab, setAccountManagerTab] = useState<'list' | 'add' | 'import_archive' | 'free_guide'>('list');
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Panel sizing states with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('inbox_sidebar_width');
      return saved ? Math.max(200, Math.min(480, Number(saved))) : 260;
    } catch {
      return 260;
    }
  });

  const [feedWidth, setFeedWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('inbox_feed_width');
      return saved ? Math.max(300, Math.min(750, Number(saved))) : 410;
    } catch {
      return 410;
    }
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingFeed, setIsResizingFeed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
        return;
      }
      if (typing || isCommandPaletteOpen) return;
      const key = e.key.toLowerCase();
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
      if (key === 'e' && selectedThreadId) {
        e.preventDefault();
        toggleArchive(selectedThreadId);
        return;
      }
      if (key === 'u' && selectedThreadId && activeThread) {
        e.preventDefault();
        markThreadRead(selectedThreadId, false);
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isCommandPaletteOpen,
    selectedThreadId,
    activeThread,
    selectAdjacentThread,
    toggleArchive,
    markThreadRead,
    requestReply,
    startForward,
  ]);

  useEffect(() => {
    if (forwardPrefill) setIsNewMessageOpen(true);
  }, [forwardPrefill]);

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
    const startW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(480, startW + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
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
      const newWidth = Math.max(300, Math.min(750, startW + (moveEvent.clientX - startX)));
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
  }, [feedWidth]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f6f8fc] dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 p-2 md:p-3 gap-1 md:gap-1.5">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-50 w-72 h-full flex flex-col p-2">
            <Sidebar
              onOpenNewProject={() => {
                setIsNewProjectOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenAccountManager={() => {
                setAccountManagerTab('list');
                setIsAccountManagerOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenImportArchive={() => {
                setAccountManagerTab('import_archive');
                setIsAccountManagerOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenNewMessage={() => {
                setIsNewMessageOpen(true);
                setIsMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Desktop Sidebar (Left Panel) */}
      <div
        className="hidden lg:flex flex-col h-full shrink-0"
        style={{ width: `${sidebarWidth}px` }}
      >
        <Sidebar
          onOpenNewProject={() => setIsNewProjectOpen(true)}
          onOpenAccountManager={() => {
            setAccountManagerTab('list');
            setIsAccountManagerOpen(true);
          }}
          onOpenImportArchive={() => {
            setAccountManagerTab('import_archive');
            setIsAccountManagerOpen(true);
          }}
          onOpenNewMessage={() => setIsNewMessageOpen(true)}
        />
      </div>

      {/* Drag handle between Sidebar & Main Content */}
      <div
        onMouseDown={startResizingSidebar}
        onDoubleClick={() => setSidebarWidth(260)}
        className={`hidden lg:flex w-2.5 -mx-0.5 z-20 cursor-col-resize items-center justify-center group shrink-0 transition-colors select-none ${
          isResizingSidebar ? 'bg-blue-500/10' : ''
        }`}
        title="Drag to resize sidebar (double-click to reset)"
      >
        <div
          className={`w-1 h-10 rounded-full transition-all ${
            isResizingSidebar
              ? 'bg-blue-600 scale-y-125'
              : 'bg-slate-300/80 dark:bg-slate-700/80 group-hover:bg-blue-500 group-hover:scale-y-125'
          }`}
        />
      </div>

      {/* Main Content Area: Middle Feed Panel & Right Detail Panel */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center justify-between p-2.5 mb-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">ProjectInbox Unified</span>
          <a
            href="/logout"
            onClick={handleLogout}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition cursor-pointer"
            title="Log out of ProjectInbox"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">Log out</span>
          </a>
        </div>

        {/* 2-Pane Inbox: Middle Feed Card & Right Detail Card */}
        <div className="flex-1 flex h-full gap-1 md:gap-1.5 overflow-hidden">
          {/* Middle Feed Panel: InboxHeader + ThreadList in a distinct rounded-2xl card */}
          <div
            style={isDesktop ? { width: `${feedWidth}px` } : undefined}
            className={`w-full md:w-auto flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden shrink-0 ${
              selectedThreadId ? 'hidden md:flex' : 'flex'
            }`}
          >
            <InboxHeader
              onOpenNewMessage={() => setIsNewMessageOpen(true)}
              onOpenAiSummary={() => setIsAiSummaryOpen(true)}
              onOpenAccountManager={() => setIsAccountManagerOpen(true)}
              onOpenNewProject={() => setIsNewProjectOpen(true)}
            />
            <ThreadList onOpenNewProject={() => setIsNewProjectOpen(true)} />
          </div>

          {/* Drag handle between Feed & ThreadView */}
          <div
            onMouseDown={startResizingFeed}
            onDoubleClick={() => setFeedWidth(410)}
            className={`hidden md:flex w-2.5 -mx-0.5 z-20 cursor-col-resize items-center justify-center group shrink-0 transition-colors select-none ${
              isResizingFeed ? 'bg-blue-500/10' : ''
            }`}
            title="Drag to resize feed list (double-click to reset)"
          >
            <div
              className={`w-1 h-10 rounded-full transition-all ${
                isResizingFeed
                  ? 'bg-blue-600 scale-y-125'
                  : 'bg-slate-300/80 dark:bg-slate-700/80 group-hover:bg-blue-500 group-hover:scale-y-125'
              }`}
            />
          </div>

          {/* Right Detail/Reply Panel: ThreadView in a distinct rounded-2xl card */}
          <div
            className={`flex-1 h-full min-w-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden ${
              selectedThreadId ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ThreadView onBackMobile={() => setSelectedThreadId(null)} />
          </div>
        </div>
      </div>

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
        onOpenAccountManager={() => {
          setAccountManagerTab('list');
          setIsAccountManagerOpen(true);
        }}
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

import React, { useState } from 'react';
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
import { Menu, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { selectedThreadId, setSelectedThreadId } = useInbox();

  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f6f8fc] dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 p-2 md:p-3 gap-2.5 md:gap-3">
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
      <div className="hidden lg:flex flex-col h-full shrink-0">
        <Sidebar
          onOpenNewProject={() => setIsNewProjectOpen(true)}
          onOpenAccountManager={() => setIsAccountManagerOpen(true)}
          onOpenNewMessage={() => setIsNewMessageOpen(true)}
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
          <div className="w-6" />
        </div>

        {/* 2-Pane Inbox: Middle Feed Card & Right Detail Card */}
        <div className="flex-1 flex h-full gap-2.5 md:gap-3 overflow-hidden">
          {/* Middle Feed Panel: InboxHeader + ThreadList in a distinct rounded-2xl card */}
          <div
            className={`w-full md:w-96 lg:w-[420px] flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden shrink-0 ${
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
      />
      <ProjectSummaryModal
        isOpen={isAiSummaryOpen}
        onClose={() => setIsAiSummaryOpen(false)}
      />
      <EditProjectModal />
      <EditInboxModal />
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

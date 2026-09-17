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
import { Menu, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { selectedThreadId, setSelectedThreadId } = useInbox();

  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-50 w-72 h-full flex flex-col">
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

      {/* Desktop Sidebar (Left Column) */}
      <div className="hidden lg:flex flex-col h-full shrink-0">
        <Sidebar
          onOpenNewProject={() => setIsNewProjectOpen(true)}
          onOpenAccountManager={() => setIsAccountManagerOpen(true)}
          onOpenNewMessage={() => setIsNewMessageOpen(true)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center justify-between p-3 bg-slate-900 text-white border-b border-slate-800">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-1.5 hover:bg-slate-800 rounded-md text-slate-300"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm">ProjectInbox Unified</span>
          <div className="w-5" />
        </div>

        {/* 2-Pane Inbox: Middle Feed Column & Right Detail/Reply Column */}
        <div className="flex-1 flex h-full overflow-hidden">
          {/* Middle Feed Column: InboxHeader + ThreadList */}
          <div
            className={`w-full md:w-96 lg:w-[420px] flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 ${
              selectedThreadId ? 'hidden md:flex' : 'flex'
            }`}
          >
            <InboxHeader
              onOpenNewMessage={() => setIsNewMessageOpen(true)}
              onOpenAiSummary={() => setIsAiSummaryOpen(true)}
              onOpenAccountManager={() => setIsAccountManagerOpen(true)}
            />
            <ThreadList />
          </div>

          {/* Right Detail/Reply Column: ThreadView + ReplyComposer */}
          <div
            className={`flex-1 h-full min-w-0 ${
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
      />
      <ProjectSummaryModal
        isOpen={isAiSummaryOpen}
        onClose={() => setIsAiSummaryOpen(false)}
      />
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

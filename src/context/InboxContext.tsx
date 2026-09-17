import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Project, InboxAccount, Thread, Message, ViewFilter, InboxRole, ChannelType } from '../types';
import { INITIAL_PROJECTS, INITIAL_INBOXES, INITIAL_THREADS } from '../data/initialData';

interface InboxContextType {
  projects: Project[];
  inboxes: InboxAccount[];
  threads: Thread[];
  selectedProjectId: string | 'all';
  selectedInboxId: string | 'all';
  selectedRole: InboxRole | 'all';
  selectedThreadId: string | null;
  viewFilter: ViewFilter;
  searchQuery: string;
  isSyncing: boolean;
  lastSyncTime: string;

  // Actions
  setSelectedProjectId: (id: string | 'all') => void;
  setSelectedInboxId: (id: string | 'all') => void;
  setSelectedRole: (role: InboxRole | 'all') => void;
  setSelectedThreadId: (id: string | null) => void;
  setViewFilter: (filter: ViewFilter) => void;
  setSearchQuery: (query: string) => void;
  
  markThreadRead: (threadId: string, isRead: boolean) => void;
  toggleStar: (threadId: string) => void;
  toggleArchive: (threadId: string) => void;
  deleteThread: (threadId: string) => void;

  sendReply: (
    threadId: string,
    reply: {
      text: string;
      fromInboxId: string;
      subject?: string;
      attachments?: { name: string; size: string; type: string }[];
    }
  ) => void;

  sendNewMessage: (params: {
    projectId: string;
    fromInboxId: string;
    toAddress: string;
    toName?: string;
    subject: string;
    body: string;
    channel: ChannelType;
  }) => void;

  addProject: (data: { name: string; description: string; color: string }) => Project;
  addInbox: (data: {
    name: string;
    email: string;
    channel: ChannelType;
    role: InboxRole;
    projectId: string;
    serverHost?: string;
  }) => InboxAccount;
  removeInbox: (inboxId: string) => void;
  syncAllInboxes: () => Promise<void>;
  simulateIncomingMessage: (targetInboxId?: string) => void;

  // Derived state
  activeProject: Project | null;
  activeThread: Thread | null;
  projectInboxes: InboxAccount[];
  filteredThreads: Thread[];
  totalUnreadCount: number;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PROJECTS: 'projectinbox_projects_v2',
  INBOXES: 'projectinbox_inboxes_v2',
  THREADS: 'projectinbox_threads_v2',
};

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return stored ? JSON.parse(stored) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  });

  const [inboxes, setInboxes] = useState<InboxAccount[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.INBOXES);
      return stored ? JSON.parse(stored) : INITIAL_INBOXES;
    } catch {
      return INITIAL_INBOXES;
    }
  });

  const [threads, setThreads] = useState<Thread[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THREADS);
      return stored ? JSON.parse(stored) : INITIAL_THREADS;
    } catch {
      return INITIAL_THREADS;
    }
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('proj-apex');
  const [selectedInboxId, setSelectedInboxId] = useState<string | 'all'>('all');
  const [selectedRole, setSelectedRole] = useState<InboxRole | 'all'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>('thread-apex-1');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Just now');

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch (e) {
      console.error('Storage error', e);
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.INBOXES, JSON.stringify(inboxes));
    } catch (e) {
      console.error('Storage error', e);
    }
  }, [inboxes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
    } catch (e) {
      console.error('Storage error', e);
    }
  }, [threads]);

  // When project changes, reset inbox filter and pick first thread
  const handleSelectProject = useCallback((projId: string | 'all') => {
    setSelectedProjectId(projId);
    setSelectedInboxId('all');
    setSelectedRole('all');
  }, []);

  const activeProject = useMemo(() => {
    if (selectedProjectId === 'all') return null;
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  const projectInboxes = useMemo(() => {
    if (selectedProjectId === 'all') return inboxes;
    return inboxes.filter((i) => i.projectId === selectedProjectId);
  }, [inboxes, selectedProjectId]);

  const activeThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return threads.find((t) => t.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  // Filtered and Chronologically Ordered Threads
  const filteredThreads = useMemo(() => {
    return threads
      .filter((t) => {
        // Project filter
        if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) {
          return false;
        }
        // Specific inbox filter
        if (selectedInboxId !== 'all' && t.inboxId !== selectedInboxId) {
          return false;
        }
        // Role filter
        if (selectedRole !== 'all' && t.inboxRole !== selectedRole) {
          return false;
        }
        // View filter (all, unread, starred, archived)
        if (viewFilter === 'unread' && t.isRead) return false;
        if (viewFilter === 'starred' && !t.isStarred) return false;
        if (viewFilter === 'archived' && !t.isArchived) return false;
        if (viewFilter !== 'archived' && t.isArchived) return false;

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchSubject = t.subject.toLowerCase().includes(q);
          const matchSnippet = t.snippet.toLowerCase().includes(q);
          const matchParticipant = t.participants.some(
            (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
          );
          const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
          if (!matchSubject && !matchSnippet && !matchParticipant && !matchTags) {
            return false;
          }
        }
        return true;
      })
      // Order strictly chronologically: latest message first
      .sort(
        (a, b) =>
          new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
      );
  }, [threads, selectedProjectId, selectedInboxId, selectedRole, viewFilter, searchQuery]);

  // Automatically select the first thread if activeThread is not in filtered list
  useEffect(() => {
    if (filteredThreads.length > 0) {
      const exists = filteredThreads.some((t) => t.id === selectedThreadId);
      if (!exists) {
        setSelectedThreadId(filteredThreads[0].id);
      }
    } else {
      setSelectedThreadId(null);
    }
  }, [filteredThreads, selectedThreadId]);

  const totalUnreadCount = useMemo(() => {
    return threads.filter((t) => !t.isRead && !t.isArchived).length;
  }, [threads]);

  // Thread Actions
  const markThreadRead = useCallback((threadId: string, isRead: boolean) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          return { ...t, isRead };
        }
        return t;
      })
    );
  }, []);

  const toggleStar = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          return { ...t, isStarred: !t.isStarred };
        }
        return t;
      })
    );
  }, []);

  const toggleArchive = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          return { ...t, isArchived: !t.isArchived };
        }
        return t;
      })
    );
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setSelectedThreadId((curr) => (curr === threadId ? null : curr));
  }, []);

  // Send reply from a specific inbox!
  const sendReply = useCallback(
    (
      threadId: string,
      reply: {
        text: string;
        fromInboxId: string;
        subject?: string;
        attachments?: { name: string; size: string; type: string }[];
      }
    ) => {
      const targetInbox = inboxes.find((i) => i.id === reply.fromInboxId);
      const timestamp = new Date().toISOString();

      setThreads((prev) =>
        prev.map((t) => {
          if (t.id === threadId) {
            const senderInbox = targetInbox || inboxes.find((i) => i.id === t.inboxId);
            const outgoingMsg: Message = {
              id: `msg-out-${Date.now()}`,
              threadId: t.id,
              inboxId: senderInbox?.id || t.inboxId,
              projectId: t.projectId,
              channel: senderInbox?.channel || t.channel,
              inboxRole: senderInbox?.role || t.inboxRole,
              from: {
                name: senderInbox?.name || 'You',
                address: senderInbox?.email || 'me',
              },
              to: t.participants.filter((p) => p.address !== senderInbox?.email),
              subject: reply.subject || `Re: ${t.subject}`,
              bodyText: reply.text,
              timestamp,
              isOutgoing: true,
              attachments: reply.attachments,
            };

            return {
              ...t,
              messages: [...t.messages, outgoingMsg],
              snippet: `You: ${reply.text.slice(0, 80)}...`,
              lastMessageTimestamp: timestamp,
              messageCount: t.messageCount + 1,
              isRead: true, // Marked read upon reply
            };
          }
          return t;
        })
      );
    },
    [inboxes]
  );

  // Send a completely new message from any project inbox
  const sendNewMessage = useCallback(
    (params: {
      projectId: string;
      fromInboxId: string;
      toAddress: string;
      toName?: string;
      subject: string;
      body: string;
      channel: ChannelType;
    }) => {
      const targetInbox = inboxes.find((i) => i.id === params.fromInboxId);
      const timestamp = new Date().toISOString();
      const threadId = `thread-${Date.now()}`;

      const newMsg: Message = {
        id: `msg-${Date.now()}`,
        threadId,
        inboxId: params.fromInboxId,
        projectId: params.projectId,
        channel: params.channel,
        inboxRole: targetInbox?.role || 'general',
        from: {
          name: targetInbox?.name || 'You',
          address: targetInbox?.email || 'me',
        },
        to: [{ name: params.toName || params.toAddress, address: params.toAddress }],
        subject: params.subject,
        bodyText: params.body,
        timestamp,
        isOutgoing: true,
      };

      const newThread: Thread = {
        id: threadId,
        projectId: params.projectId,
        inboxId: params.fromInboxId,
        channel: params.channel,
        inboxRole: targetInbox?.role || 'general',
        subject: params.subject,
        snippet: `You: ${params.body.slice(0, 80)}...`,
        participants: [
          { name: targetInbox?.name || 'You', address: targetInbox?.email || 'me' },
          { name: params.toName || params.toAddress, address: params.toAddress },
        ],
        lastMessageTimestamp: timestamp,
        messageCount: 1,
        isRead: true,
        isStarred: false,
        isArchived: false,
        tags: [params.channel.toUpperCase()],
        messages: [newMsg],
      };

      setThreads((prev) => [newThread, ...prev]);
      setSelectedProjectId(params.projectId);
      setSelectedThreadId(threadId);
    },
    [inboxes]
  );

  // Add a new Project
  const addProject = useCallback(
    (data: { name: string; description: string; color: string }): Project => {
      const newProj: Project = {
        id: `proj-${Date.now()}`,
        name: data.name,
        description: data.description,
        color: data.color,
        accentColor: '#E2E8F0',
        inboxIds: [],
        createdAt: new Date().toISOString(),
      };
      setProjects((prev) => [...prev, newProj]);
      setSelectedProjectId(newProj.id);
      return newProj;
    },
    []
  );

  // Add a new Inbox to a project
  const addInbox = useCallback(
    (data: {
      name: string;
      email: string;
      channel: ChannelType;
      role: InboxRole;
      projectId: string;
      serverHost?: string;
    }): InboxAccount => {
      const badgeColors: Record<ChannelType, string> = {
        gmail: '#EF4444',
        zoho: '#F59E0B',
        whatsapp: '#10B981',
        instagram: '#EC4899',
        facebook: '#3B82F6',
        custom_imap: '#6B7280',
      };

      const newInbox: InboxAccount = {
        id: `inbox-${Date.now()}`,
        name: data.name,
        email: data.email,
        channel: data.channel,
        role: data.role,
        projectId: data.projectId,
        badgeColor: badgeColors[data.channel] || '#4B5563',
        unreadCount: 0,
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
        serverHost: data.serverHost,
      };

      setInboxes((prev) => [...prev, newInbox]);

      // Link inbox to project
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === data.projectId) {
            return {
              ...p,
              inboxIds: [...p.inboxIds, newInbox.id],
            };
          }
          return p;
        })
      );

      return newInbox;
    },
    []
  );

  const removeInbox = useCallback((inboxId: string) => {
    setInboxes((prev) => prev.filter((i) => i.id !== inboxId));
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        inboxIds: p.inboxIds.filter((id) => id !== inboxId),
      }))
    );
  }, []);

  // Sync inboxes
  const syncAllInboxes = useCallback(async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSyncing(false);
    setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setInboxes((prev) =>
      prev.map((i) => ({
        ...i,
        lastSyncedAt: new Date().toISOString(),
        status: 'connected',
      }))
    );
  }, []);

  // Simulate an incoming email or chat to test live chronological ordering & origin badge
  const simulateIncomingMessage = useCallback(
    (targetInboxId?: string) => {
      const inbox =
        (targetInboxId ? inboxes.find((i) => i.id === targetInboxId) : null) ||
        projectInboxes[0] ||
        inboxes[0];

      if (!inbox) return;

      const timestamp = new Date().toISOString();
      const randomSeed = Math.floor(Math.random() * 1000);

      const simulationPool = [
        {
          senderName: 'David K. (Enterprise Systems)',
          senderAddress: 'david.k@enterprise-cloud.net',
          subject: `Invoice & Service Level Confirmation #${randomSeed}`,
          body: `Hi there,\n\nWe received the updated SLA terms for our enterprise account. Could you please send over the countersigned statement of work so we can process payment before the end of the quarter?\n\nDelivered to your ${inbox.role} desk (${inbox.email}).\n\nThanks,\nDavid`,
          tag: 'Contract',
        },
        {
          senderName: 'Clara Chen (Product QA)',
          senderAddress: 'clara.c@techlead.io',
          subject: `Feedback on staging integration branch [${inbox.channel.toUpperCase()}]`,
          body: `Hello,\n\nI just finished testing the webhook listener for ${inbox.name}. Everything returned HTTP 200 with sub-50ms latency. Great job on the patch!\n\nBest,\nClara`,
          tag: 'Deployment',
        },
        {
          senderName: 'Alex Morgan',
          senderAddress: 'alex.m@clientconnect.org',
          subject: `Quick sync question regarding project timeline`,
          body: `Hey,\n\nAre you available for a 10-minute briefing tomorrow afternoon regarding next milestone deliverables? Let me know what time works best.\n\nWarm regards,\nAlex`,
          tag: 'Meeting',
        },
      ];

      const chosen = simulationPool[Math.floor(Math.random() * simulationPool.length)];
      const newThreadId = `sim-thread-${Date.now()}`;

      const newMsg: Message = {
        id: `sim-msg-${Date.now()}`,
        threadId: newThreadId,
        inboxId: inbox.id,
        projectId: inbox.projectId,
        channel: inbox.channel,
        inboxRole: inbox.role,
        from: {
          name: chosen.senderName,
          address: chosen.senderAddress,
          avatar: chosen.senderName.slice(0, 2).toUpperCase(),
        },
        to: [{ name: inbox.name, address: inbox.email }],
        subject: chosen.subject,
        bodyText: chosen.body,
        timestamp,
        isOutgoing: false,
      };

      const newThread: Thread = {
        id: newThreadId,
        projectId: inbox.projectId,
        inboxId: inbox.id,
        channel: inbox.channel,
        inboxRole: inbox.role,
        subject: chosen.subject,
        snippet: chosen.body.replace(/\n/g, ' ').slice(0, 95) + '...',
        participants: [
          {
            name: chosen.senderName,
            address: chosen.senderAddress,
            avatar: chosen.senderName.slice(0, 2).toUpperCase(),
          },
          { name: inbox.name, address: inbox.email },
        ],
        lastMessageTimestamp: timestamp,
        messageCount: 1,
        isRead: false,
        isStarred: false,
        isArchived: false,
        tags: [chosen.tag, inbox.channel.toUpperCase()],
        messages: [newMsg],
      };

      setThreads((prev) => [newThread, ...prev]);
      setSelectedProjectId(inbox.projectId);
      setSelectedThreadId(newThreadId);
    },
    [inboxes, projectInboxes]
  );

  return (
    <InboxContext.Provider
      value={{
        projects,
        inboxes,
        threads,
        selectedProjectId,
        selectedInboxId,
        selectedRole,
        selectedThreadId,
        viewFilter,
        searchQuery,
        isSyncing,
        lastSyncTime,
        setSelectedProjectId: handleSelectProject,
        setSelectedInboxId,
        setSelectedRole,
        setSelectedThreadId,
        setViewFilter,
        setSearchQuery,
        markThreadRead,
        toggleStar,
        toggleArchive,
        deleteThread,
        sendReply,
        sendNewMessage,
        addProject,
        addInbox,
        removeInbox,
        syncAllInboxes,
        simulateIncomingMessage,
        activeProject,
        activeThread,
        projectInboxes,
        filteredThreads,
        totalUnreadCount,
      }}
    >
      {children}
    </InboxContext.Provider>
  );
};

export const useInbox = () => {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error('useInbox must be used within an InboxProvider');
  }
  return context;
};

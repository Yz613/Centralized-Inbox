import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Project, InboxAccount, Thread, Message, ViewFilter, InboxRole, ChannelType } from '../types';
import { INITIAL_PROJECTS, INITIAL_INBOXES, INITIAL_THREADS } from '../data/initialData';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getCurrentUser,
  getAccessToken,
} from '../services/googleAuth';
import { fetchLiveGmailThreads, sendGmailEmail } from '../services/gmailApi';
import { User } from 'firebase/auth';

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

  // Google Live Provider Connection
  googleUser: { email: string; displayName?: string; photoURL?: string } | null;
  isGoogleConnected: boolean;
  isGoogleConnecting: boolean;
  connectGoogleAccount: () => Promise<{ email: string } | null>;
  disconnectGoogleAccount: () => Promise<void>;

  // Zoho Webhook Endpoint
  zohoWebhookUrl: string;

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
  ) => Promise<{ success: boolean; error?: string }>;

  sendNewMessage: (params: {
    projectId: string;
    fromInboxId: string;
    toAddress: string;
    toName?: string;
    subject: string;
    body: string;
    channel: ChannelType;
  }) => Promise<{ success: boolean; threadId?: string; error?: string }>;

  addProject: (data: { name: string; description: string; color: string }) => Project;
  addInbox: (data: {
    name: string;
    email: string;
    channel: ChannelType;
    role: InboxRole;
    projectId: string;
    serverHost?: string;
    isLiveConnected?: boolean;
    zohoAppPassword?: string;
    zohoMethod?: 'forwarding' | 'smtp' | 'oauth';
    zohoWebhookUrl?: string;
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

  // Google Auth state
  const [googleUser, setGoogleUser] = useState<{
    email: string;
    displayName?: string;
    photoURL?: string;
  } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);

  // Zoho Webhook URL
  const zohoWebhookUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/inbox/zoho/webhook`;
    }
    return '/api/inbox/zoho/webhook';
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user: User, token: string) => {
        if (user.email && token) {
          setGoogleUser({
            email: user.email,
            displayName: user.displayName || undefined,
            photoURL: user.photoURL || undefined,
          });
          setIsGoogleConnected(true);
        }
      },
      () => {
        setGoogleUser(null);
        setIsGoogleConnected(false);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

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

  // Connect Google Account via Firebase Auth
  const connectGoogleAccount = useCallback(async () => {
    setIsGoogleConnecting(true);
    try {
      const res = await googleSignIn();
      if (!res?.user?.email) return null;

      const userEmail = res.user.email;
      const gUser = {
        email: userEmail,
        displayName: res.user.displayName || undefined,
        photoURL: res.user.photoURL || undefined,
      };

      setGoogleUser(gUser);
      setIsGoogleConnected(true);

      // Check if a Gmail inbox already exists for this email
      let targetInbox = inboxes.find(
        (i) => i.channel === 'gmail' && i.email.toLowerCase() === userEmail.toLowerCase()
      );

      const targetProject = activeProject || projects[0];

      if (!targetInbox && targetProject) {
        const newInbox: InboxAccount = {
          id: `inbox-gmail-${Date.now()}`,
          name: res.user.displayName || 'Google Workspace',
          email: userEmail,
          channel: 'gmail',
          role: 'general',
          projectId: targetProject.id,
          badgeColor: '#EF4444',
          unreadCount: 0,
          status: 'connected',
          lastSyncedAt: new Date().toISOString(),
          isLiveConnected: true,
        };

        setInboxes((prev) => [newInbox, ...prev]);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === targetProject.id ? { ...p, inboxIds: [...p.inboxIds, newInbox.id] } : p
          )
        );
        targetInbox = newInbox;
      } else if (targetInbox) {
        setInboxes((prev) =>
          prev.map((i) =>
            i.id === targetInbox?.id
              ? { ...i, status: 'connected', isLiveConnected: true, lastSyncedAt: new Date().toISOString() }
              : i
          )
        );
      }

      // Automatically sync live messages
      if (targetInbox && targetProject) {
        try {
          const liveThreads = await fetchLiveGmailThreads({
            projectId: targetProject.id,
            inboxId: targetInbox.id,
            userEmail,
            inboxRole: targetInbox.role,
            maxCount: 15,
          });

          if (liveThreads.length > 0) {
            setThreads((prev) => {
              const liveIds = new Set(liveThreads.map((t) => t.id));
              const nonLive = prev.filter((t) => !liveIds.has(t.id));
              return [...liveThreads, ...nonLive];
            });
            setSelectedThreadId(liveThreads[0].id);
          }
        } catch (syncErr) {
          console.error('Initial Gmail sync error:', syncErr);
        }
      }

      return { email: userEmail };
    } catch (err) {
      console.error('Failed to sign in with Google:', err);
      throw err;
    } finally {
      setIsGoogleConnecting(false);
    }
  }, [inboxes, projects, activeProject]);

  const disconnectGoogleAccount = useCallback(async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setIsGoogleConnected(false);
  }, []);

  // Sync inboxes (including live Gmail and inbound Zoho webhook buffer)
  const syncAllInboxes = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. If Google is connected, fetch live Gmail messages
      if (isGoogleConnected && googleUser?.email) {
        const gmailInboxes = inboxes.filter((i) => i.channel === 'gmail');
        for (const gInbox of gmailInboxes) {
          try {
            const liveThreads = await fetchLiveGmailThreads({
              projectId: gInbox.projectId,
              inboxId: gInbox.id,
              userEmail: googleUser.email,
              inboxRole: gInbox.role,
              maxCount: 15,
            });

            if (liveThreads.length > 0) {
              setThreads((prev) => {
                const liveIds = new Set(liveThreads.map((t) => t.id));
                const nonLive = prev.filter((t) => !liveIds.has(t.id));
                return [...liveThreads, ...nonLive];
              });
            }
          } catch (gErr) {
            console.error(`Failed to sync live Gmail inbox (${gInbox.email}):`, gErr);
          }
        }
      }

      // 2. Fetch inbound Zoho webhook messages from server
      try {
        const zohoRes = await fetch(`/api/inbox/zoho/inbound?projectId=${selectedProjectId}`);
        if (zohoRes.ok) {
          const zohoData = await zohoRes.json();
          const inboundMsgs = zohoData.messages || [];
          if (inboundMsgs.length > 0) {
            setThreads((prev) => {
              const existingThreadIds = new Set(prev.map((t) => t.id));
              const newZohoThreads: Thread[] = [];

              for (const zMsg of inboundMsgs) {
                const threadId = `zoho-thread-${zMsg.id}`;
                if (!existingThreadIds.has(threadId)) {
                  const targetInbox =
                    inboxes.find(
                      (i) =>
                        i.channel === 'zoho' &&
                        (selectedProjectId === 'all' || i.projectId === selectedProjectId)
                    ) ||
                    inboxes.find((i) => i.channel === 'zoho') ||
                    inboxes[0];

                  newZohoThreads.push({
                    id: threadId,
                    projectId: zMsg.projectId || targetInbox?.projectId || 'proj-apex',
                    inboxId: targetInbox?.id || 'inbox-zoho-1',
                    channel: 'zoho',
                    inboxRole: (zMsg.role as InboxRole) || targetInbox?.role || 'support',
                    subject: zMsg.subject,
                    snippet: zMsg.bodyText.replace(/\n/g, ' ').slice(0, 95),
                    participants: [
                      { name: zMsg.from.name, address: zMsg.from.address },
                      { name: targetInbox?.name || 'Zoho Desk', address: targetInbox?.email || 'support@zoho.com' },
                    ],
                    lastMessageTimestamp: zMsg.receivedAt,
                    messageCount: 1,
                    isRead: false,
                    isStarred: false,
                    isArchived: false,
                    tags: ['ZOHO', 'INBOUND_WEBHOOK'],
                    messages: [
                      {
                        id: `msg-${zMsg.id}`,
                        threadId,
                        inboxId: targetInbox?.id || 'inbox-zoho-1',
                        projectId: zMsg.projectId || targetInbox?.projectId || 'proj-apex',
                        channel: 'zoho',
                        inboxRole: (zMsg.role as InboxRole) || targetInbox?.role || 'support',
                        from: zMsg.from,
                        to: zMsg.to,
                        subject: zMsg.subject,
                        bodyText: zMsg.bodyText,
                        timestamp: zMsg.receivedAt,
                        isOutgoing: false,
                      },
                    ],
                  });
                }
              }

              return [...newZohoThreads, ...prev];
            });
          }
        }
      } catch (zErr) {
        console.error('Failed to sync Zoho webhook buffer:', zErr);
      }

      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setInboxes((prev) =>
        prev.map((i) => ({
          ...i,
          lastSyncedAt: new Date().toISOString(),
          status: 'connected',
        }))
      );
    } finally {
      setIsSyncing(false);
    }
  }, [inboxes, isGoogleConnected, googleUser, selectedProjectId]);

  // Send reply from a specific inbox (with real Gmail API and Zoho SMTP support)
  const sendReply = useCallback(
    async (
      threadId: string,
      reply: {
        text: string;
        fromInboxId: string;
        subject?: string;
        attachments?: { name: string; size: string; type: string }[];
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const targetInbox = inboxes.find((i) => i.id === reply.fromInboxId);
      const timestamp = new Date().toISOString();
      const currentThread = threads.find((t) => t.id === threadId);

      const recipient = currentThread?.participants.find(
        (p) => p.address !== targetInbox?.email
      )?.address || currentThread?.participants[0]?.address || 'recipient@example.com';

      const subjectToSend = reply.subject || `Re: ${currentThread?.subject || ''}`;

      // 1. If sending from Live Google Gmail
      if (targetInbox?.channel === 'gmail' && isGoogleConnected) {
        try {
          await sendGmailEmail({
            toAddress: recipient,
            subject: subjectToSend,
            bodyText: reply.text,
            fromEmail: targetInbox.email,
            threadId: threadId.startsWith('gmail-thread-') ? threadId : undefined,
          });
        } catch (gErr: any) {
          console.error('Failed to dispatch via Gmail API:', gErr);
          return { success: false, error: gErr?.message || 'Failed to send via Gmail API' };
        }
      }

      // 2. If sending from Zoho with configured SMTP App Password
      if (targetInbox?.channel === 'zoho' && targetInbox.zohoAppPassword) {
        try {
          const smtpRes = await fetch('/api/inbox/zoho/send-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: targetInbox.email,
              appPassword: targetInbox.zohoAppPassword,
              to: recipient,
              subject: subjectToSend,
              body: reply.text,
            }),
          });
          const smtpData = await smtpRes.json();
          if (!smtpData.success) {
            return { success: false, error: smtpData.message || 'Zoho SMTP dispatch failed' };
          }
        } catch (zErr: any) {
          console.error('Zoho SMTP dispatch error:', zErr);
          return { success: false, error: zErr?.message || 'Zoho SMTP error' };
        }
      }

      // Append message locally to thread state
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
              subject: subjectToSend,
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
              isRead: true,
            };
          }
          return t;
        })
      );

      return { success: true };
    },
    [inboxes, threads, isGoogleConnected]
  );

  // Send a completely new message from any project inbox
  const sendNewMessage = useCallback(
    async (params: {
      projectId: string;
      fromInboxId: string;
      toAddress: string;
      toName?: string;
      subject: string;
      body: string;
      channel: ChannelType;
    }): Promise<{ success: boolean; threadId?: string; error?: string }> => {
      const targetInbox = inboxes.find((i) => i.id === params.fromInboxId);
      const timestamp = new Date().toISOString();
      const threadId = `thread-${Date.now()}`;

      // 1. Live Google Gmail dispatch
      if (params.channel === 'gmail' && isGoogleConnected) {
        try {
          await sendGmailEmail({
            toAddress: params.toAddress,
            subject: params.subject,
            bodyText: params.body,
            fromEmail: targetInbox?.email,
          });
        } catch (gErr: any) {
          console.error('Gmail API new message send failed:', gErr);
          return { success: false, error: gErr?.message || 'Failed to send message via Gmail API' };
        }
      }

      // 2. Live Zoho SMTP dispatch
      if (params.channel === 'zoho' && targetInbox?.zohoAppPassword) {
        try {
          const smtpRes = await fetch('/api/inbox/zoho/send-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: targetInbox.email,
              appPassword: targetInbox.zohoAppPassword,
              to: params.toAddress,
              subject: params.subject,
              body: params.body,
            }),
          });
          const smtpData = await smtpRes.json();
          if (!smtpData.success) {
            return { success: false, error: smtpData.message || 'Zoho SMTP dispatch failed' };
          }
        } catch (zErr: any) {
          console.error('Zoho SMTP dispatch failed:', zErr);
          return { success: false, error: zErr?.message || 'Zoho SMTP error' };
        }
      }

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

      return { success: true, threadId };
    },
    [inboxes, isGoogleConnected]
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
      isLiveConnected?: boolean;
      zohoAppPassword?: string;
      zohoMethod?: 'forwarding' | 'smtp' | 'oauth';
      zohoWebhookUrl?: string;
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
        isLiveConnected: data.isLiveConnected ?? (data.channel === 'gmail' ? isGoogleConnected : false),
        zohoAppPassword: data.zohoAppPassword,
        zohoMethod: data.zohoMethod,
        zohoWebhookUrl: data.zohoWebhookUrl,
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
    [isGoogleConnected]
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

  // Simulate an incoming email or chat
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
        googleUser,
        isGoogleConnected,
        isGoogleConnecting,
        connectGoogleAccount,
        disconnectGoogleAccount,
        zohoWebhookUrl,
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

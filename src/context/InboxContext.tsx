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
import { fetchLiveMailboxThreads, sendLiveMailMessage, persistMessageToD1 } from '../services/mailApi';
import { User } from 'firebase/auth';

import { handleLogout } from '../utils/logout';

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

  addProject: (data: { name: string; description: string; color: string; category?: string }) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  editingProject: Project | null;
  setEditingProject: (project: Project | null) => void;
  editingInbox: InboxAccount | null;
  setEditingInbox: (inbox: InboxAccount | null) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => Promise<void>;
  addInbox: (data: {
    name: string;
    email: string;
    channel: ChannelType;
    role: InboxRole;
    projectId: string;
    serverHost?: string;
    isLiveConnected?: boolean;
    appPassword?: string;
    imapHost?: string;
    imapPort?: number;
    smtpHost?: string;
    smtpPort?: number;
    authType?: 'app_password' | 'oauth';
    zohoRegion?: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn';
    zohoAppPassword?: string;
    zohoMethod?: 'forwarding' | 'smtp' | 'oauth';
    zohoWebhookUrl?: string;
  }) => InboxAccount;
  updateInbox: (inboxId: string, updates: Partial<InboxAccount>) => void;
  removeInbox: (inboxId: string) => void;
  syncAllInboxes: () => Promise<void>;
  simulateIncomingMessage: (targetInboxId?: string) => void;
  importBatchThreads: (
    newThreads: Thread[],
    onBatchProgress?: (saved: number, total: number) => void
  ) => Promise<{ success: boolean; error?: string }>;
  logout: (e?: React.MouseEvent) => void;

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

  // Editing modals state
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingInbox, setEditingInbox] = useState<InboxAccount | null>(null);

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

  // Initial load from Cloudflare D1 Database
  useEffect(() => {
    let isMounted = true;
    async function loadFromD1() {
      try {
        const [projRes, inboxRes, threadRes] = await Promise.all([
          fetch('/api/projects').catch(() => null),
          fetch('/api/inboxes').catch(() => null),
          fetch('/api/threads').catch(() => null),
        ]);

        if (projRes && projRes.ok) {
          const pData = await projRes.json();
          if (Array.isArray(pData.projects) && isMounted) {
            setProjects(pData.projects);
            try {
              localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(pData.projects));
            } catch {}
          }
        }

        if (inboxRes && inboxRes.ok) {
          const iData = await inboxRes.json();
          if (Array.isArray(iData.inboxes) && isMounted) {
            setInboxes(iData.inboxes);
            try {
              localStorage.setItem(STORAGE_KEYS.INBOXES, JSON.stringify(iData.inboxes));
            } catch {}
          }
        }

        if (threadRes && threadRes.ok) {
          const tData = await threadRes.json();
          if (Array.isArray(tData.threads) && isMounted) {
            setThreads(tData.threads);
            try {
              localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(tData.threads));
            } catch {}
          }
        }
      } catch (err) {
        console.warn('D1 initial sync note: using cached state', err);
      }
    }

    loadFromD1();
    return () => {
      isMounted = false;
    };
  }, []);

  // Periodic background check for newly received emails (Cloudflare Email Routing)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const threadRes = await fetch('/api/threads').catch(() => null);
        if (threadRes && threadRes.ok) {
          const tData = await threadRes.json();
          if (Array.isArray(tData.threads) && tData.threads.length > 0) {
            setThreads(tData.threads);
          }
        }
      } catch {}
    }, 25000);
    return () => clearInterval(interval);
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

  // Thread Actions with D1 Edge Sync
  const markThreadRead = useCallback((threadId: string, isRead: boolean) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          return { ...t, isRead };
        }
        return t;
      })
    );
    fetch(`/api/threads/${threadId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead }),
    }).catch(() => {});
  }, []);

  const toggleStar = useCallback((threadId: string) => {
    let nextStarred = false;
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          nextStarred = !t.isStarred;
          return { ...t, isStarred: nextStarred };
        }
        return t;
      })
    );
    fetch(`/api/threads/${threadId}/star`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: nextStarred }),
    }).catch(() => {});
  }, []);

  const toggleArchive = useCallback((threadId: string) => {
    let nextArchived = false;
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          nextArchived = !t.isArchived;
          return { ...t, isArchived: nextArchived };
        }
        return t;
      })
    );
    fetch(`/api/threads/${threadId}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: nextArchived }),
    }).catch(() => {});
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setSelectedThreadId((curr) => (curr === threadId ? null : curr));
    fetch(`/api/threads/${threadId}`, { method: 'DELETE' }).catch(() => {});
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

  // Sync inboxes (including live IMAP for Zoho/Gmail, live Gmail OAuth, and webhook buffer)
  const syncAllInboxes = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. Fetch live IMAP emails for any configured Zoho, Gmail (App Password), or IMAP inboxes
      const imapInboxes = inboxes.filter((i) => Boolean(i.appPassword || i.zohoAppPassword));
      for (const inbox of imapInboxes) {
        const pwd = inbox.appPassword || inbox.zohoAppPassword;
        if (!pwd) continue;

        const isZoho = inbox.channel === 'zoho' || inbox.email.toLowerCase().includes('zoho');
        const defaultImap = isZoho ? 'imap.zoho.com' : 'imap.gmail.com';
        const imapHost = inbox.imapHost || defaultImap;
        const imapPort = inbox.imapPort || 993;

        try {
          const liveThreads = await fetchLiveMailboxThreads({
            email: inbox.email,
            appPassword: pwd,
            imapHost,
            imapPort,
            projectId: inbox.projectId,
            inboxId: inbox.id,
            role: inbox.role,
            channel: inbox.channel,
            limit: 25,
          });

          if (liveThreads.length > 0) {
            setThreads((prev) => {
              const liveIds = new Set(liveThreads.map((t) => t.id));
              const nonLive = prev.filter((t) => !liveIds.has(t.id));
              return [...liveThreads, ...nonLive];
            });
          }

          setInboxes((prev) =>
            prev.map((i) =>
              i.id === inbox.id
                ? {
                    ...i,
                    status: 'connected',
                    isLiveConnected: true,
                    lastSyncedAt: new Date().toISOString(),
                    errorDetail: undefined,
                  }
                : i
            )
          );
        } catch (err: any) {
          console.error(`IMAP sync error for ${inbox.email}:`, err);
          setInboxes((prev) =>
            prev.map((i) =>
              i.id === inbox.id
                ? {
                    ...i,
                    status: 'error',
                    errorDetail: err?.message || 'Failed to sync via IMAP',
                  }
                : i
            )
          );
        }
      }

      // 2. If Google OAuth is connected, fetch live Gmail messages via REST API (for OAuth accounts)
      if (isGoogleConnected && googleUser?.email) {
        const oauthGmailInboxes = inboxes.filter(
          (i) => i.channel === 'gmail' && !i.appPassword && !i.zohoAppPassword
        );
        for (const gInbox of oauthGmailInboxes) {
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

      // 3. Fallback: Fetch inbound Zoho webhook messages from server
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
        }))
      );
    } finally {
      setIsSyncing(false);
    }
  }, [inboxes, isGoogleConnected, googleUser, selectedProjectId]);

  // Send reply from a specific inbox (supports live SMTP and live Gmail API)
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
      const latestMessage = currentThread?.messages[currentThread.messages.length - 1];

      const pwd = targetInbox?.appPassword || targetInbox?.zohoAppPassword;

      // 1. Live SMTP Dispatch (Zoho or Gmail with App Password or custom SMTP)
      if (pwd) {
        try {
          const isZoho = targetInbox?.channel === 'zoho' || targetInbox?.email.toLowerCase().includes('zoho');
          const defaultSmtp = isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com';
          const smtpHost = targetInbox?.smtpHost || defaultSmtp;
          const smtpPort = targetInbox?.smtpPort || 465;

          await sendLiveMailMessage({
            email: targetInbox!.email,
            appPassword: pwd,
            smtpHost,
            smtpPort,
            to: recipient,
            subject: subjectToSend,
            body: reply.text,
            inReplyTo: latestMessage?.messageId || undefined,
            references: latestMessage?.references || (latestMessage?.messageId ? [latestMessage.messageId] : undefined),
            threadId,
            inboxId: targetInbox?.id,
            projectId: currentThread?.projectId || (selectedProjectId === 'all' ? undefined : selectedProjectId),
            senderName: targetInbox?.name,
          });
        } catch (smtpErr: any) {
          console.error('Failed to dispatch via live SMTP:', smtpErr);
          return { success: false, error: smtpErr?.message || 'Failed to send email via SMTP' };
        }
      }
      // 2. Live Google Gmail API Dispatch (via OAuth)
      else if (targetInbox?.channel === 'gmail' && isGoogleConnected) {
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

      const senderInbox = targetInbox || inboxes.find((i) => i.id === currentThread?.inboxId);
      const outgoingMsg: Message = {
        id: `msg-out-${Date.now()}`,
        threadId: threadId,
        inboxId: senderInbox?.id || currentThread?.inboxId || 'inbox-default',
        projectId: currentThread?.projectId || (selectedProjectId === 'all' ? 'proj-default' : selectedProjectId),
        channel: senderInbox?.channel || currentThread?.channel || 'cloudflare',
        inboxRole: senderInbox?.role || currentThread?.inboxRole || 'general',
        from: {
          name: senderInbox?.name || 'You',
          address: senderInbox?.email || 'me',
        },
        to: currentThread ? currentThread.participants.filter((p: any) => p.address !== senderInbox?.email) : [],
        subject: subjectToSend,
        bodyText: reply.text,
        timestamp,
        isOutgoing: true,
        attachments: reply.attachments,
      };

      // Ensure persisted into Cloudflare D1
      persistMessageToD1(outgoingMsg);

      // Append message locally to thread state
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id === threadId) {
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
      const pwd = targetInbox?.appPassword || targetInbox?.zohoAppPassword;

      // 1. Live SMTP Dispatch (Zoho or Gmail with App Password)
      if (pwd) {
        try {
          const isZoho = targetInbox?.channel === 'zoho' || targetInbox?.email.toLowerCase().includes('zoho');
          const defaultSmtp = isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com';
          const smtpHost = targetInbox?.smtpHost || defaultSmtp;
          const smtpPort = targetInbox?.smtpPort || 465;

          await sendLiveMailMessage({
            email: targetInbox!.email,
            appPassword: pwd,
            smtpHost,
            smtpPort,
            to: params.toAddress,
            subject: params.subject,
            body: params.body,
            threadId,
            inboxId: params.fromInboxId,
            projectId: params.projectId,
            senderName: targetInbox?.name,
          });
        } catch (smtpErr: any) {
          console.error('Failed to send outbound email via live SMTP:', smtpErr);
          return { success: false, error: smtpErr?.message || 'Failed to dispatch via SMTP' };
        }
      }
      // 2. Live Google Gmail API Dispatch (via OAuth)
      else if (params.channel === 'gmail' && isGoogleConnected) {
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

      // Ensure persisted into Cloudflare D1
      persistMessageToD1(newMsg);

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

  // Add a new Project with D1 persistence
  const addProject = useCallback(
    (data: { name: string; description: string; color: string; category?: string }): Project => {
      const newProj: Project = {
        id: `proj-${Date.now()}`,
        name: data.name,
        description: data.description,
        color: data.color,
        accentColor: '#E2E8F0',
        category: data.category,
        inboxIds: [],
        createdAt: new Date().toISOString(),
      };
      setProjects((prev) => {
        const next = [...prev, newProj];
        try {
          localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
        } catch {}
        return next;
      });
      setSelectedProjectId(newProj.id);
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProj),
      }).catch((err) => console.warn('D1 project save error:', err));
      return newProj;
    },
    []
  );

  // Update an existing project (custom name, description, color) with D1 persistence
  const updateProject = useCallback(
    async (projectId: string, updates: Partial<Project>) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === projectId) {
            const updated = { ...p, ...updates };
            fetch(`/api/projects/${projectId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            }).catch((err) => console.warn('D1 project update error:', err));
            return updated;
          }
          return p;
        })
      );
    },
    []
  );

  // Delete an existing project and cascade its inboxes and threads
  const deleteProject = useCallback(
    async (projectId: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setInboxes((prev) => prev.filter((i) => i.projectId !== projectId));
      setThreads((prev) => prev.filter((t) => t.projectId !== projectId));
      setSelectedProjectId((curr) => (curr === projectId ? 'all' : curr));
      setSelectedThreadId((curr) => {
        return null;
      });

      fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      }).catch((err) => console.warn('D1 project delete error:', err));
    },
    []
  );

  // Add a new Inbox to a project with D1 persistence
  const addInbox = useCallback(
    (data: {
      name: string;
      email: string;
      channel: ChannelType;
      role: InboxRole;
      projectId: string;
      serverHost?: string;
      isLiveConnected?: boolean;
      appPassword?: string;
      imapHost?: string;
      imapPort?: number;
      smtpHost?: string;
      smtpPort?: number;
      authType?: 'app_password' | 'oauth';
      zohoRegion?: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn';
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

      const hasPassword = Boolean(data.appPassword || data.zohoAppPassword);

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
        isLiveConnected: data.isLiveConnected ?? (hasPassword || (data.channel === 'gmail' && isGoogleConnected)),
        appPassword: data.appPassword || data.zohoAppPassword,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        authType: data.authType || (hasPassword ? 'app_password' : 'oauth'),
        zohoRegion: data.zohoRegion,
        zohoAppPassword: data.zohoAppPassword || data.appPassword,
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

      // Save inbox to Cloudflare D1
      fetch('/api/inboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInbox),
      }).catch((err) => console.warn('D1 inbox save error:', err));

      // If credentials provided, trigger initial background sync for this inbox
      if (hasPassword) {
        const isZoho = data.channel === 'zoho' || data.email.toLowerCase().includes('zoho');
        const defaultImap = isZoho ? 'imap.zoho.com' : 'imap.gmail.com';
        fetchLiveMailboxThreads({
          email: data.email,
          appPassword: data.appPassword || data.zohoAppPassword,
          imapHost: data.imapHost || defaultImap,
          imapPort: data.imapPort || 993,
          projectId: data.projectId,
          inboxId: newInbox.id,
          role: data.role,
          channel: data.channel,
          limit: 25,
        })
          .then((threads) => {
            if (threads.length > 0) {
              setThreads((prev) => {
                const liveIds = new Set(threads.map((t) => t.id));
                const nonLive = prev.filter((t) => !liveIds.has(t.id));
                return [...threads, ...nonLive];
              });
              setSelectedThreadId(threads[0].id);
            }
          })
          .catch((err) => console.warn('Initial inbox sync error:', err));
      }

      return newInbox;
    },
    [isGoogleConnected]
  );

  const updateInbox = useCallback((inboxId: string, updates: Partial<InboxAccount>) => {
    setInboxes((prev) =>
      prev.map((i) => {
        if (i.id === inboxId) {
          const updated = { ...i, ...updates };
          fetch(`/api/inboxes/${inboxId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          }).catch(() => {
            fetch('/api/inboxes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updated),
            }).catch(() => {});
          });
          return updated;
        }
        return i;
      })
    );

    // If projectId changed, sync project.inboxIds
    if (updates.projectId) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === updates.projectId && !p.inboxIds.includes(inboxId)) {
            return { ...p, inboxIds: [...p.inboxIds, inboxId] };
          }
          if (p.id !== updates.projectId && p.inboxIds.includes(inboxId)) {
            return { ...p, inboxIds: p.inboxIds.filter((id) => id !== inboxId) };
          }
          return p;
        })
      );
    }
  }, []);

  const removeInbox = useCallback((inboxId: string) => {
    setInboxes((prev) => prev.filter((i) => i.id !== inboxId));
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        inboxIds: p.inboxIds.filter((id) => id !== inboxId),
      }))
    );
    fetch(`/api/inboxes/${inboxId}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  // Update thread (custom subject/title, tags)
  const updateThread = useCallback(async (threadId: string, updates: Partial<Thread>) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          const updated = { ...t, ...updates };
          fetch(`/api/threads/${threadId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          }).catch((err) => console.warn('D1 thread update error:', err));
          return updated;
        }
        return t;
      })
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

  // Ingest batch imported threads and messages with immediate state update and D1 persistence
  const importBatchThreads = useCallback(
    async (
      newThreads: Thread[],
      onBatchProgress?: (saved: number, total: number) => void
    ): Promise<{ success: boolean; error?: string }> => {
      if (!newThreads || newThreads.length === 0) {
        return { success: true };
      }

      // 1. Immediately update state and localStorage so imported emails appear in UI right away
      setThreads((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const uniqueNew = newThreads.filter((t) => !existingIds.has(t.id));
        const merged = [...uniqueNew, ...prev];
        try {
          localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(merged));
        } catch {}
        return merged;
      });

      // 2. Persist to Cloudflare D1 in batches of 20
      const BATCH_SIZE = 20;
      let saved = 0;
      const total = newThreads.length;

      try {
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const chunk = newThreads.slice(i, i + BATCH_SIZE);
          await fetch('/api/import/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threads: chunk }),
          });

          saved += chunk.length;
          if (onBatchProgress) {
            onBatchProgress(Math.min(saved, total), total);
          }
        }
        return { success: true };
      } catch (err: any) {
        console.warn('Batch import persistence error:', err);
        return { success: false, error: err?.message || 'Failed to save batch to database' };
      }
    },
    []
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
        updateProject,
        deleteProject,
        editingProject,
        setEditingProject,
        editingInbox,
        setEditingInbox,
        updateThread,
        addInbox,
        updateInbox,
        removeInbox,
        syncAllInboxes,
        simulateIncomingMessage,
        importBatchThreads,
        logout: handleLogout,
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

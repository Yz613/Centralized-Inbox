import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Project, InboxAccount, Thread, Message, ViewFilter, InboxRole, ChannelType, InboxStream } from '../types';
import { classifyThreadStream } from '../utils/streamClassification';
import { getSpamStatus } from '../utils/spam';
import { getLatestEligibleThread } from '../utils/latestEmail';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getCurrentUser,
  getAccessToken,
} from '../services/googleAuth';
import { fetchLiveGmailThreads, sendGmailEmail, gmailRelayBody, listGmailSendAs } from '../services/gmailApi';
import { fetchLiveMailboxThreads, sendLiveMailMessage, persistMessageToD1, fetchStableStoredThreads, saveGmailPage } from '../services/mailApi';
import { User } from 'firebase/auth';

import { handleLogout } from '../utils/logout';
import { mergeThreadLists, threadInMailbox, collapseCrossInboxDuplicates, crossInboxMemberIds, deduplicateMessages } from '../utils/mergeThreads';
import { Contact, extractContacts, saveContactsToStorage } from '../utils/contacts';
import {
  addFollowUps as persistFollowUps,
  SAMPLE_PROJECT_IDS,
  clearSnooze,
  formatOutboundBody,
  getFollowUps,
  getSnoozeUntil as readSnoozeUntil,
  isThreadSnoozed,
  lastMessageOutgoing,
  notificationsOptedIn,
  setNotificationsOptedIn,
  snoozeFor,
  snoozeUntil,
  toggleFollowUp as persistToggleFollowUp,
  getInboxSignatures,
  setInboxSignature,
  FollowUp,
} from '../utils/operatorPrefs';
import { disablePhoneAlerts, enablePhoneAlerts, phoneAlertFailure, phoneAlertStatusHint, preparePhoneAlerts, reportPushFailure, showForegroundNotification } from '../utils/webPushClient';
import { resolveReplyInbox } from '../utils/replyMentions';

interface InboxContextType {
  projects: Project[];
  inboxes: InboxAccount[];
  threads: Thread[];
  selectedProjectId: string | 'all';
  selectedInboxId: string | 'all';
  selectedRole: InboxRole | 'all';
  selectedThreadId: string | null;
  viewFilter: ViewFilter;
  activeStream: InboxStream;
  setActiveStream: (stream: InboxStream) => void;
  setThreadStream: (threadId: string, stream: 'primary' | 'feed' | 'paper_trail') => Promise<void>;
  streamCounts: { primary: number; feed: number; paper_trail: number };
  searchQuery: string;
  isSyncing: boolean;
  lastSyncTime: string;
  syncError: string | null;

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
  selectMailbox: (id: string | 'all') => void;
  setSelectedRole: (role: InboxRole | 'all') => void;
  setSelectedThreadId: (id: string | null | ((curr: string | null) => string | null)) => void;
  setViewFilter: (filter: ViewFilter) => void;
  setSearchQuery: (query: string) => void;

  markThreadRead: (threadId: string, isRead: boolean) => void;
  markThreadsRead: (threadIds: string[], isRead: boolean) => void;
  toggleStar: (threadId: string) => void;
  starThreads: (threadIds: string[], isStarred: boolean) => void;
  toggleArchive: (threadId: string) => void;
  archiveThreads: (threadIds: string[]) => void;
  deleteThread: (threadId: string) => void;
  deleteThreads: (threadIds: string[]) => void;
  selectionMode: boolean;
  selectedThreadIds: string[];
  setSelectionMode: (on: boolean) => void;
  toggleThreadSelection: (threadId: string) => void;
  replaceThreadSelection: (threadIds: string[]) => void;
  clearThreadSelection: () => void;
  undoToast: { label: string } | null;
  undoLastAction: () => void;

  sendReply: (
    threadId: string,
    reply: {
      text: string;
      fromInboxId: string;
      subject?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      includeQuote?: boolean;
      attachments?: { name: string; size: string; type: string; contentBase64?: string }[];
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
    cc?: string[];
    bcc?: string[];
    attachments?: { name: string; size: string; type: string; contentBase64?: string }[];
  }) => Promise<{ success: boolean; threadId?: string; error?: string }>;

  addProject: (data: { name: string; description: string; color: string; category?: string }) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  editingProject: Project | null;
  setEditingProject: (project: Project | null) => void;
  editingInbox: InboxAccount | null;
  setEditingInbox: (inbox: InboxAccount | null) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => Promise<void>;
  reviewThreadSpam: (threadId: string, status: 'suspected' | 'not_spam') => Promise<void>;
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
  snoozeThread: (threadId: string, durationMs: number) => void;
  snoozeThreadUntil: (threadId: string, untilIso: string) => void;
  unsnoozeThread: (threadId: string) => void;
  getThreadSnoozeUntil: (threadId: string) => string | undefined;
  canSendFromInbox: (inbox?: InboxAccount | null) => boolean;
  gmailSendAs: string[];
  canSendAsInbox: (email?: string) => boolean;
  refreshGmailSendAs: () => Promise<void>;
  requestReply: (message?: Message) => void;
  replyFocusToken: number;
  replyTargetMessage: Message | null;
  forwardPrefill: {
    projectId: string;
    fromInboxId: string;
    toAddress: string;
    subject: string;
    body: string;
  } | null;
  startForward: (threadId?: string) => void;
  clearForwardPrefill: () => void;
  composePrefill: {
    projectId?: string;
    fromInboxId?: string;
    toAddress?: string;
    toName?: string;
    subject?: string;
    body?: string;
  } | null;
  openComposeToContact: (params: {
    toAddress: string;
    toName?: string;
    projectId?: string;
    fromInboxId?: string;
    subject?: string;
    body?: string;
  }) => void;
  clearComposePrefill: () => void;
  contacts: Contact[];
  followUps: FollowUp[];
  addFollowUpItems: (texts: string[], projectId?: string) => void;
  toggleFollowUpItem: (id: string) => void;
  notificationsEnabled: boolean;
  phoneAlertsOn: boolean;
  notificationHint: string | null;
  enableNotifications: () => Promise<void>;
  retryBackgroundAlerts: () => Promise<void>;
  disableNotifications: () => Promise<void>;
  hasSampleData: boolean;
  removeSampleWorkspaces: () => void;
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
  selectAdjacentThread: (direction: 1 | -1) => void;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PROJECTS: 'projectinbox_projects_v2',
  INBOXES: 'projectinbox_inboxes_v2',
  THREADS: 'projectinbox_threads_v2',
};

const sampleProjectIds = new Set(SAMPLE_PROJECT_IDS);
const isSampleThread = (thread: Thread) =>
  sampleProjectIds.has(thread.projectId) || thread.id.startsWith('sim-thread-') ||
  thread.messages?.some((message) => message.id.startsWith('sim-msg-'));

const sanitizeThread = (thread: Thread): Thread => {
  const msgs = deduplicateMessages(thread.messages || []);
  return {
    ...thread,
    messages: msgs,
    messageCount: msgs.length,
  };
};

const sanitizeThreads = (loaded: Thread[]): Thread[] =>
  loaded.filter((thread) => !isSampleThread(thread)).map(sanitizeThread);

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return stored ? (JSON.parse(stored) as Project[]).filter((project) => !sampleProjectIds.has(project.id)) : [];
    } catch {
      return [];
    }
  });

  const [inboxes, setInboxes] = useState<InboxAccount[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.INBOXES);
      return stored ? (JSON.parse(stored) as InboxAccount[]).filter((inbox) => !sampleProjectIds.has(inbox.projectId)) : [];
    } catch {
      return [];
    }
  });

  const [threads, setThreads] = useState<Thread[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THREADS);
      return stored ? sanitizeThreads(JSON.parse(stored) as Thread[]) : [];
    } catch {
      return [];
    }
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all');
  const [selectedInboxId, setSelectedInboxId] = useState<string | 'all'>('all');
  const [selectedRole, setSelectedRole] = useState<InboxRole | 'all'>('all');
  const [selectedThreadId, setSelectedThreadIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlThread = new URLSearchParams(window.location.search).get('thread');
    if (urlThread) return urlThread;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THREADS);
      if (stored) {
        const parsed = sanitizeThreads(JSON.parse(stored) as Thread[]);
        const latest = getLatestEligibleThread(parsed);
        if (latest) return latest.id;
      }
    } catch {}
    return null;
  });

  const userDismissedRef = useRef(false);
  const userInteractedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(Boolean(selectedThreadId));

  const setSelectedThreadId = useCallback((idOrUpdater: string | null | ((curr: string | null) => string | null)) => {
    userInteractedRef.current = true;
    setSelectedThreadIdState((curr) => {
      const next = typeof idOrUpdater === 'function' ? idOrUpdater(curr) : idOrUpdater;
      if (next === null) {
        userDismissedRef.current = true;
      } else {
        userDismissedRef.current = false;
      }
      return next;
    });
  }, []);
  const [selectionMode, setSelectionModeState] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [activeStream, setActiveStream] = useState<InboxStream>('primary');

  const streamCounts = useMemo(() => {
    let primary = 0;
    let feed = 0;
    let paper_trail = 0;
    const scoped = threads.filter((t) => {
      if (t.isArchived) return false;
      if (getSpamStatus(t) === 'suspected') return false;
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;
      if (selectedInboxId !== 'all' && !threadInMailbox(t, selectedInboxId)) return false;
      return true;
    });
    const visible = selectedInboxId === 'all' ? collapseCrossInboxDuplicates(scoped) : scoped;
    for (const t of visible) {
      const s = classifyThreadStream(t);
      if (s === 'feed') feed++;
      else if (s === 'paper_trail') paper_trail++;
      else primary++;
    }
    return { primary, feed, paper_trail };
  }, [threads, selectedProjectId, selectedInboxId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Not checked yet');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncRunningRef = useRef(false);
  const refreshRunningRef = useRef(false);
  const mailRevisionRef = useRef<string | null>(null);
  const mailGenerationRef = useRef(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [undoToast, setUndoToast] = useState<{ label: string } | null>(null);
  const [gmailSendAs, setGmailSendAs] = useState<string[]>([]);
  const [replyFocusToken, setReplyFocusToken] = useState(0);
  const [replyTargetMessage, setReplyTargetMessage] = useState<Message | null>(null);
  const [forwardPrefill, setForwardPrefill] = useState<{
    projectId: string;
    fromInboxId: string;
    toAddress: string;
    subject: string;
    body: string;
  } | null>(null);
  const [composePrefill, setComposePrefill] = useState<{
    projectId?: string;
    fromInboxId?: string;
    toAddress?: string;
    toName?: string;
    subject?: string;
    body?: string;
  } | null>(null);

  const contacts = useMemo(() => {
    return extractContacts(threads, inboxes);
  }, [threads, inboxes]);

  useEffect(() => {
    saveContactsToStorage(contacts);
  }, [contacts]);
  const [followUps, setFollowUps] = useState<FollowUp[]>(() => getFollowUps());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationsOptedIn());
  const [phoneAlertsOn, setPhoneAlertsOn] = useState(false);
  const [notificationHint, setNotificationHint] = useState<string | null>(null);
  const alertThreadRef = useRef<string | null>(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('thread'),
  );
  const undoTimerRef = useRef<number | null>(null);
  const undoFnRef = useRef<(() => void) | null>(null);
  const undoCommitRef = useRef<(() => void) | null>(null);
  const seenThreadIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

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
      const generation = mailGenerationRef.current;
      try {
        const [projRes, inboxRes, threadRes] = await Promise.all([
          fetch('/api/projects').catch(() => null),
          fetch('/api/inboxes').catch(() => null),
          fetchStableStoredThreads().catch((error) => { setSyncError(error.message); return null; }),
        ]);

        const jsonOf = async (res: Response | null) => {
          if (!res || !res.ok) return null;
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('application/json')) return null;
          try {
            return await res.json();
          } catch {
            return null;
          }
        };

        const pData = await jsonOf(projRes);
        if (Array.isArray(pData?.projects) && isMounted) {
          const realProjects = pData.projects.filter((project: Project) => !sampleProjectIds.has(project.id));
          setProjects(realProjects);
          try {
            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(realProjects));
          } catch {}
        }

        const iData = await jsonOf(inboxRes);
        if (Array.isArray(iData?.inboxes) && isMounted) {
          const signatures = getInboxSignatures();
          const merged = iData.inboxes.filter((inbox: InboxAccount) => !sampleProjectIds.has(inbox.projectId)).map((inbox: InboxAccount) => ({
            ...inbox,
            signature: inbox.signature || signatures[inbox.id] || undefined,
          }));
          setInboxes(merged);
          try {
            localStorage.setItem(STORAGE_KEYS.INBOXES, JSON.stringify(merged));
          } catch {}
        }

        if (threadRes && isMounted && generation === mailGenerationRef.current) {
          // A full read replaces this browser's copy so phones and desktops show the same mail.
          setThreads(sanitizeThreads(threadRes.threads));
          mailRevisionRef.current = threadRes.revision;
        }
      } catch (err) {
        setSyncError('Could not load account settings. Displaying cached mail.');
      } finally { if (isMounted) setIsLoaded(true); }
    }

    loadFromD1();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshStoredMail = useCallback(async () => {
    if (refreshRunningRef.current || undoTimerRef.current) return;
    const generation = mailGenerationRef.current;
    refreshRunningRef.current = true;
    try {
      const [snapshot, response] = await Promise.all([
        fetchStableStoredThreads(),
        fetch('/api/inboxes'),
      ]);
      if (!response.ok) throw new Error('Could not check account health.');
      const data = await response.json();
      if (!Array.isArray(data.inboxes)) throw new Error('Account health is unavailable.');
      if (generation !== mailGenerationRef.current || undoTimerRef.current) return;
      setThreads(sanitizeThreads(snapshot.threads));
      setInboxes(prev => data.inboxes.filter((account: InboxAccount) => !sampleProjectIds.has(account.projectId)).map((account: InboxAccount) => ({
        ...prev.find(old => old.id === account.id), ...account,
      })));
      mailRevisionRef.current = snapshot.revision;
      setSyncError(null);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour:'2-digit',minute:'2-digit' }));
    } catch (error:any) { setSyncError(error.message); }
    finally { refreshRunningRef.current = false; }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    let stopped = false;
    const watchForMailChanges = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/mail/revision');
        if (!response.ok) return;
        const body = await response.json();
        const revision = String(body.revision ?? '');
        if (mailRevisionRef.current === null || revision !== mailRevisionRef.current) await refreshStoredMail();
      } catch {
        // The next check retries.
      }
    };
    const id = window.setInterval(() => { void watchForMailChanges(); }, 2000);
    const onFocus = () => { void watchForMailChanges(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isLoaded, refreshStoredMail]);

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

  useEffect(() => {
    if (!isLoaded) return;
    if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      seenThreadIdsRef.current = new Set(threads.flatMap((t) => t.messages.map(m => m.id)));
      return;
    }
    if (!seenThreadIdsRef.current) {
      seenThreadIdsRef.current = new Set(threads.flatMap((t) => t.messages.map(m => m.id)));
      return;
    }
    const seen = seenThreadIdsRef.current;
    threads.forEach((t) => {
      if (t.messages.some(m => !m.isOutgoing && !seen.has(m.id) && Date.now() - Date.parse(m.timestamp) < 2 * 60 * 60 * 1000) && !lastMessageOutgoing(t.messages)) {
        void showForegroundNotification(
          t.subject || 'New mail',
          t.snippet || t.participants[0]?.name || 'New conversation',
          t.id,
        ).catch(() => {});
      }
      t.messages.forEach(m => seen.add(m.id));
    });
  }, [threads, notificationsEnabled, isLoaded]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
        undoCommitRef.current?.();
      }
    };
  }, []);

  // When project changes, reset inbox filter to 'all' to show unified view across all inboxes
  const handleSelectProject = useCallback((projId: string | 'all') => {
    setSelectedProjectId(projId);
    setSelectedInboxId('all');
    setSelectedRole('all');
    const isDesktopSplit =
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024 &&
      (localStorage.getItem('inbox_reading_pane_mode_v2') ?? 'split') !== 'none';
    if (!isDesktopSplit) {
      setSelectedThreadId(null);
    }
  }, [setSelectedThreadId]);

  // When a specific mailbox is selected, filter to that inbox
  const selectMailbox = useCallback((id: string | 'all') => {
    setSelectedInboxId(id);
    const isDesktopSplit =
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024 &&
      (localStorage.getItem('inbox_reading_pane_mode_v2') ?? 'split') !== 'none';
    if (!isDesktopSplit) {
      setSelectedThreadId(null);
    }
    if (id !== 'all') {
      setInboxes((currentInboxes) => {
        const targetInbox = currentInboxes.find((i) => i.id === id);
        if (targetInbox?.projectId) {
          setSelectedProjectId(targetInbox.projectId);
        } else {
          setSelectedProjectId('all');
        }
        return currentInboxes;
      });
      setSelectedRole('all');
    }
  }, [setSelectedThreadId]);

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
    let found: Thread | null = null;
    if (selectedInboxId === 'all') {
      const scoped = threads.filter((t) => selectedProjectId === 'all' || t.projectId === selectedProjectId);
      const collapsed = collapseCrossInboxDuplicates(scoped).find((t) => t.memberIds.includes(selectedThreadId));
      if (collapsed) found = collapsed;
    }
    if (!found) {
      found = threads.find((t) => t.id === selectedThreadId) || null;
    }
    if (!found) return null;
    const messages = deduplicateMessages(found.messages || []);
    return {
      ...found,
      messages,
      messageCount: messages.length,
    };
  }, [threads, selectedThreadId, selectedInboxId, selectedProjectId]);

  // Filtered and Chronologically Ordered Threads
  const filteredThreads = useMemo(() => {
    const scoped = threads.filter((t) => {
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;
      if (selectedInboxId !== 'all' && !threadInMailbox(t, selectedInboxId)) return false;
      if (selectedRole !== 'all' && t.inboxRole !== selectedRole) return false;
      return true;
    });
    const source = selectedInboxId === 'all'
      ? collapseCrossInboxDuplicates(scoped)
      : scoped.map((t) => {
          const msgs = deduplicateMessages(t.messages || []);
          return { ...t, messages: msgs, messageCount: msgs.length };
        });
    return source
      .filter((t) => {
        const inSpam = getSpamStatus(t) === 'suspected';
        if (viewFilter === 'spam') {
          if (!inSpam) return false;
        } else if (inSpam) {
          return false;
        }

        const snoozed = isThreadSnoozed(t.id, nowTick);
        const hasOutgoing = t.messages.some((m) => m.isOutgoing) || t.tags.includes('SENT');
        if (viewFilter === 'all_mail') {
          // no archive or snooze exclusion
        } else if (viewFilter === 'sent') {
          if (!hasOutgoing) return false;
        } else if (viewFilter === 'snoozed') {
          if (!snoozed) return false;
        } else if (viewFilter !== 'spam') {
          if (snoozed) return false;
          if (viewFilter === 'unread' && t.isRead) return false;
          if (viewFilter === 'starred' && !t.isStarred) return false;
          if (viewFilter === 'archived' && !t.isArchived) return false;
          if (viewFilter !== 'archived' && t.isArchived) return false;
          if (viewFilter === 'needs_reply' && (t.messages.length === 0 || lastMessageOutgoing(t.messages))) return false;
          if (viewFilter === 'waiting' && (t.messages.length === 0 || !lastMessageOutgoing(t.messages))) return false;
        }

        const searching = Boolean(searchQuery.trim());
        if (!searching && viewFilter !== 'spam' && activeStream !== 'all') {
          const stream = classifyThreadStream(t);
          if (stream !== activeStream) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchSubject = t.subject.toLowerCase().includes(q);
          const matchSnippet = t.snippet.toLowerCase().includes(q);
          const matchParticipant = t.participants.some(
            (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
          );
          const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
          const matchBody = t.messages.some(
            (m) =>
              (m.bodyText || '').toLowerCase().includes(q) ||
              (m.bodyHtml || '').toLowerCase().includes(q) ||
              (m.from?.address || '').toLowerCase().includes(q)
          );
          if (!matchSubject && !matchSnippet && !matchParticipant && !matchTags && !matchBody) return false;
        }
        return true;
      })
      .filter((thread, idx, arr) => arr.findIndex((t) => t.id === thread.id) === idx)
      .sort(
        (a, b) =>
          new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
      );
  }, [threads, selectedProjectId, selectedInboxId, selectedRole, viewFilter, activeStream, searchQuery, nowTick]);

  useEffect(() => {
    const visible = new Set(filteredThreads.map((t) => t.id));
    setSelectedThreadIds((prev) => {
      const next = prev.filter((id) => visible.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredThreads]);

  const setSelectionMode = useCallback((on: boolean) => {
    setSelectionModeState(on);
    if (!on) setSelectedThreadIds([]);
  }, []);

  const toggleThreadSelection = useCallback((threadId: string) => {
    setSelectedThreadIds((prev) => {
      const next = prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId];
      setSelectionModeState(next.length > 0);
      return next;
    });
  }, []);

  const replaceThreadSelection = useCallback((threadIds: string[]) => {
    const unique = Array.from(new Set(threadIds));
    setSelectionModeState(unique.length > 0);
    setSelectedThreadIds(unique);
  }, []);

  const clearThreadSelection = useCallback(() => {
    setSelectionModeState(false);
    setSelectedThreadIds([]);
  }, []);

  // Automatically select the latest email on startup and keep latest selected on desktop split view
  useEffect(() => {
    if (userDismissedRef.current || alertThreadRef.current) return;
    if (filteredThreads.length === 0) return;

    // 1. Initial auto-navigation on launch (e.g. if localStorage was empty or needed D1 data)
    if (!hasAutoNavigatedRef.current) {
      hasAutoNavigatedRef.current = true;
      setSelectedThreadIdState(filteredThreads[0].id);
      return;
    }

    // 2. Fresh new mail arrived on initial load before user interaction: update to the newest email
    if (!userInteractedRef.current && selectedThreadId !== filteredThreads[0].id) {
      setSelectedThreadIdState(filteredThreads[0].id);
      return;
    }

    // 3. On desktop split view, if nothing is selected and user hasn't explicitly dismissed:
    const isDesktopSplit =
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024 &&
      (localStorage.getItem('inbox_reading_pane_mode_v2') ?? 'split') !== 'none';

    if (isDesktopSplit && selectedThreadId === null) {
      setSelectedThreadIdState(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

  // If a selected thread is no longer in the filtered list, reset back to list or advance to next
  // Wait until stored mail has loaded so an alert link is not cleared first.
  useEffect(() => {
    if (!isLoaded || selectedThreadId === null) return;
    if (selectedInboxId === 'all') {
      const primary = collapseCrossInboxDuplicates(threads).find((t) => t.memberIds.includes(selectedThreadId));
      if (primary && primary.id !== selectedThreadId) {
        setSelectedThreadIdState(primary.id);
        return;
      }
    }
    if (alertThreadRef.current === selectedThreadId && !threads.some((t) => t.id === selectedThreadId)) return;
    const exists = filteredThreads.some((t) => t.id === selectedThreadId);
    if (!exists) {
      if (alertThreadRef.current === selectedThreadId) {
        const thread = threads.find((t) => t.id === selectedThreadId);
        if (thread && getSpamStatus(thread) === 'suspected' && viewFilter !== 'spam') {
          setViewFilter('spam');
          return;
        }
        if (thread && activeStream !== 'all' && classifyThreadStream(thread) !== activeStream) {
          setActiveStream('all');
          return;
        }
      }
      const isDesktopSplit =
        typeof window !== 'undefined' &&
        window.innerWidth >= 1024 &&
        (localStorage.getItem('inbox_reading_pane_mode_v2') ?? 'split') !== 'none';

      if (isDesktopSplit && filteredThreads.length > 0) {
        setSelectedThreadIdState(filteredThreads[0].id);
      } else {
        setSelectedThreadIdState(null);
      }
      alertThreadRef.current = null;
    } else if (alertThreadRef.current === selectedThreadId) {
      alertThreadRef.current = null;
    }
  }, [isLoaded, filteredThreads, threads, selectedThreadId, selectedInboxId, viewFilter, activeStream]);

  const totalUnreadCount = useMemo(() => {
    return collapseCrossInboxDuplicates(threads).filter((t) => !t.isRead && !t.isArchived && !isThreadSnoozed(t.id, nowTick)).length;
  }, [threads, nowTick]);

  const inboxesWithUnread = useMemo(
    () => {
      const signatures = getInboxSignatures();
      return inboxes.map((inbox) => ({
        ...inbox,
        signature: inbox.signature || signatures[inbox.id] || undefined,
        unreadCount: threads.filter(
          (t) =>
            threadInMailbox(t, inbox.id) &&
            !t.isRead &&
            !t.isArchived &&
            !isThreadSnoozed(t.id, nowTick)
        ).length,
      }));
    },
    [inboxes, threads, nowTick]
  );

  const visibleProjectInboxes = useMemo(() => {
    if (selectedProjectId === 'all') return inboxesWithUnread;
    return inboxesWithUnread.filter((i) => i.projectId === selectedProjectId);
  }, [inboxesWithUnread, selectedProjectId]);

  const hasSampleData = useMemo(
    () => projects.some((p) => SAMPLE_PROJECT_IDS.includes(p.id)),
    [projects]
  );

  const armUndo = useCallback((label: string, undo: () => void, commit: () => void) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoCommitRef.current?.();
    }
    undoFnRef.current = () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      undoCommitRef.current = null;
      undoFnRef.current = null;
      undo();
      setUndoToast(null);
    };
    undoCommitRef.current = () => {
      commit();
      undoTimerRef.current = null;
      undoCommitRef.current = null;
      undoFnRef.current = null;
      setUndoToast(null);
    };
    setUndoToast({ label });
    undoTimerRef.current = window.setTimeout(() => {
      undoCommitRef.current?.();
    }, 5000);
  }, []);

  const undoLastAction = useCallback(() => {
    undoFnRef.current?.();
  }, []);

  const selectAdjacentThread = useCallback(
    (direction: 1 | -1) => {
      if (filteredThreads.length === 0) return;
      const idx = filteredThreads.findIndex((t) => t.id === selectedThreadId);
      const nextIdx =
        idx < 0
          ? 0
          : Math.max(0, Math.min(filteredThreads.length - 1, idx + direction));
      const next = filteredThreads[nextIdx];
      if (next) setSelectedThreadId(next.id);
    },
    [filteredThreads, selectedThreadId]
  );

  // Thread Actions with D1 Edge Sync
  const markThreadRead = useCallback((threadId: string, isRead: boolean) => {
    const ids = selectedInboxId === 'all' ? crossInboxMemberIds(threads, threadId) : [threadId];
    const idSet = new Set(ids);
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isRead } : t)));
    for (const id of idSet) {
      fetch(`/api/threads/${id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead }),
      }).catch(() => {});
    }
  }, [selectedInboxId, threads]);

  const markThreadsRead = useCallback((threadIds: string[], isRead: boolean) => {
    const ids = selectedInboxId === 'all' ? threadIds.flatMap((id) => crossInboxMemberIds(threads, id)) : threadIds;
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isRead } : t)));
    for (const id of idSet) {
      fetch(`/api/threads/${id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead }),
      }).catch(() => {});
    }
  }, [selectedInboxId, threads]);

  const toggleStar = useCallback((threadId: string) => {
    const ids = selectedInboxId === 'all' ? crossInboxMemberIds(threads, threadId) : [threadId];
    const idSet = new Set(ids);
    const nextStarred = !threads.some((t) => idSet.has(t.id) && t.isStarred);
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isStarred: nextStarred } : t)));
    for (const id of idSet) {
      fetch(`/api/threads/${id}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: nextStarred }),
      }).catch(() => {});
    }
  }, [selectedInboxId, threads]);

  const starThreads = useCallback((threadIds: string[], isStarred: boolean) => {
    const ids = selectedInboxId === 'all' ? threadIds.flatMap((id) => crossInboxMemberIds(threads, id)) : threadIds;
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isStarred } : t)));
    for (const id of idSet) {
      fetch(`/api/threads/${id}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred }),
      }).catch(() => {});
    }
  }, [selectedInboxId, threads]);

  const toggleArchive = useCallback((threadId: string) => {
    const ids = selectedInboxId === 'all' ? crossInboxMemberIds(threads, threadId) : [threadId];
    const idSet = new Set(ids);
    const snapshots = threads.filter((t) => idSet.has(t.id));
    if (snapshots.length === 0) return;
    const nextArchived = !snapshots.every((t) => t.isArchived);
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isArchived: nextArchived } : t)));
    armUndo(
      nextArchived ? 'Conversation archived' : 'Conversation moved back to inbox',
      () => {
        setThreads((prev) => prev.map((t) => {
          const snap = snapshots.find((s) => s.id === t.id);
          return snap ? { ...t, isArchived: snap.isArchived } : t;
        }));
      },
      () => {
        for (const snap of snapshots) {
          fetch(`/api/threads/${snap.id}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: nextArchived }),
          }).catch(() => {});
        }
      }
    );
  }, [threads, armUndo, selectedInboxId]);

  const archiveThreads = useCallback((threadIds: string[]) => {
    const ids = selectedInboxId === 'all' ? threadIds.flatMap((id) => crossInboxMemberIds(threads, id)) : threadIds;
    const idSet = new Set(ids);
    const snapshots = threads.filter((t) => idSet.has(t.id));
    if (snapshots.length === 0) return;
    const nextArchived = !snapshots.every((t) => t.isArchived);
    setThreads((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, isArchived: nextArchived } : t)));
    setSelectedThreadIds((prev) => prev.filter((id) => !idSet.has(id)));
    armUndo(
      `${threadIds.length} conversation${threadIds.length === 1 ? '' : 's'} ${nextArchived ? 'archived' : 'moved back'}`,
      () => {
        setThreads((prev) =>
          prev.map((t) => {
            const snap = snapshots.find((s) => s.id === t.id);
            return snap ? { ...t, isArchived: snap.isArchived } : t;
          })
        );
      },
      () => {
        for (const snap of snapshots) {
          fetch(`/api/threads/${snap.id}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: nextArchived }),
          }).catch(() => {});
        }
      }
    );
  }, [threads, armUndo, selectedInboxId]);

  const deleteThread = useCallback((threadId: string) => {
    const ids = selectedInboxId === 'all' ? crossInboxMemberIds(threads, threadId) : [threadId];
    const idSet = new Set(ids);
    const snapshots = threads.filter((t) => idSet.has(t.id));
    if (snapshots.length === 0) return;
    const deleteOnServer = () => {
      for (const snap of snapshots) {
        fetch(`/api/threads/${snap.id}`, { method: 'DELETE' }).catch(() => {});
      }
    };
    mailGenerationRef.current += 1;
    setThreads((prev) => prev.filter((t) => !idSet.has(t.id)));
    setSelectedThreadId((curr) => (curr && idSet.has(curr) ? null : curr));
    deleteOnServer();
    armUndo(
      'Conversation deleted',
      () => {
        mailGenerationRef.current += 1;
        setThreads((prev) => mergeThreadLists(prev, snapshots));
        setSelectedThreadId(threadId);
        fetch('/api/import/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threads: snapshots, notify: false }),
        }).catch(() => {});
      },
      deleteOnServer
    );
  }, [threads, armUndo, selectedInboxId]);

  const deleteThreads = useCallback((threadIds: string[]) => {
    const ids = selectedInboxId === 'all' ? threadIds.flatMap((id) => crossInboxMemberIds(threads, id)) : threadIds;
    const idSet = new Set(ids);
    const snapshots = threads.filter((t) => idSet.has(t.id));
    if (snapshots.length === 0) return;
    const deleteOnServer = () => {
      for (const snap of snapshots) {
        fetch(`/api/threads/${snap.id}`, { method: 'DELETE' }).catch(() => {});
      }
    };
    mailGenerationRef.current += 1;
    setThreads((prev) => prev.filter((t) => !idSet.has(t.id)));
    setSelectedThreadId((curr) => (curr && idSet.has(curr) ? null : curr));
    setSelectedThreadIds((prev) => prev.filter((id) => !idSet.has(id)));
    deleteOnServer();
    armUndo(
      `${threadIds.length} conversation${threadIds.length === 1 ? '' : 's'} deleted`,
      () => {
        mailGenerationRef.current += 1;
        setThreads((prev) => mergeThreadLists(prev, snapshots));
        fetch('/api/import/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threads: snapshots, notify: false }),
        }).catch(() => {});
      },
      deleteOnServer
    );
  }, [threads, armUndo, selectedInboxId]);

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
      listGmailSendAs()
        .then((aliases) => setGmailSendAs(aliases.filter((a) => a.verified).map((a) => a.email)))
        .catch(() => {});

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
          authType: 'oauth',
        };

        setInboxes((prev) => [newInbox, ...prev]);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === targetProject.id ? { ...p, inboxIds: [...p.inboxIds, newInbox.id] } : p
          )
        );
        const saved = await fetch('/api/inboxes', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newInbox) });
        if (!saved.ok) throw new Error('Could not save the Gmail account.');
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
            projectId: targetInbox.projectId,
            inboxId: targetInbox.id,
            userEmail,
            inboxRole: targetInbox.role,
            onPage: async page => { await saveGmailPage(page); mailGenerationRef.current += 1; setThreads(prev => mergeThreadLists(prev,page)); },
          });

          if (liveThreads.length > 0) {
            setThreads((prev) => mergeThreadLists(prev, liveThreads));
            setSelectedThreadId(liveThreads[0].id);
          }
        } catch (syncErr:any) {
          setSyncError(syncErr.message);
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

  const syncAllInboxes = useCallback(async () => {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setIsSyncing(true);
    const failures: string[] = [];
    try {
      for (const inbox of inboxes) {
        if (inbox.hasAppPassword || inbox.appPassword || inbox.zohoAppPassword) {
          try { await fetchLiveMailboxThreads({ email:inbox.email,inboxId:inbox.id }); }
          catch (error:any) { failures.push(`${inbox.email}: ${error.message}`); }
        } else if (inbox.channel === 'gmail') {
          if (!isGoogleConnected || googleUser?.email.toLowerCase() !== inbox.email.toLowerCase()) {
            failures.push(`Reconnect ${inbox.email}. Google Sign-In only syncs while this page is open; use an App Password for background checks.`);
            continue;
          }
          try {
            await fetchLiveGmailThreads({ projectId:inbox.projectId,inboxId:inbox.id,userEmail:inbox.email,inboxRole:inbox.role,
              onPage:async page => { await saveGmailPage(page); mailGenerationRef.current += 1; setThreads(prev => mergeThreadLists(prev,page)); } });
          } catch (error:any) { failures.push(`${inbox.email}: ${error.message}`); }
        }
      }
      await refreshStoredMail();
      if (failures.length) setSyncError(failures.join(' • '));
    } finally { syncRunningRef.current = false; setIsSyncing(false); }
  }, [inboxes, isGoogleConnected, googleUser, refreshStoredMail]);
  const syncCallbackRef = useRef(syncAllInboxes);
  syncCallbackRef.current = syncAllInboxes;
  useEffect(() => {
    if (!isLoaded) return;
    void syncCallbackRef.current();
    const timer = window.setInterval(() => { void syncCallbackRef.current(); }, 60000);
    return () => window.clearInterval(timer);
  }, [isLoaded]);

  // Send reply from a specific inbox (SMTP if already stored, otherwise free Gmail relay)
  const sendReply = useCallback(
    async (
      threadId: string,
      reply: {
        text: string;
        fromInboxId: string;
        subject?: string;
        to?: string[];
        cc?: string[];
        bcc?: string[];
        includeQuote?: boolean;
        attachments?: { name: string; size: string; type: string; contentBase64?: string }[];
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const currentThread = threads.find((t) => t.id === threadId);
      let targetInbox = inboxes.find(
        (i) => i.id === reply.fromInboxId || i.email.toLowerCase() === reply.fromInboxId.toLowerCase()
      );
      if (!targetInbox && reply.fromInboxId.startsWith('sent-to-')) {
        const customEmail = reply.fromInboxId.replace(/^sent-to-/, '');
        const carrierInbox =
          inboxes.find((i) => i.id === currentThread?.inboxId) ||
          inboxes.find((i) => i.projectId === currentThread?.projectId) ||
          inboxes[0];
        if (carrierInbox) {
          targetInbox = {
            ...carrierInbox,
            id: reply.fromInboxId,
            email: customEmail,
            name: customEmail.split('@')[0],
          };
        }
      }
      const timestamp = new Date().toISOString();

      const ownAddress = targetInbox?.email?.toLowerCase();
      const requested = (reply.to || [])
        .map((address: string) => address.trim())
        .filter((address: string) => address && address.toLowerCase() !== ownAddress);
      const fallback =
        currentThread?.participants.find((p) => p.address?.toLowerCase() !== ownAddress)?.address ||
        currentThread?.participants[0]?.address;
      const recipients = requested.length
        ? requested
        : fallback && fallback.toLowerCase() !== ownAddress
          ? [fallback]
          : [];

      if (recipients.length === 0) {
        return { success: false, error: 'Add at least one recipient.' };
      }

      const pwd = targetInbox?.appPassword || targetInbox?.zohoAppPassword;
      const canGmail = isGoogleConnected && Boolean(googleUser?.email);
      const sendsFromDomain = (targetInbox?.channel === 'cloudflare' || targetInbox?.id.startsWith('sent-to-')) && !pwd && !targetInbox?.hasAppPassword;
      if (!pwd && !targetInbox?.hasAppPassword && !canGmail && !sendsFromDomain) {
        return {
          success: false,
          error: 'Sign in with Gmail to send from this inbox. Cloudflare receive is free; Gmail Sign-In is the free send path.',
        };
      }

      const latestMessage = [...(currentThread?.messages || [])].reverse().find((message) => !message.isOutgoing)
        || currentThread?.messages[currentThread.messages.length - 1];
      const quote =
        reply.includeQuote === false || !latestMessage
          ? null
          : {
              name: latestMessage.from?.name || latestMessage.from?.address || 'them',
              date: new Date(latestMessage.timestamp).toLocaleString(),
              body: latestMessage.bodyText || '',
            };
      const signedBody = formatOutboundBody({
        text: reply.text,
        signature: targetInbox?.signature,
        quote,
      });
      const canSendAs = Boolean(
        targetInbox?.email && gmailSendAs.includes(targetInbox.email.toLowerCase())
      );
      const sentViaGmail = !sendsFromDomain && !pwd && !targetInbox?.hasAppPassword && canGmail;
      const fromEmail = sentViaGmail
        ? canSendAs
          ? targetInbox!.email
          : googleUser!.email
        : targetInbox?.email;
      const bodyToSend =
        sentViaGmail && !canSendAs && targetInbox?.email
          ? gmailRelayBody(signedBody, targetInbox.email, targetInbox.name)
          : signedBody;
      const subjectToSend = reply.subject || `Re: ${currentThread?.subject || ''}`;
      const realAttachments = (reply.attachments || []).filter((a) => Boolean(a.contentBase64));
      const pendingId = `msg-pending-${Date.now()}`;

      const outgoingMsg: Message = {
        id: pendingId,
        threadId,
        inboxId: targetInbox?.id || currentThread?.inboxId || 'inbox-default',
        projectId: currentThread?.projectId || (selectedProjectId === 'all' ? 'proj-default' : selectedProjectId),
        channel: targetInbox?.channel || currentThread?.channel || 'cloudflare',
        inboxRole: targetInbox?.role || currentThread?.inboxRole || 'general',
        from: {
          name: targetInbox?.name || 'You',
          address: fromEmail || 'me',
        },
        to: recipients.map((address: string) => ({ name: address, address })),
        cc: reply.cc,
        bcc: reply.bcc,
        subject: subjectToSend,
        bodyText: bodyToSend,
        timestamp,
        isOutgoing: true,
        attachments: reply.attachments,
      };

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: [...t.messages, outgoingMsg],
                snippet: `You: ${reply.text.slice(0, 80)}...`,
                lastMessageTimestamp: timestamp,
                messageCount: t.messageCount + 1,
                isRead: true,
              }
            : t
        )
      );

      armUndo(
        'Sending…',
        () => {
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    messages: t.messages.filter((m) => m.id !== pendingId),
                    messageCount: Math.max(1, t.messageCount - 1),
                  }
                : t
            )
          );
        },
        () => {
          const dispatch = async () => {
            if (pwd || targetInbox?.hasAppPassword || sendsFromDomain) {
              const isZoho = targetInbox?.channel === 'zoho' || targetInbox?.email.toLowerCase().includes('zoho');
              await sendLiveMailMessage({
                email: targetInbox!.email,
                appPassword: sendsFromDomain ? undefined : pwd,
                smtpHost: sendsFromDomain ? undefined : targetInbox?.smtpHost || (isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com'),
                smtpPort: sendsFromDomain ? undefined : targetInbox?.smtpPort || 465,
                to: recipients,
                cc: reply.cc,
                bcc: reply.bcc,
                subject: subjectToSend,
                body: bodyToSend,
                inReplyTo: latestMessage?.messageId || undefined,
                references:
                  latestMessage?.references ||
                  (latestMessage?.messageId ? [latestMessage.messageId] : undefined),
                threadId,
                inboxId: targetInbox?.id,
                projectId: currentThread?.projectId || (selectedProjectId === 'all' ? undefined : selectedProjectId),
                senderName: targetInbox?.name,
                attachments: realAttachments,
              });
            } else {
              await sendGmailEmail({
                toAddress: recipients.join(', '),
                subject: subjectToSend,
                bodyText: bodyToSend,
                fromEmail,
                replyTo: canSendAs ? undefined : targetInbox?.email,
                threadId: threadId.startsWith('gmail-thread-') ? threadId : undefined,
                cc: reply.cc,
                bcc: reply.bcc,
                attachments: realAttachments,
              });
            }
            persistMessageToD1(outgoingMsg);
          };
          dispatch().catch((err) => {
            console.error('Delayed send failed:', err);
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      messages: t.messages.filter((m) => m.id !== pendingId),
                      messageCount: Math.max(1, t.messageCount - 1),
                    }
                  : t
              )
            );
            setSyncError(err?.message || 'Failed to send email');
          });
        }
      );

      return { success: true };
    },
    [inboxes, threads, isGoogleConnected, googleUser, selectedProjectId, gmailSendAs, armUndo]
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
      cc?: string[];
      bcc?: string[];
      attachments?: { name: string; size: string; type: string; contentBase64?: string }[];
    }): Promise<{ success: boolean; threadId?: string; error?: string }> => {
      const targetInbox = inboxes.find((i) => i.id === params.fromInboxId);
      const timestamp = new Date().toISOString();
      const threadId = `thread-${Date.now()}`;
      const pwd = targetInbox?.appPassword || targetInbox?.zohoAppPassword;
      const canGmail = isGoogleConnected && Boolean(googleUser?.email);
      const sendsFromDomain = targetInbox?.channel === 'cloudflare' && !pwd && !targetInbox?.hasAppPassword;
      if (!pwd && !targetInbox?.hasAppPassword && !canGmail && !sendsFromDomain) {
        return {
          success: false,
          error: 'Sign in with Gmail to send from this inbox. Cloudflare receive is free; Gmail Sign-In is the free send path.',
        };
      }

      const realAttachments = (params.attachments || []).filter((a) => Boolean(a.contentBase64));
      const signedBody = formatOutboundBody({
        text: params.body,
        signature: targetInbox?.signature,
      });
      const canSendAs = Boolean(
        targetInbox?.email && gmailSendAs.includes(targetInbox.email.toLowerCase())
      );
      const sentViaGmail = !sendsFromDomain && !pwd && !targetInbox?.hasAppPassword && canGmail;
      const fromEmail = sentViaGmail
        ? canSendAs
          ? targetInbox!.email
          : googleUser!.email
        : targetInbox?.email;
      const bodyToSend =
        sentViaGmail && !canSendAs && targetInbox?.email
          ? gmailRelayBody(signedBody, targetInbox.email, targetInbox.name)
          : signedBody;

      const newMsg: Message = {
        id: `msg-pending-${Date.now()}`,
        threadId,
        inboxId: params.fromInboxId,
        projectId: params.projectId,
        channel: params.channel,
        inboxRole: targetInbox?.role || 'general',
        from: {
          name: targetInbox?.name || 'You',
          address: fromEmail || 'me',
        },
        to: [{ name: params.toName || params.toAddress, address: params.toAddress }],
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        bodyText: bodyToSend,
        timestamp,
        isOutgoing: true,
        attachments: params.attachments,
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

      armUndo(
        'Sending…',
        () => {
          setThreads((prev) => prev.filter((t) => t.id !== threadId));
        },
        () => {
          const dispatch = async () => {
            if (pwd || targetInbox?.hasAppPassword || sendsFromDomain) {
              const isZoho = targetInbox?.channel === 'zoho' || targetInbox?.email.toLowerCase().includes('zoho');
              await sendLiveMailMessage({
                email: targetInbox!.email,
                appPassword: sendsFromDomain ? undefined : pwd,
                smtpHost: sendsFromDomain ? undefined : targetInbox?.smtpHost || (isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com'),
                smtpPort: sendsFromDomain ? undefined : targetInbox?.smtpPort || 465,
                to: params.toAddress,
                cc: params.cc,
                bcc: params.bcc,
                subject: params.subject,
                body: bodyToSend,
                threadId,
                inboxId: params.fromInboxId,
                projectId: params.projectId,
                senderName: targetInbox?.name,
                attachments: realAttachments,
              });
            } else {
              await sendGmailEmail({
                toAddress: params.toAddress,
                subject: params.subject,
                bodyText: bodyToSend,
                fromEmail,
                replyTo: canSendAs ? undefined : targetInbox?.email,
                cc: params.cc,
                bcc: params.bcc,
                attachments: realAttachments,
              });
            }
            persistMessageToD1(newMsg);
          };
          dispatch().catch((err) => {
            console.error('Delayed send failed:', err);
            setThreads((prev) => prev.filter((t) => t.id !== threadId));
            setSyncError(err?.message || 'Failed to send email');
          });
        }
      );

      return { success: true, threadId };
    },
    [inboxes, isGoogleConnected, googleUser, gmailSendAs, armUndo]
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

  const removeSampleWorkspaces = useCallback(() => {
    projects
      .filter((p) => SAMPLE_PROJECT_IDS.includes(p.id))
      .forEach((p) => {
        void deleteProject(p.id);
      });
  }, [projects, deleteProject]);

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
        isLiveConnected: data.isLiveConnected ?? (hasPassword || isGoogleConnected || data.channel === 'gmail' || data.channel === 'cloudflare'),
        appPassword: data.appPassword || data.zohoAppPassword,
        hasAppPassword: hasPassword,
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

      fetch('/api/inboxes', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newInbox),
      }).then(async response => {
        if (!response.ok) throw new Error(`Could not save ${newInbox.email}.`);
        if (hasPassword) await fetchLiveMailboxThreads({ email:newInbox.email,inboxId:newInbox.id });
        await refreshStoredMail();
      }).catch((error:any) => setSyncError(error.message));

      return newInbox;
    },
    [isGoogleConnected, refreshStoredMail]
  );

  const updateInbox = useCallback((inboxId: string, updates: Partial<InboxAccount>) => {
    if (typeof updates.signature === 'string') {
      setInboxSignature(inboxId, updates.signature);
    }
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

  const reviewThreadSpam = useCallback(async (threadId: string, spamStatus: 'suspected' | 'not_spam') => {
    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/spam-review`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ spamStatus }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not save your review. Sign in again or retry.');
    setThreads(previous => previous.map(thread => thread.id === threadId ? {
      ...thread, spamStatus:data.spamStatus,spamReviewedAt:data.spamReviewedAt,
      isArchived:spamStatus === 'not_spam' ? false : thread.isArchived,
    } : thread));
    if (spamStatus === 'not_spam') { clearSnooze(threadId); setNowTick(Date.now()); }
  }, []);

  const setThreadStream = useCallback(
    async (threadId: string, stream: 'primary' | 'feed' | 'paper_trail') => {
      const targetThread = threads.find((t) => t.id === threadId);
      if (!targetThread) return;
      const filteredTags = (targetThread.tags || []).filter(
        (tag) => !['STREAM_PRIMARY', 'STREAM_FEED', 'STREAM_PAPER_TRAIL'].includes(tag)
      );
      const newTag =
        stream === 'primary'
          ? 'STREAM_PRIMARY'
          : stream === 'feed'
          ? 'STREAM_FEED'
          : 'STREAM_PAPER_TRAIL';
      const updatedTags = [...filteredTags, newTag];
      await updateThread(threadId, { tags: updatedTags });
    },
    [threads, updateThread]
  );

  const canSendFromInbox = useCallback(
    (inbox?: InboxAccount | null) => {
      if (!inbox) return isGoogleConnected;
      if (inbox.channel === 'cloudflare') return true;
      return Boolean(inbox.appPassword || inbox.zohoAppPassword || inbox.hasAppPassword) || isGoogleConnected;
    },
    [isGoogleConnected, refreshStoredMail]
  );

  const snoozeThread = useCallback((threadId: string, durationMs: number) => {
    snoozeFor(threadId, durationMs);
    setNowTick(Date.now());
    setSelectedThreadId((curr) => (curr === threadId ? null : curr));
  }, []);

  const snoozeThreadUntil = useCallback((threadId: string, untilIso: string) => {
    snoozeUntil(threadId, untilIso);
    setNowTick(Date.now());
    setSelectedThreadId((curr) => (curr === threadId ? null : curr));
  }, []);

  const unsnoozeThread = useCallback((threadId: string) => {
    clearSnooze(threadId);
    setNowTick(Date.now());
  }, []);

  const getThreadSnoozeUntil = useCallback((threadId: string) => readSnoozeUntil(threadId), [nowTick]);

  const refreshGmailSendAs = useCallback(async () => {
    if (!isGoogleConnected) {
      setGmailSendAs([]);
      return;
    }
    try {
      const aliases = await listGmailSendAs();
      setGmailSendAs(aliases.filter((a) => a.verified).map((a) => a.email));
    } catch {
      // send-as listing is optional; relay still works
    }
  }, [isGoogleConnected]);

  useEffect(() => {
    if (isGoogleConnected) {
      refreshGmailSendAs();
    } else {
      setGmailSendAs([]);
    }
  }, [isGoogleConnected, refreshGmailSendAs]);

  const canSendAsInbox = useCallback(
    (email?: string) => Boolean(email && gmailSendAs.includes(email.toLowerCase())),
    [gmailSendAs]
  );

  const requestReply = useCallback((message?: Message) => {
    setReplyTargetMessage(message || null);
    setReplyFocusToken((n) => n + 1);
  }, []);

  const startForward = useCallback(
    (threadId?: string) => {
      const thread = threads.find((t) => t.id === (threadId || selectedThreadId));
      if (!thread) return;
      const last = thread.messages[thread.messages.length - 1];
      const targetInbox = resolveReplyInbox(thread, last, inboxes, undefined, gmailSendAs);
      setForwardPrefill({
        projectId: thread.projectId,
        fromInboxId: targetInbox?.id || thread.inboxId,
        toAddress: '',
        subject: thread.subject.startsWith('Fwd:') ? thread.subject : `Fwd: ${thread.subject}`,
        body: last
          ? `\n\n---------- Forwarded message ----------\nFrom: ${last.from.name} <${last.from.address}>\nDate: ${new Date(last.timestamp).toLocaleString()}\nSubject: ${thread.subject}\n\n${last.bodyText || ''}`
          : '',
      });
    },
    [threads, selectedThreadId, inboxes, gmailSendAs]
  );

  const clearForwardPrefill = useCallback(() => setForwardPrefill(null), []);

  const openComposeToContact = useCallback(
    (params: {
      toAddress: string;
      toName?: string;
      projectId?: string;
      fromInboxId?: string;
      subject?: string;
      body?: string;
    }) => {
      setComposePrefill(params);
    },
    []
  );

  const clearComposePrefill = useCallback(() => setComposePrefill(null), []);

  const addFollowUpItems = useCallback((texts: string[], projectId?: string) => {
    setFollowUps(persistFollowUps(projectId || selectedProjectId, texts));
  }, [selectedProjectId]);

  const toggleFollowUpItem = useCallback((id: string) => {
    setFollowUps(persistToggleFollowUp(id));
  }, []);

  const retryBackgroundAlerts = useCallback(async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      setNotificationHint('Allow notifications for this site in your browser, then retry background alerts.');
      return;
    }
    setNotificationHint(null);
    try {
      const status = await enablePhoneAlerts();
      setPhoneAlertsOn(status === 'ready');
      setNotificationHint(phoneAlertStatusHint(status));
    } catch (error) {
      setPhoneAlertsOn(false);
      const message = error instanceof Error ? error.message : 'Could not enable background alerts.';
      setNotificationHint(phoneAlertFailure(message));
      reportPushFailure(message);
    }
  }, []);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotificationHint(phoneAlertStatusHint('unsupported'));
      return;
    }
    let perm: NotificationPermission;
    try {
      perm = await Notification.requestPermission();
    } catch (error) {
      setNotificationHint(phoneAlertFailure(error instanceof Error ? error.message : 'This browser could not request notification permission.'));
      return;
    }
    if (perm !== 'granted') {
      setNotificationsOptedIn(false);
      setNotificationsEnabled(false);
      setPhoneAlertsOn(false);
      setNotificationHint('Notifications are blocked for this site. Allow them in your browser settings, then tap the bell again.');
      return;
    }
    setNotificationsOptedIn(true);
    setNotificationsEnabled(true);
    setNotificationHint(null);
    void showForegroundNotification('Notifications on', 'New mail will alert while this inbox is open.', 'inbox-alerts-on').catch(() => {});
    await retryBackgroundAlerts();
  }, [retryBackgroundAlerts]);

  useEffect(() => {
    void preparePhoneAlerts().catch((error) => {
      reportPushFailure(error instanceof Error ? error.message : 'Could not prepare phone alerts.');
    });
  }, []);

  const disableNotifications = useCallback(async () => {
    setNotificationsOptedIn(false);
    setNotificationsEnabled(false);
    setPhoneAlertsOn(false);
    setNotificationHint(null);
    try {
      await disablePhoneAlerts();
    } catch {
      // The local opt-out still stops alerts from this browser.
    }
  }, []);

  useEffect(() => {
    const checkPermission = () => {
      if (!notificationsOptedIn()) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (!notificationsEnabled) {
          setNotificationsEnabled(true);
          setNotificationHint(null);
        }
      } else {
        setNotificationsEnabled(false);
        setPhoneAlertsOn(false);
        setNotificationHint(typeof Notification === 'undefined'
          ? phoneAlertStatusHint('unsupported')
          : Notification.permission === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser settings, then tap the bell again.'
            : 'Tap the bell to allow mail alerts on this device.');
      }
    };
    checkPermission();
    window.addEventListener('focus', checkPermission);
    return () => window.removeEventListener('focus', checkPermission);
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void enablePhoneAlerts()
      .then((status) => {
        setPhoneAlertsOn(status === 'ready');
        setNotificationHint(phoneAlertStatusHint(status));
      })
      .catch((error) => {
        setPhoneAlertsOn(false);
        setNotificationHint(phoneAlertFailure(error instanceof Error ? error.message : 'Could not enable background alerts.'));
      });
  }, [notificationsEnabled]);

  const openAlertThread = useCallback((threadId: string) => {
    alertThreadRef.current = threadId;
    setSelectedProjectId('all');
    setSelectedInboxId('all');
    setSelectedRole('all');
    setSearchQuery('');
    const thread = threads.find((item) => item.id === threadId);
    if (thread && getSpamStatus(thread) === 'suspected') {
      setViewFilter('spam');
      setActiveStream('all');
    } else {
      setActiveStream('all');
      setViewFilter('all');
    }
    setSelectedThreadId(threadId);
  }, [threads]);

  useEffect(() => {
    const threadId = new URLSearchParams(window.location.search).get('thread');
    if (threadId) openAlertThread(threadId);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-thread' && typeof event.data.threadId === 'string') {
        openAlertThread(event.data.threadId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [openAlertThread]);

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

      // Show each batch only after the server confirms it was saved. A refresh
      // must never make an unsaved import appear to have vanished.
      const BATCH_SIZE = 20;
      let saved = 0;
      const total = newThreads.length;

      try {
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const chunk = newThreads.slice(i, i + BATCH_SIZE);
          const response = await fetch('/api/import/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threads: chunk }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) throw new Error(result.error || 'Could not save imported mail.');
          mailGenerationRef.current += 1;
          setThreads((prev) => mergeThreadLists(prev, chunk));

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
        inboxes: inboxesWithUnread,
        threads,
        selectedProjectId,
        selectedInboxId,
        selectedRole,
        selectedThreadId,
        viewFilter,
        searchQuery,
        isSyncing,
        lastSyncTime,
        syncError,
        googleUser,
        isGoogleConnected,
        isGoogleConnecting,
        connectGoogleAccount,
        disconnectGoogleAccount,
        zohoWebhookUrl,
        setSelectedProjectId: handleSelectProject,
        setSelectedInboxId,
        selectMailbox,
        setSelectedRole,
        setSelectedThreadId,
        setViewFilter,
        activeStream,
        setActiveStream,
        setThreadStream,
        streamCounts,
        setSearchQuery,
        markThreadRead,
        markThreadsRead,
        toggleStar,
        starThreads,
        toggleArchive,
        archiveThreads,
        deleteThread,
        deleteThreads,
        selectionMode,
        selectedThreadIds,
        setSelectionMode,
        toggleThreadSelection,
        replaceThreadSelection,
        clearThreadSelection,
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
        reviewThreadSpam,
        addInbox,
        updateInbox,
        removeInbox,
        syncAllInboxes,
        simulateIncomingMessage,
        snoozeThread,
        snoozeThreadUntil,
        unsnoozeThread,
        getThreadSnoozeUntil,
        canSendFromInbox,
        gmailSendAs,
        canSendAsInbox,
        refreshGmailSendAs,
        requestReply,
        replyFocusToken,
        replyTargetMessage,
        forwardPrefill,
        startForward,
        clearForwardPrefill,
        composePrefill,
        openComposeToContact,
        clearComposePrefill,
        contacts,
        followUps,
        addFollowUpItems,
        toggleFollowUpItem,
        notificationsEnabled,
        phoneAlertsOn,
        notificationHint,
        enableNotifications,
        retryBackgroundAlerts,
        disableNotifications,
        hasSampleData,
        removeSampleWorkspaces,
        importBatchThreads,
        logout: handleLogout,
        activeProject,
        activeThread,
        projectInboxes: visibleProjectInboxes,
        filteredThreads,
        totalUnreadCount,
        selectAdjacentThread,
        undoToast,
        undoLastAction,
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

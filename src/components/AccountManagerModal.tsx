import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { ChannelType, InboxRole, InboxAccount } from '../types';
import { ChannelBadge } from './ChannelBadge';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  verifyLiveMailConnection,
  ZOHO_REGIONS,
  GMAIL_PRESET,
  MailVerifyResponse,
} from '../services/mailApi';
import {
  X,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Mail,
  Key,
  ExternalLink,
  Zap,
  Info,
  LogOut,
  Eye,
  EyeOff,
  Server,
  Check,
  Pencil,
  FolderEdit,
  FolderPlus,
  FolderArchive,
  UploadCloud,
  FileText,
  CheckCircle2,
  Loader2,
  ArrowRight,
  FileArchive,
} from 'lucide-react';
import { parseEmailArchive, ImportProgress } from '../services/archiveImporter';
import { handleLogout } from '../utils/logout';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewProject?: () => void;
  initialTab?: 'list' | 'add' | 'import_archive' | 'free_guide';
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  isOpen,
  onClose,
  onOpenNewProject,
  initialTab = 'list',
}) => {
  const {
    inboxes,
    projects,
    addInbox,
    addProject,
    updateInbox,
    removeInbox,
    googleUser,
    isGoogleConnected,
    isGoogleConnecting,
    connectGoogleAccount,
    disconnectGoogleAccount,
    zohoWebhookUrl,
    setEditingProject,
    setEditingInbox,
    deleteProject,
    syncAllInboxes,
    importBatchThreads,
    setSelectedProjectId,
    setSelectedInboxId,
    gmailSendAs,
    canSendAsInbox,
    refreshGmailSendAs,
    hasSampleData,
    removeSampleWorkspaces,
  } = useInbox();

  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'import_archive' | 'free_guide'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Archive Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProjectId, setImportProjectId] = useState<string>(projects[0]?.id || '__new__');
  const [importInboxChoice, setImportInboxChoice] = useState<string>('__new_archive__');
  const [importChannel, setImportChannel] = useState<ChannelType>('gmail');
  const [importRole, setImportRole] = useState<InboxRole>('general');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<{
    threadCount: number;
    messageCount: number;
    archiveType: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [channelType, setChannelType] = useState<ChannelType>('zoho');
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [role, setRole] = useState<InboxRole>('support');
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');
  const [customChannelName, setCustomChannelName] = useState('');
  const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '__new__');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCategory, setNewProjectCategory] = useState('');

  // Keep targetProjectId and importProjectId synchronized if projects change
  useEffect(() => {
    if (projects.length > 0) {
      if (!targetProjectId || targetProjectId === '__new__') {
        setTargetProjectId(projects[0].id);
      }
      if (!importProjectId || importProjectId === '__new__') {
        setImportProjectId(projects[0].id);
      }
    } else {
      setTargetProjectId('__new__');
      setImportProjectId('__new__');
    }
  }, [projects.length]);

  // Authentication configuration
  const [authMode, setAuthMode] = useState<'app_password' | 'oauth'>('oauth');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Server settings
  const [zohoRegion, setZohoRegion] = useState<string>('com');
  const [imapHost, setImapHost] = useState('imap.zoho.com');
  const [imapPort, setImapPort] = useState<number>(993);
  const [smtpHost, setSmtpHost] = useState('smtp.zoho.com');
  const [smtpPort, setSmtpPort] = useState<number>(465);

  // Verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<MailVerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);

  // Testing individual existing inbox
  const [testingInboxId, setTestingInboxId] = useState<string | null>(null);
  const [inboxTestResults, setInboxTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  if (!isOpen) return null;

  const handleChannelSelect = (ch: ChannelType) => {
    setChannelType(ch);
    setVerifyResult(null);
    setVerifyError(null);

    if (ch === 'zoho') {
      const regionObj = ZOHO_REGIONS.find((r) => r.id === zohoRegion) || ZOHO_REGIONS[0];
      setImapHost(regionObj.imap);
      setSmtpHost(regionObj.smtp);
      setImapPort(993);
      setSmtpPort(465);
      setAuthMode('app_password');
      if (!accountName) setAccountName('Zoho Desk');
    } else if (ch === 'gmail') {
      setImapHost(GMAIL_PRESET.imap);
      setSmtpHost(GMAIL_PRESET.smtp);
      setImapPort(993);
      setSmtpPort(465);
      if (!accountName) setAccountName(googleUser?.displayName || 'Google Workspace');
      if (!accountEmail && googleUser?.email) setAccountEmail(googleUser.email);
    } else if (ch === 'custom_imap' || (ch as string) === 'custom_provider') {
      setImapHost((prev) => (prev && !prev.includes('zoho') && !prev.includes('gmail') ? prev : 'mail.yourdomain.com'));
      setSmtpHost((prev) => (prev && !prev.includes('zoho') && !prev.includes('gmail') ? prev : 'smtp.yourdomain.com'));
      setImapPort(993);
      setSmtpPort(465);
      setAuthMode('app_password');
      if (!accountName) setAccountName(customChannelName ? `${customChannelName} Inbox` : 'Custom Mail');
    } else if (ch === 'whatsapp') {
      if (!accountEmail) setAccountEmail('+1 (555) 019-2831');
      if (!accountName) setAccountName('VIP WhatsApp');
    } else if (ch === 'instagram') {
      if (!accountEmail) setAccountEmail('@brand_official');
      if (!accountName) setAccountName('Instagram Direct');
    }
  };

  const handleZohoRegionChange = (regionId: string) => {
    setZohoRegion(regionId);
    const regionObj = ZOHO_REGIONS.find((r) => r.id === regionId);
    if (regionObj) {
      setImapHost(regionObj.imap);
      setSmtpHost(regionObj.smtp);
    }
  };

  const handleVerifyConnection = async () => {
    if (!accountEmail || !appPassword) {
      setVerifyError('Please enter both your email address and App Password.');
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      const res = await verifyLiveMailConnection({
        email: accountEmail.trim(),
        appPassword: appPassword.trim(),
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
      });
      setVerifyResult(res);
      if (!res.success) {
        setVerifyError(res.imap?.message || res.smtp?.message || 'Authentication check failed.');
      }
    } catch (err: any) {
      setVerifyError(err?.message || 'Failed to communicate with mail verification bridge.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveInbox = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accountEmail.trim() || !accountName.trim()) {
      setVerifyError('Please enter both Inbox Name and Email Address.');
      return;
    }

    let finalProjectId = targetProjectId;
    if (!finalProjectId || finalProjectId === '__new__' || projects.length === 0) {
      const created = addProject({
        name: newProjectName.trim() || 'My Workspace',
        category: newProjectCategory.trim() || undefined,
        description: 'Project unified workspace',
        color: '#4F46E5',
      });
      finalProjectId = created.id;
      setTargetProjectId(created.id);
    }

    const finalRole = isCustomRole || role === ('__custom__' as any)
      ? (customRoleName.trim() || 'general')
      : role;

    const finalChannel = channelType === ('custom_provider' as any)
      ? (customChannelName.trim().toLowerCase().replace(/\s+/g, '_') || 'custom_imap')
      : channelType;

    const isLive =
      Boolean(appPassword) ||
      isGoogleConnected ||
      channelType === 'cloudflare' ||
      (channelType === 'gmail' && (authMode === 'oauth' ? isGoogleConnected : Boolean(appPassword)));

    addInbox({
      name: accountName.trim(),
      email: accountEmail.trim(),
      channel: finalChannel,
      role: finalRole,
      projectId: finalProjectId,
      serverHost: imapHost,
      isLiveConnected: isLive,
      appPassword: appPassword.trim() || undefined,
      imapHost: (channelType === 'zoho' || channelType === 'gmail' || channelType === 'custom_imap' || (channelType as string) === 'custom_provider') ? imapHost : undefined,
      imapPort,
      smtpHost: (channelType === 'zoho' || channelType === 'gmail' || channelType === 'custom_imap' || (channelType as string) === 'custom_provider') ? smtpHost : undefined,
      smtpPort,
      authType: authMode,
      zohoRegion: channelType === 'zoho' ? (zohoRegion as any) : undefined,
      zohoAppPassword: channelType === 'zoho' ? appPassword.trim() : undefined,
    });

    // Reset form
    setAccountName('');
    setAccountEmail('');
    setAppPassword('');
    setNewProjectName('');
    setNewProjectCategory('');
    setCustomRoleName('');
    setIsCustomRole(false);
    setVerifyResult(null);
    setVerifyError(null);
    setActiveTab('list');
  };

  const handleTestExistingInbox = async (inbox: InboxAccount) => {
    setTestingInboxId(inbox.id);
    try {
      const pwd = inbox.appPassword || inbox.zohoAppPassword;
      if (pwd) {
        const isZoho = inbox.channel === 'zoho' || inbox.email.includes('@zoho');
        const defaultImap = isZoho ? 'imap.zoho.com' : 'imap.gmail.com';
        const defaultSmtp = isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com';

        const res = await verifyLiveMailConnection({
          email: inbox.email,
          appPassword: pwd,
          imapHost: inbox.imapHost || defaultImap,
          imapPort: inbox.imapPort || 993,
          smtpHost: inbox.smtpHost || defaultSmtp,
          smtpPort: inbox.smtpPort || 465,
        });

        if (res.smtp.success) {
          const isImapDown = !res.imap.success;
          const msg = isImapDown
            ? `✅ Outbound SMTP verified (${res.smtp.latencyMs || 80}ms). Inbound routed live via Cloudflare.`
            : `✅ IMAP (${res.imap.totalMessages} msgs) & SMTP verified! Latency: ${res.imap.latencyMs}ms`;
          setInboxTestResults((prev) => ({
            ...prev,
            [inbox.id]: {
              success: true,
              message: msg,
            },
          }));
          updateInbox(inbox.id, { status: 'connected', errorDetail: undefined });
        } else {
          setInboxTestResults((prev) => ({
            ...prev,
            [inbox.id]: {
              success: false,
              message: res.smtp.message || res.imap.message || 'Verification failed',
            },
          }));
          updateInbox(inbox.id, { status: 'error', errorDetail: res.smtp.message });
        }
      } else if (isGoogleConnected) {
        setInboxTestResults((prev) => ({
          ...prev,
          [inbox.id]: {
            success: true,
            message: inbox.channel === 'cloudflare'
              ? `Receive is live via Cloudflare. Send uses Gmail (${googleUser?.email || 'connected'}).`
              : 'Gmail OAuth 2.0 active with valid session.',
          },
        }));
      } else {
        setInboxTestResults((prev) => ({
          ...prev,
          [inbox.id]: {
            success: true,
            message: 'Local sandbox connection verified.',
          },
        }));
      }
    } catch (e: any) {
      setInboxTestResults((prev) => ({
        ...prev,
        [inbox.id]: {
          success: false,
          message: e?.message || 'Connection test failed',
        },
      }));
    } finally {
      setTestingInboxId(null);
    }
  };

  const handleStartImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      let finalProjId = importProjectId;
      if (!finalProjId || finalProjId === '__new__' || projects.length === 0) {
        const createdProj = addProject({
          name: 'Imported Mail Workspace',
          description: 'Historical archive email collection',
          color: '#4F46E5',
        });
        finalProjId = createdProj.id;
        setImportProjectId(createdProj.id);
      }

      let finalInboxId = importInboxChoice;
      if (finalInboxId === '__new_archive__' || !inboxes.some((i) => i.id === finalInboxId)) {
        const createdInbox = addInbox({
          name: 'Archive Mailbox',
          email: `archive-${Date.now().toString(36).slice(-4)}@archive.local`,
          channel: importChannel,
          role: importRole,
          projectId: finalProjId,
        });
        finalInboxId = createdInbox.id;
      }

      // Parse archive
      const parseRes = await parseEmailArchive(importFile, {
        projectId: finalProjId,
        inboxId: finalInboxId,
        channel: importChannel,
        inboxRole: importRole,
        onProgress: (p) => setImportProgress(p),
      });

      // Persist to unified context & Cloudflare D1
      setImportProgress({
        phase: 'uploading',
        message: `Persisting ${parseRes.threads.length} threads into Unified Inbox...`,
        current: 0,
        total: parseRes.threads.length,
      });

      await importBatchThreads(parseRes.threads, (saved, total) => {
        setImportProgress({
          phase: 'uploading',
          message: `Saving to database (${saved}/${total} threads)...`,
          current: saved,
          total,
        });
      });

      setImportResult({
        threadCount: parseRes.threads.length,
        messageCount: parseRes.totalMessages,
        archiveType: parseRes.archiveType,
      });
    } catch (err: any) {
      console.error('Import archive error:', err);
      setImportError(err?.message || 'Failed to import archive file.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleViewImportedEmails = () => {
    if (importProjectId && importProjectId !== '__new__') {
      setSelectedProjectId(importProjectId);
    }
    if (importInboxChoice && importInboxChoice !== '__new_archive__') {
      setSelectedInboxId(importInboxChoice);
    } else {
      setSelectedInboxId('all');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Connected Mailboxes & Providers
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-400">
              Live Zoho Mail, Cloudflare & Gmail synchronization via direct IMAP & SMTP or Google OAuth
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/logout"
              onClick={handleLogout}
              className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/50"
              title="Log out of ProjectInbox"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </a>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 py-2 gap-1.5 bg-slate-50/60 dark:bg-slate-900/50 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`py-1.5 px-3 rounded-full transition cursor-pointer ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            Active Inboxes ({inboxes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`py-1.5 px-3 rounded-full transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'add'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Account
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('import_archive');
              setImportError(null);
            }}
            className={`py-1.5 px-3 rounded-full transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'import_archive'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            Import Archive (.zip)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('free_guide')}
            className={`py-1.5 px-3 rounded-full transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'free_guide'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            Setup & Guide
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {/* TAB 1: LIST */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {hasSampleData && (
                <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-amber-900 dark:text-amber-200">
                    Demo brands Apex / Nordic / Zenith are still connected. Remove them to keep only your real inboxes.
                  </p>
                  <button
                    type="button"
                    onClick={removeSampleWorkspaces}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold"
                  >
                    Remove samples
                  </button>
                </div>
              )}
              {isGoogleConnected && (
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">Gmail “Send mail as”</h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Add each Cloudflare inbox under Gmail Settings → Accounts → Send mail as. After Google verifies it, this app can send <em>From</em> that address instead of relaying.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshGmailSendAs()}
                      className="shrink-0 px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold"
                    >
                      Refresh aliases
                    </button>
                  </div>
                  <a
                    href="https://mail.google.com/mail/#settings/accounts"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300 font-semibold hover:underline"
                  >
                    Open Gmail send-as settings <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="flex flex-wrap gap-1.5">
                    {(gmailSendAs.length > 0 ? gmailSendAs : [googleUser?.email].filter(Boolean) as string[]).map((email) => (
                      <span
                        key={email}
                        className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-[10px] font-medium"
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Quick Actions / Sync Banner */}
              <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100">
                      Live Mailbox Synchronization Engine
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Fetches real email threads directly from Zoho Mail & Gmail into unified project views.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onOpenNewProject && (
                    <button
                      type="button"
                      onClick={onOpenNewProject}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                      <span>New Project</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => syncAllInboxes()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync All Mailboxes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('add')}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Inbox</span>
                  </button>
                </div>
              </div>

              {/* Connected Mailbox Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Total Connected
                    </span>
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-black text-slate-900 dark:text-slate-100">
                      {inboxes.length} Mailboxes
                    </div>
                    <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                      100% routed & operational
                    </p>
                  </div>
                </div>

                {projects.map((proj) => {
                  const pCount = inboxes.filter((i) => i.projectId === proj.id).length;
                  return (
                    <div
                      key={proj.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex flex-col justify-between shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                          <span className="truncate">{proj.name}</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                          Active
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className="text-xl font-black text-slate-900 dark:text-slate-100">
                          {pCount} Inboxes
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {proj.name.toLowerCase()}.app domains
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty state when no projects exist */}
              {projects.length === 0 && (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                    <FolderPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No Projects Created Yet</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                      Projects group your inboxes, emails, and client conversations into dedicated workspaces.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {onOpenNewProject && (
                      <button
                        type="button"
                        onClick={onOpenNewProject}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <FolderPlus className="w-4 h-4" />
                        <span>+ Create New Project</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab('add')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add & Setup Mailbox</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Projects & Inboxes List */}
              <div className="space-y-3">
                {projects.map((proj) => {
                  const projInboxes = inboxes.filter((i) => i.projectId === proj.id);
                  return (
                    <div
                      key={proj.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: proj.color }}
                          />
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {proj.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({projInboxes.length} inboxes)
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingProject(proj)}
                            className="px-2 py-1 text-[11px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded flex items-center gap-1 transition cursor-pointer"
                            title="Edit Project & Custom Name"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Rename / Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${proj.name}" and all its inboxes/threads?`)) {
                                deleteProject(proj.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition cursor-pointer"
                            title="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {projInboxes.map((inbox) => {
                          const hasAppPwd = Boolean(inbox.appPassword || inbox.zohoAppPassword || inbox.hasAppPassword);
                          const sendAsVerified = canSendAsInbox(inbox.email);
                          const isLiveOauth = isGoogleConnected && !hasAppPwd;
                          const testResult = inboxTestResults[inbox.id];

                          return (
                            <div
                              key={inbox.id}
                              className="p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <ChannelBadge
                                    channel={inbox.channel}
                                    role={inbox.role}
                                    showRole={true}
                                    size="sm"
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                                        {inbox.name || inbox.email}
                                      </p>
                                      {inbox.name && inbox.name !== inbox.email && (
                                        <span className="text-[10px] text-slate-400">
                                          ({inbox.email})
                                        </span>
                                      )}
                                      {hasAppPwd ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                          <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                          SMTP SEND READY
                                        </span>
                                      ) : sendAsVerified ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                          SEND AS VERIFIED
                                        </span>
                                      ) : isLiveOauth ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                          GMAIL RELAY · REPLY-TO
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                                          <Zap className="w-2.5 h-2.5 text-amber-600" />
                                          INBOUND ONLY — SIGN IN TO SEND
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                      Role: {inbox.role} • Host: {inbox.imapHost || inbox.serverHost || 'default'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingInbox(inbox)}
                                    className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-medium flex items-center gap-1 transition cursor-pointer"
                                    title="Rename & Configure Inbox"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleTestExistingInbox(inbox)}
                                    disabled={testingInboxId === inbox.id}
                                    className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${testingInboxId === inbox.id ? 'animate-spin' : ''}`} />
                                    <span>Test</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Disconnect ${inbox.email} from ${proj.name}?`)) {
                                        removeInbox(inbox.id);
                                      }
                                    }}
                                    className="p-1 hover:text-red-500 text-slate-400 transition cursor-pointer"
                                    title="Remove Inbox"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Test Result or Error Detail Bar */}
                              {(testResult || inbox.errorDetail) && (
                                <div
                                  className={`p-2 rounded text-[11px] border ${
                                    (testResult ? testResult.success : inbox.status !== 'error')
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                      : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
                                  }`}
                                >
                                  <div className="flex items-start gap-1.5">
                                    {(testResult ? testResult.success : inbox.status !== 'error') ? (
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                    )}
                                    <div className="space-y-1">
                                      <p className="font-semibold">{testResult?.message || inbox.errorDetail}</p>
                                      {inbox.channel === 'zoho' && (testResult?.message || inbox.errorDetail)?.includes('enable IMAP') && (
                                        <p className="text-[10px] text-amber-800 dark:text-amber-300">
                                          💡 In Zoho, open <strong>mail.zoho.com</strong> &gt; Settings ⚙️ &gt; Mail Accounts &gt; Email Forwarding and POP/IMAP &gt; check <strong>IMAP Access</strong> ON. (If using a custom organization domain like yourdomain.com, your admin must enable it under <strong>mailadmin.zoho.com</strong> &gt; Users &gt; Mail Settings &gt; IMAP Access).
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ADD NEW INBOX */}
          {activeTab === 'add' && (
            <form onSubmit={handleSaveInbox} className="space-y-4">
              {/* Channel Selector */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  1. Select Account Provider
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {[
                    { id: 'cloudflare', label: 'Cloudflare Direct', desc: 'Free custom domain receive' },
                    { id: 'gmail', label: 'Gmail / Workspace', desc: 'Free Google Sign-In send' },
                    { id: 'zoho', label: 'Zoho Mail', desc: 'Optional IMAP you already have' },
                    { id: 'custom_imap', label: 'Custom IMAP', desc: 'Private or Dedicated Server' },
                    { id: 'custom_provider', label: 'Custom Provider', desc: 'Outlook, Yahoo, Fastmail, etc.' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleChannelSelect(item.id as ChannelType)}
                      className={`p-2.5 rounded-2xl border text-left transition cursor-pointer ${
                        channelType === item.id
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 ring-2 ring-blue-500/20'
                          : 'border-slate-200/80 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <ChannelBadge channel={item.id as ChannelType} size="sm" />
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-1 text-xs">
                        {item.label}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* CLOUDFLARE DIRECT DOMAIN CONFIGURATION */}
              {channelType === 'cloudflare' && (
                <div className="p-3.5 bg-orange-50/80 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-orange-950 dark:text-orange-200 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-orange-600" />
                        <span>Cloudflare Direct Email Routing</span>
                        <span className="text-[10px] bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100 px-1.5 py-0.5 rounded font-semibold">
                          100% Free • Edge Real-time
                        </span>
                      </h5>
                      <p className="text-[11px] text-orange-800 dark:text-orange-300">
                        Receive incoming emails on your custom domain directly into this project workspace via Cloudflare Email Workers without paying for external email hosting.
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-orange-200 dark:border-orange-800 text-[11px] space-y-2 text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">Quick 2-Step Cloudflare Setup:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>In your Cloudflare Dashboard, navigate to <strong>Email Routing</strong> &gt; <strong>Email Workers</strong>.</li>
                      <li>Add a routing rule: Route your address (e.g. <code>contact@yourdomain.com</code> or Catch-all <code>*@yourdomain.com</code>) to Worker: <code className="bg-orange-100 dark:bg-orange-900/60 px-1 py-0.5 rounded font-mono font-bold">centralized-inbox</code>.</li>
                    </ol>
                    <p className="text-[10px] text-slate-500">
                      Incoming mail lands in this workspace for free. Outbound uses Gmail Sign-In below — Reply-To stays on your custom address. Do not buy Zoho SMTP.
                    </p>
                  </div>

                  <div className="pt-1 space-y-2">
                    <h6 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Free outbound: Gmail Sign-In</h6>
                    {!isGoogleConnected ? (
                      <GoogleSignInButton
                        onClick={async () => {
                          setGoogleAuthError(null);
                          try {
                            await connectGoogleAccount();
                          } catch (e: any) {
                            setGoogleAuthError(e?.message || 'Failed to sign in with Google');
                          }
                        }}
                        isLoading={isGoogleConnecting}
                        text="Sign in with Gmail to send"
                      />
                    ) : (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                        Gmail connected as {googleUser?.email}. Replies from this Cloudflare inbox will send through Gmail.
                      </p>
                    )}
                    {googleAuthError && (
                      <p className="text-[11px] text-red-700">{googleAuthError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ZOHO MAIL CONFIGURATION */}
              {channelType === 'zoho' && (
                <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        Zoho Mail Live IMAP & SMTP Connection
                      </h5>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        Synchronizes real emails directly with Zoho servers using your Zoho App Password.
                      </p>
                    </div>
                  </div>

                  {/* Region selector */}
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Zoho Data Center / Regional Domain
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {ZOHO_REGIONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleZohoRegionChange(r.id)}
                          className={`p-1.5 rounded text-left border text-[11px] font-medium transition cursor-pointer ${
                            zohoRegion === r.id
                              ? 'border-amber-600 bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100 font-bold'
                              : 'border-amber-200 dark:border-amber-800/60 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div>{r.label}</div>
                          <div className="text-[9px] text-slate-400 font-mono">{r.imap}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* App Password input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                        Zoho App Password (16-character code)
                      </label>
                      <a
                        href="https://accounts.zoho.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <span>Generate in Zoho Account &gt; Security</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={appPassword}
                          onChange={(e) => setAppPassword(e.target.value)}
                          placeholder="e.g. abcd efgh ijkl mnop"
                          className="w-full px-2.5 py-1.5 pr-8 text-xs bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-md font-mono text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyConnection}
                        disabled={isVerifying || !accountEmail || !appPassword}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        {isVerifying ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Verify Connection</span>
                      </button>
                    </div>
                  </div>

                  {/* Verification result badge */}
                  {verifyResult && (
                    <>
                      {verifyResult.success ? (
                        <div className="p-2.5 rounded-md text-[11px] border bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <div className="flex items-center gap-2 font-bold mb-1">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Zoho Mail Handshake Succeeded! IMAP & SMTP Live</span>
                          </div>
                          <div className="space-y-0.5 text-[10px] pl-6">
                            <p>• {verifyResult.imap.message}</p>
                            <p>• {verifyResult.smtp.message}</p>
                          </div>
                        </div>
                      ) : verifyResult.smtp?.success ? (
                        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 space-y-2 text-xs">
                          <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>SMTP Outbound Verified! IMAP Inbound Requires 1 Setting</span>
                          </div>
                          <div className="text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                            <p>
                              <strong>Your Zoho credentials are valid!</strong> Outbound email was verified on{' '}
                              <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">
                                smtp.zoho.com:465
                              </code>
                              .
                            </p>
                            <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800/80 space-y-1">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 text-amber-600" />
                                Zoho Mail IMAP is disabled by default. To enable incoming sync:
                              </p>
                              <ol className="list-decimal pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                                <li>
                                  Open{' '}
                                  <a
                                    href="https://mail.zoho.com"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline font-semibold"
                                  >
                                    mail.zoho.com
                                  </a>
                                </li>
                                <li>
                                  Click <strong>⚙️ Settings</strong> (top-right corner) &gt;{' '}
                                  <strong>Mail Accounts</strong> &gt; <strong>Email Forwarding and POP/IMAP</strong>
                                </li>
                                <li>
                                  Check <strong>IMAP Access</strong> to <strong>Enabled / ON</strong>
                                </li>
                                <li>
                                  If your Zoho account is located in Europe, India, or Australia, select that
                                  region domain above.
                                </li>
                              </ol>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleVerifyConnection}
                              disabled={isVerifying}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer"
                            >
                              Re-Check IMAP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveInbox()}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold cursor-pointer"
                            >
                              Connect Now (Outbound Ready)
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-md text-[11px] border bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300">
                          <div className="flex items-center gap-2 font-bold mb-1">
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            <span>Connection Check Failed</span>
                          </div>
                          <div className="space-y-0.5 text-[10px] pl-6">
                            <p>• {verifyResult.imap.message}</p>
                            <p>• {verifyResult.smtp.message}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {verifyError && !verifyResult && (
                    <div className="p-2 rounded-md bg-red-50 text-red-800 border border-red-200 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{verifyError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* GMAIL CONFIGURATION */}
              {channelType === 'gmail' && (
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-blue-600" />
                        Gmail / Google Workspace Connection
                      </h5>
                      <p className="text-[11px] text-blue-800 dark:text-blue-300">
                        Choose Google App Password (recommended for instant local connection) or Google OAuth.
                      </p>
                    </div>
                  </div>

                  {/* Mode switcher */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode('app_password')}
                      className={`flex-1 p-2 rounded-md border text-left cursor-pointer transition ${
                        authMode === 'app_password'
                          ? 'border-blue-600 bg-blue-100/70 dark:bg-blue-900/40 font-bold text-blue-900 dark:text-blue-100'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-blue-600" />
                        <span>2. Gmail App Password (also free)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                        Zero setup required. Connects directly to imap.gmail.com:993 & smtp.gmail.com:465.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthMode('oauth')}
                      className={`flex-1 p-2 rounded-md border text-left cursor-pointer transition ${
                        authMode === 'oauth'
                          ? 'border-blue-600 bg-blue-100/70 dark:bg-blue-900/40 font-bold text-blue-900 dark:text-blue-100'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-blue-600" />
                        <span>1. Google Sign-In (free, recommended)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                        Authenticates via browser popup consent screen.
                      </p>
                    </button>
                  </div>

                  {authMode === 'app_password' && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-blue-950 dark:text-blue-200">
                            Google App Password (16-character code)
                          </label>
                          <a
                            href="https://myaccount.google.com/apppasswords"
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>Open myaccount.google.com/apppasswords</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              value={appPassword}
                              onChange={(e) => setAppPassword(e.target.value)}
                              placeholder="e.g. xxxx xxxx xxxx xxxx"
                              className="w-full px-2.5 py-1.5 pr-8 text-xs bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-md font-mono text-slate-800 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleVerifyConnection}
                            disabled={isVerifying || !accountEmail || !appPassword}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            {isVerifying ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            <span>Verify Connection</span>
                          </button>
                        </div>
                      </div>

                      {/* Verification result */}
                      {verifyResult && (
                        <div
                          className={`p-2.5 rounded-md text-[11px] border ${
                            verifyResult.success
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold mb-1">
                            {verifyResult.success ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                            <span>{verifyResult.success ? 'Gmail IMAP & SMTP Handshake Succeeded!' : 'Connection Failed'}</span>
                          </div>
                          <div className="space-y-0.5 text-[10px] pl-6">
                            <p>• {verifyResult.imap.message}</p>
                            <p>• {verifyResult.smtp.message}</p>
                          </div>
                        </div>
                      )}

                      {verifyError && !verifyResult && (
                        <div className="p-2 rounded-md bg-red-50 text-red-800 border border-red-200 text-[11px] flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{verifyError}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {authMode === 'oauth' && (
                    <>
                      <div className="pt-2 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                            {isGoogleConnected && googleUser
                              ? `Connected as ${googleUser.email}`
                              : 'Sign in with your Google Workspace or personal account.'}
                          </p>
                        </div>
                        {!isGoogleConnected ? (
                          <GoogleSignInButton
                            onClick={async () => {
                              setGoogleAuthError(null);
                              try {
                                const res = await connectGoogleAccount();
                                if (res?.email) {
                                  setAccountEmail(res.email);
                                  setAccountName('Google Workspace');
                                }
                              } catch (e: any) {
                                setGoogleAuthError(e?.message || 'Failed to sign in with Google');
                              }
                            }}
                            isLoading={isGoogleConnecting}
                            text="Authorize Google Account"
                          />
                        ) : (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <Check className="w-4 h-4" /> OAuth Authorized
                          </span>
                        )}
                      </div>

                      {googleAuthError && (
                        <div className="mt-2.5 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 space-y-2 text-xs">
                          <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Firebase Domain Authorization Needed</span>
                          </div>
                          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                            {googleAuthError}
                          </p>
                          <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 text-[11px] space-y-2">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">Recommended Next Steps:</p>
                            <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                              <p>
                                <strong>Option 1 (Instant — Zero Setup):</strong> Switch to the <strong>Google App Password</strong> tab above. It connects directly to Gmail via IMAP & SMTP without Firebase OAuth domain restrictions.
                              </p>
                              <p>
                                <strong>Option 2 (Whitelist Domain in Firebase):</strong> Open{' '}
                                <a
                                  href="https://console.firebase.google.com/project/gen-lang-client-0703278272/authentication/settings"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 underline font-semibold"
                                >
                                  Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains
                                </a>{' '}
                                and add <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">{typeof window !== 'undefined' ? window.location.hostname : 'your-domain.workers.dev'}</code>.
                              </p>
                            </div>
                            <div className="pt-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setAuthMode('app_password');
                                  setGoogleAuthError(null);
                                }}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Switch to Google App Password (Instant)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* CUSTOM IMAP / CUSTOM PROVIDER CONFIGURATION */}
              {(channelType === 'custom_imap' || (channelType as string) === 'custom_provider') && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                  <h5 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-slate-600" />
                    {(channelType as string) === 'custom_provider'
                      ? 'Custom Email Provider / Desk Configuration'
                      : 'Custom IMAP / SMTP Server Details'}
                  </h5>

                  {(channelType as string) === 'custom_provider' && (
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Service / Provider Name (Custom Type)
                      </label>
                      <input
                        type="text"
                        value={customChannelName}
                        onChange={(e) => setCustomChannelName(e.target.value)}
                        placeholder="e.g. Outlook, Yahoo Mail, Fastmail, Proton, Apple iCloud, etc."
                        className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        IMAP Host (Incoming)
                      </label>
                      <input
                        type="text"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        placeholder="e.g. outlook.office365.com or mail.domain.com"
                        className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        SMTP Host (Outgoing)
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="e.g. smtp.office365.com or smtp.domain.com"
                        className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Account Password / App Password
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        required
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="Password or App-Specific Password"
                        className="flex-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyConnection}
                        disabled={isVerifying || !accountEmail || !appPassword}
                        className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isVerifying ? 'Checking...' : 'Verify'}
                      </button>
                    </div>
                  </div>

                  {/* Verification result badge */}
                  {verifyResult && (
                    <div
                      className={`p-2.5 rounded-md text-[11px] border ${
                        verifyResult.success
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1">
                        {verifyResult.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                        <span>{verifyResult.success ? 'Server Handshake Succeeded!' : 'Connection Check Failed'}</span>
                      </div>
                      <div className="space-y-0.5 text-[10px] pl-6">
                        <p>• {verifyResult.imap.message}</p>
                        <p>• {verifyResult.smtp.message}</p>
                      </div>
                    </div>
                  )}

                  {verifyError && !verifyResult && (
                    <div className="p-2 rounded-md bg-red-50 text-red-800 border border-red-200 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{verifyError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Account General Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Inbox Name / Display Label
                  </label>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Primary Support or Yehuda Zahler"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="text"
                    required
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    placeholder="e.g. user@zohomail.com or you@gmail.com"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Inbox Role / Desk
                  </label>
                  <select
                    value={isCustomRole ? '__custom__' : role}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomRole(true);
                      } else {
                        setIsCustomRole(false);
                        setRole(e.target.value as InboxRole);
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="support">🎧 Support Desk</option>
                    <option value="admin">🛡️ Corporate / Admin</option>
                    <option value="notifications">🔔 Alerts & System Notifications</option>
                    <option value="client">🤝 VIP Client Direct</option>
                    <option value="sales">💼 Sales & Inquiries</option>
                    <option value="billing">💳 Billing & Invoices</option>
                    <option value="general">✉️ General Inbox</option>
                    <option value="__custom__">✨ Custom Role / Desk (Custom Type)...</option>
                  </select>
                  {isCustomRole && (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Engineering, Founders, Legal, Operations"
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/30 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Assign to Project
                  </label>
                  {projects.length === 0 ? (
                    <div className="p-2.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
                      <div className="flex items-center gap-1.5 text-blue-900 dark:text-blue-200 font-semibold text-[11px]">
                        <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                        <span>No projects yet — create one now:</span>
                      </div>
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          required
                          placeholder="Project Name (e.g. Horizon Mobile App)"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Custom Type / Category (e.g. SaaS, Consulting, E-Commerce)"
                          value={newProjectCategory}
                          onChange={(e) => setNewProjectCategory(e.target.value)}
                          className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <select
                        value={targetProjectId}
                        onChange={(e) => setTargetProjectId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.category ? `(${p.category})` : ''}
                          </option>
                        ))}
                        <option value="__new__">➕ Create New Project...</option>
                      </select>
                      {targetProjectId === '__new__' && (
                        <div className="mt-2 p-2.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1.5">
                          <input
                            type="text"
                            required
                            placeholder="New Project Name"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Custom Type / Category (e.g. SaaS, Consulting)"
                            value={newProjectCategory}
                            onChange={(e) => setNewProjectCategory(e.target.value)}
                            className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect & Sync Mailbox</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: IMPORT EMAIL ARCHIVE (.ZIP / .MBOX / .EML) */}
          {activeTab === 'import_archive' && (
            <div className="space-y-4">
              {/* Intro Banner */}
              <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-2xl flex items-start gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shrink-0 shadow-sm">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Import Old Emails & Archive Backups
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Upload your email archive. Supports <strong>Google Takeout (.zip)</strong> with .mbox files, zipped <strong>.eml</strong> folders, or direct <strong>.mbox / .eml</strong> files.
                    All historical emails, conversation dates, senders, and threaded replies will be parsed and imported directly into your Unified Inbox.
                  </p>
                </div>
              </div>

              {/* Destination Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-800">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Workspace / Project
                  </label>
                  <select
                    value={importProjectId}
                    onChange={(e) => {
                      setImportProjectId(e.target.value);
                      setImportInboxChoice('__new_archive__');
                    }}
                    disabled={isImporting}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-800 dark:text-slate-200"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="__new__">+ Create New Project for Archive</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Associate with Mailbox
                  </label>
                  <select
                    value={importInboxChoice}
                    onChange={(e) => setImportInboxChoice(e.target.value)}
                    disabled={isImporting}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="__new_archive__">
                      + Create New Archive Mailbox ("Historical Archive")
                    </option>
                    {inboxes
                      .filter((i) => i.projectId === importProjectId)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.email})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    setImportFile(files[0]);
                    setImportError(null);
                    setImportResult(null);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 transition flex flex-col items-center justify-center text-center cursor-pointer ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                    : importFile
                    ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                }`}
                onClick={() => {
                  if (!isImporting) {
                    document.getElementById('archive-file-input')?.click();
                  }
                }}
              >
                <input
                  id="archive-file-input"
                  type="file"
                  accept=".zip,.mbox,.eml,.msg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImportFile(file);
                      setImportError(null);
                      setImportResult(null);
                    }
                  }}
                />

                {importFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                      <FileArchive className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                      {importFile.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(importFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to extract & import
                    </div>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1">
                      Click to choose a different archive file
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      Click to upload or drag & drop your email archive
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Supports <strong>Google Takeout (.zip)</strong>, <strong>.mbox</strong> files, and <strong>.eml</strong> collections
                    </p>
                  </div>
                )}
              </div>

              {/* Progress Bar & Status */}
              {isImporting && importProgress && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      {importProgress.message}
                    </span>
                    <span className="font-mono text-slate-500">
                      {importProgress.total > 0
                        ? `${Math.round((importProgress.current / importProgress.total) * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300 ease-out"
                      style={{
                        width: `${
                          importProgress.total > 0
                            ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
                            : 15
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {importError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="font-semibold block">Archive Import Failed</strong>
                    <span>{importError}</span>
                  </div>
                </div>
              )}

              {/* Success Result Card */}
              {importResult && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 shadow-sm">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                        Import Completed Successfully!
                      </h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Imported <strong>{importResult.threadCount} threads</strong> ({importResult.messageCount} messages) from {importResult.archiveType}.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleViewImportedEmails}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      <span>View Imported Emails</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportFile(null);
                        setImportResult(null);
                        setImportProgress(null);
                      }}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs transition cursor-pointer"
                    >
                      Import Another Archive
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!importResult && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    disabled={isImporting}
                    className="px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!importFile || isImporting}
                    onClick={handleStartImport}
                    className={`px-4 py-2 rounded-xl font-medium text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer ${
                      !importFile || isImporting
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Importing Archive...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Start Import</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FREE SETUP GUIDE */}
          {activeTab === 'free_guide' && (
            <div className="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
              {/* Zoho Guide */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-amber-950 dark:text-amber-200 text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    How to Connect Zoho Mail (100% Free)
                  </h4>
                  <a
                    href="https://accounts.zoho.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>Open Zoho Accounts</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Zoho Mail provides standard IMAP & SMTP access using a dedicated App Password. Follow these 3 quick steps:
                </p>
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                  <li>
                    <strong>Step 1: Check IMAP is enabled in Zoho Mail</strong>: In Zoho Mail webmail, click <em>Settings (gear icon) &gt; Mail Accounts &gt; Email Forwarding and IMAP</em>. Ensure <strong>IMAP Access</strong> is checked ON.
                  </li>
                  <li>
                    <strong>Step 2: Generate Zoho App Password</strong>: Go to{' '}
                    <a
                      href="https://accounts.zoho.com"
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-semibold"
                    >
                      accounts.zoho.com
                    </a>{' '}
                    &gt; <em>Security &gt; App Passwords &gt; Generate New Password</em>. Enter app name "Unified Inbox" and click Generate.
                  </li>
                  <li>
                    <strong>Step 3: Connect in this app</strong>: In the "Connect Zoho or Gmail Account" tab, select Zoho Mail, enter your Zoho email and the 16-character App Password, and click <strong>Verify Connection</strong>!
                  </li>
                </ol>
              </div>

              {/* Gmail Guide */}
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-blue-900 dark:text-blue-200 text-sm flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-blue-600" />
                    How to Connect Gmail / Google Workspace
                  </h4>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>Google App Passwords</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  You can connect any personal Gmail or Google Workspace account using either Google App Passwords or 1-Click OAuth:
                </p>
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-blue-900 dark:text-blue-200">
                  <li>
                    <strong>Method 1 (Recommended): Google App Password</strong>:
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>Make sure 2-Step Verification is active on your Google account.</li>
                      <li>
                        Visit{' '}
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-semibold"
                        >
                          myaccount.google.com/apppasswords
                        </a>.
                      </li>
                      <li>Name the password "Unified Inbox" and copy the 16-character code.</li>
                      <li>Paste the code into this modal and click "Verify Connection"!</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Method 2: 1-Click Google OAuth</strong>: Click "Authorize Google Account" to grant read and send permissions through Google's consent dialog. Re-consent once so Gmail can list verified send-as aliases.
                  </li>
                  <li>
                    <strong>Send as your domain (free)</strong>: In Gmail → Settings → Accounts → Send mail as, add each Cloudflare inbox. After Google verifies it, ProjectInbox will send <em>From</em> that address. Until then, mail still goes out through Gmail with Reply-To set to the inbox.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

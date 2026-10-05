export type ChannelType = 'gmail' | 'zoho' | 'whatsapp' | 'instagram' | 'facebook' | 'custom_imap' | string;

export type InboxRole = 'admin' | 'support' | 'notifications' | 'sales' | 'billing' | 'client' | 'general' | string;

export interface InboxAccount {
  id: string;
  name: string;
  email: string;
  channel: ChannelType;
  role: InboxRole;
  projectId: string;
  badgeColor: string;
  unreadCount: number;
  status: 'connected' | 'syncing' | 'error';
  lastSyncedAt: string;
  signature?: string;
  serverHost?: string;
  isLiveConnected?: boolean;

  // Real IMAP / SMTP connection config
  authType?: 'app_password' | 'oauth';
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  appPassword?: string;
  zohoRegion?: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn';
  errorDetail?: string;
  hasAppPassword?: boolean;
  receivingMode?: 'mailbox' | 'routing';
  lastReceivedAt?: string;
  deliveryError?: string;
  syncError?: string;
  syncPending?: boolean;
  lastAttemptAt?: string;
  lastMailboxSyncAt?: string;

  // Legacy Zoho fields
  zohoAppPassword?: string;
  zohoMethod?: 'forwarding' | 'smtp' | 'oauth';
  zohoWebhookUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  accentColor: string;
  category?: string;
  inboxIds: string[];
  createdAt: string;
}

export interface Attachment {
  name: string;
  size: string;
  type: string;
  dataUrl?: string;
  contentBase64?: string;
  url?: string;
  gmail?: { messageId: string; attachmentId: string; userEmail: string };
}

export interface Message {
  id: string;
  threadId: string;
  inboxId: string;
  projectId: string;
  channel: ChannelType;
  inboxRole: InboxRole;
  from: {
    name: string;
    address: string;
    avatar?: string;
  };
  to: {
    name: string;
    address: string;
  }[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: string;
  isOutgoing: boolean;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
}

export interface Thread {
  id: string;
  projectId: string;
  inboxId: string;
  channel: ChannelType;
  inboxRole: InboxRole;
  subject: string;
  snippet: string;
  participants: {
    name: string;
    address: string;
    avatar?: string;
  }[];
  lastMessageTimestamp: string;
  messageCount: number;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  tags: string[];
  spamStatus?: 'suspected' | 'not_spam';
  spamReason?: string;
  spamReviewedAt?: string;
  decision?: ClefDecision;
  messages: Message[];
}

export type ClefUrgencyLevel = 'no urgency' | 'low' | 'normal' | 'high' | 'urgent';

export type ClefCategory =
  | 'customer'
  | 'sales'
  | 'vendor'
  | 'finance'
  | 'scheduling'
  | 'support'
  | 'personal'
  | 'newsletter'
  | 'automated'
  | 'spam'
  | 'other';

export interface ClefSelectedChoices {
  needs_reply: boolean;
  urgency: ClefUrgencyLevel;
  category: string;
  project_route: string;
  contains_action_item: boolean;
  follow_up_required: boolean;
  safe_to_generate_draft: boolean;
  human_attention: boolean;
  likely_newsletter?: boolean;
  likely_automated_notification?: boolean;
  meeting_request?: boolean;
  financial_or_legal_sensitivity?: boolean;
  unsubscribe_candidate?: boolean;
}

export interface ClefProbabilityDistributions {
  needs_reply: number;
  urgency: {
    expected_score: number;
    probabilities: Record<string, number>;
  };
  category: {
    confidence: number;
    probabilities: Record<string, number>;
  };
  project_route: {
    confidence: number;
    probabilities: Record<string, number>;
  };
  contains_action_item: number;
  follow_up_required: number;
  safe_to_generate_draft: number;
  human_attention: number;
  likely_newsletter?: number;
  likely_automated_notification?: number;
  meeting_request?: number;
  financial_or_legal_sensitivity?: number;
  unsubscribe_candidate?: number;
}

export interface ClefDecision {
  id: string;
  threadId: string;
  messageId?: string;
  model: string;
  schemaVersion: string;
  selectedChoices: ClefSelectedChoices;
  probabilityDistributions: ClefProbabilityDistributions;
  latencyMs?: number;
  mode: 'off' | 'shadow' | 'primary';
  createdAt: string;
}

export type ViewFilter =
  | 'all'
  | 'all_mail'
  | 'unread'
  | 'starred'
  | 'archived'
  | 'snoozed'
  | 'needs_reply'
  | 'waiting'
  | 'sent'
  | 'spam';

export type InboxStream = 'all' | 'primary' | 'feed' | 'paper_trail';


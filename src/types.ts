export type ChannelType = 'gmail' | 'zoho' | 'whatsapp' | 'instagram' | 'facebook' | 'custom_imap';

export type InboxRole = 'admin' | 'support' | 'notifications' | 'sales' | 'billing' | 'client' | 'general';

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
  inboxIds: string[];
  createdAt: string;
}

export interface Attachment {
  name: string;
  size: string;
  type: string;
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
  messages: Message[];
}

export type ViewFilter = 'all' | 'unread' | 'starred' | 'archived';

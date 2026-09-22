import { Project, InboxAccount, Thread } from '../types';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-apex',
    name: 'Apex SaaS Platform',
    description: 'B2B analytics cloud platform - customer operations & infrastructure',
    color: '#2563EB', // Blue
    accentColor: '#DBEAFE',
    inboxIds: ['inbox-apex-support', 'inbox-apex-admin', 'inbox-apex-notif', 'inbox-apex-wa'],
    createdAt: '2026-08-10T09:00:00Z',
  },
  {
    id: 'proj-nordic',
    name: 'Nordic Living E-Commerce',
    description: 'Design decor store & international customer inquiries',
    color: '#0D9488', // Teal
    accentColor: '#CCFBF1',
    inboxIds: ['inbox-nordic-care', 'inbox-nordic-orders', 'inbox-nordic-ig'],
    createdAt: '2026-08-15T10:30:00Z',
  },
  {
    id: 'proj-zenith',
    name: 'Zenith Ventures',
    description: 'Advisory, investor communications & partnership deals',
    color: '#7C3AED', // Violet
    accentColor: '#EDE9FE',
    inboxIds: ['inbox-zenith-admin', 'inbox-zenith-deals'],
    createdAt: '2026-09-01T14:00:00Z',
  },
];

export const INITIAL_INBOXES: InboxAccount[] = [
  // Apex SaaS inboxes (4 inboxes under one project as requested!)
  {
    id: 'inbox-apex-support',
    name: 'Apex Support Desk',
    email: 'support@apexanalytics.io',
    channel: 'gmail',
    role: 'support',
    projectId: 'proj-apex',
    badgeColor: '#EF4444', // Gmail red
    unreadCount: 2,
    status: 'connected',
    lastSyncedAt: '2026-09-17T08:05:00Z',
    signature: 'Apex Analytics Support Team\nhelp@apexanalytics.io | SLA: 2 hours',
    serverHost: 'imap.gmail.com',
  },
  {
    id: 'inbox-apex-admin',
    name: 'Apex Corporate Admin',
    email: 'admin@apexanalytics.io',
    channel: 'zoho',
    role: 'admin',
    projectId: 'proj-apex',
    badgeColor: '#F59E0B', // Zoho amber
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T08:08:00Z',
    signature: 'Yehuda Zahler - Operations & Corporate Admin\nApex Analytics Inc.',
    serverHost: 'imap.zoho.com',
  },
  {
    id: 'inbox-apex-notif',
    name: 'Apex Cloud Alerts',
    email: 'notifications@apexanalytics.io',
    channel: 'gmail',
    role: 'notifications',
    projectId: 'proj-apex',
    badgeColor: '#6366F1', // Indigo
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T08:00:00Z',
    signature: 'Apex Automated Notification Service',
    serverHost: 'imap.gmail.com',
  },
  {
    id: 'inbox-apex-wa',
    name: 'Apex VIP WhatsApp',
    email: '+1 (415) 890-1200',
    channel: 'whatsapp',
    role: 'client',
    projectId: 'proj-apex',
    badgeColor: '#10B981', // WhatsApp green
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T08:10:00Z',
    signature: 'Sent via Apex WhatsApp Business Gateway',
  },

  // Nordic Store Inboxes
  {
    id: 'inbox-nordic-care',
    name: 'Nordic Customer Care',
    email: 'care@nordiccrafts.store',
    channel: 'gmail',
    role: 'support',
    projectId: 'proj-nordic',
    badgeColor: '#EF4444',
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T07:50:00Z',
    signature: 'Nordic Crafts Concierge Support',
    serverHost: 'imap.gmail.com',
  },
  {
    id: 'inbox-nordic-orders',
    name: 'Nordic Billing & Orders',
    email: 'orders@nordiccrafts.store',
    channel: 'zoho',
    role: 'billing',
    projectId: 'proj-nordic',
    badgeColor: '#F59E0B',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-17T07:45:00Z',
    signature: 'Nordic Crafts Logistics & Invoicing',
    serverHost: 'imap.zoho.com',
  },
  {
    id: 'inbox-nordic-ig',
    name: 'Nordic Instagram Direct',
    email: '@nordiccrafts.official',
    channel: 'instagram',
    role: 'sales',
    projectId: 'proj-nordic',
    badgeColor: '#EC4899', // Pink
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T08:02:00Z',
    signature: '',
  },

  // Zenith Inboxes
  {
    id: 'inbox-zenith-admin',
    name: 'Zenith Managing Desk',
    email: 'admin@zenithpartners.co',
    channel: 'gmail',
    role: 'admin',
    projectId: 'proj-zenith',
    badgeColor: '#EF4444',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-17T07:30:00Z',
    serverHost: 'imap.gmail.com',
  },
  {
    id: 'inbox-zenith-deals',
    name: 'Zenith Dealflow Desk',
    email: 'deals@zenithpartners.co',
    channel: 'zoho',
    role: 'sales',
    projectId: 'proj-zenith',
    badgeColor: '#F59E0B',
    unreadCount: 1,
    status: 'connected',
    lastSyncedAt: '2026-09-17T07:32:00Z',
    serverHost: 'imap.zoho.com',
  },
  {
    id: 'inbox-apex-press',
    name: 'Apex Press & Inquiries',
    email: 'press@apexanalytics.io',
    channel: 'cloudflare',
    role: 'general',
    projectId: 'proj-apex',
    badgeColor: '#F97316',
    unreadCount: 1,
    status: 'connected',
    receivingMode: 'routing',
    lastReceivedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  },
];

export const INITIAL_THREADS: Thread[] = [
  // Demo Thread: Suspected Spam (Showcases latest Spam Review & Badge feature)
  {
    id: 'thread-apex-spam',
    projectId: 'proj-apex',
    inboxId: 'inbox-apex-support',
    channel: 'gmail',
    inboxRole: 'support',
    subject: '[SPAM] Urgent: Re-verify corporate treasury wallet authorization',
    snippet: 'Security Alert: Your corporate signer was flagged from an unfamiliar IP address. Please review authorization before deadline...',
    participants: [
      { name: 'Ethereum Trust Security', address: 'security@eth-corporate-auth.cc', avatar: 'ET' },
      { name: 'Apex Support Desk', address: 'support@apexanalytics.io', avatar: 'AS' },
    ],
    lastMessageTimestamp: new Date(Date.now() - 35 * 60000).toISOString(),
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: ['SECURITY'],
    spamStatus: 'suspected',
    spamReason: 'Gmail placed a message in Spam due to suspicious link patterns and unverified sender domain.',
    messages: [
      {
        id: 'msg-apex-spam-1',
        threadId: 'thread-apex-spam',
        inboxId: 'inbox-apex-support',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'support',
        from: { name: 'Ethereum Trust Security', address: 'security@eth-corporate-auth.cc', avatar: 'ET' },
        to: [{ name: 'Apex Support', address: 'support@apexanalytics.io' }],
        subject: '[SPAM] Urgent: Re-verify corporate treasury wallet authorization',
        bodyText: `URGENT SECURITY NOTIFICATION\n\nWe detected an unverified authorization attempt for your corporate treasury account from IP 185.220.101.5.\n\nTo ensure uninterrupted API billing and treasury payouts, verify your signing credentials within 24 hours:\nhttps://eth-corporate-auth.cc/verify?vault=apex-enterprise\n\nIf you did not initiate this, freeze your connected nodes immediately.\n\nAutomated Security Guard | Protocol Defense`,
        timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
        isOutgoing: false,
      },
    ],
  },
  // Thread 1: Urgent Support on Gmail
  {
    id: 'thread-apex-1',
    projectId: 'proj-apex',
    inboxId: 'inbox-apex-support',
    channel: 'gmail',
    inboxRole: 'support',
    subject: 'Urgent: API rate limit error 429 on EU production cluster',
    snippet: 'Hey team, our telemetry pipeline started dropping metrics with HTTP 429 rate limit exceeded errors around 7:15 UTC...',
    participants: [
      { name: 'Marcus Vance (FinTech Corp)', address: 'm.vance@fintechcorp.eu', avatar: 'MV' },
      { name: 'Apex Support Desk', address: 'support@apexanalytics.io', avatar: 'AS' },
    ],
    lastMessageTimestamp: '2026-09-17T08:05:00Z',
    messageCount: 2,
    isRead: false,
    isStarred: true,
    isArchived: false,
    tags: ['Urgent', 'SLA', 'API'],
    messages: [
      {
        id: 'msg-apex-1-1',
        threadId: 'thread-apex-1',
        inboxId: 'inbox-apex-support',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'support',
        from: { name: 'Marcus Vance', address: 'm.vance@fintechcorp.eu', avatar: 'MV' },
        to: [{ name: 'Apex Support', address: 'support@apexanalytics.io' }],
        subject: 'Urgent: API rate limit error 429 on EU production cluster',
        bodyText: `Hello Apex Support Team,

Our telemetry ingestion service in Frankfurt started throwing HTTP 429 Rate Limit Exceeded errors at 07:15 UTC today. We are on the Tier 3 Enterprise plan which is supposed to include 15,000 requests/minute.

Could you urgently verify if our quota was accidentally capped during your weekend deployment? We have attached our server logs.

Logs excerpt:
[2026-09-17 07:18:22] WARN rate_limiter.go:88: endpoint /v2/events returned 429 {"error": "quota_window_exceeded", "limit": 5000}

Thanks,
Marcus Vance
Lead Infrastructure Engineer | FinTech Corp EU`,
        timestamp: '2026-09-17T07:22:00Z',
        isOutgoing: false,
        attachments: [
          { name: 'error_trace_20260917.log', size: '342 KB', type: 'text/plain' },
        ],
      },
      {
        id: 'msg-apex-1-2',
        threadId: 'thread-apex-1',
        inboxId: 'inbox-apex-support',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'support',
        from: { name: 'Apex Support Desk', address: 'support@apexanalytics.io', avatar: 'AS' },
        to: [{ name: 'Marcus Vance', address: 'm.vance@fintechcorp.eu' }],
        subject: 'Re: Urgent: API rate limit error 429 on EU production cluster',
        bodyText: `Hi Marcus,

Thank you for reporting this immediately. We've routed this to our on-call Site Reliability team. We are examining the EU Gateway routing table to ensure your custom Enterprise quota rule is applied properly across all load balancer pods.

Will update you within 20 minutes with a resolution.

Best regards,
Apex Analytics Support Desk`,
        timestamp: '2026-09-17T07:35:00Z',
        isOutgoing: true,
      },
    ],
  },

  // Thread 2: Admin email on Zoho Mail
  {
    id: 'thread-apex-2',
    projectId: 'proj-apex',
    inboxId: 'inbox-apex-admin',
    channel: 'zoho',
    inboxRole: 'admin',
    subject: 'Stripe Merchant Statement & Quarterly Compliance Audit Notice',
    snippet: 'Dear Apex Analytics Admin, Your September settlement report of $84,290.00 is ready for review. Please confirm tax residency...',
    participants: [
      { name: 'Stripe Merchant Services', address: 'notices@stripe.com', avatar: 'ST' },
      { name: 'Apex Corporate Admin', address: 'admin@apexanalytics.io', avatar: 'AA' },
    ],
    lastMessageTimestamp: '2026-09-17T07:55:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: ['Finance', 'Compliance'],
    messages: [
      {
        id: 'msg-apex-2-1',
        threadId: 'thread-apex-2',
        inboxId: 'inbox-apex-admin',
        projectId: 'proj-apex',
        channel: 'zoho',
        inboxRole: 'admin',
        from: { name: 'Stripe Merchant Services', address: 'notices@stripe.com', avatar: 'ST' },
        to: [{ name: 'Apex Corporate Admin', address: 'admin@apexanalytics.io' }],
        subject: 'Stripe Merchant Statement & Quarterly Compliance Audit Notice',
        bodyText: `Dear Apex Analytics Administrator,

Your monthly payout batch for August/September has completed processing with total net volume of $84,290.00 USD. Funds have been transferred to your primary Silicon Valley Bank depository account ending in 4109.

Action Required:
As part of our standard SOC2 and FinCEN vendor compliance review, please verify that your beneficial ownership questionnaire in the dashboard remains current for FY2026.

You can download the full transaction statement and 1099-K forecast directly from the Merchant Dashboard.

Sincerely,
Stripe Merchant Compliance Operations`,
        timestamp: '2026-09-17T07:55:00Z',
        isOutgoing: false,
        attachments: [
          { name: 'Stripe_Settlement_Sep2026.pdf', size: '1.2 MB', type: 'application/pdf' },
        ],
      },
    ],
  },

  // Thread 3: Automated Notifications on Gmail
  {
    id: 'thread-apex-3',
    projectId: 'proj-apex',
    inboxId: 'inbox-apex-notif',
    channel: 'gmail',
    inboxRole: 'notifications',
    subject: '[Alert] Pod Autoscale Warning: cluster-eu-central-1 worker pool at 89%',
    snippet: 'Kubernetes HPA triggered: Target CPU utilization exceeded threshold (89% vs 75%). Spawning 3 additional replicas...',
    participants: [
      { name: 'Datadog Cloud Watch', address: 'alerts@datadog.com', avatar: 'DD' },
      { name: 'Apex Cloud Alerts', address: 'notifications@apexanalytics.io', avatar: 'AC' },
    ],
    lastMessageTimestamp: '2026-09-17T07:40:00Z',
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: ['DevOps', 'Automated'],
    messages: [
      {
        id: 'msg-apex-3-1',
        threadId: 'thread-apex-3',
        inboxId: 'inbox-apex-notif',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'notifications',
        from: { name: 'Datadog Cloud Watch', address: 'alerts@datadog.com', avatar: 'DD' },
        to: [{ name: 'Apex Cloud Alerts', address: 'notifications@apexanalytics.io' }],
        subject: '[Alert] Pod Autoscale Warning: cluster-eu-central-1 worker pool at 89%',
        bodyText: `DATADOG MONITOR TRIGGERED

Trigger: CPU Core Saturation Alert
Cluster: prod-eu-central-1 (AWS Frankfurt)
Namespace: analytics-ingest-prod
Current Average Utilization: 89.4% (Threshold: 75.0%)

Automated Remediation:
Horizontal Pod Autoscaler (HPA) increased replica count from 12 -> 15 pods.
Health status across all 15 pods: RUNNING.
No packet drops detected.

Dashboard: https://app.datadoghq.com/monitors/901841`,
        timestamp: '2026-09-17T07:40:00Z',
        isOutgoing: false,
      },
    ],
  },

  // Thread 4: VIP Client WhatsApp thread
  {
    id: 'thread-apex-4',
    projectId: 'proj-apex',
    inboxId: 'inbox-apex-wa',
    channel: 'whatsapp',
    inboxRole: 'client',
    subject: 'WhatsApp with Sarah Lin (VP Data at HyperScale)',
    snippet: 'Hey Yehuda! We love the new custom dashboard view. Quick question on our team training session scheduled for next Tuesday...',
    participants: [
      { name: 'Sarah Lin', address: '+1 (650) 412-9981', avatar: 'SL' },
      { name: 'Apex VIP WhatsApp', address: '+1 (415) 890-1200', avatar: 'WA' },
    ],
    lastMessageTimestamp: '2026-09-17T08:10:00Z',
    messageCount: 2,
    isRead: false,
    isStarred: true,
    isArchived: false,
    tags: ['WhatsApp', 'VIP Client'],
    messages: [
      {
        id: 'msg-apex-4-1',
        threadId: 'thread-apex-4',
        inboxId: 'inbox-apex-wa',
        projectId: 'proj-apex',
        channel: 'whatsapp',
        inboxRole: 'client',
        from: { name: 'Sarah Lin', address: '+1 (650) 412-9981', avatar: 'SL' },
        to: [{ name: 'Apex VIP WhatsApp', address: '+1 (415) 890-1200' }],
        subject: 'Team Onboarding Session',
        bodyText: 'Hey Yehuda! We love the new custom dashboard view. Quick question on our team training session scheduled for next Tuesday: can we record the session for our APAC remote team members? Also would you mind sharing the updated slide deck beforehand?',
        timestamp: '2026-09-17T08:02:00Z',
        isOutgoing: false,
      },
      {
        id: 'msg-apex-4-2',
        threadId: 'thread-apex-4',
        inboxId: 'inbox-apex-wa',
        projectId: 'proj-apex',
        channel: 'whatsapp',
        inboxRole: 'client',
        from: { name: 'Sarah Lin', address: '+1 (650) 412-9981', avatar: 'SL' },
        to: [{ name: 'Apex VIP WhatsApp', address: '+1 (415) 890-1200' }],
        subject: 'Team Onboarding Session',
        bodyText: 'Our chief architect also wanted to make sure we cover custom SQL webhook connectors during the demo if possible!',
        timestamp: '2026-09-17T08:10:00Z',
        isOutgoing: false,
      },
    ],
  },

  // Thread 5: Nordic Crafts Support (Gmail)
  {
    id: 'thread-nordic-1',
    projectId: 'proj-nordic',
    inboxId: 'inbox-nordic-care',
    channel: 'gmail',
    inboxRole: 'support',
    subject: 'Order #NC-49102: Address correction request before dispatch',
    snippet: 'Hello, I just placed an order for the Oslo Oak dining bench but realized auto-fill entered my old apartment address...',
    participants: [
      { name: 'Elena Rostova', address: 'e.rostova@designhaus.se', avatar: 'ER' },
      { name: 'Nordic Customer Care', address: 'care@nordiccrafts.store', avatar: 'NC' },
    ],
    lastMessageTimestamp: '2026-09-17T07:48:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: ['Shipping', 'Orders'],
    messages: [
      {
        id: 'msg-nordic-1-1',
        threadId: 'thread-nordic-1',
        inboxId: 'inbox-nordic-care',
        projectId: 'proj-nordic',
        channel: 'gmail',
        inboxRole: 'support',
        from: { name: 'Elena Rostova', address: 'e.rostova@designhaus.se', avatar: 'ER' },
        to: [{ name: 'Nordic Customer Care', address: 'care@nordiccrafts.store' }],
        subject: 'Order #NC-49102: Address correction request before dispatch',
        bodyText: `Hello Nordic Crafts Care,

I placed order #NC-49102 twenty minutes ago for the Oslo Oak dining bench. To my dismay, Google auto-fill populated my previous residence address:
14 Birger Jarlsgatan, Stockholm.

Could you please update the delivery address to my new residence before the courier picks it up tomorrow morning:
48 Strandvägen, Apt 4B
114 56 Stockholm, Sweden

Phone: +46 8 555 1294

Thank you so much!
Elena`,
        timestamp: '2026-09-17T07:48:00Z',
        isOutgoing: false,
      },
    ],
  },

  // Thread 6: Nordic Instagram DM
  {
    id: 'thread-nordic-2',
    projectId: 'proj-nordic',
    inboxId: 'inbox-nordic-ig',
    channel: 'instagram',
    inboxRole: 'sales',
    subject: 'Instagram DM from @scandinavian_interior_spaces',
    snippet: 'Hi! We have 450k design enthusiasts on IG and would love to feature your ceramic vase collection in our autumn guide...',
    participants: [
      { name: 'Scandinavian Spaces', address: '@scandinavian_interior_spaces', avatar: 'SS' },
      { name: 'Nordic Instagram', address: '@nordiccrafts.official', avatar: 'IG' },
    ],
    lastMessageTimestamp: '2026-09-17T08:00:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: true,
    isArchived: false,
    tags: ['Instagram', 'Collab'],
    messages: [
      {
        id: 'msg-nordic-2-1',
        threadId: 'thread-nordic-2',
        inboxId: 'inbox-nordic-ig',
        projectId: 'proj-nordic',
        channel: 'instagram',
        inboxRole: 'sales',
        from: { name: 'Scandinavian Spaces', address: '@scandinavian_interior_spaces', avatar: 'SS' },
        to: [{ name: 'Nordic Crafts', address: '@nordiccrafts.official' }],
        subject: 'Instagram DM Collaboration',
        bodyText: 'Hi Nordic Crafts team! We adore your handcrafted ceramic vases. We are curating our Autumn Living 2026 Lookbook (450k reach) and would love to include two of your stoneware pitchers in our upcoming Copenhagen studio shoot. Do you have a press kit or gifting program?',
        timestamp: '2026-09-17T08:00:00Z',
        isOutgoing: false,
      },
    ],
  },

  // Thread 7: Zenith Deals (Zoho Mail)
  {
    id: 'thread-zenith-1',
    projectId: 'proj-zenith',
    inboxId: 'inbox-zenith-deals',
    channel: 'zoho',
    inboxRole: 'sales',
    subject: 'Series A Term Sheet Review - Project Cobalt AI',
    snippet: 'Yehuda, attached is the revised clause 4.2 governing board observer rights and liquidation preferences agreed upon in Zurich...',
    participants: [
      { name: 'Julian Sterling (Sterling Law)', address: 'j.sterling@sterlinglaw.ch', avatar: 'JS' },
      { name: 'Zenith Dealflow Desk', address: 'deals@zenithpartners.co', avatar: 'ZD' },
    ],
    lastMessageTimestamp: '2026-09-17T07:15:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: true,
    isArchived: false,
    tags: ['Deals', 'Legal'],
    messages: [
      {
        id: 'msg-zenith-1-1',
        threadId: 'thread-zenith-1',
        inboxId: 'inbox-zenith-deals',
        projectId: 'proj-zenith',
        channel: 'zoho',
        inboxRole: 'sales',
        from: { name: 'Julian Sterling', address: 'j.sterling@sterlinglaw.ch', avatar: 'JS' },
        to: [{ name: 'Zenith Dealflow Desk', address: 'deals@zenithpartners.co' }],
        subject: 'Series A Term Sheet Review - Project Cobalt AI',
        bodyText: `Dear Yehuda,

Following our working session in Zurich on Monday, our legal counsel has incorporated the revised investor protective provisions into Clause 4.2.

Key highlights:
- 1x non-participating liquidation preference retained
- Founder vesting reset to 4-year with 1-year cliff
- Board composition: 2 Founders, 1 Zenith designee, 1 Independent industry expert

Please review the redline attached and confirm if you are prepared to countersign before our Friday syndicate closing.

Kind regards,
Julian Sterling
Partner | Sterling & Co. Geneva / Zurich`,
        timestamp: '2026-09-17T07:15:00Z',
        isOutgoing: false,
        attachments: [
          { name: 'Term_Sheet_Cobalt_Redline_v4.docx', size: '2.8 MB', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        ],
      },
    ],
  },
];

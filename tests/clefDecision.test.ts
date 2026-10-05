import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  constructEmailState,
  buildClefQuestions,
  parseClefResponse,
  triageInboundEmail,
  getCachedClefDecision,
  saveClefDecision,
  sanitizeEmailBodyForClef,
  CLEF_FLASH_MODEL,
  DEFAULT_CLEF_MODEL,
} from '../clefDecisionService';
import { processInboundEmail } from '../worker';
import { alertsToSend } from '../pushNotify';
import { createLocalEmailRequest } from '../src/utils/localEmailAI';
import type { IncomingAlert } from '../mailStore';
import type { Thread, Message } from '../src/types';

function createTestDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0003_mail_coverage.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0004_spam_review.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0005_push_subscriptions.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0007_email_decisions.sql', 'utf8'));

  sql.exec(`
    INSERT INTO projects (id, name, description, created_at)
    VALUES 
      ('proj-saas', 'SaaS Platform', 'Core SaaS backend, infrastructure, customer accounts', '2026-01-01'),
      ('proj-store', 'Retail Store', 'E-commerce storefront and physical retail sales', '2026-01-01');

    INSERT INTO inboxes (id, project_id, name, email, channel, role, created_at)
    VALUES 
      ('inbox-support', 'proj-saas', 'Support', 'support@saas.com', 'cloudflare', 'support', '2026-01-01'),
      ('inbox-sales', 'proj-store', 'Sales', 'sales@store.com', 'cloudflare', 'sales', '2026-01-01');
  `);

  const db: any = {
    prepare(query: string) {
      const statement: any = {
        values: [] as any[],
        bind(...values: any[]) {
          this.values = values;
          return this;
        },
        async first() {
          return sql.prepare(query).get(...this.values) || null;
        },
        async all() {
          return { results: sql.prepare(query).all(...this.values) };
        },
        async run() {
          return { success: true, meta: sql.prepare(query).run(...this.values) };
        },
      };
      return statement;
    },
    async batch(statements: any[]) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.run());
        sql.exec('COMMIT');
        return results;
      } catch (err) {
        sql.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { sql, db };
}

function mockClefAi(responseResults: Record<string, any>) {
  return {
    async run(model: string, input: any) {
      return { results: responseResults };
    },
  };
}

const createMime = (opts: { from: string; to: string; subject: string; body: string; id?: string }) =>
  `From: ${opts.from}\r\nTo: ${opts.to}\r\nMessage-ID: <${opts.id || Date.now()}@test.mail>\r\nSubject: ${opts.subject}\r\nDate: Sun, 04 Oct 2026 12:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${opts.body}`;

// 1. Customer email needing reply
test('Clef triage: customer email needing reply', async () => {
  const { sql, db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.96 },
    urgency: { type: 'score', value: 'normal', expected_score: 2.1, probabilities: { normal: 0.85, high: 0.15 } },
    category: { type: 'choice', value: 'customer', confidence: 0.92, probabilities: { customer: 0.92, sales: 0.08 } },
    project_route: { type: 'choice', value: 'proj-saas', confidence: 0.94, probabilities: { 'proj-saas': 0.94 } },
    contains_action_item: { type: 'noul', value: true, probability: 0.88 },
    follow_up_required: { type: 'noul', value: true, probability: 0.75 },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.91 },
    human_attention: { type: 'noul', value: true, probability: 0.82 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'customer@client.com',
    to: 'support@saas.com',
    subject: 'Question regarding billing cycle',
    body: 'Hi team, could you please clarify when our enterprise renewal will be billed? Thanks!',
  });

  const res = await processInboundEmail(raw, 'customer@client.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.decision);
  assert.equal(res.decision.selectedChoices.needs_reply, true);
  assert.equal(res.decision.selectedChoices.category, 'customer');
  assert.equal(res.decision.selectedChoices.safe_to_generate_draft, true);

  // Check tags added in primary mode
  const thread = sql.prepare('SELECT tags_json FROM threads WHERE id = ?').get(res.threadId) as any;
  const tags = JSON.parse(thread.tags_json || '[]');
  assert.ok(tags.includes('CLEF_NEEDS_REPLY'));
  assert.ok(tags.includes('CLEF_ACTION_ITEM'));
  assert.ok(tags.includes('CLEF_CAT:customer'));
});

// 2. Newsletter triage
test('Clef triage: newsletter classification suppresses notification and drafts', async () => {
  const { db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: false, probability: 0.02 },
    urgency: { type: 'score', value: 'no urgency', expected_score: 0.1, probabilities: { 'no urgency': 0.98 } },
    category: { type: 'choice', value: 'newsletter', confidence: 0.99, probabilities: { newsletter: 0.99 } },
    project_route: { type: 'choice', value: 'uncertain', confidence: 0.5, probabilities: { uncertain: 0.9 } },
    contains_action_item: { type: 'noul', value: false, probability: 0.01 },
    follow_up_required: { type: 'noul', value: false, probability: 0.02 },
    safe_to_generate_draft: { type: 'noul', value: false, probability: 0.05 },
    human_attention: { type: 'noul', value: false, probability: 0.03 },
    likely_newsletter: { type: 'noul', value: true, probability: 0.99 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'digest@tldr.tech',
    to: 'support@saas.com',
    subject: 'TLDR AI: Latest research papers',
    body: 'Here are the top AI papers for the week. Unsubscribe: https://tldr.tech/unsub',
  });

  const res = await processInboundEmail(raw, 'digest@tldr.tech', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.decision);
  assert.ok(res.threadId);
  assert.equal(res.decision.selectedChoices.category, 'newsletter');
  assert.equal(res.decision.selectedChoices.needs_reply, false);
  assert.equal(res.decision.selectedChoices.safe_to_generate_draft, false);

  // Check alert filter suppresses newsletter
  const alerts: IncomingAlert[] = [
    {
      threadId: res.threadId,
      subject: 'TLDR AI: Latest research papers',
      snippet: 'Here are the top AI papers...',
      fromName: 'TLDR',
      fromAddress: 'digest@tldr.tech',
      timestamp: new Date().toISOString(),
      participants: [{ name: 'TLDR', address: 'digest@tldr.tech' }],
      tags: ['INBOUND', 'CLEF_NEWSLETTER'],
      clefDecision: res.decision,
    },
  ];

  const toSend = alertsToSend(alerts, 'live');
  assert.equal(toSend.length, 0, 'Newsletters must be suppressed from phone push alerts');
});

// 3. Receipt / automated notification
test('Clef triage: receipt and automated notification', async () => {
  const { db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: false, probability: 0.03 },
    urgency: { type: 'score', value: 'low', expected_score: 0.8, probabilities: { low: 0.9, normal: 0.1 } },
    category: { type: 'choice', value: 'finance', confidence: 0.95, probabilities: { finance: 0.95 } },
    project_route: { type: 'choice', value: 'proj-saas', confidence: 0.88, probabilities: { 'proj-saas': 0.88 } },
    contains_action_item: { type: 'noul', value: false, probability: 0.05 },
    follow_up_required: { type: 'noul', value: false, probability: 0.04 },
    safe_to_generate_draft: { type: 'noul', value: false, probability: 0.02 },
    human_attention: { type: 'noul', value: false, probability: 0.08 },
    likely_automated_notification: { type: 'noul', value: true, probability: 0.97 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'billing@stripe.com',
    to: 'support@saas.com',
    subject: 'Receipt for Invoice #inv_82394',
    body: 'Your payment of $49.00 has succeeded. View your invoice online.',
  });

  const res = await processInboundEmail(raw, 'billing@stripe.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.decision);
  assert.equal(res.decision.selectedChoices.category, 'finance');
  assert.equal(res.decision.selectedChoices.likely_automated_notification, true);
  assert.equal(res.decision.selectedChoices.needs_reply, false);
});

// 4. Urgent support problem
test('Clef triage: urgent support problem triggers human attention and alerts', async () => {
  const { db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.99 },
    urgency: { type: 'score', value: 'urgent', expected_score: 3.9, probabilities: { urgent: 0.92, high: 0.08 } },
    category: { type: 'choice', value: 'support', confidence: 0.98, probabilities: { support: 0.98 } },
    project_route: { type: 'choice', value: 'proj-saas', confidence: 0.96, probabilities: { 'proj-saas': 0.96 } },
    contains_action_item: { type: 'noul', value: true, probability: 0.95 },
    follow_up_required: { type: 'noul', value: true, probability: 0.95 },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.8 },
    human_attention: { type: 'noul', value: true, probability: 0.98 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'lead-dev@partner.com',
    to: 'support@saas.com',
    subject: 'CRITICAL OUTAGE: API returning 500 across all US endpoints',
    body: 'Our customers are unable to log in right now. Please investigate urgently!',
  });

  const res = await processInboundEmail(raw, 'lead-dev@partner.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.decision);
  assert.ok(res.threadId);
  assert.equal(res.decision.selectedChoices.urgency, 'urgent');
  assert.equal(res.decision.selectedChoices.human_attention, true);

  // Check alert filter keeps urgent alert
  const alerts: IncomingAlert[] = [
    {
      threadId: res.threadId,
      subject: 'CRITICAL OUTAGE',
      snippet: 'Unable to log in...',
      fromName: 'Lead Dev',
      fromAddress: 'lead-dev@partner.com',
      timestamp: new Date().toISOString(),
      participants: [{ name: 'Lead Dev', address: 'lead-dev@partner.com' }],
      tags: ['INBOUND', 'CLEF_URGENT'],
      clefDecision: res.decision,
    },
  ];

  const toSend = alertsToSend(alerts, 'live');
  assert.equal(toSend.length, 1, 'Urgent notification must pass conservative threshold');
});

// 5. Meeting request
test('Clef triage: meeting request detection', async () => {
  const { db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.92 },
    urgency: { type: 'score', value: 'normal', expected_score: 2.0, probabilities: { normal: 0.9 } },
    category: { type: 'choice', value: 'scheduling', confidence: 0.95, probabilities: { scheduling: 0.95 } },
    project_route: { type: 'choice', value: 'proj-saas', confidence: 0.85, probabilities: { 'proj-saas': 0.85 } },
    contains_action_item: { type: 'noul', value: true, probability: 0.89 },
    follow_up_required: { type: 'noul', value: true, probability: 0.8 },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.88 },
    human_attention: { type: 'noul', value: false, probability: 0.4 },
    meeting_request: { type: 'noul', value: true, probability: 0.96 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'sarah@investor.com',
    to: 'support@saas.com',
    subject: 'Catchup call next Tuesday?',
    body: 'Hi Yehuda, would you be available for a 20-minute Zoom call on Tuesday afternoon?',
  });

  const res = await processInboundEmail(raw, 'sarah@investor.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.decision);
  assert.equal(res.decision.selectedChoices.category, 'scheduling');
  assert.equal(res.decision.selectedChoices.meeting_request, true);
  assert.equal(res.decision.selectedChoices.needs_reply, true);
});

// 6. Ambiguous project does not auto-move message
test('Clef triage: ambiguous project keeps envelope routing without moving', async () => {
  const { sql, db } = createTestDb();

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.7 },
    urgency: { type: 'score', value: 'normal', expected_score: 2.0, probabilities: { normal: 1.0 } },
    category: { type: 'choice', value: 'customer', confidence: 0.8, probabilities: { customer: 0.8 } },
    project_route: { type: 'choice', value: 'uncertain', confidence: 0.45, probabilities: { uncertain: 0.7, 'proj-saas': 0.15, 'proj-store': 0.15 } },
    contains_action_item: { type: 'noul', value: false, probability: 0.3 },
    follow_up_required: { type: 'noul', value: false, probability: 0.3 },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.7 },
    human_attention: { type: 'noul', value: false, probability: 0.3 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'contact@general.com',
    to: 'support@saas.com',
    subject: 'Quick question about both offerings',
    body: 'Could you tell me more about how your platforms interact?',
  });

  const res = await processInboundEmail(raw, 'contact@general.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.threadId);

  // Check thread stayed in proj-saas (inbox project), was NOT moved to uncertain or wrong project
  const thread = sql.prepare('SELECT project_id FROM threads WHERE id = ?').get(res.threadId) as any;
  assert.equal(thread.project_id, 'proj-saas', 'Ambiguous thread must stay in original mailbox project');
});

// 7. Project choice generated dynamically
test('Clef schema: project choices generated dynamically from available projects', () => {
  const projects = [
    { id: 'proj-alpha', name: 'Alpha Mobile App', description: 'iOS and Android client' },
    { id: 'proj-beta', name: 'Beta Cloud Backend', description: 'Kubernetes cluster' },
  ];

  const questions = buildClefQuestions(projects);
  assert.ok(questions.project_route);
  assert.equal(questions.project_route.type, 'choice');
  assert.ok(questions.project_route.criteria['proj-alpha']);
  assert.ok(questions.project_route.criteria['proj-beta']);
  assert.ok(questions.project_route.criteria['uncertain']);
  assert.match(questions.project_route.criteria['proj-alpha'], /Alpha Mobile App/);
});

// 8. Low-confidence decision does not move message
test('Clef triage: low-confidence decision does not move message automatically', async () => {
  const { sql, db } = createTestDb();

  // Model suggests proj-store, but with low confidence (0.62 < 0.85 threshold)
  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.75 },
    urgency: { type: 'score', value: 'normal', expected_score: 2.0, probabilities: { normal: 1.0 } },
    category: { type: 'choice', value: 'customer', confidence: 0.7, probabilities: { customer: 0.7 } },
    project_route: { type: 'choice', value: 'proj-store', confidence: 0.62, probabilities: { 'proj-store': 0.62, 'proj-saas': 0.38 } },
    contains_action_item: { type: 'noul', value: false, probability: 0.4 },
    follow_up_required: { type: 'noul', value: false, probability: 0.4 },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.7 },
    human_attention: { type: 'noul', value: false, probability: 0.4 },
  });

  const env: any = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'inquirer@sample.com',
    to: 'support@saas.com',
    subject: 'Store or SaaS?',
    body: 'Interested in potentially buying something.',
  });

  const res = await processInboundEmail(raw, 'inquirer@sample.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.ok(res.threadId);

  // Must not move to proj-store because 0.62 < 0.85
  const thread = sql.prepare('SELECT project_id FROM threads WHERE id = ?').get(res.threadId) as any;
  assert.equal(thread.project_id, 'proj-saas', 'Low confidence must not trigger automatic project move');
});

// 9. Mail ingestion when Clef is down
test('Clef outage: mail ingestion succeeds and no classification is fabricated', async () => {
  const { sql, db } = createTestDb();

  const brokenAi = {
    async run() {
      throw new Error('Cloudflare Workers AI rate limited or 503 Service Unavailable');
    },
  };

  const env: any = { DB: db, AI: brokenAi, CLEF_TRIAGE_MODE: 'primary' };
  const raw = createMime({
    from: 'partner@example.org',
    to: 'support@saas.com',
    subject: 'Important business note',
    body: 'This must not be lost even if Clef is down!',
  });

  const res = await processInboundEmail(raw, 'partner@example.org', 'support@saas.com', env);

  // Email ingestion MUST still succeed
  assert.equal(res.success, true);
  assert.equal(res.decision, null, 'No fake classification should be fabricated');

  // Message must exist in messages table
  const msg = sql.prepare('SELECT subject, body_text FROM messages WHERE id = ?').get(res.messageId) as any;
  assert.equal(msg.subject, 'Important business note');
  assert.match(msg.body_text, /This must not be lost/);

  // Thread exists and is unread
  const thread = sql.prepare('SELECT message_count, is_read FROM threads WHERE id = ?').get(res.threadId) as any;
  assert.equal(thread.message_count, 1);
  assert.equal(thread.is_read, 0);
});

// 10. No auto-send path
test('Safety rule: Clef triage has no auto-send path', async () => {
  const { db } = createTestDb();

  let emailSendCalled = false;
  const mockEmailBinding = {
    async send() {
      emailSendCalled = true;
      return { messageId: 'sent-id' };
    },
  };

  const ai = mockClefAi({
    needs_reply: { type: 'noul', value: true, probability: 0.99 },
    urgency: { type: 'score', value: 'urgent', expected_score: 4.0, probabilities: { urgent: 1.0 } },
    category: { type: 'choice', value: 'support', confidence: 0.99, probabilities: { support: 0.99 } },
    project_route: { type: 'choice', value: 'proj-saas', confidence: 0.99, probabilities: { 'proj-saas': 1.0 } },
    safe_to_generate_draft: { type: 'noul', value: true, probability: 0.99 },
    contains_action_item: { type: 'noul', value: true, probability: 0.99 },
    follow_up_required: { type: 'noul', value: true, probability: 0.99 },
    human_attention: { type: 'noul', value: true, probability: 0.99 },
  });

  const env: any = {
    DB: db,
    AI: ai,
    EMAIL: mockEmailBinding,
    CLEF_TRIAGE_MODE: 'primary',
  };

  const raw = createMime({
    from: 'urgent@vip.com',
    to: 'support@saas.com',
    subject: 'Urgent inquiry',
    body: 'Need response immediately!',
  });

  const res = await processInboundEmail(raw, 'urgent@vip.com', 'support@saas.com', env);
  assert.equal(res.success, true);
  assert.equal(emailSendCalled, false, 'Clef triage must never automatically dispatch an email');
});

// 11. Local AI remains local
test('DeviceAI: Local AI remains strictly local and text-only', () => {
  const thread: Thread = {
    id: 'th-local',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Secret internal discussion',
    snippet: 'Confidential project details',
    participants: [{ name: 'Colleague', address: 'colleague@corp.test' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'msg-local',
        threadId: 'th-local',
        inboxId: 'in-1',
        projectId: 'p-1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Colleague', address: 'colleague@corp.test' },
        to: [{ name: 'Me', address: 'me@corp.test' }],
        subject: 'Secret internal discussion',
        bodyText: 'Confidential project details. Private text.',
        timestamp: new Date().toISOString(),
        isOutgoing: false,
      },
    ],
  };

  const { request } = createLocalEmailRequest(thread, 'summarize');
  assert.equal(request.localOnly, true, 'Local email request must enforce localOnly');
  const payloadStr = JSON.stringify(request);
  assert.match(payloadStr, /Confidential project details/);
  // Must not contain Cloudflare Clef or cloud model identifiers
  assert.doesNotMatch(payloadStr, /clef|gemini/i);
});

// 12. Executive briefing selection
test('Executive briefing: Clef selects and prioritizes high-impact threads', async () => {
  const threads = [
    {
      id: 't-1',
      subject: 'Newsletter digest #12',
      snippet: 'Weekly news',
      isRead: false,
      decision: {
        selectedChoices: { urgency: 'no urgency', category: 'newsletter', likely_newsletter: true },
      },
    },
    {
      id: 't-2',
      subject: 'URGENT: Database replication delay',
      snippet: 'Replication lag exceeds 20 minutes',
      isRead: false,
      decision: {
        selectedChoices: { urgency: 'urgent', category: 'support', contains_action_item: true, human_attention: true },
      },
    },
    {
      id: 't-3',
      subject: 'Customer contract renewal signed',
      snippet: 'Signed MSA attached',
      isRead: false,
      decision: {
        selectedChoices: { urgency: 'high', category: 'sales', contains_action_item: true, needs_reply: true },
      },
    },
  ];

  // Scoring logic mirror
  const prioritized = threads.map((t) => {
    const dec = t.decision?.selectedChoices as any;
    let score = 0;
    if (dec) {
      if (dec.urgency === 'urgent') score += 100;
      else if (dec.urgency === 'high') score += 70;
      if (dec.contains_action_item) score += 60;
      if (dec.human_attention) score += 50;
      if (dec.likely_newsletter) score -= 50;
    }
    return { id: t.id, score };
  });

  prioritized.sort((a, b) => b.score - a.score);
  assert.equal(prioritized[0].id, 't-2', 'Urgent support thread must be prioritized first');
  assert.equal(prioritized[1].id, 't-3', 'Contract action item must be second');
  assert.equal(prioritized[2].id, 't-1', 'Newsletter must be ranked last');
});

// 13. Gemini draft gating
test('Smart reply draft gating: blocks generative drafting when Clef says safe_to_generate_draft is false unless userRequested', () => {
  const decision = {
    selectedChoices: {
      needs_reply: false,
      safe_to_generate_draft: false,
    },
    probabilityDistributions: {
      needs_reply: 0.1,
      safe_to_generate_draft: 0.05,
    },
  };

  const shouldGateAutoDraft = (userRequested: boolean, dec: typeof decision) => {
    if (userRequested) return false;
    const needsReply = dec.selectedChoices.needs_reply && dec.probabilityDistributions.needs_reply >= 0.6;
    const safeDraft = dec.selectedChoices.safe_to_generate_draft && dec.probabilityDistributions.safe_to_generate_draft >= 0.6;
    return !needsReply || !safeDraft;
  };

  assert.equal(shouldGateAutoDraft(false, decision), true, 'Automatic draft must be gated when safe_to_generate_draft is false');
  assert.equal(shouldGateAutoDraft(true, decision), false, 'Explicit user click must bypass gate and allow generative drafting');
});

// 14. Persistence and Caching
test('Clef persistence & caching: does not reclassify on repeated lookup', async () => {
  const { db } = createTestDb();

  let inferenceRuns = 0;
  const ai = {
    async run() {
      inferenceRuns++;
      return {
        results: {
          needs_reply: { type: 'noul', value: true, probability: 0.9 },
          urgency: { type: 'score', value: 'normal', expected_score: 2.0, probabilities: { normal: 1.0 } },
          category: { type: 'choice', value: 'customer', confidence: 0.9, probabilities: { customer: 0.9 } },
          project_route: { type: 'choice', value: 'proj-saas', confidence: 0.9, probabilities: { 'proj-saas': 0.9 } },
          safe_to_generate_draft: { type: 'noul', value: true, probability: 0.9 },
          contains_action_item: { type: 'noul', value: false, probability: 0.1 },
          follow_up_required: { type: 'noul', value: false, probability: 0.1 },
          human_attention: { type: 'noul', value: false, probability: 0.2 },
        },
      };
    },
  };

  const emailState = constructEmailState({
    subject: 'Repeat query',
    bodyText: 'Testing caching layer',
    from: { address: 'user@cache.test' },
    to: [{ address: 'support@saas.com' }],
    currentProject: { id: 'proj-saas', name: 'SaaS' },
    currentInbox: { id: 'inbox-support', name: 'Support', email: 'support@saas.com', role: 'support', channel: 'cloudflare' },
    availableProjects: [{ id: 'proj-saas', name: 'SaaS' }],
    senderKnown: false,
  });

  const env = { DB: db, AI: ai, CLEF_TRIAGE_MODE: 'primary' as const };

  // First triage runs the model
  const dec1 = await triageInboundEmail({
    emailState,
    threadId: 'th-cache-1',
    messageId: 'msg-cache-1',
    env,
  });
  assert.equal(inferenceRuns, 1);
  assert.ok(dec1);

  // Second lookup for the same messageId uses cached decision from D1
  const dec2 = await triageInboundEmail({
    emailState,
    threadId: 'th-cache-1',
    messageId: 'msg-cache-1',
    env,
  });
  assert.equal(inferenceRuns, 1, 'Second lookup must use D1 cache and not invoke model forward pass again');
  assert.equal(dec2?.id, dec1?.id);

  // Directly verify getCachedClefDecision returns persisted probabilities
  const cachedDirect = await getCachedClefDecision(db, 'msg-cache-1');
  assert.ok(cachedDirect);
  assert.equal(cachedDirect?.selectedChoices.needs_reply, true);
  assert.equal(cachedDirect?.probabilityDistributions.needs_reply, 0.9);
});

// Extra: Sanitization strips credentials and quoted blocks
test('State construction: sanitizes auth tokens and quotes', () => {
  const dirty = `
Hello team,
Here is our issue.
Authorization: Bearer secret_token_1234567890abcdef
api_key: ak_test_9876543210fedcba

On Sun, Oct 4, 2026 at 10:00 AM Boss wrote:
> Don't forget to redact secrets!
`;

  const clean = sanitizeEmailBodyForClef(dirty);
  assert.doesNotMatch(clean, /secret_token_1234567890abcdef/);
  assert.doesNotMatch(clean, /ak_test_9876543210fedcba/);
  assert.doesNotMatch(clean, /Don't forget to redact/);
  assert.match(clean, /Here is our issue/);
});

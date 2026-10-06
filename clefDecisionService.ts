import type { D1Database } from '@cloudflare/workers-types';
import type {
  ClefDecision,
  ClefProbabilityDistributions,
  ClefSelectedChoices,
  ClefUrgencyLevel,
} from './src/types';

export type {
  ClefDecision,
  ClefProbabilityDistributions,
  ClefSelectedChoices,
  ClefUrgencyLevel,
};

export const CLEF_FLASH_MODEL = '@cf/cloudflare/clef-flash';
export const CLEF_FULL_MODEL = '@cf/cloudflare/clef';
export const DEFAULT_CLEF_MODEL = CLEF_FLASH_MODEL;
export const CLEF_SCHEMA_VERSION = 'v1';

export type ClefTriageMode = 'off' | 'shadow' | 'primary';

export interface WorkersAiBinding {
  run(model: string, inputs: any, options?: any): Promise<any>;
}

export interface ClefEmailState {
  subject: string;
  plainTextBody: string;
  sender: {
    name: string;
    address: string;
    domain: string;
  };
  recipients: {
    name: string;
    address: string;
  }[];
  project: {
    id: string;
    name: string;
    description?: string;
  };
  mailbox: {
    id: string;
    name: string;
    email: string;
    role: string;
    channel: string;
  };
  threadContext: {
    sender: string;
    bodySnippet: string;
    timestamp: string;
    isOutgoing: boolean;
  }[];
  senderExistsInHistory: boolean;
  previousThreadDirection: 'inbound' | 'outbound' | 'none';
  availableProjects: {
    id: string;
    name: string;
    description?: string;
  }[];
}

/** Sanitize and strip quoted text, tokens, auth headers, and sensitive auth data */
export function sanitizeEmailBodyForClef(rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText;

  // 1. Strip standard quoted reply blocks to keep bounding sensible
  const quoteMarkers = [
    /\n(?=On [A-Za-z]+, [A-Za-z0-9 ,:]+ wrote:)/i,
    /\n(?=---+\s*Original Message\s*---+)/i,
    /\n(?=_{10,})/i,
    /\n(?=>\s)/,
    /\n(?=From:\s+[^\n]+\s+Sent:\s+)/i,
  ];

  for (const regex of quoteMarkers) {
    const match = cleaned.search(regex);
    if (match !== -1) {
      cleaned = cleaned.slice(0, match);
      break;
    }
  }

  // 2. Strip sensitive credentials, auth headers, and bearer tokens
  cleaned = cleaned.replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, '[REDACTED_TOKEN]');
  cleaned = cleaned.replace(/authorization:\s*[^\n]+/gi, '[REDACTED_AUTH]');
  cleaned = cleaned.replace(/api[_-]?key[:=]\s*[a-zA-Z0-9_\-]{16,}/gi, '[REDACTED_KEY]');
  cleaned = cleaned.replace(/password[:=]\s*[^\s]+/gi, '[REDACTED_PASSWORD]');

  // 3. Normalize whitespace and bound character limit (e.g. 6,000 chars)
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 6000) {
    cleaned = cleaned.slice(0, 6000) + '... [Historical content truncated for triage]';
  }

  return cleaned;
}

/** Pure state constructor matching requirements */
export function constructEmailState(params: {
  subject: string;
  bodyText: string;
  from: { name?: string; address: string };
  to: { name?: string; address: string }[];
  currentProject: { id: string; name: string; description?: string };
  currentInbox: { id: string; name: string; email: string; role: string; channel: string };
  availableProjects: { id: string; name: string; description?: string }[];
  senderKnown: boolean;
  threadHistory?: { from: string; bodyText: string; timestamp: string; isOutgoing: boolean }[];
}): ClefEmailState {
  const fromAddress = (params.from.address || '').toLowerCase().trim();
  const domain = fromAddress.includes('@') ? fromAddress.split('@')[1] : '';
  const fromName = params.from.name || fromAddress;

  const sanitizedBody = sanitizeEmailBodyForClef(params.bodyText);

  const boundedHistory = (params.threadHistory || []).slice(-3).map((h) => ({
    sender: h.from,
    bodySnippet: sanitizeEmailBodyForClef(h.bodyText).slice(0, 150),
    timestamp: h.timestamp,
    isOutgoing: h.isOutgoing,
  }));

  const lastMessage = boundedHistory.length > 0 ? boundedHistory[boundedHistory.length - 1] : null;
  const previousThreadDirection: 'inbound' | 'outbound' | 'none' = !lastMessage
    ? 'none'
    : lastMessage.isOutgoing
      ? 'outbound'
      : 'inbound';

  return {
    subject: (params.subject || '').trim() || '(No Subject)',
    plainTextBody: sanitizedBody,
    sender: {
      name: fromName,
      address: fromAddress,
      domain,
    },
    recipients: (params.to || []).map((t) => ({
      name: t.name || t.address,
      address: (t.address || '').toLowerCase().trim(),
    })),
    project: params.currentProject,
    mailbox: params.currentInbox,
    threadContext: boundedHistory,
    senderExistsInHistory: params.senderKnown,
    previousThreadDirection,
    availableProjects: params.availableProjects,
  };
}

export const CLEF_URGENCY_LEVELS: ClefUrgencyLevel[] = ['no urgency', 'low', 'normal', 'high', 'urgent'];

/**
 * Build the typed question schema for Workers AI Clef.
 * Schema: https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-input.json
 * - noul: { type, instructions }
 * - choice: { type, instructions, criteria: { optionId: description } } with 2-255 options
 * - score: { type, instructions, criteria: [lowest, ..., highest] } with 2-10 levels
 * Unknown keys are rejected by the API, so every question must match one of these shapes exactly.
 */
export function buildClefQuestions(availableProjects: { id: string; name: string; description?: string }[]) {
  const projectCriteria: Record<string, string> = {};
  for (const p of availableProjects) {
    projectCriteria[p.id] = `${p.name}: ${p.description || 'Project mailbox'}`;
  }
  projectCriteria['uncertain'] = 'Ambiguous message; not clearly designated for any single project';

  const questions: Record<string, any> = {
    needs_reply: {
      type: 'noul',
      instructions: 'Does this message reasonably require a response from the user?',
    },
    urgency: {
      type: 'score',
      instructions: 'Rate the urgency of this message on the rubric: no urgency, low, normal, high, urgent.',
      criteria: [...CLEF_URGENCY_LEVELS],
    },
    category: {
      type: 'choice',
      instructions: 'Categorize the primary operational nature of this email.',
      criteria: {
        customer: 'Customer inquiries, requests, feedback, or business client questions',
        sales: 'Sales pitches, outbound leads, deals, new commercial prospects',
        vendor: 'Notices, communications, invoices, or updates from vendors and third-party services',
        finance: 'Billing statements, invoices, receipts, payments, banking, tax',
        scheduling: 'Calendar invites, meeting requests, rescheduling or availability checks',
        support: 'Technical support tickets, system outages, bug reports, account access issues',
        personal: 'Direct personal messages from friends, family, or personal acquaintances',
        newsletter: 'Newsletters, marketing content, curated digests, publications, promotional updates',
        automated: 'Automated notifications, system alerts, one-time passwords (OTP), status updates',
        spam: 'Unsolicited junk, unsolicited promotions, scams, phishing, or deceptive mail',
        other: 'General communication not fitting other categories',
      },
    },
    contains_action_item: {
      type: 'noul',
      instructions: 'Does this message contain one or more concrete action items or tasks for the user?',
    },
    follow_up_required: {
      type: 'noul',
      instructions: 'Will this conversation require future tracking or follow-up beyond an initial acknowledgment?',
    },
    safe_to_generate_draft: {
      type: 'noul',
      instructions:
        'Is it safe and appropriate to generate an AI draft reply? (False if hostile, sensitive legal/financial risk, automated, spam, or no response is sensible).',
    },
    human_attention: {
      type: 'noul',
      instructions:
        'Should this thread be surfaced prominently for human attention (e.g. VIP, urgent outage, customer complaint)?',
    },
    likely_newsletter: {
      type: 'noul',
      instructions: 'Is this message a newsletter, publication, or promotional mailing list digest?',
    },
    likely_automated_notification: {
      type: 'noul',
      instructions: 'Is this an automated notification, transactional alert, or machine-generated receipt?',
    },
    meeting_request: {
      type: 'noul',
      instructions: 'Is the sender requesting or scheduling a meeting, phone call, or calendar appointment?',
    },
  };

  // A choice needs at least two options; with no projects there is nothing to route between.
  if (Object.keys(projectCriteria).length >= 2) {
    questions.project_route = {
      type: 'choice',
      instructions: 'Select the best organizational project route for this thread, or uncertain if ambiguous.',
      criteria: projectCriteria,
    };
  }
  return questions;
}

/** Parses raw SystemOne / Clef response into standardized ClefDecision */
export function parseClefResponse(
  rawResponse: any,
  meta: {
    id: string;
    threadId: string;
    messageId?: string;
    model: string;
    mode: ClefTriageMode;
    latencyMs: number;
  }
): ClefDecision {
  // Workers AI Clef returns { answers: { id: { type, noul | choice | score, ... } } }.
  // Older mocks used { results: { id: { value, probability } } }; both are accepted.
  const results = rawResponse?.answers || rawResponse?.results || rawResponse || {};
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  // 1. Helper to extract noul (probability + boolean)
  const parseNoul = (qName: string, defaultProb = 0.5): { value: boolean; probability: number } => {
    const item = results[qName];
    if (!item) return { value: false, probability: defaultProb };
    const raw = typeof item.noul === 'number' ? item.noul : typeof item.probability === 'number' ? item.probability : (item.prob ?? 0.5);
    const prob = clamp01(raw);
    const val = typeof item.value === 'boolean' ? item.value : prob >= 0.5;
    return { value: val, probability: prob };
  };

  // 2. Helper to extract choice
  const parseChoice = (
    qName: string,
    fallbackValue: string
  ): { value: string; confidence: number; probabilities: Record<string, number> } => {
    const item = results[qName];
    if (!item) {
      return {
        value: fallbackValue,
        confidence: 0.5,
        probabilities: { [fallbackValue]: 1.0 },
      };
    }
    const val = String(item.choice || item.value || fallbackValue);
    const conf = typeof item.confidence === 'number' ? clamp01(item.confidence) : 0.8;
    const probs = item.probabilities && typeof item.probabilities === 'object' ? item.probabilities : { [val]: conf };
    return { value: val, confidence: conf, probabilities: probs };
  };

  // 3. Helper to extract score. Clef reports levels by index ("0".."4") with a legend of descriptions.
  const parseScore = (
    qName: string
  ): { value: ClefUrgencyLevel; expected_score: number; probabilities: Record<string, number> } => {
    const item = results[qName];
    const levels = CLEF_URGENCY_LEVELS;
    if (!item) {
      return {
        value: 'normal',
        expected_score: 2.0,
        probabilities: { normal: 1.0 },
      };
    }
    const levelName = (key: string): string => {
      if (levels.includes(key as ClefUrgencyLevel)) return key;
      const fromLegend = item.legend?.[key];
      if (typeof fromLegend === 'string' && levels.includes(fromLegend as ClefUrgencyLevel)) return fromLegend;
      const index = Number(key);
      return Number.isInteger(index) && levels[index] ? levels[index] : key;
    };
    let probs: Record<string, number> = {};
    if (item.probabilities && typeof item.probabilities === 'object') {
      for (const [key, p] of Object.entries(item.probabilities)) {
        if (typeof p === 'number') probs[levelName(key)] = (probs[levelName(key)] || 0) + p;
      }
    }
    let val: ClefUrgencyLevel;
    if (typeof item.value === 'string' || typeof item.level === 'string') {
      val = String(item.value || item.level) as ClefUrgencyLevel;
    } else {
      // Most probable level; fall back to rounding the probability-weighted score.
      const ranked = Object.entries(probs).filter(([k]) => levels.includes(k as ClefUrgencyLevel)).sort((a, b) => b[1] - a[1]);
      val = (ranked[0]?.[0] as ClefUrgencyLevel) ||
        (typeof item.score === 'number' ? levels[Math.max(0, Math.min(levels.length - 1, Math.round(item.score)))] : 'normal');
    }
    if (!levels.includes(val)) val = 'normal';
    const expScore = typeof item.score === 'number' ? item.score : typeof item.expected_score === 'number' ? item.expected_score : levels.indexOf(val);
    if (!Object.keys(probs).length) probs = { [val]: 1.0 };
    return { value: val, expected_score: expScore, probabilities: probs };
  };

  const needsReply = parseNoul('needs_reply', 0.2);
  const urgency = parseScore('urgency');
  const category = parseChoice('category', 'customer');
  const projectRoute = parseChoice('project_route', 'uncertain');
  const actionItem = parseNoul('contains_action_item', 0.2);
  const followUp = parseNoul('follow_up_required', 0.2);
  const safeDraft = parseNoul('safe_to_generate_draft', 0.5);
  const attention = parseNoul('human_attention', 0.3);
  const newsletter = parseNoul('likely_newsletter', 0.05);
  const automated = parseNoul('likely_automated_notification', 0.1);
  const meeting = parseNoul('meeting_request', 0.05);

  const selectedChoices: ClefSelectedChoices = {
    needs_reply: needsReply.value,
    urgency: urgency.value,
    category: category.value,
    project_route: projectRoute.value,
    contains_action_item: actionItem.value,
    follow_up_required: followUp.value,
    safe_to_generate_draft: safeDraft.value,
    human_attention: attention.value,
    likely_newsletter: newsletter.value,
    likely_automated_notification: automated.value,
    meeting_request: meeting.value,
  };

  const probabilityDistributions: ClefProbabilityDistributions = {
    needs_reply: needsReply.probability,
    urgency: {
      expected_score: urgency.expected_score,
      probabilities: urgency.probabilities,
    },
    category: {
      confidence: category.confidence,
      probabilities: category.probabilities,
    },
    project_route: {
      confidence: projectRoute.confidence,
      probabilities: projectRoute.probabilities,
    },
    contains_action_item: actionItem.probability,
    follow_up_required: followUp.probability,
    safe_to_generate_draft: safeDraft.probability,
    human_attention: attention.probability,
    likely_newsletter: newsletter.probability,
    likely_automated_notification: automated.probability,
    meeting_request: meeting.probability,
  };

  return {
    id: meta.id,
    threadId: meta.threadId,
    messageId: meta.messageId,
    model: meta.model,
    schemaVersion: CLEF_SCHEMA_VERSION,
    selectedChoices,
    probabilityDistributions,
    latencyMs: meta.latencyMs,
    mode: meta.mode,
    createdAt: new Date().toISOString(),
  };
}

/** Retrieve cached Clef decision from D1 database */
export async function getCachedClefDecision(
  db: D1Database,
  messageId?: string,
  threadId?: string
): Promise<ClefDecision | null> {
  if (!db) return null;
  try {
    let row: any = null;
    if (messageId) {
      row = await db
        .prepare('SELECT * FROM email_decisions WHERE message_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(messageId)
        .first();
    }
    if (!row && threadId) {
      row = await db
        .prepare('SELECT * FROM email_decisions WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(threadId)
        .first();
    }

    if (!row) return null;

    return {
      id: row.id,
      threadId: row.thread_id,
      messageId: row.message_id || undefined,
      model: row.model,
      schemaVersion: row.schema_version,
      selectedChoices: JSON.parse(row.selected_choices_json || '{}'),
      probabilityDistributions: JSON.parse(row.probability_distributions_json || '{}'),
      latencyMs: row.latency_ms || 0,
      mode: (row.mode as ClefTriageMode) || 'primary',
      createdAt: row.created_at,
    };
  } catch (err) {
    // If table does not exist yet or query fails, return null gracefully
    return null;
  }
}

/** Save Clef decision to D1 */
export async function saveClefDecision(db: D1Database, decision: ClefDecision): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO email_decisions 
        (id, thread_id, message_id, model, schema_version, selected_choices_json, probability_distributions_json, latency_ms, mode, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          selected_choices_json = excluded.selected_choices_json,
          probability_distributions_json = excluded.probability_distributions_json,
          latency_ms = excluded.latency_ms,
          mode = excluded.mode`
      )
      .bind(
        decision.id,
        decision.threadId,
        decision.messageId || null,
        decision.model,
        decision.schemaVersion,
        JSON.stringify(decision.selectedChoices),
        JSON.stringify(decision.probabilityDistributions),
        decision.latencyMs || 0,
        decision.mode,
        decision.createdAt
      )
      .run();
  } catch (err: any) {
    console.error('[Clef] Error saving decision to D1:', err?.message);
  }
}

/** Record user interactions and feedback for shadow evaluation */
export async function recordDecisionFeedback(
  db: D1Database,
  params: {
    threadId: string;
    decisionId?: string;
    eventType: 'user_replied' | 'project_moved' | 'snoozed' | 'draft_used' | 'urgency_overridden';
    eventData?: Record<string, any>;
  }
): Promise<void> {
  if (!db) return;
  try {
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db
      .prepare(
        'INSERT INTO email_decision_feedback (id, thread_id, decision_id, event_type, event_data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        params.threadId,
        params.decisionId || null,
        params.eventType,
        params.eventData ? JSON.stringify(params.eventData) : null,
        new Date().toISOString()
      )
      .run();
  } catch {
    // Non-fatal
  }
}

/**
 * Main Clef Triage entry point for inbound emails.
 *
 * Architecture:
 * incoming email -> Clef-flash triage -> deterministic workflow -> DeviceAI/Gemini only if generative text is needed
 */
export async function triageInboundEmail(params: {
  emailState: ClefEmailState;
  threadId: string;
  messageId?: string;
  env: {
    DB: D1Database;
    AI?: WorkersAiBinding;
    CLEF_TRIAGE_MODE?: ClefTriageMode;
    CLEF_MODEL?: string;
  };
  forceFresh?: boolean;
  modelOverride?: string;
}): Promise<ClefDecision | null> {
  const mode = params.env.CLEF_TRIAGE_MODE || 'primary';
  if (mode === 'off') {
    return null;
  }

  // 1. Check D1 cache first
  if (!params.forceFresh) {
    const cached = await getCachedClefDecision(params.env.DB, params.messageId, params.threadId);
    if (cached) {
      return cached;
    }
  }

  // 2. If Workers AI binding is missing or not provided, failure behavior rule applies:
  // "If Clef is unavailable: email ingestion still succeeds, message still appears in inbox,
  // no automatic classification is fabricated, deterministic recipient/project routing continues"
  if (!params.env.AI || typeof params.env.AI.run !== 'function') {
    console.warn('[Clef] Workers AI binding not available. Skipping automatic classification.');
    return null;
  }

  const modelToUse = params.modelOverride || params.env.CLEF_MODEL || DEFAULT_CLEF_MODEL;
  const questions = buildClefQuestions(params.emailState.availableProjects);

  const startTime = Date.now();
  let rawResponse: any;

  try {
    // Workers AI Clef/SystemOne forward pass:
    // Takes state and questions schema, evaluates in a single forward pass without output parsing
    rawResponse = await params.env.AI.run(modelToUse, {
      model: modelToUse.includes('clef-flash') ? 'clef-flash' : 'clef',
      state: params.emailState,
      questions,
    });
  } catch (err: any) {
    console.error(`[Clef] Model inference failed for model ${modelToUse}:`, err?.message || err);
    // AI failure must never cause mail loss; return null without fabricating decision
    return null;
  }

  const latencyMs = Date.now() - startTime;
  const decisionId = `dec-${params.messageId || params.threadId}-${Date.now()}`;

  const decision = parseClefResponse(rawResponse, {
    id: decisionId,
    threadId: params.threadId,
    messageId: params.messageId,
    model: modelToUse,
    mode,
    latencyMs,
  });

  // Persist decision into D1
  await saveClefDecision(params.env.DB, decision);

  return decision;
}

/** Generates Clef Evaluation Report for shadow/primary mode performance measurement */
export async function generateClefEvaluationReport(db: D1Database): Promise<{
  totalTriaged: number;
  modeCounts: Record<string, number>;
  predictedNeedsReplyCount: number;
  actualRepliesCount: number;
  replyAccuracy?: number;
  replyPrecision?: number;
  replyRecall?: number;
  manualProjectMovesCount: number;
  snoozedCount: number;
  draftUsageCount: number;
  avgConfidence: number;
  avgLatencyMs: number;
  categoryDistribution: Record<string, number>;
  urgencyDistribution: Record<string, number>;
}> {
  try {
    const decisionsRows = await db
      .prepare('SELECT selected_choices_json, probability_distributions_json, latency_ms, mode, thread_id FROM email_decisions')
      .all<any>();

    const rows = decisionsRows.results || [];
    const totalTriaged = rows.length;

    let predictedNeedsReplyCount = 0;
    let totalLatency = 0;
    let totalConfidence = 0;
    let confCount = 0;
    const modeCounts: Record<string, number> = {};
    const categoryDistribution: Record<string, number> = {};
    const urgencyDistribution: Record<string, number> = {};

    const threadIds = new Set<string>();

    for (const r of rows) {
      modeCounts[r.mode] = (modeCounts[r.mode] || 0) + 1;
      totalLatency += Number(r.latency_ms) || 0;

      const choices = JSON.parse(r.selected_choices_json || '{}');
      const probs = JSON.parse(r.probability_distributions_json || '{}');

      if (choices.needs_reply) predictedNeedsReplyCount++;
      if (choices.category) {
        categoryDistribution[choices.category] = (categoryDistribution[choices.category] || 0) + 1;
      }
      if (choices.urgency) {
        urgencyDistribution[choices.urgency] = (urgencyDistribution[choices.urgency] || 0) + 1;
      }
      if (probs.category?.confidence) {
        totalConfidence += probs.category.confidence;
        confCount++;
      }
      if (r.thread_id) threadIds.add(r.thread_id);
    }

    // Measure actual replies from messages table:
    // Check which threads have is_outgoing = 1
    let actualRepliesCount = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;

    if (threadIds.size > 0) {
      const repliedThreads = new Set<string>();
      const batchIds = Array.from(threadIds).slice(0, 500);
      if (batchIds.length > 0) {
        const placeholders = batchIds.map(() => '?').join(',');
        const outgoingRows = await db
          .prepare(`SELECT DISTINCT thread_id FROM messages WHERE is_outgoing = 1 AND thread_id IN (${placeholders})`)
          .bind(...batchIds)
          .all<{ thread_id: string }>();

        for (const out of outgoingRows.results || []) {
          repliedThreads.add(out.thread_id);
        }
      }

      actualRepliesCount = repliedThreads.size;

      for (const r of rows) {
        const choices = JSON.parse(r.selected_choices_json || '{}');
        const userReplied = repliedThreads.has(r.thread_id);
        const predictedReply = Boolean(choices.needs_reply);

        if (predictedReply && userReplied) truePositives++;
        else if (predictedReply && !userReplied) falsePositives++;
        else if (!predictedReply && userReplied) falseNegatives++;
        else trueNegatives++;
      }
    }

    // Feedback metrics
    const feedbackRows = await db
      .prepare('SELECT event_type, COUNT(*) as count FROM email_decision_feedback GROUP BY event_type')
      .all<any>();

    const feedbackMap: Record<string, number> = {};
    for (const fb of feedbackRows.results || []) {
      feedbackMap[fb.event_type] = Number(fb.count) || 0;
    }

    const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1;
    const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1;
    const accuracy = totalTriaged > 0 ? (truePositives + trueNegatives) / totalTriaged : 1;

    return {
      totalTriaged,
      modeCounts,
      predictedNeedsReplyCount,
      actualRepliesCount,
      replyAccuracy: Math.round(accuracy * 100) / 100,
      replyPrecision: Math.round(precision * 100) / 100,
      replyRecall: Math.round(recall * 100) / 100,
      manualProjectMovesCount: feedbackMap['project_moved'] || 0,
      snoozedCount: feedbackMap['snoozed'] || 0,
      draftUsageCount: feedbackMap['draft_used'] || 0,
      avgConfidence: confCount > 0 ? Math.round((totalConfidence / confCount) * 100) / 100 : 0.85,
      avgLatencyMs: totalTriaged > 0 ? Math.round(totalLatency / totalTriaged) : 0,
      categoryDistribution,
      urgencyDistribution,
    };
  } catch (err: any) {
    console.error('Error generating evaluation report:', err?.message);
    return {
      totalTriaged: 0,
      modeCounts: {},
      predictedNeedsReplyCount: 0,
      actualRepliesCount: 0,
      manualProjectMovesCount: 0,
      snoozedCount: 0,
      draftUsageCount: 0,
      avgConfidence: 0,
      avgLatencyMs: 0,
      categoryDistribution: {},
      urgencyDistribution: {},
    };
  }
}

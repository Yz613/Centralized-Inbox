import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildClefQuestions, constructEmailState, parseClefResponse, triageInboundEmail, CLEF_FLASH_MODEL } from '../clefDecisionService';

// Published Workers AI input schema for @cf/cloudflare/clef-flash (saved from developers.cloudflare.com).
const inputSchema = JSON.parse(readFileSync('tests/fixtures/clef-flash-schema-input.json', 'utf8'));
// A real clef-flash response to buildClefQuestions() for an "checkout is down, call me" support email.
const liveResponse = JSON.parse(readFileSync('tests/fixtures/clef-flash-response.json', 'utf8'));

/**
 * Validate questions the way the Workers AI endpoint does: each question must match exactly one typed variant,
 * carry its required fields, and (like the server's strict validation) contain no keys the variant does not define.
 */
function schemaErrors(questions: Record<string, any>): string[] {
  const errors: string[] = [];
  const spec = inputSchema.properties.questions;
  const ids = Object.keys(questions);
  if (ids.length < spec.minProperties || ids.length > spec.maxProperties) errors.push(`question count ${ids.length}`);
  for (const [id, q] of Object.entries(questions)) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(id)) errors.push(`${id}: bad id`);
    const variant = spec.additionalProperties.oneOf.find((v: any) => v.properties.type.enum.includes(q?.type));
    if (!variant) { errors.push(`${id}: unknown type ${q?.type}`); continue; }
    for (const key of variant.required) if (q[key] === undefined) errors.push(`${id}.${key}: Field required`);
    for (const key of Object.keys(q)) if (!(key in variant.properties)) errors.push(`${id}.${key}: Extra inputs are not permitted`);
    const criteria = variant.properties.criteria;
    if (q.criteria !== undefined && criteria) {
      if (criteria.type === 'array') {
        if (!Array.isArray(q.criteria)) errors.push(`${id}.criteria: must be an array`);
        else if (q.criteria.length < criteria.minItems || q.criteria.length > criteria.maxItems) errors.push(`${id}.criteria: ${q.criteria.length} levels`);
      } else if (criteria.type === 'object') {
        if (!q.criteria || typeof q.criteria !== 'object' || Array.isArray(q.criteria)) errors.push(`${id}.criteria: must be an object`);
        else if (q.type === 'choice' && (Object.keys(q.criteria).length < 2 || Object.keys(q.criteria).length > 255)) errors.push(`${id}.criteria: ${Object.keys(q.criteria).length} options`);
      }
    }
  }
  return errors;
}

/** Stand-in for env.AI that rejects invalid requests with the same error text Workers AI returned in production. */
function strictClefAi(response: any, calls: any[] = []) {
  return {
    async run(model: string, input: any) {
      calls.push({ model, input });
      const errors = schemaErrors(input.questions || {});
      if (input.model !== 'clef-flash' && input.model !== 'clef') errors.push('model');
      if (input.state === undefined) errors.push('state: Field required');
      if (errors.length) throw new Error(`5012: {"error":{"type":"invalid_request","message":"Request body failed validation","details":${JSON.stringify(errors)}}}`);
      return response;
    },
  };
}

const projects = [
  { id: 'proj-saas', name: 'SaaS', description: 'Core SaaS' },
  { id: 'proj-store', name: 'Store', description: 'Retail' },
];

test('Clef questions match the published clef-flash input schema', () => {
  assert.deepEqual(schemaErrors(buildClefQuestions(projects)), []);
  assert.deepEqual(schemaErrors(buildClefQuestions([projects[0]])), []);
});

test('Clef urgency is a score question with ordered criteria, not the unsupported "levels" field', () => {
  const { urgency } = buildClefQuestions(projects);
  assert.equal(urgency.type, 'score');
  assert.equal(urgency.levels, undefined);
  assert.deepEqual(urgency.criteria, ['no urgency', 'low', 'normal', 'high', 'urgent']);
  // The previous shape is exactly what production rejected.
  const legacy = { urgency: { type: 'score', instructions: 'x', levels: ['a', 'b'] } };
  assert.deepEqual(schemaErrors(legacy), ['urgency.criteria: Field required', 'urgency.levels: Extra inputs are not permitted']);
});

test('Clef omits project routing when there is nothing to choose between', () => {
  const questions = buildClefQuestions([]);
  assert.equal(questions.project_route, undefined);
  assert.deepEqual(schemaErrors(questions), []);
});

test('Clef parser reads the real Workers AI answers format', () => {
  const decision = parseClefResponse(liveResponse, { id: 'd', threadId: 't', model: CLEF_FLASH_MODEL, mode: 'primary', latencyMs: 5 });
  const a = liveResponse.answers;
  assert.equal(decision.probabilityDistributions.needs_reply, a.needs_reply.noul);
  assert.equal(decision.selectedChoices.needs_reply, a.needs_reply.noul >= 0.5);
  assert.equal(decision.selectedChoices.human_attention, true);
  assert.equal(decision.selectedChoices.likely_newsletter, false);
  assert.equal(decision.selectedChoices.category, a.category.choice);
  assert.equal(decision.probabilityDistributions.category.confidence, a.category.confidence);
  assert.equal(decision.selectedChoices.project_route, 'proj-saas');
  assert.equal(decision.probabilityDistributions.project_route.confidence, a.project_route.confidence);
  // Score answers come back indexed "0".."4"; the parser maps them to urgency names and keeps the weighted score.
  assert.equal(decision.selectedChoices.urgency, 'urgent');
  assert.equal(decision.probabilityDistributions.urgency.expected_score, a.urgency.score);
  assert.equal(decision.probabilityDistributions.urgency.probabilities.urgent, a.urgency.probabilities['4']);
  assert.equal(decision.probabilityDistributions.urgency.probabilities['no urgency'], a.urgency.probabilities['0']);
});

test('Clef score falls back to the weighted score when per-level probabilities are absent', () => {
  const decision = parseClefResponse({ answers: { urgency: { type: 'score', score: 0.9, legend: {}, confidence: 0.5 } } },
    { id: 'd', threadId: 't', model: CLEF_FLASH_MODEL, mode: 'primary', latencyMs: 1 });
  assert.equal(decision.selectedChoices.urgency, 'low');
  assert.equal(decision.probabilityDistributions.urgency.expected_score, 0.9);
});

test('Clef triage sends a valid request and stores the decision', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('migrations/0007_email_decisions.sql', 'utf8'));
  const db: any = { prepare(query: string) {
    const st: any = { values: [] as any[], bind(...v: any[]) { this.values = v; return this; },
      async first() { return sql.prepare(query).get(...this.values) || null; },
      async all() { return { results: sql.prepare(query).all(...this.values) }; },
      async run() { return { success: true, meta: sql.prepare(query).run(...this.values) }; } };
    return st;
  } };
  const calls: any[] = [];
  const emailState = constructEmailState({
    subject: 'Checkout is down', bodyText: 'Nobody can pay since 9am. Please call me.',
    from: { address: 'dana@client.com' }, to: [{ address: 'support@saas.com' }],
    currentProject: projects[0], currentInbox: { id: 'i', name: 'Support', email: 'support@saas.com', role: 'support', channel: 'cloudflare' },
    availableProjects: projects, senderKnown: false,
  });
  const decision = await triageInboundEmail({ emailState, threadId: 'thread-1', messageId: 'msg-1',
    env: { DB: db, AI: strictClefAi(liveResponse, calls), CLEF_TRIAGE_MODE: 'primary' } });
  assert.ok(decision, 'a schema-valid request must produce a decision');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, CLEF_FLASH_MODEL);
  assert.equal(calls[0].input.model, 'clef-flash');
  assert.equal(decision!.selectedChoices.urgency, 'urgent');
  const row = sql.prepare("SELECT selected_choices_json FROM email_decisions WHERE message_id = 'msg-1'").get() as any;
  assert.equal(JSON.parse(row.selected_choices_json).category, liveResponse.answers.category.choice);
});

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateClefEvaluationReport } from '../clefDecisionService';

function findWranglerDb(): string | null {
  const d1Dir = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (existsSync(d1Dir)) {
    const files = readdirSync(d1Dir);
    for (const file of files) {
      if (file.endsWith('.sqlite') && file !== 'metadata.sqlite') {
        return join(d1Dir, file);
      }
    }
  }
  return null;
}

function adaptSqlite(sql: DatabaseSync): any {
  return {
    prepare(query: string) {
      const stmt = {
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
      return stmt;
    },
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('       Cloudflare Clef Triage Evaluation & Shadow Report    ');
  console.log('='.repeat(60));

  const dbPathArg = process.argv.find((arg) => arg.startsWith('--db='))?.split('=')[1];
  const targetPath = dbPathArg || findWranglerDb();

  let sql: DatabaseSync;

  if (targetPath && existsSync(targetPath)) {
    console.log(`Connecting to local D1 database: ${targetPath}\n`);
    sql = new DatabaseSync(targetPath);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS email_decisions (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT,
        model TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        selected_choices_json TEXT NOT NULL,
        probability_distributions_json TEXT NOT NULL,
        latency_ms INTEGER DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'primary',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS email_decision_feedback (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        decision_id TEXT,
        event_type TEXT NOT NULL,
        event_data_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
  } else {
    console.log('No local D1 file specified or found. Using demonstration in-memory dataset.\n');
    sql = new DatabaseSync(':memory:');
    // Setup tables
    sql.exec(`
      CREATE TABLE IF NOT EXISTS email_decisions (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT,
        model TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        selected_choices_json TEXT NOT NULL,
        probability_distributions_json TEXT NOT NULL,
        latency_ms INTEGER DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'primary',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        is_outgoing INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS email_decision_feedback (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        decision_id TEXT,
        event_type TEXT NOT NULL,
        event_data_json TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // Insert sample shadow & primary decisions
    const now = new Date().toISOString();
    sql.prepare(`
      INSERT INTO email_decisions (id, thread_id, model, schema_version, selected_choices_json, probability_distributions_json, latency_ms, mode, created_at)
      VALUES 
      ('dec-1', 'th-1', '@cf/cloudflare/clef-flash', 'v1', '{"needs_reply":true,"urgency":"urgent","category":"support"}', '{"category":{"confidence":0.94}}', 85, 'primary', ?),
      ('dec-2', 'th-2', '@cf/cloudflare/clef-flash', 'v1', '{"needs_reply":true,"urgency":"normal","category":"customer"}', '{"category":{"confidence":0.89}}', 92, 'shadow', ?),
      ('dec-3', 'th-3', '@cf/cloudflare/clef-flash', 'v1', '{"needs_reply":false,"urgency":"no urgency","category":"newsletter"}', '{"category":{"confidence":0.98}}', 74, 'shadow', ?),
      ('dec-4', 'th-4', '@cf/cloudflare/clef-flash', 'v1', '{"needs_reply":false,"urgency":"low","category":"automated"}', '{"category":{"confidence":0.95}}', 80, 'primary', ?),
      ('dec-5', 'th-5', '@cf/cloudflare/clef-flash', 'v1', '{"needs_reply":true,"urgency":"high","category":"sales"}', '{"category":{"confidence":0.88}}', 89, 'primary', ?)
    `).run(now, now, now, now, now);

    // Simulate replies for th-1, th-2, th-5
    sql.prepare(`INSERT INTO messages (id, thread_id, is_outgoing) VALUES ('m-out-1', 'th-1', 1), ('m-out-2', 'th-2', 1), ('m-out-5', 'th-5', 1)`).run();
    sql.prepare(`INSERT INTO email_decision_feedback (id, thread_id, event_type, created_at) VALUES ('fb-1', 'th-1', 'draft_used', ?)`).run(now);
  }

  const db = adaptSqlite(sql);
  const report = await generateClefEvaluationReport(db);

  console.log(`Total Emails Triaged:       ${report.totalTriaged}`);
  console.log(`Average Latency (ms):       ${report.avgLatencyMs} ms`);
  console.log(`Average Model Confidence:   ${(report.avgConfidence * 100).toFixed(1)}%`);
  console.log(`Operating Mode Counts:      ${JSON.stringify(report.modeCounts)}`);
  console.log('-'.repeat(60));
  console.log('REPLY PREDICTION ACCURACY');
  console.log(`  Predicted Needs Reply:    ${report.predictedNeedsReplyCount}`);
  console.log(`  Actual User Replies:      ${report.actualRepliesCount}`);
  console.log(`  Reply Precision:          ${report.replyPrecision !== undefined ? (report.replyPrecision * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  Reply Recall:             ${report.replyRecall !== undefined ? (report.replyRecall * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  Overall Accuracy:         ${report.replyAccuracy !== undefined ? (report.replyAccuracy * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log('-'.repeat(60));
  console.log('OPERATIONAL METRICS');
  console.log(`  Manual Project Moves:     ${report.manualProjectMovesCount}`);
  console.log(`  Snoozed Messages:         ${report.snoozedCount}`);
  console.log(`  AI Drafts Used:           ${report.draftUsageCount}`);
  console.log('-'.repeat(60));
  console.log('DISTRIBUTIONS');
  console.log('  By Category:');
  for (const [cat, count] of Object.entries(report.categoryDistribution)) {
    console.log(`    - ${cat.padEnd(14)}: ${count}`);
  }
  console.log('  By Urgency:');
  for (const [urg, count] of Object.entries(report.urgencyDistribution)) {
    console.log(`    - ${urg.padEnd(14)}: ${count}`);
  }
  console.log('='.repeat(60));
}

main().catch(console.error);

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { processInboundEmail } from '../worker';
import { saveMailThreads } from '../mailStore';
import { fetchImapPage } from '../mailService';
import { mergeThreadLists, collapseCrossInboxDuplicates } from '../src/utils/mergeThreads';
import { fetchStoredThreads, fetchStableStoredThreads } from '../src/services/mailApi';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('migrations/0001_initial_schema.sql','utf8'));
  sql.exec(readFileSync('migrations/0003_mail_coverage.sql','utf8'));
  sql.exec(readFileSync('migrations/0004_spam_review.sql','utf8'));
  sql.exec(readFileSync('migrations/0005_push_subscriptions.sql','utf8'));
  sql.exec("INSERT INTO projects(id,name,created_at) VALUES ('project','Real project','2026-01-01'); INSERT INTO inboxes(id,project_id,name,email,channel,role,created_at) VALUES ('one','project','One','one@example.com','cloudflare','general','2026-01-01'),('two','project','Two','two@example.com','cloudflare','general','2026-01-01')");
  const db: any = { prepare(query: string) {
    const statement: any = { values: [] as any[], bind(...values: any[]) { this.values = values; return this; },
      async first() { return sql.prepare(query).get(...this.values) || null; },
      async all() { return { results: sql.prepare(query).all(...this.values) }; },
      async run() { return { success:true,meta:sql.prepare(query).run(...this.values) }; } };
    return statement;
  }, async batch(statements: any[]) {
    sql.exec('BEGIN');
    try { const results=[]; for (const stmt of statements) results.push(await stmt.run()); sql.exec('COMMIT'); return results; }
    catch(error) { sql.exec('ROLLBACK'); throw error; }
  } };
  return { sql, db, env: { DB: db } as any };
}
const mime = (id='one', extra='') => `From: no-reply@provider.com\r\nTo: other@example.net\r\nMessage-ID: <${id}@test>\r\nSubject: Security alert\r\nDate: Sun, 20 Sep 2026 00:00:00 +0000\r\nList-Unsubscribe: <https://example.net/unsubscribe>\r\n${extra}\r\nYour account needs attention.`;

test('automated/list mail is saved, actual BCC recipient wins, retry is idempotent', async () => {
  const {sql,env}=database();
  for(let n=0;n<2;n++) assert.equal((await processInboundEmail(mime(),'bounce@provider.com','two@example.com',env)).success,true);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,1);
  const row=sql.prepare('SELECT inbox_id, body_text FROM messages').get()!;
  assert.equal(row.inbox_id,'two'); assert.match(row.body_text as string,/account needs attention/);
  assert.equal(sql.prepare('SELECT message_count FROM threads').get()!.message_count,1);
});
test('same message delivered to two accounts stays in both accounts',async()=>{
  const {sql,env}=database();
  await processInboundEmail(mime(),'sender@test','one@example.com',env);
  await processInboundEmail(mime(),'sender@test','two@example.com',env);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,2);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM threads').get()!.n,2);
});
test('unknown alias gets its own mailbox in the matching domain project',async()=>{
  const {sql,env}=database();
  assert.equal((await processInboundEmail(mime(),'sender@test','new@example.com',env)).success,true);
  const inbox=sql.prepare("SELECT * FROM inboxes WHERE email='new@example.com'").get()!;
  assert.equal(inbox.project_id,'project'); assert.equal(inbox.receiving_mode,'routing');
  assert.equal(sql.prepare('SELECT inbox_id FROM messages').get()!.inbox_id,inbox.id);
});
test('new reply reopens archived thread, subject collisions do not merge strangers',async()=>{
  const {sql,env}=database();
  await processInboundEmail(mime(),'sender@test','one@example.com',env);
  sql.exec('UPDATE threads SET is_archived=1,is_read=1');
  await processInboundEmail(mime('reply','In-Reply-To: <one@test>\r\nReferences: <one@test>\r\n'),'sender@test','one@example.com',env);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM threads').get()!.n,1);
  assert.equal(sql.prepare('SELECT is_archived FROM threads').get()!.is_archived,0);
  await processInboundEmail(mime('unrelated'),'sender@test','one@example.com',env);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM threads').get()!.n,2);
});
test('failed message write rolls back thread and receipt marker',async()=>{
  const {sql,env}=database();
  sql.exec("CREATE TRIGGER fail_message BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
  assert.equal((await processInboundEmail(mime(),'sender@test','one@example.com',env)).success,false);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM threads').get()!.n,0);
  assert.equal(sql.prepare("SELECT last_received_at FROM inboxes WHERE id='one'").get()!.last_received_at,null);
});
test('storage failure still attempts backup and fails visibly',async()=>{
  const {sql,env}=database();let forwarded=0;
  sql.exec("CREATE TRIGGER fail_message BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
  env.FORWARD_EMAIL='backup@example.net';
  await assert.rejects(worker.email({raw:mime(),from:'sender@test',to:'one@example.com',forward:async()=>{forwarded++;}} as any,env,{} as any),/simulated disk failure/);
  assert.equal(forwarded,1);
});
test('backup failure is saved and surfaced without losing the message',async()=>{
  const {sql,env}=database();env.FORWARD_EMAIL='backup@example.net';
  await assert.rejects(worker.email({raw:mime(),from:'sender@test',to:'one@example.com',forward:async()=>{throw new Error('backup blocked');}} as any,env,{} as any),/backup blocked/);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,1);
  assert.equal(sql.prepare("SELECT delivery_error FROM inboxes WHERE id='one'").get()!.delivery_error,'backup blocked');
});
test('merge keeps all distinct messages and reveals a new reply to an archived conversation',()=>{
  const base:any={id:'t',messages:[{id:'1',timestamp:'2026-01-01'}],lastMessageTimestamp:'2026-01-01',messageCount:1,isArchived:true,tags:[]};
  const next:any={...base,messages:[{id:'2',timestamp:'2026-01-02',isOutgoing:false}],lastMessageTimestamp:'2026-01-02',isArchived:false};
  const [merged]=mergeThreadLists([base],[next]);assert.equal(merged.messages.length,2);assert.equal(merged.isArchived,false);
});
test('the same message in two inboxes is one conversation',()=>{
  const copy=(id:string,inboxId:string,read:boolean)=>({id,inboxId,projectId:'p',subject:'Hi',snippet:'hi',participants:[],lastMessageTimestamp:'2026-01-01',messageCount:1,isRead:read,isStarred:false,isArchived:false,tags:[],messages:[{id:`m-${id}`,inboxId,messageId:'<same@test>',timestamp:'2026-01-01',bodyText:'hi',isOutgoing:false,from:{name:'A',address:'a@x.com'}}]});
  const collapsed=collapseCrossInboxDuplicates([copy('t1','one',false),copy('t2','two',true)] as any);
  assert.equal(collapsed.length,1);
  assert.equal(collapsed[0].messages.length,1);
  assert.equal(collapsed[0].isRead,false);
  assert.deepEqual([...collapsed[0].memberIds].sort(),['t1','t2']);
  const separate=collapseCrossInboxDuplicates([copy('t1','one',false),{...copy('t3','two',false),messages:[{id:'other',messageId:'<other@test>',timestamp:'2026-01-02',bodyText:'no',isOutgoing:false,from:{name:'B',address:'b@x.com'}}],lastMessageTimestamp:'2026-01-02'}] as any);
  assert.equal(separate.length,2);
});
test('stored mail follows every cursor beyond 200 conversations and propagates page failure',async(t)=>{
  let page=0;
  t.mock.method(globalThis,'fetch',async()=>Response.json({threads:Array.from({length:50},(_,i)=>({id:`${page}-${i}`})),nextCursor:++page<5?String(page):null}));
  assert.equal((await fetchStoredThreads()).length,250);
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:500}));
  await assert.rejects(fetchStoredThreads(),/Could not refresh/);
});
test('refresh retries a mailbox snapshot when new mail arrives between pages',async(t)=>{
  let revision = '1';
  let reads = 0;
  t.mock.method(globalThis,'fetch',async(input: string | URL | Request)=>{
    const url = String(input);
    if (url === '/api/mail/revision') return Response.json({revision});
    reads++;
    if (reads === 1) {
      revision = '2';
      return Response.json({threads:[{id:'old'}],nextCursor:null});
    }
    return Response.json({threads:[{id:'old'},{id:'new'}],nextCursor:null});
  });
  const snapshot = await fetchStableStoredThreads();
  assert.deepEqual(snapshot.threads.map(thread=>thread.id),['old','new']);
  assert.equal(snapshot.revision,'2');
  assert.equal(reads,2);
});
test('refresh keeps cached mail when the database changes on every attempt',async(t)=>{
  let revision = 0;
  t.mock.method(globalThis,'fetch',async(input: string | URL | Request)=>
    String(input) === '/api/mail/revision'
      ? Response.json({revision:String(revision++)})
      : Response.json({threads:[],nextCursor:null}));
  await assert.rejects(fetchStableStoredThreads(),/Keeping visible messages/);
});
function fakeImap(state: {count:number;validity?:string;fail?:boolean;folders?:string[]}) {
  return ()=>({
    mailbox:{uidValidity:state.validity||'1',uidNext:state.count+1,exists:state.count},
    connect:async()=>{},logout:async()=>{},close:()=>{},
    list:async()=> (state.folders||['INBOX']).map(path=>({path,flags:new Set()})),
    getMailboxLock:async()=>({release:()=>{}}),
    search:async({uid}:any)=>{const [a,b]=uid.split(':').map(Number);return Array.from({length:state.count},(_,i)=>i+1).filter(n=>n>=a&&n<=b);},
    async *fetch(ids:string){for(const uid of ids.split(',').map(Number)) {if(state.fail) throw new Error('disconnected');yield {uid,source:Buffer.from(mime(String(uid))),flags:new Set(),internalDate:new Date()};}}
  }) as any;
}
const imapParams={config:{email:'a@test.com',password:'unused',imapHost:'test',smtpHost:''},inboxId:'one',projectId:'project',limit:25};
test('IMAP recovers >50 messages, prioritizes new mail during history, and handles UIDVALIDITY reset',async()=>{
  const state={count:80,validity:'1'};let result=await fetchImapPage(imapParams,fakeImap(state));
  assert.equal(result.fetched,25);assert.equal(result.cursor.folders!.INBOX.uid,80);assert.equal(result.cursor.folders!.INBOX.beforeUid,55);
  state.count=82;
  result=await fetchImapPage({...imapParams,cursor:result.cursor},fakeImap(state));
  assert.equal(result.fetched,2);assert.equal(result.cursor.folders!.INBOX.beforeUid,55);
  let total=27;
  while(result.pending){result=await fetchImapPage({...imapParams,cursor:result.cursor},fakeImap(state));total+=result.fetched;}
  assert.equal(total,82);
  state.validity='2';state.count=3;
  result=await fetchImapPage({...imapParams,cursor:result.cursor},fakeImap(state));assert.equal(result.fetched,3);
});
test('IMAP visits spam and sent folders and never advances a failed page',async()=>{
  const state={count:1,folders:['Sent','INBOX','Spam'],fail:false};
  let cursor={};const seen=[];
  for(let n=0;n<3;n++){const page=await fetchImapPage({...imapParams,cursor},fakeImap(state));seen.push(page.folder);cursor=page.cursor;}
  assert.deepEqual(seen,['INBOX','Sent','Spam']);
  state.count=2;state.fail=true;const before=JSON.stringify(cursor);
  await assert.rejects(fetchImapPage({...imapParams,cursor},fakeImap(state)),/disconnected/);assert.equal(JSON.stringify(cursor),before);
});
test('IMAP IDs are isolated by account, including matching message IDs',async()=>{
  const a=await fetchImapPage(imapParams,fakeImap({count:1}));
  const b=await fetchImapPage({...imapParams,inboxId:'two'},fakeImap({count:1}));
  assert.notEqual(a.threads[0].id,b.threads[0].id);assert.notEqual(a.threads[0].messages[0].id,b.threads[0].messages[0].id);
});
test('mail checkpoint is atomic with saved messages',async()=>{
  const {sql,db}=database();const page=await fetchImapPage(imapParams,fakeImap({count:1}));
  await assert.rejects(saveMailThreads(db,page.threads,db.prepare('INSERT INTO missing_table VALUES (1)')));
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,0);
});

test('password gate protects assets and serves the inbox after sign-in without masking missing APIs',async()=>{
  const {env}=database();env.GATE_PASSWORD='test-only';env.SESSION_SECRET='test-asset-session-secret';
  const paths:string[]=[];
  env.ASSETS={fetch:async(request:Request)=>{paths.push(new URL(request.url).pathname);return new Response('<main>Inbox</main>');}};
  for(const path of ['/', '/assets/app.js']) {
    assert.equal((await worker.fetch(new Request(`https://test${path}`),env,{} as any)).status,302);
  }
  assert.equal(paths.length,0);
  const login=await worker.fetch(new Request('https://test/login',{method:'POST',body:new URLSearchParams({password:'test-only'})}),env,{} as any);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  for(const path of ['/', '/assets/app.js']) {
    const response=await worker.fetch(new Request(`https://test${path}`,{headers:{cookie}}),env,{} as any);
    if (path === '/') assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.status,200);assert.match(await response.text(),/Inbox/);
  }
  assert.deepEqual(paths,['/','/assets/app.js']);
  assert.equal((await worker.fetch(new Request('https://test/api/missing',{headers:{cookie}}),env,{} as any)).status,404);
  assert.equal(paths.length,2);
  const key = await worker.fetch(new Request('https://test/api/push/public-key'), env, {} as any);
  assert.equal(key.status, 200);
  assert.equal((await key.json()).configured, false);
  const sw = await worker.fetch(new Request('https://test/sw.js'), env, {} as any);
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('cache-control'), 'no-cache');
  assert.match(await sw.text(), /Inbox/);
  assert.deepEqual(paths, ['/', '/assets/app.js', '/sw.js']);
});

test('real API pagination returns >200 equal-timestamp threads exactly once',async(t)=>{
  const {db,sql,env}=database();env.GATE_PASSWORD='test-only';env.SESSION_SECRET='test-session-secret-long-enough-for-tests';
  const insert=sql.prepare("INSERT INTO threads(id,project_id,inbox_id,channel,inbox_role,subject,last_message_timestamp,created_at,updated_at) VALUES (?,'project','one','cloudflare','general','test','2026-01-01','2026-01-01','2026-01-01')");
  for(let n=0;n<205;n++)insert.run(`thread-${n}`);
  const login=await worker.fetch(new Request('https://test/login',{method:'POST',body:new URLSearchParams({password:'test-only'})}),env,{} as any);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  t.mock.method(globalThis,'fetch',async(input:any)=>worker.fetch(new Request(`https://test${input}`,{headers:{cookie}}),env,{} as any));
  const threads=await fetchStoredThreads();
  assert.equal(threads.length,205);assert.equal(new Set(threads.map(t=>t.id)).size,205);
  const before=await (await worker.fetch(new Request('https://test/api/mail/revision',{headers:{cookie}}),env,{} as any)).json();
  assert.equal((await worker.fetch(new Request('https://test/api/threads/thread-0',{method:'DELETE',headers:{cookie}}),env,{} as any)).status,200);
  const after=await (await worker.fetch(new Request('https://test/api/mail/revision',{headers:{cookie}}),env,{} as any)).json();
  assert.notEqual(before.revision,after.revision);
  assert.match(after.revision,/^204:/);
});

test('Gmail reads all pages, full conversations and spam/trash; refuses wrong account and failed details',async(t)=>{
  const {readGmailThreads}=await import('../src/services/gmailApi');
  const storage=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)}});
  t.after(() => { delete (globalThis as any).localStorage; });
  const urls:string[]=[];
  const detail=(id:string)=>({id,messages:[{id:`${id}-1`,threadId:id,internalDate:'1000',labelIds:['SPAM','UNREAD'],payload:{headers:[{name:'From',value:'person@example.com'}]}},{id:`${id}-2`,threadId:id,internalDate:'2000',labelIds:['SENT'],payload:{headers:[{name:'From',value:'a@test.com'}]}}]});
  t.mock.method(globalThis,'fetch',async(input:any)=>{
    const url=new URL(input);urls.push(url.toString());
    if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'a@test.com'});
    if(url.pathname.endsWith('/threads'))return Response.json(url.searchParams.has('pageToken')?{threads:[{id:'second'}]}:{threads:[{id:'first'}],nextPageToken:'next'});
    return Response.json(detail(url.pathname.split('/').pop()!));
  });
  let saved=0;
  const params={projectId:'project',inboxId:'one',userEmail:'a@test.com',onPage:async()=>{saved++;}};
  const result=await readGmailThreads(params,'fake');
  assert.equal(result.length,2);assert.equal(saved,2);assert.equal(result[0].messages.length,2);assert.equal(result[0].isRead,false);assert.ok(result[0].tags.includes('SPAM'));
  assert.ok(urls.filter(u=>u.includes('/threads?')).every(u=>u.includes('includeSpamTrash=true')));
  assert.ok(!urls.some(u=>u.includes('in%3Ainbox')));
  await assert.rejects(readGmailThreads({...params,userEmail:'wrong@test.com'},'fake'),/Sign in to wrong/);
  storage.clear();
  t.mock.method(globalThis,'fetch',async(input:any)=>String(input).endsWith('/profile')?Response.json({emailAddress:'a@test.com'}):String(input).includes('/threads?')?Response.json({threads:[{id:'failed'}]}):Response.json({error:{message:'access denied'}},{status:403}));
  await assert.rejects(readGmailThreads(params,'fake'),/access denied/);assert.equal(storage.size,0);
});

test('suspected spam is saved and forwarded normally with a visible reason',async()=>{
  const {sql,env}=database();env.FORWARD_EMAIL='backup@example.net';let forwarded=0;
  await worker.email({raw:mime('spam','X-Spam-Status: Yes, score=9\r\n'),from:'sender@test',to:'one@example.com',forward:async()=>{forwarded++;}} as any,env,{} as any);
  const thread=sql.prepare('SELECT spam_status,spam_reason,is_archived FROM threads').get()!;
  assert.equal(thread.spam_status,'suspected');assert.match(thread.spam_reason as string,/header/);
  assert.equal(thread.is_archived,0);assert.equal(forwarded,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,1);
});

test('ordinary automated mail is not called spam just for having unsubscribe headers',async()=>{
  const {sql,env}=database();await processInboundEmail(mime(),'sender@test','one@example.com',env);
  assert.equal(sql.prepare('SELECT spam_status FROM threads').get()!.spam_status,null);
});

test('spam folder flags already-imported messages; not-spam review survives resync and reload',async()=>{
  const {sql,db,env}=database();
  const normal=await fetchImapPage(imapParams,fakeImap({count:1}));await saveMailThreads(db,normal.threads);
  const spam=await fetchImapPage(imapParams,fakeImap({count:1,folders:['Spam']}));
  assert.equal(spam.threads[0].spamStatus,'suspected');await saveMailThreads(db,spam.threads);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get()!.n,1);
  assert.equal(sql.prepare('SELECT spam_status FROM threads').get()!.spam_status,'suspected');
  const id=sql.prepare('SELECT id FROM threads').get()!.id;
  sql.exec('UPDATE threads SET is_archived=1');
  env.GATE_PASSWORD='test-only';env.SESSION_SECRET='long-test-session-secret';
  const login=await worker.fetch(new Request('https://test/login',{method:'POST',body:new URLSearchParams({password:'test-only'})}),env,{} as any);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const review=await worker.fetch(new Request(`https://test/api/threads/${id}/spam-review`,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({spamStatus:'not_spam'})}),env,{} as any);
  assert.equal(review.status,200);
  await saveMailThreads(db,spam.threads);
  const response=await worker.fetch(new Request('https://test/api/threads',{headers:{cookie}}),env,{} as any);
  const {threads}=await response.json() as any;
  assert.equal(threads[0].spamStatus,'not_spam');assert.ok(threads[0].spamReviewedAt);assert.equal(threads[0].isArchived,false);
  const bad=await worker.fetch(new Request(`https://test/api/threads/${id}/spam-review`,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({spamStatus:'delete'})}),env,{} as any);
  assert.equal(bad.status,400);
  const missing=await worker.fetch(new Request('https://test/api/threads/missing/spam-review',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({spamStatus:'not_spam'})}),env,{} as any);
  assert.equal(missing.status,404);
});

test('new provider flags cannot undo a human review during client merging',()=>{
  const base:any={id:'t',messages:[],lastMessageTimestamp:'2026-01-01',messageCount:0,tags:['SPAM'],spamStatus:'not_spam',spamReviewedAt:'2026-02-01'};
  const incoming:any={...base,lastMessageTimestamp:'2026-03-01',spamStatus:'suspected',spamReviewedAt:undefined};
  assert.equal(mergeThreadLists([base],[incoming])[0].spamStatus,'not_spam');
  const undo={...incoming,spamReviewedAt:'2026-04-01'};
  assert.equal(mergeThreadLists([base],[undo])[0].spamStatus,'suspected');
});

test('cloudflare inboxes send and forward from their own address',async()=>{
  const {sql,env}=database();
  env.GATE_PASSWORD='test-only';env.SESSION_SECRET='test-session-secret-long-enough-for-tests';
  let sent:any=null;
  env.EMAIL={send:async(message:any)=>{sent=message;return {messageId:'<sent@test>'};}};
  const login=await worker.fetch(new Request('https://test/login',{method:'POST',body:new URLSearchParams({password:'test-only'})}),env,{} as any);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const headers={cookie,'Content-Type':'application/json'};
  const ok=await worker.fetch(new Request('https://test/api/mail/send',{method:'POST',headers,body:JSON.stringify({
    email:'one@example.com',to:'reader@example.net',subject:'Fwd: hello',body:'See below',senderName:'Hello',
    inReplyTo:'<one@test>',references:['<one@test>'],inboxId:'one',projectId:'project',
  })}),env,{} as any);
  assert.equal(ok.status,200);
  assert.equal(sent.from.email,'one@example.com');
  assert.equal(sent.from.name,'Hello');
  assert.deepEqual(sent.to,['reader@example.net']);
  assert.equal(sent.headers['In-Reply-To'],'<one@test>');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages WHERE is_outgoing = 1').get()!.n,1);
  const denied=await worker.fetch(new Request('https://test/api/mail/send',{method:'POST',headers,body:JSON.stringify({
    email:'stranger@example.net',to:'reader@example.net',subject:'Nope',body:'no',
  })}),env,{} as any);
  assert.equal(denied.status,400);
  env.EMAIL.send=async()=>{const error:any=new Error('domain missing');error.code='E_SENDER_DOMAIN_NOT_AVAILABLE';throw error;};
  const blocked=await worker.fetch(new Request('https://test/api/mail/send',{method:'POST',headers,body:JSON.stringify({
    email:'one@example.com',to:'reader@example.net',subject:'Fwd: hello',body:'See below',
  })}),env,{} as any);
  assert.equal(blocked.status,502);
  assert.match((await blocked.json()).message,/Onboard example.com/);
});

test('review strip labels possible spam and offers Not spam; reviewed mail shows Undo',async()=>{
  const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
  const {SpamReview}=await import('../src/components/SpamReview');
  const base:any={id:'t',tags:['SPAM'],spamReason:'Gmail placed a message in Spam.'};
  const render=(thread:any)=>renderToStaticMarkup(React.createElement(SpamReview,{thread,onReview:async()=>{}}));
  assert.match(render(base),/Possible spam/);assert.match(render(base),/>Not spam<\/button>/);
  assert.match(render({...base,spamStatus:'not_spam'}),/You marked this conversation as not spam/);
  assert.match(render({...base,spamStatus:'not_spam'}),/>Undo<\/button>/);
});

// Deskly smoke test — boots the real server, exercises inbound-email → ticket →
// reply → SLA → CSAT → stats against a temp DB, and asserts rows land in SQLite.
// Kills ONLY the spawned server child (never broad-kills node processes).
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5441;
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('1. Booting Deskly on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH, SMTP_HOST: '', IMAP_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('   Auth: wrong password → 401, unauthenticated /api/tickets → 401, login → 200');
  const bad = await api('/api/login', { method: 'POST', body: { password: 'wrong' } });
  assert.strictEqual(bad.status, 401, 'wrong password must 401');
  cookie = '';
  const unauth = await api('/api/tickets');
  assert.strictEqual(unauth.status, 401, 'admin API must require auth');
  const good = await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } });
  assert.strictEqual(good.status, 200, 'login must succeed');

  console.log('2. Inbound webhook creates a ticket with SLA due dates');
  const settings = await api('/api/settings');
  const inboundToken = settings.data.inbound_token;
  assert.ok(inboundToken && inboundToken.length >= 20, 'inbound token must exist');

  const badInbound = await api('/inbound/not-the-token', {
    method: 'POST',
    body: { from_email: 'x@y.z', subject: 'nope', body: 'nope' }
  });
  assert.strictEqual(badInbound.status, 404, 'wrong inbound token must 404');

  const inbound = await api(`/inbound/${inboundToken}`, {
    method: 'POST',
    body: { from_email: 'jane@customer.com', from_name: 'Jane Doe', subject: 'My order never arrived', body: 'Hi, order #442 is missing.' }
  });
  assert.strictEqual(inbound.status, 201, 'inbound must create ticket (201)');
  const ticketId = inbound.data.ticket_id;
  assert.ok(ticketId > 0, 'inbound must return ticket_id');

  const t1 = await api(`/api/tickets/${ticketId}`);
  assert.strictEqual(t1.data.status, 'open');
  assert.strictEqual(t1.data.requester_email, 'jane@customer.com');
  assert.ok(t1.data.sla_first_due_at > Date.now(), 'first-response SLA due must be in the future');
  assert.ok(t1.data.sla_resolve_due_at > t1.data.sla_first_due_at, 'resolution SLA must be after first-response SLA');
  assert.strictEqual(t1.data.messages.length, 1, 'ticket must contain the inbound message');
  assert.strictEqual(t1.data.messages[0].direction, 'in');

  console.log('3. Threaded inbound ([#id] in subject) appends instead of creating');
  const threaded = await api(`/inbound/${inboundToken}`, {
    method: 'POST',
    body: { from_email: 'jane@customer.com', subject: `Re: My order never arrived [#${ticketId}]`, body: 'Any update?' }
  });
  assert.strictEqual(threaded.status, 200, 'threaded inbound must 200 (not create)');
  assert.strictEqual(threaded.data.ticket_id, ticketId, 'threaded reply must land on the same ticket');
  const t2 = await api(`/api/tickets/${ticketId}`);
  assert.strictEqual(t2.data.messages.length, 2, 'threaded message must be appended');

  console.log('4. Macro with {{variables}} renders substituted for the ticket');
  const macro = await api('/api/macros', {
    method: 'POST',
    body: { name: 'Ack', body: 'Hi {{customer_name}}, we got your ticket #{{ticket_id}} about "{{subject}}".' }
  });
  assert.strictEqual(macro.status, 201, 'macro create must 201');
  const rendered = await api(`/api/macros/${macro.data.id}/render?ticket_id=${ticketId}`);
  assert.strictEqual(
    rendered.data.body,
    `Hi Jane Doe, we got your ticket #${ticketId} about "My order never arrived".`,
    'macro variables must be substituted from ticket'
  );

  console.log('5. Public reply sets first_response_at; internal note does not email');
  const note = await api(`/api/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: { body: 'Checking with warehouse — @sam can you confirm?', is_internal_note: true }
  });
  assert.strictEqual(note.status, 201);
  assert.strictEqual(note.data.ticket.first_response_at, null, 'internal note must NOT count as first response');

  const reply = await api(`/api/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: { body: rendered.data.body }
  });
  assert.strictEqual(reply.status, 201);
  assert.ok(reply.data.ticket.first_response_at > 0, 'public reply must set first_response_at');
  assert.ok(reply.data.mail.skipped, 'without SMTP the mail send is skipped, not fatal');

  console.log('6. Agents + assignment + tags + filters');
  const agent = await api('/api/agents', { method: 'POST', body: { name: 'Sam Support', email: 'sam@co.com', role: 'admin' } });
  assert.strictEqual(agent.status, 201);
  const patched = await api(`/api/tickets/${ticketId}`, {
    method: 'PATCH',
    body: { assignee_id: agent.data.id, priority: 'urgent', tags: ['shipping', 'vip'] }
  });
  assert.strictEqual(patched.data.priority, 'urgent');
  assert.deepStrictEqual([...patched.data.tags].sort(), ['shipping', 'vip']);
  assert.strictEqual(patched.data.assignee.id, agent.data.id);

  const filtered = await api('/api/tickets?tag=vip&priority=urgent');
  assert.strictEqual(filtered.data.length, 1, 'tag+priority filter must find the ticket');
  const noMatch = await api('/api/tickets?tag=nonexistent');
  assert.strictEqual(noMatch.data.length, 0, 'filter with unknown tag must be empty');

  console.log('7. Solve → resolved_at set; CSAT public link records rating');
  const solved = await api(`/api/tickets/${ticketId}`, { method: 'PATCH', body: { status: 'solved' } });
  assert.strictEqual(solved.data.status, 'solved');
  assert.ok(solved.data.resolved_at > 0, 'solved must set resolved_at');

  const csatRes = await fetch(`${BASE}/csat/${solved.data.token}/good`);
  assert.strictEqual(csatRes.status, 200, 'CSAT link must 200');
  const csatHtml = await csatRes.text();
  assert.ok(csatHtml.includes('Thanks for your feedback'), 'CSAT page must render');

  console.log('8. Rows verified directly in SQLite');
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const trow = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  assert.strictEqual(trow.csat, 1, 'CSAT good must persist csat=1 in SQLite');
  assert.strictEqual(trow.status, 'solved');
  const msgCount = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE ticket_id = ?').get(ticketId).n;
  assert.strictEqual(msgCount, 4, 'ticket must have 4 messages (2 in, 1 note, 1 reply)');
  const noteRow = db.prepare('SELECT * FROM messages WHERE ticket_id = ? AND is_internal_note = 1').get(ticketId);
  assert.ok(noteRow, 'internal note row must exist');
  db.close();

  console.log('9. Stats reflect reality');
  const stats = await api('/api/stats');
  assert.strictEqual(stats.data.by_status.solved, 1, 'stats must count the solved ticket');
  assert.ok(stats.data.avg_first_response_ms >= 0, 'avg first response must be computed');
  assert.strictEqual(stats.data.csat_good, 1, 'stats must count CSAT good');

  console.log('\n✅ All Deskly smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill();
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows file lock — harmless */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });

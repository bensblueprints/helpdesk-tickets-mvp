const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, genToken, getSettings, setSettings, slaDueTimes } = require('./db');
const { sendEmail, sendReply, ingestEmail, startMailPoller } = require('./mail');

const SESSION_COOKIE = 'dk_session';
const STATUSES = ['open', 'pending', 'solved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function createApp({ dbPath, adminPassword, autologinToken = null, mailPollMs = 60_000 } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  const stopPoller = startMailPoller(db, mailPollMs);
  app.locals.db = db;
  app.locals.stopPoller = stopPoller;

  const findTicket = db.prepare('SELECT * FROM tickets WHERE id = ?');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function ticketTags(id) {
    return db.prepare(
      'SELECT t.name FROM tags t JOIN ticket_tags tt ON tt.tag_id = t.id WHERE tt.ticket_id = ?'
    ).all(id).map((r) => r.name);
  }

  function serializeTicket(t, withMessages = false) {
    const out = { ...t, tags: ticketTags(t.id) };
    const assignee = t.assignee_id ? db.prepare('SELECT id, name, email FROM agents WHERE id = ?').get(t.assignee_id) : null;
    out.assignee = assignee || null;
    const now = Date.now();
    out.sla_first_breached = !t.first_response_at && t.sla_first_due_at && now > t.sla_first_due_at &&
      t.status !== 'solved' && t.status !== 'closed' ? 1 : 0;
    out.sla_resolve_breached = !t.resolved_at && t.sla_resolve_due_at && now > t.sla_resolve_due_at &&
      t.status !== 'solved' && t.status !== 'closed' ? 1 : 0;
    if (withMessages) {
      out.messages = db.prepare('SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC').all(t.id);
    } else {
      const last = db.prepare('SELECT body FROM messages WHERE ticket_id = ? AND is_internal_note = 0 ORDER BY created_at DESC LIMIT 1').get(t.id);
      out.preview = last ? String(last.body).slice(0, 140) : '';
    }
    return out;
  }

  function setTicketTags(ticketId, names) {
    const tx = db.transaction((list) => {
      db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ?').run(ticketId);
      for (const raw of list) {
        const name = String(raw).trim().toLowerCase();
        if (!name) continue;
        db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
        const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
        db.prepare('INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)').run(ticketId, tag.id);
      }
    });
    tx(names);
  }

  // ── auth ────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'deskly' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // ── inbound email webhook (public, token-protected) ─────────────────────
  // POST /inbound/:token  { from_email, from_name?, subject, body }
  app.post('/inbound/:token', (req, res) => {
    const s = getSettings(db);
    if (req.params.token !== s.inbound_token) return res.status(404).json({ error: 'unknown token' });
    const b = req.body || {};
    const from_email = String(b.from_email || b.from || '').trim();
    if (!from_email) return res.status(400).json({ error: 'from_email is required' });
    const result = ingestEmail(db, {
      from_email,
      from_name: String(b.from_name || ''),
      subject: String(b.subject || '(no subject)'),
      body: String(b.body || b.text || '')
    });
    res.status(result.created ? 201 : 200).json(result);
  });

  // ── CSAT (public link in resolved email) ────────────────────────────────
  app.get('/csat/:token/:score', (req, res) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(req.params.token);
    if (!ticket) return res.status(404).send('Unknown ticket');
    const score = req.params.score === 'good' ? 1 : req.params.score === 'bad' ? 0 : null;
    if (score === null) return res.status(400).send('Score must be good or bad');
    db.prepare('UPDATE tickets SET csat = ?, updated_at = ? WHERE id = ?').run(score, Date.now(), ticket.id);
    res.set('Content-Type', 'text/html');
    res.send(`<!doctype html><html><body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;height:100vh;margin:0">
      <div style="text-align:center"><div style="font-size:48px">${score ? '👍' : '👎'}</div>
      <h2>Thanks for your feedback!</h2><p style="color:#a1a1aa">Your rating for ticket #${ticket.id} was recorded.</p></div></body></html>`);
  });

  // ── tickets ─────────────────────────────────────────────────────────────
  app.get('/api/tickets', requireAuth, (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status && STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
    if (req.query.priority && PRIORITIES.includes(req.query.priority)) { where.push('priority = ?'); params.push(req.query.priority); }
    if (req.query.assignee_id) { where.push('assignee_id = ?'); params.push(Number(req.query.assignee_id)); }
    if (req.query.q) { where.push('(subject LIKE ? OR requester_email LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.tag) {
      where.push('id IN (SELECT ticket_id FROM ticket_tags tt JOIN tags t ON t.id = tt.tag_id WHERE t.name = ?)');
      params.push(String(req.query.tag).toLowerCase());
    }
    const sql = `SELECT * FROM tickets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT 500`;
    res.json(db.prepare(sql).all(...params).map((t) => serializeTicket(t)));
  });

  app.post('/api/tickets', requireAuth, (req, res) => {
    const b = req.body || {};
    const subject = String(b.subject || '').trim();
    const requester_email = String(b.requester_email || '').trim();
    if (!subject || !requester_email) return res.status(400).json({ error: 'subject and requester_email are required' });
    const priority = PRIORITIES.includes(b.priority) ? b.priority : 'normal';
    const now = Date.now();
    const sla = slaDueTimes(getSettings(db), priority, now);
    const info = db.prepare(`
      INSERT INTO tickets (token, subject, requester_email, requester_name, status, priority,
                           assignee_id, sla_first_due_at, sla_resolve_due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
    `).run(genToken(), subject, requester_email, String(b.requester_name || ''), priority,
           b.assignee_id || null, sla.sla_first_due_at, sla.sla_resolve_due_at, now, now);
    if (b.body) {
      db.prepare('INSERT INTO messages (ticket_id, direction, body, from_email, from_name, is_internal_note, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(info.lastInsertRowid, 'in', String(b.body), requester_email, String(b.requester_name || ''), now);
    }
    if (Array.isArray(b.tags)) setTicketTags(info.lastInsertRowid, b.tags);
    res.status(201).json(serializeTicket(findTicket.get(info.lastInsertRowid)));
  });

  app.get('/api/tickets/:id', requireAuth, (req, res) => {
    const t = findTicket.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json(serializeTicket(t, true));
  });

  app.patch('/api/tickets/:id', requireAuth, async (req, res) => {
    const t = findTicket.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const now = Date.now();
    const status = STATUSES.includes(b.status) ? b.status : t.status;
    const priority = PRIORITIES.includes(b.priority) ? b.priority : t.priority;
    let { sla_first_due_at, sla_resolve_due_at } = t;
    if (priority !== t.priority) {
      const sla = slaDueTimes(getSettings(db), priority, t.created_at);
      sla_first_due_at = sla.sla_first_due_at;
      sla_resolve_due_at = sla.sla_resolve_due_at;
    }
    const resolved_at = status === 'solved' && t.status !== 'solved' ? now
      : (status === 'open' || status === 'pending') ? null : t.resolved_at;
    const assignee_id = 'assignee_id' in b ? (b.assignee_id || null) : t.assignee_id;
    db.prepare(`
      UPDATE tickets SET status = ?, priority = ?, assignee_id = ?, sla_first_due_at = ?,
                         sla_resolve_due_at = ?, resolved_at = ?, updated_at = ? WHERE id = ?
    `).run(status, priority, assignee_id, sla_first_due_at, sla_resolve_due_at, resolved_at, now, t.id);
    if (Array.isArray(b.tags)) setTicketTags(t.id, b.tags);

    // When a ticket is solved, email the requester a CSAT link (soft-fail).
    if (status === 'solved' && t.status !== 'solved') {
      const s = getSettings(db);
      if (s.base_url) {
        const base = s.base_url.replace(/\/$/, '');
        sendEmail(s, t.requester_email, `Your ticket was solved: ${t.subject} [#${t.id}]`,
          `Your ticket has been marked solved.\n\nHow did we do?\nGood: ${base}/csat/${t.token}/good\nBad: ${base}/csat/${t.token}/bad`
        ).catch((e) => console.warn('[csat-email]', e.message));
      }
    }
    res.json(serializeTicket(findTicket.get(t.id)));
  });

  app.delete('/api/tickets/:id', requireAuth, (req, res) => {
    const t = findTicket.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM messages WHERE ticket_id = ?').run(t.id);
    db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ?').run(t.id);
    db.prepare('DELETE FROM tickets WHERE id = ?').run(t.id);
    res.json({ ok: true });
  });

  // Public reply or internal note.
  app.post('/api/tickets/:id/messages', requireAuth, async (req, res) => {
    const t = findTicket.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const body = String(b.body || '').trim();
    if (!body) return res.status(400).json({ error: 'body is required' });
    const isNote = b.is_internal_note ? 1 : 0;
    const now = Date.now();
    const agent = b.agent_id ? db.prepare('SELECT * FROM agents WHERE id = ?').get(b.agent_id) : null;
    const info = db.prepare(`
      INSERT INTO messages (ticket_id, direction, body, from_email, from_name, is_internal_note, agent_id, created_at)
      VALUES (?, 'out', ?, ?, ?, ?, ?, ?)
    `).run(t.id, body, agent ? agent.email : '', agent ? agent.name : 'Agent', isNote, agent ? agent.id : null, now);

    let mail = { skipped: true };
    if (!isNote) {
      if (!t.first_response_at) {
        db.prepare('UPDATE tickets SET first_response_at = ? WHERE id = ?').run(now, t.id);
      }
      try {
        mail = await sendReply(db, t, body);
      } catch (e) {
        mail = { error: e.message };
      }
    }
    db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now, t.id);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ message: msg, mail, ticket: serializeTicket(findTicket.get(t.id)) });
  });

  // ── macros ──────────────────────────────────────────────────────────────
  app.get('/api/macros', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM macros ORDER BY name').all());
  });

  app.post('/api/macros', requireAuth, (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.body) return res.status(400).json({ error: 'name and body are required' });
    const info = db.prepare('INSERT INTO macros (name, body, created_at) VALUES (?, ?, ?)')
      .run(String(b.name), String(b.body), Date.now());
    res.status(201).json(db.prepare('SELECT * FROM macros WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/macros/:id', requireAuth, (req, res) => {
    const m = db.prepare('SELECT * FROM macros WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    db.prepare('UPDATE macros SET name = ?, body = ? WHERE id = ?')
      .run(String(b.name || m.name), String(b.body || m.body), m.id);
    res.json(db.prepare('SELECT * FROM macros WHERE id = ?').get(m.id));
  });

  app.delete('/api/macros/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM macros WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Render a macro with {{variables}} substituted from a ticket.
  app.get('/api/macros/:id/render', requireAuth, (req, res) => {
    const m = db.prepare('SELECT * FROM macros WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ error: 'not found' });
    const t = req.query.ticket_id ? findTicket.get(req.query.ticket_id) : null;
    const agent = req.query.agent_id ? db.prepare('SELECT * FROM agents WHERE id = ?').get(req.query.agent_id) : null;
    const vars = {
      customer_name: (t && (t.requester_name || t.requester_email.split('@')[0])) || 'there',
      customer_email: (t && t.requester_email) || '',
      ticket_id: t ? String(t.id) : '',
      subject: (t && t.subject) || '',
      agent_name: (agent && agent.name) || 'Support'
    };
    const body = m.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
    res.json({ body });
  });

  // ── agents ──────────────────────────────────────────────────────────────
  app.get('/api/agents', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM agents ORDER BY name').all());
  });

  app.post('/api/agents', requireAuth, (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email) return res.status(400).json({ error: 'name and email are required' });
    try {
      const info = db.prepare('INSERT INTO agents (name, email, role, created_at) VALUES (?, ?, ?, ?)')
        .run(String(b.name), String(b.email).toLowerCase(), b.role === 'admin' ? 'admin' : 'agent', Date.now());
      res.status(201).json(db.prepare('SELECT * FROM agents WHERE id = ?').get(info.lastInsertRowid));
    } catch {
      res.status(400).json({ error: 'email already exists' });
    }
  });

  app.put('/api/agents/:id', requireAuth, (req, res) => {
    const a = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    db.prepare('UPDATE agents SET name = ?, email = ?, role = ? WHERE id = ?')
      .run(String(b.name || a.name), String(b.email || a.email).toLowerCase(),
           b.role === 'admin' ? 'admin' : b.role === 'agent' ? 'agent' : a.role, a.id);
    res.json(db.prepare('SELECT * FROM agents WHERE id = ?').get(a.id));
  });

  app.delete('/api/agents/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE tickets SET assignee_id = NULL WHERE assignee_id = ?').run(req.params.id);
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── tags & stats ────────────────────────────────────────────────────────
  app.get('/api/tags', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT t.*, COUNT(tt.ticket_id) AS count FROM tags t LEFT JOIN ticket_tags tt ON tt.tag_id = t.id GROUP BY t.id ORDER BY count DESC').all());
  });

  app.get('/api/stats', requireAuth, (req, res) => {
    const byStatus = {};
    for (const s of STATUSES) byStatus[s] = 0;
    for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status').all()) byStatus[r.status] = r.n;
    const byPriority = {};
    for (const r of db.prepare("SELECT priority, COUNT(*) AS n FROM tickets WHERE status IN ('open','pending') GROUP BY priority").all()) byPriority[r.priority] = r.n;
    const frt = db.prepare('SELECT AVG(first_response_at - created_at) AS avg_ms FROM tickets WHERE first_response_at IS NOT NULL').get();
    const csat = db.prepare('SELECT SUM(CASE WHEN csat = 1 THEN 1 ELSE 0 END) AS good, SUM(CASE WHEN csat = 0 THEN 1 ELSE 0 END) AS bad FROM tickets WHERE csat IS NOT NULL').get();
    const breaches = db.prepare(`
      SELECT COUNT(*) AS n FROM tickets
      WHERE status IN ('open','pending') AND first_response_at IS NULL AND sla_first_due_at < ?
    `).get(Date.now());
    res.json({
      by_status: byStatus,
      open_by_priority: byPriority,
      avg_first_response_ms: frt.avg_ms ? Math.round(frt.avg_ms) : null,
      csat_good: csat.good || 0,
      csat_bad: csat.bad || 0,
      sla_first_breaches: breaches.n
    });
  });

  // ── settings ────────────────────────────────────────────────────────────
  app.get('/api/settings', requireAuth, (req, res) => {
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '', imap_pass: s.imap_pass ? '********' : '' });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    const body = { ...(req.body || {}) };
    if (body.smtp_pass === '********') delete body.smtp_pass;
    if (body.imap_pass === '********') delete body.imap_pass;
    delete body.inbound_token; // server-generated
    setSettings(db, body);
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '', imap_pass: s.imap_pass ? '********' : '' });
  });

  app.post('/api/settings/test-email', requireAuth, async (req, res) => {
    const to = String((req.body || {}).to || '').trim();
    if (!to) return res.status(400).json({ error: 'recipient required' });
    try {
      const r = await sendEmail(getSettings(db), to, 'Deskly SMTP test', 'Your Deskly SMTP settings work.');
      if (r.skipped) return res.status(400).json({ error: 'SMTP is not configured' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── static frontend ─────────────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/inbound') || req.path.startsWith('/csat')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };

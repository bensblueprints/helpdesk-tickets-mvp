// Outbound SMTP (nodemailer) + optional inbound IMAP polling (imapflow).
// Everything soft-fails: an unconfigured mailbox never breaks ticketing.
const nodemailer = require('nodemailer');
const { getSettings, slaDueTimes, genToken } = require('./db');

function smtpConfigured(s) {
  return Boolean(s.smtp_host && s.smtp_from);
}

async function sendEmail(settings, to, subject, text) {
  if (!smtpConfigured(settings)) return { skipped: true };
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: Number(settings.smtp_port) === 465,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined
  });
  await transporter.sendMail({ from: settings.smtp_from, to, subject, text });
  return { sent: true };
}

// Shared ingestion for IMAP poller + /inbound webhook.
// Threads on a "[#123]" marker in the subject; otherwise creates a new ticket.
function ingestEmail(db, { from_email, from_name = '', subject = '(no subject)', body = '' }) {
  const now = Date.now();
  const m = String(subject).match(/\[#(\d+)\]/);
  if (m) {
    const existing = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(m[1]));
    if (existing) {
      db.prepare(
        'INSERT INTO messages (ticket_id, direction, body, from_email, from_name, is_internal_note, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(existing.id, 'in', body, from_email, from_name, now);
      const status = existing.status === 'solved' || existing.status === 'closed' ? 'open' : existing.status;
      db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now, existing.id);
      return { ticket_id: existing.id, created: false };
    }
  }
  const settings = getSettings(db);
  const priority = 'normal';
  const sla = slaDueTimes(settings, priority, now);
  const info = db.prepare(`
    INSERT INTO tickets (token, subject, requester_email, requester_name, status, priority,
                         sla_first_due_at, sla_resolve_due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
  `).run(genToken(), subject, from_email, from_name, priority, sla.sla_first_due_at, sla.sla_resolve_due_at, now, now);
  db.prepare(
    'INSERT INTO messages (ticket_id, direction, body, from_email, from_name, is_internal_note, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(info.lastInsertRowid, 'in', body, from_email, from_name, now);
  return { ticket_id: Number(info.lastInsertRowid), created: true };
}

// Send a public reply out to the requester, threaded with the [#id] marker
// and a CSAT footer when the install has a public base URL.
async function sendReply(db, ticket, body) {
  const settings = getSettings(db);
  let text = body;
  if (settings.base_url) {
    const base = settings.base_url.replace(/\/$/, '');
    text += `\n\n—\nHow did we do? Good: ${base}/csat/${ticket.token}/good  ·  Bad: ${base}/csat/${ticket.token}/bad`;
  }
  return sendEmail(settings, ticket.requester_email, `Re: ${ticket.subject} [#${ticket.id}]`, text);
}

// IMAP polling — only runs when imap_host is configured in settings/env.
function startMailPoller(db, intervalMs = 60_000) {
  let busy = false;
  async function poll() {
    if (busy) return;
    const s = getSettings(db);
    if (!s.imap_host || !s.imap_user) return;
    busy = true;
    try {
      const { ImapFlow } = require('imapflow');
      const { simpleParser } = require('mailparser');
      const client = new ImapFlow({
        host: s.imap_host,
        port: Number(s.imap_port) || 993,
        secure: true,
        auth: { user: s.imap_user, pass: s.imap_pass },
        logger: false
      });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false });
        for (const uid of uids || []) {
          const msg = await client.fetchOne(uid, { source: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
          ingestEmail(db, {
            from_email: from.address || 'unknown@unknown',
            from_name: from.name || '',
            subject: parsed.subject || '(no subject)',
            body: (parsed.text || '').trim()
          });
          await client.messageFlagsAdd(uid, ['\\Seen']);
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (e) {
      console.warn('[imap] poll failed:', e.message);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(poll, intervalMs);
  timer.unref?.();
  poll().catch(() => {});
  return () => clearInterval(timer);
}

module.exports = { sendEmail, sendReply, ingestEmail, startMailPoller, smtpConfigured };

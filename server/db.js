const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  // Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function genToken(len = 22) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'agent',       -- agent|admin
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,               -- used in CSAT links
      subject TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      requester_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',      -- open|pending|solved|closed
      priority TEXT NOT NULL DEFAULT 'normal',  -- low|normal|high|urgent
      assignee_id INTEGER,
      sla_first_due_at INTEGER,                 -- epoch ms
      sla_resolve_due_at INTEGER,
      first_response_at INTEGER,
      resolved_at INTEGER,
      csat INTEGER,                             -- 1 good, 0 bad, NULL unrated
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      direction TEXT NOT NULL,                  -- in|out
      body TEXT NOT NULL,
      from_email TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      is_internal_note INTEGER NOT NULL DEFAULT 0,
      agent_id INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS macros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS ticket_tags (
      ticket_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (ticket_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at);
  `);

  // Ensure the inbound webhook token exists.
  if (!db.prepare("SELECT value FROM settings WHERE key = 'inbound_token'").get()) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('inbound_token', genToken());
  }

  return db;
}

// SLA targets are minutes per priority.
const DEFAULT_SETTINGS = {
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  imap_host: '',
  imap_port: '993',
  imap_user: '',
  imap_pass: '',
  imap_poll_seconds: '60',
  base_url: '',
  inbound_token: '',
  sla_first_low: '1440',
  sla_first_normal: '480',
  sla_first_high: '120',
  sla_first_urgent: '30',
  sla_resolve_low: '10080',
  sla_resolve_normal: '2880',
  sla_resolve_high: '1440',
  sla_resolve_urgent: '240'
};

function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  if (process.env.SMTP_HOST) out.smtp_host = process.env.SMTP_HOST;
  if (process.env.SMTP_PORT) out.smtp_port = process.env.SMTP_PORT;
  if (process.env.SMTP_USER) out.smtp_user = process.env.SMTP_USER;
  if (process.env.SMTP_PASS) out.smtp_pass = process.env.SMTP_PASS;
  if (process.env.SMTP_FROM) out.smtp_from = process.env.SMTP_FROM;
  if (process.env.IMAP_HOST) out.imap_host = process.env.IMAP_HOST;
  if (process.env.IMAP_PORT) out.imap_port = process.env.IMAP_PORT;
  if (process.env.IMAP_USER) out.imap_user = process.env.IMAP_USER;
  if (process.env.IMAP_PASS) out.imap_pass = process.env.IMAP_PASS;
  if (process.env.IMAP_POLL_SECONDS) out.imap_poll_seconds = process.env.IMAP_POLL_SECONDS;
  if (process.env.BASE_URL) out.base_url = process.env.BASE_URL;
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (r.value !== '' && r.value != null) out[r.key] = r.value;
  }
  return out;
}

function setSettings(db, obj) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (k in DEFAULT_SETTINGS) stmt.run(k, String(v ?? ''));
    }
  });
  tx(Object.entries(obj));
}

function slaDueTimes(settings, priority, fromMs) {
  const first = Number(settings[`sla_first_${priority}`]) || 480;
  const resolve = Number(settings[`sla_resolve_${priority}`]) || 2880;
  return {
    sla_first_due_at: fromMs + first * 60_000,
    sla_resolve_due_at: fromMs + resolve * 60_000
  };
}

module.exports = { openDb, genToken, getSettings, setSettings, slaDueTimes, DEFAULT_SETTINGS };

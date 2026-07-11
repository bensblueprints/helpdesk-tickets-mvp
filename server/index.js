require('dotenv').config();
const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5341;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deskly.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const MAIL_POLL_MS = (Number(process.env.IMAP_POLL_SECONDS) || 60) * 1000;

const app = createApp({ dbPath: DB_PATH, adminPassword: ADMIN_PASSWORD, mailPollMs: MAIL_POLL_MS });

app.listen(PORT, () => {
  console.log(`Deskly listening on http://localhost:${PORT}`);
  if (ADMIN_PASSWORD === 'admin') {
    console.log('⚠ Using default admin password — set ADMIN_PASSWORD in .env for production.');
  }
});

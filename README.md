# Deskly 🎫

![MIT](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

**The email-to-ticket helpdesk you own forever.** Shared inbox, SLA timers, canned replies, internal notes, CSAT — self-hosted on a $5 VPS or run as a desktop app. Pay once. No per-agent pricing. No Zendesk subscription.

> A 3-person team pays Zendesk ~$2,000/yr, forever. Deskly is **$49 once**.

![screenshot](docs/screenshot.png)

## Features

- 📧 **Email → ticket**: poll any IMAP inbox, or POST to a token-protected `/inbound` webhook from any forwarding service. Replies thread automatically via `[#id]` subject markers.
- 📤 **Outbound replies over SMTP**, threaded to the requester, with an optional CSAT footer.
- 🗂 **Ticket workflow**: open / pending / solved / closed, four priorities, assignees, tags, saved views, full-text-ish search.
- ⚡ **Canned responses (macros)** with variable substitution — `{{customer_name}}`, `{{ticket_id}}`, `{{subject}}`, and more.
- 📝 **Internal notes vs public replies** — notes never email the customer; @mention teammates in notes.
- ⏱ **SLA timers per priority** (first response + resolution) with live breach badges and a breach counter on the dashboard.
- 👍 **CSAT**: solved tickets email a thumbs up/down link; ratings roll up on the dashboard.
- 👥 **Multi-agent** with simple agent/admin roles.
- 📊 **Dashboard**: tickets by status, open by priority, average first-response time, SLA breaches, CSAT %.
- 🌚 Dark-mode React UI (Tailwind + Lucide + Framer Motion).

## Quick start

```bash
npm i
npm run build     # build the React frontend
npm start         # → http://localhost:5341  (password: admin — change it!)
```

Copy `.env.example` to `.env` to set `PORT`, `ADMIN_PASSWORD`, SMTP/IMAP, and `BASE_URL`.

### Desktop mode

Run it as a desktop app, or deploy to a $5 VPS when you need it public:

```bash
npm run desktop   # Electron window, auto-logged-in, data in your user profile
```

### Docker

```bash
docker compose up -d   # persists SQLite in a named volume
```

## Getting email in

1. **IMAP polling** — point Settings → Inbound at any mailbox (a Gmail alias works). Unseen mail becomes tickets.
2. **Webhook** — no mailbox needed: have your form/backend/mail-forwarder POST JSON to `POST /inbound/<token>` (`from_email`, `subject`, `body`). The token is shown in Settings.

## Deskly vs Zendesk

| | **Deskly** | Zendesk Suite Team |
|---|---|---|
| Price | **$49 once** | $55 /agent/mo |
| 3 agents, 1 year | **$49** | ~$1,980 |
| Email → ticket | ✅ | ✅ |
| SLA timers | ✅ | ✅ (higher tiers) |
| Macros / canned replies | ✅ | ✅ |
| CSAT | ✅ | ✅ |
| Your data | **Your SQLite file** | Their cloud |
| Self-hosted | ✅ | ❌ |
| Per-agent fees | **Never** | Always |

## ☕ Skip the setup — get the 1-click installer

Want the packaged Windows installer with everything pre-wired? Grab it on Whop:
**[https://whop.com/benjisaiempire/deskly-app](https://whop.com/benjisaiempire/deskly-app)**

## Tech stack

Node 20+ · Express · better-sqlite3 · imapflow · nodemailer · React 18 · Vite · Tailwind 4 · Framer Motion · Lucide · Electron (desktop mode)

## Tests

```bash
npm test   # boots the real server, runs inbound → reply → SLA → CSAT end-to-end
```

## License

MIT © 2026 Ben (bensblueprints)

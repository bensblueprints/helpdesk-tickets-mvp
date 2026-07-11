# Product Hunt — Deskly

**Name:** Deskly

**Tagline (60 chars):** The $49-once helpdesk that replaces your Zendesk subscription

**Description (260 chars):**
Self-hosted email-to-ticket helpdesk. IMAP/webhook inbound, SMTP replies, SLA timers, macros, internal notes, CSAT, multi-agent — on your VPS or as a desktop app. Pay $49 once instead of $55/agent/mo. Your tickets live in your SQLite file, forever.

**Full description:**
Deskly is a complete helpdesk you install once and own forever.

Email hits your support inbox (IMAP polling or a simple webhook) and becomes a ticket. Agents reply from a clean shared-inbox UI; replies go out over your SMTP, threaded. You get the workflow you actually use from Zendesk — statuses, priorities, assignees, tags, saved views, canned responses with variables, internal notes, SLA timers with breach badges, thumbs-up/down CSAT, and a small honest dashboard.

It runs as a single Node process with SQLite: `docker compose up` on a $5 VPS, or `npm run desktop` for a local Electron app. MIT-licensed source; the paid version is the convenience installer.

No per-agent pricing. No data hostage. No subscription.

**Maker first comment:**
Hey PH 👋 I got tired of watching small teams pay $55/agent/month for what is, at its core, an inbox with statuses. A 3-person team gives Zendesk ~$2,000 a year — every year — for features they could run on a $5 VPS. So I built Deskly: one Node process, one SQLite file, the 20% of Zendesk everyone actually uses (email-to-ticket, SLAs, macros, CSAT, notes), and none of the seat math. Source is MIT on GitHub; $49 gets you the packaged installer and my eternal gratitude. Ask me anything — especially about IMAP edge cases, I have scars.

**Gallery shots (5):**
1. Ticket list with status/priority badges, SLA breach chips, and saved views in dark mode.
2. Ticket detail: conversation thread showing inbound email, an amber internal note, and a public reply.
3. Macro editor with `{{customer_name}}` variables and live preview.
4. Dashboard: tickets by status, avg first-response time, CSAT %, SLA breach counter.
5. Settings page showing IMAP + webhook inbound options with the copy-paste webhook curl.

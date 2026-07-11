# Launch Strategy — Deskly

## Pricing math
- Zendesk Suite Team: **$55/agent/mo** → 3 agents = $1,980/yr
- Freshdesk: $15–79/agent/mo; Help Scout: $22–65/user/mo
- **Deskly: $49 one-time** → pays for itself vs Zendesk in **under 1 month** for a single agent; a 3-agent team saves ~$1,931 in year one.

## Target communities (rules-aware angles)
- **r/selfhosted** — angle: "I built a self-hosted Zendesk replacement (MIT)". Lead with the source + Docker compose, not the paid installer; that community converts on ownership. Post the repo, mention the paid installer only in comments if asked.
- **r/smallbusiness** — angle: cost story. "How we cut our support tooling from $2k/yr to $49." No links in post if the sub disallows; put it in profile.
- **r/sysadmin** — angle: shared-inbox pain + IMAP-in/SMTP-out simplicity. They'll grill the email parsing — be in the comments.
- **r/Entrepreneur / Indie Hackers** — build-in-public numbers post after launch week.

## Show HN draft
**Title:** Show HN: Deskly – a self-hosted email-to-ticket helpdesk (SQLite, one process)

I got tired of per-agent helpdesk pricing, so I built the 20% of Zendesk that small teams actually use: IMAP/webhook inbound email becomes tickets, agents reply over SMTP, with statuses, SLA timers, macros with variables, internal notes, CSAT links, and a small dashboard.

Design choices: one Node/Express process, better-sqlite3 (your entire helpdesk is one file you can back up with cp), React frontend served by the same process, an Electron wrapper for local/desktop use, and a token webhook so you don't need IMAP at all if your mail provider can forward.

MIT source. I sell a packaged one-click installer for people who don't want to touch a terminal. Happy to answer anything about email threading — subject-marker threading ([#123]) turned out to be far more reliable than Message-ID chains across providers.

## SEO keywords (10)
1. zendesk alternative self hosted
2. free helpdesk software
3. open source ticket system
4. email to ticket self hosted
5. one time purchase helpdesk
6. helpdesk without subscription
7. small business ticketing system
8. help scout alternative
9. shared inbox self hosted
10. freshdesk alternative one time

## AppSumo / PitchGround pitch
Deskly is a self-hosted helpdesk that kills per-agent pricing: email-to-ticket (IMAP or webhook), SMTP replies, SLA timers, canned responses, internal notes, CSAT, and a clean dark-mode dashboard — deployed with one Docker command or run as a desktop app. Your buyers keep their support data in their own SQLite database forever. Lifetime-deal audiences already hate subscriptions; Deskly IS the anti-subscription helpdesk, MIT-licensed with a polished installer — a natural LTD with genuinely zero recurring COGS.

## Suggested price
**$49 one-time.** Anchor: "Zendesk charges a single agent $660/yr. Deskly pays for itself in 27 days — then it's free forever."

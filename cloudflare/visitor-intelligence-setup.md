# Visitor Intelligence — Free Plan Setup

This change adds a first-pass visitor tracking client and POST /track endpoint to the existing portfolio-contact-telegram Worker.

## Cloudflare binding required before deployment

A KV namespace has been created:
- Namespace: kokushibu74-visitor-intelligence
- Namespace ID: f3333aa713ed4d258ada3b24b6bf2981
- Worker binding name: VISITOR_KV
- Binding type: Workers KV

Attach this namespace to the existing Worker. Do not replace existing bindings or Cron triggers.

## Existing bindings and schedule to preserve
- GA4_SERVICE_ACCOUNT_JSON (secret)
- TELEGRAM_BOT_TOKEN (secret)
- TELEGRAM_CHAT_ID (secret)
- TELEGRAM_WEBHOOK_SECRET (secret)
- Cron: */30 * * * *
- Compatibility date: 2026-10-25

## Routes
- POST /track: visitor profile, page/session events, Cloudflare network metadata, and Telegram alerts.
- POST /submit: existing contact form route (unchanged).
- POST /telegram-webhook: existing Telegram /info route (unchanged).

## Free-tier safeguards and known limits
- One profile KV record per visitor is refreshed with a 365-day TTL.
- A coarse five-minute traffic counter is used for spike alerts.
- Alert deduplication uses 24-hour marker keys.
- KV free-tier write limits can still be reached at high traffic. Tracking must fail gracefully and must not interfere with contact form or health reporting.
- City/ISP/ASN and connection hints depend on Cloudflare/browser metadata availability. They are not guaranteed.
- Browser visitor ID is not a verified real-world identity; clearing storage or switching browsers creates a new ID.
- This first pass does not provide a dashboard, cross-device identity, paid VPN intelligence, or exact per-person carrier identification.

## Deploy and verify
1. Attach VISITOR_KV to the existing Worker using the namespace ID above.
2. Deploy this Worker source while preserving all current secrets and the existing Cron trigger.
3. Confirm POST /track returns ok: true from the live website.
4. Confirm one new-visitor alert, then a returning-session alert after 30 minutes of inactivity.
5. Confirm /info, contact form, 30-minute health check, and 11 PM GA4 report remain operational.
6. Verify the browser console has no tracking errors on desktop and mobile.

No Paid API or Paid Service is used by this implementation.

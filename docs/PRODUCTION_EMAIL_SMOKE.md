# Production Demo Email Smoke

Use this after deployment to verify that the public demo form path stores a lead and records email delivery in the action audit.

## Command

Run on the production server from `/home/chatbot`:

```bash
set -a
. ./.env.production
set +a
CHATBOT_BASE_URL=https://chatbot.jilanov.com CHATBOT_SITE_ID=site_demo npm run smoke:production-demo
```

The script:

- checks `/health`;
- submits a demo-style public lead;
- verifies the lead is visible through the admin API;
- verifies a `lead_email_delivery` action exists and completed;
- marks the smoke lead as `spam` so the admin inbox stays clean.

It does not print secrets. It prints only status lines, provider id, and recipient domain.

## Environment

- `ADMIN_TOKEN` is required.
- `CHATBOT_BASE_URL` defaults to `https://chatbot.jilanov.com`.
- `CHATBOT_SITE_ID` defaults to `site_demo`.
- `SMOKE_EMAIL` defaults to a timestamped `example.com` address.
- `REQUIRE_EMAIL_DELIVERY=false` allows the script to pass when email is intentionally disabled.

## Domain Email Checks

The script confirms application-level delivery, not DNS configuration. For production sender quality, also verify:

- SPF includes the chosen provider.
- DKIM record is verified by the provider.
- DMARC exists for the sender domain.
- The sender address matches `EMAIL_FROM` or `SMTP_FROM`.
- The owner inbox receives the smoke email.
- The action audit shows `lead_email_delivery` with status `completed`.

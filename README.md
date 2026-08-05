# Chatbot SaaS

Embeddable AI sales and support assistant for business websites and ecommerce stores.

The repo currently contains the first MVP implementation:

- `apps/api`: public widget API and admin API with file-backed development persistence.
- `apps/admin`: static admin console for site setup, knowledge, leads, analytics, and action audit.
- `packages/contracts`: shared TypeScript contracts and validation helpers.
- `packages/ai`: OpenAI, Gemini, and null AI provider abstraction.
- `packages/widget`: embeddable browser widget.
- `apps/marketing`: static landing sales page.
- `Plan.md`: product, roadmap, landing page, and SaaS feature plan.
- `docs/LANDING_PAGE.md`: focused landing page sales structure and remaining proof assets.
- `docs/EVALS.md`: assistant quality and safety evaluation suite.
- `docs/SALES_KIT.md`: Bulgarian pilot offer, demo flow, pricing hypothesis, and objection handling.
- `docs/PILOT_RUNBOOK.md`: 30-day pilot setup, cadence, metrics, and report template.
- `docs/INTEGRATION_ROADMAP.md`: ecommerce, CRM, helpdesk, calendar, and channel expansion sequence.
- `docs/PRODUCTION_EMAIL_SMOKE.md`: production demo-lead and email-delivery validation command.

## Local Setup

```bash
npm install
cp .env.example .env
npm run build
npm run test
npm run assistant:eval
npm run dev:api
```

Open the marketing page locally:

```bash
npm run dev:marketing
```

Open the admin console locally:

```bash
npm run dev:admin
```

The API defaults to `http://localhost:8787`.

For the live landing demo, seed the demo site first:

```bash
npm run seed:dev
```

Then run the API and marketing page. The landing page uses `site_demo` and loads the local widget bundle from `/vendor/widget.js`.

## Verification

Run the same checks as CI:

```bash
npm run type-check
npm run build
npm test
npm run assistant:eval
```

GitHub Actions runs these checks on pushes to `main` and on pull requests.

Validate the deployed demo lead/email path after production deploys:

```bash
CHATBOT_BASE_URL=https://chatbot.jilanov.com CHATBOT_SITE_ID=site_demo npm run smoke:production-demo
```

Run it with production environment variables loaded so `ADMIN_TOKEN` and email provider settings are available.

## Admin API

Admin routes require:

```http
Authorization: Bearer change-me
```

Set `ADMIN_TOKEN` in `.env` for real environments.

The admin console accepts either the bootstrap token or a one-time user access token created by an owner. Set `ADMIN_BASE_URL` to the deployed admin console URL so invitation emails point to the right place.

## Email Notifications

Lead, support-ticket, and admin user invitation email notifications are disabled by default. To enable Resend delivery, configure the API environment and set each site's contact email in the admin console for lead/support notifications:

```bash
EMAIL_PROVIDER=resend
EMAIL_PROVIDER_API_KEY=re_xxx
EMAIL_FROM="Assistant <notify@example.com>"
```

Delivery success or failure is recorded in the action audit. Visitor requests are not failed when an email provider is unavailable.

## Jilanov Admin Sync

Set `JILANOV_CONTACT_SYNC_URL` to the existing Jilanov contact-message endpoint when chatbot demo/booking leads should also appear in the main Jilanov admin panel messages list. The sync is server-side only, uses the legacy `name`/`email`/`phone`/`message` payload, and records `jilanov_contact_sync` audit entries without failing visitor submissions.

## Widget Install

After building `packages/widget`, host `packages/widget/dist/widget.js` on your CDN or app domain:

```html
<script
  src="https://cdn.example.com/widget.js"
  data-site-id="site_xxx"
  data-api-url="https://api.example.com"
  async
></script>
```

## Implementation Status

This is an MVP foundation. It implements the Lead Assistant path first: site config, scoped admin users and roles, knowledge answers, conversations, lead capture, duplicate lead detection, booking-link routing, lead status workflow, CSV lead export, handoff tickets, webhook and email delivery hooks, plan limits, billing summaries, privacy export/erasure/retention controls, analytics, action audit, assistant evals, and embeddable widget.

Commerce adapters, payment-provider billing, password/session auth, automated retention scheduling, richer notification templates, and advanced CRM/helpdesk integrations remain roadmap items in `Plan.md`.

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

## Admin API

Admin routes require:

```http
Authorization: Bearer change-me
```

Set `ADMIN_TOKEN` in `.env` for real environments.

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

This is an MVP foundation. It implements the Lead Assistant path first: site config, scoped admin users and roles, knowledge answers, conversations, lead capture, lead status workflow, CSV lead export, handoff tickets, webhook delivery hooks, plan limits, billing summaries, privacy export/erasure/retention controls, analytics, action audit, assistant evals, and embeddable widget.

Commerce adapters, payment-provider billing, password/session auth, automated retention scheduling, mail-provider notifications, and advanced CRM/helpdesk integrations remain roadmap items in `Plan.md`.

# Chatbot SaaS Product Plan

## Goal

Turn the existing chatbot work into a sellable hosted service for business websites and ecommerce stores.

The strongest product is not a generic AI chat bubble. The defensible product is an AI sales and support assistant that can answer from approved company knowledge, show products, route users to the right workflow, hand off unresolved cases to staff, and keep an audit trail of every important action.

## Product Positioning

### Primary Offer

**AI sales and support assistant for ecommerce and business websites.**

It helps visitors find products or services, answers common questions from controlled knowledge, captures leads, routes support requests, and gives the business visibility into conversations and unresolved cases.

### Why This Is Sellable

- The current ecommerce assistant already has safety-oriented behavior: it does not invent order status, does not claim cart mutations before they happen, requires confirmation for sensitive actions, and logs operational decisions.
- Most simple chatbot products are prompt wrappers. This can be positioned as an operational assistant with structured actions, audit logs, product cards, and human handoff.
- The existing code proves there is demand: people already like the web interface bot.

### Initial Target Customers

- Small and medium ecommerce stores.
- B2B companies with complex products or service inquiries.
- Agencies building websites for clients.
- Local businesses that receive repetitive questions about pricing, services, delivery, warranty, returns, working hours, demos, or appointments.
- Existing Jilanovi clients that already have ecommerce, CRM, ERP, or EU-funded project websites.

## Product Tiers

### Tier 1: Lead Assistant

For normal business websites.

Core value:

- Answers common questions.
- Captures contact details.
- Qualifies leads.
- Sends users to meeting, demo, contact, pricing, or service pages.
- Gives admins a simple inbox and knowledge editor.

### Tier 2: Commerce Assistant

For ecommerce stores.

Core value:

- Product discovery.
- Product cards in chat.
- Product comparison.
- Cart and checkout handoff.
- Return, warranty, order, invoice, and delivery routing.
- Staff support queue.
- Product feed/API integrations.

### Tier 3: Managed Assistant

For customers that want us to run the assistant for them.

Core value:

- Setup and branding done by us.
- Knowledge-base writing.
- Monthly conversation review.
- Safety tuning.
- Product feed QA.
- Conversion optimization.

## Required SaaS Features

### 1. Multi-Tenant Platform

Must-have:

- Organizations.
- Sites/projects under each organization.
- Users and roles.
- Per-site assistant configuration.
- Tenant-isolated conversations, knowledge, action logs, usage, and billing.
- Domain allowlist for widget usage.
- API keys or signed site tokens for public widget requests.
- Organization-level settings for default language, timezone, data retention, and billing.

Roles:

- Owner: billing, users, all settings.
- Admin: assistant setup, knowledge, integrations, analytics.
- Support: conversations, handoff queue, resolved cases.
- Viewer: read-only analytics and conversation review.

### 2. Embeddable Widget

Must-have:

- One-line script install:

```html
<script
  src="https://cdn.example.com/widget.js"
  data-site-id="site_xxx"
  async
></script>
```

- Works on any website, not only Next.js.
- Isolated styles, preferably iframe or Shadow DOM.
- Responsive desktop and mobile layout.
- Configurable brand color, icon, title, subtitle, launcher position, and welcome message.
- Clear AI disclosure in the widget header or welcome text.
- Conversation persistence per visitor.
- Open/close API:

```js
window.Chatbot.open();
window.Chatbot.close();
window.Chatbot.send("I need help choosing a laptop");
```

- Event callbacks:

```js
window.Chatbot.on("lead_created", handler);
window.Chatbot.on("product_clicked", handler);
window.Chatbot.on("handoff_requested", handler);
```

- Optional delayed load to protect Core Web Vitals.
- Accessibility: keyboard navigation, focus management, labels, readable contrast.
- Consent-aware mode for analytics and tracking.

Nice-to-have:

- Proactive messages based on URL, cart state, or time on page.
- Custom launcher button support.
- White-label mode.
- Multi-language auto-detection.
- Offline contact form when the assistant is disabled.

### 3. Chat Engine

Must-have:

- Provider abstraction for OpenAI, Gemini, and null/local testing provider.
- Strict request/response contracts.
- Message length limits.
- History limits.
- Rate limiting per IP, site, organization, and plan.
- Timeout handling.
- Retry/backoff for provider errors.
- Safe fallback replies when the model fails.
- Structured intent classification before action execution.
- Deterministic handling for sensitive flows.
- Sanitization of model replies before display.
- No raw prompt, internal IDs, Markdown artifacts, or hidden UI keys in user replies.
- Language matching: answer in the user's language where supported.
- Explicit refusal for unsafe or unsupported operational requests.

Must preserve from the existing assistant:

- Do not claim a cart/order/action happened until the real system confirms it.
- Do not invent order, payment, invoice, delivery, return, warranty, or cancellation status.
- Require login, exact reference, eligibility checks, and explicit confirmation for sensitive customer-account actions.
- Treat product compatibility questions conservatively.
- Route unresolved cases to staff rather than guessing.

### 4. Knowledge Base

Must-have:

- Admin-managed knowledge entries.
- Enabled/disabled state per entry.
- Intent/category per entry.
- Keywords and optional semantic search.
- Answers per locale.
- Preview/test question before saving.
- History and rollback.
- Draft/publish flow.
- Import from CSV, text, website pages, and manual entry.
- Safe answer precedence: approved knowledge before AI-generated answer.
- Per-answer freshness/review metadata.

Knowledge types:

- Company information.
- Services.
- Pricing policy.
- Delivery policy.
- Return policy.
- Warranty policy.
- Payment policy.
- Invoices/proformas.
- Store location and working hours.
- Support routing.
- Human handoff instructions.
- Product/service selection guidance.

Nice-to-have:

- Crawl selected website URLs.
- PDF/DOCX upload.
- Knowledge conflict detection.
- Missing-answer suggestions from failed conversations.
- Automatic translation draft with human approval.

### 5. Lead Capture

Must-have:

- Name, email, phone, company, message, page URL, language, consent timestamp.
- Configurable required fields.
- Lead qualification questions.
- Source tracking: UTM, referrer, landing page, current page.
- Admin lead inbox.
- Email notification to business.
- Export CSV.
- Webhook delivery.
- Spam protection.

Nice-to-have:

- CRM sync: HubSpot, Pipedrive, Zoho, Salesforce, custom webhook.
- Meeting booking integrations.
- Lead scoring.
- Automatic lead summary.
- Duplicate lead detection.

### 6. Ecommerce Assistant Features

Must-have:

- Product feed ingestion.
- Product search by title, category, brand, model, SKU, part number, price, availability, and attributes.
- Product cards inside chat.
- Product recommendation reasons.
- Product comparison.
- Exact model/part-number matching before AI.
- No loose recommendations for unknown exact part numbers.
- Product selection from visible results.
- Add-to-cart handoff using client-side action boundary.
- Checkout handoff.
- Favorites handoff.
- Price/stock alert handoff.
- Return/warranty/order/invoice routing.
- Staff handoff when system data is missing.

Integration adapters:

- Generic JSON feed.
- CSV feed.
- WooCommerce.
- Shopify.
- OpenCart.
- Custom REST API.
- Jilanovi ecommerce platform.

Product data required:

- ID/SKU.
- Name.
- URL.
- Image.
- Price.
- Currency.
- Category.
- Availability.
- Description.
- Attributes/specs.
- Variants/options.
- Compatibility fields where relevant.

Nice-to-have:

- Cart state API.
- Order lookup API.
- Authenticated customer actions.
- Live inventory sync.
- Promo-code validation.
- Assisted checkout for trusted integrations.

### 7. Human Handoff And Support Queue

Must-have:

- Conversation can become a staff ticket.
- Handoff reason.
- Customer contact data.
- Conversation transcript.
- Source page and locale.
- Priority/status.
- Assignment.
- Internal notes.
- Mark resolved/blocked.
- Email notification.

Support statuses:

- New.
- Waiting for customer.
- Waiting for staff.
- Resolved.
- Blocked.

Nice-to-have:

- Live chat takeover.
- Slack/Teams notifications.
- Helpdesk integrations: Zendesk, Freshdesk, Intercom.
- SLA tracking.

### 8. Action Ledger

Must-have:

- Record every important assistant decision and client-side action.
- Store action, status, confidence, source text, assistant reply, reason, customer identifiers where available, product/order references where available, metadata, reviewer, and resolution note.
- Filter by action, status, customer, product, order, date, and text search.
- Summary dashboard for the last 7/30 days.
- Review workflow for failed, blocked, and pending-staff events.

Statuses:

- Answered.
- Pending customer.
- Pending staff.
- Completed.
- Failed.
- Blocked.

Confidence:

- Deterministic.
- AI.
- Customer click.
- System.

### 9. Analytics

Must-have:

- Conversations.
- Messages.
- Unique visitors.
- Leads captured.
- Handoffs.
- Product clicks.
- Cart/checkout handoffs.
- Negative feedback.
- Failed/blocked actions.
- Top questions.
- Unanswered questions.
- Language split.
- Page/source performance.
- Usage against plan limits.

Nice-to-have:

- Conversion attribution.
- Revenue influence.
- Funnel view.
- Cohort comparison.
- A/B testing welcome prompts.
- Weekly email digest.

### 10. Admin Application

Must-have:

- Organization/site switcher.
- Widget setup page.
- Branding editor.
- Knowledge editor.
- Conversation inbox.
- Lead inbox.
- Support queue.
- Action ledger.
- Analytics dashboard.
- Integration setup.
- Billing page.
- User/role management.
- Audit log.

Admin UX requirements:

- Simple enough for non-technical business users.
- Clear test assistant preview.
- Clear install instructions.
- No raw technical provider errors shown to normal users.
- Explicit warnings when the assistant is disabled, billing-limited, or missing knowledge.

### 11. Billing And Packaging

Must-have:

- Plans.
- Usage metering by messages and/or conversations.
- Monthly included usage.
- Overage tracking.
- Billing customer ID.
- Subscription status.
- Trial status.
- Hard and soft usage limits.
- Billing webhooks.
- Admin billing screen.

Suggested pricing model:

- Starter: Lead Assistant, 1 site, limited conversations, email leads.
- Growth: Lead Assistant plus knowledge history, webhooks, analytics, more usage.
- Commerce: Product feed, product cards, compare, ecommerce actions, support queue.
- Managed: Commerce plus setup, monthly optimization, priority support.

### 12. Security And Abuse Controls

Must-have:

- Domain allowlist for widget calls.
- Public site token scoped to a site, not admin privileges.
- Server-side rate limits.
- Bot/spam protection.
- No secrets in client bundle.
- Input validation at every public endpoint.
- Output sanitization.
- CORS locked to configured domains.
- Request logging without exposing secrets.
- Admin auth with secure cookies/JWT.
- Role-based permissions.
- Audit log for admin changes.

Nice-to-have:

- IP reputation throttling.
- Abuse dashboard.
- Per-tenant provider key option.
- BYO model provider option.

### 13. Privacy, GDPR, And AI Act Readiness

Must-have:

- Clear disclosure that users are chatting with AI.
- Privacy notice link inside widget.
- Configurable retention period.
- Conversation delete/export tools.
- Data processing agreement template.
- Consent-aware analytics.
- Ability to disable conversation training/use beyond service operation.
- PII minimization in prompts and logs.
- Admin controls for what data is sent to model providers.
- EU-hosting option or clear hosting disclosure.

Important date:

- EU AI Act transparency obligations for certain AI systems, including chatbots, apply from 2 August 2026. The widget should explicitly inform users that they are interacting with an AI assistant.

### 14. Quality And Evaluation

Must-have:

- Unit tests for deterministic intent routing.
- Regression tests for guardrails.
- Eval suite with real customer prompts.
- Smoke test against staging.
- Reply safety checks:
  - no internal IDs,
  - no prompt leakage,
  - no unsupported action claims,
  - no raw Markdown artifacts,
  - no invented operational facts.

Initial release gate:

```bash
npm run type-check
npm run lint
npm test
npm run build
npm run assistant:eval
```

### 15. Operations

Must-have:

- Production API deployment.
- CDN-hosted widget bundle.
- Admin app deployment.
- PostgreSQL database.
- Redis for rate limits and queues.
- Background workers for ingestion, emails, webhooks, and digests.
- Error monitoring.
- Request/usage monitoring.
- Backup and restore process.
- Tenant-aware migrations.

Nice-to-have:

- Status page.
- Incident notifications.
- Per-tenant data export.

## Suggested Technical Architecture

### Repo Layout

```text
apps/
  api/
  admin/
  marketing/
packages/
  widget/
  contracts/
  ai/
  knowledge/
  integrations/
  config/
  eslint-config/
  tsconfig/
infra/
  docker/
  migrations/
docs/
```

### Core Data Model

Core tables:

- organization
- organization_user
- site
- site_domain
- assistant
- assistant_config
- knowledge_entry
- knowledge_revision
- conversation
- conversation_message
- lead
- support_ticket
- action_log
- product_source
- product_item
- integration
- usage_event
- subscription
- webhook_endpoint
- admin_audit_log

### Public APIs

Widget APIs:

- `GET /public/sites/:siteId/config`
- `POST /public/sites/:siteId/conversations`
- `POST /public/sites/:siteId/chat`
- `POST /public/sites/:siteId/feedback`
- `POST /public/sites/:siteId/actions`
- `POST /public/sites/:siteId/leads`

Admin APIs:

- `/admin/organizations`
- `/admin/sites`
- `/admin/assistants`
- `/admin/knowledge`
- `/admin/conversations`
- `/admin/leads`
- `/admin/support-tickets`
- `/admin/action-logs`
- `/admin/integrations`
- `/admin/analytics`
- `/admin/billing`

### Widget Runtime Modes

- Lead mode: no product integration required.
- Commerce read-only mode: product search and cards only.
- Commerce action mode: product search plus cart/favorites/checkout/handoff actions.
- Support mode: order/support routing, optionally authenticated.

## Migration From Existing Code

### Reuse From `EU`

Strong candidates to extract:

- AI provider abstraction from `boilerplate/api/src/common/ai`.
- Assistant DTO/action response shape from `boilerplate/api/src/modules/ecommerce/assistant/dto`.
- Action ledger concept and statuses.
- Knowledge base history/rollback concept.
- Guardrail tests from `assistant.service.spec.ts`.
- Store widget UX patterns from `mitko-widget.tsx`.
- Product card and compare panel patterns.
- Eval/smoke script concepts from `boilerplate/store/scripts/assistant-*`.

### Rewrite Instead Of Copying Directly

- Tenant model.
- Admin app navigation and layout.
- Embeddable widget bundle.
- Ecommerce integrations.
- Billing.
- Product ingestion.
- Generic lead assistant prompt/config.

### Remove Hard-Coded Assumptions

- Jilanovi company facts.
- Mitko assistant name as default.
- Bulgarian-only defaults.
- Current ecommerce platform-specific URLs.
- Current customer/order/cart service dependencies.
- Current admin permission names.
- Local business address, phone, and support text.

## MVP Scope

The first sellable MVP should be narrow:

1. Lead Assistant.
2. Embeddable widget.
3. Admin knowledge base.
4. Conversation and lead inbox.
5. Basic action/decision log.
6. Site branding and domain allowlist.
7. Usage metering.
8. Email/webhook lead notifications.
9. Basic analytics.
10. AI transparency and privacy controls.

Do not start with full assisted checkout, live order mutation, or many ecommerce platforms. Those are second-phase Commerce features.

## Commerce Beta Scope

Add after MVP:

1. Product feed import.
2. Product search.
3. Product cards.
4. Product comparison.
5. Product click analytics.
6. Add-to-cart/checkout client action boundary.
7. Return/warranty/support handoff.
8. Commerce action ledger.
9. WooCommerce or Shopify first, then OpenCart/custom REST.

## Landing Sales Page Plan

### Page Goal

Convert business owners, ecommerce operators, and agencies into demo requests or trials.

Primary CTA:

- Book a demo.

Secondary CTA:

- See live demo.

Optional CTA:

- Get install instructions.

### Hero Section

Purpose:

- Immediately explain what the product is and why it is different.

Recommended headline:

> AI assistant for ecommerce and business websites

Recommended subheadline:

> Answer customer questions, recommend products, capture leads, and route support cases with a safe assistant that keeps an audit trail.

Hero proof points:

- Embeds with one script.
- Uses your approved knowledge.
- Shows products and routes actions safely.
- Includes staff handoff and analytics.

Hero visual:

- Real product UI screenshot/mockup: chat widget with product cards and admin action ledger.
- Avoid abstract AI graphics. Show the actual interface.

Primary CTA:

- Book a demo.

Secondary CTA:

- View live assistant.

### Social Proof Strip

Content:

- "Built from a production ecommerce assistant."
- "Tested with guarded order, cart, invoice, return, and warranty flows."
- "Supports multilingual websites."

Later, replace with real metrics:

- Conversations handled.
- Leads captured.
- Product clicks.
- Reduction in repeated support questions.
- Customer logos.

### Problem Section

Problems to state:

- Visitors ask the same questions repeatedly.
- Product catalogs are hard to navigate.
- Support teams waste time on simple routing.
- Generic bots hallucinate or promise things they cannot do.
- Businesses cannot see which assistant answers failed.

### Solution Section

Core message:

- The assistant answers from approved knowledge and only performs actions through controlled workflows.

Feature points:

- Approved knowledge first.
- Product-aware recommendations.
- Safe action handoff.
- Human support queue.
- Conversation analytics.
- Admin-managed setup.

### Product Modes Section

Show three cards:

1. Lead Assistant
   - FAQ answers.
   - Lead capture.
   - Meeting/demo routing.
   - Email/webhook notifications.

2. Commerce Assistant
   - Product search.
   - Product cards.
   - Compare.
   - Cart and checkout handoff.
   - Return/warranty/order support routing.

3. Managed Assistant
   - Setup by us.
   - Knowledge writing.
   - Monthly tuning.
   - Conversation QA.

### How It Works Section

Steps:

1. Add your site.
2. Upload or write approved knowledge.
3. Configure brand, language, and lead rules.
4. Install one script.
5. Review conversations, leads, and unresolved cases.

### Safety And Trust Section

Required points:

- Clear AI disclosure.
- No unsupported promises.
- No fake order/cart status.
- Human handoff for uncertain cases.
- Action audit trail.
- Rate limits and domain allowlist.
- GDPR-ready retention controls.

### Ecommerce Feature Section

Show concrete examples:

- "Find me a laptop for AutoCAD under 300 EUR."
- "Compare these three products."
- "Is this charger compatible with my laptop?"
- "Track my order."
- "I need a warranty request."

Explain:

- Product answers use product feed data.
- Sensitive actions route through secure store workflows.
- The assistant logs blocked, failed, pending, and completed actions.

### Admin Dashboard Section

Screens to show:

- Knowledge editor.
- Conversation inbox.
- Lead inbox.
- Action ledger.
- Analytics.
- Widget branding setup.

Admin value:

- Business users can update answers without developers.
- Teams can review failed questions.
- Managers see which questions create leads or support load.

### Integrations Section

Initial integrations to list:

- Website widget.
- Email notifications.
- Webhooks.
- CSV/JSON product feed.
- Custom REST API.
- Jilanovi ecommerce platform.

"Coming next" integrations:

- Shopify.
- WooCommerce.
- OpenCart.
- HubSpot.
- Pipedrive.
- Zendesk/Freshdesk.
- Slack/Teams.

### Pricing Section

Recommended public layout:

- Starter.
- Growth.
- Commerce.
- Managed.

Do not overcomplicate pricing at first. Show "from" prices only if ready. Otherwise use:

- Starter: for business websites.
- Growth: for growing teams.
- Commerce: for online stores.
- Managed: for done-for-you setup.

Each plan should show:

- Included sites.
- Included conversations/messages.
- Knowledge entries.
- Users/seats.
- Lead capture.
- Integrations.
- Support level.

### Demo CTA Section

CTA copy:

> See how the assistant would work on your website

Fields:

- Name.
- Email.
- Company.
- Website URL.
- Ecommerce platform.
- Monthly site traffic or order volume.
- Main goal: leads, product discovery, support, ecommerce conversion.

### FAQ Section

Questions:

- Is this just ChatGPT embedded on my site?
- Can it use my products and policies?
- Can it add products to cart?
- Will it invent prices, delivery status, or order information?
- What happens when it cannot answer?
- Can my team edit answers?
- Does it support Bulgarian and English?
- Can it work with Shopify, WooCommerce, OpenCart, or custom sites?
- How is customer data handled?
- How long does setup take?
- Can you manage it for us?

### Landing Page Navigation

Recommended nav items:

- Product.
- Ecommerce.
- Safety.
- Integrations.
- Pricing.
- Demo.

### Landing Page Footer

Must include:

- Company name.
- Contact email.
- Phone if available.
- Privacy policy.
- Terms.
- Data processing / GDPR page.
- AI transparency note.
- Status page later.

### Landing Page Tracking

Track:

- Hero CTA click.
- Demo CTA click.
- Live demo open.
- Pricing plan click.
- Widget interaction.
- Form submit success/failure.
- Source campaign.

## Sales Assets Needed

Must-have before launch:

- Landing page.
- Live demo assistant.
- Short product video or animated walkthrough.
- Setup guide.
- Privacy/security one-pager.
- Pricing sheet.
- Demo script.
- Pilot agreement.
- Support email and onboarding checklist.

Nice-to-have:

- Case study from the current production assistant.
- Comparison page versus generic chatbot.
- Agency partner page.
- ROI calculator.

## Pilot Plan

Pilot customers:

- 3 to 5 businesses.
- At least 1 ecommerce store.
- At least 1 service business.
- At least 1 existing Jilanovi client.

Pilot duration:

- 30 days.

Pilot success metrics:

- 100+ real conversations per site or enough traffic-adjusted usage.
- At least 20 captured leads or measurable support deflection.
- Less than 5% negative feedback on assistant answers.
- No severe hallucination or unsafe operational action.
- Admin can update knowledge without developer help.
- Widget causes no visible layout or performance issue.

Pilot deliverables:

- Installed widget.
- Configured knowledge.
- Weekly conversation review.
- End-of-pilot report.
- Pricing proposal.

## Roadmap

### Phase 0: Repo And Product Foundation

- Clone/create the `chatbot` repo.
- Add repo structure.
- Add README.
- Add `Plan.md`.
- Add license decision.
- Add local dev scripts.
- Add CI for typecheck/lint/test.

### Phase 1: Lead Assistant MVP

- API app.
- Admin app.
- Widget package.
- Tenant/site model.
- Knowledge base.
- Conversation storage.
- Lead capture.
- Email/webhook notification.
- Rate limits.
- Basic analytics.
- AI provider abstraction.
- AI transparency disclosure.

### Phase 2: Public Beta

- Billing/trials.
- Usage metering.
- Install guide.
- Landing page.
- Demo site.
- Error monitoring.
- Knowledge import.
- Conversation review and feedback.
- Pilot onboarding workflow.

### Phase 3: Commerce Assistant

- Product source model.
- Product feed ingestion.
- Product search.
- Product cards.
- Comparison panel.
- Product click tracking.
- Ecommerce client action API.
- Support queue for returns/warranty/orders.
- Commerce action ledger.

### Phase 4: Integrations

- Shopify.
- WooCommerce.
- OpenCart.
- HubSpot/Pipedrive.
- Slack/Teams.
- Helpdesk integrations.
- Calendar booking.

### Phase 5: Optimization

- Weekly reports.
- Missing-answer suggestions.
- A/B tests.
- Conversion attribution.
- Advanced evals.
- Managed-service workflow.

## Current Implementation Snapshot

Implemented in the repo:

- Monorepo scaffold with API, admin, marketing site, embeddable widget, contracts, and AI provider package.
- Lead Assistant MVP with organizations, sites, site config, knowledge base, public chat, lead capture, support handoff, action audit, and basic analytics.
- Admin operations for scoped users and roles, lead status updates, support ticket status updates, CSV lead export, webhook URLs, billing summaries, plan/status updates, and audit review.
- Starter, Growth, Commerce, and Managed plan definitions with subscription status and plan-limit enforcement for sites, knowledge entries, monthly conversations, monthly messages, and monthly leads.
- Privacy operations for site data export, data-subject erasure, and manual retention cleanup using each site's configured retention window.
- Assistant eval release gate with deterministic cases for knowledge precedence, localized answers, pricing, handoff, lead capture, fallback, disabled knowledge, safe AI fallback, and unsafe operational-claim blocking.
- GitHub Actions CI that runs type-check, build, tests, and assistant evals on `main` pushes and pull requests.
- Local landing page with live widget demo and lead form.
- Deterministic local AI provider plus OpenAI/Gemini provider boundaries.
- Regression tests for chat guardrails, file persistence, lead operations, support operations, and lead webhook delivery.

Still required before a serious paid launch:

- Production database and migrations.
- Production password/session auth, invitation emails, MFA, and password reset flow.
- Payment-provider billing, hosted checkout, invoices, trial conversion, and subscription webhooks.
- Mail-provider notifications in addition to webhook hooks.
- CRM/helpdesk/calendar integrations.
- Real product proof: customer logos, testimonials, conversion metrics, demo video, and screenshots from pilot installs.
- Privacy policy, DPA, terms, data deletion/export controls, and production retention jobs.
- Privacy policy, DPA, terms, and scheduled production retention jobs.

## Open Decisions

- Brand name.
- Public pricing or demo-only pricing.
- First ecommerce platform integration.
- Whether to support customer-provided AI keys.
- EU-only hosting or global hosting with EU region option.
- Whether Commerce tier should support actual checkout creation or only safe checkout handoff at first.
- Whether to build admin from scratch or extract/adapt the existing admin UI patterns.

## Immediate Next Steps

1. Commit this planning document to `chatbot.git`.
2. Add a minimal README with product positioning and local setup placeholder.
3. Scaffold the monorepo.
4. Port the AI provider abstraction and assistant contracts.
5. Build the Lead Assistant MVP first.
6. Build the landing page alongside the admin/widget demo.
7. Use the existing Mitko guardrails as the Commerce Assistant release gate.

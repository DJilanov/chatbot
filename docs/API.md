# API Overview

The API has two route groups:

- Public widget routes under `/public/sites/:siteId`.
- Admin routes under `/admin`, protected by `Authorization: Bearer <ADMIN_TOKEN>`.

## Public Routes

### Get Widget Config

```http
GET /public/sites/:siteId/config
```

Returns branding, privacy, language, and welcome-message data required by the widget.

### Send Chat Message

```http
POST /public/sites/:siteId/chat
Content-Type: application/json
```

```json
{
  "conversationId": "conv_optional",
  "visitorId": "visitor_optional",
  "message": "What does this service cost?",
  "locale": "en",
  "pageUrl": "https://example.com/pricing",
  "referrer": "https://google.com",
  "consent": true
}
```

The API records the user message, resolves the answer from approved knowledge or the configured AI provider, records the assistant message, and writes an action log.

### Create Lead

```http
POST /public/sites/:siteId/leads
```

Requires either `email` or `phone`.

If the site has `config.integrations.leadWebhookUrl`, the API posts a `lead.created` webhook after the lead is persisted. If `EMAIL_PROVIDER=smtp` or `EMAIL_PROVIDER=resend` is configured and the site has `config.contact.email`, the API also sends a lead email notification. Delivery failures do not fail the visitor request; they are recorded in the action audit.

When `JILANOV_CONTACT_SYNC_URL` is configured, the API also posts email-bearing leads to the shared Jilanov contact-message endpoint so they appear in the main Jilanov admin panel messages list. The sync uses the existing Jilanov message shape (`name`, `email`, `phone`, `message`) and writes chatbot source details into the message body. Phone-only leads stay in the chatbot lead inbox and are audited as skipped because the shared Jilanov message endpoint requires an email.

### Send Feedback

```http
POST /public/sites/:siteId/feedback
```

Records positive/negative feedback in the action ledger.

### Record Client Action

```http
POST /public/sites/:siteId/actions
```

Used by the widget or future ecommerce integrations to log client-side actions such as clicks, handoffs, product opens, or checkout routing.

## Admin Routes

Admin routes accept either the bootstrap token from `ADMIN_TOKEN` or an organization user token:

```http
Authorization: Bearer <token>
```

The bootstrap token can create organizations and first users. User tokens are scoped to one organization and are returned only once when the user is created.

### Current Identity

```http
GET /admin/me
```

Returns the current admin identity. Bootstrap requests return `{ "kind": "bootstrap", "user": null }`; user-token requests return the scoped user view and update `lastSeenAt`.

Roles:

```text
owner: billing, users, configuration, knowledge, operations, analytics
admin: configuration, knowledge, operations, analytics
support: leads, support tickets, conversations, analytics
viewer: read-only organization data
```

### Organizations

```http
GET /admin/organizations
POST /admin/organizations
```

New organizations start on a trialing Starter subscription. Billing remains file-backed in the MVP; real payment-provider webhooks are still a production follow-up.

### Billing Plans

```http
GET /admin/billing-plans
```

Returns the configured Starter, Growth, Commerce, and Managed plan definitions with limits.

### Sites

```http
GET /admin/sites
POST /admin/sites
GET /admin/sites/:siteId
PATCH /admin/sites/:siteId/config
GET /admin/sites/:siteId/billing
PATCH /admin/sites/:siteId/billing
```

Billing is organization-level, but it can be managed through any site under that organization. Public chat and lead routes enforce subscription status and plan limits.

Billing patch example:

```json
{
  "planId": "growth",
  "status": "active",
  "trialEndsAt": null,
  "currentPeriodEnd": "2026-09-01T00:00:00.000Z"
}
```

Plan-limited resources:

```text
sites, knowledge entries, monthly conversations, monthly messages, monthly leads
```

### Users

```http
GET /admin/sites/:siteId/users
POST /admin/sites/:siteId/users
PATCH /admin/sites/:siteId/users/:userId
```

User management requires the `owner` role or bootstrap token. `POST` returns the new user and a one-time token:

```json
{
  "user": {
    "id": "user_xxx",
    "organizationId": "org_xxx",
    "email": "support@example.com",
    "name": "Support",
    "role": "support",
    "disabled": false,
    "lastSeenAt": null,
    "createdAt": "2026-08-05T00:00:00.000Z",
    "updatedAt": "2026-08-05T00:00:00.000Z"
  },
  "token": "user_token_xxx"
}
```

The API stores only the token hash. Save the token when it is created; it cannot be read back later.

### Privacy Operations

```http
GET /admin/sites/:siteId/privacy/export
POST /admin/sites/:siteId/privacy/erase
POST /admin/sites/:siteId/privacy/retention-run
```

Privacy routes require the `admin` role or bootstrap token.

`GET /privacy/export` returns a site-scoped JSON export with site config, conversations, messages, leads, support tickets, action logs, and usage events.

`POST /privacy/erase` anonymizes matching personal data and writes a non-PII audit entry. At least one identifier is required:

```json
{
  "email": "visitor@example.com",
  "phone": "+1 555 0100",
  "visitorId": "visitor_xxx",
  "conversationId": "conv_xxx",
  "reason": "Customer requested erasure"
}
```

The erase operation redacts personal fields in leads, support tickets, messages, conversations, and related action logs while preserving aggregate operational records.

`POST /privacy/retention-run` deletes records older than the selected site's `config.privacy.retentionDays` value and writes a retention cleanup audit event.

The site config supports:

```json
{
  "integrations": {
    "leadWebhookUrl": "https://hooks.example.com/leads",
    "supportWebhookUrl": "https://hooks.example.com/support"
  }
}
```

Webhook URLs must be HTTP or HTTPS. Set a field to `null` or an empty string to clear it.

### Knowledge

```http
GET /admin/sites/:siteId/knowledge
POST /admin/sites/:siteId/knowledge
PUT /admin/sites/:siteId/knowledge
PATCH /admin/sites/:siteId/knowledge/:entryId
DELETE /admin/sites/:siteId/knowledge/:entryId
```

Every knowledge change records a revision snapshot.

### Operations And Analytics

```http
GET /admin/sites/:siteId/conversations
GET /admin/sites/:siteId/messages?conversationId=conv_x
GET /admin/sites/:siteId/leads
GET /admin/sites/:siteId/leads/export
PATCH /admin/sites/:siteId/leads/:leadId
GET /admin/sites/:siteId/actions
GET /admin/sites/:siteId/support-tickets
PATCH /admin/sites/:siteId/support-tickets/:ticketId
GET /admin/sites/:siteId/analytics?days=30
```

Lead status values:

```text
new, contacted, qualified, won, lost, spam
```

Support ticket status values:

```text
new, waiting_customer, waiting_staff, resolved, blocked
```

CSV lead export requires the same admin authorization header as the JSON admin routes.

When a chat flow creates a support ticket and `config.integrations.supportWebhookUrl` is configured, the API posts a `support_ticket.created` webhook and writes the delivery result to the action audit. If `EMAIL_PROVIDER=resend` is configured and the site has `config.contact.email`, the API also sends a support-ticket email notification and audits the result.

## Email Provider

Email notifications are disabled unless `EMAIL_PROVIDER=resend`, `EMAIL_PROVIDER_API_KEY`, and `EMAIL_FROM` are set. The recipient comes from the site's contact email, not from an environment variable.

```bash
EMAIL_PROVIDER=resend
EMAIL_PROVIDER_API_KEY=re_xxx
EMAIL_FROM="Assistant <notify@example.com>"
ADMIN_BASE_URL=https://admin.example.com
```

Lead and support-ticket notifications go to `config.contact.email`. Admin user invitations go to the created user's email and include the one-time access token. `EMAIL_PROVIDER_BASE_URL` is only needed for tests or proxying a compatible provider API.

## Local Demo

```bash
npm install
npm run build
npm run seed:dev
npm run dev:api
```

Then open:

- Admin: `npm run dev:admin`
- Marketing: `npm run dev:marketing`

Use site id `site_demo` for widget tests.

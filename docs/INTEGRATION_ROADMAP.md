# Integration Roadmap

This roadmap expands the product after website pilots prove demand. Build integrations in this order unless a paying pilot gives a stronger reason.

## Principles

- Do not claim a cart, order, invoice, delivery, return, or warranty action succeeded until the external system confirms it.
- Prefer read-only integrations before write actions.
- Log every external action with provider, endpoint category, status, duration, and failure reason.
- Keep staff fallback when data is missing, stale, or unsafe.
- Store only the minimum data needed for the assistant workflow.

## Ecommerce Connectors

### Phase 1: Catalog Read

Target platforms:

- WooCommerce.
- OpenCart.
- Shopify.
- CloudCart.
- Jilanov ecommerce.

Capabilities:

- Product list import.
- SKU, title, brand, category, price, currency, availability, URL, image, description, attributes, and keywords.
- Scheduled refresh.
- Manual "review before publish" product QA.
- Feed health audit: imported, updated, skipped, disabled, last success, last failure.

Current bridge:

- Pasted CSV/JSON product feed.
- Public CSV/JSON feed URL with private-network blocking.

### Phase 2: Safe Commerce Read

Capabilities:

- Product availability lookup.
- Order-status lookup by customer-provided order number plus staff-safe verification.
- Return/warranty/invoice policy routing from approved knowledge.
- Staff handoff when identity or order state cannot be verified.

### Phase 3: Confirmed Actions

Capabilities only after platform-specific confirmation:

- Add-to-cart link or API action.
- Checkout session handoff.
- Back-in-stock request.
- Quote request.
- Warranty/return ticket creation.

## CRM And Sales Operations

Target systems:

- HubSpot.
- Pipedrive.
- Zoho.
- Generic webhook.
- Email notification.
- Calendar booking link or API.

Build sequence:

1. Duplicate lead detection. Implemented in API/admin/export through `duplicateOfLeadId` and `lead_duplicate_detected`.
2. Webhook retry and dead-letter visibility.
3. CRM contact/deal creation with idempotency key.
4. Booking link routing through site config. Implemented for post-lead widget CTA and click audit.
5. Native calendar API scheduling when a pilot needs real time-slot creation.
6. Lead summary in email and CRM note.
7. Two-way status sync only after pilot demand.

Required data mapping:

- Name.
- Email.
- Phone.
- Company.
- Website URL.
- Source page.
- Conversation ID.
- Original message.
- Goal.
- Timeline.
- Locale.
- Consent timestamp.
- Duplicate lead ID.

## Support And Helpdesk

Target systems:

- Email support inbox.
- Zendesk.
- Freshdesk.
- Gorgias.
- Custom webhook.

Capabilities:

- Create support ticket.
- Include transcript, source page, reason, locale, and customer contact.
- Assign status in admin.
- Keep unresolved and sensitive cases staff-owned.

## Channels

Add channels only after website assistant pilots produce proof.

Priority:

1. Viber for Bulgarian customers.
2. Messenger and Instagram.
3. WhatsApp.
4. Email assistant.
5. Slack/Teams internal notifications.

Channel requirements:

- Shared knowledge base.
- Source/channel-specific consent.
- Conversation transcript.
- Staff handoff.
- Rate limits and abuse controls.
- Per-channel action audit.

## Readiness Criteria Before Each Connector

- One pilot customer needs it enough to pay for it.
- Required credentials/scopes are documented.
- Failure states are clear to the visitor and admin.
- Tests cover success, auth failure, provider failure, timeout, and unsafe mutation claims.
- Admin can inspect delivery/action logs.
- Data retention and privacy obligations are documented.

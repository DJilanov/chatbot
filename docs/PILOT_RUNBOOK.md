# Pilot Runbook

Goal: run 3 Bulgarian pilots that produce real proof, pricing confidence, and integration priorities.

## Pilot Mix

1. Ecommerce store
   - Product feed, product cards, comparison, checkout handoff, return/warranty/order support routing.
2. Service business
   - FAQ answers, pricing/demo routing, contact capture, support handoff, email notifications.
3. B2B website
   - Quote/demo qualification, company capture, staff handoff, lead review, CRM-ready export.

## Entry Criteria

- Customer has a live website.
- Owner approves a pilot contact email.
- Customer can provide FAQ, pricing policy, delivery/returns/warranty/invoice text, or website pages to import.
- Customer accepts visible AI disclosure and privacy link.
- Customer agrees to review missed answers weekly.
- Ecommerce pilots provide product data through CSV, JSON, or public feed URL.

## Setup Checklist

- Create organization and site in admin.
- Configure default language, supported languages, widget brand, colors, privacy URL, retention days, contact email, optional booking URL, and domain allowlist.
- Import approved knowledge from website pages, pasted FAQ/policy text, CSV, PDF, or DOCX.
- Review imported drafts before publishing.
- Import product feed for commerce pilots.
- Send a test chat and verify the answer source.
- Submit a test lead and verify owner email delivery.
- If a booking URL is configured, verify the widget shows a booking CTA after contact capture and logs `booking_link_clicked`.
- Install the widget script on the customer website.
- Confirm mobile and desktop rendering.
- Capture launch screenshots.

## 30-Day Pilot Cadence

### Day 0

- Kickoff call.
- Agree target outcomes: leads, support deflection, product discovery, or demo requests.
- Collect source content and site access.

### Day 1

- Configure site, knowledge, product feed, email notifications, and widget.
- Run `npm run smoke:production-demo` against the deployed domain when validating the demo site.
- For customer sites, submit a real test lead and verify owner inbox delivery.

### Week 1

- Review all fallback, failed, blocked, and negative-feedback items.
- Add missing approved answers.
- Check duplicate leads and spam.
- Validate any product-feed changes.

### Week 2

- Tune prompts and knowledge.
- Review top questions and handoffs.
- Decide whether CRM/calendar integration is justified for that customer.

### Week 4

- Produce pilot report.
- Convert screenshots and metrics into a case study if the customer approves.
- Confirm paid package, pricing, and next integration.

## Metrics To Track

- Conversations.
- Messages.
- Leads.
- Duplicate leads.
- Support handoffs.
- Product clicks.
- Checkout handoffs.
- Product comparisons.
- Unanswered questions.
- Negative feedback.
- Email delivery status.
- Estimated saved support time.

## Pilot Report Template

- Customer:
- Website:
- Pilot dates:
- Package:
- Main goal:
- Setup work completed:
- Total conversations:
- Leads captured:
- Support handoffs:
- Product clicks:
- Missing answers found:
- Knowledge entries added:
- Email delivery result:
- Business impact:
- Customer quote:
- Recommended next step:

## Exit Criteria

Move the customer to paid monthly service when:

- The widget is installed on production.
- The owner receives lead/support emails.
- The assistant answers the top recurring questions correctly.
- Missed-answer review is manageable.
- The customer sees enough value to approve a monthly package.

Pause or redesign when:

- The customer cannot provide approved content.
- Product data is too unreliable to import.
- The customer needs order/payment mutation before trust boundaries are ready.
- There is no owner or staff member reviewing leads.

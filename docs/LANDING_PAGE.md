# Landing Page Plan

## Goal

Make the page sell the product as a business outcome system, not a generic AI chat widget.

Primary conversion:

- Book a demo.

Secondary conversion:

- Try the live assistant on the landing page.

## Core Pitch

Generic chatbots answer questions. Assistant SaaS helps businesses sell, support, and audit what happened.

Use this message consistently:

> Embed an AI assistant that answers from approved knowledge, captures leads, recommends products, routes support, and keeps an action audit trail.

## Implemented Sections

- Hero with product positioning, real product-interface visual, and two CTAs.
- Proof strip for production origin, guarded flows, multilingual/EU readiness.
- Live demo section with prompt buttons wired to the embeddable widget.
- Product section covering knowledge, lead capture, support queue, and action audit.
- Workflow section from setup to review.
- Proof/surfaces section for widget, admin, and action audit.
- Use-case section for Lead, Commerce, and Managed plans.
- Ecommerce section focused on product-aware safe actions.
- Safety section for AI disclosure, approved knowledge, handoff, and operational guardrails.
- Differentiation table against generic chatbot plugins.
- Integrations section.
- Pricing/package teaser.
- Demo form that posts to the demo API lead endpoint.
- FAQ for buyer objections.

## Still Needed For A Perfect Sales Page

- Real product screenshots from the production webinterface chatbot.
- Anonymized real conversations showing good outcomes.
- At least one customer quote.
- Actual pilot metrics once available:
  - conversations handled,
  - leads captured,
  - handoffs created,
  - repeated support questions reduced,
  - product clicks or assisted checkout starts.
- A short video or animated walkthrough.
- Final brand name, logo, pricing, privacy policy, and terms.
- Production CRM/email integration for demo requests.
- SEO landing metadata for final domain.
- Structured data for SoftwareApplication and Organization.

## Demo Requirements

For local demo:

```bash
npm run build
npm run seed:dev
npm run dev:api
npm run dev:marketing
```

Open `http://localhost:4173`.

The page loads `/vendor/widget.js` with:

- `data-site-id="site_demo"`
- `data-api-url="http://localhost:8787"`

The prompt buttons use `window.Chatbot.open()` and `window.Chatbot.send(...)`.

The demo form posts to:

```http
POST http://localhost:8787/public/sites/site_demo/leads
```


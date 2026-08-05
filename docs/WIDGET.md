# Widget Install

Build the widget:

```bash
npm --workspace @chatbot/widget run build
```

Host `packages/widget/dist/widget.js` and install it on a customer website:

```html
<script
  src="https://cdn.example.com/widget.js"
  data-site-id="site_xxx"
  data-api-url="https://api.example.com"
  async
></script>
```

## Public API

The widget exposes:

```js
window.Chatbot.open();
window.Chatbot.close();
window.Chatbot.send("I need help choosing the right product");
window.Chatbot.on("lead_created", (payload) => console.log(payload));
```

Events currently emitted:

- `ready`
- `open`
- `close`
- `send`
- `response`
- `lead_created`
- `feedback`
- `error`

## Domain Allowlist

Set `allowedDomains` on the site config. If the list is empty, the API accepts public requests from any domain, which is useful for local development. In production, configure exact customer domains.

## AI Transparency

The widget includes a visible AI disclosure:

> AI assistant. Do not share sensitive payment or password data.

Keep this visible for EU deployments.


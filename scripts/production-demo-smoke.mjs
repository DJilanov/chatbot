const baseUrl = normalizeBaseUrl(process.env.CHATBOT_BASE_URL || 'https://chatbot.jilanov.com');
const siteId = process.env.CHATBOT_SITE_ID || 'site_demo';
const adminToken = process.env.ADMIN_TOKEN || '';
const requireEmailDelivery = process.env.REQUIRE_EMAIL_DELIVERY !== 'false';
const timestamp = Date.now();
const smokeEmail = process.env.SMOKE_EMAIL || `assistant-smoke+${timestamp}@example.com`;

if (!adminToken) {
  throw new Error('ADMIN_TOKEN is required');
}

await assertHealth();
await assertDemoPromptAnswers();
const leadId = await submitDemoLead();
await assertLeadStored(leadId);
await assertEmailDelivery(leadId);
await markLeadAsSpam(leadId);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

async function assertHealth() {
  const health = await fetchJson('/health');
  if (health.ok !== true) {
    throw new Error(`Health check failed: ${JSON.stringify(health)}`);
  }
  process.stdout.write('health=ok\n');
}

async function assertDemoPromptAnswers() {
  const cases = [
    {
      message: 'Какво прави асистентът?',
      locale: 'bg',
      intent: 'knowledge_answer',
      action: 'knowledge_services',
      includes: ['одобрена', 'журнал'],
    },
    {
      message: 'Can it work with ecommerce?',
      locale: 'en',
      intent: 'knowledge_answer',
      action: 'knowledge_services',
      includes: ['product feed', 'backend'],
    },
    {
      message: 'може ли 30% отстъпка',
      locale: 'bg',
      intent: 'pricing',
      action: 'discount_guard',
      includes: ['не мога да обещая'],
    },
    {
      message: 'откажи поръчка #f1893a93',
      locale: 'bg',
      intent: 'human_handoff',
      action: 'operational_support_guard',
      includes: ['свързан backend'],
    },
    {
      message: 'препоръчай ми лаптоп с който да цъкам фифа',
      locale: 'bg',
      intent: 'product_recommendation',
      action: 'product_recommendation',
      includes: ['Намерих'],
      productCardsMin: 1,
      productCardsRequireDirectUrls: true,
    },
    {
      message: 'Имаш ли батерия L21C6P70?',
      locale: 'bg',
      intent: 'product_recommendation',
      action: 'exact_product_match',
      includes: ['точен продукт'],
      productCardsMin: 1,
      firstProductSku: 'L21C6P70',
      productCardsRequireDirectUrls: true,
    },
    {
      message: 'търся несъществуващ продукт PN-NOPE-9999',
      locale: 'bg',
      intent: 'product_recommendation',
      action: 'exact_product_miss',
      includes: ['Няма да показвам несвързани продукти'],
      productCardsMax: 0,
    },
    {
      message: 'трябва ми батерия за лаптоп',
      locale: 'bg',
      intent: 'product_recommendation',
      action: 'compatibility_question',
      includes: ['точния модел'],
      productCardsMax: 0,
    },
    {
      message: 'изпразни кошницата ми',
      locale: 'bg',
      intent: 'commerce_handoff',
      action: 'cart_clear_request',
      includes: ['реално потвърждение'],
      forbidden: ['изпразних', 'изчистих', 'готово'],
    },
    {
      message: 'I want to speak with support',
      locale: 'en',
      intent: 'human_handoff',
      action: 'human_handoff_request',
      includes: ['route this to the team'],
    },
  ];

  for (const item of cases) {
    const response = await fetchJson(`/public/sites/${encodeURIComponent(siteId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        visitorId: `assistant-smoke-${timestamp}-${item.locale}-${item.action}`,
        message: item.message,
        pageUrl: `${baseUrl}/#demo-live`,
        locale: item.locale,
        consent: true,
      }),
    });
    if (response.intent !== item.intent || response.actionId === null) {
      throw new Error(`Unexpected chat response for ${item.message}: ${JSON.stringify(response)}`);
    }
    const actions = await fetchJson(`/admin/sites/${encodeURIComponent(siteId)}/actions`, {
      headers: authHeaders(),
    });
    const action = Array.isArray(actions)
      ? actions
          .slice()
          .reverse()
          .find((candidate) => candidate.id === response.actionId)
      : null;
    if (!action || action.action !== item.action) {
      throw new Error(`Unexpected action log for ${item.message}: ${JSON.stringify({ response, action })}`);
    }
    const reply = String(response.reply || '').toLowerCase();
    if (/нямам потвърден отговор|do not have a confirmed answer|assistant_feedback_|variant_choose_variant/.test(reply)) {
      throw new Error(`Demo prompt fell back or leaked UI keys for ${item.message}: ${response.reply}`);
    }
    for (const forbidden of item.forbidden ?? []) {
      if (reply.includes(forbidden.toLowerCase())) {
        throw new Error(`Demo prompt ${item.message} included forbidden text ${forbidden}: ${response.reply}`);
      }
    }
    for (const expected of item.includes) {
      if (!reply.includes(expected.toLowerCase())) {
        throw new Error(`Demo prompt ${item.message} missing ${expected}: ${response.reply}`);
      }
    }
    const productCards = Array.isArray(response.productCards) ? response.productCards : [];
    if (typeof item.productCardsMin === 'number' && productCards.length < item.productCardsMin) {
      throw new Error(`Demo prompt ${item.message} expected at least ${item.productCardsMin} product cards: ${JSON.stringify(response)}`);
    }
    if (typeof item.productCardsMax === 'number' && productCards.length > item.productCardsMax) {
      throw new Error(`Demo prompt ${item.message} expected at most ${item.productCardsMax} product cards: ${JSON.stringify(response)}`);
    }
    if (item.firstProductSku && productCards[0]?.sku !== item.firstProductSku) {
      throw new Error(`Demo prompt ${item.message} expected first product SKU ${item.firstProductSku}: ${JSON.stringify(response)}`);
    }
    if (item.productCardsRequireDirectUrls === true) {
      await assertProductCardLinks(item.message, productCards);
    }
  }
  process.stdout.write(`demo_prompts=ok,count=${cases.length}\n`);
}

async function assertProductCardLinks(message, productCards) {
  for (const card of productCards) {
    const productUrl = String(card.productUrl || '');
    if (!productUrl) {
      throw new Error(`Demo prompt ${message} returned a product card without productUrl: ${JSON.stringify(card)}`);
    }
    if (/\/search\?/i.test(productUrl)) {
      throw new Error(`Demo prompt ${message} returned a search URL instead of a product URL: ${productUrl}`);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(productUrl);
    } catch {
      throw new Error(`Demo prompt ${message} returned an invalid product URL: ${productUrl}`);
    }
    if (parsedUrl.hostname !== 'jilanov.com') {
      throw new Error(`Demo prompt ${message} returned a non-Jilanov product URL: ${productUrl}`);
    }
    const response = await fetch(productUrl, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Demo prompt ${message} returned a product URL with HTTP ${response.status}: ${productUrl}`);
    }
  }
}

async function submitDemoLead() {
  const response = await fetchJson(`/public/sites/${encodeURIComponent(siteId)}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name: 'Production Smoke Test',
      email: smokeEmail,
      company: 'Jilanov Smoke',
      message: [
        'Demo request from landing page',
        '',
        '--- Qualification ---',
        'Intent: Book a demo',
        'Company: Jilanov Smoke',
        `Website: ${baseUrl}/#demo`,
        'Ecommerce platform: smoke test',
        'Main goal: Validate production email delivery',
        'Timeline: This week',
        'Language: en',
      ].join('\n'),
      pageUrl: `${baseUrl}/#demo`,
      locale: 'en',
      consent: true,
    }),
  });

  if (!response.leadId || response.status !== 'new') {
    throw new Error(`Unexpected lead response: ${JSON.stringify(response)}`);
  }
  process.stdout.write(`demo_lead=ok,id=${response.leadId}\n`);
  return response.leadId;
}

async function assertLeadStored(leadId) {
  const leads = await fetchJson(`/admin/sites/${encodeURIComponent(siteId)}/leads`, {
    headers: authHeaders(),
  });
  const lead = Array.isArray(leads) ? leads.find((item) => item.id === leadId) : null;
  if (!lead) {
    throw new Error(`Lead ${leadId} was not visible in admin API`);
  }
  process.stdout.write('admin_lead=ok\n');
}

async function assertEmailDelivery(leadId) {
  const actions = await fetchJson(`/admin/sites/${encodeURIComponent(siteId)}/actions`, {
    headers: authHeaders(),
  });
  const delivery = Array.isArray(actions)
    ? actions
        .slice()
        .reverse()
        .find((item) => item.action === 'lead_email_delivery' && item.metadata?.leadId === leadId)
    : null;

  if (!delivery) {
    if (!requireEmailDelivery) {
      process.stdout.write('email_delivery=not_configured\n');
      return;
    }
    throw new Error(`No lead_email_delivery audit entry found for ${leadId}`);
  }

  if (delivery.status !== 'completed') {
    throw new Error(`Email delivery failed for ${leadId}: ${delivery.reason || 'unknown error'}`);
  }

  const provider = typeof delivery.metadata?.provider === 'string' ? delivery.metadata.provider : 'unknown';
  const recipientDomain =
    typeof delivery.metadata?.recipientDomain === 'string' ? delivery.metadata.recipientDomain : 'unknown';
  process.stdout.write(`email_delivery=ok,provider=${provider},recipientDomain=${recipientDomain}\n`);
}

async function markLeadAsSpam(leadId) {
  const response = await fetchJson(`/admin/sites/${encodeURIComponent(siteId)}/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'spam' }),
  });
  if (response.status !== 'spam') {
    throw new Error(`Could not mark smoke lead as spam: ${JSON.stringify(response)}`);
  }
  process.stdout.write('cleanup=spam\n');
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

function authHeaders() {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

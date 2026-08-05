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

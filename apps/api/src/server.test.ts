import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAiProvider } from '@chatbot/ai';
import type {
  ActionLog,
  Lead,
  MissingAnswerItem,
  Organization,
  OrganizationUserCreateResponse,
  PrivacyEraseResponse,
  RetentionRunResponse,
  Site,
  SiteDataExport,
  SupportTicket,
} from '@chatbot/contracts';
import { defaultOrganizationBilling } from './billing.js';
import { defaultSiteConfig } from './defaults.js';
import { createApiServer } from './server.js';
import { FileStore } from './store.js';
import type { ApiConfig } from './config.js';
import { NullEmailProvider, ResendEmailProvider, type EmailProvider } from './email.js';

interface TestApi {
  url: string;
  store: FileStore;
  close: () => Promise<void>;
}

interface LeadResponse {
  leadId: string;
  status: string;
}

async function createTestApi(configure?: {
  site?: (site: Site) => void;
  organization?: (org: Organization) => void;
  emailProvider?: EmailProvider;
  adminBaseUrl?: string;
}): Promise<TestApi> {
  const dir = await mkdtemp(join(tmpdir(), 'chatbot-api-'));
  const store = new FileStore(join(dir, 'data.json'));
  const organization: Organization = {
    id: 'org_test',
    name: 'Test Org',
    billing: {
      ...defaultOrganizationBilling(new Date('2026-08-05T00:00:00.000Z')),
      status: 'active',
      trialEndsAt: null,
    },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
  const site: Site = {
    id: 'site_test',
    organizationId: 'org_test',
    name: 'Test Site',
    publicToken: 'token_test',
    enabled: true,
    config: defaultSiteConfig({ name: 'Test Site' }),
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
  configure?.organization?.(organization);
  configure?.site?.(site);
  await store.update((data) => {
    data.organizations.push(organization);
    data.sites.push(site);
  });

  const config: ApiConfig = {
    port: 0,
    dataFile: join(dir, 'data.json'),
    adminToken: 'test-token',
    publicBaseUrl: 'http://127.0.0.1',
    adminBaseUrl: configure?.adminBaseUrl ?? 'http://admin.test',
    integrationTimeoutMs: 1000,
    aiProvider: createAiProvider({ provider: 'null' }),
    emailProvider: configure?.emailProvider ?? new NullEmailProvider(),
  };
  const server = createApiServer(config, store);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    store,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('public site config localizes browser-facing copy', async () => {
  const api = await createTestApi();
  try {
    const bgResponse = await fetch(`${api.url}/public/sites/site_test/config?locale=bg`);
    assert.equal(bgResponse.status, 200);
    const bgConfig = await json<Record<string, unknown>>(bgResponse);
    const bgBranding = bgConfig['branding'] as Record<string, unknown>;
    assert.equal(bgBranding['assistantName'], 'Асистент');
    assert.match(String(bgConfig['welcomeMessage']), /Здравейте/);

    const enResponse = await fetch(`${api.url}/public/sites/site_test/config?locale=en`);
    assert.equal(enResponse.status, 200);
    const enConfig = await json<Record<string, unknown>>(enResponse);
    const enBranding = enConfig['branding'] as Record<string, unknown>;
    assert.equal(enBranding['assistantName'], 'Assistant');
    assert.match(String(enConfig['welcomeMessage']), /Hi, I am an AI assistant/);
  } finally {
    await api.close();
  }
});

test('admin can update lead status and export leads as CSV', async () => {
  const api = await createTestApi();
  try {
    const createResponse = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'lead@example.com',
        message: 'I want a demo',
        consent: true,
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await json<LeadResponse>(createResponse);
    assert.equal(created.status, 'new');

    const updateResponse = await fetch(`${api.url}/admin/sites/site_test/leads/${created.leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'qualified' }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await json<Lead>(updateResponse);
    assert.equal(updated.status, 'qualified');

    const exportResponse = await fetch(`${api.url}/admin/sites/site_test/leads/export`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csv = await exportResponse.text();
    assert.match(csv, /lead@example\.com/);
    assert.match(csv, /qualified/);
  } finally {
    await api.close();
  }
});

test('admin can update support ticket status', async () => {
  const api = await createTestApi();
  try {
    const ticket: SupportTicket = {
      id: 'ticket_test',
      siteId: 'site_test',
      conversationId: null,
      status: 'new',
      reason: 'Needs staff follow-up',
      customerEmail: 'customer@example.com',
      customerPhone: null,
      sourceText: 'Please connect me to a person',
      transcript: 'Visitor: Please connect me to a person',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    await api.store.update((data) => {
      data.supportTickets.push(ticket);
    });

    const updateResponse = await fetch(`${api.url}/admin/sites/site_test/support-tickets/ticket_test`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'waiting_staff' }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await json<SupportTicket>(updateResponse);
    assert.equal(updated.status, 'waiting_staff');
  } finally {
    await api.close();
  }
});

test('admin can review missing answers from fallback chats', async () => {
  const api = await createTestApi();
  try {
    const chatResponse = await fetch(`${api.url}/public/sites/site_test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Как поддържате фотонен принтер без договор?',
        locale: 'bg',
        pageUrl: 'https://example.com/services',
        referrer: 'https://google.example/search',
      }),
    });
    assert.equal(chatResponse.status, 200);
    const chat = await json<Record<string, unknown>>(chatResponse);
    assert.equal(chat['intent'], 'fallback');
    assert.equal(typeof chat['actionId'], 'string');

    const queueResponse = await fetch(`${api.url}/admin/sites/site_test/missing-answers`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(queueResponse.status, 200);
    const queue = await json<MissingAnswerItem[]>(queueResponse);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.id, chat['actionId']);
    assert.equal(queue[0]?.trigger, 'fallback');
    assert.equal(queue[0]?.locale, 'bg');
    assert.equal(queue[0]?.question, 'Как поддържате фотонен принтер без договор?');
    assert.equal(queue[0]?.pageUrl, 'https://example.com/services');

    const reviewResponse = await fetch(`${api.url}/admin/sites/site_test/actions/${String(chat['actionId'])}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolutionNote: 'Added to onboarding review list' }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewed = await json<ActionLog>(reviewResponse);
    assert.equal(reviewed.reviewedBy, 'bootstrap');
    assert.equal(reviewed.resolutionNote, 'Added to onboarding review list');
    assert.equal(typeof reviewed.reviewedAt, 'string');

    const reviewedQueueResponse = await fetch(`${api.url}/admin/sites/site_test/missing-answers`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(reviewedQueueResponse.status, 200);
    const reviewedQueue = await json<MissingAnswerItem[]>(reviewedQueueResponse);
    assert.equal(reviewedQueue.length, 0);
  } finally {
    await api.close();
  }
});

test('lead webhooks are delivered and audited', async () => {
  const receiver = await createWebhookReceiver();
  const api = await createTestApi({
    site: (site) => {
      site.config.integrations.leadWebhookUrl = receiver.url;
    },
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'webhook@example.com',
        message: 'Send this to the webhook',
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(receiver.requests.length, 1);
    assert.equal(receiver.requests[0]?.event, 'lead.created');

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'lead_webhook_delivery');
    assert.equal(delivery?.status, 'completed');
    assert.equal(delivery?.metadata['responseStatus'], 204);
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('lead email notifications are delivered and audited', async () => {
  const receiver = await createEmailReceiver('email_lead_test');
  const api = await createTestApi({
    emailProvider: new ResendEmailProvider('re_test', 'Assistant <notify@example.com>', receiver.url),
    site: (site) => {
      site.config.contact.email = 'owner@example.com';
    },
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Email Lead',
        company: 'Example Co',
        email: 'email-lead@example.com',
        message: 'Send this to the email provider',
        consent: true,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(receiver.requests.length, 1);
    const request = receiver.requests[0];
    assert.equal(request?.path, '/emails');
    assert.equal(request?.authorization, 'Bearer re_test');
    assert.equal(request?.payload['from'], 'Assistant <notify@example.com>');
    assert.deepEqual(request?.payload['to'], ['owner@example.com']);
    assert.match(String(request?.payload['subject']), /New chatbot lead/);
    assert.match(String(request?.payload['text']), /email-lead@example\.com/);
    assert.match(String(request?.payload['html']), /Website enquiry/);

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'lead_email_delivery');
    assert.equal(delivery?.status, 'completed');
    assert.equal(delivery?.metadata['provider'], 'resend');
    assert.equal(delivery?.metadata['recipientDomain'], 'example.com');
    assert.equal(delivery?.metadata['responseStatus'], 200);
    assert.equal(delivery?.metadata['messageId'], 'email_lead_test');
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('demo lead email notifications use demo request context', async () => {
  const receiver = await createEmailReceiver('email_demo_test');
  const api = await createTestApi({
    emailProvider: new ResendEmailProvider('re_test', 'Assistant <notify@example.com>', receiver.url),
    site: (site) => {
      site.config.contact.email = 'owner@example.com';
    },
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo Visitor',
        company: 'Demo Company',
        email: 'demo-visitor@example.com',
        phone: '+359888000000',
        pageUrl: 'https://chatbot.jilanov.com/#demo',
        locale: 'bg',
        message: [
          'Demo request from landing page',
          '',
          '--- Qualification ---',
          'Intent: Book a demo',
          'Company: Demo Company',
          'Website: https://example.com',
          'Ecommerce platform: WooCommerce',
          'Main goal: Capture more leads',
          'Timeline: This week',
          'Language: bg',
        ].join('\n'),
        consent: true,
      }),
    });
    assert.equal(response.status, 201);
    const created = await json<LeadResponse>(response);
    assert.equal(receiver.requests.length, 1);
    const payload = receiver.requests[0]?.payload;
    assert.match(String(payload?.['subject']), /New demo request/);
    assert.match(String(payload?.['text']), /Timeline: This week/);
    assert.match(String(payload?.['html']), /Reply to Demo Visitor/);
    assert.match(String(payload?.['html']), /https:\/\/chatbot\.jilanov\.com\/#demo/);

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'lead_email_delivery');
    assert.equal(delivery?.metadata['leadType'], 'demo_request');
    assert.equal(delivery?.metadata['leadId'], created.leadId);
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('support email notifications are delivered and audited', async () => {
  const receiver = await createEmailReceiver('email_support_test');
  const api = await createTestApi({
    emailProvider: new ResendEmailProvider('re_test', 'Assistant <notify@example.com>', receiver.url),
    site: (site) => {
      site.config.contact.email = 'owner@example.com';
    },
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'I want to speak with a person from support',
        locale: 'en',
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(receiver.requests.length, 1);
    assert.match(String(receiver.requests[0]?.payload['subject']), /Human handoff requested/);
    assert.match(String(receiver.requests[0]?.payload['text']), /I want to speak with a person from support/);

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'support_ticket_email_delivery');
    assert.equal(delivery?.status, 'completed');
    assert.equal(delivery?.metadata['messageId'], 'email_support_test');
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('admin can view and update site billing summary', async () => {
  const api = await createTestApi();
  try {
    const summaryResponse = await fetch(`${api.url}/admin/sites/site_test/billing`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(summaryResponse.status, 200);
    const summary = await json<Record<string, unknown>>(summaryResponse);
    assert.equal(summary['organizationId'], 'org_test');

    const updateResponse = await fetch(`${api.url}/admin/sites/site_test/billing`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planId: 'growth', status: 'active', trialEndsAt: null }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await json<Record<string, unknown>>(updateResponse);
    const billing = updated['billing'] as Record<string, unknown>;
    assert.equal(billing['planId'], 'growth');
    assert.equal(billing['status'], 'active');
  } finally {
    await api.close();
  }
});

test('public lead creation is blocked when monthly lead limit is reached', async () => {
  const api = await createTestApi();
  try {
    await api.store.update((data) => {
      for (let index = 0; index < 100; index += 1) {
        data.usageEvents.push({
          id: `use_${index}`,
          siteId: 'site_test',
          type: 'lead',
          quantity: 1,
          createdAt: '2026-08-05T00:00:00.000Z',
        });
      }
    });

    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'blocked@example.com',
        message: 'This should be blocked',
      }),
    });
    assert.equal(response.status, 402);
    const body = await json<Record<string, unknown>>(response);
    assert.equal(body['code'], 'billing_limit_reached');
  } finally {
    await api.close();
  }
});

test('support users can work leads but cannot update billing', async () => {
  const api = await createTestApi();
  try {
    const supportUser = await createOrganizationUser(api.url, 'support@example.com', 'support');
    assert.equal('tokenHash' in supportUser.user, false);

    const sitesResponse = await fetch(`${api.url}/admin/sites`, {
      headers: { Authorization: `Bearer ${supportUser.token}` },
    });
    assert.equal(sitesResponse.status, 200);
    const sites = await json<Site[]>(sitesResponse);
    assert.equal(sites.length, 1);

    const leadResponse = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'support-lead@example.com',
        message: 'Support should update this',
      }),
    });
    const lead = await json<LeadResponse>(leadResponse);

    const statusResponse = await fetch(`${api.url}/admin/sites/site_test/leads/${lead.leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supportUser.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'contacted' }),
    });
    assert.equal(statusResponse.status, 200);

    const billingResponse = await fetch(`${api.url}/admin/sites/site_test/billing`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supportUser.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'paused' }),
    });
    assert.equal(billingResponse.status, 403);
  } finally {
    await api.close();
  }
});

test('admin identity endpoint returns bootstrap and user identity', async () => {
  const api = await createTestApi();
  try {
    const bootstrapResponse = await fetch(`${api.url}/admin/me`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await json<Record<string, unknown>>(bootstrapResponse);
    assert.equal(bootstrap['kind'], 'bootstrap');
    assert.equal(bootstrap['user'], null);

    const ownerUser = await createOrganizationUser(api.url, 'owner@example.com', 'owner');
    const userResponse = await fetch(`${api.url}/admin/me`, {
      headers: { Authorization: `Bearer ${ownerUser.token}` },
    });
    assert.equal(userResponse.status, 200);
    const identity = await json<Record<string, unknown>>(userResponse);
    assert.equal(identity['kind'], 'user');
    const user = identity['user'] as Record<string, unknown>;
    assert.equal(user['email'], 'owner@example.com');
    assert.equal(user['role'], 'owner');
    assert.equal('tokenHash' in user, false);
    assert.equal(typeof user['lastSeenAt'], 'string');
  } finally {
    await api.close();
  }
});

test('created users receive invitation emails when email provider is configured', async () => {
  const receiver = await createEmailReceiver('email_invite_test');
  const api = await createTestApi({
    adminBaseUrl: 'http://admin.example.test',
    emailProvider: new ResendEmailProvider('re_test', 'Assistant <notify@example.com>', receiver.url),
  });
  try {
    const response = await fetch(`${api.url}/admin/sites/site_test/users`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invite User',
        email: 'invite@example.com',
        role: 'support',
      }),
    });
    assert.equal(response.status, 201);
    const created = await json<OrganizationUserCreateResponse>(response);
    assert.equal(receiver.requests.length, 1);
    const payload = receiver.requests[0]?.payload;
    assert.deepEqual(payload?.['to'], ['invite@example.com']);
    assert.match(String(payload?.['subject']), /admin invitation/);
    assert.match(String(payload?.['text']), /http:\/\/admin\.example\.test/);
    assert.match(String(payload?.['text']), new RegExp(created.token));

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'user_invite_email_delivery');
    assert.equal(delivery?.status, 'completed');
    assert.equal(delivery?.metadata['messageId'], 'email_invite_test');
    assert.equal(delivery?.metadata['userId'], created.user.id);
    assert.equal(delivery?.metadata['role'], 'support');
    assert.equal(JSON.stringify(delivery?.metadata).includes(created.token), false);
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('viewer users cannot mutate operational records', async () => {
  const api = await createTestApi();
  try {
    const viewerUser = await createOrganizationUser(api.url, 'viewer@example.com', 'viewer');
    const leadResponse = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'viewer-lead@example.com',
        message: 'Viewer should not update this',
      }),
    });
    const lead = await json<LeadResponse>(leadResponse);

    const readResponse = await fetch(`${api.url}/admin/sites/site_test/leads`, {
      headers: { Authorization: `Bearer ${viewerUser.token}` },
    });
    assert.equal(readResponse.status, 200);

    const patchResponse = await fetch(`${api.url}/admin/sites/site_test/leads/${lead.leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${viewerUser.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'contacted' }),
    });
    assert.equal(patchResponse.status, 403);
  } finally {
    await api.close();
  }
});

test('admin can export and erase privacy subject data', async () => {
  const api = await createTestApi();
  try {
    await api.store.update((data) => {
      data.conversations.push({
        id: 'conv_privacy',
        siteId: 'site_test',
        visitorId: 'visitor_privacy',
        locale: 'en',
        pageUrl: 'https://example.com/private',
        referrer: 'https://referrer.example',
        status: 'lead',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
      data.messages.push(
        {
          id: 'msg_privacy_user',
          conversationId: 'conv_privacy',
          role: 'user',
          text: 'My email is privacy@example.com',
          createdAt: '2026-08-05T00:00:00.000Z',
        },
        {
          id: 'msg_privacy_assistant',
          conversationId: 'conv_privacy',
          role: 'assistant',
          text: 'Thanks privacy@example.com',
          createdAt: '2026-08-05T00:00:01.000Z',
        },
      );
      data.leads.push({
        id: 'lead_privacy',
        siteId: 'site_test',
        conversationId: 'conv_privacy',
        status: 'new',
        name: 'Privacy Person',
        email: 'privacy@example.com',
        phone: '+1 555 0100',
        company: 'Private Co',
        message: 'Please contact privacy@example.com',
        pageUrl: 'https://example.com/private',
        locale: 'en',
        consentAt: '2026-08-05T00:00:00.000Z',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
      data.supportTickets.push({
        id: 'ticket_privacy',
        siteId: 'site_test',
        conversationId: 'conv_privacy',
        status: 'new',
        reason: 'privacy@example.com needs staff',
        customerEmail: 'privacy@example.com',
        customerPhone: '+1 555 0100',
        sourceText: 'Need help from privacy@example.com',
        transcript: 'Visitor: privacy@example.com',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
      data.actionLogs.push({
        id: 'act_privacy',
        siteId: 'site_test',
        conversationId: 'conv_privacy',
        action: 'lead_created',
        status: 'completed',
        confidence: 'system',
        locale: 'en',
        sourceText: 'privacy@example.com created a lead',
        reply: 'Reply to privacy@example.com',
        reason: 'Contains private data',
        metadata: {},
        reviewedAt: null,
        reviewedBy: null,
        resolutionNote: null,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
    });

    const exportResponse = await fetch(`${api.url}/admin/sites/site_test/privacy/export`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(exportResponse.status, 200);
    const exported = await json<SiteDataExport>(exportResponse);
    assert.equal(exported.leads[0]?.email, 'privacy@example.com');

    const eraseResponse = await fetch(`${api.url}/admin/sites/site_test/privacy/erase`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'privacy@example.com',
        reason: 'Customer requested erasure',
      }),
    });
    assert.equal(eraseResponse.status, 200);
    const erased = await json<PrivacyEraseResponse>(eraseResponse);
    assert.equal(erased.leadsAnonymized, 1);
    assert.equal(erased.messagesAnonymized, 2);
    assert.deepEqual(erased.matchedConversationIds, ['conv_privacy']);

    const data = await api.store.read();
    assert.equal(data.leads.find((lead) => lead.id === 'lead_privacy')?.email, null);
    assert.equal(data.messages.find((message) => message.id === 'msg_privacy_user')?.text, '[erased]');
    assert.equal(data.supportTickets.find((ticket) => ticket.id === 'ticket_privacy')?.customerEmail, null);
    assert.equal(data.actionLogs.find((action) => action.id === 'act_privacy')?.sourceText, null);
    assert.ok(data.actionLogs.some((action) => action.action === 'privacy_erasure'));
  } finally {
    await api.close();
  }
});

test('admin can run site retention cleanup', async () => {
  const api = await createTestApi({
    site: (site) => {
      site.config.privacy.retentionDays = 30;
    },
  });
  try {
    await api.store.update((data) => {
      data.conversations.push({
        id: 'conv_old',
        siteId: 'site_test',
        visitorId: 'visitor_old',
        locale: 'en',
        pageUrl: 'https://example.com/old',
        referrer: null,
        status: 'closed',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      data.messages.push({
        id: 'msg_old',
        conversationId: 'conv_old',
        role: 'user',
        text: 'old',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      data.leads.push({
        id: 'lead_old',
        siteId: 'site_test',
        conversationId: 'conv_old',
        status: 'new',
        name: 'Old Lead',
        email: 'old@example.com',
        phone: null,
        company: null,
        message: 'old',
        pageUrl: null,
        locale: 'en',
        consentAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      data.actionLogs.push({
        id: 'act_old',
        siteId: 'site_test',
        conversationId: 'conv_old',
        action: 'old_action',
        status: 'completed',
        confidence: 'system',
        locale: 'en',
        sourceText: 'old',
        reply: null,
        reason: null,
        metadata: {},
        reviewedAt: null,
        reviewedBy: null,
        resolutionNote: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      data.usageEvents.push({
        id: 'use_old',
        siteId: 'site_test',
        type: 'message',
        quantity: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      });
    });

    const response = await fetch(`${api.url}/admin/sites/site_test/privacy/retention-run`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200);
    const cleanup = await json<RetentionRunResponse>(response);
    assert.equal(cleanup.deleted.conversations, 1);
    assert.equal(cleanup.deleted.messages, 1);
    assert.equal(cleanup.deleted.leads, 1);
    assert.equal(cleanup.deleted.actionLogs, 1);
    assert.equal(cleanup.deleted.usageEvents, 1);

    const data = await api.store.read();
    assert.equal(data.conversations.some((conversation) => conversation.id === 'conv_old'), false);
    assert.equal(data.actionLogs.some((action) => action.action === 'retention_cleanup'), true);
  } finally {
    await api.close();
  }
});

async function createOrganizationUser(
  apiUrl: string,
  email: string,
  role: 'owner' | 'admin' | 'support' | 'viewer',
): Promise<OrganizationUserCreateResponse> {
  const response = await fetch(`${apiUrl}/admin/sites/site_test/users`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: email.split('@')[0] ?? email,
      email,
      role,
    }),
  });
  assert.equal(response.status, 201);
  return json<OrganizationUserCreateResponse>(response);
}

async function createWebhookReceiver(): Promise<{
  url: string;
  requests: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}> {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    void readRequestJson(req)
      .then((payload) => {
        requests.push(payload);
        res.writeHead(204);
        res.end();
      })
      .catch(() => {
        res.writeHead(400);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function createEmailReceiver(messageId: string): Promise<{
  url: string;
  requests: Array<{
    path: string;
    authorization: string | undefined;
    payload: Record<string, unknown>;
  }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{
    path: string;
    authorization: string | undefined;
    payload: Record<string, unknown>;
  }> = [];
  const server = createServer((req, res) => {
    void readRequestJson(req)
      .then((payload) => {
        const authorization = Array.isArray(req.headers.authorization)
          ? req.headers.authorization.join(',')
          : req.headers.authorization;
        requests.push({ path: req.url ?? '', authorization, payload });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: messageId }));
      })
      .catch(() => {
        res.writeHead(400);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function readRequestJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

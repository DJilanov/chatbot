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
  KnowledgeCsvImportResponse,
  KnowledgeDocumentImportResponse,
  KnowledgeFaqImportResponse,
  Lead,
  MissingAnswerItem,
  Organization,
  OrganizationUserCreateResponse,
  PrivacyEraseResponse,
  ProductImportResponse,
  ProductItem,
  PublicChatResponse,
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
import {
  createKnowledgeImportDraft,
  importKnowledgeFromCsv,
  importKnowledgeFromDocument,
  importKnowledgeFromFaqText,
  isPrivateAddress,
  normalizeKnowledgeImportUrl,
} from './knowledge-import.js';
import { parseProductFeed } from './product-import.js';

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
  jilanovContactSyncUrl?: string | null;
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
    jilanovContactSyncUrl: configure?.jilanovContactSyncUrl ?? null,
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
  const api = await createTestApi({
    site: (site) => {
      site.config.contact.bookingUrl = 'https://cal.example.com/jilanov-demo';
    },
  });
  try {
    const bgResponse = await fetch(`${api.url}/public/sites/site_test/config?locale=bg`);
    assert.equal(bgResponse.status, 200);
    const bgConfig = await json<Record<string, unknown>>(bgResponse);
    const bgBranding = bgConfig['branding'] as Record<string, unknown>;
    assert.equal(bgBranding['assistantName'], 'Асистент');
    assert.match(String(bgConfig['welcomeMessage']), /Здравейте/);
    assert.equal(bgConfig['bookingUrl'], 'https://cal.example.com/jilanov-demo');

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

test('knowledge URL import creates a human-reviewed draft from page content', () => {
  const sourceUrl = normalizeKnowledgeImportUrl('https://example.com/faq#delivery');
  const draft = createKnowledgeImportDraft(
    sourceUrl,
    `
      <!doctype html>
      <html>
        <head><title>Доставка и гаранция</title><style>.hidden { display:none; }</style></head>
        <body>
          <nav>Navigation should be ignored</nav>
          <main>
            <h1>Доставка за онлайн магазина</h1>
            <p>Безплатна доставка за поръчки над 100 лв. Клиентите получават SMS от куриера.</p>
            <p>Гаранционните заявки се обработват от екипа в рамките на два работни дни.</p>
          </main>
          <script>window.secret = true;</script>
        </body>
      </html>
    `,
    'bg',
    'delivery_policy',
    null,
  );

  assert.equal(draft.sourceUrl, 'https://example.com/faq');
  assert.equal(draft.title, 'Доставка и гаранция');
  assert.equal(draft.locale, 'bg');
  assert.equal(draft.intent, 'delivery_policy');
  assert.match(draft.answer.bg ?? '', /Безплатна доставка/);
  assert.doesNotMatch(draft.answer.bg ?? '', /secret|Navigation/);
  assert.ok(draft.keywords.includes('доставка'));
});

test('knowledge URL import blocks private network targets', async () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('192.168.1.20'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);

  const api = await createTestApi();
  try {
    const response = await fetch(`${api.url}/admin/sites/site_test/knowledge/import-url`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'http://127.0.0.1/private',
        locale: 'bg',
        intent: 'custom',
      }),
    });
    assert.equal(response.status, 400);
    const body = await json<Record<string, unknown>>(response);
    assert.equal(body['code'], 'import_private_host');
  } finally {
    await api.close();
  }
});

test('knowledge CSV import creates localized drafts from spreadsheet rows', () => {
  const result = importKnowledgeFromCsv({
    locale: 'bg',
    intent: 'custom',
    csv: [
      'title,intent,keywords,answer_bg,answer_en',
      '"Доставка","delivery_policy","доставка; куриер","Безплатна доставка над 100 лв.","Free delivery above 100 BGN"',
      '"Гаранция","warranty","гаранция","Гаранцията е 24 месеца.","Warranty is 24 months."',
      '"Празен ред","custom","","",""',
    ].join('\n'),
  });

  assert.equal(result.drafts.length, 2);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.drafts[0]?.title, 'Доставка');
  assert.equal(result.drafts[0]?.intent, 'delivery_policy');
  assert.deepEqual(result.drafts[0]?.keywords, ['доставка', 'куриер']);
  assert.equal(result.drafts[0]?.answer.bg, 'Безплатна доставка над 100 лв.');
  assert.equal(result.drafts[0]?.answer.en, 'Free delivery above 100 BGN');
  assert.equal(result.drafts[1]?.intent, 'warranty_policy');
});

test('knowledge FAQ import creates localized drafts from pasted question blocks', () => {
  const result = importKnowledgeFromFaqText({
    locale: 'bg',
    intent: 'custom',
    text: [
      'Въпрос: Как работи доставката?',
      'Отговор: Доставяме с куриер до два работни дни за всички градове.',
      '',
      'Q: What is the warranty?',
      'A: Warranty requests are reviewed by the team before the product is returned.',
      '',
      'Въпрос: Празен',
      'Отговор: -',
    ].join('\n'),
  });

  assert.equal(result.drafts.length, 2);
  assert.equal(result.skippedBlocks, 1);
  assert.equal(result.drafts[0]?.sourceUrl, 'faq:block-1');
  assert.equal(result.drafts[0]?.title, 'Как работи доставката?');
  assert.equal(result.drafts[0]?.intent, 'custom');
  assert.equal(result.drafts[0]?.answer.bg, 'Доставяме с куриер до два работни дни за всички градове.');
  assert.ok(result.drafts[0]?.keywords.includes('доставяме'));
  assert.equal(result.drafts[1]?.title, 'What is the warranty?');
});

test('knowledge document import creates a draft from PDF text', async () => {
  const result = await importKnowledgeFromDocument({
    fileName: 'delivery-policy.pdf',
    mimeType: 'application/pdf',
    contentBase64: simpleTextPdf().toString('base64'),
    locale: 'en',
    intent: 'delivery_policy',
  });

  assert.equal(result.documentType, 'pdf');
  assert.equal(result.fileName, 'delivery-policy.pdf');
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0]?.sourceUrl, 'pdf:delivery-policy.pdf');
  assert.equal(result.drafts[0]?.title, 'delivery-policy');
  assert.equal(result.drafts[0]?.intent, 'delivery_policy');
  assert.match(result.drafts[0]?.answer.en ?? '', /Delivery is confirmed within two business days/);
  assert.ok(result.drafts[0]?.keywords.includes('delivery'));
});

test('admin can import CSV knowledge drafts', async () => {
  const api = await createTestApi();
  try {
    const response = await fetch(`${api.url}/admin/sites/site_test/knowledge/import-csv`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locale: 'bg',
        intent: 'support',
        csv: ['Въпрос,Отговор', 'Как работи поддръжката?,Пишете ни и ще ви върнем отговор в работен ден.'].join('\n'),
      }),
    });
    assert.equal(response.status, 200);
    const imported = await json<KnowledgeCsvImportResponse>(response);
    assert.equal(imported.drafts.length, 1);
    assert.equal(imported.drafts[0]?.title, 'Как работи поддръжката?');
    assert.equal(imported.drafts[0]?.intent, 'support');
    assert.equal(imported.drafts[0]?.answer.bg, 'Пишете ни и ще ви върнем отговор в работен ден.');

    const data = await api.store.read();
    assert.equal(data.knowledgeEntries.length, 0);
  } finally {
    await api.close();
  }
});

test('admin can import FAQ knowledge drafts', async () => {
  const api = await createTestApi();
  try {
    const response = await fetch(`${api.url}/admin/sites/site_test/knowledge/import-faq`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locale: 'bg',
        intent: 'delivery_policy',
        text: ['Въпрос: Как работи доставката?', 'Отговор: Доставката се потвърждава от нашия екип.'].join('\n'),
      }),
    });
    assert.equal(response.status, 200);
    const imported = await json<KnowledgeFaqImportResponse>(response);
    assert.equal(imported.drafts.length, 1);
    assert.equal(imported.skippedBlocks, 0);
    assert.equal(imported.drafts[0]?.title, 'Как работи доставката?');
    assert.equal(imported.drafts[0]?.intent, 'delivery_policy');
    assert.equal(imported.drafts[0]?.answer.bg, 'Доставката се потвърждава от нашия екип.');

    const data = await api.store.read();
    assert.equal(data.knowledgeEntries.length, 0);
  } finally {
    await api.close();
  }
});

test('admin can import PDF knowledge document drafts', async () => {
  const api = await createTestApi();
  try {
    const response = await fetch(`${api.url}/admin/sites/site_test/knowledge/import-document`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'delivery-policy.pdf',
        mimeType: 'application/pdf',
        contentBase64: simpleTextPdf().toString('base64'),
        locale: 'en',
        intent: 'delivery_policy',
      }),
    });
    assert.equal(response.status, 200);
    const imported = await json<KnowledgeDocumentImportResponse>(response);
    assert.equal(imported.documentType, 'pdf');
    assert.equal(imported.drafts.length, 1);
    assert.equal(imported.drafts[0]?.answer.en?.trim(), 'Delivery is confirmed within two business days.');

    const data = await api.store.read();
    assert.equal(data.knowledgeEntries.length, 0);
  } finally {
    await api.close();
  }
});

test('admin can import product feed and public chat returns product cards', async () => {
  const api = await createTestApi({
    site: (site) => {
      site.config.mode = 'commerce_readonly';
    },
  });
  try {
    const importResponse = await fetch(`${api.url}/admin/sites/site_test/products/import`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        format: 'csv',
        replace: true,
        content: [
          'sku,title,brand,category,price,currency,availability,product_url,image_url,description,keywords',
          'T14-BG,Lenovo ThinkPad T14,Lenovo,Laptops,1299,BGN,in_stock,https://example.com/products/t14,https://example.com/t14.jpg,Business laptop,"thinkpad, laptop, лаптоп"',
          'BROKEN,,,,,,,,,,',
        ].join('\n'),
      }),
    });
    assert.equal(importResponse.status, 200);
    const imported = await json<ProductImportResponse>(importResponse);
    assert.equal(imported.imported, 1);
    assert.equal(imported.updated, 0);
    assert.equal(imported.skippedRows, 1);
    assert.equal(imported.products[0]?.sku, 'T14-BG');

    const productsResponse = await fetch(`${api.url}/admin/sites/site_test/products`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(productsResponse.status, 200);
    const products = await json<ProductImportResponse['products']>(productsResponse);
    assert.equal(products.length, 1);

    const chatResponse = await fetch(`${api.url}/public/sites/site_test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Do you have a Lenovo laptop?',
        locale: 'en',
      }),
    });
    assert.equal(chatResponse.status, 200);
    const chat = await json<PublicChatResponse & { leadId?: string | null }>(chatResponse);
    assert.equal(chat.intent, 'product_recommendation');
    assert.equal(chat.productCards?.length, 1);
    assert.equal(chat.productCards?.[0]?.sku, 'T14-BG');
    assert.equal(chat.productCards?.[0]?.priceLabel, '1,299 BGN');
    assert.equal(chat.needsLeadDetails, false);

    const handoffResponse = await fetch(`${api.url}/public/sites/site_test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'I want to buy T14-BG',
        locale: 'en',
      }),
    });
    assert.equal(handoffResponse.status, 200);
    const handoff = await json<PublicChatResponse>(handoffResponse);
    assert.equal(handoff.intent, 'commerce_handoff');
    assert.equal(handoff.productCards?.[0]?.action, 'checkout_handoff');
    assert.equal(handoff.productCards?.[0]?.actionLabel, 'Continue');

    const clickResponse = await fetch(`${api.url}/public/sites/site_test/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: chat.conversationId,
        action: 'product_clicked',
        status: 'completed',
        confidence: 'customer_click',
        locale: 'en',
        metadata: {
          productId: chat.productCards?.[0]?.id,
          sku: chat.productCards?.[0]?.sku,
        },
      }),
    });
    assert.equal(clickResponse.status, 200);

    const data = await api.store.read();
    assert.equal(data.productItems.length, 1);
    assert.ok(data.actionLogs.some((action) => action.action === 'product_feed_import'));
    assert.ok(data.actionLogs.some((action) => action.action === 'product_recommendation'));
    assert.ok(data.actionLogs.some((action) => action.action === 'checkout_handoff'));
    assert.ok(data.actionLogs.some((action) => action.action === 'product_clicked' && action.metadata['sku'] === 'T14-BG'));
  } finally {
    await api.close();
  }
});

test('admin can import product feed from public URL', async () => {
  const api = await createTestApi();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        [
          'sku,title,brand,category,price,currency,availability,product_url,description',
          'URL-T14,Lenovo URL ThinkPad,Lenovo,Laptops,1499,BGN,in_stock,https://example.com/products/url-t14,URL imported laptop',
        ].join('\n'),
        {
          status: 200,
          headers: { 'content-type': 'text/csv' },
        },
      )) as typeof fetch;

    const importResponse = await originalFetch(`${api.url}/admin/sites/site_test/products/import-url`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'http://93.184.216.34/products.csv',
        replace: false,
      }),
    });
    assert.equal(importResponse.status, 200);
    const imported = await json<ProductImportResponse>(importResponse);
    assert.equal(imported.imported, 1);
    assert.equal(imported.products[0]?.sku, 'URL-T14');

    const data = await api.store.read();
    const action = data.actionLogs.find((item) => item.action === 'product_feed_url_import');
    assert.equal(action?.metadata['sourceUrl'], 'http://93.184.216.34/products.csv');
  } finally {
    globalThis.fetch = originalFetch;
    await api.close();
  }
});

test('admin product feed URL import blocks private network targets', async () => {
  const api = await createTestApi();
  try {
    const importResponse = await fetch(`${api.url}/admin/sites/site_test/products/import-url`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'http://127.0.0.1/products.csv',
      }),
    });
    assert.equal(importResponse.status, 400);
    const body = await json<Record<string, unknown>>(importResponse);
    assert.equal(body['code'], 'product_feed_private_host');
  } finally {
    await api.close();
  }
});

test('public chat includes product comparison payloads', async () => {
  const api = await createTestApi({
    site: (site) => {
      site.config.mode = 'commerce_readonly';
    },
  });
  const productBase: Omit<ProductItem, 'id' | 'sku' | 'title' | 'description' | 'price' | 'attributes'> = {
    siteId: 'site_test',
    enabled: true,
    brand: 'Lenovo',
    category: 'Laptops',
    currency: 'BGN',
    availability: 'in_stock',
    imageUrl: null,
    productUrl: null,
    keywords: ['lenovo', 'thinkpad', 'лаптоп'],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
  try {
    await api.store.update((data) => {
      data.productItems.push(
        {
          ...productBase,
          id: 'prod_compare_t14',
          sku: 'COMPARE-T14',
          title: 'Lenovo ThinkPad T14',
          description: 'Business laptop with 16GB memory.',
          price: 1299,
          attributes: { memory: '16GB', storage: '512GB SSD' },
        },
        {
          ...productBase,
          id: 'prod_compare_x1',
          sku: 'COMPARE-X1',
          title: 'Lenovo ThinkPad X1 Carbon',
          description: 'Lightweight business laptop with 32GB memory.',
          price: 2199,
          attributes: { memory: '32GB', storage: '1TB SSD' },
        },
      );
    });

    const chatResponse = await fetch(`${api.url}/public/sites/site_test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Compare COMPARE-T14 and COMPARE-X1',
        locale: 'en',
      }),
    });
    assert.equal(chatResponse.status, 200);
    const chat = await json<PublicChatResponse>(chatResponse);
    assert.equal(chat.intent, 'product_comparison');
    assert.equal(chat.productCards?.length, 2);
    assert.equal(chat.productComparison?.products.length, 2);
    assert.ok(chat.productComparison?.rows.some((row) => row.label === 'Price'));
    assert.ok(chat.productComparison?.rows.some((row) => row.label === 'Memory'));
  } finally {
    await api.close();
  }
});

test('product JSON feed preserves structured attributes', () => {
  const parsed = parseProductFeed({
    siteId: 'site_test',
    format: 'json',
    content: [
      {
        sku: 'PHONE-1',
        title: 'Demo Phone',
        brand: 'Demo',
        category: 'Phones',
        salePrice: 799,
        availability: 'available',
        productUrl: 'https://example.com/products/phone-1',
        imageUrl: 'https://example.com/products/phone-1.jpg',
        attributes: {
          memory: '8GB',
          storage: '256GB',
        },
      },
    ],
  });

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0]?.price, 799);
  assert.equal(parsed.products[0]?.productUrl, 'https://example.com/products/phone-1');
  assert.equal(parsed.products[0]?.imageUrl, 'https://example.com/products/phone-1.jpg');
  assert.equal(parsed.products[0]?.attributes['memory'], '8GB');
  assert.equal(parsed.products[0]?.availability, 'in_stock');
});

test('product feed parses common price formats', () => {
  const parsed = parseProductFeed({
    siteId: 'site_test',
    format: 'csv',
    content: [
      'sku,title,price,currency',
      'BG-PRICE,Bulgarian formatted price,"1 299,99",BGN',
      'US-PRICE,US formatted price,"1,299.99",USD',
      'EU-PRICE,EU formatted price,"1.299,99",EUR',
      'WHOLE-PRICE,Whole thousands price,"1,299",USD',
    ].join('\n'),
  });

  assert.equal(parsed.products[0]?.price, 1299.99);
  assert.equal(parsed.products[1]?.price, 1299.99);
  assert.equal(parsed.products[2]?.price, 1299.99);
  assert.equal(parsed.products[3]?.price, 1299);
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

test('public leads flag duplicate email submissions for sales review', async () => {
  const api = await createTestApi();
  try {
    const firstResponse = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'repeat@example.com',
        message: 'First demo request',
        consent: true,
      }),
    });
    assert.equal(firstResponse.status, 201);
    const first = await json<LeadResponse>(firstResponse);

    const secondResponse = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'REPEAT@example.com',
        message: 'Second demo request',
        consent: true,
      }),
    });
    assert.equal(secondResponse.status, 201);
    const second = await json<LeadResponse>(secondResponse);
    assert.notEqual(second.leadId, first.leadId);

    const data = await api.store.read();
    const duplicateLead = data.leads.find((lead) => lead.id === second.leadId);
    assert.equal(duplicateLead?.duplicateOfLeadId, first.leadId);
    const duplicateAction = data.actionLogs.find((action) => action.action === 'lead_duplicate_detected');
    assert.equal(duplicateAction?.metadata['leadId'], second.leadId);
    assert.equal(duplicateAction?.metadata['duplicateOfLeadId'], first.leadId);
    assert.equal(duplicateAction?.metadata['duplicateMatch'], 'email');

    const exportResponse = await fetch(`${api.url}/admin/sites/site_test/leads/export`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(exportResponse.status, 200);
    const csv = await exportResponse.text();
    assert.match(csv, /duplicateOfLeadId/);
    assert.match(csv, new RegExp(first.leadId));
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

test('lead sync creates a Jilanov admin message payload and audit entry', async () => {
  const receiver = await createWebhookReceiver();
  const api = await createTestApi({
    jilanovContactSyncUrl: receiver.url,
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo Lead',
        company: 'Demo Ltd',
        email: 'DemoLead@Example.com',
        message: 'Demo request from landing page\nWebsite: https://demo.example.com',
        pageUrl: 'https://chatbot.jilanov.com/#demo',
        locale: 'bg',
        consent: true,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(receiver.requests.length, 1);

    const payload = receiver.requests[0];
    assert.equal(payload?.['name'], 'Demo Lead');
    assert.equal(payload?.['email'], 'demolead@example.com');
    assert.equal(payload?.['phone'], 'not provided');
    assert.match(String(payload?.['message']), /Chatbot demo\/booking lead/);
    assert.match(String(payload?.['message']), /Company: Demo Ltd/);
    assert.match(String(payload?.['message']), /Page: https:\/\/chatbot\.jilanov\.com\/#demo/);

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'jilanov_contact_sync');
    assert.equal(delivery?.status, 'completed');
    assert.equal(delivery?.metadata['target'], 'jilanov-admin-messages');
    assert.equal(delivery?.metadata['leadType'], 'demo_request');
    assert.equal(delivery?.metadata['responseStatus'], 204);
  } finally {
    await api.close();
    await receiver.close();
  }
});

test('lead sync is skipped and audited when the Jilanov admin message cannot be created', async () => {
  const receiver = await createWebhookReceiver();
  const api = await createTestApi({
    jilanovContactSyncUrl: receiver.url,
  });
  try {
    const response = await fetch(`${api.url}/public/sites/site_test/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+359888111222',
        message: 'Please call me about a demo',
        consent: true,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(receiver.requests.length, 0);

    const data = await api.store.read();
    const delivery = data.actionLogs.find((item) => item.action === 'jilanov_contact_sync');
    assert.equal(delivery?.status, 'blocked');
    assert.equal(delivery?.metadata['reasonCode'], 'missing_or_invalid_email');
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
        duplicateOfLeadId: null,
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
        duplicateOfLeadId: null,
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

function simpleTextPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 70 >>
stream
BT
/F1 24 Tf
100 700 Td
(Delivery is confirmed within two business days.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000361 00000 n
trailer
<< /Root 1 0 R /Size 6 >>
startxref
431
%%EOF`,
    'utf8',
  );
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

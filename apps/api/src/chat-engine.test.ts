import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiProvider } from '@chatbot/ai';
import type { KnowledgeEntry, ProductItem, Site } from '@chatbot/contracts';
import { defaultSiteConfig } from './defaults.js';
import { extractContactDetails, findKnowledgeMatch, resolveChat, sanitizeAssistantReply } from './chat-engine.js';

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

const knowledge: KnowledgeEntry[] = [
  {
    id: 'know_returns',
    siteId: site.id,
    enabled: true,
    intent: 'returns_policy',
    title: 'Returns',
    keywords: ['return', 'refund', 'връщане'],
    answer: { en: 'Returns are accepted within 14 days.', bg: 'Връщане се приема до 14 дни.' },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
];

const products: ProductItem[] = [
  {
    id: 'prod_lenovo_t14',
    siteId: site.id,
    enabled: true,
    sku: 'T14-BG',
    title: 'Lenovo ThinkPad T14',
    brand: 'Lenovo',
    category: 'Laptops',
    description: 'Business laptop with 16GB memory.',
    price: 1299,
    currency: 'BGN',
    availability: 'in_stock',
    imageUrl: 'https://example.com/t14.jpg',
    productUrl: 'https://example.com/products/t14',
    attributes: { memory: '16GB' },
    keywords: ['thinkpad', 'lenovo', 'лаптоп'],
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
];

const nullProvider: AiProvider = {
  id: 'null',
  complete: async () => '',
};

test('knowledge match wins before AI fallback', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: knowledge,
    history: [],
    message: 'Can I return this?',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'knowledge_answer');
  assert.equal(result.reply, 'Returns are accepted within 14 days.');
});

test('pricing requests use configured safe pricing message', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: knowledge,
    history: [],
    message: 'How much does this cost?',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'pricing');
  assert.equal(result.needsLeadDetails, true);
});

test('product matches return product recommendation cards', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: knowledge,
    productItems: products,
    history: [],
    message: 'Do you have a Lenovo laptop?',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.action, 'product_recommendation');
  assert.equal(result.productCards?.length, 1);
  assert.equal(result.productCards?.[0]?.sku, 'T14-BG');
  assert.equal(result.productCards?.[0]?.action, 'view_product');
  assert.match(result.reply, /matching products|one matching product/);
});

test('comparison requests return product comparison rows', async () => {
  const comparisonProducts: ProductItem[] = [
    products[0]!,
    {
      ...products[0]!,
      id: 'prod_lenovo_x1',
      sku: 'X1-BG',
      title: 'Lenovo ThinkPad X1 Carbon',
      description: 'Lightweight business laptop with 32GB memory.',
      price: 2199,
      attributes: { memory: '32GB', storage: '1TB SSD', processor: 'Intel Core Ultra 7' },
      keywords: ['thinkpad', 'lenovo', 'x1', 'carbon', 'лаптоп'],
    },
  ];
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: knowledge,
    productItems: comparisonProducts,
    history: [],
    message: 'Compare Lenovo T14 and X1',
    locale: 'en',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_comparison');
  assert.equal(result.action, 'product_comparison');
  assert.equal(result.productCards?.length, 2);
  assert.equal(result.productComparison?.products.length, 2);
  assert.ok(result.productComparison?.rows.some((row) => row.label === 'Price'));
  assert.ok(result.productComparison?.rows.some((row) => row.label === 'Memory'));
});

test('commerce buying intent returns safe checkout handoff cards', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_actions' } },
    knowledgeEntries: knowledge,
    productItems: products,
    history: [],
    message: 'I want to buy T14-BG',
    locale: 'en',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'commerce_handoff');
  assert.equal(result.action, 'checkout_handoff');
  assert.equal(result.productCards?.[0]?.action, 'checkout_handoff');
  assert.equal(result.productCards?.[0]?.actionLabel, 'Continue');
  assert.doesNotMatch(result.reply, /added|created|completed checkout/i);
});

test('commerce handoff asks for contact when product links are missing', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_actions' } },
    knowledgeEntries: knowledge,
    productItems: [{ ...products[0]!, productUrl: null }],
    history: [],
    message: 'I want to buy T14-BG',
    locale: 'en',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'commerce_handoff');
  assert.equal(result.needsLeadDetails, true);
  assert.match(result.reply, /does not include a link/);
});

test('product SKUs with long numbers are not captured as phone leads', async () => {
  const numericSkuProduct: ProductItem = {
    ...products[0]!,
    id: 'prod_smoke',
    sku: 'SMOKE-1785940737',
    title: 'Lenovo ThinkPad Smoke',
    keywords: ['thinkpad', 'smoke', 'лаптоп'],
  };
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: knowledge,
    productItems: [numericSkuProduct],
    history: [],
    message: 'Покажи Lenovo лаптоп SMOKE-1785940737',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.productCards?.[0]?.sku, 'SMOKE-1785940737');
  assert.equal(extractContactDetails('Покажи Lenovo лаптоп SMOKE-1785940737').phone, null);
  assert.equal(extractContactDetails('Моят телефон е +359888000000').phone, '+359888000000');
});

test('deterministic replies use the requested locale', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: knowledge,
    history: [],
    message: 'Колко струва?',
    locale: 'bg',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'pricing');
  assert.match(result.reply, /Цената зависи/);
});

test('human requests are routed to handoff', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: knowledge,
    history: [],
    message: 'I want to speak with support',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'human_handoff');
  assert.equal(result.needsHuman, true);
});

test('unknown questions fall back to lead capture without AI provider', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: knowledge,
    history: [],
    message: 'Can you integrate with our old system?',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'fallback');
  assert.equal(result.needsLeadDetails, true);
});

test('findKnowledgeMatch ignores disabled entries', () => {
  const match = findKnowledgeMatch([{ ...knowledge[0]!, enabled: false }], 'return', 'en');
  assert.equal(match, null);
});

test('sanitizeAssistantReply removes unsafe display artifacts', () => {
  const input = '```secret``` **ok** id 11111111-1111-4111-8111-111111111111 [link](https://x.test)';
  assert.equal(sanitizeAssistantReply(input), 'ok id [reference] https://x.test');
});

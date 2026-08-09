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

const demoKnowledge: KnowledgeEntry[] = [
  {
    id: 'know_demo_product',
    siteId: site.id,
    enabled: true,
    intent: 'services',
    title: 'Product overview',
    keywords: ['what does it do', 'features', 'какво прави', 'какво може', 'асистентът', 'чатбот'],
    answer: {
      en: 'The assistant answers from approved knowledge, captures leads, routes support cases, and records an action audit.',
      bg: 'Асистентът отговаря от одобрена база знания, събира лийдове, насочва support случаи и пази журнал на действията.',
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
  {
    id: 'know_demo_ecommerce',
    siteId: site.id,
    enabled: true,
    intent: 'services',
    title: 'Ecommerce assistant',
    keywords: ['ecommerce', 'online store', 'cart', 'checkout', 'работи с ecommerce', 'онлайн магазин', 'количка'],
    answer: {
      en: 'Yes. For ecommerce, it can use a product feed, show product cards, handle variants, and hand off to cart or checkout after backend confirmation.',
      bg: 'Да. За онлайн магазин може да използва продуктов фийд, да показва продуктови карти, да работи с варианти и да насочва към количка или checkout след backend потвърждение.',
    },
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

const ecommerceProducts: ProductItem[] = [
  ...products,
  {
    ...products[0]!,
    id: 'prod_precision_5550',
    sku: 'PRECISION-5550',
    title: 'Dell Precision 5550 Mobile Workstation',
    brand: 'Dell',
    category: 'Laptops',
    description: 'Workstation laptop with NVIDIA Quadro T2000, Core i7, 32GB RAM and SSD.',
    price: 749,
    currency: 'EUR',
    attributes: { memory: '32GB RAM', gpu: 'NVIDIA Quadro T2000', processor: 'Intel Core i7' },
    keywords: ['precision', 'mobile workstation', 'лаптоп', 'laptop', 'quadro', 'nvidia', 'fifa', 'autocad', 'cad'],
  },
  {
    ...products[0]!,
    id: 'prod_desktop_workstation',
    sku: 'DESKTOP-CAD',
    title: 'HP Z Workstation Desktop',
    brand: 'HP',
    category: 'Desktop workstations',
    description: 'Desktop workstation with NVIDIA RTX GPU.',
    price: 699,
    currency: 'EUR',
    attributes: { gpu: 'NVIDIA RTX A2000', memory: '32GB RAM' },
    keywords: ['desktop', 'workstation', 'fifa', 'autocad', 'cad'],
  },
  {
    ...products[0]!,
    id: 'prod_monitor_24',
    sku: 'MONITOR-24',
    title: 'Dell 24 inch monitor',
    brand: 'Dell',
    category: 'Monitors',
    description: 'Office monitor.',
    price: 99,
    currency: 'EUR',
    attributes: { display: '24 inch' },
    keywords: ['monitor', 'монитор', 'fifa'],
  },
  {
    ...products[0]!,
    id: 'prod_l21c6p70',
    sku: 'L21C6P70',
    title: 'Lenovo laptop battery L21C6P70',
    brand: 'Lenovo',
    category: 'Laptop batteries',
    description: 'Battery with variants by exact laptop model.',
    price: 89,
    currency: 'EUR',
    attributes: { partNumber: 'L21C6P70', type: 'battery' },
    keywords: ['L21C6P70', 'батерия', 'battery', 'part number', 'pn'],
  },
  {
    ...products[0]!,
    id: 'prod_server_memory',
    sku: 'RDIMM-32GB',
    title: '32GB DDR4 ECC RDIMM Server Memory',
    brand: 'Samsung',
    category: 'Server memory',
    description: 'Registered ECC memory for Dell, HP and Lenovo servers.',
    price: 39,
    currency: 'EUR',
    attributes: { memory: '32GB DDR4 ECC RDIMM' },
    keywords: ['server memory', 'сървърна памет', 'ecc', 'rdimm', 'registered'],
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

test('demo Bulgarian product prompt resolves to approved knowledge', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: demoKnowledge,
    history: [],
    message: 'Какво прави асистентът?',
    locale: 'bg',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'knowledge_answer');
  assert.equal(result.action, 'knowledge_services');
  assert.match(result.reply, /одобрена база знания/);
  assert.doesNotMatch(result.reply, /нямам потвърден отговор/i);
});

test('demo product overview knowledge beats incidental product feed text', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'Какво прави асистентът?',
    locale: 'bg',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'knowledge_answer');
  assert.equal(result.action, 'knowledge_services');
  assert.equal(result.productCards, undefined);
  assert.match(result.reply, /одобрена база знания/);
});

test('demo ecommerce prompt resolves to approved knowledge', async () => {
  const result = await resolveChat({
    site,
    knowledgeEntries: demoKnowledge,
    history: [],
    message: 'Can it work with ecommerce?',
    locale: 'en',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'knowledge_answer');
  assert.match(result.reply, /product feed/);
  assert.doesNotMatch(result.reply, /do not have a confirmed answer/i);
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

test('discount requests are guarded before fallback or product search', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: products,
    history: [],
    message: 'може ли 30% отстъпка',
    locale: 'bg',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'pricing');
  assert.equal(result.action, 'discount_guard');
  assert.equal(result.productCards, undefined);
  assert.match(result.reply, /не мога да обещая ръчна отстъпка/);
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

test('gaming laptop prompt recommends workstation laptops instead of unrelated products', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'препоръчай ми лаптоп с който да цъкам фифа',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.action, 'product_recommendation');
  assert.ok((result.productCards?.length ?? 0) > 0);
  assert.equal(result.productCards?.[0]?.sku, 'PRECISION-5550');
  assert.ok(result.productCards?.every((card) => card.category === 'Laptops'));
  assert.doesNotMatch(result.reply, /нямам потвърден отговор/i);
});

test('exact product token returns only exact matches', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'Имаш ли батерия L21C6P70?',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.action, 'exact_product_match');
  assert.equal(result.productCards?.length, 1);
  assert.equal(result.productCards?.[0]?.sku, 'L21C6P70');
});

test('missing exact product token does not show unrelated suggestions', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'търся несъществуващ продукт PN-NOPE-9999',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.action, 'exact_product_miss');
  assert.equal(result.productCards, undefined);
  assert.match(result.reply, /Няма да показвам несвързани продукти/);
});

test('compatibility requests ask for a model before suggesting parts', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'трябва ми батерия за лаптоп',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.action, 'compatibility_question');
  assert.equal(result.productCards, undefined);
  assert.match(result.reply, /точния модел/);
});

test('server memory prompt resets product topic and does not keep laptop context', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [
      {
        id: 'msg_prev',
        conversationId: 'conv_prev',
        role: 'user',
        text: 'трябва ми батерия',
        createdAt: site.createdAt,
      },
    ],
    message: 'покажи сървърна памет 32GB ECC',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'product_recommendation');
  assert.equal(result.productCards?.[0]?.sku, 'RDIMM-32GB');
});

test('cart clear command does not claim the cart was emptied', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_actions' } },
    knowledgeEntries: demoKnowledge,
    productItems: ecommerceProducts,
    history: [],
    message: 'изпразни кошницата ми',
    locale: 'bg',
    aiProvider: nullProvider,
  });

  assert.equal(result.intent, 'commerce_handoff');
  assert.equal(result.action, 'cart_clear_request');
  assert.doesNotMatch(result.reply, /изпразних|изчистих|готово/i);
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

test('operational order requests are handled before product context', async () => {
  const result = await resolveChat({
    site: { ...site, config: { ...site.config, mode: 'commerce_readonly' } },
    knowledgeEntries: demoKnowledge,
    productItems: products,
    history: [],
    message: 'откажи поръчка #f1893a93',
    locale: 'bg',
    aiProvider: nullProvider,
  });
  assert.equal(result.intent, 'human_handoff');
  assert.equal(result.action, 'operational_support_guard');
  assert.equal(result.productCards, undefined);
  assert.match(result.reply, /свързан backend/);
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

test('sanitizeAssistantReply blocks internal UI keys', () => {
  assert.equal(
    sanitizeAssistantReply('assistant_feedback_helpful variant_choose_variant', 'en'),
    'What would you like the assistant to help with?',
  );
});

test('AI operational mutation claims are rewritten safely', async () => {
  const unsafeProvider: AiProvider = {
    id: 'openai',
    complete: async () => 'Добавих продукта в количката и поръчката е анулирана.',
  };
  const result = await resolveChat({
    site,
    knowledgeEntries: [],
    history: [],
    message: 'можеш ли да помогнеш',
    locale: 'bg',
    aiProvider: unsafeProvider,
  });
  assert.equal(result.intent, 'ai_answer');
  assert.match(result.reply, /Не мога да потвърдя действие/);
  assert.doesNotMatch(result.reply, /Добавих|анулирана/);
});

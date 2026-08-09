import type { AiProvider } from '@chatbot/ai';
import type { ChatMessage, KnowledgeEntry, LocaleCode, ProductItem, PublicChatIntent, Site } from '@chatbot/contracts';
import { resolveChat, type ChatEngineResult } from './chat-engine.js';
import { defaultSiteConfig } from './defaults.js';

interface EvalCase {
  id: string;
  message: string;
  locale: LocaleCode;
  expectedIntent: PublicChatIntent;
  expectedAction?: string;
  expectedReplyIncludes?: string[];
  forbiddenReplyPatterns?: RegExp[];
  needsLeadDetails?: boolean;
  needsHuman?: boolean;
  provider?: AiProvider;
  knowledgeEntries?: KnowledgeEntry[];
  productItems?: ProductItem[];
  history?: ChatMessage[];
  expectedProductCardsMin?: number;
  expectedProductCardsMax?: number;
  expectedFirstProductSku?: string;
}

interface EvalResult {
  caseId: string;
  passed: boolean;
  failures: string[];
  result: ChatEngineResult;
}

const site: Site = {
  id: 'site_eval',
  organizationId: 'org_eval',
  name: 'Eval Site',
  publicToken: 'token_eval',
  enabled: true,
  config: defaultSiteConfig({ name: 'Eval Site' }),
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

const baseKnowledge: KnowledgeEntry[] = [
  {
    id: 'know_returns',
    siteId: site.id,
    enabled: true,
    intent: 'returns_policy',
    title: 'Returns',
    keywords: ['return', 'refund', 'връщане'],
    answer: {
      en: 'Returns are accepted within 14 days after delivery.',
      bg: 'Връщане се приема до 14 дни след доставка.',
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
  {
    id: 'know_install',
    siteId: site.id,
    enabled: true,
    intent: 'services',
    title: 'Widget install',
    keywords: ['install', 'embed', 'script'],
    answer: {
      en: 'The assistant installs with one script tag after the site is configured and allowed domains are set.',
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
  {
    id: 'know_disabled_discount',
    siteId: site.id,
    enabled: false,
    intent: 'pricing',
    title: 'Disabled discount',
    keywords: ['secret discount'],
    answer: {
      en: 'This disabled answer must never be shown.',
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
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
      en: 'For ecommerce, the assistant can use a product feed, show product cards, handle variants, and hand off to cart or checkout after backend confirmation.',
      bg: 'За онлайн магазин асистентът може да използва продуктов фийд, да показва продуктови карти, да работи с варианти и да насочва към количка или checkout след backend потвърждение.',
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
];

const nullProvider: AiProvider = {
  id: 'null',
  complete: async () => '',
};

const safeAiProvider: AiProvider = {
  id: 'openai',
  complete: async () => 'The team can review that integration and follow up with a confirmed answer.',
};

const unsafeAiProvider: AiProvider = {
  id: 'openai',
  complete: async () => 'I added the item to your cart and payment is confirmed.',
};

const baseProducts: ProductItem[] = [
  {
    id: 'prod_eval_precision',
    siteId: site.id,
    enabled: true,
    sku: 'PRECISION-5550',
    title: 'Dell Precision 5550 Mobile Workstation',
    brand: 'Dell',
    category: 'Laptops',
    description: 'Workstation laptop with NVIDIA Quadro T2000, Core i7, 32GB RAM and SSD.',
    price: 749,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: null,
    productUrl: 'https://example.com/precision-5550',
    attributes: { memory: '32GB RAM', gpu: 'NVIDIA Quadro T2000', processor: 'Intel Core i7' },
    keywords: ['precision', 'mobile workstation', 'лаптоп', 'laptop', 'quadro', 'nvidia', 'fifa', 'autocad', 'cad'],
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
  {
    id: 'prod_eval_monitor',
    siteId: site.id,
    enabled: true,
    sku: 'MONITOR-24',
    title: 'Dell 24 inch monitor',
    brand: 'Dell',
    category: 'Monitors',
    description: 'Office monitor.',
    price: 99,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: null,
    productUrl: 'https://example.com/monitor',
    attributes: { display: '24 inch' },
    keywords: ['monitor', 'монитор', 'fifa'],
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
  {
    id: 'prod_eval_battery',
    siteId: site.id,
    enabled: true,
    sku: 'L21C6P70',
    title: 'Lenovo laptop battery L21C6P70',
    brand: 'Lenovo',
    category: 'Laptop batteries',
    description: 'Battery with variants by exact laptop model.',
    price: 89,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: null,
    productUrl: 'https://example.com/l21c6p70',
    attributes: { partNumber: 'L21C6P70', type: 'battery' },
    keywords: ['L21C6P70', 'батерия', 'battery', 'part number', 'pn'],
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  },
];

const globalForbiddenReplyPatterns: RegExp[] = [
  /```/,
  /\b(?:assistant|system)_prompt\b/i,
  /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i,
  /\b(?:order is shipped|payment is confirmed|already added|i added the item)\b/i,
];

const cases: EvalCase[] = [
  {
    id: 'greeting',
    message: 'Hello',
    locale: 'en',
    expectedIntent: 'greeting',
    expectedReplyIncludes: ['AI assistant'],
  },
  {
    id: 'knowledge-returns-en',
    message: 'Can I return this order?',
    locale: 'en',
    expectedIntent: 'knowledge_answer',
    expectedAction: 'knowledge_returns_policy',
    expectedReplyIncludes: ['14 days'],
  },
  {
    id: 'knowledge-returns-bg',
    message: 'Какво е връщане?',
    locale: 'bg',
    expectedIntent: 'knowledge_answer',
    expectedReplyIncludes: ['14 дни'],
  },
  {
    id: 'demo-product-prompt-bg',
    message: 'Какво прави асистентът?',
    locale: 'bg',
    expectedIntent: 'knowledge_answer',
    expectedAction: 'knowledge_services',
    expectedReplyIncludes: ['одобрена база знания', 'журнал'],
    forbiddenReplyPatterns: [/нямам потвърден отговор/i],
  },
  {
    id: 'demo-ecommerce-prompt-en',
    message: 'Can it work with ecommerce?',
    locale: 'en',
    expectedIntent: 'knowledge_answer',
    expectedAction: 'knowledge_services',
    expectedReplyIncludes: ['product feed', 'backend confirmation'],
    forbiddenReplyPatterns: [/do not have a confirmed answer/i],
  },
  {
    id: 'pricing-safe-message',
    message: 'How much does the managed assistant cost?',
    locale: 'en',
    expectedIntent: 'pricing',
    expectedAction: 'pricing_question',
    expectedReplyIncludes: ['Pricing depends'],
    forbiddenReplyPatterns: [/\$\d+/, /guaranteed discount/i],
    needsLeadDetails: true,
  },
  {
    id: 'discount-guard-bg',
    message: 'може ли 30% отстъпка',
    locale: 'bg',
    expectedIntent: 'pricing',
    expectedAction: 'discount_guard',
    expectedReplyIncludes: ['не мога да обещая ръчна отстъпка'],
    needsLeadDetails: true,
  },
  {
    id: 'human-handoff',
    message: 'I want to speak with a person from support',
    locale: 'en',
    expectedIntent: 'human_handoff',
    expectedAction: 'human_handoff_request',
    expectedReplyIncludes: ['route this to the team'],
    needsLeadDetails: true,
    needsHuman: true,
  },
  {
    id: 'operational-order-guard-bg',
    message: 'откажи поръчка #f1893a93',
    locale: 'bg',
    expectedIntent: 'human_handoff',
    expectedAction: 'operational_support_guard',
    expectedReplyIncludes: ['свързан backend'],
    needsLeadDetails: true,
    needsHuman: true,
  },
  {
    id: 'lead-with-email',
    message: 'Please contact me at buyer@example.com',
    locale: 'en',
    expectedIntent: 'lead_capture',
    expectedAction: 'lead_capture_prompt',
    expectedReplyIncludes: ['captured your contact'],
    needsLeadDetails: false,
  },
  {
    id: 'unknown-null-provider-fallback',
    message: 'Can you integrate with our warehouse tool?',
    locale: 'en',
    expectedIntent: 'fallback',
    expectedAction: 'fallback_answer',
    expectedReplyIncludes: ['do not have a confirmed answer', 'Please leave your name'],
    needsLeadDetails: true,
  },
  {
    id: 'disabled-knowledge-is-ignored',
    message: 'Do you have a secret discount?',
    locale: 'en',
    expectedIntent: 'pricing',
    expectedAction: 'discount_guard',
    expectedReplyIncludes: ['cannot promise a manual discount'],
    forbiddenReplyPatterns: [/disabled answer/i],
    needsLeadDetails: true,
  },
  {
    id: 'safe-ai-answer',
    message: 'Is a custom ERP integration possible?',
    locale: 'en',
    expectedIntent: 'ai_answer',
    expectedAction: 'ai_answer',
    expectedReplyIncludes: ['team can review'],
    provider: safeAiProvider,
  },
  {
    id: 'unsafe-ai-operational-claim-blocked',
    message: 'Can you take action on my cart?',
    locale: 'en',
    expectedIntent: 'human_handoff',
    expectedAction: 'operational_support_guard',
    expectedReplyIncludes: ['connected backend'],
    forbiddenReplyPatterns: [/payment is confirmed/i, /added the item/i],
    needsLeadDetails: true,
    needsHuman: true,
    provider: unsafeAiProvider,
  },
  {
    id: 'gaming-laptop-bg',
    message: 'препоръчай ми лаптоп с който да цъкам фифа',
    locale: 'bg',
    expectedIntent: 'product_recommendation',
    expectedAction: 'product_recommendation',
    expectedReplyIncludes: ['Намерих'],
    forbiddenReplyPatterns: [/нямам потвърден отговор/i, /monitor/i],
    productItems: baseProducts,
    expectedProductCardsMin: 1,
    expectedFirstProductSku: 'PRECISION-5550',
  },
  {
    id: 'exact-product-token-bg',
    message: 'Имаш ли батерия L21C6P70?',
    locale: 'bg',
    expectedIntent: 'product_recommendation',
    expectedAction: 'exact_product_match',
    expectedReplyIncludes: ['точен продукт'],
    productItems: baseProducts,
    expectedProductCardsMin: 1,
    expectedProductCardsMax: 1,
    expectedFirstProductSku: 'L21C6P70',
  },
  {
    id: 'missing-exact-product-token-bg',
    message: 'търся несъществуващ продукт PN-NOPE-9999',
    locale: 'bg',
    expectedIntent: 'product_recommendation',
    expectedAction: 'exact_product_miss',
    expectedReplyIncludes: ['Няма да показвам несвързани продукти'],
    productItems: baseProducts,
    expectedProductCardsMax: 0,
    needsLeadDetails: true,
  },
  {
    id: 'compatibility-needs-model-bg',
    message: 'трябва ми батерия за лаптоп',
    locale: 'bg',
    expectedIntent: 'product_recommendation',
    expectedAction: 'compatibility_question',
    expectedReplyIncludes: ['точния модел'],
    productItems: baseProducts,
    expectedProductCardsMax: 0,
  },
  {
    id: 'cart-clear-guard-bg',
    message: 'изпразни кошницата ми',
    locale: 'bg',
    expectedIntent: 'commerce_handoff',
    expectedAction: 'cart_clear_request',
    expectedReplyIncludes: ['реално потвърждение'],
    forbiddenReplyPatterns: [/изпразних|изчистих|готово/i],
    productItems: baseProducts,
  },
];

const results = await Promise.all(cases.map(runCase));
for (const result of results) {
  const marker = result.passed ? 'ok' : 'not ok';
  process.stdout.write(`${marker} ${result.caseId}\n`);
  if (!result.passed) {
    for (const failure of result.failures) process.stdout.write(`  - ${failure}\n`);
    process.stdout.write(`  reply: ${JSON.stringify(result.result.reply)}\n`);
  }
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\nAssistant evals: ${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exitCode = 1;

async function runCase(testCase: EvalCase): Promise<EvalResult> {
  const result = await resolveChat({
    site,
    knowledgeEntries: testCase.knowledgeEntries ?? baseKnowledge,
    productItems: testCase.productItems ?? [],
    history: testCase.history ?? [],
    message: testCase.message,
    locale: testCase.locale,
    aiProvider: testCase.provider ?? nullProvider,
  });
  const failures = evaluateResult(testCase, result);
  return {
    caseId: testCase.id,
    passed: failures.length === 0,
    failures,
    result,
  };
}

function evaluateResult(testCase: EvalCase, result: ChatEngineResult): string[] {
  const failures: string[] = [];
  if (result.intent !== testCase.expectedIntent) {
    failures.push(`expected intent ${testCase.expectedIntent}, got ${result.intent}`);
  }
  if (testCase.expectedAction && result.action !== testCase.expectedAction) {
    failures.push(`expected action ${testCase.expectedAction}, got ${result.action}`);
  }
  if (typeof testCase.needsLeadDetails === 'boolean' && result.needsLeadDetails !== testCase.needsLeadDetails) {
    failures.push(`expected needsLeadDetails ${testCase.needsLeadDetails}, got ${result.needsLeadDetails}`);
  }
  if (typeof testCase.needsHuman === 'boolean' && result.needsHuman !== testCase.needsHuman) {
    failures.push(`expected needsHuman ${testCase.needsHuman}, got ${result.needsHuman}`);
  }
  const productCardsCount = result.productCards?.length ?? 0;
  if (typeof testCase.expectedProductCardsMin === 'number' && productCardsCount < testCase.expectedProductCardsMin) {
    failures.push(`expected at least ${testCase.expectedProductCardsMin} product cards, got ${productCardsCount}`);
  }
  if (typeof testCase.expectedProductCardsMax === 'number' && productCardsCount > testCase.expectedProductCardsMax) {
    failures.push(`expected at most ${testCase.expectedProductCardsMax} product cards, got ${productCardsCount}`);
  }
  if (testCase.expectedFirstProductSku && result.productCards?.[0]?.sku !== testCase.expectedFirstProductSku) {
    failures.push(`expected first product SKU ${testCase.expectedFirstProductSku}, got ${result.productCards?.[0]?.sku ?? 'none'}`);
  }
  for (const expectedText of testCase.expectedReplyIncludes ?? []) {
    if (!result.reply.toLowerCase().includes(expectedText.toLowerCase())) {
      failures.push(`expected reply to include ${JSON.stringify(expectedText)}`);
    }
  }
  for (const pattern of [...globalForbiddenReplyPatterns, ...(testCase.forbiddenReplyPatterns ?? [])]) {
    if (pattern.test(result.reply)) failures.push(`reply matched forbidden pattern ${pattern}`);
  }
  if (result.reply.length > 2000) failures.push(`reply is too long: ${result.reply.length}`);
  if (!result.reply.trim()) failures.push('reply is empty');
  return failures;
}

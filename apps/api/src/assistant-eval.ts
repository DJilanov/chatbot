import type { AiProvider } from '@chatbot/ai';
import type { ChatMessage, KnowledgeEntry, LocaleCode, PublicChatIntent, Site } from '@chatbot/contracts';
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
  history?: ChatMessage[];
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
    expectedIntent: 'fallback',
    expectedReplyIncludes: ['do not have a confirmed answer'],
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
    expectedIntent: 'fallback',
    expectedAction: 'fallback_answer',
    expectedReplyIncludes: ['do not have a confirmed answer'],
    forbiddenReplyPatterns: [/payment is confirmed/i, /added the item/i],
    needsLeadDetails: true,
    provider: unsafeAiProvider,
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

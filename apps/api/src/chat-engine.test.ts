import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiProvider } from '@chatbot/ai';
import type { KnowledgeEntry, Site } from '@chatbot/contracts';
import { defaultSiteConfig } from './defaults.js';
import { findKnowledgeMatch, resolveChat, sanitizeAssistantReply } from './chat-engine.js';

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

import type { AiChatMessage, AiProvider } from '@chatbot/ai';
import {
  pickLocalizedText,
  type ChatMessage,
  type KnowledgeEntry,
  type LocaleCode,
  type PublicChatIntent,
  type Site,
} from '@chatbot/contracts';

const MAX_HISTORY = 12;
const MAX_AI_CONTEXT_ENTRIES = 20;

export interface ContactDetails {
  email: string | null;
  phone: string | null;
}

export interface ChatEngineInput {
  site: Site;
  knowledgeEntries: KnowledgeEntry[];
  history: ChatMessage[];
  message: string;
  locale: LocaleCode;
  aiProvider: AiProvider;
}

export interface ChatEngineResult {
  reply: string;
  intent: PublicChatIntent;
  needsLeadDetails: boolean;
  needsHuman: boolean;
  confidence: 'deterministic' | 'ai';
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
}

interface KnowledgeMatch {
  entry: KnowledgeEntry;
  score: number;
}

export async function resolveChat(input: ChatEngineInput): Promise<ChatEngineResult> {
  const text = input.message.trim();
  const normalized = normalizeSearchText(text);
  const contact = extractContactDetails(text);

  if (isGreeting(normalized)) {
    return deterministicResult({
      reply: input.site.config.welcomeMessage,
      intent: 'greeting',
      action: 'greeting',
      metadata: {},
    });
  }

  if (hasLeadIntent(normalized) || contact.email || contact.phone) {
    return deterministicResult({
      reply: leadReply(input.site, contact),
      intent: 'lead_capture',
      action: 'lead_capture_prompt',
      needsLeadDetails: !contact.email && !contact.phone,
      metadata: { hasEmail: Boolean(contact.email), hasPhone: Boolean(contact.phone) },
    });
  }

  if (hasHumanHandoffIntent(normalized)) {
    return deterministicResult({
      reply: input.site.config.handoffMessage,
      intent: 'human_handoff',
      action: 'human_handoff_request',
      needsLeadDetails: true,
      needsHuman: true,
      metadata: {},
      reason: 'Visitor asked for a person or support handoff',
    });
  }

  if (hasPricingIntent(normalized)) {
    return deterministicResult({
      reply: input.site.config.pricingMessage,
      intent: 'pricing',
      action: 'pricing_question',
      needsLeadDetails: true,
      metadata: {},
    });
  }

  const knowledgeMatch = findKnowledgeMatch(input.knowledgeEntries, text, input.locale);
  if (knowledgeMatch) {
    const reply = pickLocalizedText(knowledgeMatch.entry.answer, input.locale, input.site.config.defaultLocale);
    return deterministicResult({
      reply,
      intent: 'knowledge_answer',
      action: `knowledge_${knowledgeMatch.entry.intent}`,
      metadata: {
        knowledgeEntryId: knowledgeMatch.entry.id,
        knowledgeTitle: knowledgeMatch.entry.title,
        score: knowledgeMatch.score,
      },
    });
  }

  if (input.aiProvider.id !== 'null') {
    const aiReply = await completeWithAi(input);
    if (aiReply) {
      return {
        reply: aiReply,
        intent: 'ai_answer',
        needsLeadDetails: false,
        needsHuman: false,
        confidence: 'ai',
        action: 'ai_answer',
        reason: null,
        metadata: { provider: input.aiProvider.id },
      };
    }
  }

  return deterministicResult({
    reply: `${input.site.config.fallbackMessage}\n\n${input.site.config.leadCapturePrompt}`,
    intent: 'fallback',
    action: 'fallback_answer',
    needsLeadDetails: true,
    metadata: {},
    reason: 'No knowledge entry matched and no AI answer was available',
  });
}

export function extractContactDetails(text: string): ContactDetails {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.replace(/\s+/g, ' ').trim() ?? null;
  return { email, phone };
}

export function findKnowledgeMatch(
  entries: KnowledgeEntry[],
  text: string,
  locale: LocaleCode,
): KnowledgeMatch | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;

  const candidates = entries
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const answer = pickLocalizedText(entry.answer, locale);
      if (!answer) return null;
      const keywordScore = entry.keywords.reduce((score, keyword) => {
        const safeKeyword = normalizeSearchText(keyword);
        if (!safeKeyword) return score;
        if (normalized.includes(safeKeyword)) return score + Math.max(3, safeKeyword.length / 6);
        return score;
      }, 0);
      const titleScore = normalized.includes(normalizeSearchText(entry.title)) ? 2 : 0;
      const score = keywordScore + titleScore;
      return score > 0 ? { entry, score } : null;
    })
    .filter((match): match is KnowledgeMatch => match !== null)
    .sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

export function sanitizeAssistantReply(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[reference]')
    .replace(/\b(?:assistant|system)_prompt\b/gi, '')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[*_#]{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000);
}

function deterministicResult(input: {
  reply: string;
  intent: PublicChatIntent;
  action: string;
  needsLeadDetails?: boolean;
  needsHuman?: boolean;
  reason?: string | null;
  metadata: Record<string, unknown>;
}): ChatEngineResult {
  return {
    reply: sanitizeAssistantReply(input.reply),
    intent: input.intent,
    needsLeadDetails: input.needsLeadDetails ?? false,
    needsHuman: input.needsHuman ?? false,
    confidence: 'deterministic',
    action: input.action,
    reason: input.reason ?? null,
    metadata: input.metadata,
  };
}

async function completeWithAi(input: ChatEngineInput): Promise<string> {
  const knowledgeContext = input.knowledgeEntries
    .filter((entry) => entry.enabled)
    .slice(0, MAX_AI_CONTEXT_ENTRIES)
    .map((entry) => {
      const answer = pickLocalizedText(entry.answer, input.locale, input.site.config.defaultLocale);
      return `- ${entry.title}: ${answer}`;
    })
    .join('\n');

  const messages: AiChatMessage[] = input.history
    .slice(-MAX_HISTORY)
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, text: message.text }));

  const system = [
    input.site.config.systemPrompt,
    'Always disclose through behavior that you are an AI assistant if asked.',
    'Do not invent prices, discounts, order status, payment status, delivery status, legal terms, or unsupported operational facts.',
    'If the approved knowledge below does not answer the question, ask for contact details and say the team can follow up.',
    knowledgeContext ? `Approved knowledge:\n${knowledgeContext}` : 'Approved knowledge is currently empty.',
  ].join('\n\n');

  try {
    const result = await input.aiProvider.complete({
      system,
      messages,
      temperature: 0.25,
      maxOutputTokens: 700,
    });
    const safe = sanitizeAssistantReply(result);
    return leaksOperationalClaim(safe) ? '' : safe;
  } catch {
    return '';
  }
}

function leadReply(site: Site, contact: ContactDetails): string {
  if (contact.email || contact.phone) {
    return 'Thanks. I captured your contact details and the team can follow up.';
  }
  return site.config.leadCapturePrompt;
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s@.+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGreeting(normalized: string): boolean {
  return /^(hi|hello|hey|здравей|zdravei|добър ден|good morning|good afternoon|привет)\b/.test(normalized);
}

function hasLeadIntent(normalized: string): boolean {
  return /(book|demo|meeting|call me|contact me|quote|offer|оферта|демо|среща|свържете|обадете|пишете ми)/.test(normalized);
}

function hasHumanHandoffIntent(normalized: string): boolean {
  return /(human|person|agent|operator|support|staff|човек|оператор|поддръжка|служител|консултант)/.test(normalized);
}

function hasPricingIntent(normalized: string): boolean {
  return /(price|pricing|cost|how much|quote|цена|цени|струва|колко струва|оферта)/.test(normalized);
}

function leaksOperationalClaim(text: string): boolean {
  return /(i (added|created|cancelled|refunded|paid|changed)|already added|order is shipped|payment is confirmed|добавих|създадох|анулирах|платено|изпратена е)/i.test(text);
}


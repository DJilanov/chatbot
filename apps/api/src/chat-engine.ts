import type { AiChatMessage, AiProvider } from '@chatbot/ai';
import {
  pickLocalizedText,
  type ChatMessage,
  type KnowledgeEntry,
  type LocaleCode,
  type ProductCard,
  type ProductItem,
  type PublicChatIntent,
  type Site,
} from '@chatbot/contracts';
import { localizedSiteConfig } from './localization.js';

const MAX_HISTORY = 12;
const MAX_AI_CONTEXT_ENTRIES = 20;

export interface ContactDetails {
  email: string | null;
  phone: string | null;
}

export interface ChatEngineInput {
  site: Site;
  knowledgeEntries: KnowledgeEntry[];
  productItems?: ProductItem[];
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
  productCards?: ProductCard[];
}

interface KnowledgeMatch {
  entry: KnowledgeEntry;
  score: number;
}

interface ProductMatch {
  product: ProductItem;
  score: number;
  reason: string;
}

export async function resolveChat(input: ChatEngineInput): Promise<ChatEngineResult> {
  const site: Site = {
    ...input.site,
    config: localizedSiteConfig(input.site.config, input.locale),
  };
  const text = input.message.trim();
  const normalized = normalizeSearchText(text);
  const contact = extractContactDetails(text);

  if (isGreeting(normalized)) {
    return deterministicResult({
      reply: site.config.welcomeMessage,
      intent: 'greeting',
      action: 'greeting',
      metadata: {},
    });
  }

  if (hasLeadIntent(normalized) || contact.email || contact.phone) {
    return deterministicResult({
      reply: leadReply(site, input.locale, contact),
      intent: 'lead_capture',
      action: 'lead_capture_prompt',
      needsLeadDetails: !contact.email && !contact.phone,
      metadata: { hasEmail: Boolean(contact.email), hasPhone: Boolean(contact.phone) },
    });
  }

  if (hasHumanHandoffIntent(normalized)) {
    return deterministicResult({
      reply: site.config.handoffMessage,
      intent: 'human_handoff',
      action: 'human_handoff_request',
      needsLeadDetails: true,
      needsHuman: true,
      metadata: {},
      reason: 'Visitor asked for a person or support handoff',
    });
  }

  const productMatches = findProductMatches(input.productItems ?? [], text, input.locale);
  if (productMatches.length > 0 && shouldShowProductMatches(site, normalized, productMatches[0]?.score ?? 0)) {
    const cards = productMatches.slice(0, 3).map((match) => productCard(match, input.locale));
    return deterministicResult({
      reply: productReply(input.locale, cards.length),
      intent: 'product_recommendation',
      action: 'product_recommendation',
      metadata: {
        productIds: cards.map((card) => card.id),
        productSkus: cards.map((card) => card.sku).filter(Boolean),
        productCount: cards.length,
      },
      productCards: cards,
    });
  }

  if (hasPricingIntent(normalized)) {
    return deterministicResult({
      reply: site.config.pricingMessage,
      intent: 'pricing',
      action: 'pricing_question',
      needsLeadDetails: true,
      metadata: {},
    });
  }

  const knowledgeMatch = findKnowledgeMatch(input.knowledgeEntries, text, input.locale);
  if (knowledgeMatch) {
    const reply = pickLocalizedText(knowledgeMatch.entry.answer, input.locale, site.config.defaultLocale);
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
    const aiReply = await completeWithAi({ ...input, site });
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
    reply: `${site.config.fallbackMessage}\n\n${site.config.leadCapturePrompt}`,
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

export function findProductMatches(products: ProductItem[], text: string, locale: LocaleCode): ProductMatch[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const tokens = new Set(normalized.split(/\s+/).filter((token) => token.length >= 2));

  return products
    .filter((product) => product.enabled)
    .map((product) => {
      const score = productScore(product, normalized, tokens);
      if (score <= 0) return null;
      return {
        product,
        score,
        reason: productReason(product, locale, normalized),
      };
    })
    .filter((match): match is ProductMatch => match !== null)
    .sort((a, b) => b.score - a.score || availabilityRank(a.product.availability) - availabilityRank(b.product.availability))
    .slice(0, 6);
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
  productCards?: ProductCard[];
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
    productCards: input.productCards,
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
    'Use product feed facts only when product data is explicitly supplied by the system. Do not invent availability or product details.',
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

function shouldShowProductMatches(site: Site, normalized: string, topScore: number): boolean {
  if (site.config.mode === 'commerce_readonly' || site.config.mode === 'commerce_actions') return true;
  return topScore >= 8 || hasProductSearchIntent(normalized);
}

function productScore(product: ProductItem, normalized: string, tokens: Set<string>): number {
  let score = 0;
  const fields = [
    { value: product.sku, weight: 10 },
    { value: product.title, weight: 5 },
    { value: product.brand, weight: 4 },
    { value: product.category, weight: 3 },
    { value: product.description, weight: 1.5 },
    { value: Object.values(product.attributes).join(' '), weight: 2 },
  ];
  for (const field of fields) {
    const value = normalizeSearchText(field.value ?? '');
    if (!value) continue;
    if (normalized.includes(value)) score += field.weight * 2;
    for (const token of tokens) {
      if (token.length >= 3 && value.includes(token)) score += field.weight;
    }
  }
  for (const keyword of product.keywords) {
    const value = normalizeSearchText(keyword);
    if (!value) continue;
    if (normalized.includes(value) || tokens.has(value)) score += 4;
  }
  if (hasProductSearchIntent(normalized) && score > 0) score += 2;
  return score;
}

function productCard(match: ProductMatch, locale: LocaleCode): ProductCard {
  const product = match.product;
  return {
    id: product.id,
    title: product.title,
    sku: product.sku,
    brand: product.brand,
    category: product.category,
    description: product.description,
    price: product.price,
    currency: product.currency,
    priceLabel: product.price === null ? null : priceLabel(product.price, product.currency),
    availability: product.availability,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    reason: match.reason || (locale === 'bg' ? 'Съвпада с търсенето ви.' : 'Matches your search.'),
  };
}

function productReply(locale: LocaleCode, count: number): string {
  if (locale === 'bg') {
    return count === 1
      ? 'Намерих един подходящ продукт от каталога. Проверете цената, наличността и детайлите в картата.'
      : `Намерих ${count} подходящи продукта от каталога. Проверете цените, наличността и детайлите в картите.`;
  }
  return count === 1
    ? 'I found one matching product from the catalog. Check the card for price, availability, and details.'
    : `I found ${count} matching products from the catalog. Check the cards for price, availability, and details.`;
}

function productReason(product: ProductItem, locale: LocaleCode, normalized: string): string {
  if (product.sku && normalized.includes(normalizeSearchText(product.sku))) {
    return locale === 'bg' ? `Съвпада със SKU ${product.sku}.` : `Matches SKU ${product.sku}.`;
  }
  if (product.brand && normalized.includes(normalizeSearchText(product.brand))) {
    return locale === 'bg' ? `Съвпада с марка ${product.brand}.` : `Matches brand ${product.brand}.`;
  }
  if (product.category && normalized.includes(normalizeSearchText(product.category))) {
    return locale === 'bg' ? `Съвпада с категория ${product.category}.` : `Matches category ${product.category}.`;
  }
  return locale === 'bg' ? 'Съвпада с търсенето ви.' : 'Matches your search.';
}

function priceLabel(price: number, currency: string | null): string {
  return `${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();
}

function availabilityRank(value: ProductItem['availability']): number {
  if (value === 'in_stock') return 0;
  if (value === 'preorder') return 1;
  if (value === 'unknown') return 2;
  return 3;
}

function hasProductSearchIntent(normalized: string): boolean {
  return /\b(product|products|recommend|recommendation|show|find|catalog|item|items|sku|model)\b/i.test(normalized)
    || /(продукт|продукти|препоръч|покажи|намери|каталог|артикул|модел|стока|стоки)/i.test(normalized);
}

function leadReply(site: Site, locale: LocaleCode, contact: ContactDetails): string {
  if (contact.email || contact.phone) {
    return locale === 'bg'
      ? 'Благодаря. Записах контактните ви данни и екипът може да се свърже с вас.'
      : 'Thanks. I captured your contact details and the team can follow up.';
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

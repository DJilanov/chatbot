import type { AiChatMessage, AiProvider } from '@chatbot/ai';
import {
  pickLocalizedText,
  type ChatMessage,
  type KnowledgeEntry,
  type LocaleCode,
  type ProductCard,
  type ProductComparison,
  type ProductComparisonRow,
  type ProductItem,
  type PublicChatIntent,
  type Site,
} from '@chatbot/contracts';
import { localizedSiteConfig } from './localization.js';

const MAX_HISTORY = 12;
const MAX_AI_CONTEXT_ENTRIES = 20;
const MAX_EXACT_PRODUCT_TOKENS = 3;
const GAMING_ASSISTANT_QUERY =
  'nvidia geforce gtx rtx quadro radeon mx precision zbook thinkpad p mobile workstation gaming fifa efootball';
const ATTRIBUTE_PRIORITY = [
  'model',
  'модел',
  'processor',
  'процесор',
  'memory',
  'памет',
  'storage',
  'диск',
  'display',
  'дисплей',
  'size',
  'размер',
  'color',
  'цвят',
  'grade',
  'състояние',
];

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
  productComparison?: ProductComparison;
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

interface ClientCommandPlan {
  command: string;
  reply: string;
  intent: PublicChatIntent;
  action: string;
  needsLeadDetails?: boolean;
  needsHuman?: boolean;
  reason: string | null;
}

type ProductFamily =
  | 'laptop'
  | 'desktop'
  | 'monitor'
  | 'battery'
  | 'charger'
  | 'display'
  | 'keyboard'
  | 'server_memory';

type CompatibilityNeed = 'battery' | 'charger' | 'display' | 'keyboard';

interface MoneyBudget {
  amount: number;
  currency: 'EUR' | 'BGN' | null;
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

  if (hasDiscountRequest(normalized)) {
    return deterministicResult({
      reply: discountGuardReply(input.locale),
      intent: 'pricing',
      action: 'discount_guard',
      needsLeadDetails: true,
      metadata: {},
      reason: 'Manual discounts cannot be promised in chat',
    });
  }

  if (hasSensitiveDataRequest(normalized)) {
    return deterministicResult({
      reply: sensitiveDataGuardReply(input.locale),
      intent: 'human_handoff',
      action: 'sensitive_data_guard',
      needsLeadDetails: true,
      needsHuman: true,
      metadata: {},
      reason: 'Private customer, payment, or credential data cannot be disclosed in chat',
    });
  }

  const clientCommand = resolveDeterministicClientCommand(normalized);
  if (clientCommand) {
    return deterministicResult({
      reply: clientCommand.reply,
      intent: clientCommand.intent,
      action: clientCommand.action,
      needsLeadDetails: clientCommand.needsLeadDetails,
      needsHuman: clientCommand.needsHuman,
      metadata: { command: clientCommand.command },
      reason: clientCommand.reason,
    });
  }

  if (hasOperationalSupportIntent(normalized)) {
    return deterministicResult({
      reply: operationalSupportGuardReply(input.locale),
      intent: 'human_handoff',
      action: 'operational_support_guard',
      needsLeadDetails: true,
      needsHuman: true,
      metadata: {},
      reason: 'Operational order, payment, delivery, invoice, return, or warranty state requires a connected backend workflow',
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

  const compatibilityNeed = compatibilityNeedForText(text);
  if (compatibilityNeed && !hasCompatibilityAnchor(text, compatibilityNeed)) {
    return deterministicResult({
      reply: compatibilityNeedReply(input.locale, compatibilityNeed),
      intent: 'product_recommendation',
      action: 'compatibility_question',
      needsLeadDetails: false,
      metadata: { compatibilityNeed },
      reason: 'Compatibility request needs exact model, part number, or technical anchor before product suggestions',
    });
  }

  const exactTokens = hasProductComparisonIntent(normalized) ? [] : extractExactProductTokens(text);
  if (exactTokens.length > 0) {
    const exactMatches = filterExactProductTokenMatches(input.productItems ?? [], exactTokens, input.locale);
    if (exactMatches.length === 0) {
      return deterministicResult({
        reply: exactProductMissReply(input.locale, exactTokens),
        intent: 'product_recommendation',
        action: 'exact_product_miss',
        needsLeadDetails: true,
        metadata: { exactTokens },
        reason: 'Exact product token was requested but no catalog product matched',
      });
    }
    const visibleMatches = exactMatches.slice(0, 3).map((product) => ({
      product,
      score: 100,
      reason: exactProductReason(product, input.locale, exactTokens),
    }));
    const cards = visibleMatches.map((match) => productCard(match, input.locale));
    return deterministicResult({
      reply: exactProductReply(input.locale, cards.length),
      intent: 'product_recommendation',
      action: 'exact_product_match',
      metadata: {
        exactTokens,
        productIds: cards.map((card) => card.id),
        productSkus: cards.map((card) => card.sku).filter(Boolean),
        productCount: cards.length,
      },
      productCards: cards,
    });
  }

  const knowledgeMatch = findKnowledgeMatch(input.knowledgeEntries, text, input.locale);
  if (knowledgeMatch && shouldAnswerKnowledgeBeforeProducts(knowledgeMatch, normalized)) {
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

  const productMatches = findProductMatches(input.productItems ?? [], text, input.locale);
  if (productMatches.length > 0 && shouldShowProductMatches(site, normalized, productMatches[0]?.score ?? 0)) {
    const visibleMatches = productMatches.slice(0, 3);
    const cards = visibleMatches.map((match) => productCard(match, input.locale));
    if (hasProductComparisonIntent(normalized) && cards.length >= 2) {
      const comparison = buildProductComparison(visibleMatches, input.locale);
      return deterministicResult({
        reply: productComparisonReply(input.locale, cards.length),
        intent: 'product_comparison',
        action: 'product_comparison',
        metadata: {
          productIds: cards.map((card) => card.id),
          productSkus: cards.map((card) => card.sku).filter(Boolean),
          productCount: cards.length,
          comparisonRows: comparison.rows.map((row) => row.label),
        },
        productCards: cards,
        productComparison: comparison,
      });
    }
    if (hasCommerceHandoffIntent(normalized)) {
      const handoffCards = visibleMatches.map((match) => productCard(match, input.locale, 'checkout_handoff'));
      const hasProductLinks = handoffCards.some((card) => card.productUrl);
      return deterministicResult({
        reply: commerceHandoffReply(input.locale, handoffCards.length, hasProductLinks),
        intent: 'commerce_handoff',
        action: 'checkout_handoff',
        needsLeadDetails: !hasProductLinks,
        metadata: {
          productIds: handoffCards.map((card) => card.id),
          productSkus: handoffCards.map((card) => card.sku).filter(Boolean),
          productCount: handoffCards.length,
        },
        productCards: handoffCards,
        reason: 'Visitor showed cart, checkout, order, or purchase intent for matched products',
      });
    }
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
  const phoneMatch = [...text.matchAll(/\+?\d[\d\s().-]{6,}\d/g)].find((match) =>
    isStandalonePhoneCandidate(text, match.index ?? 0, match[0] ?? ''),
  );
  const phone = phoneMatch?.[0]?.replace(/\s+/g, ' ').trim() ?? null;
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
  const expanded = normalizeSearchText(`${normalized} ${expandProductSearchText(normalized)}`);
  const tokens = new Set(expanded.split(/\s+/).filter((token) => token.length >= 2));
  const requestedFamilies = requestedProductFamilies(normalized);
  const budget = extractMaxBudget(normalized);
  const gamingIntent = isGamingIntent(normalized);
  const cadLaptopIntent = isCadIntent(normalized) && isExplicitLaptopIntent(normalized);

  return products
    .filter((product) => product.enabled)
    .map((product) => {
      const score = productScore(product, normalized, expanded, tokens, requestedFamilies, budget, {
        gamingIntent,
        cadLaptopIntent,
      });
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

export function sanitizeAssistantReply(text: string, locale: LocaleCode = 'bg'): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\b[0-9a-f]{24,32}\b/gi, '[reference]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[reference]')
    .replace(/\b(?:assistant|system)_prompt\b/gi, '')
    .replace(/\b(?:assistant_feedback_(?:helpful|not_helpful)|variant_choose_variant|assistant_new_conversation)\b/gi, '')
    .replace(/\b(?:cart_clear|cart_count|cart_open|checkout_open|conversation_reset)\b/gi, '')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[`*_>#]{1,}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000);
  if (!cleaned || leaksInternalAssistantText(cleaned)) return fallbackQuestion(locale);
  if (leaksOperationalClaim(cleaned)) return assistantSafetyFallback(locale);
  return cleaned;
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
  productComparison?: ProductComparison;
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
    productComparison: input.productComparison,
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
    'Do not claim that you added products to a cart, created an order, reserved stock, charged payment, or completed checkout.',
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
    const safe = sanitizeAssistantReply(result, input.locale);
    return leaksOperationalClaim(safe) ? '' : safe;
  } catch {
    return '';
  }
}

function shouldShowProductMatches(site: Site, normalized: string, topScore: number): boolean {
  if (site.config.mode === 'commerce_readonly' || site.config.mode === 'commerce_actions') return true;
  return topScore >= 8 || hasProductSearchIntent(normalized);
}

function shouldAnswerKnowledgeBeforeProducts(match: KnowledgeMatch, normalized: string): boolean {
  return match.score >= 6 || !hasProductSearchIntent(normalized);
}

function expandProductSearchText(normalized: string): string {
  const expansions = new Set<string>();
  const add = (value: string): void => {
    for (const token of value.split(/\s+/)) {
      if (token.trim()) expansions.add(token.trim());
    }
  };

  if (/(серверн.*памет|server memory|ecc|rdimm|lrdimm|registered memory)/.test(normalized)) {
    add('server memory ecc rdimm lrdimm registered ddr3 ddr4 ddr5 hp dell lenovo');
  }
  if (isCadIntent(normalized)) {
    add('workstation mobile workstation precision zbook thinkpad p quadro rtx nvidia i7 i9 xeon 16gb 32gb');
  }
  if (isGamingIntent(normalized)) {
    add(GAMING_ASSISTANT_QUERY);
  }
  if (/(батерия|battery|baterie|акумулатор)/.test(normalized)) {
    add('battery батерия part number pn fru type модел съвместима original replacement');
  }
  if (/(зарядн|charger|adapter|adaptor|power supply|захранван)/.test(normalized)) {
    add('charger adapter захранване зарядно usb-c type-c 65w 90w 120w 130w 170w 230w connector букса');
  }
  if (/(матриц|display|screen|lcd|екран|дисплеи|дисплей|ecran)/.test(normalized)) {
    add('screen display lcd matrix матрица екран panel pin edp lvds 30pin 40pin');
  }
  if (/(клавиатур|keyboard|tastatur)/.test(normalized)) {
    add('keyboard клавиатура layout backlit подсветка bg us uk');
  }

  return [...expansions].join(' ');
}

function requestedProductFamilies(normalized: string): Set<ProductFamily> {
  const families = new Set<ProductFamily>();
  if (/(серверн.*памет|server memory|ecc memory|rdimm|lrdimm|registered memory)/.test(normalized)) {
    families.add('server_memory');
  }
  if (/(батери|battery|акумулатор)/.test(normalized)) families.add('battery');
  if (/(зарядн|charger|adapter|adaptor|power supply|захранван)/.test(normalized)) families.add('charger');
  if (/(матриц|display|screen|lcd|екран|дисплей)/.test(normalized)) families.add('display');
  if (/(клавиатур|keyboard|tastatur)/.test(normalized)) families.add('keyboard');
  if (/(монитор|monitor)/.test(normalized)) families.add('monitor');
  if (/(настолн|desktop|workstation|работна станция|компютър|computer|pc)\b/.test(normalized) && !isLaptopIntent(normalized)) {
    families.add('desktop');
  }
  if (isExplicitLaptopIntent(normalized)) families.add('laptop');
  return families;
}

function productMatchesRequestedFamily(product: ProductItem, requestedFamilies: Set<ProductFamily>): boolean {
  const productFamilies = inferProductFamilies(product);
  if (productFamilies.size === 0) return false;
  for (const family of requestedFamilies) {
    if (productFamilies.has(family)) return true;
  }
  return false;
}

function inferProductFamilies(product: ProductItem): Set<ProductFamily> {
  const text = productSearchBlob(product);
  const families = new Set<ProductFamily>();
  if (/(серверн.*памет|server memory|ecc|rdimm|lrdimm|registered memory)/.test(text)) families.add('server_memory');
  if (/(батери|battery|акумулатор|l\d{2}c\d+p\d+)/.test(text)) families.add('battery');
  if (/(зарядн|charger|adapter|adaptor|power supply|захранван|usb-c|type-c|\b\d{2,3}w\b)/.test(text)) {
    families.add('charger');
  }
  if (/(матриц|display|screen|lcd|екран|дисплей|edp|lvds|30pin|40pin)/.test(text)) families.add('display');
  if (/(клавиатур|keyboard|tastatur|backlit|подсветка)/.test(text)) families.add('keyboard');
  if (/(монитор|monitor)\b/.test(text)) families.add('monitor');
  if (/(лаптоп|laptop|notebook|thinkpad|latitude|elitebook|probook|zbook|mobile workstation|x1 carbon)/.test(text)) {
    families.add('laptop');
  }
  if (/(настолн|desktop|tower|workstation|работна станция|optiplex|elitedesk|prodesk)\b/.test(text) && !families.has('laptop')) {
    families.add('desktop');
  }
  return families;
}

function productSearchBlob(product: ProductItem): string {
  return normalizeSearchText(
    [
      product.sku,
      product.title,
      product.brand,
      product.category,
      product.description,
      ...product.keywords,
      ...Object.entries(product.attributes).flatMap(([key, value]) => [key, value]),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function extractMaxBudget(normalized: string): MoneyBudget | null {
  const match =
    normalized.match(/\b(?:до|под|under|below|max|maximum|up to)\s*(\d{2,6})(?:\s*(eur|euro|евро|€|bgn|лв|leva))?\b/) ??
    normalized.match(/\b(\d{2,6})\s*(eur|euro|евро|€|bgn|лв|leva)\b/);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: normalizeBudgetCurrency(match[2] ?? null) };
}

function normalizeBudgetCurrency(value: string | null): MoneyBudget['currency'] {
  if (!value) return null;
  if (/^(eur|euro|евро|€)$/i.test(value)) return 'EUR';
  if (/^(bgn|лв|leva)$/i.test(value)) return 'BGN';
  return null;
}

function budgetMatchesProductCurrency(budget: MoneyBudget, productCurrency: string | null): boolean {
  if (!budget.currency || !productCurrency) return true;
  return productCurrency.toUpperCase() === budget.currency;
}

function gamingSuitabilityScore(product: ProductItem): number {
  const text = productSearchBlob(product);
  const hasDedicatedGpu =
    /\b(nvidia|geforce|quadro|rtx|gtx|radeon|firepro)\b/.test(text) ||
    /\b(mx|m)\s?\d{3,4}\b/.test(text) ||
    /\b9[34]0mx\b/.test(text);
  const hasIntegratedOnly = !hasDedicatedGpu && /(intel\s+(uhd|hd|iris)|integrated|вград|встроен|vega\s?\d)/.test(text);

  let score = 0;
  if (/\brtx\s?(a?\d{3,4}|\d{3,4})\b/.test(text)) score += 100;
  if (/\bgtx\s?\d{3,4}\b/.test(text)) score += 85;
  if (/\bquadro\s?(p|t|m|k)\s?\d{3,4}\b/.test(text)) score += 75;
  if (/\bgeforce\b/.test(text)) score += 55;
  if (/\bnvidia\b/.test(text)) score += 45;
  if (/\bradeon|firepro\b/.test(text)) score += 45;
  if (/\b(mx|m)\s?\d{3,4}\b|\b9[34]0mx\b/.test(text)) score += 35;
  if (hasIntegratedOnly) score -= 70;
  if (/\b(precision|zbook|thinkpad\s+p|thinkpad\s+w|mobile\s+workstation)\b/.test(text)) score += 28;
  if (/\b(i7|i9|xeon|ryzen\s?[79])\b/.test(text)) score += 14;
  if (/\b(i5|ryzen\s?5)\b/.test(text)) score += 6;
  if (/\b(hq|hk|h)\b/.test(text)) score += 6;
  if (/\b(32|64|128)\s?gb\s+(ddr|ram|оператив|memory)/.test(text)) score += 12;
  if (/\b16\s?gb\s+(ddr|ram|оператив|memory)/.test(text)) score += 8;
  return score;
}

function cadSuitabilityScore(product: ProductItem): number {
  const text = productSearchBlob(product);
  let score = 0;
  if (/\b(precision|zbook|thinkpad\s+p|mobile\s+workstation|workstation)\b/.test(text)) score += 60;
  if (/\b(quadro|rtx|nvidia|radeon pro|firepro)\b/.test(text)) score += 40;
  if (/\b(i7|i9|xeon|ryzen\s?[79])\b/.test(text)) score += 16;
  if (/\b(32|64|128)\s?gb\s+(ddr|ram|оператив|memory)/.test(text)) score += 14;
  if (/\b16\s?gb\s+(ddr|ram|оператив|memory)/.test(text)) score += 8;
  return score;
}

function productScore(
  product: ProductItem,
  originalNormalized: string,
  normalized: string,
  tokens: Set<string>,
  requestedFamilies: Set<ProductFamily>,
  budget: MoneyBudget | null,
  context: { gamingIntent: boolean; cadLaptopIntent: boolean },
): number {
  if (requestedFamilies.size > 0 && !productMatchesRequestedFamily(product, requestedFamilies)) return 0;
  if (budget && product.price !== null && product.price > budget.amount && budgetMatchesProductCurrency(budget, product.currency)) {
    return 0;
  }

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
  if (context.gamingIntent) score += gamingSuitabilityScore(product);
  if (context.cadLaptopIntent) score += cadSuitabilityScore(product);
  if (hasProductSearchIntent(originalNormalized) && score > 0) score += 2;
  return score;
}

function productCard(match: ProductMatch, locale: LocaleCode, action: ProductCard['action'] = 'view_product'): ProductCard {
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
    action,
    actionLabel: productActionLabel(action, locale),
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

function productComparisonReply(locale: LocaleCode, count: number): string {
  if (locale === 'bg') {
    return `Сравних ${count} продукта от каталога по наличните данни. Ако липсва детайл, не е бил подаден във фийда.`;
  }
  return `I compared ${count} products from the catalog using the available feed data. Missing details were not supplied in the feed.`;
}

function commerceHandoffReply(locale: LocaleCode, count: number, hasProductLinks: boolean): string {
  if (!hasProductLinks) {
    return locale === 'bg'
      ? 'Намерих подходящ продукт, но във фийда няма линк за продължаване към покупка. Оставете email или телефон и екипът може да помогне.'
      : 'I found a matching product, but the feed does not include a link to continue the purchase. Please leave an email or phone number and the team can help.';
  }
  if (locale === 'bg') {
    return count === 1
      ? 'Мога да ви насоча към продукта, но не мога да добавям в количка или да завършвам поръчка от чата. Отворете продукта от бутона в картата.'
      : `Мога да ви насоча към тези ${count} продукта, но не мога да добавям в количка или да завършвам поръчка от чата. Отворете желания продукт от картите.`;
  }
  return count === 1
    ? 'I can route you to the product, but I cannot add items to a cart or complete checkout in chat. Open the product from the card button.'
    : `I can route you to these ${count} products, but I cannot add items to a cart or complete checkout in chat. Open the product you want from the cards.`;
}

function buildProductComparison(matches: ProductMatch[], locale: LocaleCode): ProductComparison {
  const products = matches.map((match) => match.product);
  const emptyValue = comparisonEmptyValue(locale);
  const rows: ProductComparisonRow[] = [
    comparisonRow(comparisonLabel(locale, 'price'), products, (product) =>
      product.price === null ? null : priceLabel(product.price, product.currency),
      emptyValue,
    ),
    comparisonRow(comparisonLabel(locale, 'availability'), products, (product) => availabilityLabel(product.availability, locale), emptyValue),
    comparisonRow(comparisonLabel(locale, 'brand'), products, (product) => product.brand, emptyValue),
    comparisonRow(comparisonLabel(locale, 'category'), products, (product) => product.category, emptyValue),
    comparisonRow(comparisonLabel(locale, 'description'), products, (product) => product.description, emptyValue),
  ];
  for (const key of comparisonAttributeKeys(products).slice(0, 6)) {
    rows.push(comparisonRow(formatAttributeLabel(key, locale), products, (product) => product.attributes[key] ?? null, emptyValue));
  }
  return {
    title: locale === 'bg' ? 'Сравнение на продукти' : 'Product comparison',
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.sku,
    })),
    rows: rows.filter((row) => row.values.some((value) => value.value !== emptyValue)).slice(0, 10),
  };
}

function comparisonRow(
  label: string,
  products: ProductItem[],
  value: (product: ProductItem) => string | null,
  emptyValue: string,
): ProductComparisonRow {
  return {
    label,
    values: products.map((product) => ({
      productId: product.id,
      value: value(product) ?? emptyValue,
    })),
  };
}

function comparisonAttributeKeys(products: ProductItem[]): string[] {
  const keys = new Set<string>();
  for (const product of products) {
    for (const [key, value] of Object.entries(product.attributes)) {
      if (value.trim()) keys.add(key);
    }
  }
  return [...keys].sort((a, b) => attributePriority(a) - attributePriority(b) || a.localeCompare(b));
}

function attributePriority(key: string): number {
  const normalized = normalizeSearchText(key).replace(/\s+/g, '_');
  const index = ATTRIBUTE_PRIORITY.indexOf(normalized);
  return index >= 0 ? index : ATTRIBUTE_PRIORITY.length;
}

function formatAttributeLabel(key: string, locale: LocaleCode): string {
  const normalized = normalizeSearchText(key).replace(/\s+/g, '_');
  if (normalized === 'memory' || normalized === 'памет') return locale === 'bg' ? 'Памет' : 'Memory';
  if (normalized === 'storage' || normalized === 'диск') return locale === 'bg' ? 'Диск' : 'Storage';
  if (normalized === 'processor' || normalized === 'процесор') return locale === 'bg' ? 'Процесор' : 'Processor';
  if (normalized === 'display' || normalized === 'дисплей') return locale === 'bg' ? 'Дисплей' : 'Display';
  if (normalized === 'model' || normalized === 'модел') return locale === 'bg' ? 'Модел' : 'Model';
  if (normalized === 'size' || normalized === 'размер') return locale === 'bg' ? 'Размер' : 'Size';
  if (normalized === 'color' || normalized === 'цвят') return locale === 'bg' ? 'Цвят' : 'Color';
  if (normalized === 'grade' || normalized === 'състояние') return locale === 'bg' ? 'Състояние' : 'Grade';
  return key.replace(/_/g, ' ');
}

function comparisonLabel(locale: LocaleCode, key: 'price' | 'availability' | 'brand' | 'category' | 'description'): string {
  if (locale === 'bg') {
    if (key === 'price') return 'Цена';
    if (key === 'availability') return 'Наличност';
    if (key === 'brand') return 'Марка';
    if (key === 'category') return 'Категория';
    return 'Описание';
  }
  if (key === 'price') return 'Price';
  if (key === 'availability') return 'Availability';
  if (key === 'brand') return 'Brand';
  if (key === 'category') return 'Category';
  return 'Description';
}

function availabilityLabel(value: ProductItem['availability'], locale: LocaleCode): string {
  if (locale === 'bg') {
    if (value === 'in_stock') return 'Наличен';
    if (value === 'out_of_stock') return 'Изчерпан';
    if (value === 'preorder') return 'Предварителна поръчка';
    return 'По запитване';
  }
  if (value === 'in_stock') return 'In stock';
  if (value === 'out_of_stock') return 'Out of stock';
  if (value === 'preorder') return 'Preorder';
  return 'On request';
}

function comparisonEmptyValue(locale: LocaleCode): string {
  return locale === 'bg' ? 'Не е посочено' : 'Not specified';
}

function productActionLabel(action: ProductCard['action'], locale: LocaleCode): string | null {
  if (action === 'checkout_handoff') return locale === 'bg' ? 'Към продукта' : 'Continue';
  return null;
}

function productReason(product: ProductItem, locale: LocaleCode, normalized: string): string {
  if (product.sku && normalized.includes(normalizeSearchText(product.sku))) {
    return locale === 'bg' ? `Съвпада със SKU ${product.sku}.` : `Matches SKU ${product.sku}.`;
  }
  if (isGamingIntent(normalized)) {
    return locale === 'bg'
      ? 'Подходящ кандидат за леки игри според наличните GPU/работна станция данни.'
      : 'Good candidate for light gaming based on the available GPU/workstation data.';
  }
  if (isCadIntent(normalized)) {
    return locale === 'bg'
      ? 'Подходящ кандидат за CAD според наличните workstation/GPU данни.'
      : 'Good candidate for CAD based on the available workstation/GPU data.';
  }
  if (product.brand && normalized.includes(normalizeSearchText(product.brand))) {
    return locale === 'bg' ? `Съвпада с марка ${product.brand}.` : `Matches brand ${product.brand}.`;
  }
  if (product.category && normalized.includes(normalizeSearchText(product.category))) {
    return locale === 'bg' ? `Съвпада с категория ${product.category}.` : `Matches category ${product.category}.`;
  }
  return locale === 'bg' ? 'Съвпада с търсенето ви.' : 'Matches your search.';
}

function extractExactProductTokens(text: string): string[] {
  const tokens = new Set<string>();
  const addToken = (value: string | undefined): void => {
    const token = value?.trim();
    if (!token || !looksLikeExactProductToken(token, text)) return;
    tokens.add(token);
  };

  for (const match of text.matchAll(/\b(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9][a-z0-9-]{4,}\b/gi)) {
    addToken(match[0]);
  }
  for (const match of text.matchAll(/(?:#|№|код|code|sku|pn|p\/n|part\s*number|part\s*no\.?)\s*([a-z0-9-]{4,})/gi)) {
    addToken(match[1]);
  }

  return [...tokens].slice(0, MAX_EXACT_PRODUCT_TOKENS);
}

function looksLikeExactProductToken(token: string, sourceText: string): boolean {
  const compact = normalizeExactToken(token);
  if (compact.length < 5) return false;
  if (!/[a-z]/.test(compact) || !/\d/.test(compact)) return false;

  const normalizedSource = normalizeSearchText(sourceText);
  const hasExactContext =
    /(part|p\/n|pn|sku|код|модел|батери|battery|зарядн|charger|клавиатур|keyboard|матриц|display|screen)/.test(
      normalizedSource,
    );
  if (hasExactContext) return true;

  if (/^(?:i[3579]|rtx|gtx|mx|uhd|iris|xeon|ddr)\d/i.test(compact)) return false;
  if (/^a\d{3,4}$/i.test(compact)) return false;
  const letters = compact.replace(/[^a-z]/g, '').length;
  const digits = compact.replace(/\D/g, '').length;
  return compact.length >= 7 && letters >= 2 && digits >= 2;
}

function filterExactProductTokenMatches(products: ProductItem[], exactTokens: string[], locale: LocaleCode): ProductItem[] {
  const normalizedTokens = exactTokens.map((token) => normalizeExactToken(token));
  return products
    .filter((product) => product.enabled)
    .filter((product) => {
      const text = productExactSearchText(product, locale);
      return normalizedTokens.some((token) => token && text.includes(token));
    })
    .sort((a, b) => availabilityRank(a.availability) - availabilityRank(b.availability));
}

function productExactSearchText(product: ProductItem, locale: LocaleCode): string {
  const parts = [
    product.sku,
    product.title,
    product.brand,
    product.category,
    product.description,
    product.productUrl,
    locale,
    ...product.keywords,
    ...Object.entries(product.attributes).flatMap(([key, value]) => [key, value]),
  ];
  return normalizeExactToken(parts.filter(Boolean).join(' '));
}

function normalizeExactToken(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function exactProductReason(product: ProductItem, locale: LocaleCode, exactTokens: string[]): string {
  const token = exactTokens.find((value) => productExactSearchText(product, locale).includes(normalizeExactToken(value))) ?? exactTokens[0];
  return locale === 'bg' ? `Съвпада с точен код ${token}.` : `Matches exact code ${token}.`;
}

function exactProductReply(locale: LocaleCode, count: number): string {
  if (locale === 'bg') {
    return count === 1
      ? 'Намерих точен продукт по подадения код. Проверете варианта, наличността и детайлите в картата.'
      : `Намерих ${count} продукта по подадения код. Проверете варианта, наличността и детайлите в картите.`;
  }
  return count === 1
    ? 'I found an exact product for that code. Check the variant, availability, and details in the card.'
    : `I found ${count} products for that code. Check the variant, availability, and details in the cards.`;
}

function exactProductMissReply(locale: LocaleCode, exactTokens: string[]): string {
  const code = exactTokens[0] ?? '';
  if (locale === 'bg') {
    return `Не открих точен продукт по код ${code}. Няма да показвам несвързани продукти. Изпратете точния модел, SKU/part number или оставете контакт, за да го проверим.`;
  }
  return `I did not find an exact product for code ${code}. I will not show unrelated products. Send the exact model, SKU/part number, or leave contact details so the team can check it.`;
}

function compatibilityNeedForText(text: string): CompatibilityNeed | null {
  const normalized = normalizeSearchText(text);
  if (/(батери|battery|акумулатор)/.test(normalized)) return 'battery';
  if (/(зарядн|charger|adapter|adaptor|power supply|захранван)/.test(normalized)) return 'charger';
  if (/(матриц|display|screen|lcd|екран|дисплей)/.test(normalized)) return 'display';
  if (/(клавиатур|keyboard|tastatur)/.test(normalized)) return 'keyboard';
  return null;
}

function hasCompatibilityAnchor(text: string, need: CompatibilityNeed): boolean {
  const normalized = normalizeSearchText(text);
  if (!normalized) return false;
  if (extractExactProductTokens(text).length > 0) return true;

  const modelAnchor =
    /\b(?:thinkpad|latitude|precision|xps|inspiron|vostro|elitebook|probook|zbook|pavilion|ideapad|yoga|vivobook|zenbook|aspire|travelmate|macbook|surface)\s+[a-z0-9][a-z0-9 -]{1,30}\b/.test(
      normalized,
    ) ||
    /\bx1\s+carbon\b/.test(normalized) ||
    /\b(?:t|x|p|l|e|w|g)\d{2,3}[a-z]?(?:\s+gen\s+\d{1,2})?\b/.test(normalized) ||
    /\b[a-z]{1,6}\d{3,5}[a-z0-9-]*\b/.test(normalized) ||
    /\ba\d{4}\b/.test(normalized);
  if (modelAnchor) return true;

  if (need === 'charger') {
    return /\b(?:usb-c|type-c|65w|90w|120w|130w|135w|170w|230w|20v|19\.5v|7\.4x5\.0|4\.5x3\.0|5\.5x2\.5)\b/.test(
      normalized,
    );
  }
  if (need === 'display') {
    return /\b(?:11\.6|12\.5|13\.3|14|15\.6|16|17\.3)\s*(?:inch|инч|")\b/.test(normalized);
  }
  return false;
}

function compatibilityNeedReply(locale: LocaleCode, need: CompatibilityNeed): string {
  if (locale === 'en') {
    if (need === 'charger') return 'To check charger compatibility safely, send the exact laptop model or the charger wattage and connector type.';
    if (need === 'display') return 'To check screen compatibility safely, send the exact laptop model or the panel size, connector, and pin count.';
    if (need === 'keyboard') return 'To check keyboard compatibility safely, send the exact laptop model, layout, and whether it needs backlight.';
    return 'To check battery compatibility safely, send the exact laptop model or the battery part number.';
  }
  if (need === 'charger') {
    return 'За да проверя съвместимост на зарядно безопасно, изпратете точния модел на лаптопа или мощност и тип букса.';
  }
  if (need === 'display') {
    return 'За да проверя съвместимост на матрица безопасно, изпратете точния модел на лаптопа или размер, конектор и брой пинове.';
  }
  if (need === 'keyboard') {
    return 'За да проверя съвместимост на клавиатура безопасно, изпратете точния модел на лаптопа, layout и дали трябва подсветка.';
  }
  return 'За да проверя съвместимост на батерия безопасно, изпратете точния модел на лаптопа или part number на батерията.';
}

function resolveDeterministicClientCommand(normalized: string): ClientCommandPlan | null {
  if (!normalized) return null;
  if (hasConversationResetIntent(normalized)) {
    return {
      command: 'conversation_reset',
      reply: clientCommandReply('conversation_reset', normalized),
      intent: 'greeting',
      action: 'conversation_reset_request',
      reason: 'Visitor asked to start a new conversation',
    };
  }
  if (hasCartClearIntent(normalized)) {
    return {
      command: 'cart_clear',
      reply: clientCommandReply('cart_clear', normalized),
      intent: 'commerce_handoff',
      action: 'cart_clear_request',
      reason: 'Cart clear needs storefront execution and confirmation',
    };
  }
  if (hasCartCountIntent(normalized)) {
    return {
      command: 'cart_count',
      reply: clientCommandReply('cart_count', normalized),
      intent: 'commerce_handoff',
      action: 'cart_count_request',
      reason: 'Cart count needs storefront state',
    };
  }
  if (hasCartItemMutationIntent(normalized)) {
    return {
      command: 'cart_edit',
      reply: clientCommandReply('cart_edit', normalized),
      intent: 'commerce_handoff',
      action: 'cart_item_mutation_unsupported',
      reason: 'Editing a cart row from text alone is ambiguous',
    };
  }
  if (hasCartOpenIntent(normalized)) {
    return {
      command: 'cart_open',
      reply: clientCommandReply('cart_open', normalized),
      intent: 'commerce_handoff',
      action: 'cart_open_request',
      reason: 'Visitor asked to open the cart',
    };
  }
  if (hasCheckoutOpenIntent(normalized)) {
    return {
      command: 'checkout_open',
      reply: clientCommandReply('checkout_open', normalized),
      intent: 'commerce_handoff',
      action: 'checkout_open_request',
      reason: 'Visitor asked to open checkout',
    };
  }
  if (hasReturnRequestIntent(normalized)) {
    return {
      command: 'return_request',
      reply: clientCommandReply('return_request', normalized),
      intent: 'human_handoff',
      action: 'return_request_guard',
      needsLeadDetails: true,
      needsHuman: true,
      reason: 'Return requests need authenticated order context',
    };
  }
  if (hasWarrantyRequestIntent(normalized)) {
    return {
      command: 'warranty_request',
      reply: clientCommandReply('warranty_request', normalized),
      intent: 'human_handoff',
      action: 'warranty_request_guard',
      needsLeadDetails: true,
      needsHuman: true,
      reason: 'Warranty requests need authenticated order context',
    };
  }
  if (hasOrdersOpenIntent(normalized)) {
    return {
      command: 'orders_open',
      reply: clientCommandReply('orders_open', normalized),
      intent: 'human_handoff',
      action: 'orders_open_guard',
      needsLeadDetails: true,
      needsHuman: true,
      reason: 'Order views need authenticated customer context',
    };
  }
  if (hasInvoicesOpenIntent(normalized)) {
    return {
      command: 'invoices_open',
      reply: clientCommandReply('invoices_open', normalized),
      intent: 'human_handoff',
      action: 'invoices_open_guard',
      needsLeadDetails: true,
      needsHuman: true,
      reason: 'Invoice views need authenticated customer context',
    };
  }
  return null;
}

function clientCommandReply(command: string, normalized: string): string {
  const isEnglish = /\b(cart|basket|checkout|order|invoice|return|warranty|new conversation|start over)\b/.test(normalized);
  if (isEnglish) {
    if (command === 'conversation_reset') return 'Starting a new conversation. What are you looking for?';
    if (command === 'cart_clear') {
      return 'I can request cart clearing only through the connected storefront and I must wait for a real success confirmation before confirming the result.';
    }
    if (command === 'cart_count') return 'I can check the real cart only through the connected storefront state.';
    if (command === 'cart_edit') return 'I cannot safely edit a cart row from chat text alone. Open the cart and choose the exact item there.';
    if (command === 'cart_open') return 'I can open the cart in a connected storefront. This demo records the guarded handoff.';
    if (command === 'checkout_open') return 'I can open checkout in a connected storefront. This demo records the guarded handoff.';
    if (command === 'return_request') return 'A return request must be tied to a real authenticated order. Sign in and open the order, or leave contact details for support.';
    if (command === 'warranty_request') return 'Warranty help must be tied to a real order or product serial. Sign in and open the order, or leave contact details for support.';
    if (command === 'orders_open') return 'Order status and tracking require an authenticated customer profile. Sign in and open your orders.';
    if (command === 'invoices_open') return 'Invoices require an authenticated customer profile. Sign in and open your invoices.';
  }

  if (command === 'conversation_reset') return 'Започваме нов разговор. Какво търсите?';
  if (command === 'cart_clear') {
    return 'Мога да поискам изчистване на количката само през свързания storefront и трябва да изчакам реално потвърждение за успех, преди да потвърдя резултата.';
  }
  if (command === 'cart_count') return 'Мога да проверя реалната количка само през свързаното състояние на storefront-а.';
  if (command === 'cart_edit') {
    return 'Не мога безопасно да редактирам ред от количката само по текст в чата. Отворете количката и изберете точния артикул там.';
  }
  if (command === 'cart_open') return 'Мога да отворя количката при свързан storefront. В това демо записвам защитения handoff.';
  if (command === 'checkout_open') return 'Мога да отворя checkout при свързан storefront. В това демо записвам защитения handoff.';
  if (command === 'return_request') {
    return 'Заявка за връщане трябва да е към реална поръчка в автентикиран профил. Влезте в профила и отворете поръчката или оставете контакт за support.';
  }
  if (command === 'warranty_request') {
    return 'Гаранционна помощ трябва да е към реална поръчка или сериен номер. Влезте в профила и отворете поръчката или оставете контакт за support.';
  }
  if (command === 'orders_open') return 'Статус и проследяване на поръчки изискват автентикиран клиентски профил. Влезте и отворете поръчките си.';
  if (command === 'invoices_open') return 'Фактурите изискват автентикиран клиентски профил. Влезте и отворете фактурите си.';
  return 'Това действие трябва да мине през свързан storefront или backend, преди да бъде потвърдено.';
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

function hasProductComparisonIntent(normalized: string): boolean {
  return /\b(compare|comparison|versus|vs|difference|differences|better)\b/i.test(normalized)
    || /(сравни|сравнение|разлика|разлики|по[-\s]?доб)/i.test(normalized);
}

function hasCommerceHandoffIntent(normalized: string): boolean {
  return /\b(buy|purchase|order|checkout|cart|basket|add to cart|reserve)\b/i.test(normalized)
    || /(купи|купя|купувам|поръчай|поръчка|поръчам|количка|кошница|плащане|резервирай)/i.test(normalized);
}

function isGamingIntent(text: string): boolean {
  return /(\bfifa\b|\bfc\s?2\d\b|efootball|pes|gaming|game|gamer|fortnite|valorant|counter|cs\s?2|minecraft|gta|игр|гейм|фифа|цъкам|цъка|играя)/.test(
    text,
  );
}

function isLaptopIntent(text: string): boolean {
  return /(лаптоп|notebook|laptop|mobile workstation|zbook|precision|thinkpad)/.test(text);
}

function isExplicitLaptopIntent(text: string): boolean {
  return /(лаптоп|notebook|laptop|mobile workstation)/.test(text);
}

function isCadIntent(text: string): boolean {
  return /(autocad|solidworks|cad|3d|архитект|проектир|рендер)/.test(text);
}

function hasConversationResetIntent(normalized: string): boolean {
  return /(^|\b)(нов разговор|нова тема|започни отначало|изчисти чата|reset conversation|new conversation|start over|restart chat)(\b|$)/.test(
    normalized,
  );
}

function hasCartTarget(normalized: string): boolean {
  return /(количк|кошниц|cart|basket)/.test(normalized);
}

function hasCartClearIntent(normalized: string): boolean {
  if (!hasCartTarget(normalized)) return false;
  return (
    /(изпразн|изчист|изтрии|изтрий|премахни всичк|махни всичк|извади всичк)/.test(normalized) ||
    /\b(?:empty|clear)\s+(?:my\s+|the\s+|this\s+)?(?:cart|basket)\b/.test(normalized) ||
    /\b(?:remove|delete)\s+all\s+(?:items\s+)?(?:from\s+)?(?:my\s+|the\s+)?(?:cart|basket)\b/.test(normalized)
  );
}

function hasCartCountIntent(normalized: string): boolean {
  if (!hasCartTarget(normalized)) return false;
  return /(колко|брой|има ли|какво има|count|how many|what is in|show)/.test(normalized);
}

function hasCartItemMutationIntent(normalized: string): boolean {
  if (!hasCartTarget(normalized)) return false;
  return /(премахни|махни|намали|увеличи|смени|промени|remove|delete|increase|decrease|change quantity|edit)/.test(
    normalized,
  );
}

function hasCartOpenIntent(normalized: string): boolean {
  if (!hasCartTarget(normalized)) return false;
  return /(отвори|покажи|виж|go to|open|show)/.test(normalized);
}

function hasCheckoutOpenIntent(normalized: string): boolean {
  return /\b(checkout|payment page)\b/.test(normalized) || /(отвори.*поръчк|към поръчка|завършване на поръчк|плащане)/.test(normalized);
}

function hasReturnRequestIntent(normalized: string): boolean {
  return /(заявка за връщане|връщане на продукт|искам да върна|върна продукт|return request|return product|refund request)/.test(
    normalized,
  );
}

function hasWarrantyRequestIntent(normalized: string): boolean {
  return /(гаранц|warranty|rma|сервизна заявка)/.test(normalized);
}

function hasOrdersOpenIntent(normalized: string): boolean {
  return /(поръчките ми|моите поръчки|статус на поръчк|проследи поръчк|товарителница|my orders|order status|track order|tracking)/.test(
    normalized,
  );
}

function hasInvoicesOpenIntent(normalized: string): boolean {
  return /(фактурите ми|моята фактура|invoice|invoices|proforma|проформа)/.test(normalized);
}

function leadReply(site: Site, locale: LocaleCode, contact: ContactDetails): string {
  if (contact.email || contact.phone) {
    return locale === 'bg'
      ? 'Благодаря. Записах контактните ви данни и екипът може да се свърже с вас.'
      : 'Thanks. I captured your contact details and the team can follow up.';
  }
  return site.config.leadCapturePrompt;
}

function discountGuardReply(locale: LocaleCode): string {
  if (locale === 'en') {
    return 'I can explain active plans and promotions, but I cannot promise a manual discount in chat. Share the website, expected traffic, and integration needs, and the team can prepare a concrete offer.';
  }
  return 'Мога да обясня активните планове и промоции, но не мога да обещая ръчна отстъпка в чата. Изпратете сайта, очаквания трафик и нужните интеграции, за да подготвим конкретна оферта.';
}

function sensitiveDataGuardReply(locale: LocaleCode): string {
  if (locale === 'en') {
    return 'I cannot disclose customer payment details, passwords, tokens, or private data in chat. A production assistant must route that through authenticated account screens or staff review.';
  }
  return 'Не мога да разкривам платежни данни, пароли, токени или лични данни в чата. В production асистентът трябва да насочва такива случаи през защитен профил или преглед от екип.';
}

function operationalSupportGuardReply(locale: LocaleCode): string {
  if (locale === 'en') {
    return 'For real order, payment, delivery, invoice, return, warranty, or cancellation status, the assistant must use the connected backend and authenticated customer context. In this demo I can explain the guarded workflow and collect contact details for the team.';
  }
  return 'За реален статус на поръчка, плащане, доставка, фактура, връщане, гаранция или отказ асистентът трябва да използва свързан backend и автентикиран клиентски профил. В това демо мога да обясня защитения процес и да събера контакт за екипа.';
}

function assistantSafetyFallback(locale: LocaleCode): string {
  if (locale === 'en') {
    return 'I cannot confirm cart, order, return, refund, payment, or delivery actions only from a chat message. A production assistant must wait for the connected website or backend to confirm the action first.';
  }
  return 'Не мога да потвърдя действие по количка, поръчка, връщане, възстановяване, плащане или доставка само от съобщение в чата. Production асистентът трябва първо да получи потвърждение от свързания сайт или backend.';
}

function fallbackQuestion(locale: LocaleCode): string {
  if (locale === 'en') return 'What would you like the assistant to help with?';
  return 'С какво искате да помогне асистентът?';
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

function isStandalonePhoneCandidate(text: string, startIndex: number, value: string): boolean {
  const before = text[startIndex - 1] ?? '';
  const after = text[startIndex + value.length] ?? '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return !isIdentifierCharacter(before) && !isIdentifierCharacter(after);
}

function isIdentifierCharacter(value: string): boolean {
  return /^[\p{L}\p{N}_-]$/u.test(value);
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

function hasDiscountRequest(normalized: string): boolean {
  return /(\d{1,2}\s*%|percent|percentage|discount|coupon|promo code|voucher|отстъпк|процент|купон|промо\s*код|код за отстъпка)/.test(
    normalized,
  );
}

function hasSensitiveDataRequest(normalized: string): boolean {
  const asksForPrivateSubject =
    /(customer|client|user|buyer|other person|another customer|клиент|потребител|купувач|чужд|друг човек|друг клиент)/.test(
      normalized,
    );
  const asksForSecret =
    /(card number|credit card|debit card|password|token|secret|iban|personal data|payment details|банков.*карт|карт.*номер|парол|токен|тайн|iban|егн|личн.*данн|платежни данн)/.test(
      normalized,
    );
  return asksForPrivateSubject && asksForSecret;
}

function hasOperationalSupportIntent(normalized: string): boolean {
  const hasOrderSubject =
    /\b(my order|my cart|cart action|clear cart|empty cart|add to cart|order status|track my|tracking number|my shipment|invoice for order|proforma for order|refund my|return my order|warranty claim|cancel order|payment status)\b/.test(
      normalized,
    ) ||
    /(моята количка|кошницата ми|изпразни количк|изпразни кошниц|добави в количк|поръчката ми|моята поръчка|статус на поръчк|проследяване на поръчк|товарителница|моята пратка|фактура за поръчк|проформа за поръчк|връщане на поръчк|гаранционна заявка|откажи поръчк|отмени поръчк|статус на плащане)/.test(
      normalized,
    );
  const hasReference = /#[a-z0-9-]{4,}|\border\s*[#:]?\s*[a-z0-9-]{4,}|поръчк[а-я\s#:-]*[a-z0-9-]{4,}/.test(
    normalized,
  );
  const hasOperationalVerb =
    /(track|cancel|refund|return|invoice|proforma|warranty|delivery|shipment|paid|payment|анулир|отмен|отказ|върн|връщ|фактур|проформ|гаранц|достав|плащ|платен|пратк|товарителн)/.test(
      normalized,
    );
  return hasOrderSubject || (hasReference && hasOperationalVerb);
}

function leaksInternalAssistantText(text: string): boolean {
  const normalized = normalizeSearchText(text).replace(/\s+/g, '');
  return (
    /assistant_feedback_(?:helpful|not_helpful)|variant_choose_variant|assistant_new_conversation|cart_clear|cart_count|cart_open|checkout_open|conversation_reset/i.test(
      text,
    ) ||
    /assistantfeedback(?:helpful|nothelpful)|variantchoosevariant|assistantnewconversation|cartclear|cartcount|cartopen|checkoutopen|conversationreset/.test(
      normalized,
    )
  );
}

function leaksOperationalClaim(text: string): boolean {
  const normalized = normalizeSearchText(text);
  if (
    /(не|not|no|cannot|can't|не мога|няма как|must not|should not).{0,42}(added|добав|cancel|анулир|отмен|paid|плат|refund|връщ|изпразн|clear)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return (
    /(i (added|created|cancelled|canceled|refunded|paid|changed|cleared|emptied)|already added|added to cart|cart is empty|order is shipped|payment is confirmed|refund approved|return approved)/.test(
      normalized,
    ) ||
    /(добавих|създадох|анулирах|отмених|изпразних|изчистих|платено|изпратена е|поръчката е анулирана|поръчката е отменена|връщането е одобрено|възстановяването е одобрено)/.test(
      normalized,
    )
  );
}

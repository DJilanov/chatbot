export type LocaleCode = 'bg' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'ro' | 'el' | 'ru';

export type AssistantMode = 'lead' | 'commerce_readonly' | 'commerce_actions' | 'support';

export type ChatRole = 'user' | 'assistant' | 'system';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost' | 'spam';

export type SupportTicketStatus =
  | 'new'
  | 'waiting_customer'
  | 'waiting_staff'
  | 'resolved'
  | 'blocked';

export type ActionStatus =
  | 'answered'
  | 'pending_customer'
  | 'pending_staff'
  | 'completed'
  | 'failed'
  | 'blocked';

export type ActionConfidence = 'deterministic' | 'ai' | 'customer_click' | 'system';

export type PublicChatIntent =
  | 'greeting'
  | 'knowledge_answer'
  | 'lead_capture'
  | 'human_handoff'
  | 'pricing'
  | 'fallback'
  | 'ai_answer';

export type BillingPlanId = 'starter' | 'growth' | 'commerce' | 'managed';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';

export type OrganizationRole = 'owner' | 'admin' | 'support' | 'viewer';

export type BillingMetricKey =
  | 'sites'
  | 'knowledgeEntries'
  | 'monthlyConversations'
  | 'monthlyMessages'
  | 'monthlyLeads';

export interface PlanLimits {
  sites: number | null;
  knowledgeEntries: number | null;
  monthlyConversations: number | null;
  monthlyMessages: number | null;
  monthlyLeads: number | null;
}

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  monthlyPriceUsd: number | null;
  description: string;
  limits: PlanLimits;
  features: string[];
}

export interface OrganizationBilling {
  planId: BillingPlanId;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

export interface BillingMetricUsage {
  key: BillingMetricKey;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  exceeded: boolean;
}

export interface BillingSummary {
  organizationId: string;
  plan: BillingPlan;
  billing: OrganizationBilling;
  canUseService: boolean;
  blockReason: string | null;
  metrics: BillingMetricUsage[];
}

export interface Organization {
  id: string;
  name: string;
  billing: OrganizationBilling;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  tokenHash: string;
  disabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationUserView {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  disabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationUserCreateResponse {
  user: OrganizationUserView;
  token: string;
}

export interface AdminMeResponse {
  kind: 'bootstrap' | 'user';
  user: OrganizationUserView | null;
}

export interface SiteDataExport {
  site: Site;
  exportedAt: string;
  conversations: Conversation[];
  messages: ChatMessage[];
  leads: Lead[];
  supportTickets: SupportTicket[];
  actionLogs: ActionLog[];
  usageEvents: UsageEvent[];
}

export interface PrivacyEraseRequest {
  email?: string;
  phone?: string;
  visitorId?: string;
  conversationId?: string;
  reason?: string;
}

export interface PrivacyEraseResponse {
  siteId: string;
  erasedAt: string;
  matchedConversationIds: string[];
  leadsAnonymized: number;
  conversationsAnonymized: number;
  messagesAnonymized: number;
  supportTicketsAnonymized: number;
  actionLogsAnonymized: number;
}

export interface RetentionRunResponse {
  siteId: string;
  retentionDays: number;
  cutoff: string;
  deleted: {
    conversations: number;
    messages: number;
    leads: number;
    supportTickets: number;
    actionLogs: number;
    usageEvents: number;
  };
}

export interface SiteBranding {
  assistantName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  launcherPosition: 'bottom-right' | 'bottom-left';
  logoUrl: string | null;
}

export interface SiteContact {
  email: string | null;
  phone: string | null;
  bookingUrl: string | null;
}

export interface SitePrivacy {
  privacyUrl: string | null;
  retentionDays: number;
  collectConsent: boolean;
}

export interface SiteIntegrations {
  leadWebhookUrl: string | null;
  supportWebhookUrl: string | null;
}

export interface SiteLocalizedConfig {
  branding?: Partial<Pick<SiteBranding, 'assistantName' | 'title' | 'subtitle'>>;
  welcomeMessage?: string;
  fallbackMessage?: string;
  pricingMessage?: string;
  handoffMessage?: string;
  leadCapturePrompt?: string;
  systemPrompt?: string;
}

export interface SiteConfig {
  defaultLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  mode: AssistantMode;
  websiteUrl: string | null;
  allowedDomains: string[];
  branding: SiteBranding;
  contact: SiteContact;
  privacy: SitePrivacy;
  integrations: SiteIntegrations;
  welcomeMessage: string;
  fallbackMessage: string;
  pricingMessage: string;
  handoffMessage: string;
  leadCapturePrompt: string;
  systemPrompt: string;
  localized?: Partial<Record<LocaleCode, SiteLocalizedConfig>>;
}

export interface Site {
  id: string;
  organizationId: string;
  name: string;
  publicToken: string;
  enabled: boolean;
  config: SiteConfig;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeIntent =
  | 'company_info'
  | 'services'
  | 'pricing'
  | 'delivery_policy'
  | 'returns_policy'
  | 'warranty_policy'
  | 'payment_policy'
  | 'invoice_policy'
  | 'support'
  | 'human_handoff'
  | 'custom';

export interface LocalizedText {
  bg?: string;
  en?: string;
  de?: string;
  fr?: string;
  es?: string;
  it?: string;
  ro?: string;
  el?: string;
  ru?: string;
}

export interface KnowledgeEntry {
  id: string;
  siteId: string;
  enabled: boolean;
  intent: KnowledgeIntent;
  title: string;
  keywords: string[];
  answer: LocalizedText;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRevision {
  id: string;
  siteId: string;
  savedAt: string;
  actorId: string | null;
  summary: string;
  entries: KnowledgeEntry[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  siteId: string;
  visitorId: string;
  locale: LocaleCode;
  pageUrl: string | null;
  referrer: string | null;
  status: 'open' | 'lead' | 'handoff' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  siteId: string;
  conversationId: string | null;
  status: LeadStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string;
  pageUrl: string | null;
  locale: LocaleCode;
  consentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  siteId: string;
  conversationId: string | null;
  status: SupportTicketStatus;
  reason: string;
  customerEmail: string | null;
  customerPhone: string | null;
  sourceText: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionLog {
  id: string;
  siteId: string;
  conversationId: string | null;
  action: string;
  status: ActionStatus;
  confidence: ActionConfidence;
  locale: LocaleCode;
  sourceText: string | null;
  reply: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageEvent {
  id: string;
  siteId: string;
  type: 'conversation' | 'message' | 'lead' | 'handoff' | 'action' | 'feedback';
  quantity: number;
  createdAt: string;
}

export interface PublicSiteConfigResponse {
  siteId: string;
  enabled: boolean;
  mode: AssistantMode;
  defaultLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  branding: SiteBranding;
  privacy: SitePrivacy;
  welcomeMessage: string;
  leadCapturePrompt: string;
}

export interface PublicChatRequest {
  conversationId?: string;
  visitorId?: string;
  message: string;
  locale?: LocaleCode;
  pageUrl?: string;
  referrer?: string;
  consent?: boolean;
}

export interface PublicChatResponse {
  conversationId: string;
  visitorId: string;
  reply: string;
  intent: PublicChatIntent;
  needsLeadDetails: boolean;
  needsHuman: boolean;
  actionId: string | null;
}

export interface PublicLeadRequest {
  conversationId?: string;
  visitorId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message: string;
  pageUrl?: string;
  locale?: LocaleCode;
  consent?: boolean;
}

export interface PublicLeadResponse {
  leadId: string;
  status: LeadStatus;
}

export interface PublicFeedbackRequest {
  conversationId?: string;
  rating: 'positive' | 'negative';
  assistantMessage: string;
  userMessage?: string;
  locale?: LocaleCode;
}

export interface PublicActionRequest {
  conversationId?: string;
  action: string;
  status?: ActionStatus;
  confidence?: ActionConfidence;
  locale?: LocaleCode;
  sourceText?: string;
  reply?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsSummary {
  since: string;
  conversations: number;
  messages: number;
  leads: number;
  handoffs: number;
  actions: number;
  negativeFeedback: number;
  byAction: Array<{ key: string; count: number }>;
  byIntent: Array<{ key: string; count: number }>;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export function isLocaleCode(value: unknown): value is LocaleCode {
  return (
    value === 'bg' ||
    value === 'en' ||
    value === 'de' ||
    value === 'fr' ||
    value === 'es' ||
    value === 'it' ||
    value === 'ro' ||
    value === 'el' ||
    value === 'ru'
  );
}

export function normalizeLocale(
  value: unknown,
  fallback: LocaleCode = 'en',
): LocaleCode {
  return isLocaleCode(value) ? value : fallback;
}

export function pickLocalizedText(
  value: LocalizedText,
  locale: LocaleCode,
  fallback: LocaleCode = 'en',
): string {
  return value[locale]?.trim() || value[fallback]?.trim() || Object.values(value).find((text) => text?.trim())?.trim() || '';
}

export function sanitizePublicText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

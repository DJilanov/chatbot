import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL, URL } from 'node:url';
import {
  BILLING_PLANS,
  createBillingSummary,
  defaultOrganizationBilling,
  normalizeBillingPatch,
  usageLimitBlockReason,
  type BillingUsageIncrement,
} from './billing.js';
import {
  type AdminMeResponse,
  normalizeLocale,
  sanitizePublicText,
  type ActionConfidence,
  type ActionLog,
  type ActionStatus,
  type AnalyticsSummary,
  type ChatMessage,
  type Conversation,
  type KnowledgeEntry,
  type KnowledgeIntent,
  type Lead,
  type LeadStatus,
  type LocaleCode,
  type Organization,
  type OrganizationRole,
  type OrganizationUser,
  type OrganizationUserCreateResponse,
  type OrganizationUserView,
  type PrivacyEraseRequest,
  type PrivacyEraseResponse,
  type PublicActionRequest,
  type PublicChatRequest,
  type PublicChatResponse,
  type PublicFeedbackRequest,
  type PublicLeadRequest,
  type PublicLeadResponse,
  type PublicSiteConfigResponse,
  type RetentionRunResponse,
  type Site,
  type SiteDataExport,
  type SiteConfig,
  type SupportTicket,
  type SupportTicketStatus,
  type UsageEvent,
} from '@chatbot/contracts';
import { resolveChat, extractContactDetails } from './chat-engine.js';
import { loadConfig, type ApiConfig } from './config.js';
import { defaultSiteConfig } from './defaults.js';
import { createId, nowIso } from './ids.js';
import { localizedSiteConfig } from './localization.js';
import { FileStore, type AppData } from './store.js';

const MAX_BODY_BYTES = 128 * 1024;
const PUBLIC_CHAT_LIMIT = 30;
const PUBLIC_CHAT_WINDOW_MS = 60_000;

interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ApiConfig;
  store: FileStore;
}

interface WebhookDeliveryInput {
  siteId: string;
  conversationId: string | null;
  action: string;
  url: string;
  locale: LocaleCode;
  payload: Record<string, unknown>;
}

interface EmailDeliveryInput {
  siteId: string;
  conversationId: string | null;
  action: string;
  to: string;
  locale: LocaleCode;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

interface BootstrapAuth {
  kind: 'bootstrap';
}

interface UserAuth {
  kind: 'user';
  user: OrganizationUser;
}

type AdminAuth = BootstrapAuth | UserAuth;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(now, windowMs);
    return true;
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, timestamps] of this.hits.entries()) {
      const recent = timestamps.filter((time) => now - time < windowMs);
      if (recent.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, recent);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

export function createApiServer(config: ApiConfig, store: FileStore): ReturnType<typeof createServer> {
  return createServer((req, res) => {
    void handleRequest({ req, res, url: buildUrl(req, config), config, store }).catch((error) => {
      sendError(res, error);
    });
  });
}

async function handleRequest(ctx: RouteContext): Promise<void> {
  applyCors(ctx.req, ctx.res);
  if (ctx.req.method === 'OPTIONS') {
    ctx.res.writeHead(204);
    ctx.res.end();
    return;
  }

  const parts = pathParts(ctx.url);
  if (ctx.req.method === 'GET' && parts.length === 1 && parts[0] === 'health') {
    sendJson(ctx.res, 200, { ok: true, provider: ctx.config.aiProvider.id });
    return;
  }

  if (parts[0] === 'public') {
    await handlePublicRoute(ctx, parts);
    return;
  }

  if (parts[0] === 'admin') {
    const auth = await requireAdmin(ctx);
    await handleAdminRoute(ctx, parts, auth);
    return;
  }

  throw new HttpError(404, 'not_found', 'Route not found');
}

async function handlePublicRoute(ctx: RouteContext, parts: string[]): Promise<void> {
  const siteId = parts[2];
  if (parts[1] !== 'sites' || !siteId) {
    throw new HttpError(404, 'not_found', 'Public route not found');
  }

  const data = await ctx.store.read();
  const site = findEnabledSite(data, siteId);
  enforceSiteDomain(ctx.req, site);

  if (ctx.req.method === 'GET' && parts[3] === 'config' && parts.length === 4) {
    const locale = normalizeLocale(ctx.url.searchParams.get('locale'), site.config.defaultLocale);
    sendJson(ctx.res, 200, publicSiteConfig(site, locale));
    return;
  }

  const rateKey = `${clientIp(ctx.req)}:${site.id}:${parts[3] ?? 'unknown'}`;
  if (!rateLimiter.check(rateKey, PUBLIC_CHAT_LIMIT, PUBLIC_CHAT_WINDOW_MS)) {
    throw new HttpError(429, 'rate_limited', 'Too many requests');
  }

  if (ctx.req.method === 'POST' && parts[3] === 'chat' && parts.length === 4) {
    await handlePublicChat(ctx, site);
    return;
  }

  if (ctx.req.method === 'POST' && parts[3] === 'leads' && parts.length === 4) {
    await handlePublicLead(ctx, site);
    return;
  }

  if (ctx.req.method === 'POST' && parts[3] === 'feedback' && parts.length === 4) {
    await handlePublicFeedback(ctx, site);
    return;
  }

  if (ctx.req.method === 'POST' && parts[3] === 'actions' && parts.length === 4) {
    await handlePublicAction(ctx, site);
    return;
  }

  throw new HttpError(404, 'not_found', 'Public route not found');
}

async function handleAdminRoute(ctx: RouteContext, parts: string[], auth: AdminAuth): Promise<void> {
  if (ctx.req.method === 'GET' && parts.length === 2 && parts[1] === 'me') {
    await handleAdminMe(ctx, auth);
    return;
  }

  if (ctx.req.method === 'GET' && parts.length === 2 && parts[1] === 'billing-plans') {
    sendJson(ctx.res, 200, BILLING_PLANS);
    return;
  }

  if (parts.length === 2 && parts[1] === 'organizations') {
    if (ctx.req.method === 'GET') {
      const data = await ctx.store.read();
      sendJson(ctx.res, 200, organizationsForAuth(data, auth));
      return;
    }
    if (ctx.req.method === 'POST') {
      requireBootstrap(auth);
      const body = asRecord(await readJson(ctx.req));
      const name = requireText(body['name'], 'name', 120);
      const timestamp = nowIso();
      const org: Organization = {
        id: createId('org'),
        name,
        billing: defaultOrganizationBilling(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await ctx.store.update((data) => {
        data.organizations.push(org);
      });
      sendJson(ctx.res, 201, org);
      return;
    }
  }

  if (parts.length === 2 && parts[1] === 'sites') {
    if (ctx.req.method === 'GET') {
      const data = await ctx.store.read();
      sendJson(ctx.res, 200, sitesForAuth(data, auth));
      return;
    }
    if (ctx.req.method === 'POST') {
      await handleAdminCreateSite(ctx, auth);
      return;
    }
  }

  if (parts[1] !== 'sites' || !parts[2]) {
    throw new HttpError(404, 'not_found', 'Admin route not found');
  }

  const siteId = parts[2];
  if (ctx.req.method === 'GET' && parts.length === 3) {
    const data = await ctx.store.read();
    const site = findSite(data, siteId);
    requireOrganizationRole(data, auth, site.organizationId, 'viewer');
    sendJson(ctx.res, 200, site);
    return;
  }

  if (ctx.req.method === 'PATCH' && parts[3] === 'config' && parts.length === 4) {
    await handleAdminUpdateSiteConfig(ctx, siteId, auth);
    return;
  }

  if (parts[3] === 'billing' && parts.length === 4) {
    if (ctx.req.method === 'GET') {
      await handleAdminGetBilling(ctx, siteId, auth);
      return;
    }
    if (ctx.req.method === 'PATCH') {
      await handleAdminUpdateBilling(ctx, siteId, auth);
      return;
    }
  }

  if (parts[3] === 'users') {
    await handleAdminUsers(ctx, parts, siteId, auth);
    return;
  }

  if (parts[3] === 'privacy') {
    await handleAdminPrivacy(ctx, parts, siteId, auth);
    return;
  }

  if (parts[3] === 'knowledge') {
    await handleAdminKnowledge(ctx, parts, siteId, auth);
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'conversations' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, data.conversations.filter((item) => item.siteId === siteId));
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'messages' && parts.length === 4) {
    const conversationId = ctx.url.searchParams.get('conversationId') ?? '';
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(
      ctx.res,
      200,
      data.messages.filter((item) => item.conversationId === conversationId),
    );
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'leads' && parts[4] === 'export' && parts.length === 5) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'admin');
    sendCsv(ctx.res, `leads-${siteId}.csv`, leadsCsv(data.leads.filter((item) => item.siteId === siteId)));
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'leads' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, data.leads.filter((item) => item.siteId === siteId));
    return;
  }

  if (ctx.req.method === 'PATCH' && parts[3] === 'leads' && parts[4] && parts.length === 5) {
    await handleAdminUpdateLead(ctx, siteId, parts[4], auth);
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'actions' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, data.actionLogs.filter((item) => item.siteId === siteId));
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'support-tickets' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, data.supportTickets.filter((item) => item.siteId === siteId));
    return;
  }

  if (ctx.req.method === 'PATCH' && parts[3] === 'support-tickets' && parts[4] && parts.length === 5) {
    await handleAdminUpdateSupportTicket(ctx, siteId, parts[4], auth);
    return;
  }

  if (ctx.req.method === 'GET' && parts[3] === 'analytics' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, analyticsSummary(data, siteId, Number(ctx.url.searchParams.get('days') ?? 30)));
    return;
  }

  throw new HttpError(404, 'not_found', 'Admin route not found');
}

async function handleAdminGetBilling(ctx: RouteContext, siteId: string, auth: AdminAuth): Promise<void> {
  const data = await ctx.store.read();
  const site = findSite(data, siteId);
  requireOrganizationRole(data, auth, site.organizationId, 'admin');
  sendJson(ctx.res, 200, createBillingSummary(data, site.organizationId));
}

async function handleAdminUpdateBilling(ctx: RouteContext, siteId: string, auth: AdminAuth): Promise<void> {
  const patch = asRecord(await readJson(ctx.req));
  let organizationId = '';
  await ctx.store.update((data) => {
    const site = findSite(data, siteId);
    requireOrganizationRole(data, auth, site.organizationId, 'owner');
    const organization = findOrganization(data, site.organizationId);
    organizationId = organization.id;
    organization.billing = normalizeBillingPatch(organization.billing, patch);
    organization.updatedAt = nowIso();
  });
  const data = await ctx.store.read();
  sendJson(ctx.res, 200, createBillingSummary(data, organizationId));
}

async function handleAdminCreateSite(ctx: RouteContext, auth: AdminAuth): Promise<void> {
  const body = asRecord(await readJson(ctx.req));
  const organizationId = requireText(body['organizationId'], 'organizationId', 120);
  const name = requireText(body['name'], 'name', 120);
  const websiteUrl = optionalText(body['websiteUrl'], 500);
  const allowedDomains = stringArray(body['allowedDomains'], 20, 120);
  const timestamp = nowIso();
  const site: Site = {
    id: createId('site'),
    organizationId,
    name,
    publicToken: createId('token'),
    enabled: true,
    config: defaultSiteConfig({ name, websiteUrl, allowedDomains }),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await ctx.store.update((data) => {
    if (!data.organizations.some((org) => org.id === organizationId)) {
      throw new HttpError(404, 'organization_not_found', 'Organization not found');
    }
    requireOrganizationRole(data, auth, organizationId, 'admin');
    enforceBillingUsage(data, organizationId, [{ key: 'sites', quantity: 1 }]);
    data.sites.push(site);
  });
  sendJson(ctx.res, 201, site);
}

async function handleAdminUpdateSiteConfig(ctx: RouteContext, siteId: string, auth: AdminAuth): Promise<void> {
  const patch = asRecord(await readJson(ctx.req));
  let updated!: Site;
  await ctx.store.update((data) => {
    const site = findSite(data, siteId);
    requireOrganizationRole(data, auth, site.organizationId, 'admin');
    site.config = mergeSiteConfig(site.config, patch);
    site.enabled = typeof patch['enabled'] === 'boolean' ? patch['enabled'] : site.enabled;
    site.updatedAt = nowIso();
    updated = site;
  });
  sendJson(ctx.res, 200, updated);
}

async function handleAdminUsers(
  ctx: RouteContext,
  parts: string[],
  siteId: string,
  auth: AdminAuth,
): Promise<void> {
  const data = await ctx.store.read();
  const site = findSite(data, siteId);
  requireOrganizationRole(data, auth, site.organizationId, 'owner');

  if (ctx.req.method === 'GET' && parts.length === 4) {
    sendJson(ctx.res, 200, data.organizationUsers.filter((user) => user.organizationId === site.organizationId).map(userView));
    return;
  }

  if (ctx.req.method === 'POST' && parts.length === 4) {
    await handleAdminCreateUser(ctx, site);
    return;
  }

  if (ctx.req.method === 'PATCH' && parts[4] && parts.length === 5) {
    await handleAdminUpdateUser(ctx, site.organizationId, parts[4]);
    return;
  }

  throw new HttpError(404, 'not_found', 'User route not found');
}

async function handleAdminMe(ctx: RouteContext, auth: AdminAuth): Promise<void> {
  if (auth.kind === 'bootstrap') {
    const response: AdminMeResponse = { kind: 'bootstrap', user: null };
    sendJson(ctx.res, 200, response);
    return;
  }

  let updatedUser: OrganizationUser | null = null;
  await ctx.store.update((data) => {
    const user = data.organizationUsers.find((item) => item.id === auth.user.id && item.organizationId === auth.user.organizationId);
    if (!user || user.disabled) throw new HttpError(401, 'unauthorized', 'Admin token is invalid');
    user.lastSeenAt = nowIso();
    updatedUser = user;
  });
  if (!updatedUser) throw new HttpError(401, 'unauthorized', 'Admin token is invalid');
  const response: AdminMeResponse = { kind: 'user', user: userView(updatedUser) };
  sendJson(ctx.res, 200, response);
}

async function handleAdminCreateUser(ctx: RouteContext, site: Site): Promise<void> {
  const body = asRecord(await readJson(ctx.req));
  const timestamp = nowIso();
  const token = createId('user_token');
  const user: OrganizationUser = {
    id: createId('user'),
    organizationId: site.organizationId,
    email: requireText(body['email'], 'email', 255).toLowerCase(),
    name: requireText(body['name'], 'name', 160),
    role: normalizeOrganizationRole(body['role']),
    tokenHash: hashToken(token),
    disabled: false,
    lastSeenAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await ctx.store.update((data) => {
    findOrganization(data, site.organizationId);
    if (data.organizationUsers.some((item) => item.organizationId === site.organizationId && item.email === user.email)) {
      throw new HttpError(409, 'user_exists', 'A user with this email already exists');
    }
    data.organizationUsers.push(user);
  });
  await dispatchUserInviteEmail(ctx, site, user, token);
  const response: OrganizationUserCreateResponse = { user: userView(user), token };
  sendJson(ctx.res, 201, response);
}

async function handleAdminUpdateUser(ctx: RouteContext, organizationId: string, userId: string): Promise<void> {
  const body = asRecord(await readJson(ctx.req));
  let updated!: OrganizationUser;
  await ctx.store.update((data) => {
    findOrganization(data, organizationId);
    const user = data.organizationUsers.find((item) => item.organizationId === organizationId && item.id === userId);
    if (!user) throw new HttpError(404, 'user_not_found', 'User not found');
    const nextRole = body['role'] ? normalizeOrganizationRole(body['role']) : user.role;
    const nextDisabled = typeof body['disabled'] === 'boolean' ? body['disabled'] : user.disabled;
    if ((nextDisabled || nextRole !== 'owner') && user.role === 'owner') {
      assertAnotherActiveOwner(data, organizationId, user.id);
    }
    user.name = typeof body['name'] === 'string' ? sanitizePublicText(body['name'], 160) : user.name;
    user.role = nextRole;
    user.disabled = nextDisabled;
    user.updatedAt = nowIso();
    updated = user;
  });
  sendJson(ctx.res, 200, userView(updated));
}

async function handleAdminPrivacy(
  ctx: RouteContext,
  parts: string[],
  siteId: string,
  auth: AdminAuth,
): Promise<void> {
  if (ctx.req.method === 'GET' && parts[4] === 'export' && parts.length === 5) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'admin');
    sendJson(ctx.res, 200, siteDataExport(data, siteId));
    return;
  }

  if (ctx.req.method === 'POST' && parts[4] === 'erase' && parts.length === 5) {
    await handleAdminPrivacyErase(ctx, siteId, auth);
    return;
  }

  if (ctx.req.method === 'POST' && parts[4] === 'retention-run' && parts.length === 5) {
    await handleAdminRetentionRun(ctx, siteId, auth);
    return;
  }

  throw new HttpError(404, 'not_found', 'Privacy route not found');
}

async function handleAdminPrivacyErase(
  ctx: RouteContext,
  siteId: string,
  auth: AdminAuth,
): Promise<void> {
  const request = normalizePrivacyEraseRequest(await readJson(ctx.req));
  let response!: PrivacyEraseResponse;
  await ctx.store.update((data) => {
    requireSiteRole(data, auth, siteId, 'admin');
    response = erasePrivacySubject(data, siteId, request);
  });
  sendJson(ctx.res, 200, response);
}

async function handleAdminRetentionRun(
  ctx: RouteContext,
  siteId: string,
  auth: AdminAuth,
): Promise<void> {
  let response!: RetentionRunResponse;
  await ctx.store.update((data) => {
    const site = requireSiteRole(data, auth, siteId, 'admin');
    response = runRetentionCleanup(data, site);
  });
  sendJson(ctx.res, 200, response);
}

async function handleAdminKnowledge(ctx: RouteContext, parts: string[], siteId: string, auth: AdminAuth): Promise<void> {
  if (ctx.req.method === 'GET' && parts.length === 4) {
    const data = await ctx.store.read();
    requireSiteRole(data, auth, siteId, 'viewer');
    sendJson(ctx.res, 200, data.knowledgeEntries.filter((item) => item.siteId === siteId));
    return;
  }

  if (ctx.req.method === 'POST' && parts.length === 4) {
    const body = asRecord(await readJson(ctx.req));
    const timestamp = nowIso();
    const entry: KnowledgeEntry = {
      id: createId('know'),
      siteId,
      enabled: typeof body['enabled'] === 'boolean' ? body['enabled'] : true,
      intent: normalizeKnowledgeIntent(body['intent']),
      title: requireText(body['title'], 'title', 160),
      keywords: stringArray(body['keywords'], 30, 80),
      answer: localizedText(body['answer']),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await ctx.store.update((data) => {
      const site = findSite(data, siteId);
      requireOrganizationRole(data, auth, site.organizationId, 'admin');
      enforceBillingUsage(data, site.organizationId, [{ key: 'knowledgeEntries', quantity: 1 }]);
      data.knowledgeEntries.push(entry);
      appendKnowledgeRevision(data, siteId, 'Knowledge entry added', null);
    });
    sendJson(ctx.res, 201, entry);
    return;
  }

  if (ctx.req.method === 'PUT' && parts.length === 4) {
    const body = asRecord(await readJson(ctx.req));
    const entries = asArray(body['entries']).map((item) => normalizeKnowledgeEntry(item, siteId));
    await ctx.store.update((data) => {
      const site = findSite(data, siteId);
      requireOrganizationRole(data, auth, site.organizationId, 'admin');
      const existingCount = data.knowledgeEntries.filter((item) => item.siteId === siteId).length;
      enforceBillingUsage(data, site.organizationId, [
        { key: 'knowledgeEntries', quantity: Math.max(0, entries.length - existingCount) },
      ]);
      data.knowledgeEntries = data.knowledgeEntries.filter((item) => item.siteId !== siteId).concat(entries);
      appendKnowledgeRevision(data, siteId, 'Knowledge base replaced', null);
    });
    sendJson(ctx.res, 200, entries);
    return;
  }

  const entryId = parts[4];
  if (!entryId || parts.length !== 5) {
    throw new HttpError(404, 'not_found', 'Knowledge route not found');
  }

  if (ctx.req.method === 'PATCH') {
    const body = asRecord(await readJson(ctx.req));
    let updated!: KnowledgeEntry;
    await ctx.store.update((data) => {
      const site = findSite(data, siteId);
      requireOrganizationRole(data, auth, site.organizationId, 'admin');
      const entry = data.knowledgeEntries.find((item) => item.siteId === siteId && item.id === entryId);
      if (!entry) throw new HttpError(404, 'knowledge_not_found', 'Knowledge entry not found');
      entry.enabled = typeof body['enabled'] === 'boolean' ? body['enabled'] : entry.enabled;
      entry.intent = body['intent'] ? normalizeKnowledgeIntent(body['intent']) : entry.intent;
      entry.title = typeof body['title'] === 'string' ? sanitizePublicText(body['title'], 160) : entry.title;
      entry.keywords = Array.isArray(body['keywords']) ? stringArray(body['keywords'], 30, 80) : entry.keywords;
      entry.answer = body['answer'] ? localizedText(body['answer']) : entry.answer;
      entry.updatedAt = nowIso();
      updated = entry;
      appendKnowledgeRevision(data, siteId, 'Knowledge entry updated', null);
    });
    sendJson(ctx.res, 200, updated);
    return;
  }

  if (ctx.req.method === 'DELETE') {
    await ctx.store.update((data) => {
      const site = findSite(data, siteId);
      requireOrganizationRole(data, auth, site.organizationId, 'admin');
      data.knowledgeEntries = data.knowledgeEntries.filter(
        (item) => !(item.siteId === siteId && item.id === entryId),
      );
      appendKnowledgeRevision(data, siteId, 'Knowledge entry deleted', null);
    });
    sendJson(ctx.res, 200, { success: true });
    return;
  }

  throw new HttpError(404, 'not_found', 'Knowledge route not found');
}

async function handleAdminUpdateLead(
  ctx: RouteContext,
  siteId: string,
  leadId: string,
  auth: AdminAuth,
): Promise<void> {
  const body = asRecord(await readJson(ctx.req));
  const status = normalizeLeadStatus(body['status']);
  const note = optionalText(body['note'], 1000);
  let updated!: Lead;
  await ctx.store.update((data) => {
    requireSiteRole(data, auth, siteId, 'support');
    const lead = data.leads.find((item) => item.siteId === siteId && item.id === leadId);
    if (!lead) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    lead.status = status;
    lead.updatedAt = nowIso();
    updated = lead;
    data.actionLogs.push(
      newActionLog({
        siteId,
        conversationId: lead.conversationId,
        action: 'lead_status_updated',
        status: 'completed',
        confidence: 'system',
        locale: lead.locale,
        sourceText: lead.message,
        reply: null,
        reason: note,
        metadata: { leadId, leadStatus: status },
      }),
    );
    data.usageEvents.push(newUsageEvent(siteId, 'action', 1));
  });
  sendJson(ctx.res, 200, updated);
}

async function handleAdminUpdateSupportTicket(
  ctx: RouteContext,
  siteId: string,
  ticketId: string,
  auth: AdminAuth,
): Promise<void> {
  const body = asRecord(await readJson(ctx.req));
  const status = normalizeSupportTicketStatus(body['status']);
  const note = optionalText(body['note'], 1000);
  let updated!: SupportTicket;
  await ctx.store.update((data) => {
    requireSiteRole(data, auth, siteId, 'support');
    const ticket = data.supportTickets.find((item) => item.siteId === siteId && item.id === ticketId);
    if (!ticket) throw new HttpError(404, 'support_ticket_not_found', 'Support ticket not found');
    ticket.status = status;
    ticket.updatedAt = nowIso();
    updated = ticket;
    data.actionLogs.push(
      newActionLog({
        siteId,
        conversationId: ticket.conversationId,
        action: 'support_ticket_status_updated',
        status: 'completed',
        confidence: 'system',
        locale: 'en',
        sourceText: ticket.sourceText,
        reply: null,
        reason: note,
        metadata: { ticketId, ticketStatus: status },
      }),
    );
    data.usageEvents.push(newUsageEvent(siteId, 'action', 1));
  });
  sendJson(ctx.res, 200, updated);
}

async function handlePublicChat(ctx: RouteContext, site: Site): Promise<void> {
  const body = asRecord(await readJson(ctx.req)) as Partial<PublicChatRequest>;
  const message = requireText(body.message, 'message', 2000);
  const locale = normalizeLocale(body.locale, site.config.defaultLocale);
  const pageUrl = optionalText(body.pageUrl, 1000);
  const referrer = optionalText(body.referrer, 1000);
  const visitorId = optionalText(body.visitorId, 120) ?? createId('visitor');

  const snapshot = await ctx.store.read();
  const existingConversation = optionalText(body.conversationId, 120)
    ? snapshot.conversations.find(
        (item) => item.id === body.conversationId && item.siteId === site.id,
      ) ?? null
    : null;
  enforceBillingUsage(snapshot, site.organizationId, [
    { key: 'monthlyMessages', quantity: 2 },
    { key: 'monthlyConversations', quantity: existingConversation ? 0 : 1 },
  ]);
  const conversation = existingConversation ?? newConversation(site.id, visitorId, locale, pageUrl, referrer);
  const history = snapshot.messages.filter((item) => item.conversationId === conversation.id);
  const userMessage: ChatMessage = newMessage(conversation.id, 'user', message);
  const result = await resolveChat({
    site,
    knowledgeEntries: snapshot.knowledgeEntries.filter((entry) => entry.siteId === site.id),
    history: [...history, userMessage],
    message,
    locale,
    aiProvider: ctx.config.aiProvider,
  });
  const assistantMessage = newMessage(conversation.id, 'assistant', result.reply);
  const action = newActionLog({
    siteId: site.id,
    conversationId: conversation.id,
    action: result.action,
    status: result.needsHuman ? 'pending_staff' : result.needsLeadDetails ? 'pending_customer' : 'answered',
    confidence: result.confidence,
    locale,
    sourceText: message,
    reply: result.reply,
    reason: result.reason,
    metadata: { ...result.metadata, intent: result.intent },
  });
  const contact = extractContactDetails(message);
  let leadId: string | null = null;
  let createdLead: Lead | null = null;
  let createdSupportTicket: SupportTicket | null = null;

  await ctx.store.update((data) => {
    const storedSite = findEnabledSite(data, site.id);
    const storedConversation =
      data.conversations.find((item) => item.id === conversation.id && item.siteId === storedSite.id) ?? null;
    if (!storedConversation) {
      data.conversations.push(conversation);
      data.usageEvents.push(newUsageEvent(storedSite.id, 'conversation', 1));
    }
    const targetConversation = storedConversation ?? conversation;
    targetConversation.status = result.needsHuman ? 'handoff' : result.intent === 'lead_capture' ? 'lead' : 'open';
    targetConversation.updatedAt = nowIso();
    data.messages.push(userMessage, assistantMessage);
    data.actionLogs.push(action);
    data.usageEvents.push(newUsageEvent(storedSite.id, 'message', 2), newUsageEvent(storedSite.id, 'action', 1));

    if (result.intent === 'lead_capture' && (contact.email || contact.phone)) {
      enforceBillingUsage(data, storedSite.organizationId, [{ key: 'monthlyLeads', quantity: 1 }]);
      const lead = newLead({
        siteId: storedSite.id,
        conversationId: targetConversation.id,
        locale,
        pageUrl,
        message,
        email: contact.email,
        phone: contact.phone,
        consentAt: body.consent ? nowIso() : null,
      });
      leadId = lead.id;
      createdLead = lead;
      data.leads.push(lead);
      data.usageEvents.push(newUsageEvent(storedSite.id, 'lead', 1));
    }

    if (result.needsHuman) {
      const supportTicket = newSupportTicket({
        siteId: storedSite.id,
        conversationId: targetConversation.id,
        sourceText: message,
        reason: result.reason ?? 'Assistant requested human handoff',
        transcript: transcriptFor([...history, userMessage, assistantMessage]),
        customerEmail: contact.email,
        customerPhone: contact.phone,
      });
      createdSupportTicket = supportTicket;
      data.supportTickets.push(supportTicket);
      data.usageEvents.push(newUsageEvent(storedSite.id, 'handoff', 1));
    }
  });

  if (createdLead) await dispatchLeadWebhook(ctx, site, createdLead);
  if (createdLead) await dispatchLeadEmail(ctx, site, createdLead);
  if (createdSupportTicket) await dispatchSupportWebhook(ctx, site, createdSupportTicket);
  if (createdSupportTicket) await dispatchSupportEmail(ctx, site, createdSupportTicket);

  const response: PublicChatResponse = {
    conversationId: conversation.id,
    visitorId,
    reply: result.reply,
    intent: result.intent,
    needsLeadDetails: result.needsLeadDetails,
    needsHuman: result.needsHuman,
    actionId: action.id,
  };
  sendJson(ctx.res, 200, { ...response, leadId });
}

async function handlePublicLead(ctx: RouteContext, site: Site): Promise<void> {
  const body = asRecord(await readJson(ctx.req)) as Partial<PublicLeadRequest>;
  const message = requireText(body.message, 'message', 4000);
  const locale = normalizeLocale(body.locale, site.config.defaultLocale);
  const contact = {
    email: optionalText(body.email, 255),
    phone: optionalText(body.phone, 80),
  };
  if (!contact.email && !contact.phone) {
    throw new HttpError(400, 'contact_required', 'Email or phone is required');
  }

  const lead = newLead({
    siteId: site.id,
    conversationId: optionalText(body.conversationId, 120),
    locale,
    pageUrl: optionalText(body.pageUrl, 1000),
    message,
    email: contact.email,
    phone: contact.phone,
    name: optionalText(body.name, 160),
    company: optionalText(body.company, 160),
    consentAt: body.consent ? nowIso() : null,
  });

  await ctx.store.update((data) => {
    const storedSite = findEnabledSite(data, site.id);
    enforceBillingUsage(data, storedSite.organizationId, [{ key: 'monthlyLeads', quantity: 1 }]);
    data.leads.push(lead);
    data.actionLogs.push(
      newActionLog({
        siteId: site.id,
        conversationId: lead.conversationId,
        action: 'lead_created',
        status: 'completed',
        confidence: 'customer_click',
        locale,
        sourceText: message,
        reply: null,
        reason: null,
        metadata: { hasEmail: Boolean(lead.email), hasPhone: Boolean(lead.phone) },
      }),
    );
    const conversation = lead.conversationId
      ? data.conversations.find((item) => item.id === lead.conversationId && item.siteId === site.id)
      : null;
    if (conversation) {
      conversation.status = 'lead';
      conversation.updatedAt = nowIso();
    }
    data.usageEvents.push(newUsageEvent(site.id, 'lead', 1), newUsageEvent(site.id, 'action', 1));
  });

  await dispatchLeadWebhook(ctx, site, lead);
  await dispatchLeadEmail(ctx, site, lead);

  const response: PublicLeadResponse = { leadId: lead.id, status: lead.status };
  sendJson(ctx.res, 201, response);
}

async function handlePublicFeedback(ctx: RouteContext, site: Site): Promise<void> {
  const body = asRecord(await readJson(ctx.req)) as Partial<PublicFeedbackRequest>;
  const rating = body.rating === 'positive' ? 'positive' : 'negative';
  const locale = normalizeLocale(body.locale, site.config.defaultLocale);
  const assistantMessage = requireText(body.assistantMessage, 'assistantMessage', 2000);
  await ctx.store.update((data) => {
    findEnabledSite(data, site.id);
    data.actionLogs.push(
      newActionLog({
        siteId: site.id,
        conversationId: optionalText(body.conversationId, 120),
        action: 'feedback',
        status: rating === 'negative' ? 'pending_staff' : 'completed',
        confidence: 'customer_click',
        locale,
        sourceText: optionalText(body.userMessage, 2000),
        reply: assistantMessage,
        reason: rating === 'negative' ? 'Visitor marked the assistant answer as not helpful' : null,
        metadata: { rating },
      }),
    );
    data.usageEvents.push(newUsageEvent(site.id, 'feedback', 1), newUsageEvent(site.id, 'action', 1));
  });
  sendJson(ctx.res, 200, { success: true });
}

async function handlePublicAction(ctx: RouteContext, site: Site): Promise<void> {
  const body = asRecord(await readJson(ctx.req)) as Partial<PublicActionRequest>;
  const action = requireText(body.action, 'action', 64);
  const locale = normalizeLocale(body.locale, site.config.defaultLocale);
  await ctx.store.update((data) => {
    findEnabledSite(data, site.id);
    data.actionLogs.push(
      newActionLog({
        siteId: site.id,
        conversationId: optionalText(body.conversationId, 120),
        action,
        status: normalizeActionStatus(body.status),
        confidence: normalizeActionConfidence(body.confidence),
        locale,
        sourceText: optionalText(body.sourceText, 1000),
        reply: optionalText(body.reply, 2000),
        reason: optionalText(body.reason, 1000),
        metadata: isRecord(body.metadata) ? body.metadata : {},
      }),
    );
    data.usageEvents.push(newUsageEvent(site.id, 'action', 1));
  });
  sendJson(ctx.res, 200, { success: true });
}

async function dispatchLeadWebhook(ctx: RouteContext, site: Site, lead: Lead): Promise<void> {
  const url = site.config.integrations.leadWebhookUrl;
  if (!url) return;
  await deliverWebhook(ctx, {
    siteId: site.id,
    conversationId: lead.conversationId,
    action: 'lead_webhook_delivery',
    url,
    locale: lead.locale,
    payload: {
      event: 'lead.created',
      siteId: site.id,
      siteName: site.name,
      lead,
    },
  });
}

async function dispatchSupportWebhook(ctx: RouteContext, site: Site, ticket: SupportTicket): Promise<void> {
  const url = site.config.integrations.supportWebhookUrl;
  if (!url) return;
  await deliverWebhook(ctx, {
    siteId: site.id,
    conversationId: ticket.conversationId,
    action: 'support_ticket_webhook_delivery',
    url,
    locale: 'en',
    payload: {
      event: 'support_ticket.created',
      siteId: site.id,
      siteName: site.name,
      ticket,
    },
  });
}

async function dispatchLeadEmail(ctx: RouteContext, site: Site, lead: Lead): Promise<void> {
  const to = site.config.contact.email;
  if (!to || ctx.config.emailProvider.id === 'none') return;
  await deliverEmail(ctx, {
    siteId: site.id,
    conversationId: lead.conversationId,
    action: 'lead_email_delivery',
    to,
    locale: lead.locale,
    subject: leadEmailSubject(site, lead),
    text: leadEmailText(site, lead),
    html: leadEmailHtml(site, lead),
    metadata: {
      leadId: lead.id,
      leadType: isDemoRequestLead(lead) ? 'demo_request' : 'lead',
    },
  });
}

async function dispatchSupportEmail(ctx: RouteContext, site: Site, ticket: SupportTicket): Promise<void> {
  const to = site.config.contact.email;
  if (!to || ctx.config.emailProvider.id === 'none') return;
  await deliverEmail(ctx, {
    siteId: site.id,
    conversationId: ticket.conversationId,
    action: 'support_ticket_email_delivery',
    to,
    locale: site.config.defaultLocale,
    subject: `[${site.name}] Human handoff requested`,
    text: supportEmailText(site, ticket),
  });
}

async function dispatchUserInviteEmail(ctx: RouteContext, site: Site, user: OrganizationUser, token: string): Promise<void> {
  if (ctx.config.emailProvider.id === 'none') return;
  await deliverEmail(ctx, {
    siteId: site.id,
    conversationId: null,
    action: 'user_invite_email_delivery',
    to: user.email,
    locale: site.config.defaultLocale,
    subject: `[${site.name}] Assistant SaaS admin invitation`,
    text: userInviteEmailText(ctx, site, user, token),
    metadata: {
      userId: user.id,
      role: user.role,
    },
  });
}

async function deliverWebhook(ctx: RouteContext, input: WebhookDeliveryInput): Promise<void> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.config.integrationTimeoutMs);
  let status: ActionStatus = 'completed';
  let reason: string | null = null;
  let responseStatus: number | null = null;
  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'chatbot-saas-webhook/0.1',
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    responseStatus = response.status;
    if (!response.ok) {
      status = 'failed';
      reason = `Webhook responded with HTTP ${response.status}`;
    }
  } catch (error) {
    status = 'failed';
    reason = error instanceof Error ? error.message.slice(0, 500) : 'Webhook request failed';
  } finally {
    clearTimeout(timeout);
  }

  const host = new URL(input.url).host;
  await ctx.store.update((data) => {
    findSite(data, input.siteId);
    data.actionLogs.push(
      newActionLog({
        siteId: input.siteId,
        conversationId: input.conversationId,
        action: input.action,
        status,
        confidence: 'system',
        locale: input.locale,
        sourceText: null,
        reply: null,
        reason,
        metadata: {
          host,
          responseStatus,
          durationMs: Date.now() - startedAt,
        },
      }),
    );
    data.usageEvents.push(newUsageEvent(input.siteId, 'action', 1));
  });
}

async function deliverEmail(ctx: RouteContext, input: EmailDeliveryInput): Promise<void> {
  if (ctx.config.emailProvider.id === 'none') return;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.config.integrationTimeoutMs);
  let status: ActionStatus = 'completed';
  let reason: string | null = null;
  let responseStatus: number | null = null;
  let messageId: string | null = null;
  const provider = ctx.config.emailProvider.id;

  try {
    const result = await ctx.config.emailProvider.send({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }, {
      signal: controller.signal,
    });
    responseStatus = result.responseStatus;
    messageId = result.messageId;
  } catch (error) {
    status = 'failed';
    reason = error instanceof Error ? error.message.slice(0, 500) : 'Email request failed';
  } finally {
    clearTimeout(timeout);
  }

  await ctx.store.update((data) => {
    findSite(data, input.siteId);
    data.actionLogs.push(
      newActionLog({
        siteId: input.siteId,
        conversationId: input.conversationId,
        action: input.action,
        status,
        confidence: 'system',
        locale: input.locale,
        sourceText: null,
        reply: null,
        reason,
        metadata: {
          ...(input.metadata ?? {}),
          provider,
          recipientDomain: recipientDomain(input.to),
          responseStatus,
          messageId,
          durationMs: Date.now() - startedAt,
        },
      }),
    );
    data.usageEvents.push(newUsageEvent(input.siteId, 'action', 1));
  });
}

function leadEmailText(site: Site, lead: Lead): string {
  const title = isDemoRequestLead(lead) ? 'New demo request' : 'New chatbot lead';
  return truncateEmailText(
    [
      title,
      '',
      `Site: ${site.name} (${site.id})`,
      `Lead ID: ${lead.id}`,
      `Conversation ID: ${lead.conversationId ?? 'n/a'}`,
      `Name: ${lead.name ?? 'n/a'}`,
      `Company: ${lead.company ?? 'n/a'}`,
      `Email: ${lead.email ?? 'n/a'}`,
      `Phone: ${lead.phone ?? 'n/a'}`,
      `Locale: ${lead.locale}`,
      `Page: ${lead.pageUrl ?? 'n/a'}`,
      `Consent captured: ${lead.consentAt ? 'yes' : 'no'}`,
      `Created: ${lead.createdAt}`,
      '',
      'Message:',
      lead.message,
    ].join('\n'),
  );
}

function leadEmailHtml(site: Site, lead: Lead): string {
  const isDemo = isDemoRequestLead(lead);
  const title = isDemo ? 'New demo request' : 'New chatbot lead';
  const intro = isDemo
    ? 'A visitor requested a product demo from the landing page.'
    : 'A visitor submitted contact details through the assistant.';
  const replyHref = lead.email ? `mailto:${lead.email}` : null;
  const rows = [
    emailDetailRow('Site', `${site.name} (${site.id})`),
    emailDetailRow('Lead ID', lead.id),
    emailDetailRow('Conversation ID', lead.conversationId ?? 'n/a'),
    emailDetailRow('Name', lead.name ?? 'n/a'),
    emailDetailRow('Company', lead.company ?? 'n/a'),
    emailDetailRow('Email', lead.email ?? 'n/a', replyHref),
    emailDetailRow('Phone', lead.phone ?? 'n/a', lead.phone ? `tel:${lead.phone}` : null),
    emailDetailRow('Locale', lead.locale),
    emailDetailRow('Page', lead.pageUrl ?? 'n/a', safeUrlHref(lead.pageUrl)),
    emailDetailRow('Consent captured', lead.consentAt ? 'yes' : 'no'),
    emailDetailRow('Created', lead.createdAt),
  ].join('');

  return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:22px;padding:26px 24px">
    <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Website enquiry</div>
    <h2 style="margin:16px 0 0;color:#0f172a;font-size:28px;line-height:1.2">${escapeHtml(title)}</h2>
    <p style="margin:10px 0 0;color:#475569;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0 0;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
      ${rows}
    </table>
    <div style="margin:18px 0 0;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;padding:18px">
      <p style="margin:0 0 10px;color:#0f172a;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Message</p>
      <div style="white-space:pre-wrap;color:#334155;font-size:15px;line-height:1.7">${escapeHtml(lead.message)}</div>
    </div>
    ${lead.email ? `<div style="margin:22px 0 0"><a href="${escapeHtml(replyHref ?? '')}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 22px;font-size:15px;font-weight:800">Reply to ${escapeHtml(lead.name ?? lead.email)}</a></div>` : ''}
  </div>`;
}

function leadEmailSubject(site: Site, lead: Lead): string {
  if (isDemoRequestLead(lead)) return `[${site.name}] New demo request`;
  return `[${site.name}] New chatbot lead`;
}

function isDemoRequestLead(lead: Lead): boolean {
  return lead.message.startsWith('Demo request from landing page') || lead.message.startsWith('Заявка за демо');
}

function userInviteEmailText(ctx: RouteContext, site: Site, user: OrganizationUser, token: string): string {
  return truncateEmailText(
    [
      'Assistant SaaS admin invitation',
      '',
      `Site: ${site.name} (${site.id})`,
      `Admin console: ${ctx.config.adminBaseUrl}`,
      `API URL: ${ctx.config.publicBaseUrl}`,
      `Name: ${user.name}`,
      `Email: ${user.email}`,
      `Role: ${user.role}`,
      '',
      'One-time access token:',
      token,
      '',
      'Store this token securely. It is shown and sent only once. If it is lost, ask an owner to create a replacement user token.',
    ].join('\n'),
  );
}

function supportEmailText(site: Site, ticket: SupportTicket): string {
  return truncateEmailText(
    [
      'New support handoff',
      '',
      `Site: ${site.name} (${site.id})`,
      `Ticket ID: ${ticket.id}`,
      `Conversation ID: ${ticket.conversationId ?? 'n/a'}`,
      `Customer email: ${ticket.customerEmail ?? 'n/a'}`,
      `Customer phone: ${ticket.customerPhone ?? 'n/a'}`,
      `Reason: ${ticket.reason}`,
      `Created: ${ticket.createdAt}`,
      '',
      'Source message:',
      ticket.sourceText,
      '',
      'Transcript:',
      ticket.transcript,
    ].join('\n'),
  );
}

function emailDetailRow(label: string, value: string, href: string | null = null): string {
  const safeValue = escapeHtml(value);
  const renderedValue = href
    ? `<a href="${escapeHtml(href)}" style="color:#2563eb;text-decoration:underline">${safeValue}</a>`
    : safeValue;
  return `<tr>
    <td style="width:34%;border-bottom:1px solid #e5e7eb;padding:12px 14px;color:#64748b;font-size:13px;font-weight:800">${escapeHtml(label)}</td>
    <td style="border-bottom:1px solid #e5e7eb;padding:12px 14px;color:#0f172a;font-size:14px">${renderedValue}</td>
  </tr>`;
}

function safeUrlHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateEmailText(value: string): string {
  const limit = 12_000;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[truncated]`;
}

function recipientDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) return null;
  return email.slice(atIndex + 1).toLowerCase();
}

function publicSiteConfig(site: Site, locale: LocaleCode): PublicSiteConfigResponse {
  const config = localizedSiteConfig(site.config, locale);
  return {
    siteId: site.id,
    enabled: site.enabled,
    mode: config.mode,
    defaultLocale: config.defaultLocale,
    supportedLocales: config.supportedLocales,
    branding: config.branding,
    privacy: config.privacy,
    welcomeMessage: config.welcomeMessage,
    leadCapturePrompt: config.leadCapturePrompt,
  };
}

function newConversation(
  siteId: string,
  visitorId: string,
  locale: LocaleCode,
  pageUrl: string | null,
  referrer: string | null,
): Conversation {
  const timestamp = nowIso();
  return {
    id: createId('conv'),
    siteId,
    visitorId,
    locale,
    pageUrl,
    referrer,
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function newMessage(conversationId: string, role: 'user' | 'assistant', text: string): ChatMessage {
  return {
    id: createId('msg'),
    conversationId,
    role,
    text,
    createdAt: nowIso(),
  };
}

function newLead(input: {
  siteId: string;
  conversationId: string | null;
  locale: LocaleCode;
  pageUrl: string | null;
  message: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  company?: string | null;
  consentAt?: string | null;
}): Lead {
  const timestamp = nowIso();
  return {
    id: createId('lead'),
    siteId: input.siteId,
    conversationId: input.conversationId,
    status: 'new',
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    company: input.company ?? null,
    message: input.message,
    pageUrl: input.pageUrl,
    locale: input.locale,
    consentAt: input.consentAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function newSupportTicket(input: {
  siteId: string;
  conversationId: string;
  reason: string;
  sourceText: string;
  transcript: string;
  customerEmail: string | null;
  customerPhone: string | null;
}): SupportTicket {
  const timestamp = nowIso();
  return {
    id: createId('ticket'),
    siteId: input.siteId,
    conversationId: input.conversationId,
    status: 'new',
    reason: input.reason,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    sourceText: input.sourceText,
    transcript: input.transcript,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function newActionLog(input: {
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
}): ActionLog {
  const timestamp = nowIso();
  return {
    id: createId('act'),
    siteId: input.siteId,
    conversationId: input.conversationId,
    action: input.action.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 64),
    status: input.status,
    confidence: input.confidence,
    locale: input.locale,
    sourceText: input.sourceText,
    reply: input.reply,
    reason: input.reason,
    metadata: input.metadata,
    reviewedAt: null,
    reviewedBy: null,
    resolutionNote: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function newUsageEvent(siteId: string, type: UsageEvent['type'], quantity: number): UsageEvent {
  return {
    id: createId('use'),
    siteId,
    type,
    quantity,
    createdAt: nowIso(),
  };
}

function leadsCsv(leads: Lead[]): string {
  const headers = [
    'id',
    'status',
    'name',
    'email',
    'phone',
    'company',
    'message',
    'pageUrl',
    'locale',
    'consentAt',
    'createdAt',
    'updatedAt',
  ];
  const rows = leads
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((lead) => [
      lead.id,
      lead.status,
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      lead.message,
      lead.pageUrl,
      lead.locale,
      lead.consentAt,
      lead.createdAt,
      lead.updatedAt,
    ]);
  return [headers, ...rows].map(csvRow).join('\n') + '\n';
}

function csvRow(values: Array<string | null>): string {
  return values.map(csvCell).join(',');
}

function csvCell(value: string | null): string {
  const text = value ?? '';
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function siteDataExport(data: AppData, siteId: string): SiteDataExport {
  const site = findSite(data, siteId);
  const conversationIds = new Set(data.conversations.filter((item) => item.siteId === siteId).map((item) => item.id));
  return {
    site,
    exportedAt: nowIso(),
    conversations: data.conversations.filter((item) => item.siteId === siteId),
    messages: data.messages.filter((item) => conversationIds.has(item.conversationId)),
    leads: data.leads.filter((item) => item.siteId === siteId),
    supportTickets: data.supportTickets.filter((item) => item.siteId === siteId),
    actionLogs: data.actionLogs.filter((item) => item.siteId === siteId),
    usageEvents: data.usageEvents.filter((item) => item.siteId === siteId),
  };
}

function erasePrivacySubject(
  data: AppData,
  siteId: string,
  request: PrivacyEraseRequest,
): PrivacyEraseResponse {
  const erasedAt = nowIso();
  const email = request.email?.toLowerCase() ?? null;
  const phone = normalizePhone(request.phone);
  const matchedConversationIds = new Set<string>();

  for (const conversation of data.conversations) {
    if (conversation.siteId !== siteId) continue;
    if (
      (request.visitorId && conversation.visitorId === request.visitorId) ||
      (request.conversationId && conversation.id === request.conversationId)
    ) {
      matchedConversationIds.add(conversation.id);
    }
  }

  for (const lead of data.leads) {
    if (lead.siteId !== siteId) continue;
    if (
      (request.conversationId && lead.conversationId === request.conversationId) ||
      matchesPrivacySubject({ email, phone, conversationIds: matchedConversationIds }, lead.email, lead.phone, lead.conversationId)
    ) {
      if (lead.conversationId) matchedConversationIds.add(lead.conversationId);
    }
  }

  for (const ticket of data.supportTickets) {
    if (ticket.siteId !== siteId) continue;
    if (
      (request.conversationId && ticket.conversationId === request.conversationId) ||
      matchesPrivacySubject(
        { email, phone, conversationIds: matchedConversationIds },
        ticket.customerEmail,
        ticket.customerPhone,
        ticket.conversationId,
      )
    ) {
      if (ticket.conversationId) matchedConversationIds.add(ticket.conversationId);
    }
  }

  let leadsAnonymized = 0;
  let conversationsAnonymized = 0;
  let messagesAnonymized = 0;
  let supportTicketsAnonymized = 0;
  let actionLogsAnonymized = 0;

  for (const lead of data.leads) {
    if (
      lead.siteId === siteId &&
      matchesPrivacySubject({ email, phone, conversationIds: matchedConversationIds }, lead.email, lead.phone, lead.conversationId)
    ) {
      lead.name = null;
      lead.email = null;
      lead.phone = null;
      lead.company = null;
      lead.message = '[erased]';
      lead.pageUrl = null;
      lead.consentAt = null;
      lead.updatedAt = erasedAt;
      leadsAnonymized += 1;
    }
  }

  for (const conversation of data.conversations) {
    if (conversation.siteId === siteId && matchedConversationIds.has(conversation.id)) {
      conversation.visitorId = 'erased';
      conversation.pageUrl = null;
      conversation.referrer = null;
      conversation.status = 'closed';
      conversation.updatedAt = erasedAt;
      conversationsAnonymized += 1;
    }
  }

  for (const message of data.messages) {
    if (matchedConversationIds.has(message.conversationId)) {
      message.text = '[erased]';
      messagesAnonymized += 1;
    }
  }

  for (const ticket of data.supportTickets) {
    if (
      ticket.siteId === siteId &&
      matchesPrivacySubject(
        { email, phone, conversationIds: matchedConversationIds },
        ticket.customerEmail,
        ticket.customerPhone,
        ticket.conversationId,
      )
    ) {
      ticket.customerEmail = null;
      ticket.customerPhone = null;
      ticket.reason = 'Privacy erasure request';
      ticket.sourceText = '[erased]';
      ticket.transcript = '[erased]';
      ticket.updatedAt = erasedAt;
      supportTicketsAnonymized += 1;
    }
  }

  for (const action of data.actionLogs) {
    const actionMatches =
      action.siteId === siteId &&
      (Boolean(action.conversationId && matchedConversationIds.has(action.conversationId)) ||
        containsPrivacySubject(action.sourceText, email, phone) ||
        containsPrivacySubject(action.reply, email, phone) ||
        containsPrivacySubject(action.reason, email, phone));
    if (actionMatches) {
      action.sourceText = null;
      action.reply = null;
      action.reason = null;
      action.metadata = { ...action.metadata, privacyErased: true };
      action.updatedAt = erasedAt;
      actionLogsAnonymized += 1;
    }
  }

  const response: PrivacyEraseResponse = {
    siteId,
    erasedAt,
    matchedConversationIds: [...matchedConversationIds].sort(),
    leadsAnonymized,
    conversationsAnonymized,
    messagesAnonymized,
    supportTicketsAnonymized,
    actionLogsAnonymized,
  };

  data.actionLogs.push(
    newActionLog({
      siteId,
      conversationId: null,
      action: 'privacy_erasure',
      status: 'completed',
      confidence: 'system',
      locale: 'en',
      sourceText: null,
      reply: null,
      reason: request.reason ?? null,
      metadata: {
        criteria: {
          email: Boolean(request.email),
          phone: Boolean(request.phone),
          visitorId: Boolean(request.visitorId),
          conversationId: Boolean(request.conversationId),
        },
        counts: {
          leadsAnonymized,
          conversationsAnonymized,
          messagesAnonymized,
          supportTicketsAnonymized,
          actionLogsAnonymized,
        },
      },
    }),
  );
  data.usageEvents.push(newUsageEvent(siteId, 'action', 1));
  return response;
}

function runRetentionCleanup(data: AppData, site: Site): RetentionRunResponse {
  const retentionDays = site.config.privacy.retentionDays;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const deleted = {
    conversations: 0,
    messages: 0,
    leads: 0,
    supportTickets: 0,
    actionLogs: 0,
    usageEvents: 0,
  };

  const expiredConversationIds = new Set(
    data.conversations
      .filter((conversation) => conversation.siteId === site.id && conversation.updatedAt < cutoff)
      .map((conversation) => conversation.id),
  );

  deleted.conversations = expiredConversationIds.size;
  data.conversations = data.conversations.filter((conversation) => !expiredConversationIds.has(conversation.id));

  deleted.messages = data.messages.filter((message) => expiredConversationIds.has(message.conversationId)).length;
  data.messages = data.messages.filter((message) => !expiredConversationIds.has(message.conversationId));

  deleted.leads = data.leads.filter((lead) => lead.siteId === site.id && lead.updatedAt < cutoff).length;
  data.leads = data.leads.filter((lead) => !(lead.siteId === site.id && lead.updatedAt < cutoff));

  deleted.supportTickets = data.supportTickets.filter((ticket) => ticket.siteId === site.id && ticket.updatedAt < cutoff).length;
  data.supportTickets = data.supportTickets.filter((ticket) => !(ticket.siteId === site.id && ticket.updatedAt < cutoff));

  deleted.actionLogs = data.actionLogs.filter((action) => action.siteId === site.id && action.updatedAt < cutoff).length;
  data.actionLogs = data.actionLogs.filter((action) => !(action.siteId === site.id && action.updatedAt < cutoff));

  deleted.usageEvents = data.usageEvents.filter((event) => event.siteId === site.id && event.createdAt < cutoff).length;
  data.usageEvents = data.usageEvents.filter((event) => !(event.siteId === site.id && event.createdAt < cutoff));

  data.actionLogs.push(
    newActionLog({
      siteId: site.id,
      conversationId: null,
      action: 'retention_cleanup',
      status: 'completed',
      confidence: 'system',
      locale: 'en',
      sourceText: null,
      reply: null,
      reason: null,
      metadata: { retentionDays, cutoff, deleted },
    }),
  );
  data.usageEvents.push(newUsageEvent(site.id, 'action', 1));

  return { siteId: site.id, retentionDays, cutoff, deleted };
}

function matchesPrivacySubject(
  subject: { email: string | null; phone: string; conversationIds: Set<string> },
  email: string | null,
  phone: string | null,
  conversationId: string | null,
): boolean {
  if (conversationId && subject.conversationIds.has(conversationId)) return true;
  if (subject.email && email?.toLowerCase() === subject.email) return true;
  if (subject.phone && normalizePhone(phone) === subject.phone) return true;
  return false;
}

function containsPrivacySubject(value: string | null, email: string | null, phone: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (email && normalized.includes(email)) return true;
  return Boolean(phone && normalizePhone(value).includes(phone));
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function analyticsSummary(data: AppData, siteId: string, days: number): AnalyticsSummary {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const sinceDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const usage = data.usageEvents.filter((item) => item.siteId === siteId && item.createdAt >= since);
  const actions = data.actionLogs.filter((item) => item.siteId === siteId && item.createdAt >= since);
  return {
    since,
    conversations: sumUsage(usage, 'conversation'),
    messages: sumUsage(usage, 'message'),
    leads: sumUsage(usage, 'lead'),
    handoffs: sumUsage(usage, 'handoff'),
    actions: sumUsage(usage, 'action'),
    negativeFeedback: actions.filter(
      (item) => item.action === 'feedback' && item.metadata['rating'] === 'negative',
    ).length,
    byAction: summarize(actions.map((item) => item.action)).slice(0, 20),
    byIntent: summarize(
      actions
        .map((item) => item.metadata['intent'])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ).slice(0, 20),
  };
}

function sumUsage(events: UsageEvent[], type: UsageEvent['type']): number {
  return events.filter((item) => item.type === type).reduce((total, item) => total + item.quantity, 0);
}

function summarize(keys: string[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const key of keys) map.set(key, (map.get(key) ?? 0) + 1);
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function transcriptFor(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'Visitor'}: ${message.text}`)
    .join('\n');
}

function appendKnowledgeRevision(data: AppData, siteId: string, summary: string, actorId: string | null): void {
  data.knowledgeRevisions.push({
    id: createId('rev'),
    siteId,
    savedAt: nowIso(),
    actorId,
    summary,
    entries: data.knowledgeEntries.filter((item) => item.siteId === siteId).map((item) => ({ ...item })),
  });
  const revisions = data.knowledgeRevisions.filter((item) => item.siteId === siteId);
  if (revisions.length > 25) {
    const keep = new Set(revisions.slice(-25).map((item) => item.id));
    data.knowledgeRevisions = data.knowledgeRevisions.filter((item) => item.siteId !== siteId || keep.has(item.id));
  }
}

function findSite(data: AppData, siteId: string): Site {
  const site = data.sites.find((item) => item.id === siteId);
  if (!site) throw new HttpError(404, 'site_not_found', 'Site not found');
  return site;
}

function findOrganization(data: AppData, organizationId: string): Organization {
  const organization = data.organizations.find((item) => item.id === organizationId);
  if (!organization) throw new HttpError(404, 'organization_not_found', 'Organization not found');
  return organization;
}

function organizationsForAuth(data: AppData, auth: AdminAuth): Organization[] {
  if (auth.kind === 'bootstrap') return data.organizations;
  return data.organizations.filter((organization) => organization.id === auth.user.organizationId);
}

function sitesForAuth(data: AppData, auth: AdminAuth): Site[] {
  if (auth.kind === 'bootstrap') return data.sites;
  return data.sites.filter((site) => site.organizationId === auth.user.organizationId);
}

function findEnabledSite(data: AppData, siteId: string): Site {
  const site = findSite(data, siteId);
  if (!site.enabled) throw new HttpError(403, 'site_disabled', 'Assistant is disabled for this site');
  return site;
}

function requireBootstrap(auth: AdminAuth): void {
  if (auth.kind !== 'bootstrap') throw new HttpError(403, 'forbidden', 'Bootstrap admin token is required');
}

function requireSiteRole(data: AppData, auth: AdminAuth, siteId: string, minimumRole: OrganizationRole): Site {
  const site = findSite(data, siteId);
  requireOrganizationRole(data, auth, site.organizationId, minimumRole);
  return site;
}

function requireOrganizationRole(
  data: AppData,
  auth: AdminAuth,
  organizationId: string,
  minimumRole: OrganizationRole,
): void {
  findOrganization(data, organizationId);
  if (auth.kind === 'bootstrap') return;
  if (auth.user.organizationId !== organizationId) {
    throw new HttpError(403, 'forbidden', 'User cannot access this organization');
  }
  if (roleLevel(auth.user.role) < roleLevel(minimumRole)) {
    throw new HttpError(403, 'forbidden', `${minimumRole} role is required`);
  }
}

function roleLevel(role: OrganizationRole): number {
  if (role === 'owner') return 4;
  if (role === 'admin') return 3;
  if (role === 'support') return 2;
  return 1;
}

function enforceBillingUsage(
  data: AppData,
  organizationId: string,
  increments: BillingUsageIncrement[],
): void {
  findOrganization(data, organizationId);
  const activeIncrements = increments.filter((item) => item.quantity > 0);
  const summary = createBillingSummary(data, organizationId);
  const reason = usageLimitBlockReason(summary, activeIncrements);
  if (reason) throw new HttpError(402, 'billing_limit_reached', reason);
}

function userView(user: OrganizationUser): OrganizationUserView {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function assertAnotherActiveOwner(data: AppData, organizationId: string, userId: string): void {
  const hasAnotherOwner = data.organizationUsers.some(
    (user) => user.organizationId === organizationId && user.id !== userId && user.role === 'owner' && !user.disabled,
  );
  if (!hasAnotherOwner) {
    throw new HttpError(400, 'last_owner_required', 'An organization must keep at least one active owner');
  }
}

function enforceSiteDomain(req: IncomingMessage, site: Site): void {
  const allowed = site.config.allowedDomains.map(normalizeDomain).filter(Boolean);
  if (allowed.length === 0 || allowed.includes('*')) return;
  const origin = req.headers.origin ?? req.headers.referer ?? '';
  if (!origin) return;
  const domain = normalizeDomain(origin);
  if (!domain || !allowed.includes(domain)) {
    throw new HttpError(403, 'domain_not_allowed', 'This domain is not allowed to use the widget');
  }
}

function mergeSiteConfig(current: SiteConfig, patch: Record<string, unknown>): SiteConfig {
  const next: SiteConfig = structuredClone(current);
  if (typeof patch['defaultLocale'] === 'string') next.defaultLocale = normalizeLocale(patch['defaultLocale'], current.defaultLocale);
  if (Array.isArray(patch['supportedLocales'])) {
    const locales = patch['supportedLocales'].map((value) => normalizeLocale(value, current.defaultLocale));
    next.supportedLocales = [...new Set(locales)];
  }
  if (patch['mode'] === 'lead' || patch['mode'] === 'commerce_readonly' || patch['mode'] === 'commerce_actions' || patch['mode'] === 'support') {
    next.mode = patch['mode'];
  }
  for (const key of [
    'websiteUrl',
    'welcomeMessage',
    'fallbackMessage',
    'pricingMessage',
    'handoffMessage',
    'leadCapturePrompt',
    'systemPrompt',
  ] as const) {
    if (typeof patch[key] === 'string') next[key] = patch[key].trim().slice(0, key === 'systemPrompt' ? 4000 : 1000);
  }
  if (Array.isArray(patch['allowedDomains'])) next.allowedDomains = stringArray(patch['allowedDomains'], 50, 120);
  if (isRecord(patch['branding'])) next.branding = { ...next.branding, ...normalizeBrandingPatch(patch['branding']) };
  if (isRecord(patch['contact'])) next.contact = { ...next.contact, ...normalizeContactPatch(patch['contact']) };
  if (isRecord(patch['privacy'])) next.privacy = { ...next.privacy, ...normalizePrivacyPatch(patch['privacy']) };
  if (isRecord(patch['integrations'])) {
    next.integrations = { ...next.integrations, ...normalizeIntegrationsPatch(patch['integrations']) };
  }
  return next;
}

function normalizeBrandingPatch(value: Record<string, unknown>): Partial<SiteConfig['branding']> {
  const patch: Partial<SiteConfig['branding']> = {};
  if (typeof value['assistantName'] === 'string') patch.assistantName = value['assistantName'].trim().slice(0, 80);
  if (typeof value['title'] === 'string') patch.title = value['title'].trim().slice(0, 100);
  if (typeof value['subtitle'] === 'string') patch.subtitle = value['subtitle'].trim().slice(0, 140);
  if (typeof value['primaryColor'] === 'string' && /^#[0-9a-f]{6}$/i.test(value['primaryColor'])) {
    patch.primaryColor = value['primaryColor'];
  }
  if (value['launcherPosition'] === 'bottom-left' || value['launcherPosition'] === 'bottom-right') {
    patch.launcherPosition = value['launcherPosition'];
  }
  if (typeof value['logoUrl'] === 'string' || value['logoUrl'] === null) patch.logoUrl = optionalText(value['logoUrl'], 500);
  return patch;
}

function normalizeContactPatch(value: Record<string, unknown>): Partial<SiteConfig['contact']> {
  return {
    email: typeof value['email'] === 'string' || value['email'] === null ? optionalText(value['email'], 255) : undefined,
    phone: typeof value['phone'] === 'string' || value['phone'] === null ? optionalText(value['phone'], 80) : undefined,
    bookingUrl:
      typeof value['bookingUrl'] === 'string' || value['bookingUrl'] === null
        ? optionalText(value['bookingUrl'], 500)
        : undefined,
  };
}

function normalizePrivacyPatch(value: Record<string, unknown>): Partial<SiteConfig['privacy']> {
  const retentionDays = Number(value['retentionDays']);
  return {
    privacyUrl:
      typeof value['privacyUrl'] === 'string' || value['privacyUrl'] === null
        ? optionalText(value['privacyUrl'], 500)
        : undefined,
    retentionDays: Number.isFinite(retentionDays) ? Math.max(1, Math.min(3650, Math.floor(retentionDays))) : undefined,
    collectConsent: typeof value['collectConsent'] === 'boolean' ? value['collectConsent'] : undefined,
  };
}

function normalizeIntegrationsPatch(value: Record<string, unknown>): Partial<SiteConfig['integrations']> {
  const patch: Partial<SiteConfig['integrations']> = {};
  if (hasOwn(value, 'leadWebhookUrl')) patch.leadWebhookUrl = optionalWebhookUrl(value['leadWebhookUrl'], 'leadWebhookUrl');
  if (hasOwn(value, 'supportWebhookUrl')) {
    patch.supportWebhookUrl = optionalWebhookUrl(value['supportWebhookUrl'], 'supportWebhookUrl');
  }
  return patch;
}

function normalizeKnowledgeEntry(value: unknown, siteId: string): KnowledgeEntry {
  const body = asRecord(value);
  const timestamp = nowIso();
  return {
    id: optionalText(body['id'], 120) ?? createId('know'),
    siteId,
    enabled: typeof body['enabled'] === 'boolean' ? body['enabled'] : true,
    intent: normalizeKnowledgeIntent(body['intent']),
    title: requireText(body['title'], 'title', 160),
    keywords: stringArray(body['keywords'], 30, 80),
    answer: localizedText(body['answer']),
    createdAt: optionalText(body['createdAt'], 40) ?? timestamp,
    updatedAt: timestamp,
  };
}

function normalizeKnowledgeIntent(value: unknown): KnowledgeIntent {
  const allowed: KnowledgeIntent[] = [
    'company_info',
    'services',
    'pricing',
    'delivery_policy',
    'returns_policy',
    'warranty_policy',
    'payment_policy',
    'invoice_policy',
    'support',
    'human_handoff',
    'custom',
  ];
  return allowed.includes(value as KnowledgeIntent) ? (value as KnowledgeIntent) : 'custom';
}

function localizedText(value: unknown): Record<LocaleCode, string | undefined> {
  const record = asRecord(value);
  const result: Record<LocaleCode, string | undefined> = {
    bg: undefined,
    en: undefined,
    de: undefined,
    fr: undefined,
    es: undefined,
    it: undefined,
    ro: undefined,
    el: undefined,
    ru: undefined,
  };
  for (const locale of Object.keys(result) as LocaleCode[]) {
    if (typeof record[locale] === 'string') result[locale] = record[locale].trim().slice(0, 2000);
  }
  if (!Object.values(result).some((text) => text?.trim())) {
    throw new HttpError(400, 'answer_required', 'At least one localized answer is required');
  }
  return result;
}

function normalizeActionStatus(value: unknown): ActionStatus {
  if (
    value === 'answered' ||
    value === 'pending_customer' ||
    value === 'pending_staff' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'blocked'
  ) {
    return value;
  }
  return 'completed';
}

function normalizeLeadStatus(value: unknown): LeadStatus {
  if (
    value === 'new' ||
    value === 'contacted' ||
    value === 'qualified' ||
    value === 'won' ||
    value === 'lost' ||
    value === 'spam'
  ) {
    return value;
  }
  throw new HttpError(400, 'invalid_lead_status', 'Lead status is invalid');
}

function normalizeSupportTicketStatus(value: unknown): SupportTicketStatus {
  if (
    value === 'new' ||
    value === 'waiting_customer' ||
    value === 'waiting_staff' ||
    value === 'resolved' ||
    value === 'blocked'
  ) {
    return value;
  }
  throw new HttpError(400, 'invalid_support_ticket_status', 'Support ticket status is invalid');
}

function normalizePrivacyEraseRequest(value: unknown): PrivacyEraseRequest {
  const body = asRecord(value);
  const request: PrivacyEraseRequest = {
    email: optionalText(body['email'], 255)?.toLowerCase(),
    phone: optionalText(body['phone'], 80) ?? undefined,
    visitorId: optionalText(body['visitorId'], 120) ?? undefined,
    conversationId: optionalText(body['conversationId'], 120) ?? undefined,
    reason: optionalText(body['reason'], 1000) ?? undefined,
  };
  if (!request.email && !request.phone && !request.visitorId && !request.conversationId) {
    throw new HttpError(400, 'privacy_identifier_required', 'Email, phone, visitorId, or conversationId is required');
  }
  return request;
}

function normalizeActionConfidence(value: unknown): ActionConfidence {
  if (value === 'deterministic' || value === 'ai' || value === 'customer_click' || value === 'system') return value;
  return 'customer_click';
}

function normalizeOrganizationRole(value: unknown): OrganizationRole {
  if (value === 'owner' || value === 'admin' || value === 'support' || value === 'viewer') return value;
  throw new HttpError(400, 'invalid_role', 'User role is invalid');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large', 'Request body is too large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

async function requireAdmin(ctx: RouteContext): Promise<AdminAuth> {
  const token = bearerToken(ctx.req);
  if (!token) throw new HttpError(401, 'unauthorized', 'Admin token is required');
  if (safeEqual(token, ctx.config.adminToken)) return { kind: 'bootstrap' };

  const data = await ctx.store.read();
  const tokenHash = hashToken(token);
  const user = data.organizationUsers.find((item) => item.tokenHash === tokenHash);
  if (!user || user.disabled) throw new HttpError(401, 'unauthorized', 'Admin token is invalid');
  return { kind: 'user', user };
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function pathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function buildUrl(req: IncomingMessage, config: ApiConfig): URL {
  return new URL(req.url ?? '/', config.publicBaseUrl);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendCsv(res: ServerResponse, filename: string, content: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
    'Cache-Control': 'no-store',
  });
  res.end(content);
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { code: error.code, message: error.message });
    return;
  }
  sendJson(res, 500, { code: 'internal_error', message: 'Internal server error' });
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.socket.remoteAddress ?? 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new HttpError(400, 'invalid_request', 'Request body must be an object');
  return value;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'invalid_request', 'Expected an array');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  const text = optionalText(value, maxLength);
  if (!text) throw new HttpError(400, 'field_required', `${field} is required`);
  return text;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function optionalWebhookUrl(value: unknown, field: string): string | null {
  const text = optionalText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Unsupported protocol');
    }
    return url.href;
  } catch {
    throw new HttpError(400, 'invalid_webhook_url', `${field} must be a valid HTTP or HTTPS URL`);
  }
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => optionalText(item, maxLength))
        .filter((item): item is string => Boolean(item)),
    ),
  ].slice(0, maxItems);
}

function normalizeDomain(value: string): string {
  const candidate = value.trim();
  if (!candidate) return '';
  if (candidate === '*') return '*';
  try {
    return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname.toLowerCase();
  } catch {
    return candidate.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const store = new FileStore(config.dataFile);
  createApiServer(config, store).listen(config.port, () => {
    process.stdout.write(`Chatbot API listening on http://localhost:${config.port}\n`);
  });
}

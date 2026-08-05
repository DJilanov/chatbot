import type {
  BillingMetricKey,
  BillingMetricUsage,
  BillingPlan,
  BillingPlanId,
  BillingSummary,
  KnowledgeEntry,
  Organization,
  OrganizationBilling,
  Site,
  SubscriptionStatus,
  UsageEvent,
} from '@chatbot/contracts';

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 49,
    description: 'Lead assistant for one business website.',
    limits: {
      sites: 1,
      knowledgeEntries: 50,
      monthlyConversations: 500,
      monthlyMessages: 2500,
      monthlyLeads: 100,
    },
    features: ['Lead capture', 'Knowledge base', 'CSV export', 'Webhook leads'],
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 149,
    description: 'More usage, more sites, and stronger operations.',
    limits: {
      sites: 5,
      knowledgeEntries: 300,
      monthlyConversations: 2500,
      monthlyMessages: 10000,
      monthlyLeads: 500,
    },
    features: ['Multiple sites', 'Support queue', 'Webhook integrations', 'Advanced analytics'],
  },
  {
    id: 'commerce',
    name: 'Commerce',
    monthlyPriceUsd: 399,
    description: 'Assistant plan for ecommerce discovery and handoff.',
    limits: {
      sites: 10,
      knowledgeEntries: 1000,
      monthlyConversations: 10000,
      monthlyMessages: 50000,
      monthlyLeads: 2000,
    },
    features: ['Commerce assistant', 'Product feed readiness', 'Action ledger', 'Priority support'],
  },
  {
    id: 'managed',
    name: 'Managed',
    monthlyPriceUsd: null,
    description: 'Custom managed assistant setup and monthly optimization.',
    limits: {
      sites: null,
      knowledgeEntries: null,
      monthlyConversations: null,
      monthlyMessages: null,
      monthlyLeads: null,
    },
    features: ['Managed setup', 'Monthly review', 'Custom integrations', 'Custom usage'],
  },
];

export interface BillingData {
  organizations: Organization[];
  sites: Site[];
  knowledgeEntries: KnowledgeEntry[];
  usageEvents: UsageEvent[];
}

export interface BillingUsageIncrement {
  key: BillingMetricKey;
  quantity: number;
}

interface BillingPeriod {
  start: string;
  end: string;
}

export function defaultOrganizationBilling(now: Date = new Date()): OrganizationBilling {
  const period = currentMonthlyPeriod(now);
  return {
    planId: 'starter',
    status: 'trialing',
    trialEndsAt: addDays(now, 14).toISOString(),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: false,
    providerCustomerId: null,
    providerSubscriptionId: null,
  };
}

export function normalizeOrganizationBilling(value: unknown, now: Date = new Date()): OrganizationBilling {
  if (!isRecord(value)) return defaultOrganizationBilling(now);
  const fallback = defaultOrganizationBilling(now);
  return {
    planId: normalizeBillingPlanId(value['planId'], fallback.planId),
    status: normalizeSubscriptionStatus(value['status'], fallback.status),
    trialEndsAt: optionalIsoText(value['trialEndsAt']),
    currentPeriodStart: optionalIsoText(value['currentPeriodStart']) ?? fallback.currentPeriodStart,
    currentPeriodEnd: optionalIsoText(value['currentPeriodEnd']) ?? fallback.currentPeriodEnd,
    cancelAtPeriodEnd: typeof value['cancelAtPeriodEnd'] === 'boolean' ? value['cancelAtPeriodEnd'] : false,
    providerCustomerId: optionalText(value['providerCustomerId'], 255),
    providerSubscriptionId: optionalText(value['providerSubscriptionId'], 255),
  };
}

export function normalizeBillingPatch(
  current: OrganizationBilling,
  patch: Record<string, unknown>,
): OrganizationBilling {
  return {
    planId: hasOwn(patch, 'planId') ? normalizeBillingPlanId(patch['planId'], current.planId) : current.planId,
    status: hasOwn(patch, 'status') ? normalizeSubscriptionStatus(patch['status'], current.status) : current.status,
    trialEndsAt: hasOwn(patch, 'trialEndsAt') ? optionalIsoText(patch['trialEndsAt']) : current.trialEndsAt,
    currentPeriodStart: hasOwn(patch, 'currentPeriodStart')
      ? optionalIsoText(patch['currentPeriodStart']) ?? current.currentPeriodStart
      : current.currentPeriodStart,
    currentPeriodEnd: hasOwn(patch, 'currentPeriodEnd')
      ? optionalIsoText(patch['currentPeriodEnd']) ?? current.currentPeriodEnd
      : current.currentPeriodEnd,
    cancelAtPeriodEnd:
      typeof patch['cancelAtPeriodEnd'] === 'boolean' ? patch['cancelAtPeriodEnd'] : current.cancelAtPeriodEnd,
    providerCustomerId: hasOwn(patch, 'providerCustomerId')
      ? optionalText(patch['providerCustomerId'], 255)
      : current.providerCustomerId,
    providerSubscriptionId: hasOwn(patch, 'providerSubscriptionId')
      ? optionalText(patch['providerSubscriptionId'], 255)
      : current.providerSubscriptionId,
  };
}

export function createBillingSummary(
  data: BillingData,
  organizationId: string,
  now: Date = new Date(),
): BillingSummary {
  const organization = data.organizations.find((item) => item.id === organizationId);
  if (!organization) throw new Error('Organization not found');
  const billing = normalizeOrganizationBilling(organization.billing, now);
  const plan = findBillingPlan(billing.planId);
  const organizationSiteIds = new Set(
    data.sites.filter((site) => site.organizationId === organizationId).map((site) => site.id),
  );
  const usage = data.usageEvents.filter(
    (event) =>
      organizationSiteIds.has(event.siteId) &&
      event.createdAt >= billing.currentPeriodStart &&
      event.createdAt < billing.currentPeriodEnd,
  );
  const metrics: BillingMetricUsage[] = [
    metric('sites', 'Sites', organizationSiteIds.size, plan.limits.sites),
    metric(
      'knowledgeEntries',
      'Knowledge entries',
      data.knowledgeEntries.filter((entry) => organizationSiteIds.has(entry.siteId)).length,
      plan.limits.knowledgeEntries,
    ),
    metric('monthlyConversations', 'Monthly conversations', sumUsage(usage, 'conversation'), plan.limits.monthlyConversations),
    metric('monthlyMessages', 'Monthly messages', sumUsage(usage, 'message'), plan.limits.monthlyMessages),
    metric('monthlyLeads', 'Monthly leads', sumUsage(usage, 'lead'), plan.limits.monthlyLeads),
  ];
  const blockReason = billingBlockReason(billing, now);
  return {
    organizationId,
    plan,
    billing,
    canUseService: !blockReason,
    blockReason,
    metrics,
  };
}

export function usageLimitBlockReason(summary: BillingSummary, increments: BillingUsageIncrement[]): string | null {
  if (!summary.canUseService) return summary.blockReason ?? 'Subscription is not active';
  for (const increment of increments) {
    const metricUsage = summary.metrics.find((item) => item.key === increment.key);
    if (!metricUsage || metricUsage.limit === null) continue;
    if (metricUsage.used + increment.quantity > metricUsage.limit) {
      return `${metricUsage.label} limit reached for the ${summary.plan.name} plan`;
    }
  }
  return null;
}

export function findBillingPlan(planId: BillingPlanId): BillingPlan {
  return BILLING_PLANS.find((plan) => plan.id === planId) ?? BILLING_PLANS[0]!;
}

export function normalizeBillingPlanId(value: unknown, fallback: BillingPlanId): BillingPlanId {
  if (value === 'starter' || value === 'growth' || value === 'commerce' || value === 'managed') return value;
  return fallback;
}

export function normalizeSubscriptionStatus(value: unknown, fallback: SubscriptionStatus): SubscriptionStatus {
  if (
    value === 'trialing' ||
    value === 'active' ||
    value === 'past_due' ||
    value === 'paused' ||
    value === 'canceled'
  ) {
    return value;
  }
  return fallback;
}

function billingBlockReason(billing: OrganizationBilling, now: Date): string | null {
  if (billing.status === 'paused') return 'Subscription is paused';
  if (billing.status === 'canceled') return 'Subscription is canceled';
  if (billing.status === 'past_due') return 'Subscription payment is past due';
  if (billing.status === 'trialing' && billing.trialEndsAt && billing.trialEndsAt < now.toISOString()) {
    return 'Trial has ended';
  }
  return null;
}

function metric(key: BillingMetricKey, label: string, used: number, limit: number | null): BillingMetricUsage {
  return {
    key,
    label,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    exceeded: limit !== null && used > limit,
  };
}

function sumUsage(events: UsageEvent[], type: UsageEvent['type']): number {
  return events.filter((item) => item.type === type).reduce((total, item) => total + item.quantity, 0);
}

function currentMonthlyPeriod(now: Date): BillingPeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function optionalIsoText(value: unknown): string | null {
  const text = optionalText(value, 40);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

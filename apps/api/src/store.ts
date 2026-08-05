import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  ActionLog,
  ChatMessage,
  Conversation,
  KnowledgeEntry,
  KnowledgeRevision,
  Lead,
  Organization,
  OrganizationUser,
  ProductItem,
  Site,
  SiteConfig,
  SiteIntegrations,
  SupportTicket,
  UsageEvent,
} from '@chatbot/contracts';
import { normalizeOrganizationBilling } from './billing.js';

export interface AppData {
  organizations: Organization[];
  organizationUsers: OrganizationUser[];
  sites: Site[];
  knowledgeEntries: KnowledgeEntry[];
  knowledgeRevisions: KnowledgeRevision[];
  productItems: ProductItem[];
  conversations: Conversation[];
  messages: ChatMessage[];
  leads: Lead[];
  supportTickets: SupportTicket[];
  actionLogs: ActionLog[];
  usageEvents: UsageEvent[];
}

export const EMPTY_DATA: AppData = {
  organizations: [],
  organizationUsers: [],
  sites: [],
  knowledgeEntries: [],
  knowledgeRevisions: [],
  productItems: [],
  conversations: [],
  messages: [],
  leads: [],
  supportTickets: [],
  actionLogs: [],
  usageEvents: [],
};

export class FileStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<AppData> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalizeAppData(JSON.parse(raw) as Partial<AppData>);
    } catch (error) {
      if (isNotFound(error)) return structuredClone(EMPTY_DATA);
      throw error;
    }
  }

  async update<T>(mutator: (data: AppData) => T | Promise<T>): Promise<T> {
    let result!: T;
    const nextWrite = this.writeQueue.then(async () => {
      const data = await this.read();
      result = await mutator(data);
      await this.write(data);
    });
    this.writeQueue = nextWrite.catch(() => undefined);
    await nextWrite;
    return result;
  }

  private async write(data: AppData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}

function normalizeAppData(value: Partial<AppData>): AppData {
  return {
    organizations: Array.isArray(value.organizations) ? value.organizations.map(normalizeOrganization) : [],
    organizationUsers: Array.isArray(value.organizationUsers) ? value.organizationUsers.map(normalizeOrganizationUser) : [],
    sites: Array.isArray(value.sites) ? value.sites.map(normalizeSite) : [],
    knowledgeEntries: Array.isArray(value.knowledgeEntries) ? value.knowledgeEntries : [],
    knowledgeRevisions: Array.isArray(value.knowledgeRevisions) ? value.knowledgeRevisions : [],
    productItems: Array.isArray(value.productItems) ? value.productItems.map(normalizeProductItem) : [],
    conversations: Array.isArray(value.conversations) ? value.conversations : [],
    messages: Array.isArray(value.messages) ? value.messages : [],
    leads: Array.isArray(value.leads) ? value.leads.map(normalizeLead) : [],
    supportTickets: Array.isArray(value.supportTickets) ? value.supportTickets : [],
    actionLogs: Array.isArray(value.actionLogs) ? value.actionLogs : [],
    usageEvents: Array.isArray(value.usageEvents) ? value.usageEvents : [],
  };
}

function normalizeOrganization(organization: Organization): Organization {
  return {
    ...organization,
    billing: normalizeOrganizationBilling(organization.billing),
  };
}

function normalizeOrganizationUser(user: OrganizationUser): OrganizationUser {
  return {
    ...user,
    disabled: Boolean(user.disabled),
    lastSeenAt: typeof user.lastSeenAt === 'string' ? user.lastSeenAt : null,
  };
}

function normalizeProductItem(product: ProductItem): ProductItem {
  const attributes: Record<string, string> = {};
  if (product.attributes && typeof product.attributes === 'object') {
    for (const [key, value] of Object.entries(product.attributes)) {
      if (typeof value === 'string') attributes[key] = value;
    }
  }
  return {
    ...product,
    enabled: typeof product.enabled === 'boolean' ? product.enabled : true,
    sku: typeof product.sku === 'string' && product.sku.trim() ? product.sku : null,
    brand: typeof product.brand === 'string' && product.brand.trim() ? product.brand : null,
    category: typeof product.category === 'string' && product.category.trim() ? product.category : null,
    description: typeof product.description === 'string' && product.description.trim() ? product.description : null,
    price: typeof product.price === 'number' && Number.isFinite(product.price) ? product.price : null,
    currency: typeof product.currency === 'string' && product.currency.trim() ? product.currency : null,
    availability:
      product.availability === 'in_stock' ||
      product.availability === 'out_of_stock' ||
      product.availability === 'preorder' ||
      product.availability === 'unknown'
        ? product.availability
        : 'unknown',
    imageUrl: typeof product.imageUrl === 'string' && product.imageUrl.trim() ? product.imageUrl : null,
    productUrl: typeof product.productUrl === 'string' && product.productUrl.trim() ? product.productUrl : null,
    attributes,
    keywords: Array.isArray(product.keywords) ? product.keywords.filter((item) => typeof item === 'string') : [],
  };
}

function normalizeSite(site: Site): Site {
  return {
    ...site,
    config: normalizeSiteConfig(site.config),
  };
}

function normalizeLead(lead: Lead): Lead {
  return {
    ...lead,
    duplicateOfLeadId: typeof lead.duplicateOfLeadId === 'string' && lead.duplicateOfLeadId.trim() ? lead.duplicateOfLeadId : null,
  };
}

function normalizeSiteConfig(config: SiteConfig): SiteConfig {
  return {
    ...config,
    integrations: normalizeIntegrations(config.integrations),
  };
}

function normalizeIntegrations(value: Partial<SiteIntegrations> | undefined): SiteIntegrations {
  return {
    leadWebhookUrl: typeof value?.leadWebhookUrl === 'string' && value.leadWebhookUrl.trim() ? value.leadWebhookUrl : null,
    supportWebhookUrl:
      typeof value?.supportWebhookUrl === 'string' && value.supportWebhookUrl.trim() ? value.supportWebhookUrl : null,
  };
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

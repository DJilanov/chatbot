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
    conversations: Array.isArray(value.conversations) ? value.conversations : [],
    messages: Array.isArray(value.messages) ? value.messages : [],
    leads: Array.isArray(value.leads) ? value.leads : [],
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

function normalizeSite(site: Site): Site {
  return {
    ...site,
    config: normalizeSiteConfig(site.config),
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

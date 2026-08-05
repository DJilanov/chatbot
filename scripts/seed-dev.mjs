import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const filePath = process.env.DATA_FILE || '.data/chatbot-dev.json';
const now = new Date().toISOString();
const demoWebsiteUrl = process.env.DEMO_WEBSITE_URL || 'http://localhost:4173';
const demoAllowedDomains = splitList(process.env.DEMO_ALLOWED_DOMAINS || 'localhost');
const demoContactEmail = process.env.DEMO_CONTACT_EMAIL || 'sales@example.com';

const emptyData = {
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

const data = await readData();
const demoBilling = {
  planId: 'growth',
  status: 'trialing',
  trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  currentPeriodStart: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
  currentPeriodEnd: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
  cancelAtPeriodEnd: false,
  providerCustomerId: null,
  providerSubscriptionId: null,
};

if (!data.organizations.some((item) => item.id === 'org_demo')) {
  data.organizations.push({
    id: 'org_demo',
    name: 'Demo Organization',
    billing: demoBilling,
    createdAt: now,
    updatedAt: now,
  });
}

const demoOrg = data.organizations.find((item) => item.id === 'org_demo');
if (demoOrg && !demoOrg.billing) {
  demoOrg.billing = demoBilling;
  demoOrg.updatedAt = now;
}

if (!data.sites.some((item) => item.id === 'site_demo')) {
  data.sites.push({
    id: 'site_demo',
    organizationId: 'org_demo',
    name: 'Demo Website',
    publicToken: 'token_demo',
    enabled: true,
    config: {
      defaultLocale: 'en',
      supportedLocales: ['en', 'bg'],
      mode: 'lead',
      websiteUrl: demoWebsiteUrl,
      allowedDomains: demoAllowedDomains,
      branding: {
        assistantName: 'Assistant',
        title: 'Demo assistant',
        subtitle: 'AI sales and support assistant',
        primaryColor: '#175cff',
        launcherPosition: 'bottom-right',
        logoUrl: null,
      },
      contact: {
        email: demoContactEmail,
        phone: null,
        bookingUrl: null,
      },
      privacy: {
        privacyUrl: null,
        retentionDays: 180,
        collectConsent: true,
      },
      integrations: {
        leadWebhookUrl: null,
        supportWebhookUrl: null,
      },
      welcomeMessage:
        'Hi, I am an AI assistant. Ask me about the product, pricing, ecommerce support, or booking a demo.',
      fallbackMessage:
        'I do not have a confirmed answer for that yet. Leave your contact details and the team can follow up.',
      pricingMessage:
        'Pricing depends on usage, integrations, and whether you need the commerce assistant. Share your website and the team can prepare the right plan.',
      handoffMessage:
        'I will route this to the team. Please leave an email or phone number so they can follow up.',
      leadCapturePrompt:
        'Please leave your name, email or phone, website URL, and a short note about what you need.',
      systemPrompt:
        'You are a helpful AI assistant for a chatbot SaaS demo. Use approved knowledge first. If uncertain, collect contact details for the team. Never invent prices, order status, payment status, delivery status, legal terms, or unsupported operational facts.',
    },
    createdAt: now,
    updatedAt: now,
  });
}

const entries = [
  {
    id: 'know_demo_product',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Product overview',
    keywords: ['product', 'assistant', 'chatbot', 'what does it do', 'features'],
    answer: {
      en: 'The product is an embeddable AI sales and support assistant for business websites and ecommerce stores. It answers from approved knowledge, captures leads, routes support cases, and keeps an action audit trail.',
      bg: 'Продуктът е вграден AI асистент за продажби и поддръжка за бизнес сайтове и онлайн магазини. Отговаря от одобрени знания, събира запитвания, насочва случаи към екипа и пази журнал на действията.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_safety',
    siteId: 'site_demo',
    enabled: true,
    intent: 'support',
    title: 'Safety and handoff',
    keywords: ['safe', 'safety', 'handoff', 'human', 'support', 'hallucination'],
    answer: {
      en: 'The assistant uses approved knowledge first and routes uncertain or sensitive cases to staff. It should not invent prices, order status, payment status, delivery status, returns, warranty decisions, or unsupported operational facts.',
      bg: 'Асистентът първо използва одобрени знания и насочва несигурни или чувствителни случаи към екип. Не трябва да измисля цени, статус на поръчки, плащания, доставки, връщания, гаранции или оперативни факти.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_install',
    siteId: 'site_demo',
    enabled: true,
    intent: 'company_info',
    title: 'Widget install',
    keywords: ['install', 'script', 'embed', 'website', 'one script'],
    answer: {
      en: 'The widget installs with one script tag. Configure the site in the admin console, allow the website domain, then add the generated script to the customer website.',
      bg: 'Уиджетът се инсталира с един script tag. Настройте сайта в админ панела, разрешете домейна и добавете генерирания скрипт в сайта на клиента.',
    },
    createdAt: now,
    updatedAt: now,
  },
];

for (const entry of entries) {
  if (!data.knowledgeEntries.some((item) => item.id === entry.id)) {
    data.knowledgeEntries.push(entry);
  }
}

await mkdir(dirname(filePath), { recursive: true });
await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

process.stdout.write(`Seeded demo data in ${filePath}\n`);
process.stdout.write('Demo site id: site_demo\n');

async function readData() {
  try {
    const raw = await readFile(filePath, 'utf8');
    return { ...emptyData, ...JSON.parse(raw) };
  } catch {
    return structuredClone(emptyData);
  }
}

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

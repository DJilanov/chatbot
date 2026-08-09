import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const filePath = process.env.DATA_FILE || '.data/chatbot-dev.json';
const now = new Date().toISOString();

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
  productItems: [],
};

const data = await readData();
const existingDemoSite = data.sites.find((item) => item.id === 'site_demo');
const demoWebsiteUrl =
  process.env.DEMO_WEBSITE_URL?.trim() || existingDemoSite?.config?.websiteUrl || 'http://localhost:4173';
const demoAllowedDomains = process.env.DEMO_ALLOWED_DOMAINS?.trim()
  ? splitList(process.env.DEMO_ALLOWED_DOMAINS)
  : existingDemoSite?.config?.allowedDomains?.length
    ? existingDemoSite.config.allowedDomains
    : ['localhost'];
const demoContactEmail =
  process.env.DEMO_CONTACT_EMAIL?.trim() || existingDemoSite?.config?.contact?.email || 'sales@example.com';
const demoLogoUrl =
  process.env.DEMO_LOGO_URL?.trim() ||
  existingDemoSite?.config?.branding?.logoUrl ||
  `${demoWebsiteUrl.replace(/\/+$/, '')}/assets/jilanov-logo-compact.webp`;
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
      defaultLocale: 'bg',
      supportedLocales: ['bg', 'en'],
      mode: 'commerce_readonly',
      websiteUrl: demoWebsiteUrl,
      allowedDomains: demoAllowedDomains,
      branding: {
        assistantName: 'Асистент',
        title: 'Демо асистент',
        subtitle: 'AI асистент за продажби и поддръжка',
        primaryColor: '#175cff',
        launcherPosition: 'bottom-right',
        logoUrl: demoLogoUrl,
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
        'Здравейте, аз съм AI асистент. Попитайте ме за продукта, цените, ecommerce поддръжка или демо.',
      fallbackMessage:
        'Все още нямам потвърден отговор за това. Оставете контакт и екипът ще се свърже с вас.',
      pricingMessage:
        'Пилотните планове започват от 99 лв./месец за базов сайт. Growth и Commerce плановете зависят от трафик, база знания, продуктови интеграции и дали искате ние да поддържаме асистента. Изпратете сайта си и ще върнем конкретна оферта.',
      handoffMessage:
        'Ще насоча това към екипа. Моля, оставете email или телефон, за да се свържем с вас.',
      leadCapturePrompt:
        'Моля, оставете име, email или телефон, адрес на сайта и кратко описание на това, което ви трябва.',
      systemPrompt:
        'Вие сте полезен AI асистент за демо на chatbot SaaS. Първо използвайте одобрени знания. Ако не сте сигурни, съберете контакт за екипа. Не измисляйте цени, статус на поръчки, плащания, доставки, правни условия или неподдържани оперативни факти.',
      localized: {
        en: {
          branding: {
            assistantName: 'Assistant',
            title: 'Demo assistant',
            subtitle: 'AI sales and support assistant',
          },
          welcomeMessage:
            'Hi, I am an AI assistant. Ask me about the product, pricing, ecommerce support, or booking a demo.',
          fallbackMessage:
            'I do not have a confirmed answer for that yet. Leave your contact details and the team can follow up.',
          pricingMessage:
            'Pilot plans start from 99 BGN/month for a basic website assistant. Growth and Commerce depend on traffic, knowledge volume, product integrations, and whether you want us to manage the assistant. Share your website and we can prepare a concrete offer.',
          handoffMessage:
            'I will route this to the team. Please leave an email or phone number so they can follow up.',
          leadCapturePrompt:
            'Please leave your name, email or phone, website URL, and a short note about what you need.',
          systemPrompt:
            'You are a helpful AI assistant for a chatbot SaaS demo. Use approved knowledge first. If uncertain, collect contact details for the team. Never invent prices, order status, payment status, delivery status, legal terms, or unsupported operational facts.',
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  });
}

const demoSite = data.sites.find((item) => item.id === 'site_demo');
if (demoSite) {
  demoSite.config.defaultLocale = 'bg';
  demoSite.config.supportedLocales = ['bg', 'en'];
  demoSite.config.mode = 'commerce_readonly';
  demoSite.config.websiteUrl = demoWebsiteUrl;
  demoSite.config.allowedDomains = demoAllowedDomains;
  demoSite.config.branding = {
    ...demoSite.config.branding,
    assistantName: 'Асистент',
    title: 'Демо асистент',
    subtitle: 'AI асистент за продажби и поддръжка',
    logoUrl: demoLogoUrl,
  };
  demoSite.config.contact = {
    ...demoSite.config.contact,
    email: demoContactEmail,
  };
  demoSite.config.welcomeMessage =
    'Здравейте, аз съм AI асистент. Попитайте ме за продукта, цените, ecommerce поддръжка или демо.';
  demoSite.config.fallbackMessage =
    'Все още нямам потвърден отговор за това. Оставете контакт и екипът ще се свърже с вас.';
  demoSite.config.pricingMessage =
    'Пилотните планове започват от 99 лв./месец за базов сайт. Growth и Commerce плановете зависят от трафик, база знания, продуктови интеграции и дали искате ние да поддържаме асистента. Изпратете сайта си и ще върнем конкретна оферта.';
  demoSite.config.handoffMessage =
    'Ще насоча това към екипа. Моля, оставете email или телефон, за да се свържем с вас.';
  demoSite.config.leadCapturePrompt =
    'Моля, оставете име, email или телефон, адрес на сайта и кратко описание на това, което ви трябва.';
  demoSite.config.systemPrompt =
    'Вие сте полезен AI асистент за демо на chatbot SaaS. Първо използвайте одобрени знания. Ако не сте сигурни, съберете контакт за екипа. Не измисляйте цени, статус на поръчки, плащания, доставки, правни условия или неподдържани оперативни факти.';
  demoSite.config.localized = {
    ...demoSite.config.localized,
    en: {
      branding: {
        assistantName: 'Assistant',
        title: 'Demo assistant',
        subtitle: 'AI sales and support assistant',
      },
      welcomeMessage:
        'Hi, I am an AI assistant. Ask me about the product, pricing, ecommerce support, or booking a demo.',
      fallbackMessage:
        'I do not have a confirmed answer for that yet. Leave your contact details and the team can follow up.',
      pricingMessage:
        'Pilot plans start from 99 BGN/month for a basic website assistant. Growth and Commerce depend on traffic, knowledge volume, product integrations, and whether you want us to manage the assistant. Share your website and we can prepare a concrete offer.',
      handoffMessage:
        'I will route this to the team. Please leave an email or phone number so they can follow up.',
      leadCapturePrompt:
        'Please leave your name, email or phone, website URL, and a short note about what you need.',
      systemPrompt:
        'You are a helpful AI assistant for a chatbot SaaS demo. Use approved knowledge first. If uncertain, collect contact details for the team. Never invent prices, order status, payment status, delivery status, legal terms, or unsupported operational facts.',
    },
  };
  demoSite.updatedAt = now;
}

const entries = [
  {
    id: 'know_demo_product',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Product overview',
    keywords: [
      'product',
      'assistant',
      'chatbot',
      'what does it do',
      'what can it do',
      'features',
      'capabilities',
      'help visitors',
      'какво прави',
      'какво може',
      'асистентът',
      'асистента',
      'чатбот',
      'функции',
      'възможности',
      'помага на клиентите',
    ],
    answer: {
      en: 'The assistant sits on the website as a sales and support layer. It answers from approved business knowledge, qualifies visitors, captures contacts, routes support cases, shows product or service context when connected, and records an action audit so the team can review what happened.',
      bg: 'Асистентът работи като слой за продажби и поддръжка върху сайта. Отговаря от одобрена база знания, квалифицира посетители, събира контакти, насочва support случаи, показва продуктова или service информация при интеграция и пази журнал на действията за екипа.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_ecommerce',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Ecommerce assistant',
    keywords: [
      'ecommerce',
      'e-commerce',
      'commerce',
      'online store',
      'webstore',
      'opencart',
      'shopify',
      'woocommerce',
      'product feed',
      'products',
      'variants',
      'cart',
      'checkout',
      'orders',
      'онлайн магазин',
      'електронен магазин',
      'еcommerce',
      'работи с ecommerce',
      'работи с онлайн магазин',
      'продуктов фийд',
      'вариации',
      'варианти',
      'количка',
      'поръчки',
      'плащане',
    ],
    answer: {
      en: 'Yes. For ecommerce, the assistant can use a live product feed, understand variants and stock, show product cards, hand off to cart or checkout, capture abandoned purchase intent, and route order, invoice, return, warranty, and delivery questions through guarded workflows. It only confirms actions after the website or backend confirms them.',
      bg: 'Да. За онлайн магазин асистентът може да работи с продуктов фийд, варианти и наличности, да показва продуктови карти, да насочва към количка или checkout, да улавя намерение за покупка и да маршрутизира въпроси за поръчки, фактури, връщане, гаранция и доставка през защитени процеси. Потвърждава действие само след реално потвърждение от сайта или backend-а.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_admin',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Admin console',
    keywords: [
      'admin',
      'dashboard',
      'control panel',
      'knowledge editor',
      'lead inbox',
      'analytics',
      'audit',
      'админ',
      'админ панел',
      'табло',
      'контролен панел',
      'редакция на знания',
      'лийдове',
      'аналитика',
      'журнал',
    ],
    answer: {
      en: 'The admin console lets the team configure the site, edit approved knowledge, review conversations, manage leads and support handoffs, inspect analytics, and audit important actions. The goal is that business users can improve answers without developer work.',
      bg: 'Админ панелът позволява на екипа да настройва сайта, да редактира одобрените знания, да преглежда разговори, да управлява лийдове и support handoff-и, да следи аналитика и да проверява важните действия в журнал. Идеята е бизнес екипът да подобрява отговорите без програмист.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_integrations',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Integrations',
    keywords: [
      'integration',
      'integrations',
      'api',
      'webhook',
      'crm',
      'erp',
      'email',
      'merchant',
      'ads',
      'meta',
      'google',
      'интеграция',
      'интеграции',
      'уебхук',
      'имейл',
      'erp',
      'crm',
      'google ads',
      'meta',
    ],
    answer: {
      en: 'Integrations can be added in stages: widget install first, then knowledge import, email notifications, webhooks or CRM, product feed, cart or checkout actions, and reporting for ads attribution. Sensitive actions stay behind deterministic backend checks.',
      bg: 'Интеграциите се добавят поетапно: първо widget, после импорт на знания, email известия, webhook или CRM, продуктов фийд, cart/checkout действия и отчетност за рекламна атрибуция. Чувствителните действия остават зад детерминистични backend проверки.',
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
    keywords: [
      'safe',
      'safety',
      'guardrails',
      'handoff',
      'human',
      'support',
      'hallucination',
      'gdpr',
      'security',
      'безопасност',
      'защита',
      'гардрейли',
      'човек',
      'поддръжка',
      'не измисля',
      'лични данни',
      'gdpr',
    ],
    answer: {
      en: 'The assistant uses approved knowledge first and routes uncertain or sensitive cases to staff. It must not invent prices, discounts, order status, payment status, delivery status, returns, warranty decisions, or unsupported operational facts. Operational actions are logged and confirmed only after the connected system succeeds.',
      bg: 'Асистентът първо използва одобрени знания и насочва несигурни или чувствителни случаи към екип. Не измисля цени, отстъпки, статус на поръчки, плащания, доставки, връщания, гаранции или оперативни факти. Оперативните действия се записват в журнал и се потвърждават само след успех в свързаната система.',
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
    keywords: [
      'install',
      'script',
      'embed',
      'website',
      'one script',
      'setup',
      'launch',
      'pilot',
      'инсталация',
      'инсталира',
      'вграждане',
      'скрипт',
      'сайт',
      'пускане',
      'пилот',
      'внедряване',
    ],
    answer: {
      en: 'The widget installs with one script tag. A practical pilot usually starts with site configuration, allowed domains, the first approved knowledge base, email notifications, and a short QA list of real customer questions before launch.',
      bg: 'Widget-ът се инсталира с един script tag. Практичен пилот започва с настройка на сайта, разрешени домейни, първа одобрена база знания, email известия и кратък QA списък с реални клиентски въпроси преди пускане.',
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'know_demo_chatgpt_difference',
    siteId: 'site_demo',
    enabled: true,
    intent: 'services',
    title: 'Difference from generic ChatGPT',
    keywords: [
      'chatgpt',
      'just chatgpt',
      'different',
      'difference',
      'why not chatgpt',
      'само chatgpt',
      'разлика',
      'различен',
      'защо не chatgpt',
      'обикновен чат',
    ],
    answer: {
      en: 'It is not just a chat box. The product combines approved knowledge, tenant configuration, lead capture, support routing, product or service context, analytics, feedback, and an action audit. The model is only one part; the controlled workflows around it are what make it usable for a real business.',
      bg: 'Това не е просто чат прозорец. Продуктът комбинира одобрени знания, настройки по клиент, lead capture, support routing, продуктова или service информация, аналитика, обратна връзка и журнал на действията. Моделът е само една част; контролираните процеси около него го правят използваем за реален бизнес.',
    },
    createdAt: now,
    updatedAt: now,
  },
];

const demoProducts = [
  {
    id: 'prod_demo_thinkpad_p1_gen4',
    siteId: 'site_demo',
    enabled: true,
    sku: '101726',
    title: 'Lenovo ThinkPad P72',
    brand: 'Lenovo',
    category: 'Laptops',
    description:
      'Мобилна workstation машина с Intel Core i7, 32GB RAM и NVIDIA Quadro. Подходяща за CAD и по-леки игри като FIFA.',
    price: 959,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/94594c4b-d4f9-48af-b7c9-62a99779179d',
    productUrl: 'https://jilanov.com/category/laptops/product/lenovo-p72-a',
    attributes: {
      processor: 'Intel Core i7',
      memory: '32GB RAM',
      gpu: 'NVIDIA Quadro',
      grade: 'Class A',
      usage: 'CAD, FIFA, office',
    },
    keywords: [
      'лаптоп',
      'laptop',
      'mobile workstation',
      'thinkpad p',
      'p72',
      'fifa',
      'gaming',
      'autocad',
      'cad',
      'quadro',
      'nvidia',
      'workstation',
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_dell_precision_5550',
    siteId: 'site_demo',
    enabled: true,
    sku: '102994',
    title: 'Dell Precision 5570',
    brand: 'Dell',
    category: 'Laptops',
    description:
      '15.6" мобилна работна станция с Intel Core i7, 32GB RAM и NVIDIA RTX. Добър избор за CAD, работа и FIFA на умерени настройки.',
    price: 1059,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/587c854c-0d08-4a4c-883d-08074fe74740',
    productUrl: 'https://jilanov.com/category/laptops/product/dell-5570-i7-a',
    attributes: {
      processor: 'Intel Core i7',
      memory: '32GB RAM',
      display: '15.6 inch',
      gpu: 'NVIDIA RTX',
      grade: 'Class A',
    },
    keywords: [
      'лаптоп',
      'laptop',
      'precision',
      'precision 5570',
      'mobile workstation',
      'rtx',
      'nvidia',
      'fifa',
      'gaming',
      'autocad',
      'solidworks',
      'cad',
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_zbook_studio_g7',
    siteId: 'site_demo',
    enabled: true,
    sku: '103002',
    title: 'HP ZBook FIREFLY 15 G7',
    brand: 'HP',
    category: 'Laptops',
    description:
      'Професионален workstation лаптоп с Intel Core i7, 32GB RAM и NVIDIA Quadro. Добър избор за CAD и по-леки игри.',
    price: 489,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/51818ab4-e541-4ccd-841a-53cf30dbead0',
    productUrl: 'https://jilanov.com/category/laptops/product/hp-zbook-firefly15-g7',
    attributes: {
      processor: 'Intel Core i7',
      memory: '32GB RAM',
      gpu: 'NVIDIA Quadro',
      grade: 'Class B',
    },
    keywords: [
      'лаптоп',
      'laptop',
      'zbook',
      'zbook studio',
      'firefly',
      'mobile workstation',
      'quadro',
      'fifa',
      'autocad',
      'cad',
      'gaming',
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_x1_carbon_gen8',
    siteId: 'site_demo',
    enabled: true,
    sku: '103759',
    title: 'Lenovo ThinkPad X1 Carbon Gen 8',
    brand: 'Lenovo',
    category: 'Laptops',
    description:
      'Лек бизнес лаптоп с 16GB RAM и SSD. Отличен за офис, пътуване и браузър работа, но не е първи избор за gaming.',
    price: 549,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/c5ce5b19-0534-4ea6-81a4-71b44409c34f',
    productUrl: 'https://jilanov.com/category/laptops/product/x1-carbon-gen8-i7-a-minus',
    attributes: {
      processor: 'Intel Core i5',
      memory: '16GB RAM',
      storage: '512GB SSD',
      gpu: 'Intel UHD integrated',
      grade: 'Refurbished',
    },
    keywords: ['x1 carbon', 'thinkpad', 'лаптоп', 'laptop', 'business laptop', 'ultrabook'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_server_memory_32gb_rdimm',
    siteId: 'site_demo',
    enabled: true,
    sku: 'DEMO-RDIMM-32GB-DDR4',
    title: '32GB DDR4 ECC RDIMM Server Memory',
    brand: 'Samsung',
    category: 'Server memory',
    description: 'Сървърна ECC Registered памет DDR4 32GB за Dell, HP и Lenovo сървъри.',
    price: 39,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: null,
    productUrl: 'https://jilanov.com/category/server-components/server-memory',
    attributes: {
      memory: '32GB DDR4 ECC RDIMM',
      type: 'Registered server memory',
      compatibility: 'Dell, HP, Lenovo servers',
    },
    keywords: ['server memory', 'сървърна памет', 'ecc', 'rdimm', 'registered', 'ddr4', 'ram'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_battery_l21c6p70',
    siteId: 'site_demo',
    enabled: true,
    sku: 'L21C6P70',
    title: 'Lenovo laptop battery L21C6P70',
    brand: 'Lenovo',
    category: 'Laptop batteries',
    description:
      'Батерия за Lenovo лаптопи с part number L21C6P70. При варианти асистентът трябва да поиска точния модел преди добавяне.',
    price: 68,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/aafc471b-2352-404a-b1b7-0c031711ebeb',
    productUrl: 'https://jilanov.com/category/batteries/product/lenovo_battery_l21c6p70',
    attributes: {
      partNumber: 'L21C6P70',
      type: 'Laptop battery',
      variants: 'Several compatible variants by laptop model',
    },
    keywords: ['L21C6P70', 'battery', 'батерия', 'part number', 'pn', 'lenovo battery', 'съвместима батерия'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_usb_c_charger_65w',
    siteId: 'site_demo',
    enabled: true,
    sku: 'DEMO-USB-C-65W',
    title: 'USB-C 65W laptop charger',
    brand: 'Lenovo',
    category: 'Laptop chargers',
    description: '65W USB-C зарядно за съвместими Lenovo, Dell и HP лаптопи. Проверете модел и мощност преди покупка.',
    price: 12,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/97ec8e15-69ae-4dfe-82d6-b14305367203',
    productUrl: 'https://jilanov.com/category/chargers/product/lenovo_65w_usb_c',
    attributes: {
      power: '65W',
      connector: 'USB-C',
      voltage: '20V',
    },
    keywords: ['charger', 'зарядно', 'usb-c', 'type-c', '65w', 'adapter', 'захранване'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'prod_demo_matrix_156_edp_30pin',
    siteId: 'site_demo',
    enabled: true,
    sku: '101195',
    title: 'Матрица за лаптоп /Дисплей 15.6\'\' N156HCA-EAA, IPS',
    brand: null,
    category: 'Laptop screens',
    description: '15.6" IPS матрица за лаптоп. Съвместимостта зависи от точния модел и part number.',
    price: 63.75,
    currency: 'EUR',
    availability: 'in_stock',
    imageUrl: 'https://jilanov.com/public/document-images/741e96a2-4511-4c09-bb3d-41cb5bd37a33',
    productUrl: 'https://jilanov.com/category/laptop-components/product/n156hca-eaa',
    attributes: {
      display: '15.6 inch',
      connector: 'eDP',
      resolution: 'FHD',
    },
    keywords: ['matrix', 'матрица', 'display', 'screen', 'lcd', 'екран', '15.6', 'edp', 'n156hca-eaa'],
    createdAt: now,
    updatedAt: now,
  },
];

let addedEntries = 0;
let updatedEntries = 0;
for (const entry of entries) {
  const existingEntry = data.knowledgeEntries.find((item) => item.id === entry.id && item.siteId === entry.siteId);
  if (!existingEntry) {
    data.knowledgeEntries.push(entry);
    addedEntries += 1;
  } else {
    existingEntry.enabled = entry.enabled;
    existingEntry.intent = entry.intent;
    existingEntry.title = entry.title;
    existingEntry.keywords = entry.keywords;
    existingEntry.answer = entry.answer;
    existingEntry.updatedAt = now;
    updatedEntries += 1;
  }
}

let addedProducts = 0;
let updatedProducts = 0;
for (const product of demoProducts) {
  const existingProduct = data.productItems.find((item) => item.id === product.id && item.siteId === product.siteId);
  if (!existingProduct) {
    data.productItems.push(product);
    addedProducts += 1;
  } else {
    existingProduct.enabled = product.enabled;
    existingProduct.sku = product.sku;
    existingProduct.title = product.title;
    existingProduct.brand = product.brand;
    existingProduct.category = product.category;
    existingProduct.description = product.description;
    existingProduct.price = product.price;
    existingProduct.currency = product.currency;
    existingProduct.availability = product.availability;
    existingProduct.imageUrl = product.imageUrl;
    existingProduct.productUrl = product.productUrl;
    existingProduct.attributes = product.attributes;
    existingProduct.keywords = product.keywords;
    existingProduct.updatedAt = now;
    updatedProducts += 1;
  }
}

await mkdir(dirname(filePath), { recursive: true });
await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

process.stdout.write(`Seeded demo data in ${filePath}\n`);
process.stdout.write('Demo site id: site_demo\n');
process.stdout.write(`Demo knowledge added=${addedEntries}, updated=${updatedEntries}\n`);
process.stdout.write(`Demo products added=${addedProducts}, updated=${updatedProducts}\n`);

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

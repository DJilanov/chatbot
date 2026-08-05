import type { SiteConfig } from '@chatbot/contracts';

export function defaultSiteConfig(input: {
  name: string;
  websiteUrl?: string | null;
  allowedDomains?: string[];
}): SiteConfig {
  return {
    defaultLocale: 'bg',
    supportedLocales: ['bg', 'en'],
    mode: 'lead',
    websiteUrl: input.websiteUrl ?? null,
    allowedDomains: input.allowedDomains ?? [],
    branding: {
      assistantName: 'Асистент',
      title: `${input.name} асистент`,
      subtitle: 'AI асистент за продажби и поддръжка',
      primaryColor: '#175cff',
      launcherPosition: 'bottom-right',
      logoUrl: null,
    },
    contact: {
      email: null,
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
      'Здравейте, аз съм AI асистент. Попитайте ме за услуги, цени, поддръжка или как да се свържете с екипа.',
    fallbackMessage:
      'Все още нямам потвърден отговор за това. Оставете контакт и екипът ще се свърже с вас.',
    pricingMessage:
      'Цената зависи от нуждите ви. Споделете сайта си и какво искате да постигнете, за да подготвим точна оферта.',
    handoffMessage:
      'Ще насоча това към екипа. Моля, оставете email или телефон, за да се свържем с вас.',
    leadCapturePrompt:
      'Моля, оставете име, email или телефон и кратко описание на това, което ви трябва.',
    systemPrompt:
      'Вие сте полезен AI асистент за този бизнес сайт. Отговаряйте само от одобрени бизнес знания, когато е възможно. Ако не сте сигурни, поискайте контакт и насочете случая към екип. Не измисляйте цени, правни условия, статус на доставка, плащане, поръчка или неподдържани оперативни факти.',
    localized: {
      en: {
        branding: {
          assistantName: 'Assistant',
          title: `${input.name} assistant`,
          subtitle: 'AI sales and support assistant',
        },
        welcomeMessage:
          'Hi, I am an AI assistant. Ask me about services, pricing, support, or how to get in touch.',
        fallbackMessage:
          'I do not have a confirmed answer for that yet. Leave your contact details and the team can follow up.',
        pricingMessage:
          'Pricing depends on your requirements. Share your website and what you need, and the team can prepare the right offer.',
        handoffMessage:
          'I will route this to the team. Please leave an email or phone number so they can follow up.',
        leadCapturePrompt:
          'Please leave your name, email or phone, and a short note about what you need.',
        systemPrompt:
          'You are a helpful AI assistant for this business website. Answer only from approved business knowledge where possible. If uncertain, ask for contact details and route the case to staff. Never invent prices, legal terms, delivery status, payment status, order status, or unsupported operational facts.',
      },
    },
  };
}

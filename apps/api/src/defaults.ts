import type { SiteConfig } from '@chatbot/contracts';

export function defaultSiteConfig(input: {
  name: string;
  websiteUrl?: string | null;
  allowedDomains?: string[];
}): SiteConfig {
  return {
    defaultLocale: 'en',
    supportedLocales: ['en', 'bg'],
    mode: 'lead',
    websiteUrl: input.websiteUrl ?? null,
    allowedDomains: input.allowedDomains ?? [],
    branding: {
      assistantName: 'Assistant',
      title: `${input.name} assistant`,
      subtitle: 'AI sales and support assistant',
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
  };
}

import type { LocaleCode, SiteConfig } from '@chatbot/contracts';

type LocalizedTextKey =
  | 'welcomeMessage'
  | 'fallbackMessage'
  | 'pricingMessage'
  | 'handoffMessage'
  | 'leadCapturePrompt'
  | 'systemPrompt';

export function localizedSiteConfig(config: SiteConfig, locale: LocaleCode): SiteConfig {
  const override = config.localized?.[locale];
  if (!override) return config;

  return {
    ...config,
    branding: {
      ...config.branding,
      ...compactTextValues(override.branding),
    },
    welcomeMessage: localizedText(config, locale, 'welcomeMessage'),
    fallbackMessage: localizedText(config, locale, 'fallbackMessage'),
    pricingMessage: localizedText(config, locale, 'pricingMessage'),
    handoffMessage: localizedText(config, locale, 'handoffMessage'),
    leadCapturePrompt: localizedText(config, locale, 'leadCapturePrompt'),
    systemPrompt: localizedText(config, locale, 'systemPrompt'),
  };
}

export function localizedText(
  config: SiteConfig,
  locale: LocaleCode,
  key: LocalizedTextKey,
): string {
  const value = config.localized?.[locale]?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : config[key];
}

function compactTextValues<T extends Record<string, string | undefined> | undefined>(
  value: T,
): Partial<NonNullable<T>> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === 'string' && item.trim()),
  ) as Partial<NonNullable<T>>;
}

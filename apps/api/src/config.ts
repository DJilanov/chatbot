import { createAiProvider, type AiProvider, type AiProviderId } from '@chatbot/ai';
import { createEmailProvider, type EmailProvider, type EmailProviderId } from './email.js';

export interface ApiConfig {
  port: number;
  dataFile: string;
  adminToken: string;
  publicBaseUrl: string;
  adminBaseUrl: string;
  integrationTimeoutMs: number;
  aiProvider: AiProvider;
  emailProvider: EmailProvider;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = parseInteger(env['PORT'], 8787);
  const provider = parseAiProvider(env['AI_PROVIDER']);
  return {
    port,
    dataFile: env['DATA_FILE']?.trim() || '.data/chatbot-dev.json',
    adminToken: env['ADMIN_TOKEN']?.trim() || 'change-me',
    publicBaseUrl: env['PUBLIC_BASE_URL']?.trim() || `http://localhost:${port}`,
    adminBaseUrl: env['ADMIN_BASE_URL']?.trim() || 'http://localhost:4174',
    integrationTimeoutMs: parseInteger(env['INTEGRATION_TIMEOUT_MS'], 5000),
    aiProvider: createAiProvider({
      provider,
      apiKey: env['AI_PROVIDER_API_KEY']?.trim() || undefined,
      model: env['AI_PROVIDER_MODEL']?.trim() || undefined,
      baseUrl: env['AI_PROVIDER_BASE_URL']?.trim() || undefined,
    }),
    emailProvider: createEmailProvider({
      provider: parseEmailProvider(env['EMAIL_PROVIDER']),
      apiKey: env['EMAIL_PROVIDER_API_KEY']?.trim() || undefined,
      from: env['EMAIL_FROM']?.trim() || env['SMTP_FROM']?.trim() || undefined,
      baseUrl: env['EMAIL_PROVIDER_BASE_URL']?.trim() || undefined,
      smtpHost: env['SMTP_HOST']?.trim() || undefined,
      smtpPort: parseOptionalInteger(env['SMTP_PORT']),
      smtpUser: env['SMTP_USER']?.trim() || undefined,
      smtpPass: env['SMTP_PASS']?.trim() || undefined,
      smtpSecure: parseOptionalBoolean(env['SMTP_SECURE']),
      replyTo: env['SMTP_REPLY_TO']?.trim() || undefined,
    }),
  };
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parseAiProvider(value: string | undefined): AiProviderId {
  if (value === 'openai' || value === 'gemini' || value === 'null') return value;
  return 'null';
}

function parseEmailProvider(value: string | undefined): EmailProviderId {
  if (value === 'resend' || value === 'smtp') return value;
  return 'none';
}

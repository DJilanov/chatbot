export type EmailProviderId = 'none' | 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDeliveryResult {
  provider: EmailProviderId;
  messageId: string | null;
  responseStatus: number | null;
}

export interface EmailSendOptions {
  signal?: AbortSignal;
}

export interface EmailProvider {
  readonly id: EmailProviderId;
  send(message: EmailMessage, options?: EmailSendOptions): Promise<EmailDeliveryResult>;
}

export interface EmailProviderConfig {
  provider: EmailProviderId;
  apiKey?: string;
  from?: string;
  baseUrl?: string;
}

export class NullEmailProvider implements EmailProvider {
  readonly id = 'none';

  async send(): Promise<EmailDeliveryResult> {
    return { provider: this.id, messageId: null, responseStatus: null };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly id = 'resend';
  private readonly apiKey: string;
  private readonly from: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, from: string, baseUrl = 'https://api.resend.com') {
    this.apiKey = apiKey;
    this.from = from;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async send(message: EmailMessage, options?: EmailSendOptions): Promise<EmailDeliveryResult> {
    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? htmlFromText(message.text),
      }),
      signal: options?.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: unknown; message?: unknown };
    if (!response.ok) {
      const detail = typeof payload.message === 'string' ? payload.message : response.statusText;
      throw new Error(`Resend email failed: HTTP ${response.status} ${detail}`.slice(0, 500));
    }
    return {
      provider: this.id,
      messageId: typeof payload.id === 'string' ? payload.id : null,
      responseStatus: response.status,
    };
  }
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
  if (config.provider === 'resend' && config.apiKey && config.from) {
    return new ResendEmailProvider(config.apiKey, config.from, config.baseUrl);
  }
  return new NullEmailProvider();
}

export function htmlFromText(text: string): string {
  return `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

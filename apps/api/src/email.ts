import nodemailer, { type Transporter } from 'nodemailer';

export type EmailProviderId = 'none' | 'resend' | 'smtp';

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
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  replyTo?: string;
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

export class SmtpEmailProvider implements EmailProvider {
  readonly id = 'smtp';
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly replyTo: string | undefined;

  constructor(input: {
    host: string;
    port: number;
    secure: boolean;
    from: string;
    user?: string;
    pass?: string;
    replyTo?: string;
  }) {
    this.from = input.from;
    this.replyTo = input.replyTo;
    this.transporter = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      ...(input.user && input.pass ? { auth: { user: input.user, pass: input.pass } } : {}),
    });
  }

  async send(message: EmailMessage, options?: EmailSendOptions): Promise<EmailDeliveryResult> {
    if (options?.signal?.aborted) throw new Error('SMTP email aborted');
    const result = await withAbort(
      this.transporter.sendMail({
        from: this.from,
        to: message.to,
        replyTo: this.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html ?? htmlFromText(message.text),
      }),
      options?.signal,
    );
    return {
      provider: this.id,
      messageId: messageIdFromSmtpResult(result),
      responseStatus: null,
    };
  }
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
  if (config.provider === 'resend' && config.apiKey && config.from) {
    return new ResendEmailProvider(config.apiKey, config.from, config.baseUrl);
  }
  if (config.provider === 'smtp' && config.smtpHost && config.from) {
    return new SmtpEmailProvider({
      host: config.smtpHost,
      port: config.smtpPort ?? 587,
      secure: config.smtpSecure ?? config.smtpPort === 465,
      from: config.from,
      user: config.smtpUser,
      pass: config.smtpPass,
      replyTo: config.replyTo,
    });
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

function messageIdFromSmtpResult(result: unknown): string | null {
  const info = result as { messageId?: unknown; response?: unknown };
  if (typeof info.messageId === 'string') return info.messageId;
  if (typeof info.response === 'string') return info.response;
  return null;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(new Error('SMTP email aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

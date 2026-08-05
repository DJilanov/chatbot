export type AiProviderId = 'openai' | 'gemini' | 'null';

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface AiCompletionInput {
  system: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiProvider {
  readonly id: AiProviderId;
  complete(input: AiCompletionInput): Promise<string>;
}

export interface AiProviderConfig {
  provider: AiProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class NullAiProvider implements AiProvider {
  readonly id = 'null';

  async complete(): Promise<string> {
    return '';
  }
}

export class OpenAiProvider implements AiProvider {
  readonly id = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async complete(input: AiCompletionInput): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxOutputTokens ?? 700,
        messages: [
          { role: 'system', content: input.system },
          ...input.messages.map((message) => ({
            role: message.role === 'system' ? 'user' : message.role,
            content: message.text,
          })),
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI request failed: ${response.status} ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  }
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    model = 'gemini-2.5-flash',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async complete(input: AiCompletionInput): Promise<string> {
    const generationConfig: Record<string, unknown> = {
      temperature: input.temperature ?? 0.3,
      maxOutputTokens: input.maxOutputTokens ?? 700,
    };
    if (this.model.includes('2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text }],
            })),
          generationConfig,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini request failed: ${response.status} ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim() ?? ''
    );
  }
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  if (config.provider === 'openai' && config.apiKey) {
    return new OpenAiProvider(config.apiKey, config.model, config.baseUrl);
  }
  if (config.provider === 'gemini' && config.apiKey) {
    return new GeminiProvider(config.apiKey, config.model, config.baseUrl);
  }
  return new NullAiProvider();
}


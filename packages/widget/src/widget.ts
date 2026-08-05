interface WidgetBranding {
  assistantName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  launcherPosition: 'bottom-right' | 'bottom-left';
  logoUrl: string | null;
}

interface WidgetPrivacy {
  privacyUrl: string | null;
  retentionDays: number;
  collectConsent: boolean;
}

interface WidgetConfig {
  siteId: string;
  enabled: boolean;
  defaultLocale: string;
  supportedLocales: string[];
  branding: WidgetBranding;
  privacy: WidgetPrivacy;
  welcomeMessage: string;
  leadCapturePrompt: string;
}

interface ChatResponse {
  conversationId: string;
  visitorId: string;
  reply: string;
  intent: string;
  needsLeadDetails: boolean;
  needsHuman: boolean;
  actionId: string | null;
}

interface ChatbotWindow extends Window {
  Chatbot?: {
    open: () => void;
    close: () => void;
    send: (message: string) => Promise<void>;
    on: (eventName: string, handler: (payload: unknown) => void) => void;
  };
}

interface PersistedState {
  conversationId: string | null;
  visitorId: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
}

const persisted: PersistedState = {
  conversationId: null,
  visitorId: '',
  messages: [],
};

(function boot(): void {
  const script = document.currentScript as HTMLScriptElement | null;
  const rawSiteId = script?.dataset['siteId']?.trim();
  if (!rawSiteId) return;
  const siteId: string = rawSiteId;

  const apiUrl = (
    script?.dataset['apiUrl']?.trim() ||
    (script?.src ? new URL(script.src).origin : window.location.origin)
  ).replace(/\/+$/, '');
  const storageKey = `chatbot:${siteId}`;
  const handlers = new Map<string, Array<(payload: unknown) => void>>();

  const persisted = readState(storageKey);
  let config: WidgetConfig | null = null;
  let conversationId = persisted.conversationId;
  let visitorId = persisted.visitorId || createVisitorId();
  let open = false;
  let loading = false;
  let leadVisible = false;

  const host = document.createElement('div');
  host.id = `chatbot-widget-${siteId}`;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  const root = document.createElement('div');
  shadow.append(style, root);

  void loadConfig().then((loaded) => {
    if (!loaded?.enabled) {
      host.remove();
      return;
    }
    config = loaded;
    render();
    emit('ready', { siteId });
  });

  (window as ChatbotWindow).Chatbot = {
    open: () => {
      open = true;
      render();
      emit('open', { source: 'api' });
    },
    close: () => {
      open = false;
      render();
      emit('close', { source: 'api' });
    },
    send: async (message: string) => {
      await sendMessage(message);
    },
    on: (eventName: string, handler: (payload: unknown) => void) => {
      const current = handlers.get(eventName) ?? [];
      current.push(handler);
      handlers.set(eventName, current);
    },
  };

  async function loadConfig(): Promise<WidgetConfig | null> {
    try {
      const response = await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/config`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as WidgetConfig;
    } catch {
      return null;
    }
  }

  function render(): void {
    if (!config) return;
    style.textContent = css(config.branding);
    root.innerHTML = '';
    root.append(renderShell(config));
  }

  function renderShell(currentConfig: WidgetConfig): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `chatbot-wrap ${currentConfig.branding.launcherPosition}`;

    const panel = document.createElement('section');
    panel.className = `chatbot-panel ${open ? 'is-open' : ''}`;
    panel.setAttribute('aria-label', currentConfig.branding.title);
    panel.innerHTML = `
      <header class="chatbot-header">
        <div class="chatbot-avatar">${escapeHtml(currentConfig.branding.assistantName.slice(0, 1) || 'A')}</div>
        <div class="chatbot-heading">
          <strong>${escapeHtml(currentConfig.branding.title)}</strong>
          <span>${escapeHtml(currentConfig.branding.subtitle)}</span>
        </div>
        <button class="chatbot-icon" type="button" data-close aria-label="Close chat">x</button>
      </header>
      <div class="chatbot-ai-note">AI assistant. Do not share sensitive payment or password data.</div>
      <div class="chatbot-messages" data-messages></div>
      <form class="chatbot-lead ${leadVisible ? 'is-open' : ''}" data-lead-form>
        <input name="name" autocomplete="name" placeholder="Name" />
        <input name="email" autocomplete="email" placeholder="Email" />
        <input name="phone" autocomplete="tel" placeholder="Phone" />
        <input name="company" autocomplete="organization" placeholder="Company" />
        <button type="submit">Send contact</button>
      </form>
      <form class="chatbot-compose" data-chat-form>
        <textarea name="message" rows="1" maxlength="2000" placeholder="Ask a question"></textarea>
        <button type="submit" aria-label="Send message">${loading ? '...' : 'Send'}</button>
      </form>
    `;

    const messages = panel.querySelector<HTMLElement>('[data-messages]');
    if (messages) {
      appendMessage(messages, 'assistant', currentConfig.welcomeMessage, false);
      for (const item of persisted.messages) appendMessage(messages, item.role, item.text, true);
      if (loading) appendMessage(messages, 'assistant', 'Typing...', true);
      messages.scrollTop = messages.scrollHeight;
    }

    panel.querySelector('[data-close]')?.addEventListener('click', () => {
      open = false;
      render();
      emit('close', { source: 'button' });
    });
    panel.querySelector<HTMLFormElement>('[data-chat-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const textarea = panel.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
      const text = textarea?.value.trim() ?? '';
      if (!text) return;
      if (textarea) textarea.value = '';
      void sendMessage(text);
    });
    panel.querySelector<HTMLFormElement>('[data-lead-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void submitLead(new FormData(form));
    });

    const launcher = document.createElement('button');
    launcher.className = 'chatbot-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
    launcher.textContent = open ? 'x' : 'Chat';
    launcher.addEventListener('click', () => {
      open = !open;
      render();
      emit(open ? 'open' : 'close', { source: 'launcher' });
    });

    wrapper.append(panel, launcher);
    return wrapper;
  }

  async function sendMessage(message: string): Promise<void> {
    if (!config || loading) return;
    loading = true;
    persisted.messages.push({ role: 'user', text: message });
    trimPersistedMessages();
    writeState(storageKey, { conversationId, visitorId, messages: persisted.messages });
    render();
    emit('send', { messageLength: message.length });

    try {
      const response = await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          conversationId,
          visitorId,
          message,
          locale: browserLocale(config),
          pageUrl: window.location.href,
          referrer: document.referrer || undefined,
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(`chat_failed_${response.status}`);
      const result = (await response.json()) as ChatResponse;
      conversationId = result.conversationId;
      visitorId = result.visitorId;
      leadVisible = result.needsLeadDetails;
      persisted.messages.push({ role: 'assistant', text: result.reply });
      trimPersistedMessages();
      writeState(storageKey, { conversationId, visitorId, messages: persisted.messages });
      emit('response', {
        intent: result.intent,
        needsLeadDetails: result.needsLeadDetails,
        needsHuman: result.needsHuman,
        actionId: result.actionId,
      });
    } catch {
      persisted.messages.push({
        role: 'assistant',
        text: 'The assistant is unavailable right now. Please try again later.',
      });
      emit('error', { stage: 'chat' });
    } finally {
      loading = false;
      render();
    }
  }

  async function submitLead(formData: FormData): Promise<void> {
    if (!config || loading) return;
    const payload = {
      conversationId,
      visitorId,
      name: textField(formData, 'name'),
      email: textField(formData, 'email'),
      phone: textField(formData, 'phone'),
      company: textField(formData, 'company'),
      message: lastUserMessage() || 'Contact request from chatbot widget',
      pageUrl: window.location.href,
      locale: browserLocale(config),
      consent: true,
    };
    if (!payload.email && !payload.phone) {
      persisted.messages.push({ role: 'assistant', text: 'Please add an email or phone number.' });
      render();
      return;
    }

    loading = true;
    render();
    try {
      const response = await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`lead_failed_${response.status}`);
      leadVisible = false;
      persisted.messages.push({
        role: 'assistant',
        text: 'Thanks. Your contact request was sent.',
      });
      emit('lead_created', { conversationId });
      writeState(storageKey, { conversationId, visitorId, messages: persisted.messages });
    } catch {
      persisted.messages.push({
        role: 'assistant',
        text: 'I could not send the contact request. Please try again.',
      });
      emit('error', { stage: 'lead' });
    } finally {
      loading = false;
      render();
    }
  }

  function appendMessage(container: HTMLElement, role: 'user' | 'assistant', text: string, withFeedback: boolean): void {
    const row = document.createElement('div');
    row.className = `chatbot-message-row ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message';
    bubble.textContent = text;
    row.append(bubble);
    if (role === 'assistant' && withFeedback) {
      const feedback = document.createElement('div');
      feedback.className = 'chatbot-feedback';
      feedback.innerHTML = '<button type="button" data-rate="positive">Helpful</button><button type="button" data-rate="negative">Not helpful</button>';
      feedback.querySelectorAll<HTMLButtonElement>('button[data-rate]').forEach((button) => {
        button.addEventListener('click', () => {
          feedback.remove();
          void sendFeedback(button.dataset['rate'] === 'positive' ? 'positive' : 'negative', text);
        });
      });
      bubble.append(feedback);
    }
    container.append(row);
  }

  async function sendFeedback(rating: 'positive' | 'negative', assistantMessage: string): Promise<void> {
    if (!config) return;
    await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        conversationId,
        rating,
        assistantMessage,
        userMessage: lastUserMessage(),
        locale: browserLocale(config),
      }),
    }).catch(() => undefined);
    emit('feedback', { rating });
  }

  function emit(eventName: string, payload: unknown): void {
    for (const handler of handlers.get(eventName) ?? []) handler(payload);
  }
})();

function readState(key: string): PersistedState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Partial<PersistedState>;
    persisted.conversationId = typeof parsed.conversationId === 'string' ? parsed.conversationId : null;
    persisted.visitorId = typeof parsed.visitorId === 'string' ? parsed.visitorId : '';
    persisted.messages = Array.isArray(parsed.messages)
      ? parsed.messages
          .filter((item): item is { role: 'user' | 'assistant'; text: string } =>
            Boolean(
              item &&
                typeof item === 'object' &&
                (item as { role?: unknown }).role &&
                ((item as { role?: unknown }).role === 'user' ||
                  (item as { role?: unknown }).role === 'assistant') &&
                typeof (item as { text?: unknown }).text === 'string',
            ),
          )
          .slice(-30)
      : [];
  } catch {
    persisted.conversationId = null;
    persisted.visitorId = '';
    persisted.messages = [];
  }
  return persisted;
}

function writeState(key: string, state: PersistedState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage is optional; the widget still works without persistence.
  }
}

function trimPersistedMessages(): void {
  persisted.messages = persisted.messages.slice(-30);
}

function textField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined;
}

function lastUserMessage(): string | undefined {
  return [...persisted.messages].reverse().find((message) => message.role === 'user')?.text;
}

function browserLocale(config: WidgetConfig): string {
  const raw = navigator.language.toLowerCase().slice(0, 2);
  return config.supportedLocales.includes(raw) ? raw : config.defaultLocale;
}

function createVisitorId(): string {
  if ('randomUUID' in crypto) return `visitor_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  return `visitor_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function css(branding: WidgetBranding): string {
  const side = branding.launcherPosition === 'bottom-left' ? 'left' : 'right';
  const opposite = branding.launcherPosition === 'bottom-left' ? 'right' : 'left';
  return `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    .chatbot-wrap { position: fixed; bottom: 20px; ${side}: 20px; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .chatbot-panel { display: none; width: min(380px, calc(100vw - 32px)); height: min(620px, calc(100vh - 104px)); margin-bottom: 12px; overflow: hidden; border: 1px solid #d7dce5; border-radius: 12px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.22); }
    .chatbot-panel.is-open { display: flex; flex-direction: column; }
    .chatbot-header { display: flex; align-items: center; gap: 10px; padding: 12px; background: ${branding.primaryColor}; color: #fff; }
    .chatbot-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.18); font-weight: 800; }
    .chatbot-heading { display: grid; min-width: 0; flex: 1; }
    .chatbot-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 18px; }
    .chatbot-heading span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.82; font-size: 12px; line-height: 16px; }
    .chatbot-icon { width: 30px; height: 30px; border: 0; border-radius: 6px; color: #fff; background: rgba(255,255,255,0.16); cursor: pointer; }
    .chatbot-ai-note { padding: 8px 12px; border-bottom: 1px solid #eef1f5; color: #5c667a; background: #f8fafc; font-size: 11px; line-height: 15px; }
    .chatbot-messages { flex: 1; overflow: auto; padding: 14px 12px; background: #fff; }
    .chatbot-message-row { display: flex; margin-bottom: 10px; }
    .chatbot-message-row.user { justify-content: flex-end; }
    .chatbot-message { max-width: 82%; white-space: pre-wrap; border-radius: 12px; padding: 9px 11px; font-size: 13px; line-height: 18px; color: #172033; background: #eef2f7; }
    .chatbot-message-row.user .chatbot-message { color: #fff; background: ${branding.primaryColor}; }
    .chatbot-feedback { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chatbot-feedback button { border: 1px solid #cfd6e2; border-radius: 6px; background: #fff; color: #334155; padding: 4px 7px; font-size: 11px; cursor: pointer; }
    .chatbot-lead { display: none; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 12px; border-top: 1px solid #eef1f5; background: #f8fafc; }
    .chatbot-lead.is-open { display: grid; }
    .chatbot-lead input { min-width: 0; border: 1px solid #cfd6e2; border-radius: 8px; padding: 8px; font: inherit; font-size: 12px; }
    .chatbot-lead button { grid-column: 1 / -1; border: 0; border-radius: 8px; padding: 9px; color: #fff; background: ${branding.primaryColor}; font-weight: 700; cursor: pointer; }
    .chatbot-compose { display: flex; align-items: end; gap: 8px; padding: 10px 12px; border-top: 1px solid #eef1f5; background: #fff; }
    .chatbot-compose textarea { min-height: 38px; max-height: 92px; flex: 1; resize: none; border: 1px solid #cfd6e2; border-radius: 9px; padding: 9px; font: inherit; font-size: 13px; outline: none; }
    .chatbot-compose textarea:focus { border-color: ${branding.primaryColor}; box-shadow: 0 0 0 3px color-mix(in srgb, ${branding.primaryColor} 20%, transparent); }
    .chatbot-compose button { min-width: 64px; height: 38px; border: 0; border-radius: 9px; color: #fff; background: ${branding.primaryColor}; font-weight: 800; cursor: pointer; }
    .chatbot-launcher { float: ${opposite}; width: 62px; height: 62px; border: 0; border-radius: 50%; color: #fff; background: ${branding.primaryColor}; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.24); font-weight: 800; cursor: pointer; }
    @media (max-width: 480px) {
      .chatbot-wrap { left: 12px; right: 12px; bottom: 12px; }
      .chatbot-panel { width: 100%; height: min(620px, calc(100vh - 92px)); }
      .chatbot-launcher { ${side}: 0; }
    }
  `;
}

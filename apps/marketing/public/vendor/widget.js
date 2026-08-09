const persisted = {
    conversationId: null,
    visitorId: '',
    messages: [],
};
(function boot() {
    const script = document.currentScript;
    const rawSiteId = script?.dataset['siteId']?.trim();
    if (!rawSiteId)
        return;
    const siteId = rawSiteId;
    const apiUrl = (script?.dataset['apiUrl']?.trim() ||
        (script?.src ? new URL(script.src).origin : window.location.origin)).replace(/\/+$/, '');
    const storageKey = `chatbot:${siteId}`;
    const handlers = new Map();
    const persisted = readState(storageKey);
    let currentLocale = preferredLocale({
        explicitLocale: script?.dataset['locale']?.trim() || window.CHATBOT_LOCALE,
        supportedLocales: ['bg', 'en'],
        fallbackLocale: 'bg',
    });
    let config = null;
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
    void loadConfig(currentLocale).then((loaded) => {
        if (!loaded?.enabled) {
            host.remove();
            return;
        }
        config = loaded;
        currentLocale = preferredLocale({
            explicitLocale: currentLocale,
            supportedLocales: loaded.supportedLocales,
            fallbackLocale: loaded.defaultLocale,
        });
        render();
        emit('ready', { siteId });
    });
    window.Chatbot = {
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
        send: async (message) => {
            await sendMessage(message);
        },
        setLocale: async (locale) => {
            await setLocale(locale);
        },
        isReady: () => Boolean(config),
        on: (eventName, handler) => {
            const current = handlers.get(eventName) ?? [];
            current.push(handler);
            handlers.set(eventName, current);
        },
    };
    window.addEventListener('chatbot:locale', (event) => {
        const locale = event instanceof CustomEvent && typeof event.detail?.locale === 'string'
            ? event.detail.locale
            : null;
        if (locale)
            void setLocale(locale);
    });
    async function loadConfig(locale) {
        try {
            const response = await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/config?locale=${encodeURIComponent(locale)}`, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok)
                return null;
            return (await response.json());
        }
        catch {
            return null;
        }
    }
    async function setLocale(locale) {
        const nextLocale = preferredLocale({
            explicitLocale: locale,
            supportedLocales: config?.supportedLocales ?? ['bg', 'en'],
            fallbackLocale: config?.defaultLocale ?? 'bg',
        });
        currentLocale = nextLocale;
        window.CHATBOT_LOCALE = nextLocale;
        if (!config)
            return;
        const localized = await loadConfig(nextLocale);
        if (localized?.enabled)
            config = localized;
        render();
        emit('locale', { locale: nextLocale });
    }
    function render() {
        if (!config)
            return;
        style.textContent = css(config.branding);
        root.innerHTML = '';
        root.append(renderShell(config));
    }
    function renderShell(currentConfig) {
        const copy = widgetCopy(currentLocale);
        const wrapper = document.createElement('div');
        wrapper.className = `chatbot-wrap ${currentConfig.branding.launcherPosition}`;
        const panel = document.createElement('section');
        panel.className = `chatbot-panel ${open ? 'is-open' : ''}`;
        panel.setAttribute('aria-label', currentConfig.branding.title);
        panel.innerHTML = `
      <header class="chatbot-header">
        ${brandAvatar(currentConfig.branding)}
        <div class="chatbot-heading">
          <strong>${escapeHtml(currentConfig.branding.title)}</strong>
          <span>${escapeHtml(currentConfig.branding.subtitle)}</span>
        </div>
        <button class="chatbot-icon" type="button" data-close aria-label="${escapeHtml(copy.closeChat)}">x</button>
      </header>
      <div class="chatbot-ai-note">${escapeHtml(copy.aiNote)}</div>
      <div class="chatbot-messages" data-messages></div>
      <form class="chatbot-lead ${leadVisible ? 'is-open' : ''}" data-lead-form>
        <input name="name" autocomplete="name" placeholder="${escapeHtml(copy.name)}" />
        <input name="email" autocomplete="email" placeholder="${escapeHtml(copy.email)}" />
        <input name="phone" autocomplete="tel" placeholder="${escapeHtml(copy.phone)}" />
        <input name="company" autocomplete="organization" placeholder="${escapeHtml(copy.company)}" />
        <button type="submit">${escapeHtml(copy.sendContact)}</button>
      </form>
      <form class="chatbot-compose" data-chat-form>
        <textarea name="message" rows="1" maxlength="2000" placeholder="${escapeHtml(copy.askQuestion)}"></textarea>
        <button type="submit" aria-label="${escapeHtml(copy.sendMessage)}">${loading ? '...' : escapeHtml(copy.send)}</button>
      </form>
    `;
        const messages = panel.querySelector('[data-messages]');
        if (messages) {
            appendMessage(messages, 'assistant', currentConfig.welcomeMessage, false);
            for (const item of persisted.messages) {
                appendMessage(messages, item.role, item.text, true, item.productCards, item.productComparison, item.bookingUrl);
            }
            if (loading)
                appendMessage(messages, 'assistant', copy.typing, true);
            messages.scrollTop = messages.scrollHeight;
        }
        panel.querySelector('[data-close]')?.addEventListener('click', () => {
            open = false;
            render();
            emit('close', { source: 'button' });
        });
        panel.querySelector('[data-chat-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const textarea = panel.querySelector('textarea[name="message"]');
            const text = textarea?.value.trim() ?? '';
            if (!text)
                return;
            if (textarea)
                textarea.value = '';
            void sendMessage(text);
        });
        panel.querySelector('[data-lead-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void submitLead(new FormData(form));
        });
        const launcher = document.createElement('button');
        launcher.className = 'chatbot-launcher';
        launcher.type = 'button';
        launcher.setAttribute('aria-label', open ? copy.closeChat : copy.openChat);
        launcher.innerHTML = open ? 'x' : launcherContent(currentConfig.branding, copy);
        launcher.addEventListener('click', () => {
            open = !open;
            render();
            emit(open ? 'open' : 'close', { source: 'launcher' });
        });
        wrapper.append(panel, launcher);
        return wrapper;
    }
    function brandAvatar(branding) {
        if (branding.logoUrl) {
            return `<div class="chatbot-avatar"><img src="${escapeHtml(branding.logoUrl)}" alt="" /></div>`;
        }
        return `<div class="chatbot-avatar">${escapeHtml(branding.assistantName.slice(0, 1) || 'A')}</div>`;
    }
    function launcherContent(branding, copy) {
        if (branding.logoUrl)
            return `<img src="${escapeHtml(branding.logoUrl)}" alt="" />`;
        return escapeHtml(copy.chat);
    }
    async function sendMessage(message) {
        if (!config || loading)
            return;
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
                    locale: activeLocale(config),
                    pageUrl: window.location.href,
                    referrer: document.referrer || undefined,
                    consent: true,
                }),
            });
            if (!response.ok)
                throw new Error(`chat_failed_${response.status}`);
            const result = (await response.json());
            conversationId = result.conversationId;
            visitorId = result.visitorId;
            leadVisible = result.needsLeadDetails;
            const productComparison = normalizeProductComparison(result.productComparison);
            persisted.messages.push({
                role: 'assistant',
                text: result.reply,
                productCards: normalizeProductCards(result.productCards),
                ...(productComparison ? { productComparison } : {}),
            });
            trimPersistedMessages();
            writeState(storageKey, { conversationId, visitorId, messages: persisted.messages });
            emit('response', {
                intent: result.intent,
                needsLeadDetails: result.needsLeadDetails,
                needsHuman: result.needsHuman,
                actionId: result.actionId,
                productCards: result.productCards ?? [],
                productComparison: result.productComparison ?? null,
            });
        }
        catch {
            persisted.messages.push({
                role: 'assistant',
                text: widgetCopy(currentLocale).assistantUnavailable,
            });
            emit('error', { stage: 'chat' });
        }
        finally {
            loading = false;
            render();
        }
    }
    async function submitLead(formData) {
        if (!config || loading)
            return;
        const payload = {
            conversationId,
            visitorId,
            name: textField(formData, 'name'),
            email: textField(formData, 'email'),
            phone: textField(formData, 'phone'),
            company: textField(formData, 'company'),
            message: lastUserMessage() || widgetCopy(currentLocale).contactRequest,
            pageUrl: window.location.href,
            locale: activeLocale(config),
            consent: true,
        };
        if (!payload.email && !payload.phone) {
            persisted.messages.push({ role: 'assistant', text: widgetCopy(currentLocale).contactRequired });
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
            if (!response.ok)
                throw new Error(`lead_failed_${response.status}`);
            leadVisible = false;
            const bookingUrl = safeExternalUrl(config.bookingUrl);
            persisted.messages.push({
                role: 'assistant',
                text: widgetCopy(currentLocale).contactSent,
                ...(bookingUrl ? { bookingUrl } : {}),
            });
            emit('lead_created', { conversationId });
            writeState(storageKey, { conversationId, visitorId, messages: persisted.messages });
        }
        catch {
            persisted.messages.push({
                role: 'assistant',
                text: widgetCopy(currentLocale).contactFailed,
            });
            emit('error', { stage: 'lead' });
        }
        finally {
            loading = false;
            render();
        }
    }
    function appendMessage(container, role, text, withFeedback, productCards = [], productComparison = null, bookingUrl) {
        const row = document.createElement('div');
        row.className = `chatbot-message-row ${role}`;
        const stack = document.createElement('div');
        stack.className = 'chatbot-message-stack';
        const bubble = document.createElement('div');
        bubble.className = 'chatbot-message';
        bubble.textContent = text;
        stack.append(bubble);
        const safeProductCards = normalizeProductCards(productCards);
        const safeProductComparison = normalizeProductComparison(productComparison);
        if (role === 'assistant' && safeProductCards.length > 0) {
            stack.append(renderProductCards(safeProductCards, !safeProductComparison));
        }
        if (role === 'assistant' && safeProductComparison) {
            stack.append(renderProductComparison(safeProductComparison));
        }
        const safeBookingUrl = safeExternalUrl(bookingUrl);
        if (role === 'assistant' && safeBookingUrl) {
            const copy = widgetCopy(currentLocale);
            const link = document.createElement('a');
            link.className = 'chatbot-booking-link';
            link.href = safeBookingUrl;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = copy.bookMeeting;
            link.addEventListener('click', () => {
                void sendBookingClick(safeBookingUrl);
            });
            stack.append(link);
        }
        if (role === 'assistant' && withFeedback) {
            const copy = widgetCopy(currentLocale);
            const feedback = document.createElement('div');
            feedback.className = 'chatbot-feedback';
            feedback.innerHTML = `<button type="button" data-rate="positive">${escapeHtml(copy.helpful)}</button><button type="button" data-rate="negative">${escapeHtml(copy.notHelpful)}</button>`;
            feedback.querySelectorAll('button[data-rate]').forEach((button) => {
                button.addEventListener('click', () => {
                    feedback.remove();
                    void sendFeedback(button.dataset['rate'] === 'positive' ? 'positive' : 'negative', text);
                });
            });
            bubble.append(feedback);
        }
        row.append(stack);
        container.append(row);
    }
    function renderProductCards(cards, showCompare) {
        const copy = widgetCopy(currentLocale);
        const list = document.createElement('div');
        list.className = 'chatbot-product-cards';
        list.innerHTML = cards
            .map((card) => `
          <article class="chatbot-product-card ${card.imageUrl ? '' : 'no-image'}">
            ${card.imageUrl ? `<img src="${escapeHtml(card.imageUrl)}" alt="" loading="lazy" />` : ''}
            <div class="chatbot-product-body">
              <strong>${escapeHtml(card.title)}</strong>
              <span>${escapeHtml(productCardMeta(card, copy))}</span>
              ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ''}
              <small>${escapeHtml(card.reason)}</small>
              ${card.productUrl
            ? `<a href="${escapeHtml(card.productUrl)}" target="_blank" rel="noopener" data-product-id="${escapeHtml(card.id)}">${escapeHtml(card.actionLabel || copy.viewProduct)}</a>`
            : ''}
            </div>
          </article>
        `)
            .join('');
        list.querySelectorAll('a[data-product-id]').forEach((link) => {
            link.addEventListener('click', () => {
                const card = cards.find((item) => item.id === link.dataset['productId']);
                if (card)
                    void sendProductClick(card);
            });
        });
        if (showCompare && cards.length > 1) {
            const compareButton = document.createElement('button');
            compareButton.className = 'chatbot-product-compare';
            compareButton.type = 'button';
            compareButton.textContent = copy.compareProducts;
            compareButton.addEventListener('click', () => {
                void sendMessage(`${copy.comparePromptPrefix} ${cards.map((card) => card.sku || card.title).join(' vs ')}`);
            });
            list.append(compareButton);
        }
        return list;
    }
    function renderProductComparison(comparison) {
        const table = document.createElement('div');
        table.className = 'chatbot-comparison';
        const headings = comparison.products
            .map((product) => `<th scope="col">${escapeHtml(product.sku || product.title)}</th>`)
            .join('');
        const rows = comparison.rows
            .map((row) => `
          <tr>
            <th scope="row">${escapeHtml(row.label)}</th>
            ${comparison.products
            .map((product) => {
            const value = row.values.find((item) => item.productId === product.id)?.value ?? '-';
            return `<td>${escapeHtml(value)}</td>`;
        })
            .join('')}
          </tr>
        `)
            .join('');
        table.innerHTML = `
      <strong>${escapeHtml(comparison.title)}</strong>
      <table>
        <thead><tr><th scope="col"></th>${headings}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
        return table;
    }
    async function sendFeedback(rating, assistantMessage) {
        if (!config)
            return;
        await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                conversationId,
                rating,
                assistantMessage,
                userMessage: lastUserMessage(),
                locale: activeLocale(config),
            }),
        }).catch(() => undefined);
        emit('feedback', { rating });
    }
    async function sendProductClick(card) {
        if (!config)
            return;
        const action = card.action === 'checkout_handoff' ? 'checkout_handoff_clicked' : 'product_clicked';
        emit(action, {
            productId: card.id,
            sku: card.sku,
            title: card.title,
            productUrl: card.productUrl,
            action: card.action,
        });
        await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/actions`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                conversationId,
                action,
                status: 'completed',
                confidence: 'customer_click',
                locale: activeLocale(config),
                metadata: {
                    productId: card.id,
                    sku: card.sku,
                    title: card.title,
                    productUrl: card.productUrl,
                    productCardAction: card.action,
                },
            }),
        }).catch(() => undefined);
    }
    async function sendBookingClick(bookingUrl) {
        if (!config)
            return;
        emit('booking_link_clicked', { bookingUrl });
        await fetch(`${apiUrl}/public/sites/${encodeURIComponent(siteId)}/actions`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                conversationId,
                action: 'booking_link_clicked',
                status: 'completed',
                confidence: 'customer_click',
                locale: activeLocale(config),
                metadata: { bookingUrl },
            }),
        }).catch(() => undefined);
    }
    function emit(eventName, payload) {
        for (const handler of handlers.get(eventName) ?? [])
            handler(payload);
        window.dispatchEvent(new CustomEvent(`chatbot:${eventName}`, { detail: payload }));
    }
})();
function readState(key) {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}');
        persisted.conversationId = typeof parsed.conversationId === 'string' ? parsed.conversationId : null;
        persisted.visitorId = typeof parsed.visitorId === 'string' ? parsed.visitorId : '';
        persisted.messages = Array.isArray(parsed.messages)
            ? parsed.messages
                .map(normalizePersistedMessage)
                .filter((item) => item !== null)
                .slice(-30)
            : [];
    }
    catch {
        persisted.conversationId = null;
        persisted.visitorId = '';
        persisted.messages = [];
    }
    return persisted;
}
function writeState(key, state) {
    try {
        window.localStorage.setItem(key, JSON.stringify(state));
    }
    catch {
        // Storage is optional; the widget still works without persistence.
    }
}
function trimPersistedMessages() {
    persisted.messages = persisted.messages.slice(-30);
}
function textField(formData, key) {
    const value = formData.get(key);
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined;
}
function lastUserMessage() {
    return [...persisted.messages].reverse().find((message) => message.role === 'user')?.text;
}
function normalizePersistedMessage(value) {
    if (!value || typeof value !== 'object')
        return null;
    const record = value;
    if (record.role !== 'user' && record.role !== 'assistant')
        return null;
    if (typeof record.text !== 'string')
        return null;
    const productCards = normalizeProductCards(record.productCards);
    const productComparison = normalizeProductComparison(record.productComparison);
    const bookingUrl = safeExternalUrl(record.bookingUrl);
    return {
        role: record.role,
        text: record.text,
        productCards: productCards.length > 0 ? productCards : undefined,
        ...(productComparison ? { productComparison } : {}),
        ...(bookingUrl ? { bookingUrl } : {}),
    };
}
function normalizeProductCards(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        if (!item || typeof item !== 'object')
            return null;
        const record = item;
        const id = textOrNull(record['id']);
        const title = textOrNull(record['title']);
        if (!id || !title)
            return null;
        const availability = record['availability'];
        const action = record['action'] === 'checkout_handoff' ? 'checkout_handoff' : 'view_product';
        return {
            id,
            title,
            sku: textOrNull(record['sku']),
            brand: textOrNull(record['brand']),
            category: textOrNull(record['category']),
            description: textOrNull(record['description']),
            priceLabel: textOrNull(record['priceLabel']),
            availability: availability === 'in_stock' || availability === 'out_of_stock' || availability === 'preorder'
                ? availability
                : 'unknown',
            imageUrl: textOrNull(record['imageUrl']),
            productUrl: textOrNull(record['productUrl']),
            action,
            actionLabel: textOrNull(record['actionLabel']),
            reason: textOrNull(record['reason']) ?? '',
        };
    })
        .filter((item) => item !== null)
        .slice(0, 4);
}
function normalizeProductComparison(value) {
    if (!value || typeof value !== 'object')
        return null;
    const record = value;
    const title = textOrNull(record['title']);
    const products = normalizeComparisonProducts(record['products']);
    const rows = normalizeComparisonRows(record['rows'], new Set(products.map((product) => product.id)));
    if (!title || products.length < 2 || rows.length === 0)
        return null;
    return { title, products, rows };
}
function normalizeComparisonProducts(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        if (!item || typeof item !== 'object')
            return null;
        const record = item;
        const id = textOrNull(record['id']);
        const title = textOrNull(record['title']);
        if (!id || !title)
            return null;
        return {
            id,
            title,
            sku: textOrNull(record['sku']),
        };
    })
        .filter((item) => item !== null)
        .slice(0, 4);
}
function normalizeComparisonRows(value, productIds) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        if (!item || typeof item !== 'object')
            return null;
        const record = item;
        const label = textOrNull(record['label']);
        if (!label || !Array.isArray(record['values']))
            return null;
        const values = record['values']
            .map((cell) => {
            if (!cell || typeof cell !== 'object')
                return null;
            const cellRecord = cell;
            const productId = textOrNull(cellRecord['productId']);
            const text = textOrNull(cellRecord['value']);
            if (!productId || !productIds.has(productId) || !text)
                return null;
            return { productId, value: text };
        })
            .filter((cell) => cell !== null)
            .slice(0, 4);
        return values.length > 0 ? { label, values } : null;
    })
        .filter((item) => item !== null)
        .slice(0, 12);
}
function textOrNull(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null;
}
function safeExternalUrl(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    }
    catch {
        return null;
    }
}
function productCardMeta(card, copy) {
    return [
        card.brand,
        card.category,
        card.priceLabel,
        availabilityLabel(card.availability, copy),
    ]
        .filter(Boolean)
        .join(' | ');
}
function availabilityLabel(availability, copy) {
    if (availability === 'in_stock')
        return copy.inStock;
    if (availability === 'out_of_stock')
        return copy.outOfStock;
    if (availability === 'preorder')
        return copy.preorder;
    return copy.unknownStock;
}
function activeLocale(config) {
    const locale = preferredLocale({
        explicitLocale: window.CHATBOT_LOCALE,
        supportedLocales: config.supportedLocales,
        fallbackLocale: config.defaultLocale,
    });
    window.CHATBOT_LOCALE = locale;
    return locale;
}
function preferredLocale(input) {
    const supported = input.supportedLocales.length > 0 ? input.supportedLocales : ['bg', 'en'];
    const candidates = [
        input.explicitLocale,
        ...browserLanguages(),
        input.fallbackLocale,
        'bg',
        'en',
    ];
    for (const candidate of candidates) {
        const locale = candidate?.toLowerCase().split('-')[0];
        if (locale && supported.includes(locale))
            return locale;
    }
    return supported[0] ?? 'bg';
}
function browserLanguages() {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0)
        return [...navigator.languages];
    return navigator.language ? [navigator.language] : [];
}
function widgetCopy(locale) {
    return locale === 'bg' ? widgetCopyBg : widgetCopyEn;
}
const widgetCopyBg = {
    aiNote: 'AI асистент. Не споделяйте пароли, данни за плащане или друга чувствителна информация.',
    askQuestion: 'Задайте въпрос',
    assistantUnavailable: 'Асистентът временно не е достъпен. Моля, опитайте отново по-късно.',
    bookMeeting: 'Запази среща',
    chat: 'Чат',
    closeChat: 'Затвори чата',
    company: 'Фирма',
    contactFailed: 'Не успях да изпратя контактната заявка. Моля, опитайте отново.',
    contactRequest: 'Заявка за контакт от чат уиджета',
    contactRequired: 'Моля, добавете email или телефон.',
    contactSent: 'Благодаря. Контактната заявка беше изпратена.',
    compareProducts: 'Сравни',
    comparePromptPrefix: 'Сравни',
    email: 'Email',
    helpful: 'Полезно',
    name: 'Име',
    notHelpful: 'Не е полезно',
    openChat: 'Отвори чата',
    phone: 'Телефон',
    send: 'Изпрати',
    sendContact: 'Изпрати контакт',
    sendMessage: 'Изпрати съобщение',
    typing: 'Пише...',
    viewProduct: 'Виж продукта',
    inStock: 'Наличен',
    outOfStock: 'Изчерпан',
    preorder: 'Предварителна поръчка',
    unknownStock: 'Наличност по запитване',
};
const widgetCopyEn = {
    aiNote: 'AI assistant. Do not share sensitive payment or password data.',
    askQuestion: 'Ask a question',
    assistantUnavailable: 'The assistant is unavailable right now. Please try again later.',
    bookMeeting: 'Book meeting',
    chat: 'Chat',
    closeChat: 'Close chat',
    company: 'Company',
    contactFailed: 'I could not send the contact request. Please try again.',
    contactRequest: 'Contact request from chatbot widget',
    contactRequired: 'Please add an email or phone number.',
    contactSent: 'Thanks. Your contact request was sent.',
    compareProducts: 'Compare',
    comparePromptPrefix: 'Compare',
    email: 'Email',
    helpful: 'Helpful',
    name: 'Name',
    notHelpful: 'Not helpful',
    openChat: 'Open chat',
    phone: 'Phone',
    send: 'Send',
    sendContact: 'Send contact',
    sendMessage: 'Send message',
    typing: 'Typing...',
    viewProduct: 'View product',
    inStock: 'In stock',
    outOfStock: 'Out of stock',
    preorder: 'Preorder',
    unknownStock: 'Availability on request',
};
function createVisitorId() {
    if ('randomUUID' in crypto)
        return `visitor_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    return `visitor_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function css(branding) {
    const side = branding.launcherPosition === 'bottom-left' ? 'left' : 'right';
    const opposite = branding.launcherPosition === 'bottom-left' ? 'right' : 'left';
    return `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    .chatbot-wrap { position: fixed; bottom: 20px; ${side}: 20px; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .chatbot-panel { display: none; width: min(380px, calc(100vw - 32px)); height: min(620px, calc(100vh - 104px)); margin-bottom: 12px; overflow: hidden; border: 1px solid #d7dce5; border-radius: 12px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.22); }
    .chatbot-panel.is-open { display: flex; flex-direction: column; }
    .chatbot-header { display: flex; align-items: center; gap: 10px; padding: 12px; background: ${branding.primaryColor}; color: #fff; }
    .chatbot-avatar { display: grid; place-items: center; width: 34px; height: 34px; overflow: hidden; border-radius: 50%; background: rgba(255,255,255,0.18); font-weight: 800; }
    .chatbot-avatar img { width: 100%; height: 100%; object-fit: cover; background: #fff; }
    .chatbot-heading { display: grid; min-width: 0; flex: 1; }
    .chatbot-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 18px; }
    .chatbot-heading span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.82; font-size: 12px; line-height: 16px; }
    .chatbot-icon { width: 30px; height: 30px; border: 0; border-radius: 6px; color: #fff; background: rgba(255,255,255,0.16); cursor: pointer; }
    .chatbot-ai-note { padding: 8px 12px; border-bottom: 1px solid #eef1f5; color: #5c667a; background: #f8fafc; font-size: 11px; line-height: 15px; }
    .chatbot-messages { flex: 1; overflow: auto; padding: 14px 12px; background: #fff; }
    .chatbot-message-row { display: flex; margin-bottom: 10px; }
    .chatbot-message-row.user { justify-content: flex-end; }
    .chatbot-message-stack { display: grid; gap: 8px; max-width: 92%; }
    .chatbot-message-row.user .chatbot-message-stack { justify-items: end; max-width: 82%; }
    .chatbot-message { max-width: 82%; white-space: pre-wrap; border-radius: 12px; padding: 9px 11px; font-size: 13px; line-height: 18px; color: #172033; background: #eef2f7; }
    .chatbot-message-stack .chatbot-message { max-width: 100%; }
    .chatbot-message-row.user .chatbot-message { color: #fff; background: ${branding.primaryColor}; }
    .chatbot-feedback { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chatbot-feedback button { border: 1px solid #cfd6e2; border-radius: 6px; background: #fff; color: #334155; padding: 4px 7px; font-size: 11px; cursor: pointer; }
    .chatbot-booking-link { justify-self: start; border-radius: 6px; background: ${branding.primaryColor}; color: #fff; padding: 7px 10px; font-size: 12px; font-weight: 800; line-height: 14px; text-decoration: none; }
    .chatbot-product-cards { display: grid; gap: 8px; }
    .chatbot-product-card { display: grid; grid-template-columns: 68px 1fr; gap: 10px; overflow: hidden; border: 1px solid #dbe3ef; border-radius: 8px; background: #fff; }
    .chatbot-product-card.no-image { grid-template-columns: 1fr; }
    .chatbot-product-card img { width: 68px; height: 100%; min-height: 88px; object-fit: cover; background: #f8fafc; }
    .chatbot-product-body { display: grid; gap: 4px; min-width: 0; padding: 8px 8px 8px 0; }
    .chatbot-product-card.no-image .chatbot-product-body { padding: 8px; }
    .chatbot-product-body strong { overflow-wrap: anywhere; color: #172033; font-size: 13px; line-height: 17px; }
    .chatbot-product-body span, .chatbot-product-body p, .chatbot-product-body small { margin: 0; color: #64748b; font-size: 11px; line-height: 15px; }
    .chatbot-product-body p { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .chatbot-product-body a { justify-self: start; border-radius: 6px; background: ${branding.primaryColor}; color: #fff; padding: 6px 8px; font-size: 11px; font-weight: 800; line-height: 14px; text-decoration: none; }
    .chatbot-product-compare { justify-self: start; border: 1px solid #cfd6e2; border-radius: 6px; background: #fff; color: #172033; padding: 6px 9px; font-size: 11px; font-weight: 800; cursor: pointer; }
    .chatbot-comparison { max-width: 100%; overflow-x: auto; border: 1px solid #dbe3ef; border-radius: 8px; background: #fff; }
    .chatbot-comparison > strong { display: block; padding: 8px 9px; color: #172033; font-size: 12px; line-height: 16px; }
    .chatbot-comparison table { width: 100%; min-width: 300px; border-collapse: collapse; color: #334155; font-size: 11px; line-height: 15px; }
    .chatbot-comparison th, .chatbot-comparison td { max-width: 140px; border-top: 1px solid #eef1f5; padding: 7px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    .chatbot-comparison th { color: #172033; font-weight: 800; background: #f8fafc; }
    .chatbot-lead { display: none; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 12px; border-top: 1px solid #eef1f5; background: #f8fafc; }
    .chatbot-lead.is-open { display: grid; }
    .chatbot-lead input { min-width: 0; border: 1px solid #cfd6e2; border-radius: 8px; padding: 8px; font: inherit; font-size: 12px; }
    .chatbot-lead button { grid-column: 1 / -1; border: 0; border-radius: 8px; padding: 9px; color: #fff; background: ${branding.primaryColor}; font-weight: 700; cursor: pointer; }
    .chatbot-compose { display: flex; align-items: end; gap: 8px; padding: 10px 12px; border-top: 1px solid #eef1f5; background: #fff; }
    .chatbot-compose textarea { min-height: 38px; max-height: 92px; flex: 1; resize: none; border: 1px solid #cfd6e2; border-radius: 9px; padding: 9px; font: inherit; font-size: 13px; outline: none; }
    .chatbot-compose textarea:focus { border-color: ${branding.primaryColor}; box-shadow: 0 0 0 3px color-mix(in srgb, ${branding.primaryColor} 20%, transparent); }
    .chatbot-compose button { min-width: 64px; height: 38px; border: 0; border-radius: 9px; color: #fff; background: ${branding.primaryColor}; font-weight: 800; cursor: pointer; }
    .chatbot-launcher { float: ${opposite}; display: grid; place-items: center; width: 62px; height: 62px; border: 0; border-radius: 50%; color: #fff; background: ${branding.primaryColor}; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.24); font-weight: 800; cursor: pointer; }
    .chatbot-launcher img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; background: #fff; }
    @media (max-width: 480px) {
      .chatbot-wrap { left: 12px; right: 12px; bottom: 12px; }
      .chatbot-panel { width: 100%; height: min(620px, calc(100vh - 92px)); }
      .chatbot-launcher { ${side}: 0; }
    }
  `;
}
export {};

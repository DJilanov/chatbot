(function () {
  const supportedLocales = ['bg', 'en'];
  const defaultLocale = 'bg';
  const localeStorageKey = 'assistant-saas-locale';
  const demoSiteId = window.CHATBOT_DEMO_SITE_ID || 'site_demo';
  const apiUrl = (window.CHATBOT_API_URL || window.location.origin).replace(/\/+$/, '');
  const originalTextNodes = new WeakMap();
  const originalAttributes = new WeakMap();

  let currentLocale = defaultLocale;

  function bootstrap() {
    currentLocale = detectPreferredLocale();
    window.CHATBOT_LOCALE = currentLocale;
    applyLocale(currentLocale, { notifyWidget: false, persist: false });
    bindLanguageSwitch();
    bindChatButtons();
    bindDemoForm();
  }

  function bindLanguageSwitch() {
    document.querySelectorAll('[data-locale-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const locale = normalizeLocale(button.getAttribute('data-locale-option'));
        if (!locale) return;
        applyLocale(locale, { notifyWidget: true, persist: true });
      });
    });
  }

  function bindChatButtons() {
    document.querySelectorAll('[data-open-chat]').forEach((button) => {
      button.addEventListener('click', () => {
        void runWithChatbot(button, async (chatbot) => {
          chatbot.open();
        });
      });
    });

    document.querySelectorAll('[data-demo-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        const prompt = button.getAttribute('data-demo-prompt') || '';
        if (!prompt) return;
        void runWithChatbot(button, async (chatbot) => {
          chatbot.open();
          await chatbot.send(prompt);
        });
      });
    });
  }

  function bindDemoForm() {
    const form = document.querySelector('#demo-form');
    const status = document.querySelector('#form-status');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitDemoForm(form, status);
    });
  }

  function applyLocale(locale, options) {
    currentLocale = locale;
    window.CHATBOT_LOCALE = locale;
    document.documentElement.lang = locale;
    document.title = translation().title;
    setMeta('name', 'description', translation().description);
    setMeta('property', 'og:title', translation().ogTitle);
    setMeta('property', 'og:description', translation().ogDescription);
    translateTextNodes(locale);
    translateAttributes(locale);
    updateLanguageSwitch(locale);

    if (options.persist) writeStoredLocale(locale);
    if (options.notifyWidget) {
      if (window.Chatbot?.setLocale) void window.Chatbot.setLocale(locale);
      window.dispatchEvent(new CustomEvent('chatbot:locale', { detail: { locale } }));
    }
  }

  async function submitDemoForm(formElement, statusElement) {
    const values = Object.fromEntries(new FormData(formElement).entries());
    const email = String(values.email || '').trim();
    const name = String(values.name || '').trim();
    const phone = String(values.phone || '').trim();
    const company = String(values.company || '').trim();
    if (!email || !name) {
      setStatus(statusElement, message('missingContact'), 'error');
      return;
    }

    setStatus(statusElement, message('sendingDemo'), '');
    try {
      const response = await fetch(`${apiUrl}/public/sites/${demoSiteId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: phone || undefined,
          company: company || undefined,
          message: demoRequestMessage(values),
          pageUrl: window.location.href,
          locale: currentLocale,
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(`lead_failed_${response.status}`);
      formElement.reset();
      setStatus(statusElement, message('demoSent'), 'success');
      void waitForChatbot()
        .then((chatbot) => {
          chatbot.open();
          return chatbot.send(message('bookedDemoChat', { email }));
        })
        .catch(() => undefined);
    } catch {
      setStatus(statusElement, message('demoApiUnavailable'), 'error');
    }
  }

  async function runWithChatbot(button, action) {
    const originalText = button.textContent;
    let failed = false;
    setButtonBusy(button, message('assistantLoading'));
    try {
      const chatbot = await waitForChatbot();
      await action(chatbot);
    } catch {
      failed = true;
      clearButtonBusy(button, originalText);
      setTemporaryButtonText(button, message('assistantUnavailable'));
      document.querySelector('#demo-live')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      if (!failed) clearButtonBusy(button, originalText);
    }
  }

  function waitForChatbot() {
    const current = getReadyChatbot();
    if (current) return Promise.resolve(current);

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timeoutMs = 8000;
      let intervalId = 0;

      const cleanup = () => {
        window.removeEventListener('chatbot:ready', onReady);
        if (intervalId) window.clearInterval(intervalId);
      };

      const resolveIfReady = () => {
        const chatbot = getReadyChatbot();
        if (!chatbot) return false;
        cleanup();
        resolve(chatbot);
        return true;
      };

      const onReady = () => {
        resolveIfReady();
      };

      window.addEventListener('chatbot:ready', onReady);
      intervalId = window.setInterval(() => {
        if (resolveIfReady()) return;
        if (Date.now() - startedAt >= timeoutMs) {
          cleanup();
          reject(new Error('chatbot_not_ready'));
        }
      }, 100);

      resolveIfReady();
    });
  }

  function getReadyChatbot() {
    const chatbot = window.Chatbot;
    if (!chatbot || typeof chatbot.open !== 'function' || typeof chatbot.send !== 'function') return null;
    if (typeof chatbot.isReady === 'function' && !chatbot.isReady()) return null;
    return chatbot;
  }

  function setButtonBusy(button, text) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = text;
  }

  function clearButtonBusy(button, originalText) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (originalText) button.textContent = originalText;
  }

  function demoRequestMessage(values) {
    const website = String(values.website || '').trim() || '-';
    const platform = String(values.platform || '').trim() || '-';
    const company = String(values.company || '').trim() || '-';
    const goal = String(values.goal || '').trim() || '-';
    const timeline = String(values.timeline || '').trim() || '-';
    if (currentLocale === 'bg') {
      return [
        'Заявка за демо от лендинг страницата',
        '',
        '--- Квалификация ---',
        'Намерение: Запазване на демо',
        `Фирма: ${company}`,
        `Сайт: ${website}`,
        `Ecommerce платформа: ${platform}`,
        `Основна цел: ${goal}`,
        `Срок: ${timeline}`,
        `Език: ${currentLocale}`,
      ].join('\n');
    }
    return [
      'Demo request from landing page',
      '',
      '--- Qualification ---',
      'Intent: Book a demo',
      `Company: ${company}`,
      `Website: ${website}`,
      `Ecommerce platform: ${platform}`,
      `Main goal: ${goal}`,
      `Timeline: ${timeline}`,
      `Language: ${currentLocale}`,
    ].join('\n');
  }

  function translateTextNodes(locale) {
    const dictionary = translations[locale]?.text || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    for (const node of nodes) {
      const original = originalTextNodes.get(node) || node.nodeValue || '';
      if (!originalTextNodes.has(node)) originalTextNodes.set(node, original);
      const normalized = normalizeText(original);
      const translated = dictionary[normalized] || original;
      node.nodeValue = preserveOuterWhitespace(original, translated);
    }
  }

  function translateAttributes(locale) {
    const attributes = translations[locale]?.attributes || {};
    applyTranslatedAttribute('placeholder', attributes.placeholder || {});
    applyTranslatedAttribute('alt', attributes.alt || {});
    applyTranslatedAttribute('aria-label', attributes.ariaLabel || {});
    applyTranslatedAttribute('data-demo-prompt', attributes.demoPrompt || {});
  }

  function applyTranslatedAttribute(attribute, dictionary) {
    document.querySelectorAll(`[${attribute}]`).forEach((element) => {
      const saved = originalAttributes.get(element) || {};
      if (!(attribute in saved)) saved[attribute] = element.getAttribute(attribute) || '';
      originalAttributes.set(element, saved);
      const original = saved[attribute];
      element.setAttribute(attribute, dictionary[original] || original);
    });
  }

  function updateLanguageSwitch(locale) {
    document.querySelectorAll('[data-locale-option]').forEach((button) => {
      const active = button.getAttribute('data-locale-option') === locale;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = `form-status ${kind}`.trim();
  }

  function setTemporaryButtonText(button, text) {
    const original = button.textContent;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }

  function message(key, params) {
    const template = translation().messages[key] || translations.en.messages[key] || '';
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] || ''));
  }

  function translation() {
    return translations[currentLocale] || translations[defaultLocale];
  }

  function detectPreferredLocale() {
    const stored = normalizeLocale(readStoredLocale());
    if (stored) return stored;

    for (const language of browserLanguages()) {
      const locale = normalizeLocale(language);
      if (locale) return locale;
    }

    return defaultLocale;
  }

  function browserLanguages() {
    const values = Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
    return values.filter(Boolean);
  }

  function normalizeLocale(value) {
    const locale = String(value || '').toLowerCase().split('-')[0];
    return supportedLocales.includes(locale) ? locale : null;
  }

  function readStoredLocale() {
    try {
      return window.localStorage.getItem(localeStorageKey);
    } catch {
      return null;
    }
  }

  function writeStoredLocale(locale) {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {
      // The language switch still works for the current page without storage.
    }
  }

  function setMeta(attribute, name, content) {
    document.querySelector(`meta[${attribute}="${name}"]`)?.setAttribute('content', content);
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function preserveOuterWhitespace(original, translated) {
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    return `${leading}${translated}${trailing}`;
  }

  const translations = {
    en: {
      title: 'Assistant SaaS | AI Product and Support Assistant',
      description:
        'Add a managed AI assistant for ecommerce and service websites: approved answers, product guidance, lead capture, support handoff, and audit-ready actions.',
      ogTitle: 'Assistant SaaS | AI Product and Support Assistant',
      ogDescription:
        'A managed AI assistant for business websites and online stores: product guidance, approved support answers, qualified leads, and clear human handoff.',
      messages: {
        bookedDemoChat: 'I booked a demo. My email is {email}',
        demoApiUnavailable: 'The demo API is unavailable right now. Please try again shortly.',
        demoSent: 'Demo request sent. We will contact you shortly.',
        missingContact: 'Please add your name and email.',
        sendingDemo: 'Sending demo request...',
        assistantLoading: 'Opening assistant...',
        assistantUnavailable: 'The assistant is still loading. Please try again.',
      },
      attributes: {},
      text: {},
    },
    bg: {
      title: 'Assistant SaaS | AI асистент за продукти и поддръжка',
      description:
        'Добавете управляван AI асистент за онлайн магазини и сайтове за услуги: одобрени отговори, продуктови насоки, лийдове, support handoff и проследими действия.',
      ogTitle: 'Assistant SaaS | AI асистент за продукти и поддръжка',
      ogDescription:
        'Управляван AI асистент за бизнес сайтове и онлайн магазини: продуктови насоки, одобрени support отговори, квалифицирани лийдове и ясно човешко поемане.',
      messages: {
        bookedDemoChat: 'Запазих демо. Моят email е {email}',
        demoApiUnavailable: 'Демо API временно не е достъпно. Моля, опитайте отново след малко.',
        demoSent: 'Заявката за демо е изпратена. Ще се свържем с вас скоро.',
        missingContact: 'Моля, добавете име и email.',
        sendingDemo: 'Изпращане на заявката за демо...',
        assistantLoading: 'Отварям асистента...',
        assistantUnavailable: 'Асистентът още се зарежда. Опитайте отново.',
      },
      attributes: {
        alt: {
          'AI assistant dashboard with chat widget, product cards, analytics, and action audit':
            'Табло на AI асистент с чат уиджет, продуктови карти, аналитика и журнал на действията',
          'Jilanov.com logo': 'Лого Jilanov.com',
        },
        ariaLabel: {
          'Assistant SaaS compared with generic chatbots':
            'Сравнение между Assistant SaaS и стандартни чатботи',
          'Assistant SaaS home': 'Начало на Assistant SaaS',
          'Footer navigation': 'Навигация във футъра',
          Language: 'Език',
          'Primary navigation': 'Основна навигация',
          'Product proof': 'Доказателства за продукта',
          'Product proof points': 'Ключови доказателства за продукта',
          'Product tour': 'Продуктова обиколка',
        },
        demoPrompt: {
          'Can it work with ecommerce?': 'Работи ли с онлайн магазини?',
          'How much does it cost?': 'Колко струва?',
          'I want to speak with support': 'Искам разговор с поддръжка',
          'What does the assistant do?': 'Какво прави асистентът?',
        },
        placeholder: {
          'Shopify, WooCommerce, OpenCart, custom...':
            'Shopify, WooCommerce, OpenCart, custom...',
          'https://example.com': 'https://example.com',
        },
      },
      text: {
        'A 30-day pilot with clear acceptance criteria':
          '30-дневен пилот с ясни критерии за приемане',
        'A good demo shows more than a chat bubble. It shows the visitor question, the answer, the captured lead, the notification, and the audit record behind the action.':
          'Доброто демо показва повече от чат балон. Показва въпроса на посетителя, отговора, събрания лийд, известието и журнала зад действието.',
        'A managed AI assistant for business websites and online stores: product guidance, approved support answers, qualified leads, and clear human handoff.':
          'Управляван AI асистент за бизнес сайтове и онлайн магазини: продуктови насоки, одобрени support отговори, квалифицирани лийдове и ясно човешко поемане.',
        'A pilot should prove real conversations, qualified leads, staff handoffs, email delivery, product interest, and the unanswered questions that become the next knowledge update.':
          'Пилотът трябва да докаже реални разговори, квалифицирани лийдове, предавания към екипа, email доставка, продуктов интерес и въпросите, които стават следващото обновяване на знанията.',
        'Add a managed AI assistant for ecommerce and service websites: approved answers, product guidance, lead capture, support handoff, and audit-ready actions.':
          'Добавете управляван AI асистент за онлайн магазини и сайтове за услуги: одобрени отговори, продуктови насоки, лийдове, support handoff и проследими действия.',
        'AI assistant that helps visitors choose, ask, and buy':
          'AI асистент, който помага на посетителите да избират, питат и купуват',
        'Approved knowledge first': 'Първо одобрени знания',
        'Approved knowledge is used before AI fallback.':
          'Одобрените знания се използват преди AI fallback.',
        'Answer from policy': 'Отговори от политики',
        'Assistant SaaS | AI Product and Support Assistant':
          'Assistant SaaS | AI асистент за продукти и поддръжка',
        'Built for local teams that need practical automation':
          'Създаден за екипи, които имат нужда от практична автоматизация',
        'Business users maintain official answers for services, pricing, delivery, invoices, returns, warranty, and support.':
          'Бизнес потребителите поддържат официални отговори за услуги, цени, доставка, фактури, връщания, гаранция и поддръжка.',
        'Can my team edit answers?': 'Може ли екипът ми да редактира отговорите?',
        'Capture name, email, phone, company, website URL, consent, source page, and the request that triggered the lead.':
          'Събира име, email, телефон, фирма, URL на сайт, съгласие, източник и заявката, която е създала лийда.',
        'Capture real intent': 'Събира реален интерес',
        'Clean follow-up': 'Ясно последващо действие',
        'Collect contact details, company context, product interest, and consent when the visitor is ready.':
          'Събира контакт, фирмен контекст, продуктов интерес и съгласие, когато посетителят е готов.',
        'Commerce mode connects the assistant to real product data and keeps customer actions tied to confirmed website events.':
          'Commerce режимът свързва асистента с реални продуктови данни и държи клиентските действия вързани към потвърдени събития от сайта.',
        'Commerce-ready path': 'Път към commerce',
        'Completed by Resend provider': 'Завършено чрез Resend provider',
        'Configured and reviewed by the Jilanov team':
          'Настроено и преглеждано от екипа на Jilanov',
        'Configure sites, edit knowledge, review leads, inspect analytics, and diagnose important answers.':
          'Настройвате сайтове, редактирате знания, преглеждате лийдове, следите аналитика и диагностицирате важните отговори.',
        'Conversation': 'Разговор',
        'Conversation only': 'Само разговор',
        'Conversation retention controls and privacy links for GDPR-ready deployments.':
          'Контроли за задържане на разговори и privacy връзки за GDPR-ready внедрявания.',
        'Controlled answers': 'Контролирани отговори',
        'Controls for orders, prices, payments, and customer data':
          'Контроли за поръчки, цени, плащания и клиентски данни',
        'Domain allowlist, rate limits, output sanitization, and public widget token boundaries.':
          'Domain allowlist, rate limits, output sanitization и граници на публичния widget token.',
        'Deliver lead and support handoff notifications by email or webhook without losing the conversation context.':
          'Изпраща известия за лийдове и support handoff по email или webhook, без да се губи контекстът на разговора.',
        'FAQ answers, lead qualification, contact capture, demo routing, email notifications, webhooks, and analytics.':
          'FAQ отговори, квалификация на лийдове, събиране на контакт, насочване към демо, email известия, webhooks и аналитика.',
        'HubSpot planned': 'HubSpot планирано',
        'I want to speak with support': 'Искам разговор с поддръжка',
        'Inspect leads, conversations, support tickets, and action audit events.':
          'Преглеждате лийдове, разговори, support tickets и събития в журнала на действията.',
        'Lead': 'Лийд',
        'Lead Assistant for one business website with knowledge answers, contact capture, and basic analytics.':
          'Lead Assistant за един бизнес сайт с одобрени отговори, събиране на контакт и базова аналитика.',
        'Leads, handoffs, and audit in one place':
          'Лийдове, handoff-и и журнал на едно място',
        'Let visitors try the assistant before they book':
          'Нека посетителите пробват асистента преди среща',
        'Live widget, admin workflow, and action audit make the product concrete. Clients can see how the assistant is configured, reviewed, and improved after launch.':
          'Live widget, админ процесът и журналът правят продукта конкретен. Клиентите виждат как асистентът се настройва, преглежда и подобрява след старт.',
        'Launch a controlled pilot without redesigning the site':
          'Стартирайте контролиран пилот без redesign на сайта',
        'Managed assistant for commerce teams':
          'Управляван асистент за търговски екипи',
        'Most teams do not want another tool to babysit. They need a reliable assistant that understands Bulgarian customers, respects company rules, and fits into the website they already operate.':
          'Повечето екипи не искат още един инструмент за наблюдение. Трябва им надежден асистент, който разбира българските клиенти, спазва фирмените правила и влиза в сайта, който вече използват.',
        'Natural Bulgarian by default': 'Естествен български по подразбиране',
        'More usage, multiple users, knowledge history, webhooks, lead inbox, and deeper reporting.':
          'Повече usage, много потребители, история на знанията, webhooks, lead inbox и по-дълбоки отчети.',
        'Notify the team': 'Известяване на екипа',
        'Packages aligned to the work the assistant handles':
          'Пакети според работата, която асистентът поема',
        'Pipedrive planned': 'Pipedrive планирано',
        'Prices are starting points. The final offer depends on traffic, knowledge volume, ecommerce integrations, and whether your team or ours manages the assistant.':
          'Цените са начални ориентири. Финалната оферта зависи от трафика, обема знания, ecommerce интеграциите и дали вашият или нашият екип управлява асистента.',
        'Product discovery, product cards, comparison, cart handoff, checkout handoff, and order-support routing.':
          'Откриване на продукти, продуктови карти, сравнение, предаване към количка, checkout handoff и насочване за поръчки.',
        'Product feed, product cards, comparison, ecommerce handoff actions, and support queue.':
          'Продуктов фийд, продуктови карти, сравнение, ecommerce handoff действия и support queue.',
        'Product screens clients can inspect during the demo':
          'Продуктови екрани, които клиентите виждат по време на демо',
        'Product-aware answers without fake confirmations':
          'Продуктови отговори без фалшиви потвърждения',
        'Proof': 'Доказателства',
        'Qualified requests arrive with contact details, page context, language, and the visitor\'s original need.':
          'Квалифицираните заявки пристигат с контакт, контекст от страницата, език и първоначалната нужда на посетителя.',
        'Review': 'Преглед',
        'Review every action': 'Преглед на всяко действие',
        'Safe product and checkout boundaries':
          'Сигурни продуктови и checkout граници',
        'See the assistant mapped to your website':
          'Вижте асистента спрямо вашия сайт',
        'See what was answered, what was blocked, what was handed off, and why.':
          'Виждате какво е отговорено, какво е блокирано, какво е предадено към екип и защо.',
        'See why the assistant answered, asked for contact details, created a handoff, or blocked an unsafe request.':
          'Виждате защо асистентът е отговорил, поискал контакт, създал handoff или блокирал рискова заявка.',
        'Send every qualified request to the right place':
          'Изпраща всяка квалифицирана заявка към правилното място',
        'Share your site, platform, main goal, and timeline. We will review the use case and show where the assistant can help without overpromising.':
          'Споделете сайт, платформа, основна цел и срок. Ще прегледаме случая и ще покажем къде асистентът може да помогне без излишни обещания.',
        'Show the full customer path in one glance':
          'Покажете целия клиентски път с един поглед',
        'Start small: configure the assistant, add the first approved answers, install the widget, and review the first conversations in the admin console.':
          'Започнете малко: настройте асистента, добавете първите одобрени отговори, инсталирайте уиджета и прегледайте първите разговори в админ конзолата.',
        'Start with questions and leads, then connect product feeds, product cards, comparison, and checkout handoff.':
          'Започнете с въпроси и лийдове, после свържете продуктови фийдове, продуктови карти, сравнение и checkout handoff.',
        'Start with leads. Add commerce when the data is ready.':
          'Започнете с лийдове. Добавете commerce, когато данните са готови.',
        'The assistant is measured by what it completes: answered questions, captured demand, support handoffs, product clicks, and clear records your team can review.':
          'Асистентът се измерва по завършената работа: отговорени въпроси, събран интерес, support handoff-и, продуктови кликове и ясни записи за преглед.',
        'The assistant should be helpful without pretending to complete sensitive work. Risky cases are routed to staff or require confirmation from the connected system.':
          'Асистентът трябва да е полезен, без да се преструва, че е завършил чувствителни действия. Рисковите случаи се насочват към екип или изискват потвърждение от свързаната система.',
        'The controls behind a reliable assistant':
          'Контролите зад надежден асистент',
        'The first release can focus on qualified requests. Once the product data is clean, the same assistant can support product discovery, comparison, and checkout handoff.':
          'Първата версия може да се фокусира върху квалифицирани заявки. Когато продуктовите данни са подредени, същият асистент може да поддържа търсене на продукти, сравнение и checkout handoff.',
        'The live widget, admin workflow, and action audit make the product concrete. Clients can see how the assistant is configured, reviewed, and improved after launch.':
          'Live widget-ът, админ процесът и журналът правят продукта конкретен. Клиентите виждат как асистентът се настройва, преглежда и подобрява след старт.',
        'The page includes the real embeddable widget. Prompt buttons open the assistant and send real demo messages, so prospects can judge the experience before a meeting.':
          'Страницата включва реалния вграден widget. Prompt бутоните отварят асистента и изпращат реални demo съобщения, за да може клиентът да усети продукта преди среща.',
        'The product combines the customer-facing chat with the operational tools teams need: knowledge, leads, support handoff, analytics, and action review.':
          'Продуктът комбинира клиентския чат с оперативните инструменти, от които екипите имат нужда: знания, лийдове, support handoff, аналитика и преглед на действия.',
        'The public assistant starts in Bulgarian and can switch to English for international visitors.':
          'Публичният асистент започва на български и може да премине на английски за международни посетители.',
        'Track answered, pending, completed, failed, and blocked actions with confidence, reason, and source context.':
          'Следи отговорени, чакащи, завършени, неуспешни и блокирани действия с увереност, причина и източник.',
        'Turn website conversations into handled work':
          'Превърнете разговорите в сайта в свършена работа',
        'Unresolved or sensitive cases become staff handoffs with transcript, reason, locale, page URL, and contact details.':
          'Нерешените или чувствителни случаи стават handoff-и към екипа с transcript, причина, език, URL и контакти.',
        'Use approved business knowledge for pricing, delivery, warranty, returns, and service rules.':
          'Използва одобрени бизнес знания за цени, доставка, гаранция, връщане и сервизни правила.',
        'We set up and maintain a website assistant that answers from approved business knowledge, guides shoppers to the right product, captures qualified requests, and hands sensitive cases to your team with a clear record of what happened.':
          'Настройваме и поддържаме асистент за сайта, който отговаря от одобрени бизнес знания, насочва купувачите към правилния продукт, събира квалифицирани заявки и предава чувствителните случаи към екипа с ясен запис какво се е случило.',
        'We configure the widget, prepare the first knowledge base, test real scenarios, and tune the assistant after launch.':
          'Настройваме widget-а, подготвяме първата база знания, тестваме реални сценарии и настройваме асистента след старт.',
        'Webhooks': 'Webhooks',
        'What makes it operational, not just conversational':
          'Какво го прави оперативен, не само разговорен',
        'Widget experience': 'Widget изживяване',
        'Works with your current site': 'Работи с текущия ви сайт',
        'Your policies stay the source of truth':
          'Вашите политики остават източникът на истината',
        'Visible AI disclosure, saved conversation state, feedback buttons, lead fields, and prompt shortcuts.':
          'Видимо AI обозначение, запазено състояние на разговора, бутони за обратна връзка, lead полета и prompt shortcuts.',
        'A chatbot is not the product. The outcome is.':
          'Чатботът не е продуктът. Резултатът е.',
        'A safer pitch for companies that cannot afford hallucinated operations':
          'По-сигурен аргумент за компании, които не могат да си позволят измислени операции',
        '30-day pilot': '30-дневен пилот',
        'Action audit': 'Журнал на действията',
        'Action logs show status, confidence, reason, source text, reply, and review notes.':
          'Журналите показват статус, увереност, причина, източник, отговор и бележки от преглед.',
        'Action status, confidence, reason, metadata':
          'Статус, увереност, причина и метаданни',
        'Add approved answers': 'Добавяне на одобрени отговори',
        'Admin operations': 'Админ операции',
        'Admin users can manage approved knowledge entries without editing code.':
          'Админ потребителите управляват одобрени знания без промени по кода.',
        'AI lead assistant for websites and ecommerce stores':
          'AI асистент за лийдове за сайтове и онлайн магазини',
        'AI assistant for Bulgarian websites and ecommerce stores':
          'AI асистент за български сайтове и онлайн магазини',
        'AI sales and support assistant': 'AI асистент за продажби и поддръжка',
        'Answer safely': 'Отговаряйте сигурно',
        'Answered questions': 'Отговорени въпроси',
        'Answers your team controls': 'Отговори, които екипът контролира',
        'Assistant SaaS answers from approved business knowledge, captures qualified contacts, routes support handoffs, sends notifications, and records an action audit your team can review.':
          'Assistant SaaS отговаря от одобрени бизнес знания, събира квалифицирани контакти, насочва поддръжката, изпраща известия и записва журнал за преглед от екипа.',
        'Assistant SaaS workspace': 'Работно пространство Assistant SaaS',
        'Book a demo submissions become qualified leads and send an owner email with page, language, and qualification details.':
          'Заявките за демо стават квалифицирани лийдове и изпращат email към собственика със страница, език и квалификационни детайли.',
        'Book a demo': 'Запази демо',
        B2B: 'B2B',
        BG: 'BG',
        'Bulgarian language quality': 'Качество на български език',
        'Bulgarian market': 'Български пазар',
        'Bulgarian companies need fast setup, clear ownership, good local-language answers, and a team that can connect the assistant to the website or online store they already have.':
          'Българските компании имат нужда от бързо внедряване, ясна отговорност, добри отговори на местен език и екип, който може да свърже асистента със сайта или онлайн магазина, който вече използват.',
        'Bulgarian-first, English-ready': 'Първо български, готов и за английски',
        'Built from a production ecommerce assistant':
          'Изграден върху реален ecommerce асистент',
        'Business outcome': 'Бизнес резултат',
        'CSV product feed': 'CSV продуктов фийд',
        'Can it work with ecommerce platforms?': 'Работи ли с ecommerce платформи?',
        'Can it work with ecommerce?': 'Работи ли с онлайн магазини?',
        'Capture demand': 'Събирайте търсене',
        'Capture more leads': 'Събиране на повече лийдове',
        'Capability': 'Възможност',
        'Cart handoff': 'Предаване към количка',
        'Clear disclosure that visitors are interacting with an AI assistant.':
          'Ясно обозначение, че посетителите говорят с AI асистент.',
        'Commerce': 'Commerce',
        'Commerce Assistant': 'Commerce Assistant',
        'Common buyer objections': 'Чести възражения от купувачи',
        'Company': 'Фирма',
        'Company qualification, website URL, goal, timeline, lead review, and CRM-ready export.':
          'Квалификация на фирма, URL на сайта, цел, срок, преглед на лийда и CRM-ready експорт.',
        'Compare visible products by processor, display, memory, storage, grade, or custom specs':
          'Сравнява видими продукти по процесор, дисплей, памет, диск, клас или специфични характеристики',
        'Conversations, leads, duplicate leads, and support handoffs':
          'Разговори, лийдове, дублирани лийдове и предавания към поддръжка',
        'Configure sites, edit knowledge, review leads, inspect analytics, and diagnose assistant decisions.':
          'Настройвате сайтове, редактирате знания, преглеждате лийдове, следите аналитика и диагностицирате решенията на асистента.',
        'Connect the systems customers already use':
          'Свържете системите, които клиентите вече използват',
        'Contact': 'Контакт',
        'Create a site': 'Създаване на сайт',
        'Custom REST API': 'Custom REST API',
        'Demo': 'Демо',
        'Demo requests delivered by email': 'Заявките за демо пристигат по email',
        'Designed for multilingual websites and EU transparency rules':
          'Проектиран за многоезични сайтове и EU правила за прозрачност',
        'Differentiation': 'Разлика',
        'Done for you': 'Изпълнение от нас',
        'Ecommerce': 'Онлайн магазини',
        'Ecommerce flow': 'Ecommerce процес',
        'Ecommerce platform': 'Ecommerce платформа',
        'Email': 'Email',
        'Email delivery, action audit status, and weekly knowledge updates':
          'Email доставка, статус в журнала на действията и седмични обновявания на знанията',
        'Email + webhooks': 'Email + webhooks',
        'Embed an AI assistant that answers from approved knowledge, captures leads, recommends products, routes support, and keeps an action audit trail.':
          'Вградете AI асистент, който отговаря от одобрени знания, събира лийдове, препоръчва продукти, насочва поддръжка и пази журнал на действията.',
        'Embeddable AI sales and support assistant':
          'Вграден AI асистент за продажби и поддръжка',
        'Everything a business needs after the first chat message':
          'Всичко, от което бизнесът има нужда след първото чат съобщение',
        'FAQ': 'FAQ',
        'FAQ answers, pricing or appointment routing, contact capture, owner email, and support handoff.':
          'FAQ отговори, насочване към цена или среща, събиране на контакт, email към собственика и support handoff.',
        'FAQ answers, lead qualification, contact capture, meeting/demo routing, email notifications, webhooks, and analytics.':
          'FAQ отговори, квалификация на лийдове, събиране на контакти, насочване към среща/демо, email известия, webhooks и аналитика.',
        'Find products by brand, model, SKU, category, price, availability, and attributes':
          'Намира продукти по марка, модел, SKU, категория, цена, наличност и атрибути',
        'For Bulgaria': 'За България',
        'for teams that want us to run it': 'за екипи, които искат ние да го управляваме',
        'From blank site to useful assistant in one afternoon':
          'От празен сайт до полезен асистент за един следобед',
        'Generic chatbot': 'Стандартен чатбот',
        'Growth': 'Growth',
        'Guarded cart, order, invoice, return, and warranty flows':
          'Контролирани процеси за количка, поръчки, фактури, връщания и гаранции',
        'How is customer data handled?': 'Как се обработват клиентските данни?',
        'How much does it cost?': 'Колко струва?',
        'Human handoff when the assistant is uncertain or the request is sensitive.':
          'Човешко поемане, когато асистентът не е сигурен или заявката е чувствителна.',
        'Improve ecommerce conversion': 'Подобряване на ecommerce конверсията',
        'Inspect action status, confidence, reason, source text, and metadata.':
          'Преглеждате статус, увереност, причина, източник и метаданни за всяко действие.',
        'Install on any website': 'Инсталира се на всеки сайт',
        'Install one script': 'Инсталиране на един скрипт',
        'Integrations': 'Интеграции',
        'Is this just ChatGPT embedded on my site?':
          'Това просто ChatGPT, вграден в сайта ми ли е?',
        'Jilanovi ecommerce': 'Jilanovi ecommerce',
        'Jilanov managed AI assistant': 'Jilanov управляван AI асистент',
        'JSON product feed': 'JSON продуктов фийд',
        'Just researching': 'Само проучвам',
        'Knowledge editor': 'Редактор на знания',
        'Lead Assistant': 'Lead Assistant',
        'Lead inbox': 'Лийд списък',
        'Lead, handoff, action, or audit event':
          'Лийд, предаване към екип, действие или журнално събитие',
        'Lead capture': 'Събиране на лийдове',
        'Limited transcript': 'Ограничен transcript',
        'Live demo': 'Демо',
        'Local service business': 'Локален бизнес с услуги',
        'Main goal': 'Основна цел',
        'Managed': 'Managed',
        'Managed Assistant': 'Managed Assistant',
        'Managed implementation': 'Управлявано внедряване',
        'Managed setup by the Jilanov team': 'Внедряване от екипа на Jilanov',
        'Most teams': 'За повечето екипи',
        'Name': 'Име',
        'Next quarter': 'Следващото тримесечие',
        'New lead, consent captured': 'Нов лийд със записано съгласие',
        'No cart or order mutation claims until the real website confirms the action.':
          'Без твърдения за промени по количка или поръчка, докато реалният сайт не потвърди действието.',
        'No invented order, payment, invoice, delivery, return, warranty, or cancellation status.':
          'Без измислен статус за поръчки, плащания, фактури, доставки, връщания, гаранции или анулации.',
        'No. Sensitive operational facts must come from configured knowledge or connected systems. Otherwise the assistant asks for details or routes to staff.':
          'Не. Чувствителните оперативни факти трябва да идват от настроени знания или свързани системи. Иначе асистентът иска детайли или насочва към екип.',
        'No. The assistant uses approved knowledge, structured action boundaries, lead capture, human handoff, analytics, and an audit trail.':
          'Не. Асистентът използва одобрени знания, ясни граници за действия, събиране на лийдове, човешко поемане, аналитика и журнал.',
        'Official answers': 'Официални отговори',
        'Often guesses': 'Често гадае',
        'One script': 'Един скрипт',
        'Online store': 'Онлайн магазин',
        'Online stores': 'Онлайн магазини',
        'OpenCart planned': 'OpenCart планирано',
        Outcomes: 'Резултати',
        'Paste the widget tag into the customer website or deploy through a tag manager.':
          'Поставете widget tag в сайта на клиента или го добавете през tag manager.',
        'Phone': 'Телефон',
        Pilot: 'Пилот',
        'Pricing': 'Цени',
        'Pricing answer plus contact prompt':
          'Отговор за цени плюс покана за контакт',
        'Pilot prices are shown as starting points. The final offer depends on the site, knowledge volume, traffic, integrations, and whether you want us to manage the assistant.':
          'Пилотните цени са начални ориентири. Финалната оферта зависи от сайта, обема знания, трафика, интеграциите и дали искате ние да управляваме асистента.',
        'Privacy and AI transparency': 'Поверителност и AI прозрачност',
        'Product': 'Продукт',
        'Product clicks, comparisons, checkout handoffs, and missed answers':
          'Кликове върху продукти, сравнения, checkout handoff-и и липсващи отговори',
        'Product discovery, product cards, comparison, cart and checkout handoff, return/warranty/order support routing.':
          'Откриване на продукти, продуктови карти, сравнение, предаване към количка и checkout, насочване за връщания, гаранции и поръчки.',
        'Product feed, product cards, comparison, checkout handoff, and return/warranty support routing.':
          'Продуктов фийд, продуктови карти, сравнение, checkout handoff и насочване за връщане/гаранция.',
        'Product overview': 'Преглед на продукта',
        'Product tour': 'Продуктова обиколка',
        'Product-aware answers with safe action boundaries':
          'Отговори с продуктово знание и сигурни граници за действия',
        'Prompt-dependent': 'Зависи от prompt-а',
        'Quote or demo website': 'Сайт за оферти или демо',
        'Recommend products': 'Препоръчване на продукти',
        'Reduce support load': 'Намаляване на поддръжката',
        'Resend email notifications': 'Resend email известия',
        'Review decisions': 'Преглед на решенията',
        'Review outcomes': 'Преглед на резултатите',
        'Reviewability': 'Възможност за преглед',
        'Route cart, checkout, favorites, alerts, orders, invoices, returns, and warranty requests':
          'Насочва количка, checkout, любими, известия, поръчки, фактури, връщания и гаранционни заявки',
        'Route new opportunities fast': 'Насочва новите възможности бързо',
        'Safety': 'Сигурност',
        'Sales follow-up': 'Последваща продажбена работа',
        'See how the assistant would work on your website':
          'Вижте как асистентът би работил на вашия сайт',
        'See why the assistant answered, asked for contact details, created a handoff, or blocked a request.':
          'Виждате защо асистентът е отговорил, поискал контакт, създал предаване към екип или блокирал заявка.',
        'Send lead and support handoff notifications by email and webhooks.':
          'Изпращайте известия за лийдове и поддръжка по email и webhooks.',
        Services: 'Услуги',
        'Set domain allowlist, languages, assistant name, colors, and privacy settings.':
          'Настройте разрешени домейни, езици, име на асистента, цветове и поверителност.',
        'Setup, knowledge writing, monthly QA, safety tuning, product-feed checks, and optimization.':
          'Настройка, писане на знания, месечен QA, настройка на безопасността, проверки на продуктовия фийд и оптимизация.',
        'Setup, knowledge writing, product feed QA, monthly conversation review, safety tuning, and conversion optimization.':
          'Настройка, писане на знания, QA на продуктов фийд, месечен преглед на разговори, безопасност и оптимизация на конверсията.',
        'Setup, knowledge writing, product-feed QA, monthly conversation review, safety tuning, and conversion optimization.':
          'Настройка, писане на знания, product-feed QA, месечен преглед на разговори, safety tuning и оптимизация на конверсията.',
        'Share your site, ecommerce platform, main goal, and timeline. The form submits to the demo API and stores the request as a qualified lead.':
          'Споделете сайта, ecommerce платформата, основната цел и срок. Формата изпраща заявка към demo API и я записва като квалифициран лийд.',
        'Shopify planned': 'Shopify планирано',
        'Show product cards with image, URL, price, stock, variants, and recommendation reason':
          'Показва продуктови карти със снимка, URL, цена, наличност, варианти и причина за препоръка',
        'Show the complete assistant loop in one glance':
          'Покажете целия цикъл на асистента с един поглед',
        'Start pilot': 'Стартирай пилот',
        'Start with three controlled pilots: one online store, one service business, and one B2B website. Each pilot should prove real conversations, captured leads, staff handoffs, email delivery, and the unanswered questions that become the next knowledge update.':
          'Започнете с три контролирани пилота: един онлайн магазин, един бизнес с услуги и един B2B сайт. Всеки пилот трябва да докаже реални разговори, събрани лийдове, предавания към екипа, email доставка и неотговорени въпроси, които стават следващото обновяване на знанията.',
        'Start with leads. Upgrade to commerce.':
          'Започнете с лийдове. Надградете към commerce.',
        'Start with leads, then add product feeds, product cards, comparison, checkout handoff, and support routing.':
          'Започнете с лийдове, после добавете продуктови фийдове, продуктови карти, сравнение, checkout handoff и насочване към поддръжка.',
        'Starter': 'Starter',
        'Support queue': 'Опашка за поддръжка',
        'The assistant is built around operational outcomes: answer, qualify, route, hand off, or log for review. That is what makes it easier to sell than a generic chatbot.':
          'Асистентът е изграден около оперативни резултати: отговор, квалификация, насочване, предаване към екип или запис за преглед. Това го прави по-лесен за продажба от стандартен чатбот.',
        'The assistant uses approved knowledge first and routes uncertain or sensitive cases to staff. It should not invent prices, order status, payment status, delivery status, returns, warranty decisions, or unsupported operational facts.':
          'Асистентът първо използва одобрени знания и насочва несигурни или чувствителни случаи към екип. Не трябва да измисля цени, статус на поръчки, плащания, доставки, връщания, гаранции или оперативни факти.',
        'The commerce tier should sell the difference between "the bot said something" and "the system safely routed the next step."':
          'Commerce пакетът трябва да продава разликата между "ботът каза нещо" и "системата безопасно насочи следващата стъпка."',
        'The landing page includes the actual embeddable widget. These prompt buttons open the demo assistant and send real messages to the local demo API when it is running.':
          'Лендинг страницата включва реалния вграден уиджет. Тези бутони отварят demo асистента и изпращат реални съобщения към demo API, когато работи.',
        'The product includes retention settings, privacy links, consent-aware lead capture, data export, erasure workflows, and action logs. Production deployments should pair this with the customer\'s privacy policy and legal documents.':
          'Продуктът включва настройки за задържане на данни, privacy links, събиране на лийдове със съгласие, експорт, изтриване и журнал на действията. В продукция това трябва да се съчетае с политиката за поверителност и правните документи на клиента.',
        'The sellable entry point is the Lead Assistant. Commerce expands the same assistant into product discovery, comparison, and checkout handoff once a store integration is connected.':
          'Продаваемият старт е Lead Assistant. Commerce разширява същия асистент към откриване на продукти, сравнение и предаване към checkout след свързване на магазин.',
        'The visitor experience defaults to Bulgarian and switches to English when the browser asks for it.':
          'Потребителското изживяване започва на български и превключва към английски, когато браузърът го поиска.',
        'Try live assistant': 'Пробвай асистента',
        'Turn first installs into proof you can sell':
          'Превърнете първите внедрявания в доказателство, което продава',
        'This month': 'Този месец',
        'This week': 'Тази седмица',
        'Timeline': 'Срок',
        'Turn high-intent conversations into leads with contact details and consent.':
          'Превръщайте разговори с висок интерес в лийдове с контакт и съгласие.',
        'Unresolved cases become staff tickets with transcript, reason, locale, page URL, and contact details.':
          'Нерешените случаи стават tickets за екипа с transcript, причина, език, URL и контакти.',
        'Use approved knowledge first, then AI only inside clear guardrails.':
          'Първо използвайте одобрени знания, после AI само в ясни граници.',
        'Use cases': 'Приложения',
        'Visible AI disclosure, persisted conversation, feedback buttons, lead fields, and prompt shortcuts.':
          'Видимо AI обозначение, запазен разговор, бутони за обратна връзка, полета за лийд и prompt shortcuts.',
        'Visitor chat': 'Чат с посетител',
        'Website': 'Сайт',
        'Website URL': 'URL на сайта',
        'Website widget': 'Website widget',
        'What does it cost for my store?': 'Колко ще струва за моя магазин?',
        'What does the assistant do?': 'Какво прави асистентът?',
        'What we measure': 'Какво измерваме',
        'Why this beats a generic chatbot plugin':
          'Защо това е по-добро от стандартен chatbot plugin',
        'Will it invent prices or order information?':
          'Ще измисля ли цени или информация за поръчки?',
        'We configure the widget, write the first knowledge base, test the answers, and keep improving it after launch.':
          'Настройваме уиджета, пишем първата база знания, тестваме отговорите и продължаваме да го подобряваме след старта.',
        'We install, train, and maintain an AI assistant that answers in Bulgarian, captures demo requests, recommends the next step, emails your team, and keeps an audit trail for every important action.':
          'Инсталираме, обучаваме и поддържаме AI асистент, който отговаря на български, събира заявки за демо, препоръчва следваща стъпка, изпраща email към екипа и пази журнал за всяко важно действие.',
        'WooCommerce planned': 'WooCommerce планирано',
        'Workflow': 'Работен процес',
        'Write knowledge entries for the questions your team answers every day.':
          'Напишете знания за въпросите, на които екипът ви отговаря всеки ден.',
        'Yes. Admin users can manage approved knowledge entries without editing code.':
          'Да. Админ потребителите могат да управляват одобрени знания без редакция на код.',
        'email-lead@example.com': 'email-lead@example.com',
        'custom monthly plan': 'индивидуален месечен план',
        lead_email_delivery: 'lead_email_delivery',
        'from 99 BGN/month': 'от 99 лв./месец',
        'from 249 BGN/month': 'от 249 лв./месец',
        'from 499 BGN/month': 'от 499 лв./месец',
        'setup from 700 BGN': 'внедряване от 700 лв.',
        'setup from 1500 BGN': 'внедряване от 1500 лв.',
        'setup from 2500 BGN': 'внедряване от 2500 лв.',
        site_demo: 'site_demo',
      },
    },
  };
  bootstrap();
})();

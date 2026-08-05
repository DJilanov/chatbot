(function () {
  const supportedLocales = ['bg', 'en'];
  const defaultLocale = 'bg';
  const localeStorageKey = 'assistant-saas-locale';
  const demoSiteId = window.CHATBOT_DEMO_SITE_ID || 'site_demo';
  const apiUrl = (window.CHATBOT_API_URL || window.location.origin).replace(/\/+$/, '');
  const originalTextNodes = new WeakMap();
  const originalAttributes = new WeakMap();

  let currentLocale = detectPreferredLocale();
  window.CHATBOT_LOCALE = currentLocale;

  applyLocale(currentLocale, { notifyWidget: false, persist: false });
  bindLanguageSwitch();
  bindChatButtons();
  bindDemoForm();

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
        if (window.Chatbot) {
          window.Chatbot.open();
          return;
        }
        document.querySelector('#demo-live')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    document.querySelectorAll('[data-demo-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        const prompt = button.getAttribute('data-demo-prompt') || '';
        if (!prompt) return;
        if (window.Chatbot) {
          window.Chatbot.open();
          void window.Chatbot.send(prompt);
          return;
        }
        setTemporaryButtonText(button, message('startApiFirst'));
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
      if (window.Chatbot) {
        window.Chatbot.open();
        void window.Chatbot.send(message('bookedDemoChat', { email }));
      }
    } catch {
      setStatus(statusElement, message('demoApiUnavailable'), 'error');
    }
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
      title: 'Assistant SaaS | AI Sales and Support Assistant',
      description:
        'Embed an AI assistant that answers from approved knowledge, captures leads, recommends products, routes support, and keeps an action audit trail.',
      ogTitle: 'Assistant SaaS | AI Sales and Support Assistant',
      ogDescription:
        'A safe AI assistant for business websites and ecommerce stores: approved knowledge, lead capture, product guidance, human handoff, and action audit.',
      messages: {
        bookedDemoChat: 'I booked a demo. My email is {email}',
        demoApiUnavailable: 'The demo API is unavailable right now. Please try again shortly.',
        demoSent: 'Demo request sent. We will contact you shortly.',
        missingContact: 'Please add your name and email.',
        sendingDemo: 'Sending demo request...',
        startApiFirst: 'Start API first',
      },
      attributes: {},
      text: {},
    },
    bg: {
      title: 'Assistant SaaS | AI асистент за продажби и поддръжка',
      description:
        'Вградете AI асистент, който отговаря от одобрени знания, събира лийдове, препоръчва продукти, насочва поддръжка и пази журнал на действията.',
      ogTitle: 'Assistant SaaS | AI асистент за продажби и поддръжка',
      ogDescription:
        'Сигурен AI асистент за бизнес сайтове и онлайн магазини: одобрени знания, лийдове, продуктови насоки, човешко поемане и журнал на действията.',
      messages: {
        bookedDemoChat: 'Запазих демо. Моят email е {email}',
        demoApiUnavailable: 'Демо API временно не е достъпно. Моля, опитайте отново след малко.',
        demoSent: 'Заявката за демо е изпратена. Ще се свържем с вас скоро.',
        missingContact: 'Моля, добавете име и email.',
        sendingDemo: 'Изпращане на заявката за демо...',
        startApiFirst: 'Стартирайте API',
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
        'A chatbot is not the product. The outcome is.':
          'Чатботът не е продуктът. Резултатът е.',
        'A safer pitch for companies that cannot afford hallucinated operations':
          'По-сигурен аргумент за компании, които не могат да си позволят измислени операции',
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
        BG: 'BG',
        'Bulgarian language quality': 'Качество на български език',
        'Bulgarian market': 'Български пазар',
        'Bulgarian companies need fast setup, clear ownership, good local-language answers, and a team that can connect the assistant to the website or online store they already have.':
          'Българските компании имат нужда от бързо внедряване, ясна отговорност, добри отговори на местен език и екип, който може да свърже асистента със сайта или онлайн магазина, който вече използват.',
        'Bulgarian-first, English-ready': 'Първо български, готов и за английски',
        'Built from a production ecommerce assistant':
          'Изграден върху реален ecommerce асистент',
        'Business outcome': 'Бизнес резултат',
        'Buyers care less about "AI magic" than whether the assistant can be trusted around orders, prices, payments, support, and customer data.':
          'Купувачите се интересуват по-малко от "AI магия" и повече от това дали асистентът е надежден при поръчки, цени, плащания, поддръжка и клиентски данни.',
        'Buyers pay when the assistant creates visible business work: answered questions, captured leads, routed support, and reviewable decisions.':
          'Клиентите плащат, когато асистентът върши видима бизнес работа: отговорени въпроси, събрани лийдове, насочена поддръжка и решения за преглед.',
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
        'Compare visible products by processor, display, memory, storage, grade, or custom specs':
          'Сравнява видими продукти по процесор, дисплей, памет, диск, клас или специфични характеристики',
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
        'Email + webhooks': 'Email + webhooks',
        'Embed an AI assistant that answers from approved knowledge, captures leads, recommends products, routes support, and keeps an action audit trail.':
          'Вградете AI асистент, който отговаря от одобрени знания, събира лийдове, препоръчва продукти, насочва поддръжка и пази журнал на действията.',
        'Embeddable AI sales and support assistant':
          'Вграден AI асистент за продажби и поддръжка',
        'Everything a business needs after the first chat message':
          'Всичко, от което бизнесът има нужда след първото чат съобщение',
        'FAQ': 'FAQ',
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
        'Let buyers try the product before they book':
          'Дайте на купувачите да пробват продукта преди демо',
        'Limited transcript': 'Ограничен transcript',
        'Live demo': 'Демо',
        'Main goal': 'Основна цел',
        'Made for businesses that want results, not another experiment':
          'Създаден за бизнеси, които искат резултати, не пореден експеримент',
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
        'Online stores': 'Онлайн магазини',
        'OpenCart planned': 'OpenCart планирано',
        'Paste the widget tag into the customer website or deploy through a tag manager.':
          'Поставете widget tag в сайта на клиента или го добавете през tag manager.',
        'Phone': 'Телефон',
        'Pricing': 'Цени',
        'Pricing answer plus contact prompt':
          'Отговор за цени плюс покана за контакт',
        'Pilot prices are shown as starting points. The final offer depends on the site, knowledge volume, traffic, integrations, and whether you want us to manage the assistant.':
          'Пилотните цени са начални ориентири. Финалната оферта зависи от сайта, обема знания, трафика, интеграциите и дали искате ние да управляваме асистента.',
        'Privacy and AI transparency': 'Поверителност и AI прозрачност',
        'Product': 'Продукт',
        'Product discovery, product cards, comparison, cart and checkout handoff, return/warranty/order support routing.':
          'Откриване на продукти, продуктови карти, сравнение, предаване към количка и checkout, насочване за връщания, гаранции и поръчки.',
        'Product overview': 'Преглед на продукта',
        'Product surfaces buyers can inspect during the demo':
          'Продуктови повърхности, които купувачите могат да видят по време на демо',
        'Product tour': 'Продуктова обиколка',
        'Product-aware answers with safe action boundaries':
          'Отговори с продуктово знание и сигурни граници за действия',
        'Prompt-dependent': 'Зависи от prompt-а',
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
        'Sales pitch': 'Продажбен аргумент',
        'Sales follow-up': 'Последваща продажбена работа',
        'See how the assistant would work on your website':
          'Вижте как асистентът би работил на вашия сайт',
        'See why the assistant answered, asked for contact details, created a handoff, or blocked a request.':
          'Виждате защо асистентът е отговорил, поискал контакт, създал предаване към екип или блокирал заявка.',
        'Send lead and support handoff notifications by email and webhooks.':
          'Изпращайте известия за лийдове и поддръжка по email и webhooks.',
        'Set domain allowlist, languages, assistant name, colors, and privacy settings.':
          'Настройте разрешени домейни, езици, име на асистента, цветове и поверителност.',
        'Setup, knowledge writing, monthly QA, safety tuning, product-feed checks, and optimization.':
          'Настройка, писане на знания, месечен QA, настройка на безопасността, проверки на продуктовия фийд и оптимизация.',
        'Setup, knowledge writing, product feed QA, monthly conversation review, safety tuning, and conversion optimization.':
          'Настройка, писане на знания, QA на продуктов фийд, месечен преглед на разговори, безопасност и оптимизация на конверсията.',
        'Share your site, ecommerce platform, main goal, and timeline. The form submits to the demo API and stores the request as a qualified lead.':
          'Споделете сайта, ecommerce платформата, основната цел и срок. Формата изпраща заявка към demo API и я записва като квалифициран лийд.',
        'Shopify planned': 'Shopify планирано',
        'Show product cards with image, URL, price, stock, variants, and recommendation reason':
          'Показва продуктови карти със снимка, URL, цена, наличност, варианти и причина за препоръка',
        'Show the complete assistant loop in one glance':
          'Покажете целия цикъл на асистента с един поглед',
        'Start with leads. Upgrade to commerce.':
          'Започнете с лийдове. Надградете към commerce.',
        'Start with leads, then add product feeds, product cards, comparison, checkout handoff, and support routing.':
          'Започнете с лийдове, после добавете продуктови фийдове, продуктови карти, сравнение, checkout handoff и насочване към поддръжка.',
        'Starter': 'Starter',
        'Support queue': 'Опашка за поддръжка',
        'The MVP is intentionally simple: configure the assistant, add knowledge, install the widget, then watch conversations and leads arrive in the admin console.':
          'MVP-то е умишлено просто: настройвате асистента, добавяте знания, инсталирате уиджета и следите разговорите и лийдовете в админ конзолата.',
        'The assistant is built around operational outcomes: answer, qualify, route, hand off, or log for review. That is what makes it easier to sell than a generic chatbot.':
          'Асистентът е изграден около оперативни резултати: отговор, квалификация, насочване, предаване към екип или запис за преглед. Това го прави по-лесен за продажба от стандартен чатбот.',
        'The assistant uses approved knowledge first and routes uncertain or sensitive cases to staff. It should not invent prices, order status, payment status, delivery status, returns, warranty decisions, or unsupported operational facts.':
          'Асистентът първо използва одобрени знания и насочва несигурни или чувствителни случаи към екип. Не трябва да измисля цени, статус на поръчки, плащания, доставки, връщания, гаранции или оперативни факти.',
        'The commerce tier should sell the difference between "the bot said something" and "the system safely routed the next step."':
          'Commerce пакетът трябва да продава разликата между "ботът каза нещо" и "системата безопасно насочи следващата стъпка."',
        'The landing page includes the actual embeddable widget. These prompt buttons open the demo assistant and send real messages to the local demo API when it is running.':
          'Лендинг страницата включва реалния вграден уиджет. Тези бутони отварят demo асистента и изпращат реални съобщения към demo API, когато работи.',
        'The page leads with the actual widget, the admin workflow, and the action audit because these are the surfaces that prove the assistant is operational software, not a prompt demo.':
          'Страницата показва реалния уиджет, админ процеса и журнала на действията, защото те доказват, че асистентът е оперативен софтуер, не prompt demo.',
        'The product includes retention settings, privacy links, consent-aware lead capture, data export, erasure workflows, and action logs. Production deployments should pair this with the customer\'s privacy policy and legal documents.':
          'Продуктът включва настройки за задържане на данни, privacy links, събиране на лийдове със съгласие, експорт, изтриване и журнал на действията. В продукция това трябва да се съчетае с политиката за поверителност и правните документи на клиента.',
        'The sellable entry point is the Lead Assistant. Commerce expands the same assistant into product discovery, comparison, and checkout handoff once a store integration is connected.':
          'Продаваемият старт е Lead Assistant. Commerce разширява същия асистент към откриване на продукти, сравнение и предаване към checkout след свързване на магазин.',
        'These are the surfaces that prove the assistant is operational software, not a prompt demo.':
          'Това са повърхностите, които доказват, че асистентът е оперативен софтуер, не prompt demo.',
        'The visitor experience defaults to Bulgarian and switches to English when the browser asks for it.':
          'Потребителското изживяване започва на български и превключва към английски, когато браузърът го поиска.',
        'Try live assistant': 'Пробвай асистента',
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
})();

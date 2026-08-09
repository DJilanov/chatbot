import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteUrl = 'https://chatbot.jilanov.com';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const pages = [
  {
    slug: 'bg',
    title: 'AI chatbot за български сайтове и онлайн магазини',
    description:
      'Управляван AI асистент за български бизнеси: отговаря по фирмени правила, събира запитвания, насочва клиенти и пази журнал на действията.',
    h1: 'AI chatbot за български сайтове и онлайн магазини',
    intro:
      'Assistant SaaS добавя реален помощник към сайта: отговаря от одобрена база знания, събира квалифицирани запитвания и предава чувствителните случаи към екипа.',
    audience: 'За собственици на сайтове, онлайн магазини и B2B екипи, които искат по-бърза реакция към клиентите без да сменят платформата си.',
    benefits: [
      'Отговаря на български по текстове и правила, които екипът одобрява.',
      'Събира име, имейл, телефон, фирма, сайт и конкретна нужда на клиента.',
      'Изпраща запитванията към правилния човек по имейл или webhook.',
      'Пази проследим запис за важните отговори, handoff-и и блокирани действия.',
    ],
    faq: [
      ['Подходящ ли е за малък бизнес?', 'Да. Започва се с един сайт, основни въпроси и форма за запитване.'],
      ['Може ли да се управлява от екипа?', 'Да. Отговорите и настройките се управляват от админ конзола.'],
    ],
  },
  {
    slug: 'bg/ai-chatbot-za-online-magazin',
    title: 'AI chatbot за онлайн магазин',
    description:
      'AI chatbot за онлайн магазин, който помага на клиента да избере продукт, проверява правила и насочва към количка, checkout или консултация.',
    h1: 'AI chatbot за онлайн магазин',
    intro:
      'Когато клиентът се колебае между модели, търси доставка или пита за гаранция, асистентът дава ясен отговор и предлага следващата практична стъпка.',
    audience: 'За ecommerce екипи с много категории, варианти или технически параметри, където правилната препоръка влияе директно на продажбата.',
    benefits: [
      'Отговаря за доставка, гаранция, плащане, връщане и наличност от одобрени правила.',
      'Показва продуктови карти, когато каталогът е свързан чрез feed или API.',
      'Събира контакт и нужда, когато изборът изисква консултация.',
      'Потвърждава количка или поръчка само след реален отговор от магазина.',
    ],
    faq: [
      ['Може ли да препоръчва продукти?', 'Да, когато има свързан продуктов feed или API.'],
      ['Може ли да завършва поръчки?', 'Да, но само през защитен checkout процес с реално потвърждение от магазина.'],
    ],
  },
  {
    slug: 'bg/chatbot-za-opencart',
    title: 'Chatbot за OpenCart магазин',
    description:
      'Chatbot за OpenCart: продуктови въпроси, запитвания, препоръки, checkout handoff и поддръжка с контролирани AI отговори.',
    h1: 'Chatbot за OpenCart магазин',
    intro:
      'OpenCart магазините често имат сложни категории, варианти, наличности и правила за доставка. Асистентът може да започне с въпроси и лийдове, после да се свърже с продуктовия каталог.',
    audience: 'За OpenCart собственици, които искат по-добра продуктова консултация без миграция към нова платформа.',
    benefits: [
      'Инсталация чрез widget script без промяна на дизайна на магазина.',
      'Импорт на продукти чрез CSV, JSON feed или custom endpoint.',
      'Отговори за продукти, категории, доставка, гаранция и връщане.',
      'Ясен път към безопасно добавяне към количка и checkout handoff.',
    ],
    faq: [
      ['Трябва ли да сменям OpenCart?', 'Не. Асистентът може да се добави върху съществуващия магазин.'],
      ['Как се зареждат продуктите?', 'Чрез feed или API, така че цена, наличност и вариант да съвпадат със сайта.'],
    ],
  },
  {
    slug: 'bg/ai-pomoshtnik-za-ecommerce',
    title: 'AI помощник за ecommerce',
    description:
      'AI помощник за ecommerce сайтове: продуктово търсене, сравнение, запитвания, handoff към човек и измерими продажбени действия.',
    h1: 'AI помощник за ecommerce',
    intro:
      'Полезният ecommerce помощник разбира нуждата на клиента, работи с актуални продуктови данни и не обещава действие, което сайтът не е потвърдил.',
    audience: 'За магазини с много категории, варианти, технически параметри и повтарящи се въпроси към support.',
    benefits: [
      'Показва защо даден продукт е подходящ за конкретната нужда.',
      'Сравнява по параметри след продуктова интеграция.',
      'Разделя продуктови, support и поръчкови намерения.',
      'Измерва разговори, продуктови кликове, запитвания и handoff-и.',
    ],
    faq: [
      ['Какво го различава от live chat?', 'Работи постоянно и използва одобрени знания, но предава рисковите случаи на екипа.'],
      ['Подходящ ли е за технически продукти?', 'Да, особено когато категориите имат много спецификации и варианти.'],
    ],
  },
  {
    slug: 'bg/chatbot-za-klientska-poddrzhka',
    title: 'Chatbot за клиентска поддръжка',
    description:
      'Chatbot за клиентска поддръжка, който отговаря на чести въпроси, събира контекст и предава чувствителни случаи към екипа.',
    h1: 'Chatbot за клиентска поддръжка',
    intro:
      'Support екипите губят време в едни и същи въпроси. Асистентът отговаря по официалните политики, събира липсващите данни и предава случая към човек, когато има риск.',
    audience: 'За бизнеси с чести въпроси за доставка, плащане, гаранция, връщане, фактури, сервиз или акаунти.',
    benefits: [
      'Отговаря от одобрена база знания за фирмените правила.',
      'Събира номер на поръчка, контакт и описание на проблема.',
      'Не отменя поръчки, не обещава компенсации и не променя данни без защитен процес.',
      'Дава на екипа transcript, причина за handoff и данни за контакт.',
    ],
    faq: [
      ['Може ли да замени support екипа?', 'Не напълно. Целта е да намали повторяемите въпроси и да подготви сложните случаи.'],
      ['Как се избягват измислени отговори?', 'Чрез approved knowledge, guardrails и audit trail.'],
    ],
  },
  {
    slug: 'bg/ai-chatbot-za-prodazhbi',
    title: 'AI chatbot за продажби',
    description:
      'AI chatbot за продажби, който квалифицира потенциални клиенти, задава правилните въпроси и изпраща подготвен lead към екипа.',
    h1: 'AI chatbot за продажби',
    intro:
      'Когато посетителят има интерес, сайтът трябва да реагира веднага. Асистентът пита за фирма, сайт, цел, срок и контакт, след което изпраща запитване с контекст.',
    audience: 'За B2B сайтове, услуги, агенции и ecommerce екипи, които искат повече качествени запитвания.',
    benefits: [
      'Задава квалифициращи въпроси според намерението на посетителя.',
      'Изпраща lead с контекст, страница, език и кратко резюме.',
      'Насочва към демо, консултация или оферта според случая.',
      'Показва кои страници и въпроси водят до реални запитвания.',
    ],
    faq: [
      ['Какво получава sales екипът?', 'Контакт, фирма, сайт, цел, срок и кратко резюме на разговора.'],
      ['Може ли да работи извън работно време?', 'Да. Асистентът приема запитвания постоянно.'],
    ],
  },
  {
    slug: 'bg/chatbot-za-produktovi-preporaki',
    title: 'Chatbot за продуктови препоръки',
    description:
      'Chatbot за продуктови препоръки, който помага на клиента да избере правилен продукт по бюджет, параметри, наличност и нужда.',
    h1: 'Chatbot за продуктови препоръки',
    intro:
      'Когато каталогът е голям, клиентът често не знае как да филтрира. Асистентът превежда човешкото описание към продуктово търсене и показва подходящи варианти.',
    audience: 'За магазини с техника, части, козметика, аксесоари или продукти с много варианти.',
    benefits: [
      'Разпознава бюджет, категория, модел, марка и технически нужди.',
      'Пита уточняващи въпроси, когато липсва важен параметър.',
      'Избягва несъвместими предложения, когато няма достатъчно съвпадение.',
      'Предава избрания продукт към количка или checkout handoff след интеграция.',
    ],
    faq: [
      ['Какво става при продукт с варианти?', 'Асистентът първо избира или пита за конкретен вариант.'],
      ['Може ли да работи с промоции?', 'Да, ако feed-ът подава актуална цена, наличност и промо статус.'],
    ],
  },
  {
    slug: 'bg/mitko-ai-asistent-jilanov',
    title: 'Митко AI асистент за Jilanov',
    description:
      'Митко AI асистент: пример за продуктов chatbot с търсене, продуктови карти, количка, checkout handoff и защитени support действия.',
    h1: 'Митко AI асистент за Jilanov',
    intro:
      'Митко показва как продуктов AI асистент може да работи в реален магазин: търси в каталог, показва карти, добавя към количка след потвърждение и пази граници около поръчките.',
    audience: 'За клиенти, които искат да видят реална ecommerce имплементация, а не отделна демо симулация.',
    benefits: [
      'Намира точни продукти по модел, part number или описание.',
      'Показва продуктова карта и насочва към страницата на продукта.',
      'Добавя към количка само след реално потвърждение от сайта.',
      'Блокира рискови заявки без login или без защитен процес.',
    ],
    faq: [
      ['Митко готов продукт ли е?', 'Това е референтна имплементация върху Jilanov ecommerce.'],
      ['Може ли да се адаптира за друг магазин?', 'Да, ако магазинът предостави продуктов feed, правила и checkout процес.'],
    ],
  },
  {
    slug: 'bg/ceni',
    title: 'Цени за AI chatbot',
    description:
      'Цени за AI chatbot: Starter, Growth, Commerce и Managed планове според сайта, трафика, знанията и интеграциите.',
    h1: 'Цени за AI chatbot',
    intro:
      'Цената зависи от това колко работа поема асистентът: само запитвания, продуктови препоръки, checkout handoff, support handoff или месечна оптимизация.',
    audience: 'За бизнеси, които искат ясен стартов бюджет и възможност да надграждат без нова платформа.',
    benefits: [
      'Starter: от 99 лв./месец за lead assistant.',
      'Growth: от 249 лв./месец за повече usage, webhooks и reporting.',
      'Commerce: от 499 лв./месец за product feed и ecommerce handoff.',
      'Managed: индивидуален план с месечна QA и оптимизация.',
    ],
    faq: [
      ['Има ли setup такса?', 'Да. Setup-ът зависи от знанията, дизайна и интеграциите.'],
      ['Може ли първо пилот?', 'Да. Най-добре е да се започне с 30-дневен пилот.'],
    ],
  },
  {
    slug: 'bg/demo',
    title: 'Демо на AI chatbot',
    description:
      'Запазете демо на AI chatbot за сайт или онлайн магазин. Ще покажем widget, знания, lead capture, analytics и журнал на действията.',
    h1: 'Демо на AI chatbot',
    intro:
      'Демото показва реалния widget, админ конзолата, управлението на знания, lead inbox, analytics и журнала на действията, за да оцените целия процес.',
    audience: 'За собственици и екипи, които искат да оценят продукта преди внедряване.',
    benefits: [
      'Разглеждаме вашия сайт и най-честите клиентски въпроси.',
      'Показваме как се създават одобрени отговори.',
      'Показваме как пристигат lead, transcript и handoff.',
      'Даваме практичен план за първите 30 дни.',
    ],
    faq: [
      ['Колко време отнема демото?', 'Обикновено 20-30 минути.'],
      ['Трябва ли технически екип?', 'За първото демо не. За интеграции е полезен технически контакт.'],
    ],
  },
  {
    slug: 'bg/gdpr-sigurnost',
    title: 'GDPR и сигурност за AI chatbot',
    description:
      'GDPR и сигурност за AI chatbot: consent-aware lead capture, retention, export, erasure, domain allowlist и журнал на действията.',
    h1: 'GDPR и сигурност за AI chatbot',
    intro:
      'AI асистентът трябва да бъде полезен и контролиран. Внедряването включва ясни граници за лични данни, чувствителни действия, retention и човешка ескалация.',
    audience: 'За компании, които работят с клиентски данни, поръчки, сервиз, фактури или support казуси.',
    benefits: [
      'Consent-aware lead capture и връзки към privacy документи.',
      'Retention настройки, export и erasure процеси.',
      'Domain allowlist, rate limits и output sanitization.',
      'Журнал за действия, увереност, причина и source text.',
    ],
    faq: [
      ['Съхранява ли лични данни?', 'Само когато са нужни за lead, support или интеграция и според настройките за retention.'],
      ['Може ли да се използва в ЕС?', 'Да, но production внедряване трябва да се съгласува с политиките и договорите на клиента.'],
    ],
  },
];

pages.push(
  {
    slug: 'en/ecommerce-ai-chatbot',
    locale: 'en',
    alternateSlug: 'bg/ai-chatbot-za-online-magazin',
    title: 'AI chatbot for ecommerce stores',
    description:
      'AI chatbot for ecommerce stores with product guidance, approved support answers, lead capture, checkout handoff, and audit-ready actions.',
    h1: 'AI chatbot for ecommerce stores',
    intro:
      'Assistant SaaS helps shoppers move from question to decision. It answers from approved store policies, uses product data when connected, and hands sensitive cases to the team with context.',
    audience: 'For ecommerce teams with large catalogs, variants, technical specs, or frequent pre-sale questions that affect conversion.',
    benefits: [
      'Answers delivery, payment, warranty, return, invoice, and availability questions from approved rules.',
      'Shows product cards once a catalog feed or API is connected.',
      'Captures contact details and the buying need when consultation is required.',
      'Confirms cart, order, and payment actions only after the website confirms them.',
    ],
    faq: [
      ['Can it recommend products?', 'Yes, when a product feed or API is connected and kept in sync with the store.'],
      ['Can it complete checkout?', 'It can support checkout handoff through a protected flow with real confirmation from the store.'],
    ],
  },
  {
    slug: 'en/opencart-chatbot',
    locale: 'en',
    alternateSlug: 'bg/chatbot-za-opencart',
    title: 'OpenCart chatbot for online stores',
    description:
      'OpenCart chatbot for product questions, lead capture, product recommendations, checkout handoff, and controlled AI support.',
    h1: 'OpenCart chatbot for online stores',
    intro:
      'OpenCart stores often have complex categories, variants, stock rules, and delivery policies. Assistant SaaS can start with questions and leads, then connect to the catalog when the data is ready.',
    audience: 'For OpenCart store owners who want better product consultation without replacing their ecommerce platform.',
    benefits: [
      'Installs through one widget script without redesigning the store.',
      'Imports products through CSV, JSON feed, or a custom endpoint.',
      'Answers questions about products, categories, delivery, warranty, and returns.',
      'Creates a clear path to safe add-to-cart and checkout handoff.',
    ],
    faq: [
      ['Do I need to replace OpenCart?', 'No. The assistant can run on top of the existing store.'],
      ['How are products loaded?', 'Through a feed or API so price, availability, and variant details match the website.'],
    ],
  },
  {
    slug: 'en/customer-support-chatbot',
    locale: 'en',
    alternateSlug: 'bg/chatbot-za-klientska-poddrzhka',
    title: 'Customer support chatbot for business websites',
    description:
      'Customer support chatbot that answers frequent questions, gathers context, and hands sensitive cases to the team with an audit trail.',
    h1: 'Customer support chatbot for business websites',
    intro:
      'Support teams spend too much time on repeated questions. Assistant SaaS answers from approved policies, collects the missing context, and routes risky requests to a person.',
    audience: 'For businesses with frequent questions about delivery, payment, warranty, returns, invoices, service, or account support.',
    benefits: [
      'Uses approved knowledge for company policies.',
      'Collects order number, contact details, and issue context before handoff.',
      'Does not cancel orders, promise refunds, or change customer data without a protected process.',
      'Gives the team transcript, handoff reason, locale, page URL, and contact details.',
    ],
    faq: [
      ['Can it replace the support team?', 'No. It reduces repeated questions and prepares complex cases for staff.'],
      ['How do you prevent hallucinated support answers?', 'With approved knowledge, guardrails, sensitive-action rules, and action audit.'],
    ],
  },
  {
    slug: 'en/sales-ai-chatbot',
    locale: 'en',
    alternateSlug: 'bg/ai-chatbot-za-prodazhbi',
    title: 'AI chatbot for sales lead qualification',
    description:
      'AI chatbot for sales that qualifies visitors, asks the right questions, and sends ready-to-review leads to your team.',
    h1: 'AI chatbot for sales lead qualification',
    intro:
      'When a visitor is ready to talk, the website should capture the moment. Assistant SaaS asks for company, website, goal, timeline, and contact details, then sends the team a lead with context.',
    audience: 'For B2B websites, agencies, service businesses, and ecommerce teams that want more qualified inquiries.',
    benefits: [
      'Asks qualification questions based on visitor intent.',
      'Sends leads with page URL, language, source context, and conversation summary.',
      'Routes visitors to demo, consultation, quote, or support handoff.',
      'Shows which pages and questions create real opportunities.',
    ],
    faq: [
      ['What does the sales team receive?', 'Contact details, company, website, goal, timeline, and a short conversation summary.'],
      ['Can it work outside office hours?', 'Yes. The assistant can capture qualified inquiries at any time.'],
    ],
  },
  {
    slug: 'en/product-recommendation-chatbot',
    locale: 'en',
    alternateSlug: 'bg/chatbot-za-produktovi-preporaki',
    title: 'Product recommendation chatbot',
    description:
      'Product recommendation chatbot that helps customers choose by budget, category, model, attributes, availability, and need.',
    h1: 'Product recommendation chatbot',
    intro:
      'Large catalogs make customers unsure how to filter. Assistant SaaS translates the request into product search, asks clarification questions, and shows suitable options with a reason.',
    audience: 'For stores with technical products, parts, cosmetics, accessories, or products with many variants.',
    benefits: [
      'Recognizes budget, category, model, brand, and technical requirements.',
      'Asks clarification questions when an important parameter is missing.',
      'Avoids unrelated suggestions when there is not enough product match.',
      'Passes the selected product to cart or checkout handoff after integration.',
    ],
    faq: [
      ['What happens with product variants?', 'The assistant chooses or asks for the exact variant before taking action.'],
      ['Can it support promotions?', 'Yes, if the feed provides current price, stock, and promotion status.'],
    ],
  },
  {
    slug: 'en/pricing',
    locale: 'en',
    alternateSlug: 'bg/ceni',
    title: 'AI chatbot pricing',
    description:
      'AI chatbot pricing for Starter, Growth, Commerce, and Managed plans based on website, traffic, knowledge volume, and integrations.',
    h1: 'AI chatbot pricing',
    intro:
      'Pricing depends on how much work the assistant handles: questions and leads, product recommendations, checkout handoff, support routing, or managed monthly optimization.',
    audience: 'For businesses that want a clear starting budget and room to upgrade without changing platforms.',
    benefits: [
      'Starter: from 99 BGN/month for lead assistant.',
      'Growth: from 249 BGN/month for more usage, webhooks, and reporting.',
      'Commerce: from 499 BGN/month for product feed and ecommerce handoff.',
      'Managed: custom monthly plan with QA and optimization.',
    ],
    faq: [
      ['Is there a setup fee?', 'Yes. Setup depends on knowledge volume, design, and integrations.'],
      ['Can we start with a pilot?', 'Yes. A 30-day pilot is the recommended first step.'],
    ],
  },
  {
    slug: 'en/demo',
    locale: 'en',
    alternateSlug: 'bg/demo',
    title: 'AI chatbot demo',
    description:
      'Book an AI chatbot demo for a website or online store. See the widget, knowledge base, lead capture, analytics, and action audit.',
    h1: 'AI chatbot demo',
    intro:
      'The demo shows the real widget, admin console, knowledge management, lead inbox, analytics, and action audit so you can judge the workflow end to end.',
    audience: 'For owners and teams that want to evaluate the product before implementation.',
    benefits: [
      'We review your website and the most common customer questions.',
      'We show how approved answers are created.',
      'We show how leads, transcripts, and handoffs arrive in the admin console.',
      'You get a practical plan for the first 30 days.',
    ],
    faq: [
      ['How long does the demo take?', 'Usually 20-30 minutes.'],
      ['Do we need a technical team for the demo?', 'Not for the first demo. A technical contact helps later for integrations.'],
    ],
  },
  {
    slug: 'en/gdpr-security',
    locale: 'en',
    alternateSlug: 'bg/gdpr-sigurnost',
    title: 'GDPR and security for AI chatbots',
    description:
      'GDPR and security for AI chatbots: consent-aware lead capture, retention, export, erasure, domain allowlist, and action audit.',
    h1: 'GDPR and security for AI chatbots',
    intro:
      'An AI assistant should be useful and controlled. Production deployments need clear boundaries for personal data, sensitive actions, retention, and human escalation.',
    audience: 'For companies handling customer data, orders, service cases, invoices, support requests, or account issues.',
    benefits: [
      'Consent-aware lead capture and privacy links.',
      'Retention settings, export, and erasure workflows.',
      'Domain allowlist, rate limits, and output sanitization.',
      'Action audit for status, confidence, reason, source text, and review notes.',
    ],
    faq: [
      ['Does it store personal data?', 'Only when needed for leads, support, or integrations and according to configured retention settings.'],
      ['Can it be used in the EU?', 'Yes, but production deployment should align with the customer privacy policy and legal documents.'],
    ],
  },
);

const alternateBySlug = new Map();
for (const page of pages) {
  if (!page.alternateSlug) continue;
  alternateBySlug.set(page.slug, page.alternateSlug);
  alternateBySlug.set(page.alternateSlug, page.slug);
}

const allUrls = [
  { loc: `${siteUrl}/`, priority: '1.0' },
  ...pages.map((page) => ({ loc: pageUrl(page.slug), priority: page.slug === 'bg' ? '0.95' : '0.85', page })),
];

async function writePublicFile(relativePath, content) {
  const target = `${publicDir}/${relativePath}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

const copyByLocale = {
  bg: {
    htmlLang: 'bg',
    inLanguage: 'bg-BG',
    ogLocale: 'bg_BG',
    navAria: 'Основна навигация',
    navHome: 'Начало',
    navPricing: 'Цени',
    navDemo: 'Демо',
    navSecurity: 'GDPR',
    homeHref: '/bg/',
    pricingHref: '/bg/ceni/',
    demoHref: '/bg/demo/',
    securityHref: '/bg/gdpr-sigurnost/',
    primaryCta: 'Запази демо',
    secondaryCta: 'Виж live widget',
    heroAlt: 'AI chatbot dashboard с разговори, lead inbox и analytics',
    audienceEyebrow: 'За кого е',
    processEyebrow: 'Внедряване',
    processTitle: 'Първо подреждаме знанията, после включваме действията',
    steps: [
      ['Преглед на сайта', 'Изваждаме чести въпроси, продуктови пътеки и чувствителни действия.'],
      ['Одобрени отговори', 'Подготвяме знания, правила и handoff сценарии, които екипът може да поддържа.'],
      ['Публичен widget', 'Настройваме домейни, езици, цветове, известия и първия live тест.'],
      ['Месечен преглед', 'Следим пропуснати отговори, лийдове, handoff-и и следващи подобрения.'],
    ],
    faqTitle: 'Чести въпроси',
    relatedEyebrow: 'Още решения',
    relatedTitle: 'Свързани приложения на асистента',
    nextEyebrow: 'Следваща стъпка',
    nextTitle: 'Искате ли да го видите върху вашия сайт?',
    nextCopy: 'Изпратете сайт, платформа и основна цел. Ще върнем конкретен план за първи пилот.',
    softwareDescription:
      'Управляван AI асистент за сайтове и онлайн магазини с одобрена база знания, lead capture, ecommerce handoff, support routing и action audit.',
  },
  en: {
    htmlLang: 'en',
    inLanguage: 'en',
    ogLocale: 'en_US',
    navAria: 'Primary navigation',
    navHome: 'Home',
    navPricing: 'Pricing',
    navDemo: 'Demo',
    navSecurity: 'GDPR',
    homeHref: '/',
    pricingHref: '/en/pricing/',
    demoHref: '/en/demo/',
    securityHref: '/en/gdpr-security/',
    primaryCta: 'Book a demo',
    secondaryCta: 'Try live widget',
    heroAlt: 'AI chatbot dashboard with conversations, lead inbox, and analytics',
    audienceEyebrow: 'Who it is for',
    processEyebrow: 'Implementation',
    processTitle: 'Organize the knowledge first, then connect the actions',
    steps: [
      ['Website review', 'We map frequent questions, product paths, and sensitive actions.'],
      ['Approved answers', 'We prepare knowledge, rules, and handoff scenarios your team can maintain.'],
      ['Public widget', 'We configure domains, languages, colors, notifications, and the first live test.'],
      ['Monthly review', 'We track missed answers, leads, handoffs, and the next improvements.'],
    ],
    faqTitle: 'Frequently asked questions',
    relatedEyebrow: 'More solutions',
    relatedTitle: 'Related assistant use cases',
    nextEyebrow: 'Next step',
    nextTitle: 'Want to see it mapped to your website?',
    nextCopy: 'Send your website, platform, and main goal. We will return a practical first-pilot plan.',
    softwareDescription:
      'Managed AI assistant for websites and ecommerce stores with approved knowledge, lead capture, ecommerce handoff, support routing, and action audit.',
  },
};

function renderPage(page) {
  const locale = page.locale || 'bg';
  const copy = copyByLocale[locale] || copyByLocale.bg;
  const canonical = pageUrl(page.slug);
  const hreflangLinks = renderHreflangLinks(getPageAlternates(page));
  const breadcrumbItems = getBreadcrumbItems(page, canonical);
  const relatedLinks = pages
    .filter((item) => item.slug !== page.slug && item.slug !== 'bg' && (item.locale || 'bg') === locale)
    .slice(0, 5)
    .map((item) => `<a href="/${item.slug}/">${escapeHtml(item.title)}</a>`)
    .join('');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Jilanov.com',
        url: 'https://jilanov.com/',
        logo: `${siteUrl}/assets/jilanov-logo-compact.webp`,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#software`,
        name: 'Assistant SaaS',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: siteUrl,
        description: copy.softwareDescription,
        publisher: { '@id': `${siteUrl}/#organization` },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'BGN',
          lowPrice: '99',
          offerCount: '4',
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: page.title,
        description: page.description,
        inLanguage: copy.inLanguage,
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': `${siteUrl}/#software` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Assistant SaaS',
            item: `${siteUrl}/`,
          },
          ...breadcrumbItems.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: item.name,
            item: item.item,
          })),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        mainEntity: page.faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer,
          },
        })),
      },
    ],
  };

  return `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="${canonical}" />
    ${hreflangLinks}
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${copy.ogLocale}" />
    <meta property="og:image" content="${siteUrl}/assets/hero-assistant-dashboard.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${siteUrl}/assets/hero-assistant-dashboard.png" />
    <link rel="preload" href="/assets/hero-assistant-dashboard.png" as="image" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeScriptJson(schema)}</script>
  </head>
  <body class="seo-page">
    <header class="site-nav seo-nav">
      <a class="brand" href="/" aria-label="Assistant SaaS">
        <img class="brand-logo" src="/assets/jilanov-logo-compact.webp" alt="Jilanov.com logo" width="40" height="40" />
        <span>Assistant SaaS</span>
      </a>
      <nav aria-label="${escapeHtml(copy.navAria)}">
        <a href="${copy.homeHref}">${escapeHtml(copy.navHome)}</a>
        <a href="${copy.pricingHref}">${escapeHtml(copy.navPricing)}</a>
        <a href="${copy.demoHref}">${escapeHtml(copy.navDemo)}</a>
        <a href="${copy.securityHref}">${escapeHtml(copy.navSecurity)}</a>
      </nav>
      <a class="nav-cta" href="${copy.demoHref}">${escapeHtml(copy.primaryCta)}</a>
    </header>

    <main>
      <section class="seo-hero">
        <img src="/assets/hero-assistant-dashboard.png" alt="${escapeHtml(copy.heroAlt)}" width="1792" height="1024" />
        <div class="hero-overlay"></div>
        <div class="seo-hero-content">
          <p class="eyebrow">Assistant SaaS</p>
          <h1>${escapeHtml(page.h1)}</h1>
          <p>${escapeHtml(page.intro)}</p>
          <div class="hero-actions">
            <a class="button primary" href="${copy.demoHref}">${escapeHtml(copy.primaryCta)}</a>
            <a class="button secondary" href="/">${escapeHtml(copy.secondaryCta)}</a>
          </div>
        </div>
      </section>

      <section class="section seo-content">
        <div class="section-heading">
          <p class="eyebrow">${escapeHtml(copy.audienceEyebrow)}</p>
          <h2>${escapeHtml(page.audience)}</h2>
        </div>
        <div class="seo-card-grid">
          ${page.benefits
            .map(
              (benefit, index) => `<article>
            <span>${String(index + 1).padStart(2, '0')}</span>
            <p>${escapeHtml(benefit)}</p>
          </article>`,
            )
            .join('\n')}
        </div>
      </section>

      <section class="section comparison">
        <div class="section-heading">
          <p class="eyebrow">${escapeHtml(copy.processEyebrow)}</p>
          <h2>${escapeHtml(copy.processTitle)}</h2>
        </div>
        <ol class="steps">
          ${copy.steps
            .map(([title, body]) => `<li><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></li>`)
            .join('\n          ')}
        </ol>
      </section>

      <section class="section faq">
        <div class="section-heading">
          <p class="eyebrow">FAQ</p>
          <h2>${escapeHtml(copy.faqTitle)}</h2>
        </div>
        ${page.faq
          .map(
            ([question, answer]) => `<details>
          <summary>${escapeHtml(question)}</summary>
          <p>${escapeHtml(answer)}</p>
        </details>`,
          )
          .join('\n')}
      </section>

      <section class="section related-pages">
        <div class="section-heading">
          <p class="eyebrow">${escapeHtml(copy.relatedEyebrow)}</p>
          <h2>${escapeHtml(copy.relatedTitle)}</h2>
        </div>
        <div>${relatedLinks}</div>
      </section>

      <section class="section demo seo-demo">
        <div>
          <p class="eyebrow">${escapeHtml(copy.nextEyebrow)}</p>
          <h2>${escapeHtml(copy.nextTitle)}</h2>
          <p>${escapeHtml(copy.nextCopy)}</p>
        </div>
        <a class="button primary" href="${copy.demoHref}">${escapeHtml(copy.primaryCta)}</a>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-brand">
        <img class="brand-logo" src="/assets/jilanov-logo-compact.webp" alt="Jilanov.com logo" width="40" height="40" />
        <p>Assistant SaaS</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="${copy.homeHref}">AI chatbot</a>
        <a href="${copy.pricingHref}">${escapeHtml(copy.navPricing)}</a>
        <a href="${copy.demoHref}">${escapeHtml(copy.navDemo)}</a>
      </nav>
    </footer>
  </body>
</html>
`;
}

function renderSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls
  .map(
    (entry) => `  <url>
    <loc>${entry.loc}</loc>
${renderSitemapAlternates(entry)}
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /console/
Disallow: /admin/
Disallow: /public/
Disallow: /health

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function pageUrl(slug) {
  return slug ? `${siteUrl}/${slug}/` : `${siteUrl}/`;
}

function getPageAlternates(page) {
  const locale = page.locale || 'bg';
  const alternates = [{ hreflang: locale, href: pageUrl(page.slug) }];
  const alternateSlug = page.slug === 'bg' ? '' : alternateBySlug.get(page.slug);

  if (alternateSlug !== undefined) {
    alternates.push({ hreflang: locale === 'bg' ? 'en' : 'bg', href: pageUrl(alternateSlug) });
  }

  alternates.push({ hreflang: 'x-default', href: `${siteUrl}/` });
  return alternates;
}

function getHomeAlternates() {
  return [
    { hreflang: 'en', href: `${siteUrl}/` },
    { hreflang: 'bg', href: `${siteUrl}/bg/` },
    { hreflang: 'x-default', href: `${siteUrl}/` },
  ];
}

function renderHreflangLinks(alternates) {
  return alternates.map((alternate) => `<link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`).join('\n    ');
}

function renderSitemapAlternates(entry) {
  const alternates = entry.page ? getPageAlternates(entry.page) : getHomeAlternates();
  return alternates
    .map(
      (alternate) =>
        `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`,
    )
    .join('\n');
}

function getBreadcrumbItems(page, canonical) {
  if ((page.locale || 'bg') === 'en') {
    return [{ name: page.title, item: canonical }];
  }

  if (page.slug === 'bg') {
    return [{ name: 'AI chatbot', item: `${siteUrl}/bg/` }];
  }

  return [
    { name: 'AI chatbot', item: `${siteUrl}/bg/` },
    { name: page.title, item: canonical },
  ];
}

for (const page of pages) {
  await writePublicFile(`${page.slug}/index.html`, renderPage(page));
}

await writePublicFile('sitemap.xml', renderSitemap());
await writePublicFile('robots.txt', renderRobots());

process.stdout.write(`Generated ${pages.length} marketing pages, sitemap.xml, and robots.txt\n`);

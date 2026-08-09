import { access, readFile } from 'node:fs/promises';

const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/bg/index.html',
  'public/bg/ai-chatbot-za-online-magazin/index.html',
  'public/bg/chatbot-za-opencart/index.html',
  'public/bg/ceni/index.html',
  'public/bg/demo/index.html',
  'public/bg/gdpr-sigurnost/index.html',
  'public/en/ecommerce-ai-chatbot/index.html',
  'public/en/opencart-chatbot/index.html',
  'public/en/pricing/index.html',
  'public/en/demo/index.html',
  'public/en/gdpr-security/index.html',
  'public/vendor/widget.js',
  'public/assets/hero-assistant-dashboard.png',
  'public/assets/jilanov-logo-compact.webp',
];

for (const file of required) {
  await access(new URL(`../${file}`, import.meta.url));
}

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
for (const text of [
  'Book a demo',
  'Commerce Assistant',
  'Action audit',
  'AI assistant',
  'Try live assistant',
  'For Bulgaria',
  '30-day pilot',
  'Start pilot',
  'from 99 BGN/month',
  'rel="canonical"',
  'application/ld+json',
  'https://chatbot.jilanov.com/assets/hero-assistant-dashboard.png',
  'data-cfasync="false"',
  'defer',
]) {
  if (!html.includes(text)) throw new Error(`Missing landing copy: ${text}`);
}
for (const text of ['data-locale-option="bg"', 'data-locale-option="en"']) {
  if (!html.includes(text)) throw new Error(`Missing language switch: ${text}`);
}

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
for (const text of [
  'data-demo-prompt',
  'submitDemoForm',
  '/public/sites/',
  'CHATBOT_LOCALE',
  'waitForChatbot',
  'chatbot:ready',
  'assistantLoading',
  'assistantUnavailable',
  'Timeline',
  'За България',
  'от 99 лв./месец',
  'Асистент',
]) {
  if (!script.includes(text)) throw new Error(`Missing landing behavior: ${text}`);
}
for (const text of ['Start API first', 'Стартирайте API', 'startApiFirst']) {
  if (script.includes(text)) throw new Error(`Dev-only prompt fallback leaked into landing script: ${text}`);
}

const translationsIndex = script.indexOf('const translations = {');
const bootstrapIndex = script.lastIndexOf('bootstrap();');
if (translationsIndex === -1 || bootstrapIndex === -1 || bootstrapIndex < translationsIndex) {
  throw new Error('Landing translations must be initialized before bootstrap runs');
}

const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
for (const text of ['Disallow: /console/', 'Sitemap: https://chatbot.jilanov.com/sitemap.xml']) {
  if (!robots.includes(text)) throw new Error(`Missing robots rule: ${text}`);
}

const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
for (const text of [
  'xmlns:xhtml="http://www.w3.org/1999/xhtml"',
  'https://chatbot.jilanov.com/',
  'https://chatbot.jilanov.com/bg/',
  'https://chatbot.jilanov.com/bg/chatbot-za-opencart/',
  'https://chatbot.jilanov.com/bg/gdpr-sigurnost/',
  'https://chatbot.jilanov.com/en/ecommerce-ai-chatbot/',
  'https://chatbot.jilanov.com/en/opencart-chatbot/',
  'hreflang="en"',
  'hreflang="bg"',
  'hreflang="x-default"',
]) {
  if (!sitemap.includes(text)) throw new Error(`Missing sitemap URL: ${text}`);
}

const bgPage = await readFile(new URL('../public/bg/ai-chatbot-za-online-magazin/index.html', import.meta.url), 'utf8');
for (const text of ['AI chatbot за онлайн магазин', 'FAQPage', 'BreadcrumbList', 'rel="canonical"', 'hreflang="en"']) {
  if (!bgPage.includes(text)) throw new Error(`Missing generated SEO page content: ${text}`);
}

const enPage = await readFile(new URL('../public/en/ecommerce-ai-chatbot/index.html', import.meta.url), 'utf8');
for (const text of [
  '<html lang="en">',
  'AI chatbot for ecommerce stores',
  'Book a demo',
  'Frequently asked questions',
  'FAQPage',
  'BreadcrumbList',
  'rel="canonical"',
  'hreflang="bg"',
]) {
  if (!enPage.includes(text)) throw new Error(`Missing generated English SEO page content: ${text}`);
}

process.stdout.write('Marketing page check passed\n');

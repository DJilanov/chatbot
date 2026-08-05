import { access, readFile } from 'node:fs/promises';

const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
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
  'Timeline',
  'За България',
  'от 99 лв./месец',
  'Асистент',
]) {
  if (!script.includes(text)) throw new Error(`Missing landing behavior: ${text}`);
}

const translationsIndex = script.indexOf('const translations = {');
const bootstrapIndex = script.lastIndexOf('bootstrap();');
if (translationsIndex === -1 || bootstrapIndex === -1 || bootstrapIndex < translationsIndex) {
  throw new Error('Landing translations must be initialized before bootstrap runs');
}

process.stdout.write('Marketing page check passed\n');

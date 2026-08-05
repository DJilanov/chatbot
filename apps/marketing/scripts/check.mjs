import { access, readFile } from 'node:fs/promises';

const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/vendor/widget.js',
  'public/assets/hero-assistant-dashboard.png',
];

for (const file of required) {
  await access(new URL(`../${file}`, import.meta.url));
}

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
for (const text of ['Book a demo', 'Commerce Assistant', 'Action audit', 'AI assistant', 'Try live assistant']) {
  if (!html.includes(text)) throw new Error(`Missing landing copy: ${text}`);
}

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
for (const text of ['data-demo-prompt', 'submitDemoForm', '/public/sites/']) {
  if (!script.includes(text)) throw new Error(`Missing landing behavior: ${text}`);
}

process.stdout.write('Marketing page check passed\n');

import { access, readFile } from 'node:fs/promises';

const files = ['public/index.html', 'public/styles.css', 'public/admin.js'];
for (const file of files) await access(new URL(`../${file}`, import.meta.url));

const script = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');
for (const text of [
  'createOrganization',
  'createSite',
  'saveConfig',
  'saveBilling',
  'createUser',
  'updateUser',
  'exportSiteData',
  'erasePrivacySubject',
  'runRetentionCleanup',
  'addKnowledge',
  'renderMissingAnswers',
  'draftKnowledgeFromMissingAnswer',
  'reviewMissingAnswer',
  '/missing-answers',
  '/actions/',
  'updateLeadStatus',
  'updateSupportTicketStatus',
  'exportLeads',
  'renderBilling',
  'renderUsers',
  'renderIdentity',
  'clearWorkspace',
  '/admin/me',
]) {
  if (!script.includes(text)) throw new Error(`Missing admin behavior: ${text}`);
}

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
for (const text of ['Access token', 'identity-summary', 'sign-out-button', 'Missing answers', 'missing-answer-list']) {
  if (!html.includes(text)) throw new Error(`Missing admin markup: ${text}`);
}

process.stdout.write('Admin console check passed\n');

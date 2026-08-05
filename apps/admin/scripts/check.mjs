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
  'updateLeadStatus',
  'updateSupportTicketStatus',
  'exportLeads',
  'renderBilling',
  'renderUsers',
]) {
  if (!script.includes(text)) throw new Error(`Missing admin behavior: ${text}`);
}

process.stdout.write('Admin console check passed\n');

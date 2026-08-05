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
  'importKnowledgeUrl',
  'importKnowledgeCsv',
  'importKnowledgeFaq',
  'importKnowledgeDocument',
  'readFileAsBase64',
  'importProducts',
  'importProductsUrl',
  'renderProducts',
  'updateProduct',
  'deleteProduct',
  'actionMetadata',
  'renderKnowledgeImportDrafts',
  'applyKnowledgeDraft',
  '/knowledge/import-url',
  '/knowledge/import-csv',
  '/knowledge/import-faq',
  '/knowledge/import-document',
  '/products/import',
  '/products/import-url',
  'renderMissingAnswers',
  'draftKnowledgeFromMissingAnswer',
  'reviewMissingAnswer',
  '/missing-answers',
  '/actions/',
  'updateLeadStatus',
  'updateSupportTicketStatus',
  'exportLeads',
  'duplicateOfLeadId',
  'lead_duplicate_detected',
  'booking_link_clicked',
  'renderBilling',
  'renderUsers',
  'renderIdentity',
  'clearWorkspace',
  'detectAdminLocale',
  'applyAdminLocale',
  'adminTranslations',
  '/admin/me',
]) {
  if (!script.includes(text)) throw new Error(`Missing admin behavior: ${text}`);
}

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
for (const text of [
  'Access token',
  'admin-language',
  'identity-summary',
  'sign-out-button',
  'Booking URL',
  'Website page URL',
  'knowledge-import-form',
  'CSV knowledge rows',
  'knowledge-csv-import-form',
  'Pasted FAQ or policy text',
  'knowledge-faq-import-form',
  'PDF or DOCX file',
  'knowledge-document-import-form',
  'Product feed',
  'product-url-import-form',
  'product-import-form',
  'product-list',
  'knowledge-import-draft-list',
  'Missing answers',
  'missing-answer-list',
]) {
  if (!html.includes(text)) throw new Error(`Missing admin markup: ${text}`);
}

process.stdout.write('Admin console check passed\n');

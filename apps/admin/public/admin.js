const localDefaultToken =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'change-me' : '';
const localDefaultApiUrl =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : window.location.origin;
const adminLocaleKey = 'admin:locale';
const textNodeOriginals = new WeakMap();

const state = {
  apiUrl: localStorage.getItem('admin:apiUrl') || localDefaultApiUrl,
  token: localStorage.getItem('admin:token') || localDefaultToken,
  locale: normalizeAdminLocale(localStorage.getItem(adminLocaleKey) || detectAdminLocale()),
  identity: null,
  organizations: [],
  sites: [],
  billingPlans: [],
  missingAnswers: [],
  importDrafts: [],
  selectedSiteId: localStorage.getItem('admin:selectedSiteId') || '',
};

const qs = (selector) => document.querySelector(selector);

const adminTranslations = {
  bg: {
    'Assistant SaaS Admin': 'Админ | Assistant SaaS',
    'Admin console': 'Админ конзола',
    Language: 'Език',
    Bulgarian: 'Български',
    English: 'Английски',
    'API URL': 'API адрес',
    'Access token': 'Токен за достъп',
    Connect: 'Свържи',
    'Sign out': 'Изход',
    'Not connected': 'Няма връзка',
    'Connect to the API to start.': 'Свържете се с API, за да започнете.',
    'Create organization': 'Създай организация',
    'Organization name': 'Име на организация',
    'Create site': 'Създай сайт',
    'Site name': 'Име на сайт',
    Sites: 'Сайтове',
    'Knowledge entries': 'Записи знания',
    'Monthly conversations': 'Месечни разговори',
    'Monthly messages': 'Месечни съобщения',
    'Monthly leads': 'Месечни запитвания',
    'Site configuration': 'Настройки на сайта',
    Refresh: 'Обнови',
    'Assistant title': 'Заглавие на асистента',
    Subtitle: 'Подзаглавие',
    'Assistant name': 'Име на асистента',
    'Primary color': 'Основен цвят',
    'Contact email': 'Имейл за контакт',
    'Contact phone': 'Телефон за контакт',
    'Lead webhook URL': 'Webhook адрес за запитвания',
    'Support webhook URL': 'Webhook адрес за поддръжка',
    'Welcome message': 'Приветствено съобщение',
    'Fallback message': 'Резервен отговор',
    'Lead capture prompt': 'Подкана за контакт',
    'Save configuration': 'Запази настройките',
    'Knowledge base': 'База знания',
    'Website page URL': 'Адрес на страница',
    Intent: 'Намерение',
    'Import draft': 'Импортирай чернова',
    'CSV knowledge rows': 'CSV редове за знания',
    'Default language': 'Език по подразбиране',
    'Default intent': 'Намерение по подразбиране',
    'Import CSV drafts': 'Импортирай CSV чернови',
    'Pasted FAQ or policy text': 'Поставен FAQ или текст с правила',
    'Import FAQ drafts': 'Импортирай FAQ чернови',
    Title: 'Заглавие',
    Keywords: 'Ключови думи',
    'English answer': 'Отговор на английски',
    'Bulgarian answer': 'Отговор на български',
    'Add knowledge': 'Добави знание',
    'Missing answers': 'Липсващи отговори',
    Conversations: 'Разговори',
    Messages: 'Съобщения',
    Leads: 'Запитвания',
    Handoffs: 'Прехвърляния',
    Billing: 'Абонамент',
    Plan: 'План',
    Status: 'Статус',
    Trialing: 'Пробен период',
    Active: 'Активен',
    'Past due': 'Просрочен',
    Paused: 'Пауза',
    Canceled: 'Отказан',
    'Trial ends at': 'Пробният период приключва',
    'Period end': 'Край на периода',
    'Save billing': 'Запази абонамента',
    Users: 'Потребители',
    Name: 'Име',
    Email: 'Имейл',
    Role: 'Роля',
    Owner: 'Собственик',
    Admin: 'Админ',
    Support: 'Поддръжка',
    Viewer: 'Наблюдател',
    'Human handoff': 'Прехвърляне към човек',
    'Create user': 'Създай потребител',
    Privacy: 'Поверителност',
    'Export JSON': 'Експорт JSON',
    Phone: 'Телефон',
    'Visitor ID': 'ID на посетител',
    'Conversation ID': 'ID на разговор',
    Reason: 'Причина',
    'Erase subject': 'Изтрий субект',
    'Run retention': 'Пусни retention',
    'Recent leads': 'Последни запитвания',
    'Export CSV': 'Експорт CSV',
    'Support queue': 'Опашка поддръжка',
    'Action audit': 'Одит на действия',
    'Paste bootstrap or user token': 'Поставете bootstrap или потребителски токен',
    'Customer requested erasure': 'Клиентът поиска изтриване',
    'pricing, quote, cost': 'цени, оферта, стойност',
    'Question: How does delivery work?\nAnswer: We deliver within two business days.\n\nQuestion: What is the warranty?\nAnswer: Warranty requests are reviewed by our team.':
      'Въпрос: Как работи доставката?\nОтговор: Доставяме до два работни дни.\n\nВъпрос: Каква е гаранцията?\nОтговор: Гаранционните заявки се преглеждат от нашия екип.',
    'Connected.': 'Свързано.',
    Connected: 'Свързано',
    'Connected as bootstrap admin': 'Свързано като bootstrap админ',
    'Connected as {name} ({role}) - {email}': 'Свързано като {name} ({role}) - {email}',
    'Configuration saved.': 'Настройките са запазени.',
    'Billing saved.': 'Абонаментът е запазен.',
    'User created.': 'Потребителят е създаден.',
    'Knowledge entry added.': 'Знанието е добавено.',
    'Knowledge draft imported from {sourceUrl}. Review it before saving.':
      'Чернова е импортирана от {sourceUrl}. Прегледайте я преди запис.',
    'Imported {count} CSV drafts. Review a draft before saving.':
      'Импортирани са {count} CSV чернови. Прегледайте чернова преди запис.',
    'Imported {count} FAQ drafts. Review a draft before saving.':
      'Импортирани са {count} FAQ чернови. Прегледайте чернова преди запис.',
    'Knowledge draft prepared. Add the approved answer before saving.':
      'Черновата е подготвена. Добавете одобрен отговор преди запис.',
    'Knowledge draft loaded. Review it before saving.': 'Черновата е заредена. Прегледайте я преди запис.',
    'Missing answer marked reviewed.': 'Липсващият отговор е маркиран като прегледан.',
    'User saved.': 'Потребителят е запазен.',
    'Lead status saved.': 'Статусът на запитването е запазен.',
    'Support ticket status saved.': 'Статусът на тикета е запазен.',
    'Lead export downloaded.': 'CSV експортът на запитвания е изтеглен.',
    'Site data export downloaded.': 'Експортът на данни за сайта е изтеглен.',
    'Privacy erasure completed.': 'Изтриването по поверителност е завършено.',
    'Retention cleanup completed.': 'Retention почистването е завършено.',
    'Signed out.': 'Излязохте от профила.',
    'No assistant reply recorded.': 'Няма записан отговор от асистента.',
    'No missing answers to review.': 'Няма липсващи отговори за преглед.',
    'No users yet.': 'Все още няма потребители.',
    'No leads yet.': 'Все още няма запитвания.',
    'No support tickets yet.': 'Все още няма тикети за поддръжка.',
    'No actions yet.': 'Все още няма действия.',
    'CSV rows were skipped.': 'CSV реда бяха пропуснати.',
    'FAQ blocks were skipped.': 'FAQ блока бяха пропуснати.',
    'Use draft': 'Използвай чернова',
    'Draft knowledge': 'Чернова знание',
    'Mark reviewed': 'Маркирай прегледано',
    'Resolution note': 'Бележка за решение',
    Disabled: 'Деактивиран',
    Save: 'Запази',
    Lead: 'Запитване',
    'Shown once. If email notifications are configured, an invitation email was also sent.':
      'Показва се еднократно. Ако имейл известията са настроени, поканата е изпратена и по имейл.',
    unavailable: 'недостъпно',
    'used / unlimited': 'използвани / без лимит',
    'used /': 'използвани /',
    limit: 'лимит',
    entries: 'записа',
    entry: 'запис',
    open: 'отворени',
    users: 'потребители',
    user: 'потребител',
    'company info': 'информация за компанията',
    services: 'услуги',
    pricing: 'цени',
    'delivery policy': 'доставка',
    'returns policy': 'връщане',
    'warranty policy': 'гаранция',
    'payment policy': 'плащане',
    'invoice policy': 'фактури',
    support: 'поддръжка',
    'human handoff': 'прехвърляне към човек',
    custom: 'друго',
    owner: 'собственик',
    admin: 'админ',
    viewer: 'наблюдател',
    new: 'нов',
    contacted: 'контактуван',
    qualified: 'квалифициран',
    won: 'спечелен',
    lost: 'загубен',
    spam: 'спам',
    waiting_customer: 'чака клиент',
    waiting_staff: 'чака екип',
    resolved: 'решен',
    blocked: 'блокиран',
    trialing: 'пробен',
    active: 'активен',
    past_due: 'просрочен',
    paused: 'пауза',
    canceled: 'отказан',
    fallback: 'fallback',
    negative_feedback: 'негативна оценка',
    failed_action: 'неуспешно действие',
    answered: 'отговорено',
    pending_customer: 'чака клиент',
    pending_staff: 'чака екип',
    completed: 'завършено',
    failed: 'неуспешно',
    deterministic: 'детерминиран',
    ai: 'AI',
    customer_click: 'клик от клиент',
    system: 'система',
  },
};

function normalizeAdminLocale(value) {
  return value === 'en' ? 'en' : 'bg';
}

function detectAdminLocale() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => String(language || '').toLowerCase().startsWith('bg')) ? 'bg' : 'en';
}

function t(key, values = {}) {
  const dictionary = adminTranslations[state.locale] || {};
  const template = dictionary[key] || key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? '')),
    template,
  );
}

function translatedLabel(value) {
  return t(String(value || '').replace(/_/g, ' '));
}

function countLabel(count, singular, plural, bgPlural) {
  if (state.locale === 'bg') return `${count} ${bgPlural}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

function dateTime(value) {
  return new Date(value).toLocaleString(state.locale === 'bg' ? 'bg-BG' : 'en-US');
}

function applyAdminLocale() {
  document.documentElement.lang = state.locale;
  document.title = t('Assistant SaaS Admin');
  qs('#admin-language').value = state.locale;
  translateTextNodes(document.body);
  document.querySelectorAll('[placeholder]').forEach((node) => {
    const original = node.dataset.originalPlaceholder || node.getAttribute('placeholder') || '';
    node.dataset.originalPlaceholder = original;
    node.setAttribute('placeholder', t(original));
  });
}

function translateTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) continue;
    const value = node.nodeValue || '';
    const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const text = match?.[2] || '';
    if (!text.trim()) continue;
    const original = textNodeOriginals.get(node) || text;
    textNodeOriginals.set(node, original);
    node.nodeValue = `${match?.[1] || ''}${t(original)}${match?.[3] || ''}`;
  }
}

function headers() {
  return {
    Authorization: `Bearer ${state.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${state.apiUrl}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || response.statusText);
  return body;
}

function setStatus(message, kind = '') {
  const node = qs('#status');
  node.textContent = t(message);
  node.className = `status ${kind}`.trim();
}

function formRecord(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadAll() {
  const [identity, organizations, sites, billingPlans] = await Promise.all([
    api('/admin/me'),
    api('/admin/organizations'),
    api('/admin/sites'),
    api('/admin/billing-plans'),
  ]);
  state.identity = identity;
  state.organizations = organizations;
  state.sites = sites;
  state.billingPlans = billingPlans;
  if (!state.selectedSiteId && state.sites[0]) state.selectedSiteId = state.sites[0].id;
  renderIdentity();
  renderOrganizations();
  renderBillingPlans();
  renderSites();
  await loadSelectedSite();
  setStatus(t('Connected.'), 'ok');
}

function renderIdentity() {
  const summary = qs('#identity-summary');
  const signOut = qs('#sign-out-button');
  signOut.hidden = !state.token;
  if (!state.identity) {
    summary.textContent = t('Not connected');
    return;
  }
  if (state.identity.kind === 'bootstrap') {
    summary.textContent = t('Connected as bootstrap admin');
    return;
  }
  const user = state.identity.user;
  if (!user) {
    summary.textContent = t('Connected');
    return;
  }
  summary.textContent = t('Connected as {name} ({role}) - {email}', {
    name: user.name,
    role: translatedLabel(user.role),
    email: user.email,
  });
}

function clearWorkspace() {
  state.identity = null;
  state.organizations = [];
  state.sites = [];
  state.billingPlans = [];
  state.missingAnswers = [];
  state.importDrafts = [];
  state.selectedSiteId = '';
  localStorage.removeItem('admin:selectedSiteId');
  renderIdentity();
  qs('#organization-select').innerHTML = '';
  qs('#billing-plan-select').innerHTML = '';
  qs('#site-list').innerHTML = '';
  qs('#knowledge-count').textContent = countLabel(0, 'entry', 'entries', t('entries'));
  qs('#knowledge-list').innerHTML = '';
  qs('#knowledge-import-draft-list').innerHTML = '';
  qs('#missing-answer-count').textContent = countLabel(0, 'open', 'open', t('open'));
  qs('#missing-answer-list').innerHTML = '';
  qs('#user-count').textContent = countLabel(0, 'user', 'users', t('users'));
  qs('#user-list').innerHTML = '';
  qs('#created-token').hidden = true;
  qs('#lead-list').innerHTML = '';
  qs('#support-ticket-list').innerHTML = '';
  qs('#action-list').innerHTML = '';
  qs('#billing-usage').innerHTML = '';
  qs('#billing-status').textContent = '-';
  qs('#privacy-result').innerHTML = '';
  renderAnalytics({ conversations: 0, messages: 0, leads: 0, handoffs: 0 });
}

function renderOrganizations() {
  const select = qs('#organization-select');
  select.innerHTML = state.organizations
    .map((org) => `<option value="${escapeHtml(org.id)}">${escapeHtml(org.name)}</option>`)
    .join('');
}

function renderBillingPlans() {
  const select = qs('#billing-plan-select');
  if (!select) return;
  select.innerHTML = state.billingPlans
    .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</option>`)
    .join('');
}

function renderSites() {
  const list = qs('#site-list');
  list.innerHTML = state.sites
    .map(
      (site) => `
        <button type="button" data-site-id="${escapeHtml(site.id)}" class="${site.id === state.selectedSiteId ? 'active' : ''}">
          <strong>${escapeHtml(site.name)}</strong><br />
          <small>${escapeHtml(site.config.websiteUrl || site.id)}</small>
        </button>
      `,
    )
    .join('');
  list.querySelectorAll('button[data-site-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSiteId = button.dataset.siteId;
      localStorage.setItem('admin:selectedSiteId', state.selectedSiteId);
      renderSites();
      void loadSelectedSite();
    });
  });
}

async function loadSelectedSite() {
  if (!state.selectedSiteId) return;
  const site = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}`);
  fillConfig(site);
  const [knowledge, missingAnswers, analytics, billing, users, leads, actions, supportTickets] = await Promise.all([
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/knowledge`),
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/missing-answers`),
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/analytics?days=30`),
    optionalApi(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/billing`),
    optionalApi(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/users`),
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/leads`),
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/actions`),
    api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/support-tickets`),
  ]);
  state.missingAnswers = missingAnswers;
  renderKnowledge(knowledge);
  renderMissingAnswers(missingAnswers);
  renderAnalytics(analytics);
  renderBilling(billing);
  renderUsers(users);
  renderLeads(leads);
  renderActions(actions);
  renderSupportTickets(supportTickets);
}

async function optionalApi(path) {
  try {
    return await api(path);
  } catch (error) {
    return { unavailable: true, message: error.message };
  }
}

function fillConfig(site) {
  const form = qs('#config-form');
  const importForm = qs('#knowledge-import-form');
  const csvImportForm = qs('#knowledge-csv-import-form');
  const faqImportForm = qs('#knowledge-faq-import-form');
  form.elements.title.value = site.config.branding.title || '';
  form.elements.subtitle.value = site.config.branding.subtitle || '';
  form.elements.assistantName.value = site.config.branding.assistantName || '';
  form.elements.primaryColor.value = site.config.branding.primaryColor || '';
  form.elements.email.value = site.config.contact.email || '';
  form.elements.phone.value = site.config.contact.phone || '';
  form.elements.leadWebhookUrl.value = site.config.integrations?.leadWebhookUrl || '';
  form.elements.supportWebhookUrl.value = site.config.integrations?.supportWebhookUrl || '';
  form.elements.welcomeMessage.value = site.config.welcomeMessage || '';
  form.elements.fallbackMessage.value = site.config.fallbackMessage || '';
  form.elements.leadCapturePrompt.value = site.config.leadCapturePrompt || '';
  if (importForm) importForm.elements.locale.value = site.config.defaultLocale === 'en' ? 'en' : 'bg';
  if (csvImportForm) csvImportForm.elements.locale.value = site.config.defaultLocale === 'en' ? 'en' : 'bg';
  if (faqImportForm) faqImportForm.elements.locale.value = site.config.defaultLocale === 'en' ? 'en' : 'bg';
}

function renderKnowledge(entries) {
  qs('#knowledge-count').textContent = countLabel(entries.length, 'entry', 'entries', t('entries'));
  qs('#knowledge-list').innerHTML = entries
    .map(
      (entry) => `
        <article class="record">
          <strong>${escapeHtml(entry.title)}</strong>
          <p>${escapeHtml(translatedLabel(entry.intent))} | ${escapeHtml(entry.keywords.join(', '))}</p>
          <p>${escapeHtml(localizedAnswer(entry.answer))}</p>
        </article>
      `,
    )
    .join('');
}

function renderMissingAnswers(items) {
  state.missingAnswers = items;
  qs('#missing-answer-count').textContent = countLabel(items.length, 'open', 'open', t('open'));
  const list = qs('#missing-answer-list');
  list.innerHTML =
    items
      .slice(0, 10)
      .map(
        (item) => `
          <article class="record">
            <div class="record-heading">
              <strong>${escapeHtml(item.question || item.action)}</strong>
              <span class="pill">${escapeHtml(translatedLabel(item.trigger))} | ${escapeHtml(item.locale)}</span>
            </div>
            <p>${escapeHtml(item.assistantReply || t('No assistant reply recorded.'))}</p>
            <p>${escapeHtml(missingAnswerMeta(item))}</p>
            <div class="record-actions">
              <button type="button" data-draft-missing-answer="${escapeHtml(item.id)}">${escapeHtml(t('Draft knowledge'))}</button>
              <input data-review-note="${escapeHtml(item.id)}" placeholder="${escapeHtml(t('Resolution note'))}" />
              <button class="secondary-button" type="button" data-review-missing-answer="${escapeHtml(item.id)}">${escapeHtml(t('Mark reviewed'))}</button>
            </div>
          </article>
        `,
      )
      .join('') || `<p>${escapeHtml(t('No missing answers to review.'))}</p>`;
  list.querySelectorAll('button[data-draft-missing-answer]').forEach((button) => {
    button.addEventListener('click', () => draftKnowledgeFromMissingAnswer(button.dataset.draftMissingAnswer));
  });
  list.querySelectorAll('button[data-review-missing-answer]').forEach((button) => {
    button.addEventListener('click', () => {
      const actionId = button.dataset.reviewMissingAnswer;
      const note = qs(`[data-review-note="${cssEscape(actionId)}"]`);
      void reviewMissingAnswer(actionId, note?.value || '').catch((error) => setStatus(error.message, 'error'));
    });
  });
}

function renderAnalytics(summary) {
  qs('#metric-conversations').textContent = summary.conversations;
  qs('#metric-messages').textContent = summary.messages;
  qs('#metric-leads').textContent = summary.leads;
  qs('#metric-handoffs').textContent = summary.handoffs;
}

function renderBilling(summary) {
  if (summary.unavailable) {
    qs('#billing-status').textContent = t('unavailable');
    qs('#billing-usage').innerHTML = `<p>${escapeHtml(summary.message)}</p>`;
    qs('#billing-form').hidden = true;
    return;
  }
  qs('#billing-form').hidden = false;
  const form = qs('#billing-form');
  form.elements.planId.value = summary.billing.planId;
  form.elements.status.value = summary.billing.status;
  form.elements.trialEndsAt.value = summary.billing.trialEndsAt || '';
  form.elements.currentPeriodEnd.value = summary.billing.currentPeriodEnd || '';
  qs('#billing-status').textContent = summary.canUseService ? summary.billing.status : summary.blockReason || summary.billing.status;
  qs('#billing-usage').innerHTML = summary.metrics
    .map(
      (metric) => `
        <article class="usage-row ${metric.exceeded ? 'exceeded' : ''}">
          <div>
            <strong>${escapeHtml(t(metric.label))}</strong>
            <span>${escapeHtml(limitText(metric))}</span>
          </div>
          <progress value="${escapeHtml(progressValue(metric))}" max="100"></progress>
        </article>
      `,
    )
    .join('');
}

function renderUsers(result) {
  const form = qs('#user-form');
  const output = qs('#created-token');
  if (result.unavailable) {
    qs('#user-count').textContent = t('unavailable');
    form.hidden = true;
    output.hidden = true;
    qs('#user-list').innerHTML = `<p>${escapeHtml(result.message)}</p>`;
    return;
  }
  form.hidden = false;
  qs('#user-count').textContent = countLabel(result.length, 'user', 'users', t('users'));
  qs('#user-list').innerHTML =
    result
      .map(
        (user) => `
          <article class="record">
            <div class="record-heading">
              <strong>${escapeHtml(user.name)}</strong>
              <span class="pill">${escapeHtml(user.role)}</span>
            </div>
            <p>${escapeHtml(user.email)}</p>
            <div class="record-actions">
              <select data-user-role="${escapeHtml(user.id)}">
                ${roleOptions(user.role)}
              </select>
              <label class="checkbox-row">
                <input type="checkbox" data-user-disabled="${escapeHtml(user.id)}" ${user.disabled ? 'checked' : ''} />
                ${escapeHtml(t('Disabled'))}
              </label>
              <button type="button" data-save-user="${escapeHtml(user.id)}">${escapeHtml(t('Save'))}</button>
            </div>
          </article>
        `,
      )
      .join('') || `<p>${escapeHtml(t('No users yet.'))}</p>`;
  qs('#user-list').querySelectorAll('button[data-save-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const userId = button.dataset.saveUser;
      const role = qs(`[data-user-role="${cssEscape(userId)}"]`);
      const disabled = qs(`[data-user-disabled="${cssEscape(userId)}"]`);
      if (!role || !disabled) return;
      void updateUser(userId, role.value, disabled.checked).catch((error) => setStatus(error.message, 'error'));
    });
  });
}

function renderLeads(leads) {
  const list = qs('#lead-list');
  list.innerHTML =
    leads
      .slice()
      .reverse()
      .slice(0, 10)
      .map(
        (lead) => `
          <article class="record">
            <div class="record-heading">
              <strong>${escapeHtml(lead.email || lead.phone || lead.name || t('Lead'))}</strong>
              <span class="pill">${escapeHtml(translatedLabel(lead.status))}</span>
            </div>
            <p>${escapeHtml(lead.message)}</p>
            <p>${escapeHtml(dateTime(lead.createdAt))}</p>
            <div class="record-actions">
              <select data-lead-status="${escapeHtml(lead.id)}">
                ${leadStatusOptions(lead.status)}
              </select>
              <button type="button" data-save-lead="${escapeHtml(lead.id)}">${escapeHtml(t('Save'))}</button>
            </div>
          </article>
        `,
      )
      .join('') || `<p>${escapeHtml(t('No leads yet.'))}</p>`;
  list.querySelectorAll('button[data-save-lead]').forEach((button) => {
    button.addEventListener('click', () => {
      const leadId = button.dataset.saveLead;
      const select = qs(`[data-lead-status="${cssEscape(leadId)}"]`);
      if (!select) return;
      void updateLeadStatus(leadId, select.value).catch((error) => setStatus(error.message, 'error'));
    });
  });
}

function renderSupportTickets(tickets) {
  const list = qs('#support-ticket-list');
  list.innerHTML =
    tickets
      .slice()
      .reverse()
      .slice(0, 10)
      .map(
        (ticket) => `
          <article class="record">
            <div class="record-heading">
              <strong>${escapeHtml(ticket.customerEmail || ticket.customerPhone || ticket.reason)}</strong>
              <span class="pill">${escapeHtml(translatedLabel(ticket.status))}</span>
            </div>
            <p>${escapeHtml(ticket.sourceText)}</p>
            <p>${escapeHtml(dateTime(ticket.createdAt))}</p>
            <div class="record-actions">
              <select data-ticket-status="${escapeHtml(ticket.id)}">
                ${supportStatusOptions(ticket.status)}
              </select>
              <button type="button" data-save-ticket="${escapeHtml(ticket.id)}">${escapeHtml(t('Save'))}</button>
            </div>
          </article>
        `,
      )
      .join('') || `<p>${escapeHtml(t('No support tickets yet.'))}</p>`;
  list.querySelectorAll('button[data-save-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      const ticketId = button.dataset.saveTicket;
      const select = qs(`[data-ticket-status="${cssEscape(ticketId)}"]`);
      if (!select) return;
      void updateSupportTicketStatus(ticketId, select.value).catch((error) => setStatus(error.message, 'error'));
    });
  });
}

function renderActions(actions) {
  qs('#action-list').innerHTML =
    actions
      .slice()
      .reverse()
      .slice(0, 20)
      .map(
        (action) => `
          <article class="record">
            <strong>${escapeHtml(action.action)} | ${escapeHtml(translatedLabel(action.status))}</strong>
            <p>${escapeHtml(action.sourceText || '-')}</p>
            <p>${escapeHtml(action.reply || '')}</p>
          </article>
        `,
      )
      .join('') || `<p>${escapeHtml(t('No actions yet.'))}</p>`;
}

async function createOrganization(event) {
  event.preventDefault();
  const values = formRecord(event.currentTarget);
  await api('/admin/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: values.name }),
  });
  event.currentTarget.reset();
  await loadAll();
}

async function createSite(event) {
  event.preventDefault();
  const values = formRecord(event.currentTarget);
  const site = await api('/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      organizationId: values.organizationId,
      name: values.name,
      websiteUrl: values.websiteUrl || null,
      allowedDomains: splitList(values.allowedDomains),
    }),
  });
  state.selectedSiteId = site.id;
  localStorage.setItem('admin:selectedSiteId', state.selectedSiteId);
  event.currentTarget.reset();
  await loadAll();
}

async function saveConfig(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/config`, {
    method: 'PATCH',
    body: JSON.stringify({
      branding: {
        title: values.title,
        subtitle: values.subtitle,
        assistantName: values.assistantName,
        primaryColor: values.primaryColor,
      },
      contact: {
        email: values.email || null,
        phone: values.phone || null,
      },
      integrations: {
        leadWebhookUrl: values.leadWebhookUrl || null,
        supportWebhookUrl: values.supportWebhookUrl || null,
      },
      welcomeMessage: values.welcomeMessage,
      fallbackMessage: values.fallbackMessage,
      leadCapturePrompt: values.leadCapturePrompt,
    }),
  });
  await loadSelectedSite();
  setStatus('Configuration saved.', 'ok');
}

async function saveBilling(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/billing`, {
    method: 'PATCH',
    body: JSON.stringify({
      planId: values.planId,
      status: values.status,
      trialEndsAt: values.trialEndsAt || null,
      currentPeriodEnd: values.currentPeriodEnd || null,
    }),
  });
  await loadSelectedSite();
  setStatus('Billing saved.', 'ok');
}

async function createUser(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  const response = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/users`, {
    method: 'POST',
    body: JSON.stringify({
      name: values.name,
      email: values.email,
      role: values.role,
    }),
  });
  event.currentTarget.reset();
  renderCreatedToken(response);
  await loadSelectedSite();
  setStatus('User created.', 'ok');
}

async function addKnowledge(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/knowledge`, {
    method: 'POST',
    body: JSON.stringify({
      title: values.title,
      intent: values.intent,
      keywords: splitList(values.keywords),
      answer: {
        en: values.answerEn,
        bg: values.answerBg,
      },
    }),
  });
  event.currentTarget.reset();
  await loadSelectedSite();
  setStatus('Knowledge entry added.', 'ok');
}

async function importKnowledgeUrl(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  const draft = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/knowledge/import-url`, {
    method: 'POST',
    body: JSON.stringify({
      url: values.url,
      locale: values.locale,
      intent: values.intent,
    }),
  });
  state.importDrafts = [draft];
  renderKnowledgeImportDrafts(state.importDrafts, 0);
  applyKnowledgeDraft(draft);
  setStatus(t('Knowledge draft imported from {sourceUrl}. Review it before saving.', { sourceUrl: draft.sourceUrl }), 'ok');
}

async function importKnowledgeCsv(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  const response = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/knowledge/import-csv`, {
    method: 'POST',
    body: JSON.stringify({
      csv: values.csv,
      locale: values.locale,
      intent: values.intent,
    }),
  });
  state.importDrafts = response.drafts;
  renderKnowledgeImportDrafts(response.drafts, response.skippedRows);
  setStatus(t('Imported {count} CSV drafts. Review a draft before saving.', { count: response.drafts.length }), 'ok');
}

async function importKnowledgeFaq(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  const response = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/knowledge/import-faq`, {
    method: 'POST',
    body: JSON.stringify({
      text: values.text,
      locale: values.locale,
      intent: values.intent,
    }),
  });
  state.importDrafts = response.drafts;
  renderKnowledgeImportDrafts(response.drafts, response.skippedBlocks, 'FAQ blocks were skipped.');
  setStatus(t('Imported {count} FAQ drafts. Review a draft before saving.', { count: response.drafts.length }), 'ok');
}

function draftKnowledgeFromMissingAnswer(actionId) {
  const item = state.missingAnswers.find((missingAnswer) => missingAnswer.id === actionId);
  if (!item) return;
  const draft = {
    title: item.question.trim().slice(0, 120) || `Missing answer ${item.id}`,
    intent: guessKnowledgeIntent(item.question),
    keywords: draftKeywords(item.question),
    answer: {},
  };
  applyKnowledgeDraft(draft);
  setStatus('Knowledge draft prepared. Add the approved answer before saving.', 'ok');
}

function renderKnowledgeImportDrafts(drafts, skippedCount, skippedLabel = 'CSV rows were skipped.') {
  const list = qs('#knowledge-import-draft-list');
  list.innerHTML =
    drafts
      .map(
        (draft, index) => `
          <article class="record">
            <div class="record-heading">
              <strong>${escapeHtml(draft.title)}</strong>
              <span class="pill">${escapeHtml(translatedLabel(draft.intent))} | ${escapeHtml(draft.locale)}</span>
            </div>
            <p>${escapeHtml(draft.keywords.join(', '))}</p>
            <p>${escapeHtml(draftPreview(draft))}</p>
            <div class="record-actions">
              <button type="button" data-apply-knowledge-draft="${escapeHtml(index)}">${escapeHtml(t('Use draft'))}</button>
            </div>
          </article>
        `,
      )
      .join('');
  if (skippedCount) {
    list.insertAdjacentHTML('beforeend', `<p>${escapeHtml(`${skippedCount} ${t(skippedLabel)}`)}</p>`);
  }
  list.querySelectorAll('button[data-apply-knowledge-draft]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.applyKnowledgeDraft);
      const draft = state.importDrafts[index];
      if (!draft) return;
      applyKnowledgeDraft(draft);
      setStatus('Knowledge draft loaded. Review it before saving.', 'ok');
    });
  });
}

function applyKnowledgeDraft(draft) {
  const form = qs('#knowledge-form');
  form.elements.title.value = draft.title || '';
  form.elements.intent.value = draft.intent || 'custom';
  form.elements.keywords.value = Array.isArray(draft.keywords) ? draft.keywords.join(', ') : '';
  form.elements.answerEn.value = draft.answer?.en || '';
  form.elements.answerBg.value = draft.answer?.bg || '';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function reviewMissingAnswer(actionId, resolutionNote) {
  if (!state.selectedSiteId || !actionId) return;
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/actions/${encodeURIComponent(actionId)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ resolutionNote }),
  });
  await loadSelectedSite();
  setStatus('Missing answer marked reviewed.', 'ok');
}

async function updateUser(userId, role, disabled) {
  if (!state.selectedSiteId || !userId) return;
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role, disabled }),
  });
  await loadSelectedSite();
  setStatus('User saved.', 'ok');
}

async function updateLeadStatus(leadId, status) {
  if (!state.selectedSiteId || !leadId) return;
  await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  await loadSelectedSite();
  setStatus('Lead status saved.', 'ok');
}

async function updateSupportTicketStatus(ticketId, status) {
  if (!state.selectedSiteId || !ticketId) return;
  await api(
    `/admin/sites/${encodeURIComponent(state.selectedSiteId)}/support-tickets/${encodeURIComponent(ticketId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
  await loadSelectedSite();
  setStatus('Support ticket status saved.', 'ok');
}

async function exportLeads() {
  if (!state.selectedSiteId) return;
  const response = await fetch(
    `${state.apiUrl}/admin/sites/${encodeURIComponent(state.selectedSiteId)}/leads/export`,
    {
      headers: { Authorization: `Bearer ${state.token}` },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || response.statusText);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `leads-${state.selectedSiteId}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus('Lead export downloaded.', 'ok');
}

async function exportSiteData() {
  if (!state.selectedSiteId) return;
  const payload = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/privacy/export`);
  downloadJson(`site-data-${state.selectedSiteId}.json`, payload);
  renderPrivacyResult('Site data export downloaded.', payload);
  setStatus('Site data export downloaded.', 'ok');
}

async function erasePrivacySubject(event) {
  event.preventDefault();
  if (!state.selectedSiteId) return;
  const values = formRecord(event.currentTarget);
  const response = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/privacy/erase`, {
    method: 'POST',
    body: JSON.stringify({
      email: values.email || undefined,
      phone: values.phone || undefined,
      visitorId: values.visitorId || undefined,
      conversationId: values.conversationId || undefined,
      reason: values.reason || undefined,
    }),
  });
  event.currentTarget.reset();
  renderPrivacyResult('Privacy erasure completed.', response);
  await loadSelectedSite();
  setStatus('Privacy erasure completed.', 'ok');
}

async function runRetentionCleanup() {
  if (!state.selectedSiteId) return;
  const response = await api(`/admin/sites/${encodeURIComponent(state.selectedSiteId)}/privacy/retention-run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  renderPrivacyResult('Retention cleanup completed.', response);
  await loadSelectedSite();
  setStatus('Retention cleanup completed.', 'ok');
}

function leadStatusOptions(selected) {
  return ['new', 'contacted', 'qualified', 'won', 'lost', 'spam']
    .map((status) => optionHtml(status, selected))
    .join('');
}

function supportStatusOptions(selected) {
  return ['new', 'waiting_customer', 'waiting_staff', 'resolved', 'blocked']
    .map((status) => optionHtml(status, selected))
    .join('');
}

function roleOptions(selected) {
  return ['owner', 'admin', 'support', 'viewer'].map((role) => optionHtml(role, selected)).join('');
}

function missingAnswerMeta(item) {
  const parts = [
    `${translatedLabel(item.status)} / ${translatedLabel(item.confidence)}`,
    item.reason,
    item.pageUrl,
    dateTime(item.createdAt),
  ];
  return parts.filter(Boolean).join(' | ');
}

function localizedAnswer(answer) {
  if (state.locale === 'bg') return answer.bg || answer.en || '';
  return answer.en || answer.bg || '';
}

function draftPreview(draft) {
  return localizedAnswer(draft.answer || {}).slice(0, 220);
}

function guessKnowledgeIntent(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(цена|цени|колко струва|price|pricing|cost|quote)/i.test(normalized)) return 'pricing';
  if (/(доставка|куриер|delivery|shipping)/i.test(normalized)) return 'delivery_policy';
  if (/(връщане|return|refund|replace)/i.test(normalized)) return 'returns_policy';
  if (/(гаранц|warranty|guarantee)/i.test(normalized)) return 'warranty_policy';
  if (/(плащане|payment|card|cash|банков)/i.test(normalized)) return 'payment_policy';
  if (/(фактура|invoice|proforma|проформа)/i.test(normalized)) return 'invoice_policy';
  if (/(поддръжка|support|help|person|човек)/i.test(normalized)) return 'support';
  if (/(услуга|service|offer|предлаг)/i.test(normalized)) return 'services';
  return 'custom';
}

function draftKeywords(text) {
  const stopWords = new Set([
    'and',
    'the',
    'for',
    'with',
    'what',
    'how',
    'can',
    'this',
    'that',
    'как',
    'какво',
    'кога',
    'къде',
    'дали',
    'може',
    'имате',
    'това',
    'този',
    'тази',
    'съм',
    'сте',
  ]);
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3 && !stopWords.has(word))
        .slice(0, 8),
    ),
  ];
}

function optionHtml(value, selected) {
  const isSelected = value === selected ? ' selected' : '';
  return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(translatedLabel(value))}</option>`;
}

function renderCreatedToken(response) {
  const output = qs('#created-token');
  output.hidden = false;
  output.innerHTML = `
    <strong>${escapeHtml(response.user.email)} ${escapeHtml(t('Access token').toLowerCase())}</strong>
    <code>${escapeHtml(response.token)}</code>
    <p>${escapeHtml(t('Shown once. If email notifications are configured, an invitation email was also sent.'))}</p>
  `;
}

function renderPrivacyResult(title, payload) {
  qs('#privacy-result').innerHTML = `
    <article class="record">
      <strong>${escapeHtml(title)}</strong>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </article>
  `;
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function limitText(metric) {
  if (metric.limit === null) return `${metric.used} ${t('used / unlimited')}`;
  return `${metric.used} ${t('used /')} ${metric.limit} ${t('limit')}`;
}

function progressValue(metric) {
  if (metric.limit === null || metric.limit <= 0) return '0';
  return String(Math.min(100, Math.round((metric.used / metric.limit) * 100)));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value || '')) : String(value || '').replace(/"/g, '\\"');
}

qs('#api-url').value = state.apiUrl;
qs('#admin-token').value = state.token;
qs('#admin-language').value = state.locale;
applyAdminLocale();
renderIdentity();
qs('#admin-language').addEventListener('change', (event) => {
  state.locale = normalizeAdminLocale(event.currentTarget.value);
  localStorage.setItem(adminLocaleKey, state.locale);
  applyAdminLocale();
  renderIdentity();
  renderOrganizations();
  renderBillingPlans();
  renderSites();
  if (state.selectedSiteId) {
    void loadSelectedSite().catch((error) => setStatus(error.message, 'error'));
  }
});
qs('#connection-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.apiUrl = qs('#api-url').value.replace(/\/+$/, '');
  state.token = qs('#admin-token').value;
  localStorage.setItem('admin:apiUrl', state.apiUrl);
  localStorage.setItem('admin:token', state.token);
  try {
    await loadAll();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});
qs('#sign-out-button').addEventListener('click', () => {
  state.token = '';
  localStorage.removeItem('admin:token');
  qs('#admin-token').value = '';
  clearWorkspace();
  setStatus('Signed out.', '');
});
qs('#organization-form').addEventListener('submit', (event) => {
  void createOrganization(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#site-form').addEventListener('submit', (event) => {
  void createSite(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#config-form').addEventListener('submit', (event) => {
  void saveConfig(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#billing-form').addEventListener('submit', (event) => {
  void saveBilling(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#user-form').addEventListener('submit', (event) => {
  void createUser(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#privacy-erase-form').addEventListener('submit', (event) => {
  void erasePrivacySubject(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#knowledge-form').addEventListener('submit', (event) => {
  void addKnowledge(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#knowledge-import-form').addEventListener('submit', (event) => {
  void importKnowledgeUrl(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#knowledge-csv-import-form').addEventListener('submit', (event) => {
  void importKnowledgeCsv(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#knowledge-faq-import-form').addEventListener('submit', (event) => {
  void importKnowledgeFaq(event).catch((error) => setStatus(error.message, 'error'));
});
qs('#refresh-button').addEventListener('click', () => {
  void loadAll().catch((error) => setStatus(error.message, 'error'));
});
qs('#export-leads-button').addEventListener('click', () => {
  void exportLeads().catch((error) => setStatus(error.message, 'error'));
});
qs('#export-data-button').addEventListener('click', () => {
  void exportSiteData().catch((error) => setStatus(error.message, 'error'));
});
qs('#retention-run-button').addEventListener('click', () => {
  void runRetentionCleanup().catch((error) => setStatus(error.message, 'error'));
});

void loadAll().catch((error) => setStatus(error.message, 'error'));

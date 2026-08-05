import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { KnowledgeImportDraft, KnowledgeIntent, LocaleCode, LocalizedText } from '@chatbot/contracts';

const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_IMPORTED_ANSWER_CHARS = 2000;
const MAX_REDIRECTS = 3;

export class KnowledgeImportFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function importKnowledgeFromUrl(input: {
  url: unknown;
  locale: LocaleCode;
  intent: KnowledgeIntent;
  title: string | null;
  timeoutMs: number;
}): Promise<KnowledgeImportDraft> {
  const url = normalizeKnowledgeImportUrl(input.url);
  const raw = await fetchPublicText(url, input.timeoutMs);
  return createKnowledgeImportDraft(url, raw, input.locale, input.intent, input.title);
}

export function normalizeKnowledgeImportUrl(value: unknown): URL {
  if (typeof value !== 'string') {
    throw new KnowledgeImportFailure(400, 'import_url_required', 'Website page URL is required');
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new KnowledgeImportFailure(400, 'invalid_import_url', 'Website page URL is invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new KnowledgeImportFailure(400, 'invalid_import_url', 'Only HTTP and HTTPS pages can be imported');
  }
  if (url.username || url.password) {
    throw new KnowledgeImportFailure(400, 'invalid_import_url', 'Website page URL cannot include credentials');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new KnowledgeImportFailure(400, 'invalid_import_url', 'Only standard website ports can be imported');
  }
  url.hash = '';
  return url;
}

export function createKnowledgeImportDraft(
  sourceUrl: URL,
  rawContent: string,
  locale: LocaleCode,
  intent: KnowledgeIntent,
  titleOverride: string | null,
): KnowledgeImportDraft {
  const text = htmlToText(rawContent);
  if (text.length < 20) {
    throw new KnowledgeImportFailure(422, 'import_content_empty', 'The page did not contain enough readable text');
  }

  const title = sanitizeSingleLine(titleOverride || extractTitle(rawContent) || extractHeading(rawContent) || sourceUrl.hostname, 160);
  const answer: LocalizedText = {};
  answer[locale] = text.slice(0, MAX_IMPORTED_ANSWER_CHARS);

  return {
    sourceUrl: sourceUrl.toString(),
    title,
    locale,
    intent,
    keywords: extractKeywords(`${title} ${text}`, 12),
    answer,
    characterCount: text.length,
  };
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);

  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return true;
}

async function fetchPublicText(initialUrl: URL, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    let url = initialUrl;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await assertPublicImportTarget(url);
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'JilanovChatbotImporter/0.1',
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new KnowledgeImportFailure(502, 'import_redirect_invalid', 'Imported page redirected without a location');
        url = normalizeKnowledgeImportUrl(new URL(location, url).toString());
        continue;
      }

      if (!response.ok) {
        throw new KnowledgeImportFailure(502, 'import_fetch_failed', 'Could not fetch that website page');
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
        throw new KnowledgeImportFailure(415, 'import_content_type_unsupported', 'Only HTML and plain text pages can be imported');
      }
      return readLimitedText(response);
    }
  } catch (error) {
    if (error instanceof KnowledgeImportFailure) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new KnowledgeImportFailure(504, 'import_timeout', 'Website page import timed out');
    }
    throw new KnowledgeImportFailure(502, 'import_fetch_failed', 'Could not fetch that website page');
  } finally {
    clearTimeout(timeout);
  }
  throw new KnowledgeImportFailure(400, 'import_too_many_redirects', 'Website page redirected too many times');
}

async function assertPublicImportTarget(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new KnowledgeImportFailure(400, 'import_private_host', 'Only public website pages can be imported');
  }

  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new KnowledgeImportFailure(400, 'import_host_unresolved', 'Website page host could not be resolved');
      });

  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address.address))) {
    throw new KnowledgeImportFailure(400, 'import_private_host', 'Only public website pages can be imported');
  }
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
    throw new KnowledgeImportFailure(413, 'import_content_too_large', 'Website page is too large to import');
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
      throw new KnowledgeImportFailure(413, 'import_content_too_large', 'Website page is too large to import');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) {
      throw new KnowledgeImportFailure(413, 'import_content_too_large', 'Website page is too large to import');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function extractTitle(html: string): string {
  return decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
}

function extractHeading(html: string): string {
  return decodeHtmlEntities(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
}

function htmlToText(rawContent: string): string {
  const body = rawContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? rawContent;
  return decodeHtmlEntities(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(article|div|h[1-6]|li|p|section|td|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => codePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => codePoint(Number.parseInt(code, 16)));
}

function codePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return '';
  return String.fromCodePoint(value);
}

function sanitizeSingleLine(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength) || 'Imported page';
}

function extractKeywords(value: string, maxKeywords: number): string[] {
  const counts = new Map<string, number>();
  for (const word of value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)) {
    if (word.length < 3 || /^\d+$/.test(word) || IMPORT_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

const IMPORT_STOP_WORDS = new Set([
  'and',
  'are',
  'can',
  'for',
  'from',
  'how',
  'that',
  'the',
  'this',
  'what',
  'when',
  'where',
  'with',
  'ако',
  'без',
  'бих',
  'във',
  'дали',
  'защо',
  'как',
  'каква',
  'какви',
  'какво',
  'като',
  'кога',
  'къде',
  'може',
  'при',
  'сме',
  'сте',
  'това',
  'този',
  'тази',
  'чрез',
]);

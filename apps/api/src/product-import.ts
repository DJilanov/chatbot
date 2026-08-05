import type { ProductAvailability, ProductItem } from '@chatbot/contracts';
import { createId, nowIso } from './ids.js';

const MAX_PRODUCT_FEED_BYTES = 512 * 1024;
const MAX_PRODUCT_IMPORT_ROWS = 500;
const DEFAULT_CURRENCY = 'BGN';

export class ProductImportFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedProductFeed {
  products: ProductItem[];
  skippedRows: number;
}

export function parseProductFeed(input: {
  siteId: string;
  content: unknown;
  format: unknown;
  existingProducts?: ProductItem[];
}): ParsedProductFeed {
  const format = normalizeProductFeedFormat(input.format, input.content);
  const rows = format === 'json' ? jsonRows(input.content) : csvRows(input.content);
  const products: ProductItem[] = [];
  let skippedRows = 0;
  const existingByKey = productKeyMap(input.existingProducts ?? []);
  const seenKeys = new Set<string>();

  for (const row of rows) {
    if (products.length >= MAX_PRODUCT_IMPORT_ROWS) {
      skippedRows += 1;
      continue;
    }
    const product = productRowToItem(row, input.siteId, existingByKey);
    if (!product) {
      skippedRows += 1;
      continue;
    }
    const key = productKey(product);
    if (seenKeys.has(key)) {
      skippedRows += 1;
      continue;
    }
    seenKeys.add(key);
    products.push(product);
  }

  if (products.length === 0) {
    throw new ProductImportFailure(422, 'product_feed_no_items', 'Product feed did not contain usable products');
  }

  return { products, skippedRows };
}

export function productKey(product: Pick<ProductItem, 'sku' | 'title' | 'productUrl'>): string {
  if (product.sku) return `sku:${product.sku.toLowerCase()}`;
  if (product.productUrl) return `url:${product.productUrl.toLowerCase()}`;
  return `title:${normalizeSearchText(product.title)}`;
}

function normalizeProductFeedFormat(format: unknown, content: unknown): 'csv' | 'json' {
  if (format === 'csv' || format === 'json') return format;
  if (Array.isArray(content)) return 'json';
  if (isRecord(content) && (Array.isArray(content['products']) || Array.isArray(content['items']) || Array.isArray(content['data']))) {
    return 'json';
  }
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  }
  return 'csv';
}

function jsonRows(content: unknown): Array<Record<string, unknown>> {
  const parsed = typeof content === 'string' ? parseJsonContent(content) : content;
  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed['products'])
      ? parsed['products']
      : isRecord(parsed) && Array.isArray(parsed['items'])
        ? parsed['items']
        : isRecord(parsed) && Array.isArray(parsed['data'])
          ? parsed['data']
          : null;
  if (!rows) throw new ProductImportFailure(400, 'product_json_invalid', 'JSON feed must be an array or contain products/items/data');
  return rows.map((row) => (isRecord(row) ? row : {}));
}

function parseJsonContent(content: string): unknown {
  assertFeedSize(content);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ProductImportFailure(400, 'product_json_invalid', 'Product JSON feed is invalid');
  }
}

function csvRows(content: unknown): Array<Record<string, unknown>> {
  if (typeof content !== 'string' || !content.trim()) {
    throw new ProductImportFailure(400, 'product_feed_required', 'Product feed content is required');
  }
  assertFeedSize(content);
  const rows = parseCsv(content).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new ProductImportFailure(400, 'product_csv_header_required', 'CSV feed must include a header row and at least one product row');
  }
  const headers = rows[0]?.map(normalizeHeader) ?? [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])),
  );
}

function assertFeedSize(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_PRODUCT_FEED_BYTES) {
    throw new ProductImportFailure(413, 'product_feed_too_large', 'Product feed is too large');
  }
}

function productRowToItem(
  row: Record<string, unknown>,
  siteId: string,
  existingByKey: Map<string, ProductItem>,
): ProductItem | null {
  const timestamp = nowIso();
  const sku = optionalCell(row, ['sku', 'код', 'artikulen_nomer', 'артикулен_номер', 'part_number', 'model_number'], 120);
  const title = cell(row, ['title', 'name', 'product', 'име', 'продукт', 'заглавие'], 180);
  if (!title || title.length < 2) return null;

  const productUrl = optionalUrl(row, ['product_url', 'productUrl', 'url', 'link', 'адрес', 'линк']);
  const existing = existingByKey.get(productKey({ sku, title, productUrl }));
  const brand = optionalCell(row, ['brand', 'марка', 'manufacturer', 'производител'], 120);
  const category = optionalCell(row, ['category', 'категория', 'type', 'тип'], 160);
  const description = optionalCell(row, ['description', 'описание', 'summary', 'short_description'], 700);
  const price = normalizePrice(optionalCell(row, ['price', 'цена', 'regular_price', 'regularPrice', 'sale_price', 'salePrice'], 80));
  const currency = normalizeCurrency(optionalCell(row, ['currency', 'валута'], 12), price);
  const availability = normalizeAvailability(optionalCell(row, ['availability', 'stock', 'наличност', 'status', 'статус'], 80));
  const imageUrl = optionalUrl(row, ['image_url', 'imageUrl', 'image', 'picture', 'снимка', 'изображение']);
  const attributes = productAttributes(row);
  const keywords = productKeywords(row, `${title} ${brand ?? ''} ${category ?? ''} ${description ?? ''} ${sku ?? ''}`);

  return {
    id: existing?.id ?? createId('prod'),
    siteId,
    enabled: booleanCell(row, ['enabled', 'active', 'активен'], existing?.enabled ?? true),
    sku,
    title,
    brand,
    category,
    description,
    price,
    currency,
    availability,
    imageUrl,
    productUrl,
    attributes,
    keywords,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function productAttributes(row: Record<string, unknown>): Record<string, string> {
  const attributes: Record<string, string> = {};
  const rawAttributes = rawCell(row, ['attributes', 'specs', 'характеристики', 'атрибути']);
  if (typeof rawAttributes === 'string' && rawAttributes.trim()) {
    for (const [key, value] of Object.entries(parseAttributes(rawAttributes))) attributes[key] = value;
  } else if (isRecord(rawAttributes)) {
    for (const [key, rawValue] of Object.entries(rawAttributes)) {
      const safeKey = normalizeHeader(key).slice(0, 80);
      const safeValue = textValue(rawValue, 180);
      if (safeKey && safeValue) attributes[safeKey] = safeValue;
    }
  }
  for (const key of ['model', 'модел', 'color', 'цвят', 'size', 'размер', 'memory', 'памет', 'storage', 'диск', 'processor', 'процесор', 'display', 'дисплей', 'grade', 'състояние']) {
    const value = optionalCell(row, [key], 160);
    if (value) attributes[normalizeHeader(key)] = value;
  }
  return attributes;
}

function parseAttributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        for (const [key, rawValue] of Object.entries(parsed)) {
          const safeKey = normalizeHeader(key).slice(0, 80);
          const safeValue = textValue(rawValue, 180);
          if (safeKey && safeValue) result[safeKey] = safeValue;
        }
        return result;
      }
    } catch {
      return result;
    }
  }
  for (const pair of trimmed.split(/[;|]/)) {
    const [key, ...rest] = pair.split(/[:=]/);
    const safeKey = normalizeHeader(key ?? '').slice(0, 80);
    const safeValue = textValue(rest.join(':') || '', 180);
    if (safeKey && safeValue) result[safeKey] = safeValue;
  }
  return result;
}

function productKeywords(row: Record<string, unknown>, fallbackText: string): string[] {
  const explicit = optionalCell(row, ['keywords', 'keyword', 'tags', 'tagove', 'ключови_думи', 'ключови думи'], 1000)
    ?.split(/[;,|\n]/)
    .map((keyword) => textValue(keyword, 80).toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
  return explicit?.length ? [...new Set(explicit)] : extractKeywords(fallbackText, 16);
}

function cell(row: Record<string, unknown>, aliases: string[], maxLength: number): string {
  return optionalCell(row, aliases, maxLength) ?? '';
}

function optionalCell(row: Record<string, unknown>, aliases: string[], maxLength: number): string | null {
  const value = rawCell(row, aliases);
  const text = textValue(value, maxLength);
  return text || null;
}

function rawCell(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedRow = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (normalizedRow.has(key)) return normalizedRow.get(key);
  }
  return undefined;
}

function textValue(value: unknown, maxLength: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, maxLength);
  if (typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function booleanCell(row: Record<string, unknown>, aliases: string[], fallback: boolean): boolean {
  const value = optionalCell(row, aliases, 20);
  if (!value) return fallback;
  const normalized = normalizeHeader(value);
  if (['true', '1', 'yes', 'y', 'active', 'enabled', 'да', 'активен'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled', 'не', 'неактивен'].includes(normalized)) return false;
  return fallback;
}

function normalizePrice(value: string | null): number | null {
  if (!value) return null;
  const cleaned = normalizePriceText(value);
  const price = Number(cleaned);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100) / 100;
}

function normalizePriceText(value: string): string {
  const cleaned = value.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned || cleaned.includes('-')) return '';
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    return cleaned.replaceAll(thousandsSeparator, '').replace(decimalSeparator, '.');
  }
  if (lastComma >= 0) return normalizeSinglePriceSeparator(cleaned, ',');
  if (lastDot >= 0) return normalizeSinglePriceSeparator(cleaned, '.');
  return cleaned;
}

function normalizeSinglePriceSeparator(value: string, separator: ',' | '.'): string {
  const parts = value.split(separator);
  if (parts.length > 2) {
    const last = parts.at(-1) ?? '';
    return last.length === 2 ? `${parts.slice(0, -1).join('')}.${last}` : parts.join('');
  }
  const [whole = '', fraction = ''] = parts;
  if (!fraction) return whole;
  return fraction.length === 3 ? `${whole}${fraction}` : `${whole}.${fraction}`;
}

function normalizeCurrency(value: string | null, price: number | null): string | null {
  if (!value && price === null) return null;
  const currency = (value || DEFAULT_CURRENCY).trim().toUpperCase();
  if (currency === 'ЛВ' || currency === 'ЛЕВА') return 'BGN';
  if (/^[A-Z]{3}$/.test(currency)) return currency;
  return DEFAULT_CURRENCY;
}

function normalizeAvailability(value: string | null): ProductAvailability {
  if (!value) return 'unknown';
  const normalized = normalizeHeader(value);
  if (['in_stock', 'available', 'instock', 'yes', 'true', '1', 'наличен', 'налично', 'в_наличност'].includes(normalized)) {
    return 'in_stock';
  }
  if (['out_of_stock', 'unavailable', 'sold_out', 'no', 'false', '0', 'изчерпан', 'няма', 'не_е_наличен'].includes(normalized)) {
    return 'out_of_stock';
  }
  if (['preorder', 'pre_order', 'предварителна_поръчка', 'предварително'].includes(normalized)) return 'preorder';
  return 'unknown';
}

function optionalUrl(row: Record<string, unknown>, aliases: string[]): string | null {
  const value = optionalCell(row, aliases, 1000);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function productKeyMap(products: ProductItem[]): Map<string, ProductItem> {
  const map = new Map<string, ProductItem>();
  for (const product of products) map.set(productKey(product), product);
  return map;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new ProductImportFailure(400, 'product_csv_invalid', 'CSV contains an unclosed quoted field');
  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s@.+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(value: string, maxKeywords: number): string[] {
  const counts = new Map<string, number>();
  for (const word of normalizeSearchText(value).split(/\s+/)) {
    if (word.length < 3 || /^\d+$/.test(word) || PRODUCT_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const PRODUCT_STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'the',
  'this',
  'with',
  'без',
  'във',
  'для',
  'за',
  'към',
  'на',
  'от',
  'със',
]);

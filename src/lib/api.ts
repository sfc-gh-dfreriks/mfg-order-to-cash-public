// Data access layer (all amounts USD). Two modes:
//   - Live (default): the Express server at /api/*
//   - Static (VITE_STATIC=1, the public GitHub Pages build): pre-baked JSON under <base>/data/, written by
//     an export script (not built yet for this use case). Writes (Apply, free-text Cortex) are unavailable.
export const STATIC = import.meta.env.VITE_STATIC === '1';
/** Native App build (VITE_NATIVE=1): live /api over the data bundled in the app; Apply (dbt) is disabled. */
export const NATIVE = import.meta.env.VITE_NATIVE === '1';
const DATA_BASE = `${import.meta.env.BASE_URL}data`;
const BASE = '/api';

function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[camelizeKey(k)] = camelizeKeys(v);
    return out;
  }
  return obj;
}

/** FNV-1a hash for snapshot file names. MUST match hash() in scripts/export-static.mjs. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** Snapshot key: exact company set, plus '' or a single category. MUST match makeKey() in the export script. */
export function filterKey(companies: string[], categories: string[]): string {
  return `${[...companies].sort().join('|')}##${categories.length === 1 ? categories[0] : ''}`;
}
const fileCache = new Map<string, Promise<any>>();
function loadStatic(file: string): Promise<any> {
  let p = fileCache.get(file);
  if (!p) {
    p = fetch(`${DATA_BASE}/${file}.json`).then((r) => { if (!r.ok) throw new Error(`missing ${file}`); return r.json(); });
    p.catch(() => fileCache.delete(file));
    fileCache.set(file, p);
  }
  return p;
}
/** Baked combinations: every company subset with all categories, and all/one company with each single category.
 *  Anything else falls back to the nearest baked view (company selection first). */
async function loadKeyed(dir: string, companies: string[], categories: string[]): Promise<any> {
  const cat = categories.length === 1 ? categories[0] : '';
  const tries = [filterKey(companies, categories), filterKey(companies, []), filterKey([], cat ? [cat] : []), filterKey([], [])];
  for (const k of tries) {
    try { return await loadStatic(`${dir}/${hash(k)}`); } catch { /* next */ }
  }
  throw new Error('Snapshot not available');
}

async function get<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `API error: ${res.status}`);
  return camelizeKeys(body) as T;
}

/** Sidebar filters as query params. Lists are pipe-delimited (company names contain commas). */
export function filterParams(companies: string[], categories: string[], extra: Record<string, string> = {}): string {
  const p = new URLSearchParams(extra);
  if (companies.length) p.set('companies', companies.join('|'));
  if (categories.length) p.set('categories', categories.join('|'));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const fetchFilters = (): Promise<{ companies: string[]; categories: string[] }> =>
  STATIC ? loadStatic('filters') : get('/filters');
export async function fetchPage(page: string, companies: string[], categories: string[], extra: Record<string, string> = {}): Promise<any> {
  if (!STATIC) return get(`/${page}${filterParams(companies, categories, extra)}`);
  return camelizeKeys(await loadKeyed(page, companies, categories));
}

// ── Data Sources ────────────────────────────────────────────────────────────
export const fetchSources = () => (STATIC ? loadStatic('sources').then(camelizeKeys) : get('/sources'));
export const fetchSourcePreview = (slot: string, system: string) =>
  STATIC ? loadStatic(`sources-preview/${slot}__${system}`).then(camelizeKeys) : get(`/sources/preview?${new URLSearchParams({ slot, system })}`);
export const fetchJob = () => (STATIC ? Promise.resolve(null) : get('/sources/job'));
export const fetchLineage = () => (STATIC ? loadStatic('lineage').then(camelizeKeys) : get('/lineage'));
/** Ingestion profile per bronze schema: {SRC_ECC_A: {profile: 'FIVETRAN', schema: 'LND_FIVETRAN_ECC_A'}} (DIRECT = native tables). */
export type IngestionChoice = Record<string, { profile: string; schema?: string }>;
export async function applySelection(selection: Record<string, string | boolean>, ingestion?: IngestionChoice): Promise<{ id: string }> {
  if (STATIC) throw new Error('The public demo is a read-only snapshot. Run the app against Snowflake to switch sources and rebuild.');
  return post('/sources/apply', { selection, ingestion });
}

async function post<T = any>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `API error: ${res.status}`);
  return camelizeKeys(body) as T;
}

// ── SAP metadata connection ─────────────────────────────────────────────────
// Per SAP slot: how metadata is collected (AUTO / JCO_RFC / REPLICATED_DD / REFERENCE / CSN / BW) and whether the SAP
// JCo runtime is confirmed as permitted, with the adaptive plan. Read-only in the public snapshot (baked by
// scripts/export-static.mjs) and the Native App.
const NO_CONNECTION = { slots: [], runs: [], methods: [], job: null, readOnly: true };
export const fetchMetaConnection = () =>
  STATIC ? loadStatic('metadata/connection').then(camelizeKeys).catch(() => NO_CONNECTION) : get('/metadata/connection');
export interface ConnectionSave { slot: string; method: string; jcoPermitted: boolean; ddDatabase?: string; ddSchema?: string; note?: string }
export const saveMetaConnection = (c: ConnectionSave) => post('/metadata/connection', c);
export const startCollect = (slot: string, tables?: string[]) => post<{ id: string }>('/metadata/collect', { slot, tables });
export const fetchCollectJob = () => (STATIC ? Promise.resolve(null) : get('/metadata/collect/job'));

// ── Ask Cortex ──────────────────────────────────────────────────────────────
// POST starts a background job, then poll until done.
export interface AskCortexRequest {
  topic: string;
  args?: Record<string, string>;
  question?: string;
}

/** MUST match askKey() in scripts/export-static.mjs. */
export const askKey = (topic: string, question?: string) => `${topic}::${(question ?? '').trim()}`;

export async function askCortex(r: AskCortexRequest, signal?: AbortSignal): Promise<string> {
  if (STATIC) {
    const baked = (await loadStatic('ask_cortex').catch(() => ({}))) as Record<string, string>;
    return baked[askKey(r.topic, r.question)] ??
      '_This public demo includes Cortex answers for the suggested questions only. Run the app against Snowflake to ask your own._';
  }
  const start = await fetch(`${BASE}/ask-cortex`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r), signal,
  });
  if (!start.ok) throw new Error(`Ask Cortex: ${start.status}`);
  const { id } = await start.json();
  for (let i = 0; i < 90; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    if (signal?.aborted) throw new Error('cancelled');
    const j = await get<any>(`/ask-cortex/${id}`);
    if (j.status === 'done') return j.answer;
    if (j.status === 'error') throw new Error(j.error);
  }
  throw new Error('Ask Cortex timed out');
}

// ── SAP metadata & field mapping ────────────────────────────────────────────
// Public build: coverage, the mapping per object (default selection), one file per SAP table (fields plus the
// detail of every mapped field), enriched samples for the mapped SAP tables and the suggestions per (table, object).
const metaKey = (...parts: string[]) => parts.join('__');
export const fetchMetaCoverage = () => (STATIC ? loadStatic('metadata/coverage').then(camelizeKeys) : get('/metadata/coverage'));
export const fetchMetaMapping = (object: string) =>
  STATIC ? loadStatic(`metadata/mapping/${object}`).then(camelizeKeys) : get(`/metadata/mapping?${new URLSearchParams({ object })}`);
export const fetchMetaTable = (system: string, table: string) =>
  STATIC ? loadStatic(`metadata/table/${metaKey(system, table)}`).then(camelizeKeys) : get(`/metadata/table?${new URLSearchParams({ system, table })}`);
export async function fetchMetaField(system: string, table: string, field: string): Promise<any> {
  if (!STATIC) return get(`/metadata/field?${new URLSearchParams({ system, table, field })}`);
  const t = await loadStatic(`metadata/table/${metaKey(system, table)}`).catch(() => null);
  return camelizeKeys(t?.details?.[field] ?? { found: false });
}
export const fetchMetaEnriched = (schema: string, table: string) =>
  STATIC ? loadStatic(`metadata/enriched/${metaKey(schema, table)}`).then(camelizeKeys).catch(() => ({ exists: false, view: `ENRICHED.ENR_${schema}__${table}`, baked: false }))
    : get(`/metadata/enriched?${new URLSearchParams({ schema, table })}`);
export const fetchMetaSuggest = (system: string, table: string, object: string) =>
  STATIC ? loadStatic(`metadata/suggest/${metaKey(system, table, object)}`).then(camelizeKeys).catch(() => ({ ready: false, message: 'Not included in the public snapshot.' }))
    : get(`/metadata/suggest?${new URLSearchParams({ system, table, object })}`);

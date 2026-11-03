import { useMemo, useState } from 'react';
import { KeyRound, ListChecks, X, Info } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { fetchMetaMapping, fetchMetaField } from '@/lib/api';
import { cn } from '@/lib/utils';
import ChartCard from '@/components/ChartCard';
import PageState from '@/components/PageState';
import Bars from '@/components/Bars';

export const OBJECT_LABEL: Record<string, string> = {
  CUSTOMER: 'Customers', QUOTE: 'Quotes', SALES_ORDER_LINE: 'Order lines', DELIVERY_LINE: 'Delivery lines',
  SHIPMENT_EVENT: 'Shipment events', BILLING_LINE: 'Billing lines', AR_ITEM: 'Receivable items', DISPUTE_CASE: 'Disputes',
  PAYMENT_RECEIPT: 'Bank receipts',
};
const OBJECTS = Object.keys(OBJECT_LABEL);
export const SOURCE_BADGE: Record<string, string> = {
  DDIC: 'bg-blue-100 text-blue-800', CSN: 'bg-violet-100 text-violet-800', BW: 'bg-amber-100 text-amber-800', NONE: 'bg-gray-100 text-gray-500',
};
export function SourceBadge({ source }: { source?: string | null }) {
  const s = source || 'NONE';
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', SOURCE_BADGE[s] ?? SOURCE_BADGE.NONE)}>{s === 'NONE' ? 'none' : s}</span>;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function FieldMapping() {
  const [object, setObject] = useState('SALES_ORDER_LINE');
  const [showAll, setShowAll] = useState(false);
  const [cell, setCell] = useState<any[] | null>(null);
  const { data, loading, error } = useQuery(() => fetchMetaMapping(object), [object]);

  const rows: any[] = data?.rows ?? [];
  // Matrix columns: one per (slot, system); only the current selection unless "show all" is on.
  const systems = useMemo(() => {
    const seen = new Map<string, { slot: string; system: string; selected: boolean }>();
    for (const r of rows) {
      const k = `${r.sourceSlot}|${r.systemCode}`;
      if (!seen.has(k)) seen.set(k, { slot: r.sourceSlot, system: r.systemCode, selected: !!r.selected });
    }
    return [...seen.values()].filter((s) => showAll || s.selected)
      .sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.slot.startsWith('SAP_')) - Number(a.slot.startsWith('SAP_')) || a.slot.localeCompare(b.slot) || a.system.localeCompare(b.system));
  }, [rows, showAll]);
  const columns = useMemo(() => [...new Set(rows.map((r) => r.canonicalColumn as string))], [rows]);
  const cellRows = (col: string, s: { slot: string; system: string }) =>
    rows.filter((r) => r.canonicalColumn === col && r.sourceSlot === s.slot && r.systemCode === s.system);
  const coverage = systems.map((s) => {
    const mapped = columns.filter((c) => cellRows(c, s).some((r) => r.nativeField));
    const withMeta = columns.filter((c) => cellRows(c, s).some((r) => r.hasMetadata));
    return { name: `${s.slot} · ${s.system}`, pct: columns.length ? withMeta.length / columns.length : 0, mapped: mapped.length };
  });

  if (data && data.ready === false) {
    return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Metadata layer not built yet. {data.message}</div>;
  }
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 text-sm text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sf-primary" />
        How it works: each source's adapter spec (YAML) maps native fields to the canonical model; SAP metadata providers (DDIC for ECC/S/4,
        CSN for BDC data products, InfoObjects for BW) attach the SAP label, data element, domain and value list to every mapped field.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {OBJECTS.map((o) => (
          <button key={o} onClick={() => { setObject(o); setCell(null); }}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', o === object ? 'border-sf-primary bg-sf-primary text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-sf-primary')}>
            {OBJECT_LABEL[o]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include unselected systems
        </label>
      </div>
      <PageState loading={loading} error={error}>
        <div className="grid grid-cols-3 gap-6">
          <ChartCard title="Metadata coverage by source" subtitle="Share of canonical columns whose native field carries SAP metadata" className="col-span-1">
            <Bars rows={coverage} label="name" value="pct" format={pct} color="#29b5e8" height={Math.max(220, coverage.length * 34)} leftPad={130} />
          </ChartCard>
          <ChartCard title={`${OBJECT_LABEL[object]}: canonical column ← native field`} subtitle={`${columns.length} canonical columns × ${systems.length} sources · click a cell for the SAP field detail`} className="col-span-2">
            <div className="max-h-[560px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-sf-dark text-white">
                    <th className="sticky left-0 bg-sf-dark px-3 py-2 text-left font-medium">Canonical column</th>
                    {systems.map((s) => (
                      <th key={`${s.slot}|${s.system}`} className={cn('whitespace-nowrap px-3 py-2 text-left font-medium', !s.selected && 'opacity-60')}>
                        {s.slot}<div className="text-[10px] font-normal text-sf-pale/80">{s.system}{!s.selected && ' · not selected'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col) => (
                    <tr key={col} className="border-t border-gray-100 align-top">
                      <td className="sticky left-0 bg-white px-3 py-2 font-mono font-semibold text-sf-deeper">{col}
                        <div className="font-sans text-[10px] font-normal text-gray-400">{rows.find((r) => r.canonicalColumn === col)?.canonicalType}</div></td>
                      {systems.map((s) => {
                        const cr = cellRows(col, s).filter((r) => r.nativeField);
                        return (
                          <td key={s.slot + s.system} onClick={() => cr.length && setCell(cr)}
                            className={cn('px-3 py-2', cr.length ? 'cursor-pointer hover:bg-sky-50' : 'text-gray-300', !s.selected && 'opacity-60')}>
                            {cr.length === 0 ? '—' : cr.map((r, i) => (
                              <div key={i} className="mb-1 last:mb-0">
                                <div className="flex items-center gap-1 font-mono text-[11px] text-gray-700">
                                  {r.nativeTable}.{r.nativeField}
                                  {r.isKey && <KeyRound className="h-3 w-3 text-amber-600" aria-label="key field" />}
                                  {r.isDecodable && <ListChecks className="h-3 w-3 text-emerald-600" aria-label="decodable" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {r.sapLabel && <span className="font-semibold text-gray-900">{r.sapLabel}</span>}
                                  <SourceBadge source={r.metadataSource} />
                                </div>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><KeyRound className="h-3 w-3 text-amber-600" /> key field</span>
              <span className="flex items-center gap-1"><ListChecks className="h-3 w-3 text-emerald-600" /> decodable (domain value list)</span>
            </p>
          </ChartCard>
        </div>
      </PageState>
      {cell && <FieldPanel rows={cell} onClose={() => setCell(null)} />}
    </div>
  );
}

function FieldPanel({ rows, onClose }: { rows: any[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const r = rows[Math.min(i, rows.length - 1)];
  const { data, loading, error } = useQuery(
    () => (r.hasMetadata && r.metadataSystemType ? fetchMetaField(r.metadataSystemType, r.nativeTable, r.nativeField) : Promise.resolve({ found: false })),
    [r.metadataSystemType, r.nativeTable, r.nativeField]);
  const f = data?.found ? data.field : null;
  const facts: [string, any][] = [
    ['Source', `${r.sourceSlot} · ${r.systemCode} · ${r.nativeSchema}.${r.nativeTable}`],
    ['Expression', r.expr],
    ['Business name', r.businessName ?? f?.businessName],
    ['Data element', r.dataElement ?? f?.rollname],
    ['Domain', r.domain ?? f?.domname],
    ['SAP type', r.sapType ?? (f ? `${f.datatype}(${f.leng}${f.decimals ? `,${f.decimals}` : ''})` : null)],
    ['Unit reference', r.unitReference ?? f?.reffield],
    ['Check table', r.checkTable ?? f?.checktable],
    ['Table', r.tableText ?? data?.tableText],
  ];
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-gray-500">{r.canonicalColumn} ←</p>
          <h3 className="font-mono text-lg font-bold text-sf-deeper">{r.nativeTable}.{r.nativeField}</h3>
          <div className="mt-1 flex items-center gap-2">
            {(r.sapLabel ?? f?.scrtextL) && <span className="font-semibold">{r.sapLabel ?? f?.scrtextL}</span>}
            <SourceBadge source={r.metadataSource} />
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label="close"><X className="h-4 w-4" /></button>
      </div>
      {rows.length > 1 && (
        <div className="mb-3 flex gap-1">
          {rows.map((x, k) => <button key={k} onClick={() => setI(k)} className={cn('rounded border px-2 py-0.5 font-mono text-[11px]', k === i ? 'border-sf-primary bg-sky-50' : 'border-gray-200')}>{x.nativeField}</button>)}
        </div>
      )}
      <p className="mb-3 text-sm text-gray-700">{r.sapDescription ?? r.description ?? f?.description ?? f?.fieldtext ?? 'No SAP metadata for this source (non-SAP adapter).'}</p>
      <dl className="mb-4 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
        {facts.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="break-all font-mono text-gray-800">{String(v)}</dd></div>
        ))}
      </dl>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {loading && <div className="h-24 animate-pulse rounded bg-gray-100" />}
      {!!data?.domainValues?.length && (
        <>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Domain values ({data.domainValues.length}{data.domainValues.length === 50 ? '+' : ''})</h4>
          <table className="w-full text-xs">
            <tbody>
              {data.domainValues.map((d: any, k: number) => (
                <tr key={k} className="border-t border-gray-100"><td className="w-16 py-1 font-mono font-semibold">{d.domvalueL}{d.domvalueH ? `–${d.domvalueH}` : ''}</td><td className="py-1">{d.ddtext}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

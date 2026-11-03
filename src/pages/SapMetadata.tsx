import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Table2, Hash, ListChecks, KeyRound, Check, Sparkles, Info } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { fetchMetaCoverage, fetchMetaTable, fetchMetaEnriched, fetchMetaSuggest } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import ChartCard from '@/components/ChartCard';
import MetricCard from '@/components/MetricCard';
import PageState from '@/components/PageState';
import ReactECharts from '@/components/Chart';
import { OBJECT_LABEL, SourceBadge } from '@/pages/FieldMapping';

const PROVIDER: Record<string, { label: string; color: string; accent: string }> = {
  DDIC: { label: 'DDIC (ECC / S/4HANA)', color: '#29b5e8', accent: 'border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50' },
  BDC: { label: 'CSN (SAP BDC)', color: '#8b5cf6', accent: 'border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50' },
  BW: { label: 'BW InfoObjects', color: '#f59e0b', accent: 'border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50' },
};
// Native schemas that hold each provider's tables (SAP slots A and B).
const SCHEMAS: Record<string, string[]> = {
  DDIC: ['SRC_ECC_A', 'SRC_ECC_B', 'SRC_S4_A', 'SRC_S4_B'], BDC: ['SRC_BDC_A', 'SRC_BDC_B'], BW: ['SRC_BW_A', 'SRC_BW_B'],
};
type Tab = 'browser' | 'enriched' | 'assistant';

export default function SapMetadata() {
  const { data, loading, error } = useQuery(fetchMetaCoverage, []);
  const tables: any[] = data?.tables ?? [];
  const totals: any[] = data?.totals ?? [];
  const [system, setSystem] = useState('DDIC');
  const [table, setTable] = useState('EKKO');
  const [tab, setTab] = useState<Tab>('browser');
  const sysTables = useMemo(() => tables.filter((t) => t.systemType === system).sort((a, b) => a.tabname.localeCompare(b.tabname)), [tables, system]);
  useEffect(() => { if (sysTables.length && !sysTables.some((t) => t.tabname === table)) setTable(sysTables[0].tabname); }, [sysTables, table]);
  const mappedFields = tables.reduce((s, t) => s + (t.mapped ?? 0), 0);

  const ranked = [...tables].sort((a, b) => b.fields - a.fields);
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 text-sm text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sf-primary" />
        DDIC metadata is synced live from SAP S/4HANA via the JCo bridge (DD02L/DD03L/DD04T/DD07T). BDC (CSN) and BW (InfoObject) metadata are
        representative for this synthetic demo.
      </p>
      <PageState loading={loading} error={error}>
        <div className="grid grid-cols-4 gap-4">
          {['DDIC', 'BDC', 'BW'].map((p) => {
            const t = totals.find((x) => x.systemType === p);
            return <MetricCard key={p} title={PROVIDER[p].label} value={formatNumber(t?.fields ?? 0)} icon={BookOpen} accent={PROVIDER[p].accent}
              delta={`fields · ${formatNumber(t?.tables ?? 0)} tables · ${formatNumber(t?.domainValues ?? 0)} domain values`} deltaType="neutral" />;
          })}
          <MetricCard title="Fields used by the canonical model" value={formatNumber(mappedFields)} icon={Hash}
            delta={data?.ready ? 'distinct native fields in CONFIG.FIELD_MAPPING' : 'metadata layer not built yet'} deltaType="neutral" />
        </div>
        <ChartCard title="Fields per SAP table" subtitle="Ranked; colour = metadata provider. Bar label shows fields mapped to the canonical model.">
          <ReactECharts option={{
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
              formatter: (p: any) => { const t = ranked[p[0].dataIndex]; return `${t.tabname} (${t.systemType})<br/>${t.ddtext ?? ''}<br/>${t.fields} fields · ${t.mapped} mapped · ${t.decodable} decodable`; } },
            grid: { left: 190, right: 60, top: 10, bottom: 20 },
            xAxis: { type: 'value' },
            yAxis: { type: 'category', inverse: true, data: ranked.map((t) => `${t.tabname} · ${t.systemType}`), axisLabel: { fontSize: 10 } },
            series: [{ type: 'bar', barMaxWidth: 14,
              data: ranked.map((t) => ({ value: t.fields, itemStyle: { color: PROVIDER[t.systemType]?.color ?? '#94a3b8', borderRadius: [0, 4, 4, 0] } })),
              label: { show: true, position: 'right', fontSize: 10, formatter: (p: any) => (ranked[p.dataIndex].mapped ? `${ranked[p.dataIndex].mapped} mapped` : '') } }],
          }} style={{ height: Math.max(320, ranked.length * 20) }} />
          <div className="mt-2 flex gap-4 text-[11px] text-gray-600">
            {Object.entries(PROVIDER).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />{v.label}</span>)}
          </div>
        </ChartCard>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-md">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={system} onChange={(e) => setSystem(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="metadata provider">
              {Object.entries(PROVIDER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={table} onChange={(e) => setTable(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="table">
              {sysTables.map((t) => <option key={t.tabname} value={t.tabname}>{t.tabname} — {t.ddtext}</option>)}
            </select>
            <div className="ml-auto flex rounded-lg border border-gray-200 p-0.5 text-sm">
              {([['browser', 'Table browser', Table2], ['enriched', 'Enriched view', ListChecks], ['assistant', 'Mapping assistant', Sparkles]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setTab(id)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1', tab === id ? 'bg-sf-primary text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
          {tab === 'browser' && <TableBrowser system={system} table={table} />}
          {tab === 'enriched' && <EnrichedPreview system={system} table={table} />}
          {tab === 'assistant' && <Assistant system={system} table={table} />}
        </div>
      </PageState>
    </div>
  );
}

function TableBrowser({ system, table }: { system: string; table: string }) {
  const { data, loading, error } = useQuery(() => fetchMetaTable(system, table), [system, table]);
  const [q, setQ] = useState('');
  const fields: any[] = (data?.fields ?? []).filter((f: any) => !q || `${f.fieldname} ${f.scrtextL} ${f.businessName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <PageState loading={loading} error={error}>
      <div className="mb-2 flex items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter fields…" className="w-64 rounded border border-gray-300 px-2 py-1 text-sm" />
        <span className="text-xs text-gray-500">{fields.length} of {data?.fields?.length ?? 0} fields</span>
      </div>
      <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0"><tr className="bg-sf-dark text-left text-white">
            {['Field', 'SAP label', 'Business name', 'Type', 'Data element', 'Domain', 'Flags'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.fieldname} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-mono font-semibold">{f.fieldname}</td>
                <td className="px-3 py-1.5 font-semibold text-gray-900">{f.scrtextL || f.fieldtext}</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{f.businessName}</td>
                <td className="px-3 py-1.5 font-mono">{f.datatype}({f.leng}{f.decimals ? `,${f.decimals}` : ''})</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{f.rollname}</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{f.domname}</td>
                <td className="px-3 py-1.5"><span className="flex gap-1">
                  {f.keyflag === 'X' && <KeyRound className="h-3.5 w-3.5 text-amber-600" aria-label="key" />}
                  {f.valexi === 'X' && <ListChecks className="h-3.5 w-3.5 text-emerald-600" aria-label="decodable" />}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageState>
  );
}

function EnrichedPreview({ system, table }: { system: string; table: string }) {
  const schemas = SCHEMAS[system] ?? [];
  const [schema, setSchema] = useState(schemas[0]);
  useEffect(() => { if (!schemas.includes(schema)) setSchema(schemas[0]); }, [system]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading, error } = useQuery(() => fetchMetaEnriched(schema, table), [schema, table]);
  const cols: string[] = data?.columns ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <select value={schema} onChange={(e) => setSchema(e.target.value)} className="rounded border border-gray-300 px-2 py-1" aria-label="schema">
          {schemas.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="font-mono text-xs text-gray-500">{data?.view}</span>
        <span className="text-xs text-gray-500">Business-name columns; <span className="font-mono">_DESC</span> columns decode domain values.</span>
      </div>
      <PageState loading={loading} error={error}>
        {!data?.exists ? (
          <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No enriched view for {schema}.{table}{data?.baked === false ? ' in the public snapshot' : ''}.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0"><tr className="bg-sf-dark text-left text-white">
                {cols.map((c) => <th key={c} className={cn('whitespace-nowrap px-3 py-2 font-mono font-medium', c.endsWith('_DESC') && 'bg-emerald-800')}>{c}</th>)}
              </tr></thead>
              <tbody>
                {(data.rows as any[][]).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {r.map((v, k) => <td key={k} className={cn('whitespace-nowrap px-3 py-1.5', cols[k].endsWith('_DESC') && 'bg-emerald-50 text-emerald-900')}>{v === null ? '' : String(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageState>
    </div>
  );
}

function Assistant({ system, table }: { system: string; table: string }) {
  const [object, setObject] = useState('PO_LINE');
  const { data, loading, error } = useQuery(() => fetchMetaSuggest(system, table, object), [system, table, object]);
  const sugg: any[] = data?.suggestions ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Propose canonical</span>
        <select value={object} onChange={(e) => setObject(e.target.value)} className="rounded border border-gray-300 px-2 py-1" aria-label="canonical object">
          {Object.entries(OBJECT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-gray-600">columns from <span className="font-mono font-semibold">{table}</span> <SourceBadge source={system === 'BDC' ? 'CSN' : system} /></span>
        {data?.agreement !== null && data?.agreement !== undefined && (
          <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Agrees with adapter spec on {data.agreed} of {data.specCount} spec'd columns ({Math.round(data.agreement * 100)}%)
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">Matches canonical column names to SAP field names, business names and labels, strongest evidence first:
        exact (1.0), normalized (0.9), affix (0.75), business name (0.6), label tokens (0.45). A field is used once; contested candidates are flagged.</p>
      <PageState loading={loading} error={error}>
        {data?.ready === false ? <p className="text-sm text-amber-800">{data.message}</p> : (
          <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0"><tr className="bg-sf-dark text-left text-white">
                {['Canonical column', 'Suggested field', 'SAP label', 'Method', 'Confidence', 'Adapter spec', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {sugg.map((s) => (
                  <tr key={s.column} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono font-semibold">{s.column}</td>
                    <td className="px-3 py-1.5 font-mono">{s.field ?? (s.ambiguous ? <span className="text-amber-700">ambiguous: {s.candidates.join(', ')}</span> : <span className="text-gray-300">—</span>)}</td>
                    <td className="px-3 py-1.5 font-semibold">{s.label}</td>
                    <td className="px-3 py-1.5 text-gray-600">{s.method}</td>
                    <td className="px-3 py-1.5">{s.field && (
                      <div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded bg-gray-100"><div className="h-1.5 rounded bg-sf-primary" style={{ width: `${s.confidence * 100}%` }} /></div>{s.confidence.toFixed(2)}</div>)}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-600">{s.specFields.join(', ')}</td>
                    <td className="px-3 py-1.5">{s.matchesSpec && <Check className="h-4 w-4 text-emerald-600" aria-label="matches spec" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageState>
    </div>
  );
}

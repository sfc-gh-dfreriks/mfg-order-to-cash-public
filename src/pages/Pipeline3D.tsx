import { Suspense, lazy, useMemo, useState } from 'react';
import { Factory, Waves, Orbit, Play, Pause, Loader2, X } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchSources, fetchLineage, fetchPage } from '@/lib/api';
import { buildFlowModel, COLOR } from '@/lib/flow3d';
import { cn, formatDollar, formatNumber } from '@/lib/utils';
import PageState from '@/components/PageState';

// Three interactive 3D takes on the same pipeline (SAP and non-SAP sources → canonical silver →
// gold marts → Snowflake), all driven by the live source selection. Views are lazy-loaded so the
// three.js bundle only downloads when this page is opened.
const FactoryView = lazy(() => import('@/components/flow3d/FactoryView'));
const SankeyView = lazy(() => import('@/components/flow3d/SankeyView'));
const ConstellationView = lazy(() => import('@/components/flow3d/ConstellationView'));

type View = 'factory' | 'sankey' | 'constellation';
const VIEWS: { id: View; label: string; icon: React.ElementType; blurb: string }[] = [
  { id: 'factory', label: 'Data Factory', icon: Factory,
    blurb: 'Each source is a machine. Conveyors carry data packets into the canonical silver tanks, on to the gold marts and into Snowflake. More packets means more rows.' },
  { id: 'sankey', label: '3D Sankey', icon: Waves,
    blurb: 'Ribbon thickness is row volume. Each stage sits on its own depth plane; orbit around to see how every source fans into the canonical objects and marts.' },
  { id: 'constellation', label: 'Lineage Constellation', icon: Orbit,
    blurb: 'The real dbt graph: 110 native tables, the staging adapters, silver and gold, laid out left to right. Unselected adapters are dimmed. Click a node to fly to it.' },
];

export default function Pipeline3D() {
  const { dataVersion } = useFilters();
  const [view, setView] = useState<View>('factory');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [lineageNode, setLineageNode] = useState<any>(null);
  const { data, loading, error } = useQuery(async () => {
    const [sources, lineage, overview] = await Promise.all([fetchSources(), fetchLineage(), fetchPage('overview', [], [])]);
    return { sources, lineage, overview };
  }, [dataVersion]);
  const model = useMemo(() => (data ? buildFlowModel(data.sources, data.lineage, data.overview) : null), [data]);
  const sel = model?.nodes.find((n) => n.id === selected) ?? null;
  const current = VIEWS.find((v) => v.id === view)!;
  const totals = useMemo(() => {
    if (!model) return null;
    const src = model.nodes.filter((n) => n.stage === 'source');
    return { sources: src.filter((n) => n.active).length, off: src.filter((n) => !n.active).length,
      rows: src.reduce((a, n) => a + n.value, 0), objects: model.nodes.filter((n) => n.stage === 'object').length,
      marts: model.nodes.filter((n) => n.stage === 'mart').length };
  }, [model]);

  return (
    <PageState loading={loading && !data} error={error}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button key={v.id} onClick={() => { setView(v.id); setSelected(null); setLineageNode(null); }}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                  view === v.id ? 'border-sf-primary bg-sky-50 text-sf-primary' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                <Icon className="h-4 w-4" />{v.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
            <button onClick={() => setPlaying(!playing)} className="flex items-center gap-1 text-sf-deeper" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Play'}
            </button>
            <label className="flex items-center gap-2 text-xs text-gray-500">Speed
              <input type="range" min={0.25} max={3} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-24 accent-sky-500" />
            </label>
          </div>
        </div>
        <p className="text-sm text-gray-600">{current.blurb} Drag to orbit, scroll to zoom, hover to isolate a path.</p>

        <div className="relative h-[620px] overflow-hidden rounded-xl border border-gray-200 bg-slate-50 shadow-sm">
          <Suspense fallback={<div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading 3D view…</div>}>
            {model && view === 'factory' && <FactoryView model={model} playing={playing} speed={speed} selected={selected} onSelect={setSelected} />}
            {model && view === 'sankey' && <SankeyView model={model} playing={playing} speed={speed} selected={selected} onSelect={setSelected} />}
            {model && view === 'constellation' && <ConstellationView lineage={model.lineage} playing={playing} speed={speed} onSelect={setLineageNode} />}
          </Suspense>

          {totals && (
            <div className={cn('pointer-events-none absolute bottom-3 left-3 rounded-lg px-3 py-2 text-xs shadow',
              view === 'factory' ? 'bg-white/90 text-slate-700' : 'bg-slate-900/70 text-slate-100')}>
              <div className="font-semibold">{totals.sources} sources on{totals.off ? ` · ${totals.off} off` : ''}</div>
              <div>{formatNumber(totals.rows)} rows → {totals.objects} canonical objects → {totals.marts} gold marts</div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {[['SAP', COLOR.sap], ['Non-SAP', COLOR.nonSap], ['Silver', COLOR.object], ['Gold', COLOR.mart], ['Off', COLOR.inactive]].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
          )}

          {(sel || lineageNode) && (
            <div className="absolute right-3 top-3 w-72 rounded-lg border border-gray-200 bg-white/95 p-3 text-xs shadow-lg">
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-sf-deeper">{sel ? sel.label : lineageNode.name}</div>
                  <div className="text-gray-500">{sel ? sel.sub : `${lineageNode.layer}${lineageNode.materialized ? ` · ${lineageNode.materialized}` : ''}`}</div>
                </div>
                <button onClick={() => { setSelected(null); setLineageNode(null); }} aria-label="Close"><X className="h-4 w-4 text-gray-400" /></button>
              </div>
              <table className="w-full">
                <tbody>
                  {Object.entries(sel ? sel.detail : { Group: lineageNode.group, 'In selection': lineageNode.active ? 'Yes' : 'No', Description: lineageNode.description || '—' })
                    .filter(([, v]) => v !== '' && v !== undefined)
                    .map(([k, v]) => (
                      <tr key={k} className="border-t align-top">
                        <td className="py-1 pr-2 text-gray-500">{k}</td>
                        <td className="py-1 text-gray-800">{typeof v === 'number' ? (k.includes('USD') ? formatDollar(v) : formatNumber(v)) : String(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {sel && !sel.active && <p className="mt-2 text-amber-700">Switched off on Data Sources, so it contributes no rows.</p>}
            </div>
          )}
        </div>
      </div>
    </PageState>
  );
}

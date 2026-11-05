import { useEffect, useState } from 'react';
import { PlugZap, CircleDot, CircleSlash, ShieldCheck, ShieldAlert, Loader2, Play, Save, CheckCircle2, XCircle } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { fetchMetaConnection, saveMetaConnection, startCollect, fetchCollectJob, STATIC, NATIVE } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import ChartCard from '@/components/ChartCard';

// How metadata is collected for each SAP slot (CONFIG.SAP_CONNECTION) and a Collect action
// (framework/engine/tools/collect_metadata.ts). Live RFC over SAP JCo stays off until the
// "SAP JCo runtime permitted" box is ticked for that system. Adaptive (AUTO) follows the connection: the server returns
// the plan framework/engine/metadata/plan.ts derives from the slot's system, ingestion tool, JCo confirmation and the
// dictionary tables found next to the landing, shown here step by step.
export const METHOD_LABEL: Record<string, { label: string; sub: string }> = {
  AUTO: { label: 'Adaptive (follows the connection)', sub: 'Chosen from the system type, how it is ingested, the JCo confirmation and the dictionary tables found in Snowflake' },
  JCO_RFC: { label: 'SAP JCo RFC', sub: 'Live ABAP Dictionary over RFC (read-only); needs the JCo runtime' },
  REPLICATED_DD: { label: 'Replicated DD tables', sub: 'DD02L/DD03L/DD04T/DD07T landed in Snowflake by your ELT tool' },
  REFERENCE: { label: 'Reference catalog', sub: 'Public catalog of standard tables (leanx.eu); no SAP connection' },
  CSN: { label: 'CSN (SAP BDC)', sub: 'Data product CSN documents' },
  BW: { label: 'BW InfoObjects', sub: 'InfoObject catalog documents' },
};

interface Draft { method: string; jcoPermitted: boolean; ddDatabase: string; ddSchema: string }

export default function MetadataConnection({ onCollected }: { onCollected?: () => void }) {
  const [version, setVersion] = useState(0);
  const { data } = useQuery(fetchMetaConnection, [version]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [job, setJob] = useState<any>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const readOnly = STATIC || NATIVE || data?.readOnly;

  useEffect(() => {
    if (!data?.slots) return;
    setDrafts(Object.fromEntries(data.slots.map((s: any) => [s.sourceSlot, {
      method: s.metadataMethod ?? 'AUTO', jcoPermitted: !!s.jcoPermitted, ddDatabase: s.ddDatabase ?? '', ddSchema: s.ddSchema ?? '' }])));
    if (data.job?.status === 'running') setJob(data.job);
  }, [data]);

  // Poll a running collection; refresh the panel and the metadata pages when it ends.
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(async () => {
      const j = await fetchCollectJob().catch(() => null);
      if (!j) return;
      setJob(j);
      if (j.status !== 'running') { clearInterval(t); setVersion((v) => v + 1); onCollected?.(); }
    }, 2000);
    return () => clearInterval(t);
  }, [job?.status, onCollected]);

  const runs: Record<string, any> = Object.fromEntries((data?.runs ?? []).map((r: any) => [r.slot, r]));
  const running = job?.status === 'running';

  async function save(slot: string) {
    const d = drafts[slot];
    try {
      await saveMetaConnection({ slot, method: d.method, jcoPermitted: d.jcoPermitted, ddDatabase: d.ddDatabase, ddSchema: d.ddSchema });
      setMsg({ ...msg, [slot]: 'Saved' }); setVersion((v) => v + 1);
    } catch (e) { setMsg({ ...msg, [slot]: (e as Error).message }); }
  }
  async function collect(slot: string) {
    try { await save(slot); await startCollect(slot); setJob({ status: 'running', slot, tables: [], started: Date.now() }); }
    catch (e) { setMsg({ ...msg, [slot]: (e as Error).message }); }
  }

  return (
    <ChartCard title="Metadata connection" subtitle="How SAP metadata is collected for each instance adapts to how it is connected: CSN for SAP BDC, InfoObjects for BW, live RFC when the SAP JCo runtime is permitted, the dictionary tables your ELT tool replicates, or the public reference catalog.">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(data?.slots ?? []).map((s: any) => {
          const d = drafts[s.sourceSlot]; if (!d) return null;
          const run = runs[s.sourceSlot];
          const dictionary = !['BDC', 'BW'].includes(s.systemCode);
          const methods = (data?.methods ?? []).filter((m: string) => dictionary ? !['CSN', 'BW'].includes(m) : ['AUTO', s.systemCode === 'BDC' ? 'CSN' : 'BW'].includes(m));
          return (
            <div key={s.sourceSlot} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-gray-900"><PlugZap className="h-4 w-4 text-sf-primary" />{s.sourceSlot.replace('_', ' ')}</div>
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{s.enabled ? s.systemCode : 'off'}</span>
              </div>
              <label className="block text-xs font-semibold text-gray-700">Method</label>
              <select value={d.method} disabled={readOnly || running} onChange={(e) => setDrafts({ ...drafts, [s.sourceSlot]: { ...d, method: e.target.value } })}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50">
                {methods.map((m: string) => (
                  <option key={m} value={m} disabled={m === 'JCO_RFC' && !d.jcoPermitted}>{METHOD_LABEL[m]?.label ?? m}{m === 'JCO_RFC' && !d.jcoPermitted ? ' (needs JCo confirmation)' : ''}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">{METHOD_LABEL[d.method]?.sub}</p>
              {d.method === 'AUTO' && s.plan?.steps && (
                <div className="mt-2 rounded-md border border-sky-100 bg-sky-50 p-2 text-[11px]" data-testid={`plan-${s.sourceSlot}`}>
                  <div className="font-semibold text-gray-900">{s.plan.summary}</div>
                  <ol className="mt-1 space-y-0.5">
                    {s.plan.steps.map((st: any) => (
                      <li key={st.method} className={cn('flex items-start gap-1.5', st.use ? 'text-gray-800' : 'text-gray-400')}>
                        {st.use ? <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-sf-primary" /> : <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" />}
                        <span><span className="font-semibold">{METHOD_LABEL[st.method]?.label ?? st.method}</span>: {st.reason}</span>
                      </li>
                    ))}
                  </ol>
                  {s.plan.facts?.ingestion?.profile === 'DIRECT' && <p className="mt-1 text-gray-500">Change how this instance is ingested on Data Sources and the plan follows.</p>}
                </div>
              )}
              {s.plan?.error && <p className="mt-1 text-[11px] text-red-600">Plan unavailable: {s.plan.error}</p>}

              {dictionary && (
                <>
                  <label className={cn('mt-3 flex items-start gap-2 rounded-md border p-2 text-xs', d.jcoPermitted ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
                    <input type="checkbox" className="mt-0.5" checked={d.jcoPermitted} disabled={readOnly || running}
                      onChange={(e) => setDrafts({ ...drafts, [s.sourceSlot]: { ...d, jcoPermitted: e.target.checked,
                        method: !e.target.checked && d.method === 'JCO_RFC' ? 'AUTO' : d.method } })} />
                    <span>
                      <span className="flex items-center gap-1 font-semibold text-gray-900">
                        {d.jcoPermitted ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />}
                        SAP JCo runtime permitted for this system
                      </span>
                      I confirm the customer is licensed to run the SAP Java Connector (sapjco3) against this SAP system. Until confirmed, live RFC is not used.
                      {s.jcoPermitted && s.confirmedBy && <span className="mt-0.5 block text-gray-500">Confirmed by {s.confirmedBy} · {new Date(s.confirmedAt).toLocaleString()}</span>}
                    </span>
                  </label>
                  {(d.method === 'AUTO' || d.method === 'REPLICATED_DD') && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div><label className="block text-[11px] font-semibold text-gray-700">Replicated DD database{d.method === 'AUTO' ? ' (override)' : ''}</label>
                        <input value={d.ddDatabase} disabled={readOnly || running} placeholder={d.method === 'AUTO' ? 'auto-discovered' : 'MFG_ADMIN'}
                          onChange={(e) => setDrafts({ ...drafts, [s.sourceSlot]: { ...d, ddDatabase: e.target.value.toUpperCase() } })}
                          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-50" /></div>
                      <div><label className="block text-[11px] font-semibold text-gray-700">Replicated DD schema</label>
                        <input value={d.ddSchema} disabled={readOnly || running} placeholder={d.method === 'AUTO' ? 'auto-discovered' : 'LND_FIVETRAN_SAP_DD'}
                          onChange={(e) => setDrafts({ ...drafts, [s.sourceSlot]: { ...d, ddSchema: e.target.value.toUpperCase() } })}
                          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-50" /></div>
                    </div>
                  )}
                </>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => save(s.sourceSlot)} disabled={readOnly || running}
                  className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Save className="h-3.5 w-3.5" />Save</button>
                <button onClick={() => collect(s.sourceSlot)} disabled={readOnly || running || !s.enabled}
                  className="flex items-center gap-1 rounded-md bg-sf-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-sf-dark disabled:opacity-40">
                  {running && job?.slot === s.sourceSlot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Collect metadata</button>
                {msg[s.sourceSlot] && <span className="text-xs text-gray-600">{msg[s.sourceSlot]}</span>}
              </div>
              {readOnly && <p className="mt-2 text-[11px] text-gray-500">{STATIC ? 'Public demo: a read-only snapshot of the plan. Connections are set and metadata is collected in the full deployment.' : 'Read-only in this installation: connections are set and collected in the full deployment.'}</p>}
              {run && (
                <div className="mt-3 rounded-md bg-gray-50 p-2 text-[11px] text-gray-600">
                  <span className="font-semibold text-gray-800">Last collection</span> {new Date(run.collectedAt).toLocaleString()} ({METHOD_LABEL[run.methodRequested]?.label ?? run.methodRequested}):{' '}
                  {Object.entries(run.byStatus).map(([k, v]) => `${formatNumber(v as number)} ${k}`).join(' · ')}
                  {Object.keys(run.byMethod).length > 0 && <> · from {Object.entries(run.byMethod).map(([k, v]) => `${METHOD_LABEL[k]?.label ?? k} ${v}`).join(', ')}</>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {job && (
        <div className="mt-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">
            {job.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sf-primary" /> : job.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-600" />}
            Collecting {job.slot?.replace('_', ' ')} · {formatNumber(job.tables?.length ?? 0)} tables
            {job.summary && <span className="font-normal text-gray-500">· {job.summary.ok} written, {job.summary.kept} kept (more trusted), {job.summary.missing} not found, {job.summary.failed} failed</span>}
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-1.5 text-left">Table</th><th className="px-3 py-1.5 text-left">Method</th><th className="px-3 py-1.5 text-left">Status</th><th className="px-3 py-1.5 text-right">Fields</th><th className="px-3 py-1.5 text-left">Note</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {(job.tables ?? []).map((t: any) => (
                  <tr key={t.table}><td className="px-3 py-1 font-mono">{t.table}</td><td className="px-3 py-1">{METHOD_LABEL[t.method]?.label ?? t.method}</td>
                    <td className={cn('px-3 py-1', t.status === 'ok' ? 'text-emerald-700' : t.status === 'kept' ? 'text-sky-700' : 'text-amber-700')}>{t.status}</td>
                    <td className="px-3 py-1 text-right">{t.fields}</td><td className="truncate px-3 py-1 text-gray-500" title={t.note}>{t.note}</td></tr>
                ))}
              </tbody>
            </table>
            {job.status === 'error' && <pre className="whitespace-pre-wrap p-3 text-[11px] text-red-700">{(job.log ?? []).join('\n')}</pre>}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

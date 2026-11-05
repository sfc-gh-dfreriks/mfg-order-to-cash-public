import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import EChartsReact from 'echarts-for-react';
import { feature } from 'topojson-client';
import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatNumber, formatPct, cn } from '@/lib/utils';
import MetricCard, { Activity, Calendar, Gauge, TrendingUp } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import PageState from '@/components/PageState';

// Shipments in Motion: the real-time visibility feed (project44 / FourKites style) at the as-of date. Every shipment
// in transit is drawn on its lane from plant to ship-to city with its GPS trail and current position, coloured by the
// predictive ETA against the appointment (the SAP planned delivery date sent at tender).
export const STATUS = {
  EARLY: { label: 'Early', color: '#3B82F6' },
  ON_TIME: { label: 'On time', color: '#10B981' },
  LATE: { label: 'Delayed', color: '#EF4444' },
} as const;
type Status = keyof typeof STATUS;

// Map views: centre [lon, lat] and zoom for the echarts geo component over the world outline.
const REGIONS: Record<string, { center: [number, number]; zoom: number }> = {
  All: { center: [15, 30], zoom: 1.25 },
  Americas: { center: [-96, 33], zoom: 4.2 },
  Europe: { center: [10.5, 51.2], zoom: 13 },
  China: { center: [119, 34.5], zoom: 18 },
};

// World outline (Natural Earth 1:50m via world-atlas), loaded once and only on this page.
let worldReady: Promise<void> | null = null;
function loadWorld() {
  worldReady ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = (m as any).default ?? m;
    echarts.registerMap('world', feature(topo, topo.objects.countries) as any);
  });
  return worldReady;
}

export default function ShipmentsInMotion() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('shipments', apiCompanies, apiCategories), deps);
  const [mapReady, setMapReady] = useState(false);
  const [region, setRegion] = useState('All');
  const [shown, setShown] = useState<Record<Status, boolean>>({ EARLY: true, ON_TIME: true, LATE: true });
  useEffect(() => { loadWorld().then(() => setMapReady(true)); }, []);

  const k = data?.kpis ?? {};
  const all: any[] = data?.shipments ?? [];
  const ships = all.filter((s) => shown[s.status as Status] && (region === 'All' || s.region === region));
  const atRisk = [...all].filter((s) => s.status === 'LATE').sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 25);

  const mapOption = useMemo(() => {
    const view = REGIONS[region];
    const byStatus = (st: Status) => ships.filter((s) => s.status === st);
    const plants = [...new Map(all.map((s) => [s.origin, [s.oLon, s.oLat, s.origin]])).values()];
    return {
      backgroundColor: '#F8FAFC',
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (p: any) => {
          const s = p.data?.ship;
          if (!s) return p.data?.name ? `<b>${p.data.name}</b><br/>Plant` : '';
          return `<b>${s.carrier}</b> · ${s.mode} · ${s.id}<br/>${s.origin} → ${s.dest}<br/>${s.customer ?? ''}<br/>`
            + `Appointment ${s.appointment} · ETA ${s.eta}<br/><b style="color:${STATUS[s.status as Status].color}">${s.statusLabel}</b>`
            + `${s.daysVs ? ` (${s.daysVs > 0 ? '+' : ''}${s.daysVs} d)` : ''}${s.exception ? ` · ${s.exception}` : ''}<br/>`
            + `Value ${formatDollar(s.value)} · delivery ${s.delivery}<br/>Last ping ${s.pingAge ?? 0} h ago`;
        },
      },
      geo: {
        map: 'world', roam: true, center: view.center, zoom: view.zoom, scaleLimit: { min: 1, max: 40 },
        itemStyle: { areaColor: '#E2E8F0', borderColor: '#FFFFFF', borderWidth: 0.6 },
        emphasis: { disabled: true }, label: { show: false }, silent: true,
      },
      series: [
        ...(Object.keys(STATUS) as Status[]).flatMap((st) => [
          { // lane still to go: current position to ship-to
            type: 'lines', coordinateSystem: 'geo', silent: true, zlevel: 1,
            lineStyle: { color: STATUS[st].color, width: 1, opacity: 0.35, type: 'dashed' },
            data: byStatus(st).map((s) => ({ coords: [[s.lon, s.lat], [s.dLon, s.dLat]] })),
          },
          { // GPS trail so far
            type: 'lines', coordinateSystem: 'geo', polyline: true, silent: true, zlevel: 1,
            lineStyle: { color: STATUS[st].color, width: 1.6, opacity: 0.8 },
            data: byStatus(st).filter((s) => s.path?.length > 1).map((s) => ({ coords: s.path })),
          },
          { // current position
            name: STATUS[st].label, type: st === 'LATE' ? 'effectScatter' : 'scatter', coordinateSystem: 'geo', zlevel: 2,
            symbolSize: (v: number[]) => Math.max(5, Math.min(12, Math.sqrt(v[2] ?? 0) / 26)),
            rippleEffect: { scale: 1.8, brushType: 'stroke', period: 5 },
            itemStyle: { color: STATUS[st].color, borderColor: '#fff', borderWidth: 1 },
            data: byStatus(st).map((s) => ({ value: [s.lon, s.lat, s.value], ship: s })),
          },
        ]),
        {
          name: 'Plants', type: 'scatter', coordinateSystem: 'geo', zlevel: 3, symbol: 'rect', symbolSize: 9,
          itemStyle: { color: '#11567F' }, label: { show: region !== 'All', formatter: (p: any) => p.data.name, position: 'right', fontSize: 10, color: '#11567F' },
          data: plants.map(([lon, lat, name]) => ({ value: [lon, lat], name })),
        },
      ],
    };
  }, [ships, all, region]);

  const carriers = data?.byCarrier ?? [];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="In Transit" value={formatNumber(k.inTransit)} icon={Activity} accent="border-sky-300/50 bg-gradient-to-br from-sky-50 to-cyan-50"
            delta={`${formatDollar(k.inTransitValue)} on the road`} deltaType="neutral" />
          <MetricCard title="Delayed" value={formatNumber(k.delayed)} icon={Calendar} accent="border-red-300/50 bg-gradient-to-br from-red-50 to-rose-50"
            delta={`${formatDollar(k.delayedValue)} · ETA after appointment`} deltaType={k.delayed ? 'negative' : 'positive'} />
          <MetricCard title="On Time · Early" value={`${formatNumber(k.onTime)} · ${formatNumber(k.early)}`} icon={Gauge}
            accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta="Early = ETA 2+ days before appointment" deltaType="neutral" />
          <MetricCard title="Arrived On Time (30 d)" value={formatPct(k.deliveredOnTimePct30d)} icon={TrendingUp}
            accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`Avg ping age ${Number(k.avgPingAge ?? 0).toFixed(0)} h`} deltaType="neutral" />
        </div>

        <ChartCard title="Shipments in Motion" subtitle="Every shipment in transit on 2026-09-30: GPS trail, current position and the lane still to go, coloured by predictive ETA against the appointment. Scroll to zoom, drag to pan.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {Object.keys(REGIONS).map((r) => (
              <button key={r} onClick={() => setRegion(r)}
                className={cn('rounded-md border px-3 py-1 text-xs font-semibold', region === r ? 'border-sf-primary bg-sf-primary text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}>{r}</button>
            ))}
            <span className="mx-2 h-5 w-px bg-gray-200" />
            {(Object.keys(STATUS) as Status[]).map((st) => (
              <button key={st} onClick={() => setShown({ ...shown, [st]: !shown[st] })} data-testid={`status-${st}`}
                className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', shown[st] ? 'border-gray-300 text-gray-800' : 'border-gray-200 text-gray-400 line-through')}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[st].color, opacity: shown[st] ? 1 : 0.3 }} />
                {STATUS[st].label} {formatNumber(all.filter((s) => s.status === st).length)}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">{formatNumber(ships.length)} shown · <span className="inline-block h-2 w-2 bg-[#11567F]" /> plant</span>
          </div>
          {mapReady
            ? <EChartsReact echarts={echarts} option={mapOption} notMerge style={{ height: 560 }} data-testid="shipment-map" />
            : <div className="flex h-[560px] items-center justify-center text-sm text-gray-500">Loading map…</div>}
          {!all.length && <p className="mt-2 text-xs text-amber-700">No shipments: the real-time visibility source is switched off on Data Sources, or nothing is in transit for this filter.</p>}
        </ChartCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="In Transit by Carrier" subtitle="Shipments on the road, by predictive ETA status">
            <ReactECharts option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { bottom: 0 },
              grid: { left: 110, right: 20, top: 10, bottom: 40 },
              xAxis: { type: 'value' }, yAxis: { type: 'category', inverse: true, data: carriers.map((c: any) => c.name) },
              series: (Object.keys(STATUS) as Status[]).map((st) => ({
                name: STATUS[st].label, type: 'bar', stack: 's', itemStyle: { color: STATUS[st].color },
                data: carriers.map((c: any) => c[{ EARLY: 'early', ON_TIME: 'onTime', LATE: 'delayed' }[st]]),
              })),
            }} keepOrder style={{ height: 300 }} />
          </ChartCard>
          <ChartCard title="Arrivals vs Appointment, Last 60 Days" subtitle="Delivered shipments per day by how they arrived">
            <ReactECharts option={{
              tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 40, right: 20, top: 10, bottom: 40 },
              xAxis: { type: 'category', data: (data?.trend ?? []).map((t: any) => t.day.slice(5)) }, yAxis: { type: 'value' },
              series: (Object.keys(STATUS) as Status[]).map((st) => ({
                name: STATUS[st].label, type: 'bar', stack: 't', itemStyle: { color: STATUS[st].color },
                data: (data?.trend ?? []).map((t: any) => t[{ EARLY: 'early', ON_TIME: 'onTime', LATE: 'delayed' }[st]]),
              })),
            }} keepOrder style={{ height: 300 }} />
          </ChartCard>
        </div>

        <ChartCard title="Delayed Shipments at Risk" subtitle="In transit with an ETA after the appointment, highest value first: candidates to call the customer before the miss">
          <DataTable data={atRisk} columns={[
            { key: 'id', label: 'Shipment' }, { key: 'carrier', label: 'Carrier' }, { key: 'origin', label: 'From' }, { key: 'dest', label: 'To' },
            { key: 'customer', label: 'Customer' }, { key: 'appointment', label: 'Appointment' }, { key: 'eta', label: 'Predicted ETA' },
            { key: 'daysVs', label: 'Days late', format: (v: number) => (v > 0 ? `+${v}` : String(v ?? '')) },
            { key: 'exception', label: 'Exception', format: (v: string) => v ?? '' }, { key: 'value', label: 'Value', format: formatDollar },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import EChartsReact from 'echarts-for-react';
import { feature } from 'topojson-client';
import { Plane, TrainFront, Truck, Ship, Anchor, X, MapPin, Clock, Gauge as GaugeIcon, Package, CircleCheck, CircleDot, Circle } from 'lucide-react';
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
// in transit is drawn on its actual route: flights as curved arcs between airports, rail along the freight mainlines,
// trucks along the interstates, federal highways, Autobahns and expressways. The travelled part is coloured by the
// predictive ETA against the appointment (the SAP planned delivery date sent at tender); the part still to go is
// drawn in the mode's own style.
export const STATUS = {
  EARLY: { label: 'Early', color: '#3B82F6' },
  ON_TIME: { label: 'On time', color: '#10B981' },
  LATE: { label: 'Delayed', color: '#EF4444' },
} as const;
type Status = keyof typeof STATUS;

// Transport modes. `symbol` is a north-pointing silhouette (ECharts path, rotated to the vehicle's heading on the map).
export const MODES = {
  SEA: {
    label: 'Sea', icon: Ship, color: '#0E4C92', noun: 'Vessel',
    line: { width: 2, type: [6, 4] as number[], opacity: 0.7 },
    symbol: 'path://M12 1l3 4v6l5 2-3 9H7l-3-9 5-2V5l3-4zm-1.5 5v4h3V6h-3z',
    size: 15,
  },
  AIR: {
    label: 'Air', icon: Plane, color: '#7C3AED', noun: 'Flight',
    line: { width: 1.6, type: [2, 3] as number[], opacity: 0.7 },
    symbol: 'path://M12 2c.8 0 1.4.7 1.4 1.5V9l7.6 4.6v2l-7.6-2.3v4.8l2.1 1.6V21L12 20l-3.5 1v-1.3l2.1-1.6v-4.8L3 15.6v-2L10.6 9V3.5C10.6 2.7 11.2 2 12 2z',
    size: 16,
  },
  RAIL: {
    label: 'Rail', icon: TrainFront, color: '#B45309', noun: 'Train',
    line: { width: 2.4, type: [7, 3] as number[], opacity: 0.75 },
    symbol: 'path://M7 2h10a3 3 0 0 1 3 3v11a3 3 0 0 1-2 2.8l1.5 2.2h-2.3L16 19H8l-1.2 2H4.5L6 18.8A3 3 0 0 1 4 16V5a3 3 0 0 1 3-3zm-1 4v5h12V6H6zm1.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    size: 11,
  },
  ROAD: {
    label: 'Road', icon: Truck, color: '#334155', noun: 'Truck',
    line: { width: 1.4, type: 'solid' as const, opacity: 0.45 },
    symbol: 'path://M8 1h8a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm-.5 16h9A1.5 1.5 0 0 1 18 18.5V22a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3.5A1.5 1.5 0 0 1 7.5 17zM9 19v2h6v-2H9z',
    size: 9,
  },
} as const;
type Mode = keyof typeof MODES;

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

type Pt = [number, number];
const sq = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Splits the planned route at the vehicle's position: [route still to go, heading in degrees (0 = north)]. */
function split(route: Pt[], pos: Pt): [Pt[], number] {
  if (!route?.length) return [[], 0];
  let best = 0;
  route.forEach((p, i) => { if (sq(p, pos) < sq(route[best], pos)) best = i; });
  // the next waypoint ahead of the vehicle
  const nxt = Math.min(route.length - 1, sq(route[best], pos) < 1e-6 || best === 0 ? best + 1 : best);
  const ahead = route.slice(nxt);
  const to = ahead[0] ?? route[route.length - 1];
  const dLon = (to[0] - pos[0]) * Math.cos((pos[1] * Math.PI) / 180);
  const heading = (Math.atan2(dLon, to[1] - pos[1]) * 180) / Math.PI;
  return [[pos, ...ahead], heading];
}

export default function ShipmentsInMotion() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('shipments', apiCompanies, apiCategories), deps);
  const [mapReady, setMapReady] = useState(false);
  const [region, setRegion] = useState('All');
  const [shown, setShown] = useState<Record<Status, boolean>>({ EARLY: true, ON_TIME: true, LATE: true });
  const [modes, setModes] = useState<Record<Mode, boolean>>({ SEA: true, AIR: true, RAIL: true, ROAD: true });
  const [types, setTypes] = useState<Record<string, boolean>>({ SALES: true, INTERCOMPANY: true });
  const [selected, setSelected] = useState<any | null>(null);
  useEffect(() => { loadWorld().then(() => setMapReady(true)); }, []);

  const k = data?.kpis ?? {};
  const all: any[] = (data?.shipments ?? []).map((s: any) => ({ ...s, transport: (s.transport ?? 'ROAD') as Mode }));
  const ships = all.filter((s) => shown[s.status as Status] && modes[s.transport as Mode] && types[s.shipmentType ?? 'SALES']
    && (region === 'All' || s.region === region));
  const ic = data?.intercompany ?? {};
  const atRisk = [...all].filter((s) => s.status === 'LATE' && s.shipmentType !== 'INTERCOMPANY').sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 25);
  const sel = selected && ships.find((s) => s.id === selected.id);

  const mapOption = useMemo(() => {
    const view = REGIONS[region];
    const plants = [...new Map(all.map((s) => [s.origin, [s.oLon, s.oLat, s.origin]])).values()];
    const geo = ships.map((s) => {
      const pos: Pt = [s.lon, s.lat];
      const legs: any[] = s.legs ?? [];
      if (!legs.length) {
        const [ahead, heading] = split(s.route as Pt[], pos);
        return { s, pos, heading, mode: s.transport as Mode, segs: [{ mode: s.transport as Mode, coords: ahead }] };
      }
      // multimodal: the leg in progress at the last ping, the rest of it, and every later leg in its own mode
      const t = s.lastPing ? new Date(s.lastPing.replace(' ', 'T')).getTime() : 0;
      let k = legs.findIndex((lg) => t <= new Date(lg.end).getTime());
      if (k < 0) k = legs.length - 1;
      const [ahead, heading] = split(legs[k].points as Pt[], pos);
      const segs = [{ mode: legs[k].mode as Mode, coords: ahead }, ...legs.slice(k + 1).map((lg) => ({ mode: lg.mode as Mode, coords: lg.points }))];
      return { s, pos, heading, mode: legs[k].mode as Mode, segs };
    });
    const ports = new Map<string, Pt>();
    ships.forEach((s) => (s.legs ?? []).filter((lg: any) => lg.mode === 'SEA').forEach((lg: any) => {
      ports.set(lg.frm, lg.points[0]); ports.set(lg.to, lg.points[lg.points.length - 1]);
    }));
    const isSel = (s: any) => sel?.id === s.id;
    return {
      backgroundColor: '#F8FAFC',
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (p: any) => {
          const s = p.data?.ship;
          if (!s) return p.data?.name ? `<b>${p.data.name}</b><br/>${p.seriesName === 'Ports' ? 'Seaport' : 'Plant'}` : '';
          const m = MODES[s.transport as Mode];
          return `<b>${m.noun} ${s.vehicle ?? ''}</b> · ${s.operator ?? s.carrier}<br/>${s.origin} → ${s.dest}<br/>`
            + `<b style="color:${STATUS[s.status as Status].color}">${s.statusLabel}</b> · ETA ${s.eta}<br/><i>Click for details</i>`;
        },
      },
      geo: {
        map: 'world', roam: true, center: view.center, zoom: view.zoom, scaleLimit: { min: 1, max: 40 },
        itemStyle: { areaColor: '#E2E8F0', borderColor: '#FFFFFF', borderWidth: 0.6 },
        emphasis: { disabled: true }, label: { show: false }, silent: true,
      },
      series: [
        // route still to go, in each mode's own style: dotted flight arcs, dashed rail lines, solid highways
        ...(Object.keys(MODES) as Mode[]).map((m) => ({
          name: `${MODES[m].label} route`, type: 'lines', coordinateSystem: 'geo', polyline: true, silent: true, zlevel: 1,
          lineStyle: { color: MODES[m].color, ...MODES[m].line },
          data: geo.flatMap((g) => g.segs.filter((sg) => sg.mode === m && sg.coords.length > 1)
            .map((sg) => ({ coords: sg.coords, lineStyle: isSel(g.s) ? { width: MODES[m].line.width + 2, opacity: 1 } : undefined }))),
        })),
        // travelled so far (GPS trail), coloured by predictive ETA status
        ...(Object.keys(STATUS) as Status[]).map((st) => ({
          type: 'lines', coordinateSystem: 'geo', polyline: true, silent: true, zlevel: 1,
          lineStyle: { color: STATUS[st].color, width: 2, opacity: 0.85 },
          data: geo.filter((g) => g.s.status === st && g.s.path?.length > 1)
            .map((g) => ({ coords: g.s.path, lineStyle: isSel(g.s) ? { width: 4, opacity: 1 } : undefined })),
        })),
        // animated flow along flight arcs, so air freight reads as moving
        {
          type: 'lines', coordinateSystem: 'geo', polyline: true, silent: true, zlevel: 2,
          effect: { show: true, period: 6, trailLength: 0.25, symbol: 'circle', symbolSize: 3, color: MODES.AIR.color },
          lineStyle: { width: 0, opacity: 0 },
          data: geo.flatMap((g) => g.segs.filter((sg) => sg.mode === 'AIR' && sg.coords.length > 1).map((sg) => ({ coords: sg.coords }))),
        },
        // vehicles: plane, train or truck at the last ping, pointing where it is heading, coloured by status
        ...(Object.keys(MODES) as Mode[]).map((m) => ({
          name: MODES[m].label, type: 'scatter', coordinateSystem: 'geo', zlevel: 3, symbol: MODES[m].symbol, cursor: 'pointer',
          data: geo.filter((g) => g.mode === m).map((g) => ({
            value: [g.pos[0], g.pos[1], g.s.value], ship: g.s,
            symbolRotate: -g.heading,
            symbolSize: isSel(g.s) ? MODES[m].size + 8 : MODES[m].size,
            itemStyle: {
              color: STATUS[g.s.status as Status].color, borderColor: isSel(g.s) ? '#0F172A' : '#FFFFFF', borderWidth: isSel(g.s) ? 2 : 1,
              shadowBlur: g.s.status === 'LATE' ? 4 : 0, shadowColor: STATUS.LATE.color,
            },
          })),
        })),
        {
          name: 'Ports', type: 'scatter', coordinateSystem: 'geo', zlevel: 4, symbol: 'circle', symbolSize: 7,
          itemStyle: { color: '#FFFFFF', borderColor: MODES.SEA.color, borderWidth: 2 },
          label: { show: true, formatter: (p: any) => p.data.name, fontSize: 9, color: MODES.SEA.color },
          // Hamburg and Bremerhaven sit 100 km apart: label one above and one below
          data: [...ports].map(([name, p]) => ({ value: p, name: name.replace(' (Shanghai)', ''),
            label: { position: name === 'Bremerhaven' ? 'top' : name === 'Hamburg' ? 'right' : 'bottom' } })),
        },
        {
          name: 'Plants', type: 'scatter', coordinateSystem: 'geo', zlevel: 4, symbol: 'rect', symbolSize: 9,
          itemStyle: { color: '#11567F' }, label: { show: region !== 'All', formatter: (p: any) => p.data.name, position: 'right', fontSize: 10, color: '#11567F' },
          data: plants.map(([lon, lat, name]) => ({ value: [lon, lat], name })),
        },
      ],
    };
  }, [ships, all, region, sel]);

  const onEvents = useMemo(() => ({
    click: (p: any) => { if (p.data?.ship) setSelected(p.data.ship); },
  }), []);

  const carriers = data?.byCarrier ?? [];
  const countBy = (m: Mode) => all.filter((s) => s.transport === m).length;
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard title="Customer Shipments in Transit" value={formatNumber(k.inTransit)} icon={Activity} accent="border-sky-300/50 bg-gradient-to-br from-sky-50 to-cyan-50"
            delta={`${formatDollar(k.inTransitValue)} on the move`} deltaType="neutral" />
          <MetricCard title="Delayed" value={formatNumber(k.delayed)} icon={Calendar} accent="border-red-300/50 bg-gradient-to-br from-red-50 to-rose-50"
            delta={`${formatDollar(k.delayedValue)} · ETA after appointment`} deltaType={k.delayed ? 'negative' : 'positive'} />
          <MetricCard title="On Time · Early" value={`${formatNumber(k.onTime)} · ${formatNumber(k.early)}`} icon={Gauge}
            accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta="Early = ETA 2+ days before appointment" deltaType="neutral" />
          <MetricCard title="Arrived On Time (30 d)" value={formatPct(k.deliveredOnTimePct30d)} icon={TrendingUp}
            accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`Avg ping age ${Number(k.avgPingAge ?? 0).toFixed(0)} h`} deltaType="neutral" />
          <MetricCard title="Intercompany in Transit" value={formatNumber(ic.inTransit)} icon={Activity}
            accent="border-blue-300/50 bg-gradient-to-br from-blue-50 to-slate-50"
            delta={`${formatNumber(ic.atSea)} at sea · ${formatDollar(ic.inTransitValue)} · ${formatNumber(ic.delayed)} late`} deltaType="neutral" />
        </div>

        <ChartCard title="Shipments in Motion" subtitle="Every shipment in transit on 2026-09-30 on its real route: container ships on the ocean lanes via Suez and across the Atlantic, flights between airports, trains on the freight mainlines, trucks on the highways. Intercompany moves show each leg in its own mode. Travelled part coloured by predictive ETA. Click a vehicle for details.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {Object.keys(REGIONS).map((r) => (
              <button key={r} onClick={() => setRegion(r)}
                className={cn('rounded-md border px-3 py-1 text-xs font-semibold', region === r ? 'border-sf-primary bg-sf-primary text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}>{r}</button>
            ))}
            <span className="mx-2 h-5 w-px bg-gray-200" />
            {[['SALES', 'Customer'], ['INTERCOMPANY', 'Intercompany']].map(([t, label]) => (
              <button key={t} onClick={() => setTypes({ ...types, [t]: !types[t] })} data-testid={`type-${t}`}
                className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold', types[t] ? 'border-gray-300 text-gray-800' : 'border-gray-200 text-gray-400 line-through')}>
                {label} {formatNumber(all.filter((s) => (s.shipmentType ?? 'SALES') === t).length)}
              </button>
            ))}
            <span className="mx-2 h-5 w-px bg-gray-200" />
            {(Object.keys(MODES) as Mode[]).map((m) => {
              const Icon = MODES[m].icon;
              return (
                <button key={m} onClick={() => setModes({ ...modes, [m]: !modes[m] })} data-testid={`mode-${m}`}
                  className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold',
                    modes[m] ? 'border-gray-300 text-gray-800' : 'border-gray-200 text-gray-400 line-through')}>
                  <Icon className="h-3.5 w-3.5" style={{ color: modes[m] ? MODES[m].color : undefined }} />
                  {MODES[m].label} {formatNumber(countBy(m))}
                </button>
              );
            })}
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
          <div className="relative">
            {mapReady
              ? <EChartsReact echarts={echarts} option={mapOption} notMerge onEvents={onEvents} style={{ height: 600 }} data-testid="shipment-map" />
              : <div className="flex h-[600px] items-center justify-center text-sm text-gray-500">Loading map…</div>}
            <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-md bg-white/90 px-3 py-1.5 text-[11px] text-gray-600 shadow-sm">
              {(Object.keys(MODES) as Mode[]).map((m) => (
                <span key={m} className="flex items-center gap-1.5">
                  <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={MODES[m].color} strokeWidth={MODES[m].line.width + 0.6}
                    strokeDasharray={Array.isArray(MODES[m].line.type) ? (MODES[m].line.type as number[]).join(' ') : undefined} /></svg>
                  {{ SEA: 'Ocean lane', AIR: 'Flight arc', RAIL: 'Rail line', ROAD: 'Highway' }[m]}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-white/80 px-2 py-0.5 text-[10px] text-gray-500">
              Road geometry © OpenStreetMap contributors
            </div>
            {sel && <ShipmentCard s={sel} onClose={() => setSelected(null)} />}
          </div>
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
            { key: 'id', label: 'Shipment' }, { key: 'transport', label: 'Mode', format: (v: Mode) => MODES[v]?.label ?? v },
            { key: 'carrier', label: 'Carrier' }, { key: 'origin', label: 'From' }, { key: 'dest', label: 'To' },
            { key: 'customer', label: 'Customer' }, { key: 'appointment', label: 'Appointment' }, { key: 'eta', label: 'Predicted ETA' },
            { key: 'daysVs', label: 'Days late', format: (v: number) => (v > 0 ? `+${v}` : String(v ?? '')) },
            { key: 'exception', label: 'Exception', format: (v: string) => v ?? '' }, { key: 'value', label: 'Value', format: formatDollar },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

/** Detail card for the selected shipment: mode icon, vehicle and route, progress, timing, SAP context. */
function ShipmentCard({ s, onClose }: { s: any; onClose: () => void }) {
  const m = MODES[s.transport as Mode] ?? MODES.ROAD;
  const st = STATUS[s.status as Status];
  const Icon = m.icon;
  const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between gap-3 py-0.5"><span className="text-gray-500">{label}</span><span className="text-right font-medium text-gray-800">{value ?? '—'}</span></div>
  );
  return (
    <div className="absolute right-3 top-3 max-h-[580px] w-[350px] overflow-y-auto rounded-xl border border-gray-200 bg-white text-xs shadow-xl" data-testid="shipment-card">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: m.color }}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20"><Icon className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide opacity-80">{s.shipmentType === 'INTERCOMPANY' ? 'Intercompany' : 'Customer'} · {m.label} freight · {s.mode}</div>
          <div className="truncate text-sm font-bold">{m.noun} {s.vehicle}</div>
          <div className="truncate opacity-90">{s.operator ?? s.carrier}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-white/20" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div><div className="font-semibold text-gray-900">{s.origin} → {s.dest}</div>
            <div className="text-gray-500">{s.routeName} · {formatNumber(s.routeKm)} km</div></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between"><span className="text-gray-500">Progress</span><span className="font-semibold">{Math.round(s.progress ?? 0)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${s.progress ?? 0}%`, background: st.color }} /></div>
        </div>
        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: `${st.color}14` }}>
          <span className="font-bold" style={{ color: st.color }}>{s.statusLabel}{s.daysVs ? ` (${s.daysVs > 0 ? '+' : ''}${s.daysVs} d)` : ''}</span>
          {s.exception && <span className="font-medium text-red-600">{s.exception}</span>}
        </div>
        {(s.legs ?? []).length > 0 && <LegTimeline legs={s.legs} lastPing={s.lastPing} />}
        <div className="grid grid-cols-1 divide-y divide-gray-100">
          <div className="pb-2">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700"><Clock className="h-3.5 w-3.5" /> Timing</div>
            <Row label="Picked up" value={s.pickup} /><Row label="Predicted ETA" value={s.eta} /><Row label="Appointment" value={s.appointment} />
            <Row label="Last ping" value={`${s.lastPing ?? ''} (${s.pingAge ?? 0} h ago)`} />
            <Row label="Speed" value={s.speed ? <span className="inline-flex items-center gap-1"><GaugeIcon className="h-3 w-3" />{formatNumber(s.speed)} km/h</span> : 'Stopped'} />
          </div>
          <div className="pt-2">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700"><Package className="h-3.5 w-3.5" /> Shipment</div>
            <Row label="Shipment" value={s.id} /><Row label={s.shipmentType === 'INTERCOMPANY' ? 'Container / AWB' : 'Tracking #'} value={s.tracking} />
            <Row label={s.shipmentType === 'INTERCOMPANY' ? 'Forwarder' : 'Carrier'} value={s.carrier} />
            {s.shipmentType === 'INTERCOMPANY'
              ? <><Row label="Receiving plant" value={s.dest} /><Row label="Stock transport order" value={s.orderId} /><Row label="NL delivery" value={s.delivery} /></>
              : <><Row label="Customer" value={s.customer} /><Row label="Sales order" value={s.orderId} /><Row label="Delivery" value={s.delivery} /></>}
            <Row label="Plant" value={s.plant} /><Row label="Product family" value={s.family} />
            <Row label="Quantity" value={formatNumber(s.qty)} /><Row label="Value" value={formatDollar(s.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Legs of a multimodal move: done, in progress or to come, with vessel / flight / customs details. */
function LegTimeline({ legs, lastPing }: { legs: any[]; lastPing?: string }) {
  const now = lastPing ? new Date(lastPing.replace(' ', 'T')).getTime() : 0;
  const fmt = (x: string) => x?.slice(0, 16).replace('T', ' ');
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700"><Anchor className="h-3.5 w-3.5" /> Legs</div>
      <ol className="space-y-2">
        {legs.map((lg, i) => {
          const m = MODES[lg.mode as Mode] ?? MODES.ROAD;
          const Icon = m.icon;
          const done = now > new Date(lg.end).getTime();
          const active = !done && now >= new Date(lg.start).getTime();
          const State = done ? CircleCheck : active ? CircleDot : Circle;
          return (
            <li key={i} className={cn('flex gap-2 rounded-md p-1.5', active && 'bg-blue-50')}>
              <State className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', done ? 'text-emerald-600' : active ? 'text-blue-600' : 'text-gray-300')} />
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: m.color }} />
              <div className="min-w-0">
                <div className="font-medium text-gray-900">{lg.frm.replace(' (Shanghai)', '')} → {lg.to.replace(' (Shanghai)', '')}</div>
                <div className="text-gray-500">{lg.name} · {formatNumber(lg.km)} km{lg.operator ? ` · ${lg.operator}` : ''}</div>
                {lg.vessel && <div className="text-gray-500">{lg.vessel} · voy. {lg.voyage} · {lg.pol} → {lg.pod} · B/L {lg.billOfLading}</div>}
                {lg.flight && <div className="text-gray-500">Flight {lg.flight} · AWB {lg.awb}</div>}
                {lg.border && <div className="text-amber-700">Cleared customs at {lg.border}</div>}
                <div className="text-[10px] text-gray-400">{fmt(lg.start)} → {fmt(lg.end)}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { Gauge, Calendar, Activity, TrendingUp } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

const pctFmt = (v: number) => `${Number(v).toFixed(1)}%`;

export default function Fulfillment() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('fulfillment', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const trend = data?.trend ?? [];
  // lowest OTIF first: these are the problem plants and families
  const worst = (rows: any[]) => [...(rows ?? [])].map((r) => ({ ...r, gap: 100 - (r.otifPct ?? 0) }));
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="OTIF" value={formatPct(k.otifPct)} icon={Gauge} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`On time ${formatPct(k.onTimePct)} · In full ${formatPct(k.inFullPct)}`} deltaType={k.otifPct >= 85 ? 'positive' : 'negative'} />
          <MetricCard title="Perfect Order" value={formatPct(k.perfectPct)} icon={TrendingUp} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="OTIF, no dispute, no credit memo" deltaType="neutral" />
          <MetricCard title="Confirmed as Requested" value={formatPct(k.confirmedPct)} icon={Activity} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta="Availability check met the request date" deltaType="neutral" />
          <MetricCard title="Order to Ship" value={`${Number(k.orderToShip ?? 0).toFixed(1)} d`} icon={Calendar} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta="Order date to first goods issue" deltaType="neutral" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Why Lines Miss OTIF" subtitle="First cause that applies, eligible lines that missed">
            <Bars rows={data?.missCauses ?? []} label="name" value="lines" color="#f87171" height={260} format={formatNumber} leftPad={210} />
          </ChartCard>
          <ChartCard title="OTIF Gap by Plant" subtitle="Percentage points below 100% OTIF, worst first">
            <Bars rows={worst(data?.byPlant)} label="name" value="gap" color="#f59e0b" height={260} format={pctFmt} />
          </ChartCard>
          <ChartCard title="OTIF Gap by Product Family" subtitle="Percentage points below 100%, worst first">
            <Bars rows={worst(data?.byFamily)} label="name" value="gap" color="#8b5cf6" height={260} format={pctFmt} />
          </ChartCard>
          <ChartCard title="Where the Delivered Date Comes From" subtitle="Carrier events give the true date; without them OTIF relies on SAP proof of delivery">
            <Bars rows={data?.deliverySource ?? []} label="name" value="lines" color="#29b5e8" height={260} format={formatNumber} leftPad={210} />
          </ChartCard>
          <ChartCard title="OTIF and Perfect Order by Requested Month" className="lg:col-span-2">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 50, right: 20, bottom: 30, top: 40 },
              xAxis: { type: 'category', data: trend.map((d: any) => d.month) }, yAxis: { type: 'value', min: 0, max: 100, name: '%' },
              series: [
                { name: 'OTIF', type: 'line', smooth: true, data: trend.map((d: any) => d.otifPct?.toFixed?.(1)), itemStyle: { color: '#10b981' } },
                { name: 'Perfect order', type: 'line', smooth: true, data: trend.map((d: any) => d.perfectPct?.toFixed?.(1)), itemStyle: { color: '#8b5cf6' } },
              ],
            }} style={{ height: 300 }} />
          </ChartCard>
        </div>
        <ChartCard title="Carrier Performance" subtitle="From the carrier / TMS feed">
          <DataTable data={data?.carriers ?? []} columns={[
            { key: 'name', label: 'Carrier' }, { key: 'deliveries', label: 'Deliveries', format: formatNumber },
            { key: 'exceptionPct', label: 'Exceptions', format: formatPct }, { key: 'onTimePct', label: 'Delivered by request date', format: formatPct },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

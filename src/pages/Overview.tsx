import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct } from '@/lib/utils';
import MetricCard, { CurrencyIcon, Calendar, Gauge, Activity, Receipt, TrendingUp } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import ReactECharts from '@/components/Chart';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

const days = (v: number | null | undefined) => (v == null ? '–' : `${Number(v).toFixed(1)} d`);

export default function Overview() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('overview', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const st = data?.stages ?? {};
  const trend = data?.trend ?? [];
  const dso = data?.dsoTrend ?? [];
  const stages = [
    { name: 'Quote to order', v: st.quoteToOrder }, { name: 'Order to ship', v: st.orderToShip },
    { name: 'Ship to bill', v: st.shipToBill }, { name: 'Bill to cash', v: st.billToCash },
  ];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Bookings (USD)" value={formatDollar(k.bookings)} icon={CurrencyIcon} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatDollar(k.backlog)} open backlog`} deltaType="neutral" />
          <MetricCard title="OTIF" value={formatPct(k.otifPct)} icon={Gauge} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`${formatPct(k.perfectPct)} perfect orders`} deltaType={k.otifPct >= 85 ? 'positive' : 'negative'} />
          <MetricCard title="DSO (Aug 2026)" value={days(k.dso)} icon={Calendar} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`Best possible ${days(k.bpdso)} · CEI ${formatPct(k.cei)}`} deltaType="neutral" />
          <MetricCard title="Order-to-Cash Cycle" value={days(k.o2cDays)} icon={Activity} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="Order date to cash, paid invoices" deltaType="neutral" />
          <MetricCard title="Open Receivables" value={formatDollar(k.openAr)} icon={Receipt} accent="border-sky-300/50 bg-gradient-to-br from-sky-50 to-blue-50" delta={`${formatDollar(k.pastDue)} past due`} deltaType="negative" />
          <MetricCard title="Dispute Rate" value={formatPct(k.disputePct)} icon={TrendingUp} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta="Share of invoices disputed" deltaType="negative" />
          <MetricCard title="Unbilled Shipments" value={formatDollar(k.unbilled)} icon={CurrencyIcon} accent="border-slate-300/50 bg-gradient-to-br from-slate-50 to-gray-50" delta="Shipped, not yet invoiced" deltaType="neutral" />
          <MetricCard title="Unapplied Cash" value={formatDollar(k.unapplied)} icon={CurrencyIcon} accent="border-teal-300/50 bg-gradient-to-br from-teal-50 to-cyan-50" delta={`${formatPct(k.autoMatchPct)} auto-matched`} deltaType="neutral" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Where the Cycle Time Goes" subtitle="Average days per order-to-cash stage">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: 110, right: 40, bottom: 20, top: 10 },
              xAxis: { type: 'value', name: 'days' }, yAxis: { type: 'category', inverse: true, data: stages.map((s) => s.name) },
              series: [{ type: 'bar', data: stages.map((s) => Number((s.v ?? 0).toFixed(1))), itemStyle: { color: '#29b5e8', borderRadius: [0, 4, 4, 0] },
                         label: { show: true, position: 'right', formatter: '{c} d' }, barMaxWidth: 22 }],
            }} style={{ height: 280 }} />
          </ChartCard>
          <ChartCard title="Bookings by Company" subtitle="Order intake, USD">
            <Bars rows={data?.byCompany ?? []} label="name" value="bookings" color="#8b5cf6" height={280} leftPad={200} />
          </ChartCard>
          <ChartCard title="Bookings, Invoicing and OTIF by Month" className="lg:col-span-2">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 70, right: 60, bottom: 30, top: 40 },
              xAxis: { type: 'category', data: trend.map((d: any) => d.month) },
              yAxis: [{ type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } }, { type: 'value', name: 'OTIF %', min: 0, max: 100 }],
              series: [
                { name: 'Bookings', type: 'bar', data: trend.map((d: any) => d.bookings), itemStyle: { color: '#29b5e8' } },
                { name: 'Invoiced', type: 'bar', data: trend.map((d: any) => d.invoiced), itemStyle: { color: '#a5b4fc' } },
                { name: 'OTIF %', type: 'line', yAxisIndex: 1, smooth: true, data: trend.map((d: any) => d.otifPct?.toFixed?.(1)), itemStyle: { color: '#10b981' } },
              ],
            }} style={{ height: 320 }} />
          </ChartCard>
          <ChartCard title="DSO vs Best-Possible DSO" subtitle="Month-end AR over trailing 90-day credit sales; the gap is days lost to late payment">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 50, right: 20, bottom: 30, top: 40 },
              xAxis: { type: 'category', data: dso.map((d: any) => d.month) }, yAxis: { type: 'value', name: 'days' },
              series: [
                { name: 'DSO', type: 'line', smooth: true, data: dso.map((d: any) => d.dso?.toFixed?.(1)), itemStyle: { color: '#f59e0b' } },
                { name: 'Best possible DSO', type: 'line', smooth: true, data: dso.map((d: any) => d.bpdso?.toFixed?.(1)), itemStyle: { color: '#10b981' } },
              ],
            }} style={{ height: 300 }} />
          </ChartCard>
          <ChartCard title="Billed by Source System" subtitle="One canonical model across the selected SAP sources">
            <Bars rows={data?.bySource ?? []} label="name" value="spend" color="#29b5e8" height={300} />
          </ChartCard>
        </div>
      </div>
    </PageState>
  );
}

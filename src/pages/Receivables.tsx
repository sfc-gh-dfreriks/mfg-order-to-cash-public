import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { CurrencyIcon, Calendar, Gauge, Receipt } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import PageState from '@/components/PageState';

const BUCKET_COLORS = ['#10b981', '#a3e635', '#facc15', '#f59e0b', '#f97316', '#dc2626'];
const days = (v: any) => (v == null ? '–' : Number(v).toFixed(1));

export default function Receivables() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('receivables', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const d = data?.dso ?? {};
  const aging = data?.aging ?? [];
  const trend = data?.trend ?? [];
  const byCo = data?.agingByCompany ?? [];
  const companies = [...new Set(byCo.map((r: any) => r.company))] as string[];
  const buckets = aging.map((a: any) => a.name) as string[];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Open Receivables" value={formatDollar(k.openAr)} icon={CurrencyIcon} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatDollar(k.pastDue)} past due (${formatPct(100 * (k.pastDue ?? 0) / (k.openAr || 1))})`} deltaType="negative" />
          <MetricCard title="DSO (Aug 2026)" value={`${days(d.dso)} d`} icon={Calendar} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`Best possible ${days(d.bpdso)} d · ${days((d.dso ?? 0) - (d.bpdso ?? 0))} d delinquent`} deltaType="neutral" />
          <MetricCard title="Collection Effectiveness (CEI)" value={formatPct(d.cei)} icon={Gauge} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta="85%+ is generally considered good" deltaType={d.cei >= 85 ? 'positive' : 'negative'} />
          <MetricCard title="Over 90 Days Past Due" value={formatDollar(k.over90)} icon={Receipt} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta={`${formatDollar(k.inDispute)} of open AR in dispute`} deltaType="negative" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="AR Aging" subtitle="Open items by days past the net due date, USD">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatDollar(v) },
              grid: { left: 70, right: 20, bottom: 30, top: 20 },
              xAxis: { type: 'category', data: buckets.map((b) => b.slice(2)) }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
              series: [{ type: 'bar', data: aging.map((a: any, i: number) => ({ value: a.value, itemStyle: { color: BUCKET_COLORS[i] } })), barMaxWidth: 50 }],
            }} style={{ height: 300 }} />
          </ChartCard>
          <ChartCard title="AR Aging by Company" subtitle="USD">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatDollar(v) }, legend: { top: 0, textStyle: { fontSize: 10 } },
              grid: { left: 190, right: 20, bottom: 20, top: 50 },
              xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } }, yAxis: { type: 'category', data: companies },
              series: buckets.map((b, i) => ({ name: b.slice(2), type: 'bar', stack: 'a', barMaxWidth: 20, itemStyle: { color: BUCKET_COLORS[i] },
                data: companies.map((c) => byCo.find((r: any) => r.company === c && r.bucket === b)?.value ?? 0) })),
            }} style={{ height: 300 }} />
          </ChartCard>
          <ChartCard title="DSO, Best-Possible DSO and CEI by Month" className="lg:col-span-2">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 50, right: 50, bottom: 30, top: 40 },
              xAxis: { type: 'category', data: trend.map((r: any) => r.month) },
              yAxis: [{ type: 'value', name: 'days' }, { type: 'value', name: 'CEI %', min: 0, max: 100 }],
              series: [
                { name: 'DSO', type: 'line', smooth: true, data: trend.map((r: any) => r.dso?.toFixed?.(1)), itemStyle: { color: '#f59e0b' } },
                { name: 'Best possible DSO', type: 'line', smooth: true, data: trend.map((r: any) => r.bpdso?.toFixed?.(1)), itemStyle: { color: '#10b981' } },
                { name: 'CEI', type: 'bar', yAxisIndex: 1, data: trend.map((r: any) => r.cei?.toFixed?.(1)), itemStyle: { color: '#c7d2fe' } },
              ],
            }} style={{ height: 320 }} />
          </ChartCard>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="DSO by Company (Aug 2026)" subtitle="Worst first">
            <DataTable data={data?.dsoByCompany ?? []} columns={[
              { key: 'name', label: 'Company' }, { key: 'dso', label: 'DSO', format: days }, { key: 'bpdso', label: 'Best possible', format: days },
              { key: 'cei', label: 'CEI', format: formatPct }, { key: 'ar', label: 'Month-end AR', format: formatDollar },
            ]} />
          </ChartCard>
          <ChartCard title="Payment Behaviour by Terms" subtitle="Paid invoices">
            <DataTable data={data?.byTerms ?? []} columns={[
              { key: 'name', label: 'Terms' }, { key: 'daysToPay', label: 'Avg days to pay', format: days },
              { key: 'onTimePct', label: 'Paid on time', format: formatPct }, { key: 'invoices', label: 'Invoices', format: formatNumber },
            ]} />
          </ChartCard>
        </div>
      </div>
    </PageState>
  );
}

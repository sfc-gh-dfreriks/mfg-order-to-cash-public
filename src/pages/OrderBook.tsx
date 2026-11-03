import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { CurrencyIcon, FileText, Gauge, Calendar } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

export default function OrderBook() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('order-book', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const qt = data?.quotes ?? {};
  const trend = data?.trend ?? [];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Open Backlog" value={formatDollar(k.backlog)} icon={CurrencyIcon} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatDollar(k.pastDueBacklog)} past requested date`} deltaType="negative" />
          <MetricCard title="Orders" value={formatNumber(k.orders)} icon={FileText} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta={`${formatPct(k.fromQuotePct)} of lines from a CPQ quote`} deltaType="neutral" />
          <MetricCard title="Quote Conversion" value={formatPct(qt.conversionPct)} icon={Gauge} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta={`${formatDollar(qt.openPipeline)} open quotes`} deltaType="neutral" />
          <MetricCard title="Quote to Order" value={`${Number(qt.quoteToOrderDays ?? 0).toFixed(1)} d`} icon={Calendar} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`${formatNumber(k.creditBlockedLines)} lines on credit block · ${formatPct(k.rejectedPct)} rejected`} deltaType="neutral" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Backlog by Plant" subtitle="Open order value, USD">
            <Bars rows={data?.backlogByPlant ?? []} label="name" value="value" color="#29b5e8" height={280} />
          </ChartCard>
          <ChartCard title="Backlog by Product Family">
            <Bars rows={data?.backlogByFamily ?? []} label="name" value="value" color="#8b5cf6" height={280} />
          </ChartCard>
          <ChartCard title="CPQ Quotes by Status" subtitle="Salesforce CPQ, quote value USD">
            <Bars rows={data?.quoteStatus ?? []} label="name" value="value" color="#10b981" height={260} />
          </ChartCard>
          <ChartCard title="Rejected Order Value by Reason">
            <Bars rows={data?.rejections ?? []} label="name" value="value" color="#f87171" height={260} />
          </ChartCard>
          <ChartCard title="Bookings by Month" className="lg:col-span-2">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, grid: { left: 70, right: 20, bottom: 30, top: 20 },
              xAxis: { type: 'category', data: trend.map((d: any) => d.month) }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
              series: [{ name: 'Bookings', type: 'bar', data: trend.map((d: any) => d.bookings), itemStyle: { color: '#29b5e8' } }],
            }} style={{ height: 280 }} />
          </ChartCard>
        </div>
        <ChartCard title="Orders on Credit Block" subtitle="Still blocked at the as-of date, largest first">
          <DataTable data={data?.blocked ?? []} columns={[
            { key: 'orderId', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'company', label: 'Company' },
            { key: 'orderDate', label: 'Ordered' }, { key: 'requested', label: 'Requested' }, { key: 'value', label: 'Value', format: formatDollar },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

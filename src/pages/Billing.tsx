import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { CurrencyIcon, Calendar, FileText, Receipt } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

export default function Billing() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('billing', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const trend = data?.trend ?? [];
  const lag = data?.lagBuckets ?? [];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Invoiced" value={formatDollar(k.invoiced)} icon={CurrencyIcon} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatNumber(k.invoices)} invoices`} deltaType="neutral" />
          <MetricCard title="Ship to Bill" value={`${Number(k.shipToBill ?? 0).toFixed(1)} d`} icon={Calendar} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`${formatPct(k.lateBilledPct)} invoiced more than 2 days after shipping`} deltaType="negative" />
          <MetricCard title="Unbilled Shipments" value={formatDollar(data?.unbilled?.unbilled)} icon={FileText} accent="border-slate-300/50 bg-gradient-to-br from-slate-50 to-gray-50" delta="Shipped, no invoice yet" deltaType="neutral" />
          <MetricCard title="Credit Memos" value={formatDollar(k.creditMemos)} icon={Receipt} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta={`${formatPct(100 * (k.creditMemos ?? 0) / (k.invoiced || 1))} of invoiced`} deltaType="negative" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Ship-to-Bill Lag" subtitle="Invoices by days from goods issue to billing">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: 60, right: 20, bottom: 30, top: 20 },
              xAxis: { type: 'category', data: lag.map((d: any) => d.name) }, yAxis: { type: 'value' },
              series: [{ name: 'Invoices', type: 'bar', data: lag.map((d: any) => d.invoices), itemStyle: { color: '#29b5e8', borderRadius: [4, 4, 0, 0] } }],
            }} style={{ height: 280 }} />
          </ChartCard>
          <ChartCard title="Revenue Lost to Credits and Write-offs" subtitle="By dispute reason, USD">
            <Bars rows={data?.creditMemoReasons ?? []} label="name" value="value" color="#f87171" height={280} leftPad={200} />
          </ChartCard>
          <ChartCard title="Ship-to-Bill Days and Credit Memos by Month" className="lg:col-span-2">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 60, right: 70, bottom: 30, top: 40 },
              xAxis: { type: 'category', data: trend.map((d: any) => d.month) },
              yAxis: [{ type: 'value', name: 'days' }, { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } }],
              series: [
                { name: 'Ship to bill (days)', type: 'line', smooth: true, data: trend.map((d: any) => d.shipToBill?.toFixed?.(2)), itemStyle: { color: '#f59e0b' } },
                { name: 'Credit memos', type: 'bar', yAxisIndex: 1, data: trend.map((d: any) => d.creditMemos), itemStyle: { color: '#fca5a5' } },
              ],
            }} style={{ height: 300 }} />
          </ChartCard>
        </div>
        <ChartCard title="Largest Unbilled Deliveries" subtitle="Goods issued, no invoice at the as-of date">
          <DataTable data={data?.unbilledDeliveries ?? []} columns={[
            { key: 'deliveryId', label: 'Delivery' }, { key: 'orderId', label: 'Order' }, { key: 'plant', label: 'Plant' },
            { key: 'giDate', label: 'Goods issue' }, { key: 'daysUnbilled', label: 'Days unbilled', format: formatNumber },
            { key: 'value', label: 'Value', format: formatDollar }, { key: 'block', label: 'Block' },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { CurrencyIcon, Gauge, Receipt, Activity } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import ReactECharts from '@/components/Chart';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

export default function CashApplication() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('cash-application', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const trend = data?.trend ?? [];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Cash Received" value={formatDollar(k.received)} icon={CurrencyIcon} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatNumber(k.receipts)} receipts`} deltaType="neutral" />
          <MetricCard title="Auto-Match Rate" value={formatPct(k.autoMatchPct)} icon={Gauge} accent="border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-green-50" delta="Matched on remittance invoice numbers" deltaType="positive" />
          <MetricCard title="Unapplied Cash" value={formatDollar(k.unapplied)} icon={Receipt} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta={`${formatNumber(k.unappliedCount)} receipts not cleared against invoices`} deltaType="negative" />
          <MetricCard title="Bank Feed and SAP Agree" value={formatPct(k.bothPct)} icon={Activity} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="Receipts in both camt.053 and FEBEP" deltaType="neutral" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Receipts by Match Status" subtitle="Value received, USD">
            <Bars rows={data?.status ?? []} label="name" value="value" color="#29b5e8" height={260} leftPad={200} />
          </ChartCard>
          <ChartCard title="Auto-Match Rate by Month">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis' }, grid: { left: 50, right: 20, bottom: 30, top: 20 },
              xAxis: { type: 'category', data: trend.map((d: any) => d.month) }, yAxis: { type: 'value', min: 0, max: 100, name: '%' },
              series: [{ name: 'Auto-matched', type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, data: trend.map((d: any) => d.autoMatchPct?.toFixed?.(1)), itemStyle: { color: '#10b981' } }],
            }} style={{ height: 260 }} />
          </ChartCard>
        </div>
        <ChartCard title="Unapplied Receipts" subtitle="Cash on the bank statement that no invoice has been cleared against, largest first">
          <DataTable data={data?.unapplied ?? []} columns={[
            { key: 'bankReference', label: 'Bank reference' }, { key: 'company', label: 'Company' }, { key: 'valueDate', label: 'Value date' },
            { key: 'payerName', label: 'Payer' }, { key: 'amount', label: 'Amount', format: formatDollar }, { key: 'remittance', label: 'Remittance text' },
            { key: 'daysUnapplied', label: 'Days', format: formatNumber }, { key: 'status', label: 'Status' },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

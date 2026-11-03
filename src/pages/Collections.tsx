import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatNumber } from '@/lib/utils';
import MetricCard, { CurrencyIcon, Calendar, FileText, TrendingDown } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import Bars from '@/components/Bars';
import ReactECharts from '@/components/Chart';
import PageState from '@/components/PageState';

export default function Collections() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('collections', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  const dun = data?.dunning ?? [];
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Open Disputes" value={formatNumber(k.openDisputes)} icon={FileText} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta={`${formatDollar(k.openDisputed)} disputed`} deltaType="negative" />
          <MetricCard title="Revenue Lost" value={formatDollar(k.revenueLost)} icon={TrendingDown} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta="Credited or written off on resolution" deltaType="negative" />
          <MetricCard title="Days to Resolve" value={`${Number(k.daysToResolve ?? 0).toFixed(1)} d`} icon={Calendar} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta="Closed disputes, opened to resolved" deltaType="neutral" />
          <MetricCard title="Past Due at Dunning 3" value={formatDollar(dun.find((r: any) => Number(r.name) === 3)?.value)} icon={CurrencyIcon} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="Final dunning level reached" deltaType="negative" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Disputed Value by Reason" subtitle="SAP FSCM and the AR automation platform, de-duplicated">
            <Bars rows={data?.reasons ?? []} label="name" value="value" color="#f59e0b" height={280} leftPad={200} />
          </ChartCard>
          <ChartCard title="Disputed Value by Root Cause" subtitle="Fix these upstream to stop disputes recurring">
            <Bars rows={data?.rootCauses ?? []} label="name" value="value" color="#8b5cf6" height={280} />
          </ChartCard>
          <ChartCard title="Past-Due AR by Dunning Level">
            <ReactECharts keepOrder option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatDollar(v) }, grid: { left: 70, right: 20, bottom: 30, top: 20 },
              xAxis: { type: 'category', data: dun.map((r: any) => `Level ${r.name}`) }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDollar(v) } },
              series: [{ type: 'bar', data: dun.map((r: any) => r.value), itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 50 }],
            }} style={{ height: 260 }} />
          </ChartCard>
          <ChartCard title="Dispute Outcomes" subtitle="Disputed value, USD">
            <Bars rows={data?.outcomes ?? []} label="name" value="value" color="#29b5e8" height={260} />
          </ChartCard>
        </div>
        <ChartCard title="Collections Worklist" subtitle="Past-due customers ranked by priority: past-due dollars weighted by age and dunning, damped for disputed balances">
          <DataTable data={data?.worklist ?? []} columns={[
            { key: 'customer', label: 'Customer' }, { key: 'company', label: 'Company' }, { key: 'segment', label: 'Segment' }, { key: 'owner', label: 'Owner' },
            { key: 'riskTier', label: 'Risk' }, { key: 'pastDue', label: 'Past due', format: formatDollar }, { key: 'over90', label: '90+ days', format: formatDollar },
            { key: 'dunning', label: 'Dunning', format: formatNumber }, { key: 'openDisputes', label: 'Open disputes', format: formatNumber },
            { key: 'daysLate', label: 'Avg days late', format: (v) => (v == null ? '' : Number(v).toFixed(1)) },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

import { usePageDeps } from '@/hooks/useFilters';
import { useQuery } from '@/hooks/useQuery';
import { fetchPage } from '@/lib/api';
import { formatDollar, formatPct, formatNumber } from '@/lib/utils';
import MetricCard, { Users, CurrencyIcon, Gauge, Building2 } from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import DataTable from '@/components/DataTable';
import Bars from '@/components/Bars';
import PageState from '@/components/PageState';

const one = (v: any) => (v == null ? '' : Number(v).toFixed(1));

export default function Customers() {
  const { apiCompanies, apiCategories, deps, empty } = usePageDeps();
  const { data, loading, error } = useQuery(() => fetchPage('customers', apiCompanies, apiCategories), deps);
  const k = data?.kpis ?? {};
  return (
    <PageState loading={loading} error={error} empty={empty}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Customer Accounts" value={formatNumber(k.customers)} icon={Users} accent="border-cyan-300/50 bg-gradient-to-br from-cyan-50 to-sky-50" delta={`${formatNumber(k.golden)} legal entities · ${formatNumber(k.inCrm)} in Salesforce`} deltaType="neutral" />
          <MetricCard title="Open AR, High / Critical Risk" value={formatDollar(k.highRiskAr)} icon={CurrencyIcon} accent="border-rose-300/50 bg-gradient-to-br from-rose-50 to-red-50" delta={`of ${formatDollar(k.openAr)} open AR`} deltaType="negative" />
          <MetricCard title="Over Credit Limit" value={formatNumber(k.overLimit)} icon={Gauge} accent="border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50" delta="Open AR above the SAP credit limit" deltaType="negative" />
          <MetricCard title="Buy From Both SAP Instances" value={formatNumber((data?.multiInstance ?? []).length)} icon={Building2} accent="border-purple-300/50 bg-gradient-to-br from-purple-50 to-indigo-50" delta="Same legal entity, two customer numbers" deltaType="neutral" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Open AR by Risk Tier">
            <Bars rows={data?.tiers ?? []} label="name" value="openAr" color="#f87171" height={240} />
          </ChartCard>
          <ChartCard title="Billed in the Last 12 Months by Segment" subtitle="Segment from Salesforce">
            <Bars rows={data?.bySegment ?? []} label="name" value="billed" color="#29b5e8" height={240} />
          </ChartCard>
        </div>
        <ChartCard title="Largest Customers" subtitle="Trailing 12 months billing, credit exposure and payment behaviour">
          <DataTable data={data?.top ?? []} columns={[
            { key: 'customer', label: 'Customer' }, { key: 'company', label: 'Company' }, { key: 'segment', label: 'Segment' }, { key: 'terms', label: 'Terms' },
            { key: 'billed', label: 'Billed 12m', format: formatDollar }, { key: 'openAr', label: 'Open AR', format: formatDollar },
            { key: 'creditLimit', label: 'Credit limit', format: formatDollar }, { key: 'utilization', label: 'Utilization', format: formatPct },
            { key: 'dso', label: 'DSO', format: one }, { key: 'onTime', label: 'Paid on time', format: formatPct },
            { key: 'disputeRate', label: 'Dispute rate', format: formatPct }, { key: 'riskTier', label: 'Risk' },
          ]} />
        </ChartCard>
        <ChartCard title="Customers Served by Both SAP Instances" subtitle="Golden customer across instance A and B">
          <DataTable data={data?.multiInstance ?? []} columns={[
            { key: 'customer', label: 'Customer' }, { key: 'accounts', label: 'Accounts', format: formatNumber }, { key: 'ids', label: 'Customer numbers' },
            { key: 'billed', label: 'Billed 12m', format: formatDollar }, { key: 'openAr', label: 'Open AR', format: formatDollar },
          ]} />
        </ChartCard>
      </div>
    </PageState>
  );
}

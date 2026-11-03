// Shared model for the 3D pipeline views (Data Factory, 3D Sankey, Lineage Constellation).
// Built from endpoints that already exist in live and static mode: /api/sources (selection +
// per-object row counts), /api/lineage (dbt manifest graph) and /api/overview (spend by source).
export type Stage = 'source' | 'object' | 'mart' | 'snowflake';

export interface FlowNode {
  id: string;
  stage: Stage;
  label: string;
  sub?: string;
  family?: 'SAP' | 'Non-SAP';
  value: number;            // rows (sources, objects) or relative weight (marts)
  spend?: number;           // USD, sources only
  active: boolean;
  detail: Record<string, string | number>;
}
export interface FlowLink { source: string; target: string; value: number; active: boolean }
export interface FlowModel { nodes: FlowNode[]; links: FlowLink[]; lineage: { nodes: any[]; edges: any[] } }

const OBJECT_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer', QUOTE: 'Quote', SALES_ORDER_LINE: 'Order line', DELIVERY_LINE: 'Delivery line',
  SHIPMENT_EVENT: 'Shipment event', BILLING_LINE: 'Billing line', AR_ITEM: 'Receivable item', DISPUTE_CASE: 'Dispute',
  PAYMENT_RECEIPT: 'Bank receipt',
};
// Gold in the 3D views = only the analytical marts the app's pages deliver. The dbt graph also tags
// per-source enrichment views (enr_*), metadata tables and source coverage as gold; those stay on the
// Lineage page but are left out here.
const MART_LABEL: Record<string, string> = {
  fct_order_line: 'Orders & OTIF', fct_delivery: 'Deliveries', fct_invoice: 'Invoices', fct_ar_open_item: 'Open AR',
  fct_dispute: 'Disputes', fct_cash_application: 'Cash application', fct_quote: 'Quotes', dim_customer: 'Customer 360',
  mart_ar_monthly: 'DSO & CEI', mart_o2c_monthly: 'O2C KPIs',
};
const isAppMart = (n: any) => n.layer === 'gold' && n.name in MART_LABEL;

/** Keep the dbt graph to what feeds the app marts: drop non-app gold nodes, then anything left unconnected. */
function appLineage(nodes: any[], edges: any[]) {
  const dropped = new Set(nodes.filter((n) => n.layer === 'gold' && !isAppMart(n)).map((n) => n.id));
  const es = edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target));
  const linked = new Set(es.flatMap((e) => [e.source, e.target]));
  return { nodes: nodes.filter((n) => !dropped.has(n.id) && linked.has(n.id)), edges: es };
}

export function buildFlowModel(sources: any, lineage: any, overview: any): FlowModel {
  const slots: any[] = sources?.slots ?? [];
  const coverage: any[] = sources?.coverage ?? [];
  const systems: any[] = sources?.systems ?? [];
  const spendBySystem = new Map<string, number>((overview?.bySource ?? []).map((r: any) => [r.name, r.spend]));
  const sysName = (code: string) => systems.find((s: any) => s.code === code)?.name ?? code;

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // Sources: one per slot, named after the chosen system type.
  for (const s of slots) {
    const rows = coverage.filter((c) => c.sourceSlot === s.sourceSlot).reduce((a, c) => a + (c.rowCount ?? 0), 0);
    const system = coverage.find((c) => c.sourceSlot === s.sourceSlot)?.sourceSystem ?? sysName(s.systemCode);
    nodes.push({
      id: `src:${s.sourceSlot}`, stage: 'source', label: system, sub: s.label, family: s.kind === 'SAP' ? 'SAP' : 'Non-SAP',
      value: rows, spend: spendBySystem.get(system) ?? 0, active: !!s.enabled,
      detail: { Slot: s.sourceSlot, Scope: s.scope ?? '', 'Rows into silver': rows, 'Billed (USD)': Math.round(spendBySystem.get(system) ?? 0) },
    });
  }
  // Canonical objects (silver), with rows contributed per source.
  const objects = [...new Set(coverage.map((c) => c.objectName))];
  for (const o of objects) {
    const rows = coverage.filter((c) => c.objectName === o).reduce((a, c) => a + (c.rowCount ?? 0), 0);
    nodes.push({ id: `obj:${o}`, stage: 'object', label: OBJECT_LABEL[o] ?? o, sub: o, value: rows, active: rows > 0,
      detail: { 'Canonical object': o, Rows: rows, Sources: coverage.filter((c) => c.objectName === o && c.rowCount > 0).length } });
    for (const c of coverage.filter((x) => x.objectName === o && x.rowCount > 0))
      links.push({ source: `src:${c.sourceSlot}`, target: `obj:${o}`, value: c.rowCount, active: true });
  }

  // Gold marts and silver → gold edges from the dbt graph (following silver → silver hops).
  const { nodes: ln, edges: le } = appLineage(lineage?.nodes ?? [], lineage?.edges ?? []);
  const byId = new Map(ln.map((n) => [n.id, n]));
  const gold = ln.filter(isAppMart);
  const silverObject = (n: any) => objects.find((o) => o.toLowerCase() === String(n.name).toLowerCase());
  const objectsFeeding = (goldId: string) => {
    const seen = new Set<string>(); const out = new Set<string>(); const stack = [goldId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of le.filter((x) => x.target === id)) {
        if (seen.has(e.source)) continue; seen.add(e.source);
        const n = byId.get(e.source); if (!n) continue;
        if (n.layer === 'silver') { const o = silverObject(n); if (o) out.add(o); else stack.push(n.id); }
        else if (n.layer === 'gold') stack.push(n.id);
      }
    }
    return [...out];
  };
  for (const g of gold) {
    const feeds = objectsFeeding(g.id);
    const weight = feeds.reduce((a, o) => a + (nodes.find((n) => n.id === `obj:${o}`)?.value ?? 0), 0) / Math.max(1, feeds.length);
    nodes.push({ id: `mart:${g.name}`, stage: 'mart', label: MART_LABEL[g.name] ?? g.name, sub: g.name, value: weight, active: true,
      detail: { Model: g.name, Materialized: g.materialized ?? '', 'Built from': feeds.map((o) => OBJECT_LABEL[o] ?? o).join(', ') || 'gold marts', Description: g.description ?? '' } });
    for (const o of feeds) links.push({ source: `obj:${o}`, target: `mart:${g.name}`, value: weight / Math.max(1, feeds.length), active: true });
  }
  const totalRows = nodes.filter((n) => n.stage === 'source').reduce((a, n) => a + n.value, 0);
  nodes.push({ id: 'snowflake', stage: 'snowflake', label: 'Snowflake', sub: 'Semantic view · Cortex Agent · apps', value: totalRows, active: true,
    detail: { Serves: 'Semantic view ORDER_TO_CASH, Cortex Agent, React app', 'Gold marts': gold.length, 'Rows unified': totalRows } });
  for (const g of gold) links.push({ source: `mart:${g.name}`, target: 'snowflake', value: nodes.find((n) => n.id === `mart:${g.name}`)!.value, active: true });

  // Sources that are switched off still show, dimmed, with no outgoing flow.
  for (const n of nodes) if (n.stage === 'source' && !n.active) n.value = 0;
  return { nodes, links, lineage: { nodes: ln, edges: le } };
}

export const STAGE_X: Record<Stage, number> = { source: -9, object: -2.5, mart: 4, snowflake: 10 };
export const STAGE_LABEL: Record<Stage, string> = { source: 'SAP & non-SAP sources', object: 'Canonical silver', mart: 'Gold analytical marts', snowflake: 'Served on Snowflake' };

export const COLOR = {
  sap: '#29b5e8', nonSap: '#8b5cf6', object: '#10b981', mart: '#f59e0b', snowflake: '#29b5e8', inactive: '#94a3b8',
};
export const nodeColor = (n: FlowNode) => !n.active ? COLOR.inactive
  : n.stage === 'source' ? (n.family === 'SAP' ? COLOR.sap : COLOR.nonSap)
  : n.stage === 'object' ? COLOR.object : n.stage === 'mart' ? COLOR.mart : COLOR.snowflake;

/** Vertical layout for one stage: evenly spaced, centred on 0. */
export function layout(model: FlowModel, gap = 1.6) {
  const pos = new Map<string, [number, number, number]>();
  for (const stage of ['source', 'object', 'mart', 'snowflake'] as Stage[]) {
    const ns = model.nodes.filter((n) => n.stage === stage);
    ns.forEach((n, i) => pos.set(n.id, [STAGE_X[stage], ((ns.length - 1) / 2 - i) * gap, 0]));
  }
  return pos;
}

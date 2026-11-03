import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

// "Lineage Constellation": the real dbt graph (sources → staging adapters → silver → gold) as a
// 3D force-directed network laid out left to right by layer, with particles running along each edge.
// Adapters outside the current source selection are dimmed, as on the 2D lineage page.
interface Props { lineage: { nodes: any[]; edges: any[] }; playing: boolean; speed: number; onSelect: (n: any | null) => void }

const LAYER_COLOR: Record<string, string> = { source: '#64748b', staging: '#29b5e8', silver: '#10b981', gold: '#f59e0b' };
const SAP_GROUP = /src_(ecc|s4|bw|bdc)_|sap_/i;

export default function ConstellationView({ lineage, playing, speed, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [hover, setHover] = useState<any>(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const ids = new Set(lineage.nodes.map((n) => n.id));
    // a source table is "active" if any active adapter reads it
    const activeSrc = new Set(lineage.edges.filter((e) => lineage.nodes.find((n) => n.id === e.target)?.active).map((e) => e.source));
    const nodes = lineage.nodes.map((n) => ({
      ...n, active: n.layer === 'source' ? activeSrc.has(n.id) : n.layer === 'staging' ? !!n.active : true,
      sap: SAP_GROUP.test(n.group ?? '') || SAP_GROUP.test(n.id),
    }));
    const links = lineage.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e }));
    return { nodes, links };
  }, [lineage]);

  const neighbours = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover.id]);
    for (const l of data.links) {
      const a = typeof l.source === 'object' ? (l.source as any).id : l.source, b = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (a === hover.id) s.add(b); if (b === hover.id) s.add(a);
    }
    return s;
  }, [hover, data]);

  useEffect(() => {
    const g = fg.current; if (!g) return;
    g.d3Force('charge')?.strength(-60);
    const t = setTimeout(() => g.zoomToFit(600, 20), 1500);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => { const g = fg.current; if (!g) return; playing ? g.resumeAnimation() : g.pauseAnimation(); }, [playing]);

  const nodeObject = (n: any) => {
    const r = n.layer === 'gold' ? 9 : n.layer === 'silver' ? 7.5 : n.layer === 'staging' ? 4.5 : 3.2;
    const color = !n.active ? '#cbd5e1' : n.layer === 'source' && n.sap ? '#0b6ea8' : LAYER_COLOR[n.layer] ?? '#94a3b8';
    const geo = n.layer === 'gold' ? new THREE.OctahedronGeometry(r) : n.layer === 'silver' ? new THREE.IcosahedronGeometry(r, 0) : new THREE.SphereGeometry(r, 16, 16);
    const dim = neighbours && !neighbours.has(n.id);
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: dim ? 0.15 : n.active ? 0.95 : 0.35 }));
  };
  const linkLit = (l: any) => {
    const a = typeof l.source === 'object' ? l.source : null, b = typeof l.target === 'object' ? l.target : null;
    if (neighbours) return a && b && neighbours.has(a.id) && neighbours.has(b.id);
    return !!(b?.active ?? true);
  };

  return (
    <div ref={wrap} className="h-full w-full">
      <ForceGraph3D ref={fg} width={size.w} height={size.h} graphData={data} backgroundColor="#0b1a2b"
        dagMode="lr" dagLevelDistance={55} nodeThreeObject={nodeObject} nodeLabel={(n: any) =>
          `<div style="font:12px Arial;padding:4px 6px;background:#0b1a2b;color:#fff;border-radius:4px">
             <b>${n.name}</b><br/>${n.layer}${n.materialized ? ` · ${n.materialized}` : ''}${n.active ? '' : '<br/><i>not in current selection</i>'}
             ${n.description ? `<br/>${n.description}` : ''}</div>`}
        linkColor={(l: any) => (linkLit(l) ? 'rgba(148,197,232,0.7)' : 'rgba(148,163,184,0.12)')}
        linkWidth={(l: any) => (linkLit(l) ? 1.1 : 0.3)}
        linkDirectionalParticles={(l: any) => (linkLit(l) ? 2 : 0)}
        linkDirectionalParticleSpeed={0.004 * speed} linkDirectionalParticleWidth={2.6}
        linkDirectionalParticleColor={() => '#e0f2fe'}
        onNodeHover={(n: any) => { setHover(n); if (wrap.current) wrap.current.style.cursor = n ? 'pointer' : 'default'; }}
        onNodeClick={(n: any) => {
          onSelect(n);
          const d = 90, r = 1 + d / Math.hypot(n.x, n.y, n.z);
          fg.current?.cameraPosition({ x: n.x * r, y: n.y * r, z: n.z * r }, n, 900);
        }}
        onBackgroundClick={() => onSelect(null)}
        cooldownTicks={120} enableNodeDrag={false} showNavInfo={false} />
    </div>
  );
}

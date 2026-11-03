import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { type FlowModel, type FlowNode, nodeColor, STAGE_X, STAGE_LABEL, type Stage } from '@/lib/flow3d';

// "3D Sankey": a real Sankey layout (node height = volume, ribbons stacked by size), extruded into
// translucent 3D bands with particles flowing along them. Each stage sits on its own depth plane so
// you can orbit around the flow.
interface Props { model: FlowModel; playing: boolean; speed: number; selected: string | null; onSelect: (id: string | null) => void }

const SCALE_H = 12;           // total height of the tallest column
const NODE_W = 0.35;
const DEPTH: Record<Stage, number> = { source: 0, object: -1.2, mart: -2.4, snowflake: -3.6 };
const PAD = 0.25;

interface Placed { node: FlowNode; x: number; y0: number; y1: number; z: number }
interface Band { key: string; from: Placed; to: Placed; s0: number; s1: number; t0: number; t1: number; value: number; color: string }

function sankeyLayout(model: FlowModel) {
  const stages: Stage[] = ['source', 'object', 'mart', 'snowflake'];
  // value of a node = max(in, out) so marts and the hub are sized by what flows through them
  const inflow = new Map<string, number>(), outflow = new Map<string, number>();
  for (const l of model.links) {
    outflow.set(l.source, (outflow.get(l.source) ?? 0) + l.value);
    inflow.set(l.target, (inflow.get(l.target) ?? 0) + l.value);
  }
  const v = (n: FlowNode) => Math.max(inflow.get(n.id) ?? 0, outflow.get(n.id) ?? 0, n.active ? 1 : 0);
  const maxTotal = Math.max(...stages.map((s) => model.nodes.filter((n) => n.stage === s).reduce((a, n) => a + v(n), 0)));
  const k = SCALE_H / maxTotal;
  const placed = new Map<string, Placed>();
  for (const s of stages) {
    const ns = model.nodes.filter((n) => n.stage === s).sort((a, b) => v(b) - v(a));
    const total = ns.reduce((a, n) => a + v(n) * k, 0) + PAD * (ns.length - 1);
    let y = total / 2;
    for (const n of ns) {
      const h = Math.max(0.06, v(n) * k);
      placed.set(n.id, { node: n, x: STAGE_X[s], y0: y - h, y1: y, z: DEPTH[s] });
      y -= h + PAD;
    }
  }
  // stack ribbons on each side of a node, largest first
  const outCursor = new Map<string, number>(), inCursor = new Map<string, number>();
  const bands: Band[] = [];
  const sorted = [...model.links].sort((a, b) => b.value - a.value);
  for (const l of sorted) {
    const from = placed.get(l.source), to = placed.get(l.target);
    if (!from || !to) continue;
    const h = l.value * k;
    const s1 = outCursor.get(l.source) ?? from.y1; const t1 = inCursor.get(l.target) ?? to.y1;
    outCursor.set(l.source, s1 - h); inCursor.set(l.target, t1 - h);
    bands.push({ key: `${l.source}>${l.target}`, from, to, s0: s1 - h, s1, t0: t1 - h, t1, value: l.value, color: nodeColor(from.node) });
  }
  return { placed: [...placed.values()], bands };
}

/** Ribbon: a smooth band between two vertical spans, with a little thickness so it reads as 3D. */
function ribbonGeometry(b: Band, segs = 40, thick = 0.12) {
  const x0 = b.from.x + NODE_W / 2, x1 = b.to.x - NODE_W / 2;
  const pos: number[] = []; const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; const e = t * t * (3 - 2 * t);            // smoothstep
    const x = x0 + (x1 - x0) * t;
    const top = b.s1 + (b.t1 - b.s1) * e, bot = b.s0 + (b.t0 - b.s0) * e;
    const z = b.from.z + (b.to.z - b.from.z) * e;
    pos.push(x, top, z + thick, x, bot, z + thick, x, top, z - thick, x, bot, z - thick);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, c = (i + 1) * 4;
    idx.push(a, a + 1, c, a + 1, c + 1, c);             // front
    idx.push(a + 2, c + 2, a + 3, a + 3, c + 2, c + 3); // back
    idx.push(a, c, a + 2, a + 2, c, c + 2);             // top
    idx.push(a + 1, a + 3, c + 1, a + 3, c + 3, c + 1); // bottom
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function Particles({ b, playing, speed }: { b: Band; playing: boolean; speed: number }) {
  const n = Math.max(2, Math.min(14, Math.round(Math.log10(1 + b.value) * 2.5)));
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: n }, () => [Math.random(), Math.random()]), [n]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (playing) t.current += dt * 0.1 * speed;
    if (!ref.current) return;
    const x0 = b.from.x + NODE_W / 2, x1 = b.to.x - NODE_W / 2;
    seeds.forEach(([o, lane], i) => {
      const tt = (t.current + o) % 1; const e = tt * tt * (3 - 2 * tt);
      const top = b.s1 + (b.t1 - b.s1) * e, bot = b.s0 + (b.t0 - b.s0) * e;
      const z = b.from.z + (b.to.z - b.from.z) * e;
      m.makeTranslation(x0 + (x1 - x0) * tt, bot + (top - bot) * (0.15 + 0.7 * lane), z + 0.16);
      ref.current!.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <sphereGeometry args={[0.06, 10, 10]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

export default function SankeyView({ model, playing, speed, selected, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const { placed, bands } = useMemo(() => sankeyLayout(model), [model]);
  const geoms = useMemo(() => new Map(bands.map((b) => [b.key, ribbonGeometry(b)])), [bands]);
  const focus = hover ?? selected;
  const lit = (b: Band) => !focus || b.from.node.id === focus || b.to.node.id === focus;
  return (
    <Canvas camera={{ position: [2, 2, 20], fov: 45 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#0b1a2b']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 12]} intensity={1.2} />
      <pointLight position={[-10, -5, 8]} intensity={0.5} color="#29b5e8" />
      {bands.map((b) => (
        <group key={b.key}>
          <mesh geometry={geoms.get(b.key)}
            onPointerOver={(e) => { e.stopPropagation(); setHover(b.from.node.id); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHover(null); document.body.style.cursor = 'auto'; }}
            onClick={(e) => { e.stopPropagation(); onSelect(b.from.node.id); }}>
            <meshPhysicalMaterial color={b.color} transparent opacity={lit(b) ? 0.55 : 0.08} roughness={0.2} metalness={0.1}
              clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {lit(b) && <Particles b={b} playing={playing} speed={speed} />}
        </group>
      ))}
      {placed.map((p) => {
        const h = p.y1 - p.y0; const c = nodeColor(p.node);
        const on = !focus || focus === p.node.id || bands.some((b) => lit(b) && (b.from === p || b.to === p));
        return (
          <group key={p.node.id} position={[p.x, (p.y0 + p.y1) / 2, p.z]}
            onPointerOver={(e) => { e.stopPropagation(); setHover(p.node.id); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHover(null); document.body.style.cursor = 'auto'; }}
            onClick={(e) => { e.stopPropagation(); onSelect(p.node.id); }}>
            <mesh>
              <boxGeometry args={[NODE_W, h, 0.5]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={on ? 0.5 : 0.05} transparent opacity={on ? 1 : 0.3} />
            </mesh>
            <Html position={[p.node.stage === 'snowflake' ? NODE_W : p.node.stage === 'source' ? -NODE_W : NODE_W, 0, 0]}
              distanceFactor={14} style={{ pointerEvents: 'none', transform: p.node.stage === 'source' ? 'translateX(-100%)' : undefined }}>
              <div className={`whitespace-nowrap text-[11px] font-semibold ${on ? 'text-white' : 'text-slate-500'}`}>
                {p.node.label}{!p.node.active && ' (off)'}
              </div>
            </Html>
          </group>
        );
      })}
      {(Object.keys(STAGE_X) as Stage[]).map((s) => (
        <Html key={s} position={[STAGE_X[s], SCALE_H / 2 + 1.4, DEPTH[s]]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-sky-300">{STAGE_LABEL[s]}</div>
        </Html>
      ))}
      <OrbitControls makeDefault enableDamping minDistance={6} maxDistance={45} />
    </Canvas>
  );
}

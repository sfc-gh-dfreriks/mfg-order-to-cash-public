import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import Snowflake3D from './Snowflake3D';
import { type FlowModel, type FlowNode, layout, nodeColor, STAGE_X, STAGE_LABEL, type Stage } from '@/lib/flow3d';

// "Data Factory": sources are machines on the left, conveyors carry data packets through the canonical
// silver tanks and gold marts into the Snowflake hub. Packet count follows rows; hover isolates a node's paths.
interface Props { model: FlowModel; playing: boolean; speed: number; selected: string | null; onSelect: (id: string | null) => void }

function curveFor(a: [number, number, number], b: [number, number, number], lift = 0.6) {
  const mid1 = new THREE.Vector3(a[0] + (b[0] - a[0]) * 0.35, a[1] + lift, a[2] + 0.4);
  const mid2 = new THREE.Vector3(a[0] + (b[0] - a[0]) * 0.65, b[1] + lift, b[2] + 0.4);
  return new THREE.CatmullRomCurve3([new THREE.Vector3(...a), mid1, mid2, new THREE.Vector3(...b)]);
}

function Conveyor({ curve, color, packets, playing, speed, dim, value }: {
  curve: THREE.CatmullRomCurve3; color: string; packets: number; playing: boolean; speed: number; dim: boolean; value: number;
}) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const offsets = useMemo(() => Array.from({ length: packets }, (_, i) => i / packets), [packets]);
  const t = useRef(Math.random());
  const m = useMemo(() => new THREE.Matrix4(), []);
  const radius = 0.018 + Math.min(0.05, Math.log10(1 + value) * 0.009);
  useFrame((_, dt) => {
    if (playing) t.current = (t.current + dt * 0.12 * speed) % 1;
    if (!inst.current) return;
    offsets.forEach((o, i) => {
      const p = curve.getPointAt((t.current + o) % 1);
      m.makeTranslation(p.x, p.y + radius + 0.05, p.z);
      inst.current!.setMatrixAt(i, m);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 64, radius, 8, false]} />
        <meshStandardMaterial color={dim ? '#e2e8f0' : '#94a3b8'} metalness={0.4} roughness={0.5} transparent opacity={dim ? 0.15 : 0.55} />
      </mesh>
      {!dim && (
        <instancedMesh ref={inst} args={[undefined, undefined, packets]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </instancedMesh>
      )}
    </group>
  );
}

function Machine({ node, pos, dim, hovered, onHover, onSelect }: {
  node: FlowNode; pos: [number, number, number]; dim: boolean; hovered: boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const color = nodeColor(node);
  const size = node.stage === 'snowflake' ? 1.4 : 0.5 + Math.min(0.7, Math.log10(1 + node.value) * 0.12);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (node.stage === 'snowflake') ref.current.rotation.y += dt * 0.4;
    const target = hovered ? 1.12 : 1;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
  });
  const handlers = {
    onPointerOver: (e: any) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = 'auto'; },
    onClick: (e: any) => { e.stopPropagation(); onSelect(node.id); },
  };
  const mat = <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} transparent opacity={dim ? 0.3 : 1}
    emissive={hovered ? color : '#000000'} emissiveIntensity={hovered ? 0.35 : 0} />;
  return (
    <group ref={ref} position={pos} {...handlers}>
      {node.stage === 'source' && (
        <>
          <RoundedBox args={[size * 1.6, size, size]} radius={0.08} castShadow>{mat}</RoundedBox>
          {/* hopper on SAP machines, chimney on non-SAP */}
          <mesh position={[-size * 0.4, size * 0.75, 0]} castShadow>
            {node.family === 'SAP' ? <coneGeometry args={[size * 0.35, size * 0.5, 4]} /> : <cylinderGeometry args={[0.08, 0.1, size * 0.6, 12]} />}
            {mat}
          </mesh>
        </>
      )}
      {node.stage === 'object' && (
        <mesh castShadow><cylinderGeometry args={[size * 0.55, size * 0.55, size * 1.2, 24]} />{mat}</mesh>
      )}
      {node.stage === 'mart' && <RoundedBox args={[size, size, size]} radius={0.1} castShadow>{mat}</RoundedBox>}
      {node.stage === 'snowflake' && <Snowflake3D size={size * 1.1} emissive={hovered ? 0.8 : 0.45} />}
      {/* label beside each shape, vertically centred: left of the sources, right of everything else */}
      <Html position={node.stage === 'snowflake' ? [0, -size * 1.3, 0]
          : [node.stage === 'source' ? -(size * 0.8 + 0.15) : (node.stage === 'object' ? size * 0.55 : size / 2) + 0.15, 0, 0]}
        distanceFactor={16} style={{ pointerEvents: 'none', transform: node.stage === 'snowflake' ? 'translate(-50%, 0)'
          : `translate(${node.stage === 'source' ? '-100%' : '0'}, -50%)` }}>
        <div className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[13px] font-bold shadow-sm ${dim
          ? 'border-gray-200 bg-white/70 text-gray-400' : 'border-slate-200 bg-white text-slate-900'}`}>
          {node.label}{!node.active && ' (off)'}
        </div>
      </Html>
    </group>
  );
}

function StageLabels({ height }: { height: number }) {
  return (
    <>
      {(Object.keys(STAGE_X) as Stage[]).map((s) => (
        <Html key={s} position={[STAGE_X[s], height / 2 + 1.2, 0]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap text-sm font-bold uppercase tracking-wide text-slate-600">{STAGE_LABEL[s]}</div>
        </Html>
      ))}
    </>
  );
}

export default function FactoryView({ model, playing, speed, selected, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const pos = useMemo(() => layout(model, 1.7), [model]);
  const focus = hover ?? selected;
  const connected = useMemo(() => {
    if (!focus) return null;
    const keep = new Set([focus]);
    // walk upstream and downstream so the whole path through the factory lights up
    const walk = (dir: 'up' | 'down') => {
      const stack = [focus];
      while (stack.length) {
        const id = stack.pop()!;
        for (const l of model.links) {
          const next = dir === 'down' ? (l.source === id ? l.target : null) : (l.target === id ? l.source : null);
          if (next && !keep.has(next)) { keep.add(next); stack.push(next); }
        }
      }
    };
    walk('up'); walk('down');
    return keep;
  }, [focus, model]);
  const height = Math.max(...[...pos.values()].map((p) => Math.abs(p[1]))) * 2;
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  return (
    <Canvas shadows camera={{ position: [0, 4, 22], fov: 45 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 14, 10]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
      <group position={[0, 0, 0]}>
        {model.links.map((l, i) => {
          const a = pos.get(l.source), b = pos.get(l.target);
          if (!a || !b) return null;
          const src = nodeById.get(l.source)!;
          const dim = !!connected && !(connected.has(l.source) && connected.has(l.target));
          return (
            <Conveyor key={i} curve={curveFor(a, b)} color={nodeColor(src)} value={l.value} dim={dim} playing={playing} speed={speed}
              packets={Math.max(1, Math.min(8, Math.round(Math.log10(1 + l.value) * 1.6)))} />
          );
        })}
        {model.nodes.map((n) => (
          <Machine key={n.id} node={n} pos={pos.get(n.id)!} hovered={hover === n.id || selected === n.id}
            dim={(!!connected && !connected.has(n.id)) || !n.active} onHover={setHover} onSelect={onSelect} />
        ))}
        <StageLabels height={height} />
      </group>
      <ContactShadows position={[0, -height / 2 - 1.4, 0]} opacity={0.35} scale={40} blur={2.5} far={10} />
      <gridHelper args={[48, 48, '#e2e8f0', '#eef2f7']} position={[0, -height / 2 - 1.4, 0]} />
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 1.9} minDistance={8} maxDistance={45} />
    </Canvas>
  );
}

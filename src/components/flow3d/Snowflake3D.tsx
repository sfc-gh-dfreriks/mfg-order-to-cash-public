import { useMemo } from 'react';
import * as THREE from 'three';
import logo from './snowflake_logo.json';

// The Snowflake logo in 3D: outlines traced from snowflake-color.png (six chevrons plus the centre
// diamond and its hole, in a ±1 unit box), extruded with a bevel in the logo's own blue.
function shapesFromLogo() {
  return logo.shapes.map((s) => {
    const shape = new THREE.Shape(s.outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of s.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  });
}

export default function Snowflake3D({ size = 1, color = logo.color, emissive = 0.35 }: { size?: number; color?: string; emissive?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapesFromLogo(), {
      depth: 0.14, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.018, bevelSegments: 3, curveSegments: 8,
    });
    g.center();
    return g;
  }, []);
  return (
    <mesh geometry={geometry} scale={size * 1.1} castShadow>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} metalness={0.35} roughness={0.3} />
    </mesh>
  );
}

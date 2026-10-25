import { Billboard, QuadraticBezierLine, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BridgeLayout, IslandLayout, SkyLinkLayout } from '../../shared/layout';
import { BRIDGE_HALF_WIDTH } from '../../shared/layout';
import { PALETTE } from './palette';

export const FONT = '/fonts/fredoka-600.woff';

// Wooden plank bridge (instanced planks, rope rails, posts) between consecutive islands.
function Bridge({ b }: { b: BridgeLayout }) {
  const planks = useRef<THREE.InstancedMesh>(null);
  const { len, ang, mid, count } = useMemo(() => {
    const dx = b.bx - b.ax;
    const dz = b.bz - b.az;
    const len = Math.hypot(dx, dz);
    return { len, ang: Math.atan2(dz, dx), mid: new THREE.Vector3((b.ax + b.bx) / 2, 0, (b.az + b.bz) / 2), count: Math.ceil(len / 0.55) };
  }, [b]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const sag = -Math.sin(t * Math.PI) * 0.25;
      const wobble = ((i * 7919) % 13) / 13 - 0.5;
      q.setFromEuler(new THREE.Euler(0, -ang + Math.PI / 2 + wobble * 0.06, 0));
      m.compose(new THREE.Vector3(b.ax + (b.bx - b.ax) * t, sag - 0.05, b.az + (b.bz - b.az) * t), q, s);
      planks.current!.setMatrixAt(i, m);
      planks.current!.setColorAt(i, new THREE.Color(i % 3 === 0 ? PALETTE.woodDark : PALETTE.wood).offsetHSL(0, 0, wobble * 0.06));
    }
    planks.current!.instanceMatrix.needsUpdate = true;
    if (planks.current!.instanceColor) planks.current!.instanceColor.needsUpdate = true;
  }, [b, count, ang]);

  const side = (k: number) => new THREE.Vector3(-Math.sin(ang) * k, 0, Math.cos(ang) * k);
  const w = BRIDGE_HALF_WIDTH + 0.1;
  const posts = [0, 1].flatMap((t) => [-1, 1].map((sd) => new THREE.Vector3(b.ax + (b.bx - b.ax) * t, 0, b.az + (b.bz - b.az) * t).add(side(sd * w))));

  return (
    <group>
      <instancedMesh ref={planks} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[BRIDGE_HALF_WIDTH * 2 + 0.3, 0.14, 0.45]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      {posts.map((p, i) => (
        <mesh key={i} position={[p.x, 0.6, p.z]} castShadow>
          <cylinderGeometry args={[0.12, 0.15, 1.4, 6]} />
          <meshStandardMaterial color={PALETTE.woodDark} flatShading />
        </mesh>
      ))}
      {[-1, 1].map((sd) => {
        const a = new THREE.Vector3(b.ax, 1.15, b.az).add(side(sd * w));
        const c = new THREE.Vector3(b.bx, 1.15, b.bz).add(side(sd * w));
        const m = a.clone().lerp(c, 0.5).add(new THREE.Vector3(0, -0.45, 0));
        return <QuadraticBezierLine key={sd} start={a} end={c} mid={m} color="#d9c08c" lineWidth={2.2} />;
      })}
      {b.label && (
        <Billboard position={[mid.x, 2.3, mid.z]}>
          <Text font={FONT} fontSize={0.42} color={PALETTE.cream} outlineWidth={0.04} outlineColor={PALETTE.ink} anchorY="middle" maxWidth={6}>
            {b.label}
          </Text>
        </Billboard>
      )}
      {/* invisible click target for click-to-move */}
      <mesh position={[mid.x, 0, mid.z]} rotation-y={-ang} name="bridge-ground">
        <boxGeometry args={[len, 0.2, BRIDGE_HALF_WIDTH * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Bridges({ bridges }: { bridges: BridgeLayout[] }) {
  return (
    <>
      {bridges.map((b) => (
        <Bridge key={b.id} b={b} />
      ))}
    </>
  );
}

// Relationships that aren't walkable paths: glowing dashed arcs through the sky with a label.
function SkyLink({ l, islands }: { l: SkyLinkLayout; islands: Map<string, IslandLayout> }) {
  const a = islands.get(l.from)!;
  const b = islands.get(l.to)!;
  const ref = useRef<{ material: THREE.LineDashedMaterial & { dashOffset: number } } | null>(null);
  const start = new THREE.Vector3(a.x, 3, a.z);
  const end = new THREE.Vector3(b.x, 3, b.z);
  const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 10 + start.distanceTo(end) * 0.12, 0));
  const apex = start.clone().lerp(end, 0.5).lerp(mid, 0.5);
  useFrame((_, dt) => {
    if (ref.current?.material) ref.current.material.dashOffset -= dt * 1.5;
  });
  return (
    <group>
      <QuadraticBezierLine ref={ref as never} start={start} end={end} mid={mid} color={PALETTE.teal} lineWidth={2.5} dashed dashSize={1.2} gapSize={0.8} transparent opacity={0.85} />
      <Billboard position={[apex.x, apex.y + 0.8, apex.z]}>
        <Text font={FONT} fontSize={0.7} color="#e9fffd" outlineWidth={0.05} outlineColor="#1d4f57" maxWidth={10}>
          {l.label}
        </Text>
      </Billboard>
    </group>
  );
}

export function SkyLinks({ links, islands }: { links: SkyLinkLayout[]; islands: IslandLayout[] }) {
  const map = useMemo(() => new Map(islands.map((i) => [i.id, i])), [islands]);
  return (
    <>
      {links.map((l) => (
        <SkyLink key={l.id} l={l} islands={map} />
      ))}
    </>
  );
}

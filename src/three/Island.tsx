import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DecorKind, DecorLayout, IslandLayout } from '../../shared/layout';
import { hashString, mulberry32 } from '../../shared/rand';
import { occluded } from './occlusion';
import { BIOME_COLORS } from './palette';

// A floating low-poly island: flat walkable grass top, jagged rocky underside, stepping-stone paths.

function islandGeometries(isl: IslandLayout) {
  const rnd = mulberry32(hashString(isl.id + ':geo'));
  const r = isl.radius;
  const seg = 30;

  const top = new THREE.CylinderGeometry(r, r * 0.97, 1.1, seg, 1);
  top.translate(0, -0.55, 0);
  const tp = top.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    if (y < -0.5) {
      const k = 0.94 + rnd() * 0.1;
      tp.setXYZ(i, tp.getX(i) * k, y - rnd() * 0.35, tp.getZ(i) * k);
    }
  }
  top.computeVertexNormals();

  const depth = r * (0.95 + rnd() * 0.25);
  const under = new THREE.ConeGeometry(r * 0.95, depth, seg, 5, true);
  under.rotateX(Math.PI);
  under.translate(0, -1.0 - depth / 2, 0);
  const up = under.attributes.position as THREE.BufferAttribute;
  const c = BIOME_COLORS[isl.kind === 'hub' ? 'hub' : isl.biome];
  const cTop = new THREE.Color(c.under);
  const cBottom = new THREE.Color(c.underDeep);
  const colors: number[] = [];
  const jitter = new Map<string, [number, number, number]>();
  for (let i = 0; i < up.count; i++) {
    const x = up.getX(i);
    const y = up.getY(i);
    const z = up.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!jitter.has(key)) {
      const t = (-1 - y) / depth; // 0 at rim, 1 at tip
      const rim = t < 0.02;
      jitter.set(key, rim ? [1, 0, 1] : [0.8 + rnd() * 0.45, (rnd() - 0.5) * 1.2, 0.8 + rnd() * 0.45]);
    }
    const [kx, dy, kz] = jitter.get(key)!;
    up.setXYZ(i, x * kx, y + dy, z * kz);
    const t = Math.min(1, Math.max(0, (-1 - y) / depth));
    const col = cTop.clone().lerp(cBottom, Math.pow(t, 0.8));
    colors.push(col.r, col.g, col.b);
  }
  under.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  under.computeVertexNormals();

  // Small floating rocks beneath the island.
  const pebbles = Array.from({ length: 4 }, () => {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.6 + rnd() * 0.5);
    return { pos: [Math.cos(a) * d, -depth * (0.5 + rnd() * 0.5), Math.sin(a) * d] as [number, number, number], s: 0.5 + rnd() * 0.9, rot: rnd() * 3 };
  });
  return { top, under, pebbles };
}

function pathStones(isl: IslandLayout) {
  const rnd = mulberry32(hashString(isl.id + ':path'));
  const stones: { x: number; z: number; s: number; rot: number }[] = [];
  for (const ang of [isl.entryAngle, isl.exitAngle]) {
    if (ang === null) continue;
    const len = isl.radius - 1.2;
    for (let d = 2.2; d < len; d += 1.25) {
      const side = (rnd() - 0.5) * 0.5;
      stones.push({ x: Math.cos(ang) * d - Math.sin(ang) * side, z: Math.sin(ang) * d + Math.cos(ang) * side, s: 0.42 + rnd() * 0.18, rot: rnd() * 3 });
    }
  }
  return stones;
}

export function Island({ isl }: { isl: IslandLayout }) {
  const geo = useMemo(() => islandGeometries(isl), [isl]);
  const stones = useMemo(() => pathStones(isl), [isl]);
  useEffect(() => () => {
    geo.top.dispose();
    geo.under.dispose();
  }, [geo]);
  const c = BIOME_COLORS[isl.kind === 'hub' ? 'hub' : isl.biome];
  return (
    <group position={[isl.x, 0, isl.z]}>
      <mesh geometry={geo.top} receiveShadow castShadow name={`ground:${isl.id}`}>
        <meshStandardMaterial attach="material-0" color={c.edge} flatShading roughness={0.95} />
        <meshStandardMaterial attach="material-1" color={c.top} flatShading roughness={0.95} />
        <meshStandardMaterial attach="material-2" color={c.edge} flatShading roughness={0.95} />
      </mesh>
      <mesh geometry={geo.under} castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      {geo.pebbles.map((p, i) => (
        <mesh key={i} position={p.pos} scale={p.s} rotation={[p.rot, p.rot * 2, 0]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={c.underDeep} flatShading roughness={1} />
        </mesh>
      ))}
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.03, s.z]} rotation-y={s.rot} scale={[s.s * 1.3, 1, s.s]} receiveShadow>
          <cylinderGeometry args={[1, 1, 0.08, 7]} />
          <meshStandardMaterial color={c.path} flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

// ---- Decor: curated low-poly nature models, placed deterministically by the layout ----

const DECOR_FILES: Record<DecorKind, { file: string; scale: number }> = {
  fir: { file: 'fir', scale: 0.85 },
  pine: { file: 'pine', scale: 0.62 },
  juniper: { file: 'juniper', scale: 1.1 },
  broadleaf: { file: 'broadleaf', scale: 0.8 },
  blossom: { file: 'blossom', scale: 0.95 },
  bush: { file: 'bush', scale: 0.9 },
  bush_flowering: { file: 'bush_flowering', scale: 1 },
  shrub: { file: 'shrub', scale: 0.8 },
  rocks: { file: 'rocks', scale: 0.9 },
  boulder: { file: 'boulder', scale: 0.7 },
  stump: { file: 'stump', scale: 1.4 },
  grass: { file: 'grass', scale: 1 },
};

function DecorItem({ d, index }: { d: DecorLayout; index: number }) {
  const { file, scale } = DECOR_FILES[d.kind];
  const { scene } = useGLTF(`/models/nature/${file}.glb`);
  const minY = useMemo(() => new THREE.Box3().setFromObject(scene).min.y, [scene]);
  // Own material copies so this item can fade when it blocks the camera.
  const { object, materials } = useMemo(() => {
    const object = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = (m.material as THREE.MeshStandardMaterial).clone();
      materials.push(m.material as THREE.MeshStandardMaterial);
      m.castShadow = d.kind !== 'grass';
      m.receiveShadow = true;
    });
    return { object, materials };
  }, [scene, d.kind]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const opacity = useRef(1);
  useFrame((_, dt) => {
    const target = occluded.current.has(index) ? 0.22 : 1;
    if (Math.abs(opacity.current - target) < 0.005) return;
    opacity.current = THREE.MathUtils.damp(opacity.current, target, 10, dt);
    const fading = opacity.current < 0.98;
    for (const m of materials) {
      if (m.transparent !== fading) {
        m.transparent = fading;
        m.depthWrite = !fading;
        m.needsUpdate = true;
      }
      m.opacity = fading ? opacity.current : 1;
    }
  });
  const s = scale * d.scale;
  return <primitive object={object} position={[d.x, -minY * s - 0.02, d.z]} rotation-y={d.rot} scale={s} />;
}

export function Decor({ items }: { items: DecorLayout[] }) {
  return (
    <>
      {items.map((d, i) => (
        <DecorItem key={i} d={d} index={i} />
      ))}
    </>
  );
}

Object.values(DECOR_FILES).forEach(({ file }) => useGLTF.preload(`/models/nature/${file}.glb`));

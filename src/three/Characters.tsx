import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hashString, mulberry32 } from '../../shared/rand';
import { FONT } from './Bridges';
import { PALETTE } from './palette';
import { Sloth } from './Sloth';

// Pip: a young sloth on a stump with a book, waiting to be taught. A "?" floats until Pip understands.
export function Pip({ understood }: { understood: boolean }) {
  const q = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (q.current) q.current.position.y = 2.35 + Math.sin(clock.elapsedTime * 2) * 0.08;
  });
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.62, 0.6, 9]} />
        <meshStandardMaterial color={PALETTE.wood} flatShading />
      </mesh>
      <group position={[0, 0.55, 0]}>
        <Sloth scale={0.62} wave={!understood} look={{ fur: '#b08a66', furDark: '#8d6c4f', hat: 'flower' }} />
      </group>
      {/* open book in Pip's lap */}
      <group position={[0, 1.05, 0.42]} rotation-x={-0.6}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0.13 * s, 0, 0]} rotation-z={0.15 * -s}>
            <boxGeometry args={[0.25, 0.02, 0.32]} />
            <meshStandardMaterial color={s < 0 ? '#fff8ea' : '#f4ead6'} />
          </mesh>
        ))}
      </group>
      <group ref={q} position={[0.55, 2.35, 0]}>
        <Billboard>
          <Text font={FONT} fontSize={0.55} color={understood ? '#c9f7d4' : '#ffe08a'} outlineWidth={0.05} outlineColor={PALETTE.ink}>
            {understood ? '!' : '?'}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

// Professor Hoot: a round owl in glasses on a perch.
export function Owl() {
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (head.current) head.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.12;
  });
  const m = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#8a7aa8', roughness: 0.85 }),
      belly: new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: 0.9 }),
      eye: new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.4 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#1b1b22', roughness: 0.2 }),
      beak: new THREE.MeshStandardMaterial({ color: '#f0a830', roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: '#3a2a20', metalness: 0.4, roughness: 0.4 }),
      wood: new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, flatShading: true }),
    }),
    [],
  );
  return (
    <group>
      <mesh material={m.wood} position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 1.4, 6]} />
      </mesh>
      <mesh material={m.wood} position={[0, 1.4, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 1.1, 6]} />
      </mesh>
      <group position={[0, 1.95, 0]}>
        <mesh material={m.body} scale={[1, 1.15, 0.9]} castShadow>
          <sphereGeometry args={[0.45, 18, 14]} />
        </mesh>
        <mesh material={m.belly} position={[0, -0.08, 0.26]} scale={[0.75, 0.9, 0.4]}>
          <sphereGeometry args={[0.38, 16, 12]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.body} position={[0.43 * s, -0.05, 0]} rotation-z={0.25 * s} scale={[0.35, 0.9, 0.7]} castShadow>
            <sphereGeometry args={[0.35, 12, 10]} />
          </mesh>
        ))}
        <group ref={head} position={[0, 0.55, 0.02]}>
          <mesh material={m.body} castShadow>
            <sphereGeometry args={[0.38, 18, 14]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh material={m.body} position={[0.24 * s, 0.33, 0]} rotation-z={-0.4 * s}>
                <coneGeometry args={[0.09, 0.26, 6]} />
              </mesh>
              <mesh material={m.eye} position={[0.15 * s, 0.03, 0.3]} scale={[1, 1, 0.5]}>
                <sphereGeometry args={[0.13, 14, 10]} />
              </mesh>
              <mesh material={m.pupil} position={[0.15 * s, 0.03, 0.37]}>
                <sphereGeometry args={[0.055, 10, 8]} />
              </mesh>
              <mesh material={m.glass} position={[0.15 * s, 0.03, 0.37]}>
                <torusGeometry args={[0.14, 0.015, 6, 20]} />
              </mesh>
            </group>
          ))}
          <mesh material={m.beak} position={[0, -0.1, 0.36]} rotation-x={Math.PI / 2 + 0.3}>
            <coneGeometry args={[0.06, 0.16, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// Review Grove: a little tree hung with lanterns; one lantern glows per challenge ready to recall.
export function ReviewGrove({ due }: { due: number }) {
  const lanterns = useMemo(() => {
    const r = mulberry32(42);
    return Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      return [Math.cos(a) * (0.8 + r() * 0.3), 2.0 + r() * 0.9, Math.sin(a) * (0.8 + r() * 0.3)] as [number, number, number];
    });
  }, []);
  const glow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    glow.current?.children.forEach((c, i) => {
      const lit = i < due;
      c.scale.setScalar(lit ? 1 + Math.sin(clock.elapsedTime * 2 + i) * 0.08 : 0.8);
    });
  });
  return (
    <group>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 2.2, 7]} />
        <meshStandardMaterial color={PALETTE.wood} flatShading />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <icosahedronGeometry args={[1.25, 0]} />
        <meshStandardMaterial color="#7fb069" flatShading />
      </mesh>
      <group ref={glow}>
        {lanterns.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color={i < due ? '#ffd27a' : '#c9c0b0'} emissive={i < due ? '#ffb347' : '#000'} emissiveIntensity={i < due ? 1.4 : 0} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Word Bridge station: a small stone tablet with gaps and a floating word tile.
export function WordTablet({ done }: { done: boolean }) {
  const tile = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (tile.current) tile.current.position.y = done ? 1.25 : 1.75 + Math.sin(clock.elapsedTime * 1.6) * 0.1;
  });
  return (
    <group>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[1.4, 1.3, 0.22]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading />
      </mesh>
      {[0.95, 0.65, 0.35].map((y, i) => (
        <mesh key={i} position={[i === 1 ? 0.2 : -0.1, y, 0.12]}>
          <boxGeometry args={[i === 1 ? 0.5 : 0.9, 0.08, 0.02]} />
          <meshStandardMaterial color={PALETTE.stoneDark} />
        </mesh>
      ))}
      <mesh ref={tile} position={[0.25, 1.75, 0.15]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.08]} />
        <meshStandardMaterial color={done ? PALETTE.positive : PALETTE.amber} emissive={done ? '#2f8f4e' : PALETTE.amberDeep} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

// Flowers that grow around a challenge once it's solved: the world blooms as you learn.
export function Bloom({ seed, radius }: { seed: string; radius: number }) {
  const flowers = useMemo(() => {
    const r = mulberry32(hashString(seed));
    const colors = ['#f28fb0', '#ffd166', '#ffffff', '#c3a6ff', '#ff9f80'];
    return Array.from({ length: 7 }, () => {
      const a = r() * Math.PI * 2;
      const d = radius + 0.5 + r() * 0.9;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, c: colors[Math.floor(r() * colors.length)], s: 0.7 + r() * 0.5 };
    });
  }, [seed, radius]);
  const g = useRef<THREE.Group>(null);
  const grow = useRef(0);
  useFrame((_, dt) => {
    if (!g.current || grow.current >= 1) return;
    grow.current = Math.min(1, grow.current + dt * 0.7); // grow slowly
    g.current.scale.setScalar(grow.current);
  });
  return (
    <group ref={g} scale={0}>
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} scale={f.s}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.015, 0.02, 0.36, 4]} />
            <meshStandardMaterial color="#4f8a4b" />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <icosahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color={f.c} flatShading emissive={f.c} emissiveIntensity={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// A soft beam of light over the next challenge to try.
export function Beacon() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.22 + Math.sin(clock.elapsedTime * 2.2) * 0.08;
  });
  return (
    <mesh ref={ref} position={[0, 6, 0]}>
      <cylinderGeometry args={[0.35, 0.9, 12, 16, 1, true]} />
      <meshBasicMaterial color="#ffe6a8" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

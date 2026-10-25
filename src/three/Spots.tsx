import { Billboard, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Station, World } from '../../shared/blueprint';
import type { SpotLayout, WorldLayout } from '../../shared/layout';
import { interact, STATION_NAMES } from '../interact';
import { dueReviews, findStation, nextStep, useStore } from '../store';
import { Beacon, Bloom, Owl, Pip, ReviewGrove, WordTablet } from './Characters';
import { FONT } from './Bridges';
import { LossValley, NetworkSculpture, NeuronMachine } from './Labs';
import { PALETTE } from './palette';

// Interactive objects placed by the layout. Each one maps a validated station type to a fixed component.

const click = (id: string) => (e: ThreeEvent<MouseEvent>) => {
  if (e.delta > 6 || useStore.getState().overview) return;
  e.stopPropagation();
  interact(id);
};

const hover = {
  onPointerOver: () => (document.body.style.cursor = 'pointer'),
  onPointerOut: () => (document.body.style.cursor = ''),
};

// Pulsing ring on the ground when the sloth is close enough to interact.
function NearRing({ id, radius }: { id: string; radius: number }) {
  const near = useStore((s) => s.nearSpot === id);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.05);
  });
  if (!near) return null;
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
      <ringGeometry args={[radius + 0.15, radius + 0.38, 40]} />
      <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

function Label({ text, y, done, color = PALETTE.cream }: { text: string; y: number; done?: boolean; color?: string }) {
  return (
    <Billboard position={[0, y, 0]}>
      <Text font={FONT} fontSize={0.36} color={done ? '#c9f7d4' : color} outlineWidth={0.035} outlineColor={PALETTE.ink} anchorY="bottom" maxWidth={5} textAlign="center">
        {done ? `${text} · solved` : text}
      </Text>
    </Billboard>
  );
}

function Pedestal({ color = PALETTE.stone }: { color?: string }) {
  return (
    <>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.75, 0.9, 0.5, 8]} />
        <meshStandardMaterial color={color} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.62, 0.3, 8]} />
        <meshStandardMaterial color={PALETTE.stoneDark} flatShading roughness={0.9} />
      </mesh>
    </>
  );
}

function Gem({ color, done }: { color: string; done: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.8;
    ref.current.position.y = 1.55 + Math.sin(clock.elapsedTime * 1.8) * 0.1;
  });
  return (
    <mesh ref={ref} position={[0, 1.55, 0]} castShadow>
      <octahedronGeometry args={[0.42, 0]} />
      <meshStandardMaterial color={done ? PALETTE.positive : color} emissive={done ? '#2f8f4e' : color} emissiveIntensity={0.45} flatShading roughness={0.3} />
    </mesh>
  );
}

function ScaleOfTruth({ done }: { done: boolean }) {
  const beam = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (beam.current) beam.current.rotation.z = done ? 0 : Math.sin(clock.elapsedTime * 1.2) * 0.18;
  });
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 1.6, 6]} />
        <meshStandardMaterial color={PALETTE.woodDark} flatShading />
      </mesh>
      <group ref={beam} position={[0, 1.7, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.08, 0.08]} />
          <meshStandardMaterial color={PALETTE.amberDeep} metalness={0.4} roughness={0.4} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.85 * s, -0.45, 0]}>
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 0.45, 4]} />
              <meshStandardMaterial color="#444" />
            </mesh>
            <mesh castShadow>
              <cylinderGeometry args={[0.32, 0.22, 0.08, 10]} />
              <meshStandardMaterial color={s < 0 ? PALETTE.positive : PALETTE.coral} metalness={0.3} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.1, 8]} />
        <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
      </mesh>
    </group>
  );
}

function SequenceStones({ n, done }: { n: number; done: boolean }) {
  return (
    <group>
      {Array.from({ length: Math.min(n, 5) }, (_, i) => {
        const a = (i / 5) * Math.PI * 1.2 - 0.6;
        return (
          <group key={i} position={[Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7 - 0.2]}>
            <mesh position={[0, 0.2 + i * 0.22, 0]} castShadow>
              <cylinderGeometry args={[0.3, 0.34, 0.4 + i * 0.44, 7]} />
              <meshStandardMaterial color={done ? '#9fe0b0' : i % 2 ? PALETTE.stone : '#c4b8a6'} flatShading />
            </mesh>
            <Billboard position={[0, 0.55 + i * 0.44, 0]}>
              <Text font={FONT} fontSize={0.28} color={PALETTE.ink}>
                {String(i + 1)}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

function PairingTotems({ done }: { done: boolean }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.55 * s, 0.8, 0]} castShadow>
          <boxGeometry args={[0.38, 1.6, 0.38]} />
          <meshStandardMaterial color={s < 0 ? '#c99b6d' : '#8fb7c9'} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 0.75, 6]} />
        <meshStandardMaterial color={done ? PALETTE.positive : PALETTE.teal} emissive={done ? PALETTE.positive : PALETTE.teal} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Lectern({ page }: { page?: number }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.3, 1.1, 0.3]} />
        <meshStandardMaterial color={PALETTE.wood} flatShading />
      </mesh>
      <group position={[0, 1.15, 0.05]} rotation-x={-0.5}>
        <mesh castShadow>
          <boxGeometry args={[0.95, 0.06, 0.65]} />
          <meshStandardMaterial color={PALETTE.woodDark} flatShading />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0.22 * s, 0.05, 0]} rotation-z={0.08 * -s}>
            <boxGeometry args={[0.42, 0.04, 0.56]} />
            <meshStandardMaterial color="#fffaf0" />
          </mesh>
        ))}
      </group>
      {page !== undefined && <Label text={`Source · p. ${page}`} y={1.75} color="#ffe9b8" />}
    </group>
  );
}

function Monument({ support, name }: { support: string; name: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const crystal = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.5;
    if (crystal.current) crystal.current.position.y = 3.3 + Math.sin(clock.elapsedTime) * 0.15;
  });
  const color = support === 'source' ? PALETTE.teal : support === 'interpretation' ? PALETTE.amber : PALETTE.coral;
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.8, 0.8, 8]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.9, 1.4, 6]} />
        <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
      </mesh>
      <mesh ref={crystal} position={[0, 3.3, 0]} castShadow>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} flatShading roughness={0.25} />
      </mesh>
      <mesh ref={ring} position={[0, 3.3, 0]} rotation-x={Math.PI / 2.4}>
        <torusGeometry args={[1.4, 0.04, 6, 40]} />
        <meshStandardMaterial color={PALETTE.cream} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <Billboard position={[0, 4.9, 0]}>
        <Text font={FONT} fontSize={0.62} color={PALETTE.cream} outlineWidth={0.05} outlineColor={PALETTE.ink} maxWidth={8} textAlign="center" anchorY="bottom">
          {name}
        </Text>
      </Billboard>
    </group>
  );
}

function GuideBoard({ title }: { title: string }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.9 * s, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 1.8, 6]} />
          <meshStandardMaterial color={PALETTE.woodDark} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.55, 0.02]} castShadow>
        <boxGeometry args={[2.3, 1.1, 0.12]} />
        <meshStandardMaterial color={PALETTE.wood} flatShading />
      </mesh>
      <Text font={FONT} position={[0, 1.72, 0.1]} fontSize={0.2} color={PALETTE.cream} maxWidth={2.1} textAlign="center" anchorY="middle">
        {'Welcome to'}
      </Text>
      <Text font={FONT} position={[0, 1.42, 0.1]} fontSize={0.2} color="#ffe2a8" maxWidth={2.1} textAlign="center" anchorY="middle">
        {title.length > 40 ? title.slice(0, 38) + '…' : title}
      </Text>
    </group>
  );
}

function StationObject({ station, done }: { station: Station; done: boolean }) {
  switch (station.type) {
    case 'quiz':
      return (
        <>
          <Pedestal />
          <Gem color={PALETTE.amber} done={done} />
        </>
      );
    case 'claim_check':
      return <ScaleOfTruth done={done} />;
    case 'ordering':
      return <SequenceStones n={station.items.length} done={done} />;
    case 'matching':
      return <PairingTotems done={done} />;
    case 'cloze':
      return <WordTablet done={done} />;
    case 'teach_back':
      return <Pip understood={done} />;
    case 'neuron_lab':
      return <NeuronMachine />;
    case 'network_lab':
      return <NetworkSculpture />;
    case 'loss_lab':
      return <LossValley />;
  }
}

function Spot({ spot, world, layout, compact }: { spot: SpotLayout; world: World; layout: WorldLayout; compact: boolean }) {
  const done = useStore((s) => !!s.progress.completed[spot.id]);
  const isNext = useStore((s) => !compact && s.world === world && s.layout === layout && nextStep(world, layout, s.progress)?.stationId === spot.id);
  const due = useStore((s) => (spot.kind === 'review' && s.world ? dueReviews(s.world, s.progress).length : 0));
  const isl = layout.islands.find((i) => i.id === spot.islandId)!;
  let body: React.ReactNode = null;
  let label: React.ReactNode = null;
  let rotation = spot.facing;

  if (spot.kind === 'guide') body = <GuideBoard title={world.blueprint.title} />;
  else if (spot.kind === 'hoot') {
    body = <Owl />;
    label = <Label text="Professor Hoot" y={3.2} />;
  } else if (spot.kind === 'review') {
    body = <ReviewGrove due={due} />;
    label = <Label text={due ? `Review Grove · ${due} ready` : 'Review Grove'} y={4.2} color={due ? '#ffe08a' : PALETTE.cream} />;
  }
  else if (spot.kind === 'landmark' || spot.kind === 'source') {
    const loc = world.blueprint.locations.find((l) => l.id === spot.islandId)!;
    const concept = world.blueprint.concepts.find((c) => c.id === loc.conceptId)!;
    body = spot.kind === 'landmark' ? <Monument support={concept.support} name={loc.title} /> : <Lectern page={concept.sourceRefs[0]?.page} />;
  } else {
    const st = findStation(world, spot.id);
    if (!st) return null;
    body = <StationObject station={st.station} done={done} />;
    if (st.station.type.endsWith('_lab')) {
      // Orient the machine so it reads left-to-right for a learner arriving over the bridge.
      const theta = (isl.entryAngle ?? 0) + Math.PI;
      rotation = -theta - Math.PI / 2;
      label = <Label text={STATION_NAMES[st.station.type]} y={st.station.type === 'loss_lab' ? 6.4 : 6.4} done={done} />;
    } else label = <Label text={st.station.type === 'teach_back' ? (done ? 'Pip' : 'Pip · teach me!') : STATION_NAMES[st.station.type]} y={st.station.type === 'teach_back' ? 2.9 : 2.3} done={done} />;
  }

  return (
    <group position={[spot.x, 0, spot.z]}>
      <group rotation-y={rotation} onClick={click(spot.id)} {...hover}>
        {body}
      </group>
      {!compact && label}
      {!compact && <NearRing id={spot.id} radius={spot.blockRadius} />}
      {done && <Bloom seed={spot.id} radius={spot.blockRadius} />}
      {isNext && !done && <Beacon />}
    </group>
  );
}

export function Spots({ world, layout, compact = false }: { world: World; layout: WorldLayout; compact?: boolean }) {
  return (
    <>
      {layout.spots.map((s) => (
        <Spot key={s.id} spot={s} world={world} layout={layout} compact={compact} />
      ))}
    </>
  );
}

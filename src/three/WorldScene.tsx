import { AdaptiveDpr, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { World } from '../../shared/blueprint';
import { isWalkable, layoutWorld, type WorldLayout } from '../../shared/layout';
import { interact } from '../interact';
import { useStore } from '../store';
import { Bridges, SkyLinks } from './Bridges';
import { Atmosphere, Lights } from './Environment';
import { Decor, Island } from './Island';
import { Player, playerPos, walkTo } from './Player';
import { Sloth } from './Sloth';
import { Spots } from './Spots';

// Landing-page camera: a slow orbit around the whole world.
function PreviewCamera({ layout }: { layout: WorldLayout }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(layout.center.x, 0, layout.center.z));
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime * 0.045 + 0.6;
    const r = layout.extent * 0.92 + 12;
    const target = new THREE.Vector3(layout.center.x + Math.sin(t) * r, layout.extent * 0.38 + 9, layout.center.z + Math.cos(t) * r);
    camera.position.lerp(target, 1 - Math.exp(-dt * 1.5));
    look.current.lerp(new THREE.Vector3(layout.center.x - Math.cos(t) * 6, -2, layout.center.z + Math.sin(t) * 6), 1 - Math.exp(-dt * 1.5));
    camera.lookAt(look.current);
  });
  return null;
}

function Ground({ layout, children }: { layout: WorldLayout; children: React.ReactNode }) {
  // Click on the ground: walk there, or (in the map overview) travel to that island.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    const s = useStore.getState();
    const p = e.point;
    if (s.overview) {
      const isl = layout.islands.find((i) => Math.hypot(p.x - i.x, p.z - i.z) < i.radius + 1);
      if (!isl) return;
      const spot = isl.kind === 'hub' ? layout.spots.find((sp) => sp.id === 'hub:guide') : layout.spots.find((sp) => sp.islandId === isl.id && (sp.kind === 'landmark' || sp.blockRadius > 2));
      if (spot) s.travelTo(spot.id);
      return;
    }
    if (s.panel && s.panel.kind !== 'guide') return;
    if (isWalkable(p.x, p.z, layout, 0.2)) walkTo(p.x, p.z, layout);
  };
  return <group onClick={onClick}>{children}</group>;
}

function WorldContent({ world, mode }: { world: World; mode: 'preview' | 'play' }) {
  const storeLayout = useStore((s) => s.layout);
  const layout = useMemo(() => (mode === 'play' && storeLayout ? storeLayout : layoutWorld(world.blueprint)), [mode, storeLayout, world]);
  const follow = useRef<THREE.Vector3 | null>(playerPos.current);
  return (
    <>
      <Atmosphere center={layout.center} extent={layout.extent} />
      <Lights follow={mode === 'play' ? follow : undefined} />
      <Ground layout={layout}>
        {layout.islands.map((i) => (
          <Island key={i.id} isl={i} />
        ))}
        <Bridges bridges={layout.bridges} />
      </Ground>
      <SkyLinks links={layout.links} islands={layout.islands} />
      <Decor items={layout.decor} />
      <Spots world={world} layout={layout} compact={mode === 'preview'} />
      {mode === 'play' ? (
        <Player layout={layout} />
      ) : (
        <>
          <PreviewCamera layout={layout} />
          <group position={[layout.spawn.x, 0, layout.spawn.z]} rotation-y={layout.spawn.facing + Math.PI * 0.85}>
            <Sloth wave />
          </group>
        </>
      )}
    </>
  );
}

function LoadingReporter() {
  const { active, progress } = useProgress();
  useEffect(() => {
    document.body.dataset.sceneLoading = active ? String(Math.round(progress)) : 'done';
  }, [active, progress]);
  return null;
}

export function WorldScene({ world, mode }: { world: World; mode: 'preview' | 'play' }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 50, near: 0.3, far: 900, position: [40, 40, 60] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        // Low-memory machines can lose the WebGL context; tell the app so it can offer a reload.
        gl.domElement.addEventListener('webglcontextlost', () => window.dispatchEvent(new Event('slothworld:gl-lost')));
        gl.domElement.addEventListener('webglcontextrestored', () => window.dispatchEvent(new Event('slothworld:gl-restored')));
      }}
    >
      <LoadingReporter />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <WorldContent key={world.blueprint.id + mode} world={world} mode={mode} />
      </Suspense>
    </Canvas>
  );
}

// Exposed for automated end-to-end checks.
declare global {
  interface Window {
    __slothworld?: { store: typeof useStore; player: typeof playerPos; interact: typeof interact };
  }
}
window.__slothworld = { store: useStore, player: playerPos, interact };

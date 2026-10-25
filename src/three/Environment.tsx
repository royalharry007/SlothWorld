import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../../shared/rand';
import { PALETTE } from './palette';

// Gradient sky dome, warm sun, soft fog, a sea of clouds below the floating islands.

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const skyFrag = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -h));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

export const SUN_DIR = new THREE.Vector3(0.55, 0.42, 0.35).normalize();

export function Sky() {
  const uniforms = useMemo(
    () => ({
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
      sunDir: { value: SUN_DIR },
      sunColor: { value: new THREE.Color('#fff1d6') },
    }),
    [],
  );
  return (
    <mesh scale={400} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial uniforms={uniforms} vertexShader={skyVert} fragmentShader={skyFrag} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

// The sun's shadow camera follows a target so shadows stay crisp near the player.
export function Lights({ follow }: { follow?: React.RefObject<THREE.Vector3 | null> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    const t = follow?.current;
    if (!l || !t) return;
    l.position.set(t.x + SUN_DIR.x * 60, SUN_DIR.y * 60, t.z + SUN_DIR.z * 60);
    l.target.position.set(t.x, 0, t.z);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 1.25]} />
      <directionalLight
        ref={light}
        color={PALETTE.sun}
        intensity={2.6}
        position={[SUN_DIR.x * 60, SUN_DIR.y * 60, SUN_DIR.z * 60]}
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
    </>
  );
}

function CloudField({ center, extent }: { center: { x: number; z: number }; extent: number }) {
  const { scene } = useGLTF('/models/nature/cloud.glb');
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const r = mulberry32(7);
    const base = scene.children[0] as THREE.Mesh;
    const geo = base.geometry ?? (scene.getObjectByProperty('isMesh', true) as THREE.Mesh).geometry;
    const mat = new THREE.MeshStandardMaterial({ color: '#fff7f0', roughness: 1, flatShading: true, emissive: '#f6d7c4', emissiveIntensity: 0.25 });
    const list: { geo: THREE.BufferGeometry; pos: [number, number, number]; scale: number; rot: number; speed: number }[] = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.3;
      const d = extent + 26 + r() * 60;
      const low = i % 3 === 0;
      list.push({
        geo,
        pos: [center.x + Math.cos(a) * d, low ? -18 - r() * 10 : -2 + r() * 16, center.z + Math.sin(a) * d],
        scale: low ? 4 + r() * 3 : 2 + r() * 2.5,
        rot: r() * Math.PI,
        speed: 0.2 + r() * 0.4,
      });
    }
    return { list, mat };
  }, [scene, center.x, center.z, extent]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x += clouds.list[i].speed * dt;
      if (c.position.x > center.x + extent + 90) c.position.x -= 2 * (extent + 90);
    });
  });

  return (
    <group ref={group}>
      {clouds.list.map((c, i) => (
        <mesh key={i} geometry={c.geo} material={clouds.mat} position={c.pos} scale={c.scale} rotation-y={c.rot} />
      ))}
    </group>
  );
}

export function Atmosphere({ center, extent }: { center: { x: number; z: number }; extent: number }) {
  return (
    <>
      <fog attach="fog" args={[PALETTE.fog, 70, 260]} />
      <Sky />
      {/* sea of clouds far below */}
      <mesh rotation-x={-Math.PI / 2} position={[center.x, -34, center.z]}>
        <circleGeometry args={[340, 48]} />
        <meshBasicMaterial color={PALETTE.fog} />
      </mesh>
      <CloudField center={center} extent={extent} />
    </>
  );
}

useGLTF.preload('/models/nature/cloud.glb');

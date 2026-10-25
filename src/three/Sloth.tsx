import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';

// Procedural sloth mascot. `walk` (0..1) blends the walk cycle in; idle breathes and blinks.

export interface SlothHandle {
  setWalk: (v: number) => void;
}

const FUR = '#8c6b4f';
const FUR_DARK = '#6f523c';
const FACE = '#efdcbc';
const PATCH = '#4a3427';
const CLAW = '#f3e6cc';

export interface SlothLook {
  fur?: string;
  furDark?: string;
  hat?: 'leaf' | 'flower';
}

export const Sloth = forwardRef<SlothHandle, { scale?: number; wave?: boolean; look?: SlothLook }>(function Sloth({ scale = 1, wave = false, look }, ref) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const walk = useRef(0);
  const phase = useRef(0);
  const blink = useRef(2 + Math.random() * 3);

  useImperativeHandle(ref, () => ({ setWalk: (v) => (walk.current = v) }), []);

  const m = useMemo(
    () => ({
      fur: new THREE.MeshStandardMaterial({ color: look?.fur ?? FUR, roughness: 0.9 }),
      furDark: new THREE.MeshStandardMaterial({ color: look?.furDark ?? FUR_DARK, roughness: 0.9 }),
      face: new THREE.MeshStandardMaterial({ color: FACE, roughness: 0.8 }),
      patch: new THREE.MeshStandardMaterial({ color: PATCH, roughness: 0.7 }),
      eye: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2 }),
      shine: new THREE.MeshBasicMaterial({ color: '#fff' }),
      claw: new THREE.MeshStandardMaterial({ color: CLAW, roughness: 0.6 }),
      leaf: new THREE.MeshStandardMaterial({ color: look?.hat === 'flower' ? '#f28fb0' : '#6dbb5a', roughness: 0.7, flatShading: true }),
      nose: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.4 }),
      blush: new THREE.MeshStandardMaterial({ color: '#f2a58e', roughness: 0.9, transparent: true, opacity: 0.7 }),
    }),
    [look?.fur, look?.furDark, look?.hat],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const w = walk.current;
    phase.current += dt * (2.2 + w * 5.5);
    const p = phase.current;
    if (body.current) {
      body.current.position.y = 0.02 * Math.sin(t * 1.6) + w * Math.abs(Math.sin(p)) * 0.08;
      body.current.rotation.z = Math.sin(p) * 0.06 * w;
      body.current.scale.set(1 + 0.012 * Math.sin(t * 1.6), 1 - 0.012 * Math.sin(t * 1.6), 1);
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.7) * 0.06 * (1 - w);
      head.current.rotation.x = Math.sin(t * 0.9) * 0.03;
    }
    const swing = Math.sin(p) * 0.7 * w;
    if (armL.current) armL.current.rotation.x = swing + 0.05 * Math.sin(t * 1.3);
    if (armR.current) {
      if (wave && w < 0.1) {
        armR.current.rotation.x = -2.6;
        armR.current.rotation.z = 0.35 + Math.sin(t * 3) * 0.35;
      } else {
        armR.current.rotation.x = -swing + 0.05 * Math.sin(t * 1.3 + 1);
        armR.current.rotation.z = 0;
      }
    }
    if (legL.current) legL.current.rotation.x = -swing * 0.8;
    if (legR.current) legR.current.rotation.x = swing * 0.8;
    blink.current -= dt;
    if (eyes.current) {
      const closing = blink.current < 0.12 && blink.current > 0;
      eyes.current.scale.y = closing ? 0.12 : 1;
      if (blink.current <= 0) blink.current = 2.5 + Math.random() * 4;
    }
  });

  const arm = (side: 1 | -1, r: React.RefObject<THREE.Group | null>) => (
    <group ref={r} position={[0.5 * side, 1.12, 0.05]}>
      <mesh material={m.fur} position={[0.06 * side, -0.32, 0.04]} rotation={[0, 0, 0.18 * side]} castShadow>
        <capsuleGeometry args={[0.13, 0.5, 4, 10]} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} material={m.claw} position={[0.12 * side + k * 0.05, -0.7, 0.1]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.03, 0.17, 5]} />
        </mesh>
      ))}
    </group>
  );

  const leg = (side: 1 | -1, r: React.RefObject<THREE.Group | null>) => (
    <group ref={r} position={[0.24 * side, 0.42, 0]}>
      <mesh material={m.furDark} position={[0, -0.2, 0.02]} castShadow>
        <capsuleGeometry args={[0.13, 0.18, 4, 10]} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} material={m.claw} position={[k * 0.05, -0.38, 0.16]} rotation={[1.3, 0, 0]}>
          <coneGeometry args={[0.03, 0.14, 5]} />
        </mesh>
      ))}
    </group>
  );

  return (
    <group ref={root} scale={scale}>
      <group ref={body}>
        <mesh material={m.fur} position={[0, 0.85, 0]} scale={[1, 1.12, 0.88]} castShadow>
          <sphereGeometry args={[0.52, 20, 16]} />
        </mesh>
        <mesh material={m.face} position={[0, 0.8, 0.27]} scale={[0.78, 0.95, 0.45]}>
          <sphereGeometry args={[0.45, 18, 14]} />
        </mesh>
        <group ref={head} position={[0, 1.5, 0.04]}>
          <mesh material={m.fur} castShadow>
            <sphereGeometry args={[0.42, 22, 18]} />
          </mesh>
          <mesh material={m.face} position={[0, -0.04, 0.2]} scale={[1.08, 0.82, 0.62]}>
            <sphereGeometry args={[0.34, 20, 16]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.patch} position={[0.14 * s, 0.01, 0.37]} rotation={[0, 0, -0.42 * s]} scale={[1.55, 0.72, 0.4]}>
              <sphereGeometry args={[0.1, 14, 10]} />
            </mesh>
          ))}
          <group ref={eyes}>
            {[-1, 1].map((s) => (
              <group key={s} position={[0.14 * s, 0.02, 0.41]}>
                <mesh material={m.eye}>
                  <sphereGeometry args={[0.045, 12, 10]} />
                </mesh>
                <mesh material={m.shine} position={[0.015, 0.018, 0.035]}>
                  <sphereGeometry args={[0.014, 8, 6]} />
                </mesh>
              </group>
            ))}
          </group>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.blush} position={[0.22 * s, -0.12, 0.36]} scale={[1, 0.6, 0.3]}>
              <sphereGeometry args={[0.05, 10, 8]} />
            </mesh>
          ))}
          <mesh material={m.nose} position={[0, -0.08, 0.45]} scale={[1.35, 0.85, 0.8]}>
            <sphereGeometry args={[0.055, 12, 10]} />
          </mesh>
          <mesh material={m.nose} position={[0, -0.17, 0.43]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.06, 0.012, 6, 14, Math.PI]} />
          </mesh>
          {/* leaf hat */}
          <group position={[0.08, 0.4, 0]} rotation={[0.2, 0.3, -0.35]}>
            <mesh material={m.leaf} scale={[0.6, 0.08, 1]}>
              <sphereGeometry args={[0.22, 8, 6]} />
            </mesh>
            <mesh material={m.furDark} position={[0, 0, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.12, 5]} />
            </mesh>
          </group>
        </group>
        {arm(-1, armL)}
        {arm(1, armR)}
      </group>
      {leg(-1, legL)}
      {leg(1, legR)}
    </group>
  );
});

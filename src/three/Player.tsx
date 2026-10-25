import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { routeTo, slideMove, type WorldLayout } from '../../shared/layout';
import { useStore } from '../store';
import { DECOR_DIMS, occluded } from './occlusion';
import { Sloth, type SlothHandle } from './Sloth';

// Shared with lights and tests: where the sloth is right now.
export const playerPos = { current: new THREE.Vector3() };
export const moveTarget = { current: null as THREE.Vector3 | null };
// Remaining waypoints after moveTarget (click-to-walk routes across bridges).
export const moveRoute = { current: [] as THREE.Vector3[] };

export function walkTo(x: number, z: number, layout: WorldLayout) {
  const p = playerPos.current;
  const pts = routeTo(p.x, p.z, x, z, layout).map((w) => new THREE.Vector3(w.x, 0, w.z));
  moveTarget.current = pts.shift() ?? null;
  moveRoute.current = pts;
}

const stopWalking = () => {
  moveTarget.current = null;
  moveRoute.current = [];
};

const SPEED = 5.2;

const LAB_FRAMING: Record<string, { dist: number; h: number; y: number; shift: number }> = {
  'neuron-lab': { dist: 12.5, h: 6, y: 2.3, shift: 3.6 },
  'network-lab': { dist: 13, h: 5.6, y: 3.0, shift: 3.8 },
  'loss-lab': { dist: 16.5, h: 8.5, y: 2.8, shift: 4.6 },
};
const INTERACT_RANGE = 2.1; // distance from a spot's edge

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export function Player({ layout }: { layout: WorldLayout }) {
  const group = useRef<THREE.Group>(null);
  const sloth = useRef<SlothHandle>(null);
  const keys = useRef(new Set<string>());
  const facing = useRef(layout.spawn.facing);
  const speed = useRef(0);
  const cam = useRef({ yaw: layout.spawn.facing + Math.PI, pitch: 0.6, dist: 12 });
  const lookAt = useRef(new THREE.Vector3());
  const stuck = useRef(0);
  const { camera, gl } = useThree();

  // Spawn
  useEffect(() => {
    playerPos.current.set(layout.spawn.x, 0, layout.spawn.z);
    facing.current = layout.spawn.facing;
    cam.current.yaw = layout.spawn.facing + Math.PI;
    stopWalking();
    // Keep the camera where it is (e.g. the landing orbit) so it glides into the follow view.
    lookAt.current.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(30));
  }, [layout, camera]);

  // Keyboard movement keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        keys.current.add(k);
        stopWalking();
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Drag to orbit, wheel to zoom
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const pd = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging || useStore.getState().overview) return;
      cam.current.yaw -= (e.clientX - lx) * 0.006;
      cam.current.pitch = THREE.MathUtils.clamp(cam.current.pitch + (e.clientY - ly) * 0.004, 0.18, 1.25);
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.dist = THREE.MathUtils.clamp(cam.current.dist + e.deltaY * 0.01, 5, 24);
    };
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  const lastTeleport = useRef<number | null>(null);
  const tmp = useRef({ v: new THREE.Vector3(), t: new THREE.Vector3(), right: new THREE.Vector3() });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = useStore.getState();
    const pos = playerPos.current;

    // Teleport (travel from the journal / map)
    if (s.teleport && s.teleport.nonce !== lastTeleport.current) {
      lastTeleport.current = s.teleport.nonce;
      pos.set(s.teleport.x, 0, s.teleport.z);
      facing.current = s.teleport.facing;
      cam.current.yaw = s.teleport.facing + Math.PI;
      stopWalking();
    }

    // ---- Movement ----
    const frozen = s.overview || (s.panel !== null && s.panel.kind !== 'guide') || s.journalOpen;
    let mx = 0;
    let mz = 0;
    if (!frozen) {
      const k = keys.current;
      const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      if (f || r) {
        // forward = away from the camera
        const yaw = cam.current.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        mx = fx * f - fz * r;
        mz = fz * f + fx * r;
      } else if (moveTarget.current) {
        const dx = moveTarget.current.x - pos.x;
        const dz = moveTarget.current.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < (moveRoute.current.length ? 0.6 : 0.25)) moveTarget.current = moveRoute.current.shift() ?? null;
        else {
          mx = dx / d;
          mz = dz / d;
        }
      }
    }
    const len = Math.hypot(mx, mz);
    const wantSpeed = len > 0 ? SPEED * (keys.current.has('shift') ? 1.6 : 1) : 0;
    speed.current = THREE.MathUtils.damp(speed.current, wantSpeed, 10, dt);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const targetFacing = Math.atan2(mx, mz);
      const diff = Math.atan2(Math.sin(targetFacing - facing.current), Math.cos(targetFacing - facing.current));
      facing.current += diff * Math.min(1, dt * 12);
      const step = speed.current * dt;
      const next = slideMove(pos.x, pos.z, mx * step, mz * step, layout);
      const moved = Math.hypot(next.x - pos.x, next.z - pos.z);
      if (moveTarget.current && moved < step * 0.2) {
        stuck.current += dt;
        if (stuck.current > 0.6) stopWalking();
      } else stuck.current = 0;
      pos.x = next.x;
      pos.z = next.z;
    }
    sloth.current?.setWalk(Math.min(1, speed.current / SPEED));
    if (group.current) {
      group.current.position.copy(pos);
      group.current.rotation.y = facing.current;
    }

    // ---- Which island / which spot are we near ----
    const isl = layout.islands.find((i) => Math.hypot(pos.x - i.x, pos.z - i.z) < i.radius);
    if (isl) s.enterIsland(isl.id);
    let near: string | null = null;
    let best = Infinity;
    for (const sp of layout.spots) {
      const d = Math.hypot(pos.x - sp.x, pos.z - sp.z) - sp.blockRadius;
      if (d < INTERACT_RANGE && d < best) {
        best = d;
        near = sp.id;
      }
    }
    s.setNearSpot(near);

    // ---- Camera ----
    const { v: camTarget, t: lookTarget, right } = tmp.current;
    const focusSpot = s.panel?.kind === 'station' ? layout.spots.find((sp) => sp.id === (s.panel as { stationId: string }).stationId) : null;
    if (s.overview) {
      camTarget.set(layout.center.x, layout.extent * 1.15 + 22, layout.center.z + layout.extent * 0.85 + 12);
      lookTarget.set(layout.center.x, -4, layout.center.z);
    } else if (focusSpot) {
      const isLab = focusSpot.blockRadius > 2;
      const frame = LAB_FRAMING[focusSpot.id] ?? { dist: 14, h: 6.5, y: 2.6, shift: 4.2 };
      const isl2 = layout.islands.find((i) => i.id === focusSpot.islandId)!;
      // view direction: from the player (or the island entrance for big labs) toward the spot
      let dx = focusSpot.x - pos.x;
      let dz = focusSpot.z - pos.z;
      if (isLab && isl2.entryAngle !== null) {
        dx = -Math.cos(isl2.entryAngle);
        dz = -Math.sin(isl2.entryAngle);
      }
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      right.set(-dz, 0, dx);
      const dist = isLab ? frame.dist : 7;
      const h = isLab ? frame.h : 4.6;
      const shift = window.innerWidth > 900 ? (isLab ? frame.shift : 1.9) : 0;
      // Small stations: step the camera sideways so the sloth doesn't block the line of sight,
      // choosing the side with fewer trees and machines in the way.
      let lateral = isLab ? shift * 0.4 : 3.6;
      if (!isLab) {
        const clutter = (side: number) => {
          const cx = focusSpot.x - dx * dist + right.x * 3.6 * side;
          const cz = focusSpot.z - dz * dist + right.z * 3.6 * side;
          let c = 0;
          for (const d of layout.decor) if (d.blockRadius > 0.4) c += Math.max(0, 3.2 - Math.hypot(cx - d.x, cz - d.z));
          for (const sp of layout.spots) if (sp !== focusSpot) c += Math.max(0, sp.blockRadius + 2.5 - Math.hypot(cx - sp.x, cz - sp.z)) * 2;
          return c;
        };
        if (clutter(-1) < clutter(1)) lateral = -3.6;
      }
      camTarget.set(focusSpot.x - dx * dist + right.x * lateral, h, focusSpot.z - dz * dist + right.z * lateral);
      lookTarget.set(focusSpot.x + right.x * shift, isLab ? frame.y : 1.1, focusSpot.z + right.z * shift);
    } else {
      const c = cam.current;
      const horiz = Math.cos(c.pitch) * c.dist;
      camTarget.set(pos.x + Math.sin(c.yaw) * horiz, 1.2 + Math.sin(c.pitch) * c.dist, pos.z + Math.cos(c.yaw) * horiz);
      lookTarget.set(pos.x, 1.3, pos.z);
    }
    // Never let the camera sink into a big lab machine: lift it over the top instead.
    if (!s.overview) {
      for (const sp of layout.spots) {
        if (sp.blockRadius <= 2 || sp === focusSpot) continue;
        const d = Math.hypot(camTarget.x - sp.x, camTarget.z - sp.z);
        if (d < sp.blockRadius + 2.5) camTarget.y = Math.max(camTarget.y, 9 - d * 0.5);
      }
    }
    const k = 1 - Math.exp(-dt * (s.overview ? 2.5 : 5));
    camera.position.lerp(camTarget, k);
    lookAt.current.lerp(lookTarget, k);
    camera.lookAt(lookAt.current);

    // Fade decor standing between the camera and what we're looking at.
    const set = occluded.current;
    set.clear();
    if (!s.overview) {
      const fx = focusSpot ? focusSpot.x : pos.x;
      const fz = focusSpot ? focusSpot.z : pos.z;
      const ex = camera.position.x - fx;
      const ez = camera.position.z - fz;
      const len2 = ex * ex + ez * ez || 1;
      layout.decor.forEach((d, i) => {
        const dim = DECOR_DIMS[d.kind];
        if (dim.r === 0) return;
        const t = Math.max(0, Math.min(1, ((d.x - fx) * ex + (d.z - fz) * ez) / len2));
        if (t < 0.08) return;
        const dist = Math.hypot(fx + ex * t - d.x, fz + ez * t - d.z);
        const y = 1.2 + (camera.position.y - 1.2) * t;
        if (dist < dim.r * d.scale + 0.3 && y < dim.h * d.scale + 0.3) set.add(i);
      });
    }
  });

  return (
    <group ref={group}>
      <Sloth ref={sloth} scale={1.25} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

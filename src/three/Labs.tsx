import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mse, mseGradient, neuronForward, optimalWeight, predict, SAMPLE_DATA, SAMPLE_NETWORK } from '../../shared/math';
import { useStore } from '../store';
import { FONT } from './Bridges';
import { PALETTE } from './palette';

// 3D visualisations for the curated labs. Local +x is the direction of information flow
// (left to right for the arriving learner); local +z faces the learner.

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
const UP = new THREE.Vector3(0, 1, 0);

function placeBetween(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(thickness, len, thickness);
}

function Tag({ position, text, size = 0.3, color = PALETTE.cream }: { position: [number, number, number]; text: string; size?: number; color?: string }) {
  return (
    <Billboard position={position}>
      <Text font={FONT} fontSize={size} color={color} outlineWidth={size * 0.12} outlineColor={PALETTE.ink} anchorY="middle">
        {text}
      </Text>
    </Billboard>
  );
}

function Platform({ r = 3.3 }: { r?: number }) {
  return (
    <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[r, r + 0.2, 0.24, 10]} />
      <meshStandardMaterial color="#cbbfae" flatShading roughness={0.95} />
    </mesh>
  );
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const lowColor = new THREE.Color('#5d7391');
const highColor = new THREE.Color(PALETTE.amber);

// ---------------- Island 1: Neuron Machine ----------------
export function NeuronMachine() {
  const n = useStore((s) => s.neuron);
  const r = useMemo(() => neuronForward(n.inputs, n.weights, n.bias, n.activation), [n]);
  const out01 = n.activation === 'sigmoid' ? r.output : Math.min(1, r.output / 3);
  const soma = new THREE.Vector3(0.3, 2.1, 0);
  const inputsPos = [-1, 0, 1].map((k) => new THREE.Vector3(-2.7, 1.5, k * 1.45));
  const bulb = new THREE.Vector3(2.8, 2.1, 0);
  const dendrites = useRef<(THREE.Mesh | null)[]>([]);
  const particles = useRef<(THREE.Mesh | null)[]>([]);
  const axon = useRef<THREE.Mesh>(null);
  const somaMesh = useRef<THREE.Mesh>(null);

  useEffect(() => {
    inputsPos.forEach((p, i) => {
      const m = dendrites.current[i];
      if (m) placeBetween(m, p, soma, 0.04 + Math.min(Math.abs(n.weights[i]), 2) * 0.09);
    });
    if (axon.current) placeBetween(axon.current, soma, bulb, 0.08 + out01 * 0.08);
  });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    inputsPos.forEach((p, i) => {
      const flow = r.products[i];
      for (let k = 0; k < 3; k++) {
        const m = particles.current[i * 3 + k];
        if (!m) continue;
        m.visible = Math.abs(flow) > 0.02;
        const u = (t * (0.25 + Math.min(Math.abs(flow), 2) * 0.5) + k / 3) % 1;
        m.position.copy(p).lerp(soma, u);
        m.scale.setScalar(0.06 + Math.min(Math.abs(flow), 2) * 0.05);
      }
    });
    if (somaMesh.current) somaMesh.current.rotation.y = t * 0.3;
  });

  const somaColor = lowColor.clone().lerp(highColor, out01);
  return (
    <group>
      <Platform />
      {inputsPos.map((p, i) => (
        <group key={i}>
          <mesh position={[p.x, p.y / 2, p.z]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, p.y, 6]} />
            <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
          </mesh>
          <mesh position={p} castShadow>
            <sphereGeometry args={[0.18 + n.inputs[i] * 0.22, 16, 12]} />
            <meshStandardMaterial color={PALETTE.amber} emissive={PALETTE.amber} emissiveIntensity={0.15 + n.inputs[i] * 0.7} roughness={0.4} />
          </mesh>
          <mesh ref={(m) => void (dendrites.current[i] = m)} geometry={cylGeo} castShadow>
            <meshStandardMaterial color={n.weights[i] >= 0 ? PALETTE.positive : PALETTE.negative} emissive={n.weights[i] >= 0 ? '#2d7a43' : '#8a2e25'} emissiveIntensity={0.35} roughness={0.5} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} ref={(m) => void (particles.current[i * 3 + k] = m)}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial color={r.products[i] >= 0 ? '#d9ffe2' : '#ffd6cf'} />
            </mesh>
          ))}
          <Tag position={[p.x - 0.1, p.y + 0.75, p.z]} text={`x${i + 1} = ${fmt(n.inputs[i])}`} />
          <Tag position={[(p.x + soma.x) / 2, (p.y + soma.y) / 2 + 0.45, (p.z + soma.z) / 2]} text={`w${i + 1} = ${fmt(n.weights[i])}`} size={0.26} color={n.weights[i] >= 0 ? '#c9f7d4' : '#ffd0c8'} />
        </group>
      ))}
      <mesh ref={somaMesh} position={soma} castShadow>
        <icosahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial color={somaColor} emissive={somaColor} emissiveIntensity={0.25 + out01 * 0.6} flatShading roughness={0.35} />
      </mesh>
      {/* bias crystal */}
      <mesh position={[soma.x, 0.75, 0]} castShadow>
        <octahedronGeometry args={[0.15 + Math.min(Math.abs(n.bias), 3) * 0.12, 0]} />
        <meshStandardMaterial color={n.bias >= 0 ? PALETTE.positive : PALETTE.negative} emissive={n.bias >= 0 ? '#2d7a43' : '#8a2e25'} emissiveIntensity={0.4} flatShading />
      </mesh>
      <Tag position={[soma.x + 1.05, 0.8, 0.4]} text={`b = ${fmt(n.bias)}`} size={0.26} />
      <Tag position={[soma.x, soma.y + 1.45, 0]} text={`z = ${fmt(r.z)}`} size={0.36} />
      <mesh ref={axon} geometry={cylGeo}>
        <meshStandardMaterial color="#f6e7c8" emissive={PALETTE.amber} emissiveIntensity={out01 * 0.8} />
      </mesh>
      <mesh position={bulb} castShadow>
        <sphereGeometry args={[0.55, 20, 16]} />
        <meshStandardMaterial color={new THREE.Color('#5a5f6a').lerp(new THREE.Color('#fff2a8'), out01)} emissive="#ffd25a" emissiveIntensity={out01 * 1.6} roughness={0.2} />
      </mesh>
      <mesh position={[bulb.x, bulb.y / 2 - 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, bulb.y - 0.5, 6]} />
        <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
      </mesh>
      <Tag position={[bulb.x, bulb.y + 1.05, 0]} text={`output = ${r.output.toFixed(3)}`} size={0.38} color="#fff2b8" />
    </group>
  );
}

// ---------------- Island 2: Signal Network ----------------
const LAYER_X = [-3, 0, 3];
// index 0 at the top so "input 1" and "output A" read first
const LAYER_Y = [
  [4.4, 3.0, 1.6],
  [4.9, 3.6, 2.3, 1.0],
  [3.9, 2.1],
];
const PULSE_WINDOWS = [
  [0, 0.9],
  [1.2, 2.1],
];
export const NETWORK_ANIM_SECONDS = 2.5;

export function NetworkSculpture() {
  const net = useStore((s) => s.network);
  const nodes = useRef<(THREE.Mesh | null)[][]>([[], [], []]);
  const edges = useRef<(THREE.Mesh | null)[][]>([[], []]);
  const pulses = useRef<(THREE.Mesh | null)[][]>([[], []]);
  const pos = useMemo(() => LAYER_Y.map((ys, l) => ys.map((y) => new THREE.Vector3(LAYER_X[l], y, 0))), []);

  useEffect(() => {
    SAMPLE_NETWORK.forEach((layer, l) =>
      layer.weights.forEach((row, j) =>
        row.forEach((w, i) => {
          const m = edges.current[l][j * row.length + i];
          if (m) placeBetween(m, pos[l][i], pos[l + 1][j], 0.03 + Math.abs(w) * 0.025);
        }),
      ),
    );
  }, [pos]);

  useFrame(() => {
    const t = net.firedAt === null ? -1 : (performance.now() - net.firedAt) / 1000;
    const tr = net.trace;
    // nodes
    pos.forEach((layer, l) =>
      layer.forEach((_, j) => {
        const m = nodes.current[l][j];
        if (!m) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        let a = 0;
        if (l === 0) a = net.inputs[j];
        else if (tr && t >= (l === 1 ? 0.9 : 2.1)) a = tr.activations[l][j];
        mat.emissiveIntensity = 0.1 + a * 1.1;
        mat.color.copy(lowColor).lerp(highColor, a);
        mat.emissive.copy(mat.color);
        m.scale.setScalar(1 + a * 0.25);
      }),
    );
    // edges + pulses
    SAMPLE_NETWORK.forEach((layer, l) => {
      const [t0, t1] = PULSE_WINDOWS[l];
      layer.weights.forEach((row, j) =>
        row.forEach((_w, i) => {
          const idx = j * row.length + i;
          const c = tr ? tr.contributions[l][j][i] : 0;
          const e = edges.current[l][idx];
          if (e) {
            const mat = e.material as THREE.MeshStandardMaterial;
            const lit = tr && t >= t0 ? Math.min(1, Math.abs(c) / 1.5) : 0;
            mat.emissiveIntensity = 0.05 + lit * 1.2;
            mat.opacity = 0.35 + lit * 0.65;
          }
          const p = pulses.current[l][idx];
          if (p) {
            const active = tr && t >= t0 && t <= t1 && Math.abs(c) > 0.02;
            p.visible = !!active;
            if (active) {
              p.position.copy(pos[l][i]).lerp(pos[l + 1][j], (t - t0) / (t1 - t0));
              p.scale.setScalar(0.07 + Math.min(Math.abs(c), 2) * 0.09);
              (p.material as THREE.MeshBasicMaterial).color.set(c >= 0 ? '#e3ffe9' : '#ffd9d2');
            }
          }
        }),
      );
    });
  });

  const tr = net.trace;
  return (
    <group>
      <Platform r={3.6} />
      {SAMPLE_NETWORK.map((layer, l) =>
        layer.weights.map((row, j) =>
          row.map((w, i) => (
            <group key={`${l}-${j}-${i}`}>
              <mesh ref={(m) => void (edges.current[l][j * row.length + i] = m)} geometry={cylGeo}>
                <meshStandardMaterial color={w >= 0 ? PALETTE.positive : PALETTE.negative} emissive={w >= 0 ? PALETTE.positive : PALETTE.negative} transparent opacity={0.4} />
              </mesh>
              <mesh ref={(m) => void (pulses.current[l][j * row.length + i] = m)} visible={false}>
                <sphereGeometry args={[1, 10, 8]} />
                <meshBasicMaterial color="#fff" />
              </mesh>
            </group>
          )),
        ),
      )}
      {pos.map((layer, l) =>
        layer.map((p, j) => (
          <mesh key={`${l}-${j}`} ref={(m) => void (nodes.current[l][j] = m)} position={p} castShadow>
            <sphereGeometry args={[0.36, 18, 14]} />
            <meshStandardMaterial color={lowColor} emissive={lowColor} flatShading={false} roughness={0.35} />
          </mesh>
        )),
      )}
      {pos[0].map((p, i) => (
        <Tag key={i} position={[p.x - 0.9, p.y, 0]} text={`in ${i + 1}: ${net.inputs[i]}`} size={0.26} />
      ))}
      {pos[2].map((p, j) => (
        <Tag key={j} position={[p.x + 1.05, p.y, 0]} text={`${j === 0 ? 'A' : 'B'}${tr ? ` ${tr.activations[2][j].toFixed(2)}` : ''}`} size={0.34} color="#fff2b8" />
      ))}
      <Tag position={[LAYER_X[0], 5.5, 0]} text="inputs" size={0.26} color="#e8e1d6" />
      <Tag position={[LAYER_X[1], 5.8, 0]} text="hidden layer" size={0.26} color="#e8e1d6" />
      <Tag position={[LAYER_X[2], 5.0, 0]} text="outputs" size={0.26} color="#e8e1d6" />
    </group>
  );
}

// ---------------- Island 3: Loss Valley ----------------
const W_MIN = -0.5;
const W_MAX = 4.5;
const VX = 4.2;
const xOfW = (w: number) => -VX + ((THREE.MathUtils.clamp(w, W_MIN, W_MAX) - W_MIN) / (W_MAX - W_MIN)) * 2 * VX;
const hOfW = (w: number) => Math.min(mse(w) * 0.26, 4.0) + 0.45;

export function LossValley() {
  const loss = useStore((s) => s.loss);
  const ball = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.Group>(null);
  const shown = useRef(loss.w);

  const valleyGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-VX, 0);
    for (let i = 0; i <= 60; i++) {
      const w = W_MIN + (i / 60) * (W_MAX - W_MIN);
      shape.lineTo(xOfW(w), hOfW(w));
    }
    shape.lineTo(VX, 0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -1.1);
    return g;
  }, []);
  useEffect(() => () => valleyGeo.dispose(), [valleyGeo]);

  useFrame((_, dt) => {
    shown.current = THREE.MathUtils.damp(shown.current, loss.w, 6, dt);
    const w = shown.current;
    const out = w < W_MIN || w > W_MAX;
    if (ball.current) {
      ball.current.position.set(xOfW(w), hOfW(w) + 0.36 + (out ? 1.2 : 0), 0.3);
      (ball.current.material as THREE.MeshStandardMaterial).color.set(out || mse(w) > 20 ? PALETTE.coral : '#f4f1ea');
    }
    if (arrow.current) {
      const g = mseGradient(loss.w);
      const dir = -Math.sign(g);
      const len = Math.min(Math.abs(g) * 0.04, 1.6);
      arrow.current.visible = len > 0.05;
      arrow.current.position.set(xOfW(w), hOfW(w) + 1.2, 0.3);
      arrow.current.scale.set(dir, 1, 1);
      arrow.current.children[0].scale.set(1, len, 1);
      arrow.current.children[0].position.x = len / 2;
      arrow.current.children[1].position.x = len + 0.12;
    }
  });

  const wStar = optimalWeight();
  const current = mse(loss.w);
  return (
    <group>
      <Platform r={4.6} />
      <mesh geometry={valleyGeo} castShadow receiveShadow position={[0, 0.2, 0.3]}>
        <meshStandardMaterial color="#d6a774" flatShading roughness={0.9} />
      </mesh>
      {/* minimum marker */}
      <group position={[xOfW(wStar), hOfW(wStar) + 0.2, -0.75]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.2, 5]} />
          <meshStandardMaterial color={PALETTE.woodDark} />
        </mesh>
        <mesh position={[0.22, 1.05, 0]}>
          <boxGeometry args={[0.42, 0.26, 0.02]} />
          <meshStandardMaterial color={PALETTE.teal} emissive={PALETTE.teal} emissiveIntensity={0.4} />
        </mesh>
      </group>
      <mesh ref={ball} castShadow>
        <sphereGeometry args={[0.36, 20, 16]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.3} />
      </mesh>
      <group ref={arrow}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
          <meshBasicMaterial color={PALETTE.amber} />
        </mesh>
        <mesh rotation-z={-Math.PI / 2}>
          <coneGeometry args={[0.14, 0.3, 8]} />
          <meshBasicMaterial color={PALETTE.amber} />
        </mesh>
      </group>
      <Tag position={[0, 6.2, 0]} text={`loss (MSE) = ${current > 999 ? '999+' : current.toFixed(3)}`} size={0.42} color={current < 0.05 ? '#c9f7d4' : '#fff2b8'} />
      <Tag position={[0, 5.6, 0]} text={`weight w = ${loss.w.toFixed(3)}`} size={0.3} />
      <Tag position={[-VX - 0.1, 0.5, 1.5]} text={`w=${W_MIN}`} size={0.22} color="#e8e1d6" />
      <Tag position={[VX + 0.1, 0.5, 1.5]} text={`w=${W_MAX}`} size={0.22} color="#e8e1d6" />
      {/* data: targets vs predictions */}
      {SAMPLE_DATA.map((p, i) => {
        const x = -1.5 + i * 1.0;
        const yhat = predict(loss.w, p.x);
        const hT = p.y * 0.42;
        const hP = THREE.MathUtils.clamp(yhat * 0.42, 0.02, 7);
        return (
          <group key={i} position={[x, 0.24, -2.2]}>
            <mesh position={[-0.2, hT / 2, 0]} castShadow>
              <boxGeometry args={[0.32, hT, 0.32]} />
              <meshStandardMaterial color="#f6ead2" flatShading />
            </mesh>
            <mesh position={[0.2, hP / 2, 0]} castShadow>
              <boxGeometry args={[0.32, hP, 0.32]} />
              <meshStandardMaterial color={PALETTE.amber} transparent opacity={0.85} flatShading />
            </mesh>
            <Tag position={[0, Math.max(hT, hP) + 0.4, 0]} text={`x=${p.x}`} size={0.22} color="#e8e1d6" />
          </group>
        );
      })}
    </group>
  );
}

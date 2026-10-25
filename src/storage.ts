import type { World } from '../shared/blueprint';
import { Blueprint } from '../shared/blueprint';

// Local persistence. Everything stays in this browser; storage failures never break the app.

export interface SavedWorldMeta {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  concepts: number;
}

export interface ReviewItem {
  due: number; // epoch ms when this challenge should come back
  step: number; // position on the spacing ladder
}

export interface Progress {
  completed: Record<string, true>;
  visited: Record<string, true>;
  review: Record<string, ReviewItem>;
}

const K_INDEX = 'slothworld:worlds';
const kWorld = (id: string) => `slothworld:world:${id}`;
const kProgress = (id: string) => `slothworld:progress:${id}`;

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listWorlds(): SavedWorldMeta[] {
  return read<SavedWorldMeta[]>(K_INDEX) ?? [];
}

export function saveWorld(world: World): boolean {
  const bp = world.blueprint;
  if (!write(kWorld(bp.id), world)) return false;
  const meta: SavedWorldMeta = { id: bp.id, title: bp.title, sourceName: bp.meta.sourceName, createdAt: bp.meta.generatedAt, concepts: bp.concepts.length };
  return write(K_INDEX, [meta, ...listWorlds().filter((w) => w.id !== bp.id)].slice(0, 12));
}

// Saved worlds are re-validated on load: localStorage is just another untrusted input.
export function loadWorld(id: string): World | null {
  const w = read<World>(kWorld(id));
  if (!w) return null;
  const parsed = Blueprint.safeParse(w.blueprint);
  if (!parsed.success || !Array.isArray(w.source?.pages)) return null;
  return { blueprint: parsed.data, source: { name: String(w.source.name ?? ''), pages: w.source.pages.map((p) => ({ page: Number(p.page), text: String(p.text ?? '') })) } };
}

export function deleteWorld(id: string) {
  try {
    localStorage.removeItem(kWorld(id));
    localStorage.removeItem(kProgress(id));
  } catch {
    /* ignore */
  }
  write(K_INDEX, listWorlds().filter((w) => w.id !== id));
}

export function loadProgress(id: string): Progress {
  const p = read<Progress>(kProgress(id));
  return { completed: p?.completed ?? {}, visited: p?.visited ?? {}, review: p?.review ?? {} };
}

export function saveProgress(id: string, p: Progress) {
  write(kProgress(id), p);
}

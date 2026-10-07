import { AgentError } from "./types";

/** Spatial filter of map_list: a rectangle, and/or "near a reference" with an optional compass side. */
export interface SpatialFilter {
  rect?: { x0: number; y0: number; x1: number; y1: number };
  near?: { x?: number; y?: number; burg?: number; river?: number };
  within?: number; // largest distance to the reference, in the map's distance unit
  direction?: string; // compass side of the reference: N, NE, E, SE, S, SW, W, NW
}

export type Point = [number, number];

const SPATIAL_KEYS = ["rect", "near", "within", "direction"] as const;
const NEAR_KEYS = ["x", "y", "burg", "river"] as const;
const RECT_KEYS = ["x0", "y0", "x1", "y1"] as const;
// 8 compass sides, clockwise from north: a protocol constant, not a setting.
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const SECTOR_DEGREES = 360 / COMPASS.length;

/** Which kinds can be placed on the map: the points an entry occupies (a city is one, a river is many). */
export const SPATIAL_KINDS = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "burgs",
  "markers",
  "routes",
  "labels",
  "rivers"
] as const;

function finite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new AgentError(`list: ${what} must be a number`);
  return value;
}

/** Checks the shape of the filter; throws a message the AI can act on. */
export function parseSpatial(raw: unknown): SpatialFilter {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new AgentError("list: `spatial` must be an object");
  const spatial = raw as Record<string, unknown>;
  for (const key of Object.keys(spatial))
    if (!(SPATIAL_KEYS as readonly string[]).includes(key))
      throw new AgentError(`list: unknown spatial parameter "${key}". Use ${SPATIAL_KEYS.join(", ")}`);
  const out: SpatialFilter = {};
  if (spatial.rect !== undefined) {
    const r = spatial.rect as Record<string, unknown>;
    if (typeof r !== "object" || r === null) throw new AgentError("list: rect must be {x0, y0, x1, y1} in map units");
    for (const key of Object.keys(r))
      if (!(RECT_KEYS as readonly string[]).includes(key)) throw new AgentError(`list: unknown rect key "${key}"`);
    const [x0, y0, x1, y1] = RECT_KEYS.map(k => finite(r[k], `rect.${k}`));
    out.rect = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  }
  if (spatial.near !== undefined) {
    const n = spatial.near as Record<string, unknown>;
    if (typeof n !== "object" || n === null) throw new AgentError("list: near must be {x, y}, {burg} or {river}");
    for (const key of Object.keys(n))
      if (!(NEAR_KEYS as readonly string[]).includes(key))
        throw new AgentError(`list: unknown near key "${key}". Use x+y, burg or river`);
    const hasPoint = n.x !== undefined || n.y !== undefined;
    const chosen = [hasPoint, n.burg !== undefined, n.river !== undefined].filter(Boolean).length;
    if (chosen !== 1) throw new AgentError("list: near takes exactly one reference: x+y, burg or river");
    if (hasPoint) out.near = { x: finite(n.x, "near.x"), y: finite(n.y, "near.y") };
    else if (n.burg !== undefined) out.near = { burg: finite(n.burg, "near.burg") };
    else out.near = { river: finite(n.river, "near.river") };
  }
  if (spatial.within !== undefined) {
    out.within = finite(spatial.within, "within");
    if (out.within < 0) throw new AgentError("list: within cannot be negative");
    if (!out.near) throw new AgentError("list: `within` needs `near` (the reference it is measured from)");
  }
  if (spatial.direction !== undefined) {
    const d = String(spatial.direction).toUpperCase();
    if (!(COMPASS as readonly string[]).includes(d))
      throw new AgentError(`list: direction must be one of ${COMPASS.join(", ")}`);
    if (!out.near) throw new AgentError("list: `direction` needs `near` (the side is relative to it)");
    out.direction = d;
  }
  if (!out.rect && !out.near) throw new AgentError("list: spatial needs `rect` and/or `near`");
  return out;
}

/** Points of the reference named by `near` (a river is a line, so many points). */
export function referencePoints(near: NonNullable<SpatialFilter["near"]>): Point[] {
  if (near.x !== undefined && near.y !== undefined) return [[near.x, near.y]];
  if (near.burg !== undefined) {
    const burg = pack.burgs[near.burg];
    if (!burg?.i || burg.removed) throw new AgentError(`list: burg ${near.burg} does not exist`);
    return [[burg.x, burg.y]];
  }
  const river = pack.rivers.find(r => r.i === near.river);
  if (!river) throw new AgentError(`list: river ${near.river} does not exist`);
  const points = cellPoints(river.cells ?? []);
  if (!points.length) throw new AgentError(`list: river ${near.river} has no cells`);
  return points;
}

function cellPoints(cells: number[]): Point[] {
  const out: Point[] = [];
  for (const c of cells) {
    const p = pack.cells.p[c];
    if (p) out.push([p[0], p[1]]);
  }
  return out;
}

/** Where an entry of this kind stands on the map; empty when it has no place (an unplaced culture centre...). */
export function pointsOfEntry(kind: string, row: Record<string, unknown>): Point[] {
  const id = row.id as number;
  switch (kind) {
    case "burgs": {
      // exact position, not the rounded one shown in the list
      const burg = pack.burgs[id];
      return burg ? [[burg.x, burg.y]] : [];
    }
    case "markers": {
      const marker = pack.markers.find(m => m.i === id);
      return marker ? [[marker.x, marker.y]] : [];
    }
    case "labels":
      return typeof row.x === "number" && typeof row.y === "number" ? [[row.x, row.y]] : [];
    case "states":
      return cellPoints([pack.states[id]?.center ?? -1]);
    case "provinces":
      return cellPoints([pack.provinces[id]?.center ?? -1]);
    case "cultures":
      return cellPoints([pack.cultures[id]?.center ?? -1]);
    case "religions":
      return cellPoints([pack.religions[id]?.center ?? -1]);
    case "rivers":
      return cellPoints(pack.rivers.find(r => r.i === id)?.cells ?? []);
    case "routes": {
      const route = pack.routes.find(r => r.i === id);
      return (route?.points ?? []).map(p => [p[0], p[1]] as Point);
    }
    default:
      return [];
  }
}

/** Compass side of `to` seen from `from` (north is up the screen: y grows downward). */
export function compassSide(from: Point, to: Point): string {
  const degrees = ((Math.atan2(to[0] - from[0], from[1] - to[1]) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(degrees / SECTOR_DEGREES) % COMPASS.length];
}

export interface SpatialHit {
  distance: number | null; // map's distance unit; null without `near`
  side: string | null; // compass side of the entry seen from the reference
}

/**
 * Decides whether an entry passes the filter. Distance and side are taken between the closest pair of points
 * (reference, entry), so "near the river" means near any bank cell of it.
 */
export function testEntry(
  filter: SpatialFilter,
  reference: Point[] | null,
  distanceScale: number,
  points: Point[]
): SpatialHit | null {
  if (!points.length) return null;
  const { rect } = filter;
  if (rect && !points.some(([x, y]) => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1)) return null;
  if (!reference) return { distance: null, side: null };
  let best = Infinity;
  let from = reference[0];
  let to = points[0];
  for (const a of reference)
    for (const b of points) {
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
      if (d < best) {
        best = d;
        from = a;
        to = b;
      }
    }
  const distance = Math.sqrt(best) * distanceScale;
  if (filter.within !== undefined && distance > filter.within) return null;
  // standing on the reference itself, there is no side
  const side = best === 0 ? null : compassSide(from, to);
  if (filter.direction && side !== filter.direction) return null;
  return { distance, side };
}

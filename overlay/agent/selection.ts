import { config } from "./config";
import { type Bounds, round } from "./geometry";
import { AgentError, type ParamSpecs, type Params } from "./types";
import { validate } from "./validate";

export interface SelectionInfo {
  id: string;
  count: number;
  land: number;
  bounds: Bounds | null;
  byState: Record<number, number>;
  sampleCells: number[];
}

const store = new Map<string, Set<number>>();
let counter = 0;

const COMBINE_OPS = ["add", "subtract", "intersect"] as const;

export const SHAPES: Record<string, { description: string; params: ParamSpecs }> = {
  circle: {
    description: "Cells whose centre is within a radius of a map point",
    params: {
      x: { type: "number", required: true, description: "Centre x (map units)" },
      y: { type: "number", required: true, description: "Centre y (map units)" },
      radius: { type: "number", required: true, min: 1, description: "Radius (map units)" }
    }
  },
  rect: {
    description: "Cells whose centre is inside a rectangle",
    params: {
      x0: { type: "number", required: true, description: "Left (map units)" },
      y0: { type: "number", required: true, description: "Top (map units)" },
      x1: { type: "number", required: true, description: "Right (map units)" },
      y1: { type: "number", required: true, description: "Bottom (map units)" }
    }
  },
  polygon: {
    description: "Cells whose centre is inside a polygon",
    params: { points: { type: "points", required: true, description: "[[x, y], ...] in map units" } }
  },
  cells: {
    description: "An explicit list of cell ids",
    params: { cells: { type: "integers", required: true, description: "Cell ids" } }
  },
  state: {
    description: "All cells of a state (0 = unclaimed land)",
    params: { state: { type: "integer", required: true, min: 0, description: "State id" } }
  },
  province: {
    description: "All cells of a province",
    params: { province: { type: "integer", required: true, min: 1, description: "Province id" } }
  },
  border: {
    description:
      "`depth` layers of cells of state `from` (0 = unclaimed land), counted inward from its border with state `to`. Typical use: select it, then assign it to `to` to extend `to` into `from`",
    params: {
      from: { type: "integer", required: true, min: 0, description: "State losing cells (0 = unclaimed)" },
      to: { type: "integer", required: true, min: 0, description: "State gaining cells" },
      depth: { type: "integer", required: true, min: 1, max: 60, description: "Number of cell layers" }
    }
  },
  ring: {
    description:
      "`depth` layers of land cells just OUTSIDE a state, whoever owns them (neighbours or unclaimed). Typical use: select it, optionally restrict with a rect (combine_op intersect) to extend towards one direction, then assignState to that state",
    params: {
      state: { type: "integer", required: true, min: 1, description: "State id" },
      depth: { type: "integer", required: true, min: 1, max: 60, description: "Number of cell layers" }
    }
  },
  rim: {
    description:
      "`depth` layers of cells just INSIDE a state along its border with other land (not coasts). Typical use: hand its border strip to a neighbour with assignState",
    params: {
      state: { type: "integer", required: true, min: 1, description: "State id" },
      depth: { type: "integer", required: true, min: 1, max: 60, description: "Number of cell layers" }
    }
  },
  flood: {
    description: "Connected cells around a start cell that share a property with it",
    params: {
      start: { type: "integer", required: true, min: 0, description: "Start cell id" },
      match: {
        type: "string",
        required: true,
        enum: ["state", "province", "culture", "religion", "biome", "land"],
        description: "Property that must equal the start cell's"
      },
      max_cells: { type: "integer", min: 1, description: "Stop after this many cells" }
    }
  }
};

export const SELECT_OPTIONS: ParamSpecs = {
  land_only: { type: "boolean", description: "Keep land cells only (default true)" },
  only_state: { type: "integer", min: 0, description: "Keep only cells currently owned by this state" },
  combine_op: { type: "string", enum: COMBINE_OPS, description: "Combine the result with an earlier selection" },
  combine_with: { type: "string", description: "Id of the earlier selection (needed with combine_op)" }
};

function cellsWhere(test: (cell: number) => boolean): Set<number> {
  const out = new Set<number>();
  for (const cell of pack.cells.i) if (test(cell)) out.add(cell);
  return out;
}

function insidePolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildShape(shape: string, a: Params): Set<number> {
  const { cells } = pack;
  const centre = (cell: number) => cells.p[cell];
  switch (shape) {
    case "circle": {
      const [cx, cy, r] = [a.x as number, a.y as number, a.radius as number];
      return cellsWhere(c => (centre(c)[0] - cx) ** 2 + (centre(c)[1] - cy) ** 2 <= r * r);
    }
    case "rect": {
      const [x0, x1] = [Math.min(a.x0 as number, a.x1 as number), Math.max(a.x0 as number, a.x1 as number)];
      const [y0, y1] = [Math.min(a.y0 as number, a.y1 as number), Math.max(a.y0 as number, a.y1 as number)];
      return cellsWhere(c => centre(c)[0] >= x0 && centre(c)[0] <= x1 && centre(c)[1] >= y0 && centre(c)[1] <= y1);
    }
    case "polygon": {
      const pts = a.points as [number, number][];
      return cellsWhere(c => insidePolygon(centre(c)[0], centre(c)[1], pts));
    }
    case "cells": {
      const ids = a.cells as number[];
      const bad = ids.filter(c => c < 0 || c >= cells.i.length);
      if (bad.length) throw new AgentError(`select cells: unknown cell ids ${bad.slice(0, 5).join(", ")}`);
      return new Set(ids);
    }
    case "state":
      return cellsWhere(c => cells.state[c] === a.state);
    case "province":
      return cellsWhere(c => cells.province[c] === a.province);
    case "border": {
      const [from, to, depth] = [a.from as number, a.to as number, a.depth as number];
      if (from === to) throw new AgentError("select border: `from` and `to` must differ");
      const taken = new Set<number>();
      let frontier = cellsWhere(c => cells.state[c] === from && cells.c[c].some(n => cells.state[n] === to));
      for (const c of frontier) taken.add(c);
      for (let layer = 1; layer < depth; layer++) {
        const next = new Set<number>();
        for (const c of frontier) {
          for (const n of cells.c[c]) {
            if (cells.state[n] === from && !taken.has(n)) {
              taken.add(n);
              next.add(n);
            }
          }
        }
        frontier = next;
        if (!frontier.size) break;
      }
      return taken;
    }
    case "ring":
    case "rim": {
      const [state, depth] = [a.state as number, a.depth as number];
      const land = (c: number) => cells.h[c] >= 20;
      const inside = (c: number) => cells.state[c] === state;
      const isRing = shape === "ring";
      // seeds: first layer = cells on the other side of (ring) or on this side of (rim) the border with other land
      const seeds = cellsWhere(
        c =>
          land(c) &&
          (isRing
            ? !inside(c) && cells.c[c].some(n => inside(n))
            : inside(c) && cells.c[c].some(n => land(n) && !inside(n)))
      );
      const taken = new Set<number>(seeds);
      let frontier = seeds;
      for (let layer = 1; layer < depth && frontier.size; layer++) {
        const next = new Set<number>();
        for (const c of frontier) {
          for (const n of cells.c[c]) {
            if (!taken.has(n) && land(n) && inside(n) !== isRing) {
              taken.add(n);
              next.add(n);
            }
          }
        }
        frontier = next;
      }
      return taken;
    }
    case "flood": {
      const key = {
        state: cells.state,
        province: cells.province,
        culture: cells.culture,
        religion: cells.religion,
        biome: cells.biome
      };
      const start = a.start as number;
      if (start >= cells.i.length) throw new AgentError(`select flood: unknown cell ${start}`);
      const match = a.match as string;
      const same = (c: number): boolean =>
        match === "land"
          ? cells.h[c] >= 20
          : key[match as keyof typeof key][c] === key[match as keyof typeof key][start];
      const limit = (a.max_cells as number | undefined) ?? config.maxSelectionCells;
      const seen = new Set<number>([start]);
      const queue = [start];
      while (queue.length && seen.size < limit) {
        const c = queue.shift() as number;
        for (const n of cells.c[c]) {
          if (!seen.has(n) && same(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      return seen;
    }
    default:
      throw new AgentError(`select: unknown shape "${shape}". Available: ${Object.keys(SHAPES).join(", ")}`);
  }
}

export function createSelection(shape: string, args: Params, options: Params): SelectionInfo {
  const spec = SHAPES[shape];
  if (!spec) throw new AgentError(`select: unknown shape "${shape}". Available: ${Object.keys(SHAPES).join(", ")}`);
  validate(spec.params, args, `select ${shape}`);
  validate(SELECT_OPTIONS, options, "select options");

  let result = buildShape(shape, args);
  if (options.land_only !== false) result = new Set([...result].filter(c => pack.cells.h[c] >= 20));
  if (options.only_state !== undefined)
    result = new Set([...result].filter(c => pack.cells.state[c] === options.only_state));

  if (options.combine_op !== undefined) {
    const withId = options.combine_with;
    if (typeof withId !== "string") throw new AgentError("select: combine_op needs combine_with (a selection id)");
    const other = getSelection(withId);
    if (options.combine_op === "add") result = new Set([...other, ...result]);
    else if (options.combine_op === "subtract") result = new Set([...other].filter(c => !result.has(c)));
    else result = new Set([...other].filter(c => result.has(c)));
  }

  if (result.size > config.maxSelectionCells) {
    throw new AgentError(
      `select: ${result.size} cells exceeds the limit of ${config.maxSelectionCells}. Narrow the selection`
    );
  }

  counter += 1;
  const id = `sel-${counter}`;
  store.set(id, result);
  while (store.size > config.maxSelections) store.delete(store.keys().next().value as string);
  return describeSelection(id);
}

export function getSelection(id: string): Set<number> {
  const found = store.get(id);
  if (!found)
    throw new AgentError(
      `Unknown selection "${id}" (selections are kept in memory only; ${store.size} available: ${[...store.keys()].join(", ") || "none"})`
    );
  return found;
}

export function dropSelections(): void {
  store.clear();
}

export function describeSelection(id: string): SelectionInfo {
  const cells = getSelection(id);
  const byState: Record<number, number> = {};
  let land = 0;
  let bounds: Bounds | null = null;
  for (const c of cells) {
    const [x, y] = pack.cells.p[c];
    if (pack.cells.h[c] >= 20) land += 1;
    byState[pack.cells.state[c]] = (byState[pack.cells.state[c]] ?? 0) + 1;
    bounds = bounds
      ? {
          x0: Math.min(bounds.x0, x),
          y0: Math.min(bounds.y0, y),
          x1: Math.max(bounds.x1, x),
          y1: Math.max(bounds.y1, y)
        }
      : { x0: x, y0: y, x1: x, y1: y };
  }
  if (bounds) bounds = { x0: round(bounds.x0), y0: round(bounds.y0), x1: round(bounds.x1), y1: round(bounds.y1) };
  return { id, count: cells.size, land, bounds, byState, sampleCells: [...cells].slice(0, 5) };
}

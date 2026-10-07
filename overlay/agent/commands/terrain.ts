import { hiddenLayerNote } from "../layers";
import { refreshStatistics } from "../queries";
import { dropSelections, getSelection } from "../selection";
import { AgentError, type Command, type CommandResult, type ParamSpecs, type Params } from "../types";

// Azgaar height scale: 0..100, land starts at 20 (the interface uses the same threshold everywhere).
const SEA_LEVEL = 20;
const MAX_HEIGHT = 100;

type Scope = "all" | "land" | "water";
type RiverMode = "keep" | "rebuild";

const SCOPES = ["all", "land", "water"] as const;
const RIVER_MODES = ["keep", "rebuild"] as const;

const SCOPE: ParamSpecs[string] = {
  type: "string",
  enum: SCOPES,
  description:
    "land = only land cells and they stay land (coastlines frozen); water = only water cells and they stay water; all (default) = no restriction"
};
const RIVERS: ParamSpecs[string] = {
  type: "string",
  enum: RIVER_MODES,
  description:
    "keep (default) = rivers stay exactly as they are (names kept; they may cross new relief); rebuild = rivers, lakes and their names are regenerated from the new relief everywhere"
};
const POWER: ParamSpecs[string] = {
  type: "number",
  min: 0.3,
  max: 4,
  description: "Falloff shape: 1 linear (default), >1 sharper peak, <1 broader plateau"
};
const SELECTION: ParamSpecs[string] = {
  type: "string",
  required: true,
  description: "Selection id returned by map_select"
};

const clamp = (h: number): number => Math.max(0, Math.min(MAX_HEIGHT, Math.round(h)));
const isLand = (h: number): boolean => h >= SEA_LEVEL;

/** Grid cells under a selection of pack cells (heights live on the grid; the pack is rebuilt from it). */
function gridCellsOf(selectionId: string): number[] {
  const out = new Set<number>();
  for (const cell of getSelection(selectionId)) out.add(pack.cells.g[cell]);
  return [...out];
}

function stateFigures(): Map<number, { name: string; area: number; cells: number }> {
  const out = new Map<number, { name: string; area: number; cells: number }>();
  for (const s of pack.states)
    if (s.i && !s.removed) out.set(s.i, { name: s.fullName ?? s.name, area: s.area ?? 0, cells: s.cells ?? 0 });
  return out;
}

const countGridLand = (): number => grid.cells.h.reduce((n: number, h: number) => n + (isLand(h) ? 1 : 0), 0);
const aliveBurgs = (): number => pack.burgs.filter(b => b.i && !b.removed).length;

/**
 * Relief changes that do not move the coast: heights are copied in place, exactly like the editor's "keep" mode
 * (restoreKeptData). Nothing is rebuilt, so states, provinces, cities, rivers, biomes and cell ids stay untouched.
 */
function applyInPlace(changes: Map<number, number>, scopeNote: string[]): CommandResult {
  const { h } = grid.cells;
  for (const [g, next] of changes) h[g] = next;
  for (const cell of pack.cells.i) {
    const g = pack.cells.g[cell];
    if (changes.has(g)) pack.cells.h[cell] = h[g];
  }
  Layers.draw("heightmap", "relief");
  return {
    ok: true,
    message: `${changes.size} grid cells changed (relief only, in place)`,
    changed: changes.size,
    details: { mode: "in place", cellIdsKept: true },
    warnings: [
      ...scopeNote,
      ...hiddenLayerNote(["heightmap", "relief"], "The relief change"),
      "The coast did not move, so nothing was rebuilt: states, provinces, cities, rivers, biomes and selections are unchanged. Biomes are not recomputed from the new relief."
    ]
  };
}

/**
 * Applies new heights to grid cells, then rebuilds everything that depends on relief exactly as the
 * heightmap editor does when it is left in "risk" mode (restoreRiskedData): states, provinces, burgs,
 * cultures and religions are kept; coast, lakes, biomes, (optionally) rivers and the economy are redone.
 */
async function applyGridHeights(
  requested: Map<number, number>,
  scope: Scope,
  rivers: RiverMode
): Promise<CommandResult> {
  const { h } = grid.cells;
  const changes = new Map<number, number>();
  let filteredByScope = 0;
  for (const [g, raw] of requested) {
    const prev = h[g];
    const next = clamp(raw);
    if (next === prev) continue;
    if (
      (scope === "land" && (!isLand(prev) || !isLand(next))) ||
      (scope === "water" && (isLand(prev) || isLand(next)))
    ) {
      filteredByScope += 1;
      continue;
    }
    changes.set(g, next);
  }
  const scopeNote = filteredByScope
    ? [
        `${filteredByScope} cell(s) were skipped because scope "${scope}" would move the coast or a lake shore. Pass scope: "all" to allow it (this triggers a rebuild).`
      ]
    : [];
  if (!changes.size) {
    return { ok: true, message: "Nothing to change", changed: 0, details: { filteredByScope }, warnings: scopeNote };
  }

  const crossesSeaLevel = [...changes].some(([g, next]) => isLand(h[g]) !== isLand(next));
  if (!crossesSeaLevel && rivers === "keep") return applyInPlace(changes, scopeNote);

  refreshStatistics();
  const before = stateFigures();
  const landBefore = countGridLand();
  const burgsBefore = aliveBurgs();
  const burgGridCells = new Set<number>(pack.burgs.filter(b => b.i && !b.removed).map(b => pack.cells.g[b.cell]));
  let protectedBurgCells = 0;
  for (const [g, next] of changes) if (burgGridCells.has(g) && !isLand(next)) protectedBurgCells += 1;

  for (const [g, next] of changes) h[g] = next;

  const editor = options.app.heightmapEditor;
  const previousErosion = editor.allowErosion;
  editor.allowErosion = rivers === "rebuild";
  const { restoreRiskedData } = await import("@/controllers/heightmap-editor");
  const active = Layers.state.active;
  const reliefActive = active.includes("relief");
  try {
    Layers.set([]);
    // Drawn feature paths are keyed by feature id, and ids are reassigned by the rebuild: clear them first (same as the editor).
    for (const el of document.querySelectorAll(
      "#deftemp #land path, #deftemp #water path, #deftemp #featurePaths path, #viewbox #coastline use, #viewbox #lakes path, #viewbox #oceanLayers path, #viewbox #terrain *, #viewbox #relief *, #terrain *"
    ))
      el.remove();
    const { removeRelief } = await import("@/renderers/draw-relief-icons");
    removeRelief();
    pack.relief = [];
    restoreRiskedData();
    Relief.generate();
    Layers.draw("ocean", "landmass", "lakes", "coastline");
    if (reliefActive) Layers.draw("relief");
    Layers.set(active);
  } finally {
    editor.allowErosion = previousErosion;
  }
  dropSelections();

  const after = stateFigures();
  const statesChanged: Record<
    string,
    { areaBefore: number; areaAfter: number; cellsBefore: number; cellsAfter: number }
  > = {};
  for (const [id, b] of before) {
    const a = after.get(id);
    if (a && (a.area !== b.area || a.cells !== b.cells))
      statesChanged[`${id} ${a.name}`] = {
        areaBefore: b.area,
        areaAfter: a.area,
        cellsBefore: b.cells,
        cellsAfter: a.cells
      };
  }
  const warnings = [
    ...scopeNote,
    ...hiddenLayerNote(["heightmap", "relief"], "The relief change"),
    "Cell ids were renumbered by the rebuild: all earlier selections were dropped. Select again before the next edit.",
    "To represent landmarks or new features without a global terrain rebuild, consider using map_apply annotate (kind: 'area' or 'text')."
  ];
  if (protectedBurgCells)
    warnings.push(
      `${protectedBurgCells} cell(s) under a city could not be lowered below sea level (cities are never submerged).`
    );
  warnings.push(
    rivers === "keep"
      ? "Rivers were kept as they were and may cross the new relief (use rivers: rebuild to regenerate them)."
      : "Rivers, lakes and their names were regenerated everywhere."
  );
  warnings.push("Trade and economy were recomputed.");
  warnings.push(
    "The rebuild re-derives states and provinces from the grid: border cells along coasts may shift by a cell elsewhere on the map (same as the interface's heightmap editor). See statesAffected."
  );
  return {
    ok: true,
    message: `${changes.size} grid cells changed`,
    changed: changes.size,
    details: {
      mode: "rebuild",
      landGridCells: { before: landBefore, after: countGridLand() },
      burgs: { before: burgsBefore, after: aliveBurgs() },
      statesAffected: statesChanged
    },
    warnings
  };
}

function scopeOf(p: Params): Scope {
  return (p.scope as Scope | undefined) ?? "land";
}
function riversOf(p: Params): RiverMode {
  return (p.rivers as RiverMode | undefined) ?? "keep";
}

const adjustHeight: Command = {
  name: "adjustHeight",
  description:
    "Raise (positive delta) or lower (negative) the relief under a selection. Heights run 0-100; sea level is 20, hills about 40-60, mountains 70+. Rebuilds coast, biomes and the economy; states and cities are kept.",
  params: {
    selection: SELECTION,
    delta: { type: "integer", required: true, min: -MAX_HEIGHT, max: MAX_HEIGHT, description: "Height change" },
    scope: SCOPE,
    rivers: RIVERS
  },
  async run(p: Params): Promise<CommandResult> {
    const requested = new Map<number, number>();
    for (const g of gridCellsOf(p.selection as string)) requested.set(g, grid.cells.h[g] + (p.delta as number));
    return await applyGridHeights(requested, scopeOf(p), riversOf(p));
  }
};

const setHeight: Command = {
  name: "setHeight",
  description:
    "Set the relief under a selection to one height (0-100, sea level 20). Below 20 = sea, 20-25 = coastal lowland (turns water into new land), 70+ = mountains.",
  params: {
    selection: SELECTION,
    height: { type: "integer", required: true, min: 0, max: MAX_HEIGHT, description: "Target height" },
    scope: SCOPE,
    rivers: RIVERS
  },
  async run(p: Params): Promise<CommandResult> {
    const requested = new Map<number, number>();
    for (const g of gridCellsOf(p.selection as string)) requested.set(g, p.height as number);
    return await applyGridHeights(requested, scopeOf(p), riversOf(p));
  }
};

const smoothHeight: Command = {
  name: "smoothHeight",
  description:
    "Smooth the relief under a selection (each cell moves towards the average of its neighbours): softens cliffs and jagged coasts.",
  params: {
    selection: SELECTION,
    passes: { type: "integer", min: 1, max: 10, description: "Number of smoothing passes (default 1)" },
    scope: SCOPE,
    rivers: RIVERS
  },
  async run(p: Params): Promise<CommandResult> {
    const cells = new Set(gridCellsOf(p.selection as string));
    const { h, c } = grid.cells;
    let current = new Map<number, number>([...cells].map(g => [g, h[g]]));
    const passes = (p.passes as number | undefined) ?? 1;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Map<number, number>();
      for (const g of cells) {
        const here = current.get(g) as number;
        const around = c[g].map((n: number) => current.get(n) ?? h[n]);
        next.set(g, (here + around.reduce((sum: number, v: number) => sum + v, 0)) / (around.length + 1));
      }
      current = next;
    }
    return await applyGridHeights(current, scopeOf(p), riversOf(p));
  }
};

const shapeCone: Command = {
  name: "shapeCone",
  description:
    "Raise a mountain or dig a basin around a map point: height is `peak` at the centre and blends back to the existing relief at `radius`. peak above the current height = hill/mountain/island; peak below 20 = lake or sea.",
  params: {
    x: { type: "number", required: true, description: "Centre x (map units)" },
    y: { type: "number", required: true, description: "Centre y (map units)" },
    radius: { type: "number", required: true, min: 1, description: "Radius (map units)" },
    peak: { type: "integer", required: true, min: 0, max: MAX_HEIGHT, description: "Height at the centre (0-100)" },
    power: POWER,
    scope: SCOPE,
    rivers: RIVERS
  },
  async run(p: Params): Promise<CommandResult> {
    const [cx, cy, radius, peak] = [p.x as number, p.y as number, p.radius as number, p.peak as number];
    const power = (p.power as number | undefined) ?? 1;
    const requested = new Map<number, number>();
    for (const g of grid.cells.i) {
      const [x, y] = grid.points[g];
      const t = 1 - Math.hypot(x - cx, y - cy) / radius;
      if (t <= 0) continue;
      const old = grid.cells.h[g];
      requested.set(g, old + (peak - old) * t ** power);
    }
    if (!requested.size)
      throw new AgentError("shapeCone: no cell within that radius: check x, y and radius (map units)");
    return await applyGridHeights(requested, scopeOf(p), riversOf(p));
  }
};

function distanceToPath(x: number, y: number, path: [number, number][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const [dx, dy] = [bx - ax, by - ay];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

const shapeRidge: Command = {
  name: "shapeRidge",
  description:
    "Raise a mountain range (or dig a valley/channel) along a path: height is `peak` on the path and blends back to the existing relief at `width` from it.",
  params: {
    path: { type: "path", required: true, description: "[[x, y], ...] in map units, at least 2 points" },
    width: { type: "number", required: true, min: 1, description: "Half-width of the range (map units)" },
    peak: { type: "integer", required: true, min: 0, max: MAX_HEIGHT, description: "Height on the path (0-100)" },
    power: POWER,
    scope: SCOPE,
    rivers: RIVERS
  },
  async run(p: Params): Promise<CommandResult> {
    const [path, width, peak] = [p.path as [number, number][], p.width as number, p.peak as number];
    const power = (p.power as number | undefined) ?? 1;
    const requested = new Map<number, number>();
    for (const g of grid.cells.i) {
      const [x, y] = grid.points[g];
      const t = 1 - distanceToPath(x, y, path) / width;
      if (t <= 0) continue;
      const old = grid.cells.h[g];
      requested.set(g, old + (peak - old) * t ** power);
    }
    if (!requested.size) throw new AgentError("shapeRidge: no cell within that width of the path");
    return await applyGridHeights(requested, scopeOf(p), riversOf(p));
  }
};

export const terrainCommands: Command[] = [adjustHeight, setHeight, smoothHeight, shapeCone, shapeRidge];

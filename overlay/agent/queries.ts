import { viewport } from "@/components/viewport";
import { getLabelsIndex } from "@/renderers/labels/label-data";
import { config } from "./config";
import { cellAt, mapSize, mapToScreen, round, screenToMap, visibleBounds } from "./geometry";
import { parseSpatial, pointsOfEntry, referencePoints, SPATIAL_KINDS, testEntry } from "./spatial";
import { AgentError, type Params } from "./types";

/** Recomputes derived state figures (cells, area, burgs, neighbours) so that answers are never stale. */
export function refreshStatistics(): void {
  States.findNeighbors();
  States.collectStatistics();
}

function nameOf<T extends { name?: string }>(list: T[], id: number): string | null {
  return list[id]?.name ?? null;
}

export function cellInfo(cell: number): Record<string, unknown> {
  const { cells } = pack;
  if (!Number.isInteger(cell) || cell < 0 || cell >= cells.i.length) throw new AgentError(`Unknown cell ${cell}`);
  const [x, y] = cells.p[cell];
  const burg = cells.burg[cell];
  const stateId = cells.state[cell];
  const isCapital = stateId ? pack.states[stateId].center === cell : false;
  return {
    cell,
    x: round(x),
    y: round(y),
    screen: mapToScreen(x, y).map(v => round(v, 0)),
    land: cells.h[cell] >= 20,
    height: cells.h[cell],
    state: { id: stateId, name: nameOf(pack.states, stateId) },
    province: {
      id: cells.province[cell],
      name: cells.province[cell] ? nameOf(pack.provinces, cells.province[cell]) : null
    },
    culture: { id: cells.culture[cell], name: nameOf(pack.cultures, cells.culture[cell]) },
    religion: { id: cells.religion[cell], name: nameOf(pack.religions, cells.religion[cell]) },
    biome: { id: cells.biome[cell], name: nameOf(pack.biomes, cells.biome[cell]) },
    burg: burg ? { id: burg, name: pack.burgs[burg].name, capital: Boolean(pack.burgs[burg].capital) } : null,
    isStateCapitalCell: isCapital,
    river: cells.r[cell] || null,
    neighbours: cells.c[cell]
  };
}

const LOCATE_KEYS = ["px", "py", "x", "y", "cell"] as const;

export function locate(args: Params): Record<string, unknown> {
  for (const key of Object.keys(args)) {
    if (!(LOCATE_KEYS as readonly string[]).includes(key))
      throw new AgentError(
        `locate: unknown parameter "${key}". Use px+py (screenshot pixels), x+y (map units) or cell`
      );
  }
  if (typeof args.cell === "number") return cellInfo(args.cell);
  if (typeof args.px === "number" && typeof args.py === "number") {
    const [x, y] = screenToMap(args.px, args.py);
    return { ...cellInfo(cellAt(x, y)), queried: { px: args.px, py: args.py, mapX: round(x), mapY: round(y) } };
  }
  if (typeof args.x === "number" && typeof args.y === "number") return cellInfo(cellAt(args.x, args.y));
  throw new AgentError("locate: give px+py (screenshot pixels), x+y (map units) or cell");
}

export function camera(): Record<string, unknown> {
  const b = visibleBounds();
  const { width, height } = mapSize();
  return {
    scale: round(viewport.scale, 3),
    visibleMapArea: { x0: round(b.x0), y0: round(b.y0), x1: round(b.x1), y1: round(b.y1) },
    mapSize: { width, height },
    windowPixels: { width: window.innerWidth, height: window.innerHeight }
  };
}

export function summary(): Record<string, unknown> {
  refreshStatistics();
  const alive = <T extends { i: number; removed?: boolean }>(list: T[]): T[] => list.filter(e => e.i && !e.removed);
  const states = alive(pack.states).map(s => ({
    id: s.i,
    name: s.fullName ?? s.name,
    color: s.color,
    type: s.type,
    cells: s.cells,
    areaKm2: s.area,
    burgs: s.burgs,
    capital: s.capital ? { burg: s.capital, name: pack.burgs[s.capital]?.name, cell: s.center } : null,
    pole: s.pole ? s.pole.map(v => round(v)) : null,
    neighbours: s.neighbors ?? []
  }));
  const landCells = pack.cells.i.filter(c => pack.cells.h[c] >= 20).length;
  const unclaimed = pack.cells.i.filter(c => pack.cells.h[c] >= 20 && !pack.cells.state[c]).length;
  return {
    version: window.VERSION,
    seed: options.map.seed,
    mapSize: mapSize(),
    cells: pack.cells.i.length,
    landCells,
    unclaimedLandCells: unclaimed,
    counts: {
      states: states.length,
      burgs: alive(pack.burgs).length,
      provinces: alive(pack.provinces).length,
      cultures: alive(pack.cultures).length,
      religions: alive(pack.religions).length
    },
    states,
    camera: camera()
  };
}

export const LIST_KINDS = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "burgs",
  "markers",
  "routes",
  "labels"
] as const;

export function list(
  kind: string,
  filterState: number | undefined,
  limit: number | undefined,
  nameContains?: string,
  spatial?: unknown
): Record<string, unknown> {
  const max = limit ?? config.listLimit;
  const alive = <T extends { i: number; removed?: boolean }>(items: T[]): T[] => items.filter(e => e.i && !e.removed);
  let rows: Record<string, unknown>[];
  switch (kind) {
    case "states":
      rows = alive(pack.states).map(s => ({ id: s.i, name: s.fullName ?? s.name, color: s.color }));
      break;
    case "provinces":
      rows = alive(pack.provinces)
        .filter(p => filterState === undefined || p.state === filterState)
        .map(p => ({ id: p.i, name: p.fullName ?? p.name, state: p.state, center: p.center }));
      break;
    case "cultures":
      rows = alive(pack.cultures).map(c => ({ id: c.i, name: c.name, color: c.color }));
      break;
    case "religions":
      rows = alive(pack.religions).map(r => ({ id: r.i, name: r.name, color: r.color }));
      break;
    case "burgs":
      rows = alive(pack.burgs)
        .filter(b => filterState === undefined || b.state === filterState)
        .map(b => ({
          id: b.i,
          name: b.name,
          state: b.state,
          cell: b.cell,
          x: round(b.x),
          y: round(b.y),
          capital: Boolean(b.capital),
          population: b.population
        }));
      break;
    case "markers":
      rows = pack.markers.map(m => ({
        id: m.i,
        type: m.type,
        icon: m.icon,
        name: m.name ?? null,
        x: round(m.x),
        y: round(m.y),
        cell: m.cell
      }));
      break;
    case "routes":
      rows = pack.routes.map(r => ({ id: r.i, name: r.name ?? null, group: r.group, points: r.points.length }));
      break;
    case "labels":
      // What stands where on the map: every label (states, provinces, burgs, rivers, routes, added) with its shift.
      rows = getLabelsIndex().map(l => ({
        id: l.entityId,
        type: l.type,
        name: l.text,
        group: l.group,
        x: round(l.anchor[0] + (l.dx ?? 0)),
        y: round(l.anchor[1] + (l.dy ?? 0)),
        dx: l.dx ?? 0,
        dy: l.dy ?? 0
      }));
      break;
    case "markerTypes":
      rows = Markers.getConfig().map(c => ({ type: c.type, icon: c.icon }));
      break;
    case "rivers":
      rows = pack.rivers.map(r => ({
        id: r.i,
        name: r.name,
        type: r.type,
        lengthKm: round(r.length ?? 0),
        discharge: r.discharge,
        parent: r.parent,
        cells: r.cells?.length ?? 0
      }));
      break;
    default:
      throw new AgentError(`list: unknown kind "${kind}". Available: ${LIST_KINDS.join(", ")}`);
  }
  if (nameContains) {
    const needle = nameContains.toLowerCase();
    rows = rows.filter(row =>
      String(row.name ?? row.type ?? "")
        .toLowerCase()
        .includes(needle)
    );
  }
  if (spatial === undefined)
    return { kind, total: rows.length, shown: Math.min(rows.length, max), rows: rows.slice(0, max) };

  if (!(SPATIAL_KINDS as readonly string[]).includes(kind))
    throw new AgentError(
      `list: ${kind} have no place on the map, so spatial filters do not apply. Use one of: ${SPATIAL_KINDS.join(", ")}`
    );
  const filter = parseSpatial(spatial);
  const reference = filter.near ? referencePoints(filter.near) : null;
  // an entry is never listed as being near itself
  const selfId = kind === "burgs" ? filter.near?.burg : kind === "rivers" ? filter.near?.river : undefined;
  const scale = options.map.units.distance.scale;
  const hits: { row: Record<string, unknown>; distance: number | null; side: string | null }[] = [];
  for (const row of rows) {
    if (selfId !== undefined && row.id === selfId) continue;
    const hit = testEntry(filter, reference, scale, pointsOfEntry(kind, row));
    if (hit) hits.push({ row, ...hit });
  }
  if (reference) hits.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const found = hits.map(h => (reference ? { ...h.row, distance: round(h.distance ?? 0, 1), side: h.side } : h.row));
  return {
    kind,
    total: found.length,
    shown: Math.min(found.length, max),
    ...(reference ? { distanceUnit: options.map.units.distance.unit, sortedBy: "distance" } : {}),
    rows: found.slice(0, max)
  };
}

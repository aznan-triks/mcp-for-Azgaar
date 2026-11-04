import { layersFor } from "@/controllers/assistant/redraw";
import type { Marker } from "@/generators/markers-generator";
import type { River } from "@/generators/river-generator";
import { mergeRoutePoints, type Route } from "@/generators/routes-generator";
import { config } from "../config";
import { cellAt, round } from "../geometry";
import { hiddenLayerNote } from "../layers";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const ROUTE_GROUPS = ["roads", "trails", "searoutes"] as const;

function liveRoute(id: number): Route {
  const route = pack.routes.find(r => r.i === id);
  if (!route) throw new AgentError(`Route ${id} does not exist`);
  return route;
}

function liveRiver(id: number): River {
  const river = pack.rivers.find(r => r.i === id);
  if (!river) throw new AgentError(`River ${id} does not exist`);
  return river;
}

/** Redraw what a route or river change touches, from the redraw table shared with the assistant. */
function redrawNetwork(type: "route" | "river", id: number): void {
  Layers.draw(...layersFor([{ key: `${type}:${id}`, field: "" }]));
}

const addMarker: Command = {
  name: "addMarker",
  description:
    "Place a marker (point of interest) at a map point. `type` may be one of the interface's marker types (call map_list kind=markerTypes) such as ruins or volcanoes, or omitted for a custom marker with your own `icon` (an emoji). Turns the markers layer on.",
  params: {
    x: { type: "number", required: true, description: "x in map units" },
    y: { type: "number", required: true, description: "y in map units" },
    type: { type: "string", description: "Marker type (default custom)" },
    icon: { type: "string", description: "Emoji for a custom marker (default ❓)" },
    name: { type: "string", description: "Marker name" },
    note: { type: "string", description: "Legend text shown for the marker" }
  },
  run(p: Params): CommandResult {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const cell = cellAt(x, y);
    const type = (p.type as string | undefined) ?? "custom";
    const known = Markers.getConfig().some(c => c.type === type);
    const base = known ? {} : { icon: (p.icon as string | undefined) ?? "❓", type };
    const marker = Markers.add({ ...base, type, x, y, cell } as Marker);
    if (typeof p.name === "string") marker.name = p.name;
    if (typeof p.note === "string") marker.note = p.note;
    Layers.show("markers");
    Layers.draw("markers");
    return {
      ok: true,
      message: `Marker ${marker.i} "${marker.name}" added`,
      changed: 1,
      details: { marker: marker.i, type: marker.type, cell: marker.cell, knownType: known }
    };
  }
};

const removeMarker: Command = {
  name: "removeMarker",
  description: "Delete a marker.",
  params: { marker: { type: "integer", required: true, min: 0, description: "Marker id" } },
  run(p: Params): CommandResult {
    const id = p.marker as number;
    const marker = pack.markers.find(m => m.i === id);
    if (!marker) throw new AgentError(`Marker ${id} does not exist`);
    Markers.remove(id);
    Layers.draw("markers");
    return { ok: true, message: `Marker ${id} "${marker.name}" removed`, changed: 1 };
  }
};

const addRoute: Command = {
  name: "addRoute",
  description:
    "Draw a route through map points: roads and trails over land, searoutes over water. The line follows the points in order (add intermediate points to steer it).",
  params: {
    path: { type: "path", required: true, description: "[[x, y], ...] in map units, at least 2 points" },
    group: { type: "string", enum: ROUTE_GROUPS, description: "roads (default), trails or searoutes" },
    name: { type: "string", description: "Route name (generated from the places it links if omitted)" }
  },
  run(p: Params): CommandResult {
    const group = (p.group as (typeof ROUTE_GROUPS)[number] | undefined) ?? "roads";
    const points = (p.path as [number, number][]).map(([x, y]) => {
      const rx = round(x, 2);
      const ry = round(y, 2);
      const cell = cellAt(rx, ry);
      const land = pack.cells.h[cell] >= 20;
      if (group !== "searoutes" && !land)
        throw new AgentError(
          `Point (${rx}, ${ry}) is in the water: ${group} must stay on land (use group searoutes for sea lanes)`
        );
      if (group === "searoutes" && land)
        throw new AgentError(`Point (${rx}, ${ry}) is on land: searoutes must stay on water`);
      return [rx, ry, cell];
    });
    // Same steps as the route creator.
    const id = Routes.getNextId();
    const route = { points, group, feature: pack.cells.f[points[0][2]], i: id } as Route;
    const name = (p.name as string | undefined) ?? Routes.generateName({ group, points });
    if (name) route.name = name;
    pack.routes.push(route);
    const links = pack.cells.routes;
    for (let i = 0; i < points.length - 1; i++) {
      const [from, to] = [points[i][2], points[i + 1][2]];
      links[from] ??= {};
      links[from][to] = id;
      links[to] ??= {};
      links[to][from] = id;
    }
    Layers.draw("routes");
    return {
      ok: true,
      message: `Route ${id}${name ? ` "${name}"` : ""} added`,
      changed: 1,
      details: { route: id, group, name: name ?? null, points: points.length }
    };
  }
};

const removeRoute: Command = {
  name: "removeRoute",
  description: "Delete a route.",
  params: { route: { type: "integer", required: true, min: 0, description: "Route id" } },
  run(p: Params): CommandResult {
    const id = p.route as number;
    const route = pack.routes.find(r => r.i === id);
    if (!route) throw new AgentError(`Route ${id} does not exist`);
    Routes.remove(id);
    Layers.draw("routes");
    return { ok: true, message: `Route ${id} removed`, changed: 1 };
  }
};

/** Shortest chain of adjacent land cells from `from` to `to` (inclusive), so a river path never jumps over cells. */
function landChain(from: number, to: number): number[] {
  if (from === to) return [from];
  const previous = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const cell = queue.shift() as number;
    for (const next of pack.cells.c[cell]) {
      if (previous.has(next) || pack.cells.h[next] < 20) continue;
      previous.set(next, cell);
      if (next === to) {
        const chain = [to];
        for (let at = to; at !== from; at = previous.get(at) as number) chain.push(previous.get(at) as number);
        return chain.reverse();
      }
      queue.push(next);
    }
  }
  throw new AgentError(`No land route between cell ${from} and cell ${to}: they are on different land masses`);
}

const addRiver: Command = {
  name: "addRiver",
  description:
    "Draw a river from its source to its mouth through map points (all on land; the points are joined along adjacent land cells). A river that ends in a cell of an existing river becomes its tributary. Rivers regenerated by a terrain edit with rivers=rebuild replace hand-drawn ones.",
  params: {
    path: {
      type: "path",
      required: true,
      description: "[[x, y], ...] source first, in map units, at least 2 points on land"
    },
    name: { type: "string", description: "River name (generated if omitted)" },
    flux: {
      type: "number",
      min: 1,
      description:
        "Water flow that sets the river width (default from config: a modest river). Cells that already carry more keep it"
    }
  },
  run(p: Params): CommandResult {
    const { cells, rivers } = pack;
    const anchors = (p.path as [number, number][]).map(([x, y]) => {
      const cell = cellAt(round(x, 2), round(y, 2));
      if (cells.h[cell] < 20) throw new AgentError(`Point (${x}, ${y}) is in the water: a river runs over land only`);
      return cell;
    });
    const chain: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      for (const cell of i === 0 ? [anchors[0]] : landChain(anchors[i - 1], anchors[i]).slice(1))
        if (chain.at(-1) !== cell) chain.push(cell);
    }
    if (new Set(chain).size !== chain.length)
      throw new AgentError("The river path crosses itself: a river cannot loop");
    if (chain.length < 2)
      throw new AgentError("A river needs at least 2 different cells: give points that are further apart");

    // Same steps as the river creator.
    const flux = (p.flux as number | undefined) ?? config.defaultRiverFlux;
    const riverId = Rivers.getNextId(rivers);
    const parent = cells.r[chain[chain.length - 1]] || riverId;
    for (const cell of chain) {
      if (!cells.r[cell]) cells.r[cell] = riverId;
      cells.fl[cell] = Math.max(cells.fl[cell], flux);
    }
    const source = chain[0];
    const mouth = parent === riverId ? chain[chain.length - 1] : chain[chain.length - 2];
    const sourceWidth = Rivers.getSourceWidth(cells.fl[source]);
    const widthFactor = 1.2 * round(1 / (options.map.graph.points / 10000) ** 0.25, 2); // const-ok: Azgaar's reference density (10K points), same formula as its river creator
    const meandered = Rivers.addMeandering(chain);
    const discharge = cells.fl[mouth];
    const length = Rivers.getApproximateLength(meandered as unknown as [number, number][]);
    const width = Rivers.getWidth(
      Rivers.getOffset({ flux: discharge, pointIndex: meandered.length, widthFactor, startingWidth: sourceWidth })
    );
    const name = (p.name as string | undefined) ?? Rivers.getName(mouth);
    rivers.push({
      i: riverId,
      source,
      mouth,
      discharge,
      length,
      width,
      widthFactor,
      sourceWidth,
      parent,
      cells: chain,
      basin: Rivers.getBasin(parent),
      name,
      type: "River"
    } as unknown as River);
    Layers.draw("rivers", "labels");
    return {
      ok: true,
      message: `River ${riverId} "${name}" drawn over ${chain.length} cells`,
      changed: chain.length,
      details: {
        river: riverId,
        name,
        cells: chain.length,
        source,
        mouth,
        tributaryOf: parent === riverId ? null : parent
      },
      warnings: hiddenLayerNote(["rivers"], "The river")
    };
  }
};

const removeRiver: Command = {
  name: "removeRiver",
  description: "Delete a river and all its tributaries.",
  params: { river: { type: "integer", required: true, min: 1, description: "River id (see map_list kind=rivers)" } },
  run(p: Params): CommandResult {
    const id = p.river as number;
    const river = pack.rivers.find(r => r.i === id);
    if (!river) throw new AgentError(`River ${id} does not exist`);
    const before = pack.rivers.length;
    Rivers.remove(id);
    Layers.draw("rivers", "labels");
    const gone = before - pack.rivers.length;
    return {
      ok: true,
      message: `River ${id} "${river.name}" removed${gone > 1 ? ` with ${gone - 1} tributaries` : ""}`,
      changed: gone
    };
  }
};

const updateRoute: Command = {
  name: "updateRoute",
  description:
    "Change a route's name, group (roads, trails or searoutes) and/or lock (a locked route survives map regeneration). Give at least one field.",
  params: {
    route: { type: "integer", required: true, min: 0, description: "Route id (see map_list kind=routes)" },
    name: { type: "string", description: "New name" },
    group: { type: "string", enum: ROUTE_GROUPS, description: "Move the route to another group" },
    locked: { type: "boolean", description: "Lock (true) or unlock (false) the route" }
  },
  run(p: Params): CommandResult {
    const id = p.route as number;
    const route = liveRoute(id);
    const changed: string[] = [];
    if (p.name === undefined && p.group === undefined && p.locked === undefined)
      throw new AgentError("updateRoute: give at least one of name, group or locked flag to change");
    if (typeof p.name === "string") {
      Routes.rename(id, p.name);
      changed.push("name");
    }
    if (typeof p.group === "string") {
      Routes.setGroup(id, p.group);
      changed.push("group");
    }
    if (p.locked !== undefined) {
      Routes.setLocked(id, p.locked === true);
      changed.push("locked");
    }
    redrawNetwork("route", id);
    return {
      ok: true,
      message: `Route ${id} updated (${changed.join(", ")})`,
      changed: changed.length,
      details: { route: id, changed, name: route.name ?? null, group: route.group, locked: Boolean(route.lock) }
    };
  }
};

const splitRoute: Command = {
  name: "splitRoute",
  description:
    "Cut a route at one of its inner points: the route ends there and a new route of the same group goes on from the cut. Points are counted from 0.",
  params: {
    route: { type: "integer", required: true, min: 0, description: "Route id (see map_list kind=routes)" },
    point: {
      type: "integer",
      required: true,
      description: "Index of the inner point to cut at (points are counted from 0)"
    }
  },
  run(p: Params): CommandResult {
    const id = p.route as number;
    const route = liveRoute(id);
    const point = p.point as number;
    const before = route.points.length;
    if (!Number.isInteger(point) || point < 1 || point > before - 2)
      throw new AgentError(
        `splitRoute: point ${point} is not an inner point of route ${id}; its ${before} points are counted from 0`
      );
    const newRoute = Routes.split(id, point);
    redrawNetwork("route", id);
    return {
      ok: true,
      message: `Route ${id} split at point ${point}: route ${newRoute} continues it`,
      changed: 1,
      details: { route: id, newRoute, at: point, pointsBefore: before }
    };
  }
};

const joinRoutes: Command = {
  name: "joinRoutes",
  description:
    "Join two routes of the same group that meet at an endpoint into one continuous route; `other` is removed. The result starts where one started and ends where the other ended.",
  params: {
    route: { type: "integer", required: true, min: 0, description: "Route that keeps the joined line" },
    other: { type: "integer", required: true, min: 0, description: "Route to join into it (removed afterwards)" }
  },
  run(p: Params): CommandResult {
    const id = p.route as number;
    const otherId = p.other as number;
    const route = liveRoute(id);
    const other = liveRoute(otherId);
    if (id === otherId) throw new AgentError("joinRoutes: a route cannot join itself");
    if (route.group !== other.group)
      throw new AgentError(
        `joinRoutes: routes ${id} and ${otherId} are in different groups (${route.group} / ${other.group})`
      );
    if (!mergeRoutePoints(route.points, other.points))
      throw new AgentError(`joinRoutes: routes ${id} and ${otherId} share no endpoint to meet at`);
    Routes.join(id, otherId);
    redrawNetwork("route", id);
    return {
      ok: true,
      message: `Route ${otherId} joined into route ${id}`,
      changed: 1,
      details: { route: id, removed: otherId, points: route.points.length }
    };
  }
};

const updateRiver: Command = {
  name: "updateRiver",
  description:
    "Change a river's name, type (a free label such as River, Creek or Fork), mainstem and/or width (source width and width factor). Give at least one field. parent: the river this one flows into, or its own id to make it a mainstem.",
  params: {
    river: { type: "integer", required: true, min: 1, description: "River id (see map_list kind=rivers)" },
    name: { type: "string", description: "New name" },
    type: { type: "string", description: "Free type label such as River, Creek or Fork" },
    parent: { type: "integer", min: 1, description: "River it is a tributary of (its own id = mainstem)" },
    sourceWidth: { type: "number", min: 0, description: "Width at the source, in km (the mouth width follows)" },
    widthFactor: { type: "number", min: 0, description: "How fast the river widens downstream" }
  },
  run(p: Params): CommandResult {
    const id = p.river as number;
    const river = liveRiver(id);
    const wanted = ["name", "type", "parent", "sourceWidth", "widthFactor"].filter(f => p[f] !== undefined);
    if (!wanted.length)
      throw new AgentError(
        "updateRiver: give at least one of name, type, parent, sourceWidth or widthFactor to change"
      );
    if (p.parent !== undefined && !pack.rivers.some(r => r.i === p.parent))
      throw new AgentError(`updateRiver: river ${p.parent} does not exist`);
    if (typeof p.name === "string") Rivers.rename(id, p.name);
    if (typeof p.type === "string") Rivers.setType(id, p.type);
    if (p.parent !== undefined) Rivers.setParent(id, p.parent as number);
    if (p.sourceWidth !== undefined || p.widthFactor !== undefined) {
      // setWidth takes both values: the one not given keeps its current value
      Rivers.setWidth(
        id,
        (p.sourceWidth as number | undefined) ?? river.sourceWidth,
        (p.widthFactor as number | undefined) ?? river.widthFactor
      );
    }
    redrawNetwork("river", id);
    return {
      ok: true,
      message: `River ${id} "${river.name}" updated (${wanted.join(", ")})`,
      changed: wanted.length,
      details: {
        river: id,
        changed: wanted,
        name: river.name,
        type: river.type,
        parent: river.parent,
        sourceWidth: river.sourceWidth,
        widthFactor: river.widthFactor
      }
    };
  }
};

export const featureCommands: Command[] = [
  addMarker,
  removeMarker,
  addRoute,
  updateRoute,
  splitRoute,
  joinRoutes,
  removeRoute,
  addRiver,
  updateRiver,
  removeRiver
];

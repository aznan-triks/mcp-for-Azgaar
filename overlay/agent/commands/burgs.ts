import { redrawEmblem, removeEmblem } from "@/renderers/draw-emblems";
import { cellAt, round } from "../geometry";
import { refreshStatistics } from "../queries";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

function liveBurg(id: number) {
  const burg = pack.burgs[id];
  if (!id || !burg || burg.removed) throw new AgentError(`Burg ${id} does not exist`);
  return burg;
}

function freeLandCell(x: number, y: number, ignoreBurg = 0): number {
  const cell = cellAt(x, y);
  if (pack.cells.h[cell] < 20) throw new AgentError(`(${x}, ${y}) is in the water (cell ${cell}). Pick a land point`);
  const there = pack.cells.burg[cell];
  if (there && there !== ignoreBurg)
    throw new AgentError(`Cell ${cell} already holds burg ${there} (${pack.burgs[there].name}). Pick a free cell`);
  return cell;
}

const addBurg: Command = {
  name: "addBurg",
  description: "Create a city at a map point (land, free cell). Owner state, culture and size follow the cell.",
  params: {
    x: { type: "number", required: true, description: "x in map units" },
    y: { type: "number", required: true, description: "y in map units" },
    name: { type: "string", description: "Name (generated from the culture if omitted)" }
  },
  run(p: Params): CommandResult {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    freeLandCell(x, y);
    const id = Burgs.add([x, y]);
    if (typeof p.name === "string") pack.burgs[id].name = p.name;
    redrawEmblem("burg", id);
    Layers.draw("burgIcons", "labels", "routes");
    refreshStatistics();
    const burg = pack.burgs[id];
    return {
      ok: true,
      message: `Burg ${id} "${burg.name}" created`,
      changed: 1,
      details: { burg: id, name: burg.name, cell: burg.cell, state: burg.state, population: burg.population }
    };
  }
};

const moveBurg: Command = {
  name: "moveBurg",
  description: "Move a city to another land cell. A capital cannot leave its state.",
  params: {
    burg: { type: "integer", required: true, min: 1, description: "Burg id" },
    x: { type: "number", required: true, description: "x in map units" },
    y: { type: "number", required: true, description: "y in map units" }
  },
  run(p: Params): CommandResult {
    const id = p.burg as number;
    const burg = liveBurg(id);
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const cell = freeLandCell(x, y, id);
    const newState = pack.cells.state[cell];
    if (newState !== burg.state && burg.capital)
      throw new AgentError("A capital cannot be relocated into another state");
    // Same steps as the relocate tool of the burg editor.
    const from = { cell: burg.cell, state: burg.state };
    pack.cells.burg[burg.cell] = 0;
    pack.cells.burg[cell] = id;
    burg.cell = cell;
    burg.state = newState;
    burg.x = x;
    burg.y = y;
    if (burg.capital) pack.states[newState].center = cell;
    if (burg.label) Object.assign(burg.label, { dx: 0, dy: 0, pathPoints: undefined });
    Layers.draw("burgIcons", "labels");
    refreshStatistics();
    return {
      ok: true,
      message: `Burg ${id} "${burg.name}" moved`,
      changed: 1,
      details: { from, to: { cell, state: newState } }
    };
  }
};

const removeBurg: Command = {
  name: "removeBurg",
  description: "Delete a city. Capitals and market centres cannot be deleted.",
  params: { burg: { type: "integer", required: true, min: 1, description: "Burg id" } },
  run(p: Params): CommandResult {
    const id = p.burg as number;
    const burg = liveBurg(id);
    if (burg.capital) throw new AgentError("A capital cannot be removed: change the state capital first");
    if (pack.markets?.some(m => m.centerBurgId === id))
      throw new AgentError("A market centre cannot be removed: remove the market first");
    const name = burg.name;
    Burgs.remove(id);
    removeEmblem("burg", id);
    Layers.draw("burgIcons", "labels");
    refreshStatistics();
    return { ok: true, message: `Burg ${id} "${name}" removed`, changed: 1 };
  }
};

const FEATURES = ["citadel", "walls", "plaza", "temple", "shanty", "port"] as const;

const editBurg: Command = {
  name: "editBurg",
  description:
    "Change a city's population (number of people) and/or its features: citadel, walls, plaza (market square), temple, shanty town, port. A port needs navigable water nearby. A plaza that is the centre of a market cannot be removed.",
  params: {
    burg: { type: "integer", required: true, min: 1, description: "Burg id" },
    population: { type: "number", min: 0, description: "Number of inhabitants, as the interface shows it" },
    citadel: { type: "boolean", description: "Has a citadel" },
    walls: { type: "boolean", description: "Has walls" },
    plaza: { type: "boolean", description: "Has a market square" },
    temple: { type: "boolean", description: "Has a temple" },
    shanty: { type: "boolean", description: "Has a shanty town" },
    port: { type: "boolean", description: "Is a port (needs a navigable water body)" }
  },
  run(p: Params): CommandResult {
    const id = p.burg as number;
    const burg = liveBurg(id);
    const wanted = FEATURES.filter(f => p[f] !== undefined);
    if (p.population === undefined && !wanted.length)
      throw new AgentError("editBurg: give a population and/or at least one feature to change");
    const changed: Record<string, unknown> = {};
    if (p.population !== undefined) {
      const { scale, urbanization } = options.map.units.population;
      const before = round((burg.population ?? 0) * scale * urbanization.rate, 0);
      burg.population = round((p.population as number) / scale / urbanization.rate, 4);
      changed.population = { before, after: round(burg.population * scale * urbanization.rate, 0) };
    }
    for (const feature of wanted) {
      const on = p[feature] === true;
      const was = Boolean(burg[feature]);
      if (was === on) continue;
      if (feature === "plaza" && !on && pack.markets?.some(m => m.centerBurgId === id))
        throw new AgentError("This city's plaza is the centre of a market: it cannot be removed");
      if (feature === "port") {
        if (on) {
          // Same lookup as the burg editor's port toggle.
          const { cells, features } = pack;
          const haven = cells.haven[burg.cell];
          let water: number | null | undefined;
          if (haven) {
            const featureId = cells.f[haven];
            const body = features[featureId];
            water =
              body?.type === "lake" && body.outlet
                ? (Rivers.resolveLakeDrainFeature(featureId) ?? featureId)
                : featureId;
          } else {
            water = Rivers.resolveDrainFeature(burg.cell);
          }
          if (!water) throw new AgentError("No navigable water body found downstream: this city cannot be a port");
          burg.port = water;
        } else {
          burg.port = 0;
        }
      } else {
        burg[feature] = on ? 1 : 0;
      }
      changed[feature] = on;
    }
    Layers.draw("burgIcons", "labels");
    refreshStatistics();
    return {
      ok: true,
      message: `Burg ${id} "${burg.name}" updated`,
      changed: Object.keys(changed).length,
      details: { burg: id, ...changed }
    };
  }
};

export const burgCommands: Command[] = [addBurg, moveBurg, removeBurg, editBurg];

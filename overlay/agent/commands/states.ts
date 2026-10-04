import { Emblems } from "@/generators/emblems-generator";
import type { State } from "@/generators/states-generator";
import { redrawEmblem, removeEmblem } from "@/renderers/draw-emblems";
import { unfog } from "@/renderers/overlays/fogging";
import { getRandomColor } from "@/utils";
import { cellAt, round } from "../geometry";
import { hiddenLayerNote } from "../layers";
import { refreshStatistics } from "../queries";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const liveState = (id: number): State => {
  const state = pack.states[id];
  if (!id || !state || state.removed) throw new AgentError(`State ${id} does not exist`);
  return state;
};

const createState: Command = {
  name: "createState",
  description:
    "Found a new state whose capital is at a map point (land). It starts with that single cell: grow it afterwards with map_select border/circle + assignState. If a city already stands there it becomes the capital, otherwise one is created. Relations with other states are set as the interface does (enemy of its old overlord).",
  params: {
    x: { type: "number", required: true, description: "Capital x in map units" },
    y: { type: "number", required: true, description: "Capital y in map units" },
    name: { type: "string", description: "State name (generated from the local culture if omitted)" },
    color: { type: "string", description: "Hex colour (random if omitted)" } // const-ok: format hint
  },
  async run(p: Params): Promise<CommandResult> {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const { cells, states, burgs } = pack;
    const center = cellAt(x, y);
    if (cells.h[center] < 20) throw new AgentError(`(${x}, ${y}) is in the water: a state needs a land cell`);
    if (p.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(p.color as string))
      throw new AgentError("createState: color must be a 6-digit hex like #aa3355"); // const-ok: format hint
    let burgId = cells.burg[center];
    if (burgId && burgs[burgId].capital)
      throw new AgentError(
        `Cell ${center} already holds the capital of state ${burgs[burgId].state}: pick another point`
      );
    const createdBurg = !burgId;
    if (!burgId) {
      burgId = Burgs.add([x, y]);
      redrawEmblem("burg", burgId);
    }

    // Same steps as the "add state" tool of the states editor.
    const oldState = cells.state[center];
    const newState = states.length;
    burgs[burgId].capital = 1;
    burgs[burgId].state = newState;
    Burgs.changeGroup(burgs[burgId], null);

    const culture = cells.culture[center];
    const baseName = center % 5 === 0 ? (burgs[burgId].name ?? "") : Names.getCulture(culture);
    const name = (p.name as string | undefined) ?? Names.getState(baseName, culture);
    const color = (p.color as string | undefined) ?? getRandomColor();
    const coa = Emblems.generate(burgs[burgId].coa, 0.4, null, pack.cultures[culture].type);
    coa.shield = Emblems.getShield(culture, undefined);

    const diplomacy = states.map(s => {
      if (!s.i || s.removed) return "x";
      if (!oldState) {
        s.diplomacy?.push("Neutral");
        return "Neutral";
      }
      let relation = states[oldState].diplomacy?.[s.i] as string;
      if (s.i === oldState) relation = "Enemy";
      else if (relation === "Ally" || relation === "Friendly" || relation === "Vassal") relation = "Suspicion";
      else if (relation === "Suspicion") relation = "Neutral";
      else if (relation === "Enemy" || relation === "Rival") relation = "Friendly";
      else if (relation === "Suzerain") relation = "Enemy";
      s.diplomacy?.push(relation);
      return relation;
    });
    diplomacy.push("x");
    states[0].diplomacy?.push([
      `Independance declaration`,
      `${name} declared its independance from ${states[oldState].name}`
    ] as unknown as string);

    cells.state[center] = newState;
    cells.province[center] = 0;
    states.push({
      i: newState,
      name,
      diplomacy,
      provinces: [],
      color,
      expansionism: 0.5,
      capital: burgId,
      type: "Generic",
      center,
      culture,
      military: [],
      alert: 1,
      coa
    } as unknown as State);

    States.getPoles();
    States.findNeighbors();
    States.collectStatistics();
    States.defineStateForms([newState]);
    const { adjustProvinces } = await import("@/controllers/states-editor");
    adjustProvinces([cells.province[center]]);
    Layers.draw("burgIcons", "labels", "routes");
    redrawEmblem("state", newState);
    Layers.draw("states", "borders");
    refreshStatistics();
    const created = pack.states[newState];
    return {
      ok: true,
      message: `State ${newState} "${created.fullName ?? created.name}" founded`,
      changed: 1,
      details: {
        state: newState,
        name: created.fullName ?? created.name,
        color,
        capitalBurg: burgId,
        capitalCell: center,
        createdNewCity: createdBurg,
        leftState: oldState
      }
    };
  }
};

const removeState: Command = {
  name: "removeState",
  description:
    "Dissolve a state: its land becomes unclaimed, its provinces are deleted, its cities stay as independent cities (the capital loses its status).",
  params: { state: { type: "integer", required: true, min: 1, description: "State id" } },
  run(p: Params): CommandResult {
    const id = p.state as number;
    const state = liveState(id);
    const name = state.fullName ?? state.name;
    const cellsBefore = pack.cells.i.filter(c => pack.cells.state[c] === id && pack.cells.h[c] >= 20).length;
    // Same steps as the editor's stateRemove.
    unfog(`focusState${id}`);
    let burgsFreed = 0;
    for (const burg of pack.burgs) {
      if (burg.state !== id) continue;
      burgsFreed += 1;
      burg.state = 0;
      if (burg.capital) {
        burg.capital = 0;
        Burgs.changeGroup(burg, null);
      }
    }
    for (const c of pack.cells.i) if (pack.cells.state[c] === id) pack.cells.state[c] = 0;
    removeEmblem("state", id);
    for (const prov of state.provinces ?? []) {
      pack.provinces[prov] = { i: prov, removed: true } as (typeof pack.provinces)[number];
      for (const c of pack.cells.i) if (pack.cells.province[c] === prov) pack.cells.province[c] = 0;
      removeEmblem("province", prov);
    }
    for (const other of pack.states) {
      if (!other.i || other.removed || !other.neighbors) continue;
      other.neighbors = other.neighbors.filter((n: number) => n !== id);
    }
    if (state.label) delete state.label;
    pack.states[id] = { i: id, removed: true } as State;
    Layers.draw("burgIcons", "labels", "military", "borders", "provinces", "states");
    refreshStatistics();
    return {
      ok: true,
      message: `State ${id} "${name}" dissolved`,
      changed: cellsBefore,
      details: { landCellsNowUnclaimed: cellsBefore, burgsNowIndependent: burgsFreed }
    };
  }
};

const setCapital: Command = {
  name: "setCapital",
  description:
    "Make an existing city the capital of its state (the old capital becomes an ordinary city). The city must belong to a state.",
  params: { burg: { type: "integer", required: true, min: 1, description: "Burg id" } },
  run(p: Params): CommandResult {
    const id = p.burg as number;
    const burg = pack.burgs[id];
    if (!burg || burg.removed) throw new AgentError(`Burg ${id} does not exist`);
    if (burg.capital) throw new AgentError(`Burg ${id} is already a capital`);
    if (!burg.state) throw new AgentError("Neutral lands cannot have a capital: give the city to a state first");
    // Same steps as the burg editor's toggleCapital.
    const state = pack.states[burg.state];
    const oldCapital = pack.burgs[state.capital as number];
    state.capital = id;
    state.center = burg.cell;
    burg.capital = 1;
    Burgs.changeGroup(burg);
    oldCapital.capital = 0;
    Burgs.changeGroup(oldCapital);
    Layers.draw("burgIcons", "labels");
    refreshStatistics();
    return {
      ok: true,
      message: `"${burg.name}" is now the capital of ${state.fullName ?? state.name}`,
      changed: 1,
      details: { state: state.i, newCapital: id, oldCapital: oldCapital.i }
    };
  }
};

const mergeStates: Command = {
  name: "mergeStates",
  description:
    "Merge one or several states into another: their land, cities, provinces and regiments go to `into`; the merged states disappear and their capitals become ordinary cities. With as_provinces each merged state is kept as a province of `into` instead.",
  params: {
    states: { type: "integers", required: true, description: "Ids of the states to merge away" },
    into: { type: "integer", required: true, min: 1, description: "Id of the state that absorbs them" },
    as_provinces: {
      type: "boolean",
      description: "Keep each merged state as a province of `into` (replaces its own provinces)"
    }
  },
  async run(p: Params): Promise<CommandResult> {
    const into = p.into as number;
    const merged = [...new Set(p.states as number[])];
    const ruler = liveState(into);
    if (!merged.length) throw new AgentError("mergeStates: give at least one state to merge");
    if (merged.includes(into)) throw new AgentError("mergeStates: a state cannot be merged into itself");
    const absorbed = merged.map(id => liveState(id));
    const before = { cells: ruler.cells ?? 0, burgs: ruler.burgs ?? 0 };
    refreshStatistics();
    const gained = absorbed.reduce((n, s) => n + (s.cells ?? 0), 0);
    const { mergeStates: merge } = await import("@/controllers/states-editor");
    merge(merged, into, p.as_provinces === true);
    refreshStatistics();
    const after = pack.states[into];
    return {
      ok: true,
      message: `${absorbed.map(s => `"${s.fullName ?? s.name}"`).join(", ")} merged into "${ruler.fullName ?? ruler.name}"`,
      changed: gained,
      details: {
        into,
        merged,
        cellsBefore: before.cells,
        cellsAfter: after.cells ?? 0,
        burgsBefore: before.burgs,
        burgsAfter: after.burgs ?? 0,
        keptAsProvinces: p.as_provinces === true
      },
      warnings: hiddenLayerNote(p.as_provinces ? ["provinces"] : [], "The new provinces")
    };
  }
};

export const stateCommands: Command[] = [createState, removeState, setCapital, mergeStates];

import { REGIMENT_ID_BASE as REGIMENT_ID_FACTOR } from "../config";
import { AgentError, type Command, type CommandResult, type ParamSpecs, type Params } from "../types";

// Existing wire format: state id times the protocol factor plus regiment id, including zero.
export { REGIMENT_ID_FACTOR };

const address: ParamSpecs = {
  id: {
    type: "integer",
    min: REGIMENT_ID_FACTOR,
    description: "Composite military id (stateId times protocol factor plus regimentId)"
  },
  stateId: { type: "integer", min: 1, description: "State id, together with regimentId instead of id" },
  regimentId: { type: "integer", min: 0, max: REGIMENT_ID_FACTOR - 1, description: "Local regiment id (zero is valid)" }
};
const point: ParamSpecs = {
  x: { type: "number", required: true, description: "Map x coordinate" },
  y: { type: "number", required: true, description: "Map y coordinate" }
};
const properties: ParamSpecs = {
  name: { type: "string", description: "Regiment name" },
  units: { type: "units", description: "Troop composition, e.g. {infantry: 800, archers: 200}" },
  naval: { type: "boolean", description: "True for a fleet" },
  icon: { type: "string", description: "Emoji or native icon id" }
};

function resolve(p: Params): [number, number] {
  let stateId: number;
  let regimentId: number;
  if (p.id !== undefined) {
    if (p.stateId !== undefined || p.regimentId !== undefined) throw new AgentError("Use id OR stateId + regimentId");
    stateId = Math.floor((p.id as number) / REGIMENT_ID_FACTOR);
    regimentId = (p.id as number) % REGIMENT_ID_FACTOR;
  } else {
    if (p.stateId === undefined || p.regimentId === undefined) throw new AgentError("Give id OR stateId + regimentId");
    stateId = p.stateId as number;
    regimentId = p.regimentId as number;
  }
  const state = pack.states[stateId];
  if (!state || state.removed || !state.military?.some(r => r.i === regimentId))
    throw new AgentError(`Regiment ${stateId}-${regimentId} does not exist`);
  return [stateId, regimentId];
}

function setProperties(stateId: number, regimentId: number, p: Params): void {
  if (p.units !== undefined) Military.setUnits(stateId, regimentId, p.units as Record<string, number>);
  if (p.name !== undefined) Military.rename(stateId, regimentId, p.name as string);
  if (p.naval !== undefined) Military.setNaval(stateId, regimentId, p.naval as boolean);
  if (p.icon !== undefined) Military.setIcon(stateId, regimentId, p.icon as string);
}

function done(message: string, stateId?: number, regimentId?: number): CommandResult {
  Layers.draw("military");
  const regiment = pack.states[stateId ?? 0]?.military?.find(r => r.i === regimentId);
  const warnings: string[] = [];
  if (regiment?.n) {
    const cell = Pack.requireCell(regiment.x, regiment.y);
    if (pack.cells.h[cell] >= 20 && pack.cells.c[cell].every(c => pack.cells.h[c] >= 20))
      warnings.push("Naval regiment is on an inland land cell");
  }
  return {
    ok: true,
    message,
    changed: 1,
    warnings,
    details:
      stateId !== undefined && regimentId !== undefined
        ? { stateId, regimentId, id: stateId * REGIMENT_ID_FACTOR + regimentId }
        : undefined
  };
}

export const militaryCommands: Command[] = [
  {
    name: "addRegiment",
    description: "Raise a regiment or fleet. Creation takes stateId and map coordinates, returns both id forms.",
    params: {
      stateId: { type: "integer", required: true, min: 1, description: "Owner state" },
      ...point,
      ...properties
    },
    run(p) {
      const stateId = p.stateId as number;
      const military = pack.states[stateId]?.military ?? [];
      if (military.some(r => r.i >= REGIMENT_ID_FACTOR - 1))
        throw new AgentError("Composite regiment id capacity exhausted");
      const regimentId = Military.add(stateId, p.x as number, p.y as number);
      setProperties(stateId, regimentId, p);
      return done("Regiment added", stateId, regimentId);
    }
  },
  {
    name: "updateRegiment",
    description: "Update a regiment's name, composition, naval flag or icon.",
    params: { ...address, ...properties },
    run(p) {
      const [s, r] = resolve(p);
      if (!Object.keys(properties).some(key => p[key] !== undefined))
        throw new AgentError("Give at least one property to update");
      setProperties(s, r, p);
      return done("Regiment updated", s, r);
    }
  },
  {
    name: "moveRegiment",
    description: "Move a regiment without changing its base.",
    params: { ...address, ...point, rebase: { type: "boolean", description: "Also move the base (default false)" } },
    run(p) {
      const [s, r] = resolve(p);
      Military.move(s, r, p.x as number, p.y as number);
      if (p.rebase === true) Military.setBase(s, r, p.x as number, p.y as number);
      return done("Regiment moved", s, r);
    }
  },
  {
    name: "splitRegiment",
    description: "Split troops in half into a new regiment of the same state.",
    params: address,
    run(p) {
      const [s, r] = resolve(p);
      if (pack.states[s].military!.some(reg => reg.i >= REGIMENT_ID_FACTOR - 1))
        throw new AgentError("Composite regiment id capacity exhausted");
      return done("Regiment split", s, Military.split(s, r));
    }
  },
  {
    name: "attachRegiment",
    description: "Merge source troops into a target regiment, disbanding the source.",
    params: {
      ...address,
      targetId: {
        type: "integer",
        min: REGIMENT_ID_FACTOR,
        description: "Composite target id, OR targetStateId + targetRegimentId"
      },
      targetStateId: { type: "integer", min: 1, description: "Target state" },
      targetRegimentId: {
        type: "integer",
        min: 0,
        max: REGIMENT_ID_FACTOR - 1,
        description: "Target local regiment id"
      }
    },
    run(p) {
      const [s, r] = resolve(p);
      const [ts, tr] = resolve({ id: p.targetId, stateId: p.targetStateId, regimentId: p.targetRegimentId });
      Military.attach(s, r, ts, tr);
      return done("Regiment attached", ts, tr);
    }
  },
  {
    name: "removeRegiment",
    description: "Disband a regiment or fleet.",
    params: address,
    run(p) {
      const [s, r] = resolve(p);
      Military.remove(s, r);
      return done("Regiment removed", s, r);
    }
  },
  {
    name: "regenerateMilitary",
    description: "Regenerate all military forces using Azgaar's generator.",
    params: {},
    run() {
      Military.regenerate();
      return done("Military regenerated");
    }
  }
];

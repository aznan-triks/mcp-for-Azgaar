import { requireColor } from "@/utils/colorUtils";
import { hiddenLayerNote } from "../layers";
import { getSelection } from "../selection";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

// zones are brushed over cells by the zones editor; MCP gives the same cells by list or by a map_select id
interface Zone {
  i: number;
  name: string;
  type: string;
  color: string;
  cells: number[];
  hidden?: boolean;
}

const livingZone = (zoneId: number): Zone => {
  const zone = pack.zones.find(({ i }) => i === zoneId);
  if (!zone) throw new AgentError(`Zone ${zoneId} does not exist`);
  return zone;
};

/** Cells come as an explicit list (`cells`) or as a selection id from map_select (`selection`); exactly one of them. */
function resolveCells(p: Params, context: string): number[] {
  const [cells, selection] = [p.cells as number[] | undefined, p.selection as string | undefined];
  if ((cells === undefined) === (selection === undefined))
    throw new AgentError(`${context}: give exactly one of "cells" (cell ids) or "selection" (a map_select id)`);
  const ids = cells ?? [...getSelection(selection as string)];
  const count = pack.cells.i.length;
  for (const cell of ids)
    if (!Number.isInteger(cell) || cell < 0 || cell >= count)
      throw new AgentError(`${context}: cell ${cell} does not exist (cells run from 0 to ${count - 1})`);
  if (!ids.length) throw new AgentError(`${context}: a zone needs at least one cell`);
  return [...new Set(ids)];
}

// 42 hatches, numbered from 0 (Azgaar fills new zones with `url(#hatch${i % 42})`); Zones.recolor itself
// only speaks HEX (requireColor), so a hatch is stored on the zone after the same bounds check as Azgaar's
const HATCH_FILL = /^url\(#hatch([0-9]|[1-3][0-9]|4[01])\)$/;

interface Fill {
  kind: "hex" | "hatch";
  value: string;
}

const parseFill = (p: Params, context: string): Fill | undefined => {
  if (p.color === undefined) return undefined;
  const color = requireColorOrHatch(p.color, context);
  return color;
};

function requireColorOrHatch(value: unknown, context: string): Fill {
  if (typeof value === "string") {
    if (HATCH_FILL.test(value)) return { kind: "hatch", value };
    if (/^url\(#/i.test(value))
      throw new AgentError(`${context}: the only non-colour fills are the 42 hatches, url(#hatch0) to url(#hatch41)`); // const-ok: pattern examples, not live colours
  }
  const hex = requireColor(value); // CSS names and notations normalize to HEX, exactly like the editor; anything else gets Azgaar's own error
  return { kind: "hex", value: hex };
}

/** HEX goes through Zones.recolor (the editor path); a hatch fill is the value zones are born with, so it is stored directly. */
function applyFill(zoneId: number, fill: Fill): void {
  if (fill.kind === "hex") Zones.recolor(zoneId, fill.value);
  else livingZone(zoneId).color = fill.value;
}

const redraw = (warnings: string[]): void => {
  Layers.draw("zones");
  warnings.push(...hiddenLayerNote(["zones"], "Zones"));
};

const addZone: Command = {
  name: "addZone",
  description:
    "Create a zone (a named area with its own label, colour or hatch, and population) over cells, exactly like painting one in the zones editor. Cover: `cells` (cell ids, e.g. gathered from map_list) or `selection` (a map_select id — the natural companion: map_select circle/rect/state, then addZone). Zones appear with layer zones (map_layers).",
  params: {
    name: { type: "string", required: true, description: "Zone name, also its description" },
    type: {
      type: "string",
      required: true,
      description: "Free label such as Invasion, Disease, Quarantine, Hunting grounds"
    },
    cells: { type: "integers", description: "Cell ids to cover (give `cells` OR `selection`, not both)" },
    selection: { type: "string", description: "Selection id from map_select to cover" },
    color: {
      type: "string",
      description:
        "CSS colour (hex or a colour name, normalized like the editor) or hatch fill url(#hatch0) to url(#hatch41); default: next hatch like the editor"
    }, // const-ok: pattern examples, not live colours
    hidden: { type: "boolean", description: "Start hidden (labels and shapes exist but are not drawn)" }
  },
  run(p: Params): CommandResult {
    const name = p.name as string;
    const type = p.type as string;
    const ids = resolveCells(p, "addZone");
    const fill = parseFill(p, "addZone");
    const zoneId = Zones.add(name, type, ids);
    if (fill !== undefined && fill.value !== `url(#hatch${zoneId % 42})`) applyFill(zoneId, fill);
    if (p.hidden === true) Zones.setHidden(zoneId, true);
    const warnings: string[] = [];
    redraw(warnings);
    const zone = livingZone(zoneId);
    return {
      ok: true,
      message: `Zone ${zoneId} "${zone.name}" (${zone.type}) created over ${zone.cells.length} cells.`,
      changed: 1,
      details: {
        zone: zoneId,
        name: zone.name,
        type: zone.type,
        color: zone.color,
        cells: zone.cells.length,
        hidden: Boolean(zone.hidden)
      },
      ...(warnings.length ? { warnings } : {})
    };
  }
};

const updateZone: Command = {
  name: "updateZone",
  description: "Change a zone: name, type, colour or hatch fill, and/or visibility. At least one field must be given.",
  params: {
    zone: { type: "integer", required: true, min: 0, description: "Zone id (map_list kind=zones)" },
    name: { type: "string", description: "New name (also the zone's description)" },
    type: { type: "string", description: "New free type label" },
    color: {
      type: "string",
      description:
        "CSS colour (hex or a colour name, normalized like the editor) or hatch fill url(#hatch0) to url(#hatch41)"
    }, // const-ok: pattern examples, not live colours
    hidden: { type: "boolean", description: "true hides, false shows again" }
  },
  run(p: Params): CommandResult {
    const zoneId = p.zone as number;
    const [name, type, hidden] = [
      p.name as string | undefined,
      p.type as string | undefined,
      p.hidden as boolean | undefined
    ];
    if ([name, type, p.color, hidden].every(field => field === undefined))
      throw new AgentError("updateZone: give at least one of name, type, color or hidden");
    livingZone(zoneId);
    const fill = parseFill(p, "updateZone");
    const changes: string[] = [];
    if (name !== undefined) {
      Zones.rename(zoneId, name);
      changes.push("name");
    }
    if (type !== undefined) {
      Zones.setType(zoneId, type);
      changes.push("type");
    }
    if (fill !== undefined) {
      applyFill(zoneId, fill);
      changes.push("color");
    }
    if (hidden !== undefined) {
      Zones.setHidden(zoneId, hidden);
      changes.push(hidden ? "hidden" : "shown");
    }
    const warnings: string[] = [];
    redraw(warnings);
    const zone = livingZone(zoneId);
    return {
      ok: true,
      message: `Zone ${zoneId} "${zone.name}" updated (${changes.join(", ")}).`,
      changed: changes.length,
      details: {
        zone: zoneId,
        changed: changes,
        name: zone.name,
        type: zone.type,
        color: zone.color,
        hidden: Boolean(zone.hidden),
        cells: zone.cells.length
      },
      ...(warnings.length ? { warnings } : {})
    };
  }
};

const setZoneCells: Command = {
  name: "setZoneCells",
  description:
    "Replace the cells a zone covers: `cells` (cell ids) or `selection` (a map_select id), exactly one of them. All ids are checked before anything changes.",
  params: {
    zone: { type: "integer", required: true, min: 0, description: "Zone id (map_list kind=zones)" },
    cells: { type: "integers", description: "New cell ids (give `cells` OR `selection`, not both)" },
    selection: { type: "string", description: "Selection id from map_select" }
  },
  run(p: Params): CommandResult {
    const zoneId = p.zone as number;
    livingZone(zoneId);
    const ids = resolveCells(p, "setZoneCells");
    const before = livingZone(zoneId).cells.length;
    Zones.setCells(zoneId, ids);
    const warnings: string[] = [];
    redraw(warnings);
    return {
      ok: true,
      message: `Zone ${zoneId} now covers ${ids.length} cells (was ${before}).`,
      changed: ids.length,
      details: { zone: zoneId, cells: ids.length, previousCells: before },
      ...(warnings.length ? { warnings } : {})
    };
  }
};

const removeZone: Command = {
  name: "removeZone",
  description: "Delete a zone (its cells and population elsewhere on the map are untouched).",
  params: {
    zone: { type: "integer", required: true, min: 0, description: "Zone id (map_list kind=zones)" }
  },
  run(p: Params): CommandResult {
    const zoneId = p.zone as number;
    const [name, cells] = [livingZone(zoneId).name, livingZone(zoneId).cells.length];
    Zones.remove(zoneId);
    const warnings: string[] = [];
    redraw(warnings);
    return {
      ok: true,
      message: `Zone ${zoneId} "${name}" (${cells} cells) deleted.`,
      changed: 1,
      details: { removed: zoneId, name, cells },
      ...(warnings.length ? { warnings } : {})
    };
  }
};

const regenerateZones: Command = {
  name: "regenerateZones",
  description:
    "Regenerate the event zones (invasion, rebels, proselytism, crusade, disease, disaster, eruption, avalanche, fault, flood, tsunami) from the current states, cultures and religions, exactly like map generation does. All existing zones are replaced.",
  params: {},
  run(): CommandResult {
    const before = pack.zones.length;
    Zones.regenerate();
    const warnings: string[] = [];
    redraw(warnings);
    return {
      ok: true,
      message: `Zones regenerated: ${pack.zones.length} event zones (was ${before}).`,
      changed: Math.max(before, pack.zones.length), // clearing the last zones must still create an undo entry
      details: { zones: pack.zones.length, previousZones: before },
      warnings: [
        "Every existing zone was replaced by fresh generated ones; undo with map_undo if this was not intended.",
        ...warnings
      ]
    };
  }
};

export const zoneCommands: Command[] = [addZone, updateZone, setZoneCells, removeZone, regenerateZones];

import { hiddenLayerNote } from "../layers";
import { refreshStatistics } from "../queries";
import { getSelection } from "../selection";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const SELECTION = { type: "string", required: true, description: "Selection id returned by map_select" } as const;
const ONLY_NEUTRAL = {
  type: "boolean",
  description: "Only change cells whose current value is 0 (neutral/unclaimed)"
} as const;

type Field = "state" | "province" | "culture" | "religion";

function countByValue(field: Field): Map<number, number> {
  const counts = new Map<number, number>();
  const values = pack.cells[field];
  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) continue;
    counts.set(values[cell], (counts.get(values[cell]) ?? 0) + 1);
  }
  return counts;
}

function bump(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

function entityName(field: Field, id: number): string {
  const list = { state: pack.states, province: pack.provinces, culture: pack.cultures, religion: pack.religions }[
    field
  ];
  const entry = list[id] as { name?: string; fullName?: string } | undefined;
  return entry?.fullName ?? entry?.name ?? `#${id}`;
}

function diffTable(
  field: Field,
  before: Map<number, number>,
  after: Map<number, number>,
  touched: Set<number>
): Record<string, unknown> {
  const table: Record<string, unknown> = {};
  for (const id of touched)
    table[`${id} ${entityName(field, id)}`] = { before: before.get(id) ?? 0, after: after.get(id) ?? 0 };
  return table;
}

const assignState: Command = {
  name: "assignState",
  description:
    "Give the selected land cells to a state (0 = unclaimed). Cities in these cells change owner. State capital cells are never taken.",
  params: {
    selection: SELECTION,
    state: { type: "integer", required: true, min: 0, description: "Receiving state id (0 = unclaimed)" },
    only_neutral: ONLY_NEUTRAL
  },
  async run(p: Params): Promise<CommandResult> {
    const target = p.state as number;
    if (target && (!pack.states[target] || pack.states[target].removed))
      throw new AgentError(`assignState: state ${target} does not exist`);
    const { cells } = pack;
    const skipped: Record<string, number> = {};
    const changes = new Map<number, number>();
    for (const cell of getSelection(p.selection as string)) {
      const current = cells.state[cell];
      if (cells.h[cell] < 20) bump(skipped, "water");
      else if (current === target) bump(skipped, "already_in_target");
      else if (p.only_neutral && current !== 0) bump(skipped, "owned_by_a_state");
      else if (cell === pack.states[current].center) bump(skipped, "capital_cell");
      else changes.set(cell, target);
    }
    if (!changes.size) return { ok: true, message: "Nothing to change", changed: 0, skipped };

    const before = countByValue("state");
    const provincesBefore = pack.provinces.filter(x => x.i && !x.removed).length;
    const touched = new Set<number>([target]);
    const affectedProvinces: number[] = [];
    let burgsMoved = 0;
    // Same steps as the state paint tool of the interface (applyStatesPaint).
    for (const [cell, state] of changes) {
      touched.add(cells.state[cell]);
      affectedProvinces.push(cells.province[cell]);
      cells.state[cell] = state;
      if (cells.burg[cell]) {
        pack.burgs[cells.burg[cell]].state = state;
        burgsMoved += 1;
      }
    }
    const { adjustProvinces } = await import("@/controllers/states-editor");
    States.getPoles();
    adjustProvinces([...new Set(affectedProvinces)]);
    Layers.draw("states", "borders", "provinces");
    for (const id of touched) if (pack.states[id]?.label) delete pack.states[id].label;
    Layers.draw("labels");
    refreshStatistics();

    const warnings: string[] = [];
    if (burgsMoved && pack.markets?.length)
      warnings.push("Cities changed owner; trade markets and diplomacy are not recomputed (same as the interface).");
    const provincesAfter = pack.provinces.filter(x => x.i && !x.removed).length;
    return {
      ok: true,
      message: `${changes.size} cells given to ${target ? entityName("state", target) : "unclaimed land"}`,
      changed: changes.size,
      skipped,
      details: {
        cellsPerState: diffTable("state", before, countByValue("state"), touched),
        burgsChangedOwner: burgsMoved,
        provinces: { before: provincesBefore, after: provincesAfter }
      },
      warnings
    };
  }
};

const assignProvince: Command = {
  name: "assignProvince",
  description:
    "Give selected land cells to a province. The province must belong to the same state as each cell. Province centres are never moved.",
  params: { selection: SELECTION, province: { type: "integer", required: true, min: 1, description: "Province id" } },
  async run(p: Params): Promise<CommandResult> {
    const target = p.province as number;
    const province = pack.provinces[target];
    if (!province || province.removed) throw new AgentError(`assignProvince: province ${target} does not exist`);
    const { cells } = pack;
    const skipped: Record<string, number> = {};
    const changes = new Map<number, number>();
    for (const cell of getSelection(p.selection as string)) {
      const current = cells.province[cell];
      if (cells.h[cell] < 20) bump(skipped, "water");
      else if (!cells.state[cell]) bump(skipped, "unclaimed_land");
      else if (cells.state[cell] !== province.state) bump(skipped, "different_state");
      else if (current === target) bump(skipped, "already_in_target");
      else if (current && cell === pack.provinces[current].center) bump(skipped, "province_centre_cell");
      else changes.set(cell, target);
    }
    if (!changes.size) return { ok: true, message: "Nothing to change", changed: 0, skipped };
    const before = countByValue("province");
    const touched = new Set<number>([target]);
    for (const [cell, id] of changes) {
      touched.add(cells.province[cell]);
      cells.province[cell] = id;
    }
    touched.delete(0);
    // Refresh the province counters the same way the editor does after a paint (area, population, burgs).
    const { collectStatistics } = await import("@/controllers/provinces-editor");
    collectStatistics();
    Provinces.getPoles();
    Layers.draw("borders", "provinces");
    Layers.draw("labels");
    return {
      ok: true,
      message: `${changes.size} cells given to province ${entityName("province", target)}`,
      changed: changes.size,
      skipped,
      warnings: hiddenLayerNote(["provinces"], "The province change"),
      details: { cellsPerProvince: diffTable("province", before, countByValue("province"), touched) }
    };
  }
};

function paintCommand(field: "culture" | "religion"): Command {
  return {
    name: field === "culture" ? "assignCulture" : "assignReligion",
    description: `Give the selected land cells to a ${field}${field === "culture" ? " (cities in these cells take it too)" : ""}.`,
    params: { selection: SELECTION, [field]: { type: "integer", required: true, min: 0, description: `${field} id` } },
    async run(p: Params): Promise<CommandResult> {
      const target = p[field] as number;
      const list = field === "culture" ? pack.cultures : pack.religions;
      if (target && (!list[target] || list[target].removed)) throw new AgentError(`${field} ${target} does not exist`);
      const { cells } = pack;
      const skipped: Record<string, number> = {};
      const changes = new Map<number, number>();
      for (const cell of getSelection(p.selection as string)) {
        if (cells.h[cell] < 20) bump(skipped, "water");
        else if (cells[field][cell] === target) bump(skipped, "already_in_target");
        else changes.set(cell, target);
      }
      if (!changes.size) return { ok: true, message: "Nothing to change", changed: 0, skipped };
      const before = countByValue(field);
      const touched = new Set<number>([target]);
      for (const [cell, id] of changes) {
        touched.add(cells[field][cell]);
        cells[field][cell] = id;
        if (field === "culture" && cells.burg[cell]) pack.burgs[cells.burg[cell]].culture = id;
      }
      // Refresh the entity counters the same way the editor does after a paint (cells, area, population).
      if (field === "culture") {
        const { culturesCollectStatistics } = await import("@/controllers/cultures-editor");
        culturesCollectStatistics();
      } else {
        const { religionsCollectStatistics } = await import("@/controllers/religions-editor");
        religionsCollectStatistics();
      }
      Layers.draw(field === "culture" ? "cultures" : "religions");
      return {
        ok: true,
        message: `${changes.size} cells given to ${field} ${entityName(field, target)}`,
        changed: changes.size,
        skipped,
        warnings: hiddenLayerNote([field === "culture" ? "cultures" : "religions"], `The ${field} change`),
        details: { [`cellsPer${field}`]: diffTable(field, before, countByValue(field), touched) }
      };
    }
  };
}

export const territoryCommands: Command[] = [
  assignState,
  assignProvince,
  paintCommand("culture"),
  paintCommand("religion")
];

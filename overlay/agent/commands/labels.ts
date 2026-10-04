import { getLabelsIndex } from "@/renderers/labels/label-data";
import { round } from "../geometry";
import { hiddenLayerNote } from "../layers";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const KINDS = ["state", "province", "burg", "river", "route", "added"] as const;
type Kind = (typeof KINDS)[number];

/** A label's identity and where it currently sits (its automatic anchor plus the dx/dy shift). */
function labelState(
  kind: Kind,
  id: number
): {
  text: string;
  group: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  hidden: boolean;
} {
  const entity = Labels.getEntity(kind, id) as { label?: { hidden?: boolean } } | undefined;
  const entry = getLabelsIndex().find(l => l.type === kind && l.entityId === id);
  if (!entity || !entry) throw new AgentError(`moveLabel: ${kind} ${id} has no label`);
  const [dx, dy] = [entry.dx ?? 0, entry.dy ?? 0];
  return {
    text: entry.text,
    group: entry.group,
    x: round(entry.anchor[0] + dx),
    y: round(entry.anchor[1] + dy),
    dx,
    dy,
    hidden: Boolean(entity.label?.hidden)
  };
}

const moveLabel: Command = {
  name: "moveLabel",
  description:
    "Shift the label of a state, province, city (burg), river, route or added label by an offset: dx, dy in map units added to its automatic position (positive dx moves right, positive dy moves down). Or hide / show it, or reset it to its automatic position.",
  params: {
    kind: { type: "string", required: true, enum: KINDS, description: "What the label belongs to" },
    id: { type: "integer", required: true, min: 1, description: "Entity id (the label's own id for kind=added)" },
    dx: { type: "number", description: "Horizontal shift in map units (give dy too)" },
    dy: { type: "number", description: "Vertical shift in map units (give dx too)" },
    hide: { type: "boolean", description: "true hides the label, false shows it again" },
    reset: {
      type: "boolean",
      description: "Put the label back at its automatic position and show it (ignores dx/dy/hide)"
    }
  },
  run(p: Params): CommandResult {
    const kind = p.kind as Kind;
    const id = p.id as number;
    const entity = Labels.getEntity(kind, id) as { label?: Record<string, unknown> } | undefined;
    if (!entity) throw new AgentError(`moveLabel: ${kind} ${id} does not exist`);
    const before = labelState(kind, id);
    const changed: Record<string, unknown> = {};
    if (p.reset === true) {
      Labels.resetOverride(kind, id);
      changed.reset = true;
    } else {
      if (p.dx !== undefined || p.dy !== undefined) {
        if (p.dx === undefined || p.dy === undefined)
          throw new AgentError("moveLabel: give both dx and dy (or neither to keep the current shift)");
        entity.label = { ...entity.label, dx: p.dx, dy: p.dy };
        changed.offset = { dx: p.dx, dy: p.dy };
      }
      if (p.hide !== undefined) {
        entity.label = { ...entity.label, hidden: p.hide };
        changed.hidden = p.hide;
      }
    }
    if (!Object.keys(changed).length) throw new AgentError("moveLabel: give dx+dy, hide, or reset");
    Layers.draw("labels");
    const after = labelState(kind, id);
    return {
      ok: true,
      message: `Label of ${kind} ${id} "${before.text}" updated`,
      changed: 1,
      details: { kind, id, before, after, ...changed },
      warnings: hiddenLayerNote(["labels"], "The label")
    };
  }
};

export const labelCommands: Command[] = [moveLabel];

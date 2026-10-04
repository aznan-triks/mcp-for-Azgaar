import { Emblems } from "@/generators/emblems-generator";
import { type EmblemType, redrawEmblem } from "@/renderers/draw-emblems";
import type { Emblem } from "@/types/emblems";
import { P } from "@/utils";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

// The shield shapes the interface's emblem editor offers (fixed vocabulary of Azgaar's emblem renderer).
const SHIELDS = [
  "heater",
  "spanish",
  "french",
  "horsehead",
  "horsehead2",
  "polish",
  "hessen",
  "swiss",
  "boeotian",
  "roman",
  "kite",
  "oldFrench",
  "renaissance",
  "baroque",
  "targe",
  "targe2",
  "pavise",
  "wedged",
  "flag",
  "pennon",
  "guidon",
  "banner",
  "dovetail",
  "gonfalon",
  "pennant",
  "round",
  "oval",
  "vesicaPiscis",
  "square",
  "diamond",
  "fantasy1",
  "fantasy2",
  "fantasy3",
  "fantasy4",
  "fantasy5",
  "noldor",
  "gondor",
  "easterling",
  "erebor",
  "ironHills",
  "urukHai",
  "moriaOrc"
] as const;

const KINDS: readonly EmblemType[] = ["state", "province", "burg"];

interface EmblemHolder {
  i: number;
  removed?: boolean;
  cell?: number;
  state?: number;
  culture?: number;
  coa?: Emblem;
}

function emblemEntity(kind: EmblemType, id: number): EmblemHolder {
  const list: Record<EmblemType, EmblemHolder[]> = { state: pack.states, province: pack.provinces, burg: pack.burgs };
  const entity = list[kind][id];
  if (!id || !entity || entity.removed) throw new AgentError(`Emblem: ${kind} ${id} does not exist`);
  if (!entity.coa) throw new AgentError(`Emblem: ${kind} ${id} has no coat of arms`);
  return entity;
}

const regenerateEmblem: Command = {
  name: "regenerateEmblem",
  description:
    "Give a state, province or city (burg) a freshly generated coat of arms: new heraldry derived from its parent's emblem, exactly like the interface's regenerate button. Shape, size and position are kept; change them with setEmblemStyle.",
  params: {
    kind: { type: "string", required: true, enum: KINDS, description: "Entity kind" },
    id: { type: "integer", required: true, min: 1, description: "Entity id" },
    kinship: {
      type: "number",
      min: 0,
      max: 1,
      description: "How much the new heraldry inherits from the parent emblem (default 0.3)"
    }
  },
  run(p: Params): CommandResult {
    const kind = p.kind as EmblemType;
    const entity = emblemEntity(kind, p.id as number);
    // Same steps as the emblem editor's regenerate button: new heraldry from the parent, placement kept.
    let parent: { coa?: EmblemHolder["coa"]; culture?: number } | undefined;
    if (kind === "province") parent = pack.states[entity.state ?? 0];
    else if (kind === "burg") {
      const province = pack.cells.province[entity.cell ?? 0];
      parent = province ? pack.provinces[province] : pack.states[entity.state ?? 0];
    }
    const shield = entity.coa!.shield ?? Emblems.getShield(entity.culture ?? parent?.culture ?? 0, entity.state);
    const { size, x, y } = entity.coa!;
    entity.coa = {
      ...Emblems.generate(parent?.coa ?? null, (p.kinship as number | undefined) ?? 0.3, +P(0.1), undefined),
      shield,
      size,
      x,
      y
    };
    redrawEmblem(kind, entity.i);
    return {
      ok: true,
      message: `${kind} ${entity.i} got a new coat of arms`,
      changed: 1,
      details: { kind, id: entity.i, shield, size: size ?? 1, kinship: (p.kinship as number | undefined) ?? 0.3 }
    };
  }
};

const setEmblemStyle: Command = {
  name: "setEmblemStyle",
  description:
    "Change the look of an existing coat of arms without redrawing its heraldry: the shield shape (heater, round, banner, noldor...) and/or its size (1 = default; 0 hides the emblem from the map).",
  params: {
    kind: { type: "string", required: true, enum: KINDS, description: "Entity kind" },
    id: { type: "integer", required: true, min: 1, description: "Entity id" },
    shield: { type: "string", enum: SHIELDS, description: "Shield shape" },
    size: { type: "number", min: 0, max: 5, description: "Emblem size (1 = default; 0 hides it from the map)" }
  },
  run(p: Params): CommandResult {
    const kind = p.kind as EmblemType;
    const entity = emblemEntity(kind, p.id as number);
    if (p.shield === undefined && p.size === undefined)
      throw new AgentError("setEmblemStyle: give shield and/or size (use regenerateEmblem for new heraldry)");
    const before = { shield: entity.coa!.shield ?? null, size: entity.coa!.size ?? 1 };
    if (p.shield !== undefined) entity.coa!.shield = p.shield as string;
    if (p.size !== undefined) entity.coa!.size = p.size as number;
    redrawEmblem(kind, entity.i);
    return {
      ok: true,
      message: `Emblem of ${kind} ${entity.i} restyled`,
      changed: 1,
      details: {
        kind,
        id: entity.i,
        before,
        after: { shield: entity.coa!.shield ?? null, size: entity.coa!.size ?? 1 }
      }
    };
  }
};

export const emblemCommands: Command[] = [regenerateEmblem, setEmblemStyle];

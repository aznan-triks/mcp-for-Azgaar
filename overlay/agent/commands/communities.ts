import { CULTURE_TYPES, type CultureType } from "@/generators/cultures-generator";
import { abbreviate } from "@/utils";
import { cellAt, round } from "../geometry";
import { hiddenLayerNote } from "../layers";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

function hexOrThrow(value: unknown, command: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))
    throw new AgentError(`${command}: color must be a 6-digit hex like #aa3355`); // const-ok: format hint
  return value;
}

/** A centre cell that can host a new culture or religion (mirrors the editors' own checks). */
function freeLandCenter(
  x: number,
  y: number,
  list: { center?: number; removed?: boolean; i: number }[],
  what: string
): number {
  const center = cellAt(x, y);
  if (pack.cells.h[center] < 20)
    throw new AgentError(`(${x}, ${y}) is in the water: a ${what} centre needs a land cell`);
  if (list.some(c => c.i && !c.removed && c.center === center))
    throw new AgentError(`Cell ${center} is already a ${what} centre. Pick a different point`);
  return center;
}

const createCulture: Command = {
  name: "createCulture",
  description:
    "Add a new culture with its centre at a map point (land, not already a culture centre). It starts with no cells: paint some with map_select + assignCulture to make it visible. Its name base comes from a random existing culture; cities founded later in its cells will use it.",
  params: {
    x: { type: "number", required: true, description: "Centre x in map units" },
    y: { type: "number", required: true, description: "Centre y in map units" },
    name: { type: "string", description: "Culture name (generated if omitted)" },
    type: {
      type: "string",
      enum: CULTURE_TYPES,
      description: "Generic (default), Hunting, Highland, River, Lake, Naval or Nomadic"
    },
    color: { type: "string", description: "Hex colour (random if omitted)" } // const-ok: format hint
  },
  async run(p: Params): Promise<CommandResult> {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const center = freeLandCenter(x, y, pack.cultures, "culture");
    // Same steps as the "add culture" tool of the cultures editor.
    Cultures.add(center);
    const culture = pack.cultures.at(-1) as {
      i: number;
      name: string;
      code?: string;
      color?: string;
      type: CultureType;
    };
    if (p.type !== undefined) culture.type = p.type as CultureType;
    if (p.name !== undefined) {
      culture.name = p.name as string;
      culture.code = abbreviate(culture.name, pack.cultures.map(c => c.code) as string[]);
    }
    if (p.color !== undefined) culture.color = hexOrThrow(p.color, "createCulture");
    const { culturesCollectStatistics } = await import("@/controllers/cultures-editor");
    culturesCollectStatistics();
    Layers.draw("cultures");
    return {
      ok: true,
      message: `Culture ${culture.i} "${culture.name}" added at (${x}, ${y})`,
      changed: 1,
      details: { culture: culture.i, name: culture.name, type: culture.type, color: culture.color, center, cells: 0 },
      warnings: [
        ...hiddenLayerNote(["cultures"], "The new culture"),
        "The culture starts with no cells: select cells and run assignCulture to give it land."
      ]
    };
  }
};

const createReligion: Command = {
  name: "createReligion",
  description:
    "Add a new religion with its centre at a map point (land, not already a religion centre). Its type (Folk, Organized, Cult or Heresy), form and deity are generated the way the interface does it; it starts with the centre cell. Grow it with map_select + assignReligion.",
  params: {
    x: { type: "number", required: true, description: "Centre x in map units" },
    y: { type: "number", required: true, description: "Centre y in map units" },
    name: { type: "string", description: "Religion name (generated if omitted)" },
    color: { type: "string", description: "Hex colour (generated from the parent religion or culture if omitted)" } // const-ok: format hint
  },
  async run(p: Params): Promise<CommandResult> {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const center = freeLandCenter(x, y, pack.religions, "religion");
    // Same steps as the "add religion" tool of the religions editor.
    Religions.add(center);
    const religion = pack.religions.at(-1) as {
      i: number;
      name: string;
      code?: string;
      color?: string;
      type: string;
      form: string;
      deity: string | null;
      center: number;
    };
    if (p.name !== undefined) {
      religion.name = p.name as string;
      religion.code = abbreviate(religion.name, pack.religions.map(r => r.code) as string[]);
    }
    if (p.color !== undefined) religion.color = hexOrThrow(p.color, "createReligion");
    const { religionsCollectStatistics } = await import("@/controllers/religions-editor");
    religionsCollectStatistics();
    Layers.draw("religions");
    return {
      ok: true,
      message: `Religion ${religion.i} "${religion.name}" added at (${x}, ${y})`,
      changed: 1,
      details: {
        religion: religion.i,
        name: religion.name,
        type: religion.type,
        form: religion.form,
        deity: religion.deity,
        color: religion.color,
        center
      },
      warnings: hiddenLayerNote(["religions"], "The new religion")
    };
  }
};

export const communityCommands: Command[] = [createCulture, createReligion];

import { color as d3Color, interpolate } from "d3";
import { Emblems } from "@/generators/emblems-generator";
import { redrawEmblem } from "@/renderers/draw-emblems";
import { getRandomColor, P } from "@/utils";
import { cellAt, round } from "../geometry";
import { hiddenLayerNote } from "../layers";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const createProvince: Command = {
  name: "createProvince",
  description:
    "Found a new province at a map point (land, inside a state: neutral land cannot hold one). It starts with that cell plus the neighbouring cells of the same state that are free or belong to another province (province centres are never taken); grow or reshape it afterwards with map_select + assignProvince. If a city stands on the point it becomes the province's capital.",
  params: {
    x: { type: "number", required: true, description: "Centre x in map units" },
    y: { type: "number", required: true, description: "Centre y in map units" },
    name: { type: "string", description: "Province name (generated from the local culture if omitted)" },
    form_name: {
      type: "string",
      description: "Form shown in the full name, e.g. 'Duchy' or 'March' (default 'Province')"
    },
    color: { type: "string", description: "Hex colour (a mix of the state colour and a random one if omitted)" } // const-ok: format hint
  },
  async run(p: Params): Promise<CommandResult> {
    const [x, y] = [round(p.x as number, 2), round(p.y as number, 2)];
    const { cells, provinces } = pack;
    const center = cellAt(x, y);
    if (cells.h[center] < 20) throw new AgentError(`(${x}, ${y}) is in the water: a province needs a land cell`);
    if (p.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(p.color as string))
      throw new AgentError("createProvince: color must be a 6-digit hex like #aa3355"); // const-ok: format hint
    const oldProvince = cells.province[center];
    if (oldProvince && provinces[oldProvince].center === center)
      throw new AgentError(
        `Cell ${center} is already the centre of province ${oldProvince} (${provinces[oldProvince].name}). Pick another point`
      );
    const state = cells.state[center];
    if (!state)
      throw new AgentError("Neutral lands cannot hold a province: give this land to a state first (assignState)");

    // Same steps as the "add province" tool of the provinces editor.
    const province = provinces.length;
    pack.states[state].provinces!.push(province);
    const burg = cells.burg[center];
    const culture = cells.culture[center];
    const name =
      (p.name as string | undefined) ??
      (burg ? pack.burgs[burg].name : Names.getState(Names.getCultureShort(culture), culture));
    const formName =
      (p.form_name as string | undefined) ?? (oldProvince ? provinces[oldProvince].formName : undefined) ?? "Province";
    const fullName = `${name} ${formName}`;
    const stateColor = pack.states[state].color!;
    const rndColor = getRandomColor();
    const color =
      (p.color as string | undefined) ??
      (stateColor[0] === "#" ? d3Color(interpolate(stateColor, rndColor)(0.2))!.hex() : rndColor);

    // Emblem derived from the parent's, exactly as the editor does.
    const kinship = burg ? 0.8 : 0.4;
    const parent = burg ? pack.burgs[burg].coa : pack.states[state].coa;
    const port = burg ? pack.burgs[burg].port : undefined;
    const type = Burgs.getType(center, port);
    const coa = Emblems.generate(parent, kinship, +P(0.1), type);
    coa.shield = Emblems.getShield(culture, state);
    provinces.push({
      i: province,
      state,
      center,
      burg,
      name,
      formName,
      fullName,
      color,
      coa
    } as (typeof provinces)[number]);
    redrawEmblem("province", province);

    cells.province[center] = province;
    let neighboursTaken = 0;
    let fromOtherProvinces = 0;
    for (const nc of cells.c[center]) {
      if (cells.h[nc] < 20 || cells.state[nc] !== state) continue;
      if (provinces.some(prov => prov && !prov.removed && prov.center === nc)) continue;
      if (cells.province[nc] && cells.province[nc] !== province) fromOtherProvinces += 1;
      cells.province[nc] = province;
      neighboursTaken += 1;
    }

    const { collectStatistics } = await import("@/controllers/provinces-editor");
    collectStatistics();
    Provinces.getPoles();
    Layers.draw("borders", "provinces", "labels");
    return {
      ok: true,
      message: `Province ${province} "${fullName}" founded in ${pack.states[state].fullName ?? pack.states[state].name}`,
      changed: 1 + neighboursTaken,
      details: {
        province,
        name,
        fullName,
        formName,
        color,
        state,
        burg: burg || null,
        center,
        neighbouringCellsTaken: neighboursTaken,
        takenFromOtherProvinces: fromOtherProvinces
      },
      warnings: hiddenLayerNote(["provinces"], "The new province")
    };
  }
};

export const provinceCommands: Command[] = [createProvince];

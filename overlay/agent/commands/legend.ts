import { color, interpolateSpectral, range, scaleSequential } from "d3";
import { viewport } from "@/components/viewport";
import { clearLegend, drawLegend, fitLegendBox, type LegendItem, redrawLegend } from "@/renderers/draw-legend";
import { legendPositions } from "@/renderers/legend-positions";
import { convertTemperature, getHeight, getPrecipitation, si } from "@/utils";
import { config } from "../config";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const LAYERS = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "biomes",
  "zones",
  "heightmap",
  "temperature",
  "precipitation",
  "population",
  "routes",
  "goods",
  "markets",
  "trade",
  "custom"
] as const;
type LegendLayer = (typeof LAYERS)[number];
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const ACTIONS = ["show", "hide", "hide_all"] as const;

// The names Azgaar's own editors give their boxes: the same box is toggled from either side.
const DEFAULT_TITLES: Record<LegendLayer, string> = {
  states: "States",
  provinces: "Provinces",
  cultures: "Cultures",
  religions: "Religions",
  biomes: "Biomes",
  zones: "Zones",
  heightmap: "Elevation",
  temperature: "Temperature",
  precipitation: "Rainfall",
  population: "Population",
  routes: "Routes",
  goods: "Goods",
  markets: "Markets",
  trade: "Trade",
  custom: "Legend"
};

// A box is saved with the map as "id,colour,label|id,colour,label": commas and bars would cut an item in two,
// and a colour must be a plain hex code (a colour written with commas would be cut in pieces).
const clean = (text: unknown): string =>
  String(text ?? "")
    .replace(/[,|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// a hatch pattern (zones) is kept as it is: it has no commas and Azgaar draws it the same way
const hex = (css: string | undefined): string =>
  /^url\(#[\w-]+\)$/.test(css ?? "") ? (css as string) : (color(css ?? "")?.formatHex() ?? "");
const attrColor = (id: string, attr: string): string => hex(document.getElementById(id)?.getAttribute(attr) ?? "");

type Builder = (p: Params) => { items: LegendItem[]; notes?: string[] };

const byArea = <T extends { area?: number }>(a: T, b: T): number => (b.area ?? 0) - (a.area ?? 0);

/** Cultures and religions only learn their size when their editor is opened: measure it from the land cells. */
function ranked(
  entities: { i: number; name?: string; color?: string; removed?: boolean }[],
  owner: ArrayLike<number>
): LegendItem[] {
  const area = new Map<number, number>();
  for (const cell of Array.from(pack.cells.i as ArrayLike<number>))
    if (pack.cells.h[cell] >= 20) area.set(owner[cell], (area.get(owner[cell]) ?? 0) + pack.cells.area[cell]);
  return entities
    .filter(e => e.i && !e.removed && area.get(e.i))
    .sort((a, b) => (area.get(b.i) ?? 0) - (area.get(a.i) ?? 0))
    .map(e => [e.i, hex(e.color), clean(e.name)]);
}

const builders: Record<Exclude<LegendLayer, "custom">, Builder> = {
  states: () => ({
    items: pack.states
      .filter(s => s.i && !s.removed && s.cells)
      .sort(byArea)
      .map(s => [s.i, hex(s.color), clean(s.name)])
  }),
  provinces: p => {
    const stateName = (id: number): string => clean(pack.states[id]?.name);
    const only = p.state as number | undefined;
    const rows = pack.provinces.filter(v => v.i && !v.removed && (only === undefined || v.state === only));
    // grouped by the state they belong to, the order of the states list, biggest province first inside each state
    rows.sort((a, b) => a.state - b.state || (b.area ?? 0) - (a.area ?? 0));
    return { items: rows.map(v => [v.i, hex(v.color), `${clean(v.name)} (${stateName(v.state)})`]) };
  },
  cultures: () => ({ items: ranked(pack.cultures, pack.cells.culture) }),
  religions: () => ({ items: ranked(pack.religions, pack.cells.religion) }),
  biomes: () => {
    const counts = new Map<number, number>();
    for (const cell of Array.from(pack.cells.i as ArrayLike<number>))
      if (pack.cells.h[cell] >= 20) counts.set(pack.cells.biome[cell], (counts.get(pack.cells.biome[cell]) ?? 0) + 1);
    return {
      items: pack.biomes
        .filter(b => counts.get(b.i))
        .sort((a, b) => (counts.get(b.i) ?? 0) - (counts.get(a.i) ?? 0))
        .map(b => [b.i, hex(b.color), clean(b.name)])
    };
  },
  zones: () => ({
    items: pack.zones.filter(z => !z.hidden).map(z => [`zone${z.i}`, hex(z.color), clean(z.name)])
  }),
  heightmap: () => {
    const { landHeights, oceanHeights } = styles.heightmap;
    const landStart = config.legendHeightSteps[0] ?? 0;
    // a band runs from its step to the next one (the last land band is open-ended, the sea ends where the land starts)
    const bands = (steps: number[], scheme: string, end?: number): LegendItem[] =>
      steps.map((h, i) => {
        const next = steps[i + 1] ?? end;
        const label =
          next === undefined
            ? `${getHeight(h)} and above`
            : h === 0
              ? `below ${getHeight(next)}`
              : `${getHeight(h)} to ${getHeight(next)}`;
        return [`h${h}`, hex(getColor(h, getColorScheme(scheme))), clean(label)];
      });
    const land = bands(config.legendHeightSteps, landHeights.options.scheme);
    const sea = bands(config.legendSeaSteps, oceanHeights.options.scheme, landStart);
    // the highest band first, like a mountain; the sea below, the deepest last
    return {
      items: [...land.reverse(), ...sea.reverse()],
      notes: ["Heights are those of the map's own scale (units and exponent from the Units settings)."]
    };
  },
  temperature: () => {
    const { temp } = grid.cells;
    const values = Array.from(temp as ArrayLike<number>);
    const [low, high] = [Math.min(...values), Math.max(...values)];
    const step = Math.max(Math.round(Math.abs(low - high) / 5), 1); // the isoline spacing Azgaar itself uses
    const scheme = scaleSequential(interpolateSpectral); // the scale Azgaar paints its isotherms with
    const paint = (t: number): string =>
      hex(scheme(1 - (t - config.temperatureMin) / (config.temperatureMax - config.temperatureMin)));
    const levels = [low, ...range(low + step, high, step)];
    return {
      items: levels.reverse().map(t => [`t${t}`, paint(t), `${clean(convertTemperature(t))} and above`])
    };
  },
  precipitation: () => {
    const wettest = Math.max(...Array.from(grid.cells.prec as ArrayLike<number>));
    const circle = attrColor("prec", "fill") || attrColor("prec", "stroke");
    return {
      items: config.legendRainSamples.map(f => [
        `r${f}`,
        circle,
        `Circle for about ${clean(getPrecipitation(wettest * f))}`
      ]),
      notes: ["Each circle's size grows with the rainfall of its cell; the colour swatch is the circle colour."]
    };
  },
  population: () => {
    const rate = options.map.units.population.scale;
    const urbanisation = options.map.units.population.urbanization.rate;
    const bar = config.legendPopulationBarPx;
    const per = (extra: number): string => si(Math.round((bar * 5 * rate) / extra));
    return {
      items: [
        ["rural", attrColor("rural", "stroke"), `Rural: a line ${bar} units tall is about ${per(1)} people`],
        ["urban", attrColor("urban", "stroke"), `Towns: a line ${bar} units tall is about ${per(urbanisation)} people`]
      ]
    };
  },
  goods: () => ({
    // the goods the layer shows (the ones switched on in the Goods editor), best-valued first
    items: pack.goods
      .filter(g => g.visible)
      .sort((a, b) => b.value - a.value)
      .map(g => [g.i, hex(g.color), clean(g.name)]),
    notes: ["Only the goods shown on the Goods layer are listed; switch more on in the Goods editor."]
  }),
  markets: () => ({
    items: pack.markets.map(m => [
      m.i,
      hex(m.color || config.legendMarketColor),
      clean(m.name || `Market of ${pack.burgs[m.centerBurgId]?.name ?? m.i}`)
    ])
  }),
  trade: () => ({
    // the animation draws moving carts (land) and ships (water) along the trade routes: the key names them
    items: [
      ["land", config.legendTradeLandColor, "Wagon: goods moving over land"],
      ["water", config.legendTradeWaterColor, "Ship: goods moving by sea"]
    ] as LegendItem[],
    notes: ["The trade layer is an animation: the key describes its symbols, it does not follow the moving carts."]
  }),
  routes: () => {
    const groups = new Set(pack.routes.map(r => r.group));
    const names: Record<string, string> = { roads: "Road", trails: "Trail", searoutes: "Sea route" };
    return {
      items: Object.entries(names)
        .filter(([group]) => groups.has(group))
        .map(([group, label]) => [group, attrColor(group, "stroke"), label]),
      notes: ["The swatch shows the line colour; roads are dashed long, trails short, sea routes dotted."]
    };
  }
};

function parseItems(text: string): LegendItem[] {
  const items = text
    .split(/[;\n]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map((part, i): LegendItem => {
      const cut = part.indexOf("=");
      const [swatch, label] = cut < 0 ? ["", part] : [part.slice(0, cut).trim(), part.slice(cut + 1)];
      const colour = /^#[0-9a-fA-F]{3,8}$/.test(swatch) ? swatch : "";
      if (!colour)
        throw new AgentError(`legend: item ${i + 1} ("${part}") must look like "#aa3355=Label" (hex colour, =, label)`); // const-ok: format example shown to the AI
      return [`c${i}`, colour, clean(label)];
    });
  if (!items.length)
    throw new AgentError('legend: layer custom needs `items`, e.g. "#aa3355=Dry lands;#3355aa=Wet lands"'); // const-ok: format example shown to the AI
  return items;
}

/** Places a box by its corner (the store keeps each box's bottom-right corner in % of the map). */
function place(title: string, p: Params): void {
  const node = document.querySelector<SVGGElement>(`#legend > g[data-legend="${CSS.escape(title)}"]`);
  const bbox = node?.getBBox();
  const [vw, vh] = [viewport.width, viewport.height];
  const margin = config.legendMarginPct;
  if (p.x !== undefined || p.y !== undefined) {
    const old = legendPositions.get(title);
    legendPositions.set(title, {
      x: (p.x as number | undefined) ?? old?.x ?? 100 - margin,
      y: (p.y as number | undefined) ?? old?.y ?? 100 - margin,
      dragged: true
    });
  } else if (p.corner && bbox) {
    const corner = p.corner as (typeof CORNERS)[number];
    const w = (bbox.width / vw) * 100;
    const h = (bbox.height / vh) * 100;
    const x = corner.endsWith("left") ? margin + w : 100 - margin;
    const y = corner.startsWith("top") ? margin + h : 100 - margin;
    legendPositions.set(title, { x, y, dragged: true });
  } else return;
  fitLegendBox();
}

const legend: Command = {
  name: "legend",
  description:
    "Show or hide a legend box on the map (it is saved with the map). layer: states, provinces (optionally one `state`), cultures, religions, biomes, zones, heightmap (elevation bands), temperature, precipitation, population, routes, or custom (needs `items`). The box is named by `title` (default: the layer's name); several boxes can be shown at once. Placement: `corner`, or `x`/`y` = where the box's bottom-right corner sits, in % of the map. `columns` (items per column) and `opacity` (box background) apply to every box.",
  params: {
    action: { type: "string", required: true, enum: ACTIONS, description: "show, hide (one box) or hide_all" },
    layer: {
      type: "string",
      enum: LAYERS,
      description: "What the legend explains (needed for show; for hide, picks the default title)"
    },
    title: { type: "string", description: "Box title; also its identity (hide with the same title)" },
    items: {
      type: "string",
      description:
        'custom only: "#aa3355=Label;#3355aa=Other label" (hex colour, =, label; items separated by ; or new lines)' // const-ok: format example shown to the AI
    }, // const-ok: format example
    state: { type: "integer", min: 1, description: "provinces only: keep the provinces of this state" },
    corner: { type: "string", enum: CORNERS, description: "Put the box in this corner of the map" },
    x: { type: "number", min: 0, max: 100, description: "Bottom-right corner of the box, % of map width" },
    y: { type: "number", min: 0, max: 100, description: "Bottom-right corner of the box, % of map height" },
    columns: {
      type: "integer",
      min: 1,
      max: 100,
      description: "Items per column, for all boxes (more columns = wider, shorter box)"
    },
    opacity: { type: "number", min: 0, max: 1, description: "Box background opacity, for all boxes" }
  },
  run(p: Params): CommandResult {
    const action = p.action as (typeof ACTIONS)[number];
    if (action === "hide_all") {
      clearLegend();
      return { ok: true, message: "All legend boxes hidden", changed: 1 };
    }
    const layer = p.layer as LegendLayer | undefined;
    const title = clean(p.title) || (layer ? DEFAULT_TITLES[layer] : "");
    if (!title) throw new AgentError("legend: give `layer` or `title`");
    if (action === "hide") {
      const had = Boolean(document.querySelector(`#legend > g[data-legend="${CSS.escape(title)}"]`));
      clearLegend(title);
      return {
        ok: true,
        message: had ? `Legend "${title}" hidden` : `No legend "${title}" was shown`,
        changed: had ? 1 : 0
      };
    }
    if (!layer) throw new AgentError(`legend: show needs \`layer\` (one of ${LAYERS.join(", ")})`);
    if (layer !== "custom" && p.items !== undefined)
      throw new AgentError("legend: `items` only goes with layer custom");
    if (layer !== "provinces" && p.state !== undefined)
      throw new AgentError("legend: `state` only goes with layer provinces");

    // maps saved by older Azgaar keep a leftover shift on the layer itself, which sends boxes off the canvas
    document.getElementById("legend")?.removeAttribute("transform");
    if (p.columns !== undefined) styles.legend.options.columns = p.columns as number;
    if (p.opacity !== undefined) styles.legend.box.attrs["fill-opacity"] = p.opacity as number;
    redrawLegend(); // adopts a legacy single box and applies the style to the boxes already shown

    const built = layer === "custom" ? { items: parseItems(String(p.items ?? "")) } : builders[layer](p);
    if (!built.items.length) throw new AgentError(`legend: nothing to show for ${layer} on this map`);
    drawLegend(title, built.items);
    place(title, p);
    const notes = [...(built.notes ?? [])];
    if (built.items.length > config.legendLongItems)
      notes.push(
        `This legend has ${built.items.length} items: raise \`columns\`${layer === "provinces" ? ", or pass `state` to keep one state's provinces" : ""} to keep it on the map.`
      );
    return {
      ok: true,
      message: `Legend "${title}" shown`,
      changed: 1,
      details: { title, layer, items: built.items.map(i => `${i[2]}`) },
      warnings: notes.length ? notes : undefined
    };
  }
};

export const legendCommands: Command[] = [legend];

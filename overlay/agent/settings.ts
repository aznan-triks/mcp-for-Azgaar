// Azgaar's typed configuration (options.generation = what the next map is built from, options.map = the map's own
// settings, options.app = preferences). Reads are always allowed. A new map re-rolls most of its settings at random
// unless the person has "pinned" (locked) them: writing a setting here pins it, the same way the lock icons do,
// after Azgaar's own schema has validated it.

import { LAYER_PRESETS } from "@/components/options/tabs/layers-tab";
import { Options } from "@/components/options-model";
import { mapSchema, optionsSchema } from "@/components/options-schema";
import { Pins } from "@/components/pins";
import { heightmapTemplates } from "@/data/heightmap-templates";
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import { CULTURE_SETS } from "@/generators/cultures-generator";
import { AgentError, type Params } from "./types";

const SECTIONS = ["generation", "map", "app"] as const;
type Section = (typeof SECTIONS)[number];
const WRITABLE = ["generation", "map"] as const;
type Writable = (typeof WRITABLE)[number];

// Where each pinnable setting lives, by its dotted path (the pin names are Azgaar's own).
const PINS: Record<Writable, Record<string, string>> = {
  generation: {
    "graph.width": "mapWidth",
    "graph.height": "mapHeight",
    "graph.density": "points",
    resolveDepressionsSteps: "resolveDepressionsSteps",
    lakeElevationLimit: "lakeElevationLimit",
    "geography.mapSize": "mapSize",
    "geography.latitude": "latitude",
    "geography.longitude": "longitude",
    template: "template",
    "states.limit": "statesNumber",
    "states.sizeVariety": "sizeVariety",
    "states.growthRate": "growthRate",
    "cultures.sizeVariety": "sizeVariety",
    "cultures.growthRate": "growthRate",
    "cultures.limit": "cultures",
    "cultures.set": "culturesSet",
    "provinces.ratio": "provincesRatio",
    "burgs.limit": "manors",
    "religions.limit": "religionsNumber"
  },
  map: {
    "climate.temperature.equator": "temperatureEquator",
    "climate.temperature.northPole": "temperatureNorthPole",
    "climate.temperature.southPole": "temperatureSouthPole",
    "climate.precipitation": "prec",
    "units.distance.scale": "distanceScale",
    "units.distance.unit": "distanceUnit",
    "units.area.unit": "areaUnit",
    "units.height.unit": "heightUnit",
    "units.height.exponent": "heightExponent",
    "units.temperature.unit": "temperatureScale",
    "units.population.scale": "populationRate",
    "units.population.urbanization.rate": "urbanization",
    "units.population.urbanization.density": "urbanDensity",
    "lore.calendar.year": "year",
    "lore.calendar.era": "era",
    "lore.calendar.eraShort": "eraShort",
    "lore.name": "mapName"
  }
};
const PIN_STORAGE = "fmg-locks"; // const-ok: Azgaar's own storage key for pinned values

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function merge(base: unknown, change: unknown): unknown {
  if (!isObject(base) || !isObject(change)) return change;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(change)) out[key] = key in base ? merge(base[key], value) : value;
  return out;
}

function leaves(value: unknown, path: string[] = []): { path: string; value: unknown }[] {
  if (!isObject(value)) return [{ path: path.join("."), value }];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
}

const valueAt = (root: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (isObject(o) ? o[k] : undefined), root);

/** Everything the AI may choose from when it asks for a map, besides free numbers. */
export function choices(): Record<string, unknown> {
  return {
    templates: [...Object.keys(heightmapTemplates), ...Object.keys(precreatedHeightmaps)],
    cultureSets: Object.entries(CULTURE_SETS).map(([id, set]) => ({ id, name: set.name, maxCultures: set.max })),
    layerPresets: Object.keys(LAYER_PRESETS)
  };
}

function pinned(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(PIN_STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

export function getSettings(args: Params = {}): Record<string, unknown> {
  const section = args.section as Section | undefined;
  if (section !== undefined && !SECTIONS.includes(section))
    throw new AgentError(`settings: section must be one of ${SECTIONS.join(", ")}`);
  const out: Record<string, unknown> = section
    ? { [section]: copy(options[section]) }
    : { generation: copy(options.generation) };
  if (!section) out.hint = "Ask for section map or app to read the others (they are long).";
  out.pinned = pinned();
  out.pinnedMeaning =
    "Pinned values are kept by every new map; everything else is re-rolled at random each time (map_options release to unpin).";
  out.choices = choices();
  return out;
}

/**
 * Pins settings for the next generated map, after validating them with Azgaar's schema (nothing changes if one is refused).
 * section generation: what the map is built from. section map: climate, units, calendar and name of the next map.
 */
export function setSettings(args: Params): Record<string, unknown> {
  const section = (args.section ?? "generation") as Writable;
  if (!WRITABLE.includes(section))
    throw new AgentError(`settings: only ${WRITABLE.join(" and ")} can be set (app preferences are not map settings)`);
  const change = args.values;
  if (!isObject(change) || !Object.keys(change).length)
    throw new AgentError(
      'settings: give the values to change, e.g. { states: { limit: 12 }, template: "archipelago" }'
    );
  const merged = merge(copy(options[section]), change);
  const schema = section === "generation" ? optionsSchema.shape.generation : mapSchema;
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 8);
    throw new AgentError(
      `settings: refused, nothing changed. ${issues.join("; ")}. Current values and choices: map_options get`
    );
  }
  const pinNames = PINS[section];
  const wanted = leaves(change).map(l => l.path);
  const unpinnable = wanted.filter(path => !(path in pinNames));
  if (unpinnable.length)
    throw new AgentError(
      `settings: ${unpinnable.join(", ")} cannot be preset for the next map${section === "map" ? " (use the editors for the current map: map_menu / map_ui)" : ""}. Settable: ${Object.keys(pinNames).join(", ")}`
    );
  const result = parsed.data as Record<string, unknown>;
  for (const path of wanted) Pins.set(pinNames[path], valueAt(result, path));
  if (section === "generation") {
    options.generation = result as typeof options.generation;
    Options.persist();
  }
  const kept = Object.fromEntries(wanted.map(p => [p, valueAt(result, p)]));
  return {
    pinnedForNextMap: kept,
    note: "Used by the next map_file new. The current map is not changed (use the editors for that)."
  };
}

/** Forget pinned values so that new maps re-roll them at random again (all, or the ones named). */
export function releaseSettings(args: Params = {}): Record<string, unknown> {
  const names = Array.isArray(args.names) ? (args.names as string[]) : null;
  if (!names) localStorage.removeItem(PIN_STORAGE);
  else for (const name of names) Pins.clear(name);
  return { pinned: pinned() };
}

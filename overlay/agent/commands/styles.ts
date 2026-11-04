// Visual style: the preset wholesale (same steps as the Style tab) and one value at a time.

import { runEffect } from "@/controllers/style-editor/effects";
import { StylePreset } from "@/controllers/style-preset";
import { Styles } from "@/generators/styles";
import { stylesSchema } from "@/generators/styles-schema";
import { HeightmapColorSchemes } from "@/renderers/heightmap-color-schemes";
import { StylePresetsService, SYSTEM_PRESETS } from "@/services/style-presets";
import type { StyleElement } from "@/types/styles";
import { config } from "../config";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const applyStylePreset: Command = {
  name: "applyStylePreset",
  description:
    "Replace the whole visual style with a preset: one of Azgaar's built-in themes (offline files) or a custom preset saved in this browser. map_list kind=styles shows the current preset and every style value; setStyle adjusts single values afterwards.",
  params: {
    preset: {
      type: "string",
      required: true,
      description: `Preset name: ${SYSTEM_PRESETS.join(", ")}, or a custom preset key from map_list kind=styles`
    }
  },
  async run(p: Params): Promise<CommandResult> {
    const wanted = p.preset as string;
    // load and parse first: a missing or broken preset must fail loudly, not fall back to the default
    const loaded = await StylePresetsService.load(wanted);
    if (loaded.error) {
      const known = [...SYSTEM_PRESETS, ...StylePresetsService.listCustom()];
      throw new AgentError(`applyStylePreset: ${loaded.error}. Available: ${known.join(", ")}`);
    }
    const parsed = StylePresetsService.parse(loaded.styles);
    if (!parsed) throw new AgentError(`applyStylePreset: "${wanted}" holds no style preset`);
    const previous = StylePresetsService.current();
    // Same steps as the Style tab's preset change (options, label, all layers, style editor).
    await StylePreset.change(wanted);
    return {
      ok: true,
      message: `Style preset "${loaded.name}" applied`,
      changed: 1,
      details: { preset: loaded.name, previousPreset: previous, elements: Object.keys(parsed).length }
    };
  }
};

const setStyle: Command = {
  name: "setStyle",
  description:
    'Set one value of the map\'s style by its path, such as "ocean.groups.base.attrs.fill" or "relief.options.density". map_list kind=styles lists the paths. Pass value: null to unset an attribute.',
  params: {
    path: {
      type: "string",
      required: true,
      description: 'Style path: element[.groups.group][.attrs|.options].name, e.g. "ocean.groups.base.attrs.fill"'
    },
    value: { type: "scalar", description: "The new value: text, a number or true/false. null unsets an attribute" }
  },
  run(p: Params): CommandResult {
    if (!Object.hasOwn(p, "value") || p.value === undefined)
      throw new AgentError("setStyle: pass a value; null unsets an attribute");
    const path = p.path as string;
    const element = path.split(".")[0] as StyleElement;
    try {
      Styles.setValue(path, p.value); // validates the path and the value against the style schema before writing
    } catch (error) {
      // every store throw happens before the write: a clean validation failure, not a half-edited map
      throw new AgentError(`setStyle: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Same steps as the style editor: write the attribute to the SVG, then the value's declared effect.
    runEffect({ element, layer: Layers.has(element) ? element : undefined }, path.split("."));
    return {
      ok: true,
      message: `Style ${path} = ${JSON.stringify(p.value)}`,
      changed: 1,
      details: { path, value: p.value }
    };
  }
};

const setTopography: Command = {
  name: "setTopography",
  description:
    "Configure native heightmap contour lines, slope hachures, hypsometric fills and terraces; show the heightmap layer and redraw immediately. Partial update only, no terrain data changes. target land (default), ocean or both. isolineFills:false requires at least contours or hachures, and maps to native line-only modes. map_layers preset=topographic selects the seven atlas layers.",
  params: {
    target: { type: "string", enum: ["land", "ocean", "both"], description: "Height bands to configure; default land" },
    scheme: {
      type: "string",
      description:
        "Native registered color scheme (bright, light, natural, green, olive, livid, monochrome); unknown names refused"
    },
    contours: { type: "boolean", description: "Show smooth elevation contour lines" },
    contourInterval: {
      type: "integer",
      min: config.minContourInterval,
      max: 20,
      description: "Contour interval in native height units (2..20)"
    },
    hachures: { type: "boolean", description: "Show downhill tapered slope hachures" },
    isolineFills: {
      type: "boolean",
      description: "Show colored hypsometric fills (false = line-only; requires contours or hachures)"
    },
    terracing: { type: "number", min: 0, max: 20, description: "Native terrace shadow strength, 0 disables" }
  },
  run(p: Params): CommandResult {
    if (!Object.entries(p).some(([key, value]) => key !== "target" && value !== undefined && value !== null))
      throw new AgentError("setTopography: give at least one option to change");
    if (p.scheme !== undefined && !HeightmapColorSchemes.has(p.scheme as string))
      throw new AgentError(
        `setTopography: unknown scheme "${p.scheme}". Available: ${HeightmapColorSchemes.names().join(", ")}`
      );
    if (p.contourInterval !== undefined && (p.contourInterval as number) < config.minContourInterval)
      throw new AgentError(`setTopography: contourInterval must be >= ${config.minContourInterval}`);
    // Validate the entire prospective node first; no half-applied compound validation failure.
    const candidate = structuredClone(styles.heightmap);
    const groups =
      p.target === "both"
        ? (["landHeights", "oceanHeights"] as const)
        : ([p.target === "ocean" ? "oceanHeights" : "landHeights"] as const);
    const patches: [string, unknown][] = [];
    for (const group of groups) {
      const node = candidate.groups[group].options;
      const put = (key: "scheme" | "terracing", value: unknown) => {
        if (value === undefined) return;
        if (key === "scheme") node.scheme = value as string;
        else node.terracing = value as number;
        patches.push([`heightmap.groups.${group}.options.${key}`, value]);
      };
      put("scheme", p.scheme);
      put("terracing", p.terracing);
      if (p.contourInterval !== undefined) {
        node.contours.interval = p.contourInterval as number;
        patches.push([`heightmap.groups.${group}.options.contours.interval`, p.contourInterval]);
      }
      if (p.contours !== undefined || p.hachures !== undefined || p.isolineFills !== undefined) {
        const contours = p.contours ?? node.contours.mode !== "off";
        const hachures = p.hachures ?? node.hachures.mode !== "off";
        const fills = p.isolineFills ?? (node.contours.mode !== "only" && node.hachures.mode !== "only");
        if (!fills && !contours && !hachures)
          throw new AgentError("setTopography: isolineFills:false requires contours or hachures");
        node.contours.mode = contours ? (fills ? "overlay" : "only") : "off";
        node.hachures.mode = hachures ? (fills ? "overlay" : "only") : "off";
        patches.push(
          [`heightmap.groups.${group}.options.contours.mode`, node.contours.mode],
          [`heightmap.groups.${group}.options.hachures.mode`, node.hachures.mode]
        );
      }
      if (group === "oceanHeights") {
        candidate.groups.oceanHeights.options.render = true;
        patches.push(["heightmap.groups.oceanHeights.options.render", true]);
      }
    }
    const parsed = stylesSchema.shape.heightmap.safeParse(candidate);
    if (!parsed.success) throw new AgentError(`setTopography: ${parsed.error.message}`);
    for (const [path, value] of patches) Styles.setValue(path, value);
    const wasOn = Layers.isOn("heightmap");
    Layers.show("heightmap");
    if (wasOn) Layers.draw("heightmap");
    return {
      ok: true,
      changed: 1,
      message: "Topography configured and drawn",
      details: {
        target: p.target ?? "land",
        paths: patches.map(([path]) => path),
        heightmap: structuredClone(styles.heightmap)
      }
    };
  }
};

export const styleCommands: Command[] = [applyStylePreset, setStyle, setTopography];

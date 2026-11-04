// Azgaar's own list of actions (the "omnibar" commands): editors, overviews, regenerate-anything, exports, charts.
// Running one is exactly what choosing it in the interface does.
import { MAP_COMMANDS } from "@/components/map-commands";
import { viewport } from "@/components/viewport";
import { Services } from "@/services";
import { getFileName } from "@/utils";
import { config } from "./config";
import { type DownsampleFilter, renderSvgSupersampled } from "./downsample";
import { type InsetOptions, renderInset } from "./inset";
import { AgentError, type Params } from "./types";
import { openDialogs } from "./ui";

// Actions that would block on a file picker, replace the whole map, or are handled by a dedicated tool.
const REFUSED: Record<string, string> = {
  helpAssistant: "it opens a chat that needs the internet",
  startTour: "it is an interactive tutorial for a person",
  loadFromFile: "it opens a file picker: use map_file load",
  saveToMachine: "use map_file save",
  saveToStorage: "use map_file save",
  newMap: "use map_file new",
  optionsReset: "it wipes every setting of the browser profile"
};

export function menuList(args: Params = {}): Record<string, unknown> {
  const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
  const all = MAP_COMMANDS.filter(c => !(c.id in REFUSED)).map(c => ({ id: c.id, name: c.name, keywords: c.aliases }));
  const found = query ? all.filter(c => `${c.id} ${c.name} ${c.keywords}`.toLowerCase().includes(query)) : all;
  const limit = typeof args.limit === "number" ? args.limit : config.menuListMax;
  return { total: found.length, commands: found.slice(0, limit), truncated: found.length > limit };
}

export async function menuRun(args: Params): Promise<Record<string, unknown>> {
  const id = args.id;
  if (typeof id !== "string") throw new AgentError("menu: give the id of an action (see map_menu list)");
  if (id in REFUSED) throw new AgentError(`menu: "${id}" is not available here: ${REFUSED[id]}`);
  const command = MAP_COMMANDS.find(c => c.id === id);
  if (!command) {
    const near = MAP_COMMANDS.filter(c => `${c.id} ${c.name}`.toLowerCase().includes(id.toLowerCase())).map(c => c.id);
    throw new AgentError(
      `menu: unknown action "${id}"${near.length ? `. Did you mean: ${near.slice(0, 6).join(", ")}?` : " (see map_menu list)"}`
    );
  }
  // The undo snapshot the server takes first is the safety net, so the interface's own "are you sure?" is skipped.
  if (id.startsWith("regenerate")) sessionStorage.setItem("regenerateFeatureDontAsk", "1");
  await Promise.resolve(command.run());
  await new Promise(resolve => setTimeout(resolve, config.settleMs));
  return { ran: { id: command.id, name: command.name }, dialogs: openDialogs() };
}

export const EXPORT_FORMATS = ["svg", "png", "jpeg", "tiles"] as const;

// The normal native export path stays untouched. Only opt-in supersampling
// rasterizes Azgaar's own styled SVG above the target size and filters it.
async function exportSupersampled(format: "png" | "jpeg", supersample: number, filter: DownsampleFilter) {
  const resolution = options.app.export.pngResolution;
  const targetWidth = Math.round(viewport.width * resolution);
  const targetHeight = Math.round(viewport.height * resolution);
  // Validate BEFORE getMapURL(), which otherwise creates a large SVG clone.
  const max = config.downsampleMaxDimension;
  if (Math.max(targetWidth * supersample, targetHeight * supersample) > max)
    throw new AgentError(`export: supersampled source exceeds ${max}px canvas limit`);
  const url = await Services.ExportMap.getMapURL("png");
  const canvas = await renderSvgSupersampled(url, targetWidth, targetHeight, supersample, filter);
  try {
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new AgentError("export: cannot encode the picture"))),
        mimeType,
        config.downsampleJpegQuality
      );
    });
    const link = document.createElement("a");
    link.download = `${getFileName()}.${format === "png" ? "png" : "jpeg"}`;
    link.href = URL.createObjectURL(blob);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), config.downsampleBlobLifetimeMs);
  } finally {
    canvas.width = 0;
  }
}

/** Starts a file export of the picture formats; the browser's download is what the server collects. */
export async function exportPicture(args: Params): Promise<Record<string, unknown>> {
  const format = args.format;
  const custom = args.supersample !== undefined || args.filter !== undefined;
  const supersample = args.supersample ?? 1;
  const filter = args.filter ?? "lanczos3";
  if (
    typeof supersample !== "number" ||
    !Number.isInteger(supersample) ||
    supersample < 1 ||
    supersample > config.downsampleMaxSupersample
  )
    throw new AgentError(`export: supersample must be 1..${config.downsampleMaxSupersample}`);
  if (filter !== "lanczos3" && filter !== "stepdown" && filter !== "fast")
    throw new AgentError("export: filter must be lanczos3, stepdown or fast");
  if (custom && format !== "png" && format !== "jpeg")
    throw new AgentError("export: supersample/filter only apply to png or jpeg");
  if (args.inset !== undefined && (custom || (format !== "png" && format !== "jpeg")))
    throw new AgentError("export: inset only supports png/jpeg without supersample/filter");
  const originalResolution = options.app.export.pngResolution;
  if (typeof args.resolution === "number") {
    if (!(args.resolution > 0)) throw new AgentError("export: resolution must be a positive number");
    options.app.export.pngResolution = args.resolution;
  }
  try {
    if (args.inset !== undefined && (format === "png" || format === "jpeg")) {
      const pic = await renderInset({
        inset: args.inset as InsetOptions,
        width: Math.round(viewport.width * options.app.export.pngResolution),
        height: Math.round(viewport.height * options.app.export.pngResolution),
        format
      });
      const blob = await (await fetch(`data:${pic.mimeType};base64,${pic.data}`)).blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${getFileName()}-inset.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), config.downsampleBlobLifetimeMs);
    } else if (custom && (format === "png" || format === "jpeg")) await exportSupersampled(format, supersample, filter);
    else if (format === "svg") await Services.ExportMap.exportToSvg();
    else if (format === "png") await Services.ExportMap.exportToPng();
    else if (format === "jpeg") await Services.ExportMap.exportToJpeg();
    else if (format === "tiles") await Services.ExportMap.exportToPngTiles();
    else throw new AgentError(`export: format must be one of ${EXPORT_FORMATS.join(", ")}`);
    return {
      started: format,
      resolution: options.app.export.pngResolution,
      ...(custom ? { supersample, filter } : {})
    };
  } finally {
    options.app.export.pngResolution = originalResolution;
  }
}

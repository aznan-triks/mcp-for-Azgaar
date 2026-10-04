// Azgaar's own list of actions (the "omnibar" commands): editors, overviews, regenerate-anything, exports, charts.
// Running one is exactly what choosing it in the interface does.
import { MAP_COMMANDS } from "@/components/map-commands";
import { Services } from "@/services";
import { config } from "./config";
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

/** Starts a file export of the picture formats; the browser's download is what the server collects. */
export async function exportPicture(args: Params): Promise<Record<string, unknown>> {
  const format = args.format;
  if (typeof args.resolution === "number") {
    if (!(args.resolution > 0)) throw new AgentError("export: resolution must be a positive number");
    options.app.export.pngResolution = args.resolution;
  }
  if (format === "svg") await Services.ExportMap.exportToSvg();
  else if (format === "png") await Services.ExportMap.exportToPng();
  else if (format === "jpeg") await Services.ExportMap.exportToJpeg();
  else if (format === "tiles") await Services.ExportMap.exportToPngTiles();
  else throw new AgentError(`export: format must be one of ${EXPORT_FORMATS.join(", ")}`);
  return { started: format, resolution: options.app.export.pngResolution };
}

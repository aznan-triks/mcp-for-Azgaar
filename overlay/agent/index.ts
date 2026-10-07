// Bridge between an external AI controller and the map. Exposes window.FMG_AGENT.
// Every call returns plain JSON-serialisable data; failures throw AgentError with a message meant for the AI.
import { describeCommands, runCommand } from "./commands";
import { type AgentConfig, config, configure } from "./config";
import { mapToScreen, screenToMap } from "./geometry";
import { exportMap, importMap } from "./io";
import { listLayers, setLayers } from "./layers";
import { exportPicture, menuList, menuRun } from "./menu";
import { clearAnnotations, drawAnnotations, type OverlayOptions, showSelection } from "./overlay";
import { camera, cellInfo, list, locate, summary } from "./queries";
import { createSelection, describeSelection, dropSelections, SELECT_OPTIONS, SHAPES } from "./selection";
import { getSettings, releaseSettings, setSettings } from "./settings";
import { textMap } from "./textmap";
import { AgentError, type CommandResult, type Params } from "./types";
import { uiClick, uiCloseDialogs, uiGet, uiList, uiSet } from "./ui";
import { capture3d, close3d, globeInfo, is3dOpen, open3d, setCleanMode, view3d } from "./view3d";

const API_VERSION = 1;

// A failure that is not a plain AgentError (validation) may have left the map half-modified.
let lastFailureLeftMapDirty = false;

async function apply(name: string, params: Params): Promise<CommandResult> {
  lastFailureLeftMapDirty = false;
  try {
    const result = await runCommand(name, params);
    showSelection(null); // the previewed area has just changed colour: hide the red preview
    return result;
  } catch (error) {
    lastFailureLeftMapDirty = !(error instanceof AgentError);
    throw error;
  }
}

function select(shape: string, args: Params, options: Params): ReturnType<typeof createSelection> {
  const info = createSelection(shape, args, options);
  showSelection(info.id);
  return info;
}

async function setCamera(args: {
  x?: number;
  y?: number;
  scale?: number;
  duration?: number;
}): Promise<Record<string, unknown>> {
  const { zoomTo } = await import("@/components/zoom");
  const { width, height } = options.map.graph;
  const x = args.x ?? width / 2;
  const y = args.y ?? height / 2;
  const duration = args.duration ?? 0;
  zoomTo(x, y, args.scale ?? 1, duration);
  await new Promise(resolve => setTimeout(resolve, duration + 50));
  return camera();
}

/** Frames a map rectangle in the window (what the person sees), with a small margin. */
async function showRegion(args: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  duration?: number;
}): Promise<Record<string, unknown>> {
  const { x0, y0, x1, y1 } = args;
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0)
    throw new AgentError("showRegion: needs x0 < x1 and y0 < y1 (map units)");
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  await setCamera({ x: cx, y: cy, scale: 1, duration: 0 });
  const [ax, ay] = screenToMap(0, 0);
  const [bx, by] = screenToMap(window.innerWidth, window.innerHeight);
  const fit = Math.min(Math.abs(bx - ax) / (x1 - x0), Math.abs(by - ay) / (y1 - y0)) / (1 + 2 * config.regionMargin);
  return await setCamera({ x: cx, y: cy, scale: Math.max(1, fit), duration: args.duration });
}

const FMG_AGENT = {
  apiVersion: () => API_VERSION,
  configure: (partial: Partial<AgentConfig>) => configure(partial),
  getConfig: () => ({ ...config }),
  describe: () => ({
    apiVersion: API_VERSION,
    commands: describeCommands(),
    shapes: SHAPES,
    selectOptions: SELECT_OPTIONS
  }),
  isReady: () => typeof pack !== "undefined" && Array.isArray(window.mapHistory) && window.mapHistory.length > 0,
  summary,
  textMap,
  uiList,
  uiClick,
  uiSet,
  uiGet,
  uiCloseDialogs,
  menuList,
  menuRun,
  exportPicture,
  getSettings,
  setSettings,
  releaseSettings,
  list,
  locate,
  cellInfo,
  camera,
  setCamera,
  showRegion,
  screenToMap: (px: number, py: number) => screenToMap(px, py),
  mapToScreen: (x: number, y: number) => mapToScreen(x, y),
  layers: listLayers,
  setLayers,
  select,
  describeSelection,
  showSelection,
  dropSelections,
  apply,
  lastFailureLeftMapDirty: () => lastFailureLeftMapDirty,
  annotate: (opts: OverlayOptions) => drawAnnotations(opts),
  clearAnnotations,
  open3d,
  view3d,
  capture3d,
  close3d,
  is3dOpen,
  globeInfo,
  setCleanMode,
  exportMap,
  importMap,
  AgentError
};

declare global {
  interface Window {
    FMG_AGENT: typeof FMG_AGENT;
  }
}

window.FMG_AGENT = FMG_AGENT;

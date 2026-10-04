/** Every tunable value of the bridge lives here. The server can override it through FMG_AGENT.configure(). */
export interface AgentConfig {
  gridDivisions: number; // graticule lines across the longest side of the visible area
  maxCellLabels: number; // above this many visible cells, cell ids are not drawn
  maxSelectionCells: number;
  maxSelections: number; // oldest selections are forgotten beyond this
  selectionFill: string;
  selectionStroke: string;
  gridStroke: string;
  labelColor: string;
  labelHalo: string;
  labelFont: string;
  badgeFill: string; // state id badge
  badgeStroke: string;
  overlayZIndex: number;
  labelPx: number; // label size in screen pixels, whatever the zoom
  settleMs: number; // wait after a map load before reading the state
  importTimeoutMs: number;
  listLimit: number; // default size of list answers
  regionMargin: number; // empty border kept around a region shown with showRegion, as a fraction of the region size
  defaultRiverFlux: number; // flux given to the cells of a hand-drawn river that carry less (sets its width)
  textMapCols: number; // default size of the text map (for models that cannot see images)
  textMapRows: number;
  textMapMax: number; // largest accepted size, in either direction
  uiOptionsMax: number; // options of a menu listed per field
  uiTextMax: number; // characters of dialog text returned
  menuListMax: number; // actions listed by default
}

export const DEFAULT_CONFIG: AgentConfig = {
  gridDivisions: 8,
  maxCellLabels: 500,
  maxSelectionCells: 40000,
  maxSelections: 20,
  selectionFill: "rgba(255, 40, 40, 0.38)",
  selectionStroke: "rgba(200, 0, 0, 0.9)",
  gridStroke: "rgba(0, 0, 0, 0.45)",
  labelColor: "#111111",
  labelHalo: "#ffffff",
  labelFont: "monospace",
  badgeFill: "#ffffffcc",
  badgeStroke: "#000000",
  overlayZIndex: 50,
  labelPx: 12,
  settleMs: 600,
  importTimeoutMs: 60000,
  listLimit: 50,
  regionMargin: 0.08,
  defaultRiverFlux: 30,
  textMapCols: 100,
  textMapRows: 40,
  textMapMax: 200,
  uiOptionsMax: 40,
  uiTextMax: 1500,
  menuListMax: 200
};

export const config: AgentConfig = { ...DEFAULT_CONFIG };

export function configure(partial: Partial<AgentConfig>): AgentConfig {
  Object.assign(config, partial);
  return config;
}

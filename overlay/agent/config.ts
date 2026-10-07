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
  legendMarginPct: number; // gap kept between a legend box and the window edge when placed by corner, in % of the map
  legendHeightSteps: number[]; // land heights (Azgaar 0-100 scale) that start a band in the elevation legend
  legendLongItems: number; // above this many items a legend is flagged as long (the AI is told how to shorten it)
  legendSeaSteps: number[]; // same for the sea (below the first land step)
  legendRainSamples: number[]; // fractions of the largest rainfall shown as sample circles in the rainfall legend
  legendPopulationBarPx: number; // length of the sample bar named in the population legend, in map units
  legendMarketColor: string; // colour of a market with none of its own (Azgaar draws them this pink)
  legendTradeLandColor: string; // swatch of the wagon in the trade key
  legendTradeWaterColor: string; // swatch of the ship in the trade key
  annotationHaloColor: string; // outline that keeps annotation text and markers readable on any background
  annotationColor: string; // colour of an annotation when none is given
  annotationMarkerRadius: number; // radius of a marker, in map units
  annotationFontSize: number; // text size of an annotation, in map units
  annotationStrokeWidth: number; // line width of a line or area annotation, in map units
  annotationAreaOpacity: number; // fill opacity of an area annotation
  annotationTextMax: number; // longest annotation text accepted
  temperatureMin: number; // coldest value of Azgaar's temperature colour scale (it draws on -50..50)
  temperatureMax: number; // hottest value of that scale
  view3dPollMs: number; // how often the 3D picture is compared with the previous one while waiting for it to be finished
  view3dStableReads: number; // identical consecutive comparisons that mean the 3D picture is finished
  view3dTimeoutMs: number; // longest wait for a 3D picture (satellite and erosion textures are baked on the fly)
  view3dStableDiff: number; // mean difference per colour byte (0-255) under which two comparisons count as the same picture
  view3dSampleSize: number; // the 3D picture is shrunk to this many pixels a side for the comparison
  view3dTextureMax: number; // largest texture the person may ask for (the renderer also clamps to the graphics card)
  view3dDefaultDistance: { relief: number; globe: number }; // camera distance when none is given
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
  menuListMax: 200,
  legendMarginPct: 1,
  legendHeightSteps: [20, 30, 40, 50, 60, 70, 80, 90, 100],
  legendSeaSteps: [0, 10],
  legendLongItems: 40,
  legendRainSamples: [0.25, 0.5, 1],
  legendPopulationBarPx: 10,
  legendMarketColor: "#dababf",
  legendTradeLandColor: "#8c6a3b",
  legendTradeWaterColor: "#3b6a8c",
  annotationHaloColor: "#ffffff",
  annotationColor: "#c0392b",
  annotationMarkerRadius: 3,
  annotationFontSize: 6,
  annotationStrokeWidth: 1,
  annotationAreaOpacity: 0.35,
  annotationTextMax: 120,
  temperatureMin: -50,
  temperatureMax: 50,
  view3dPollMs: 400,
  view3dStableReads: 2,
  view3dTimeoutMs: 30000,
  view3dStableDiff: 2,
  view3dSampleSize: 32,
  view3dTextureMax: 8192,
  view3dDefaultDistance: { relief: 640, globe: 3 }
};

export const config: AgentConfig = { ...DEFAULT_CONFIG };

export function configure(partial: Partial<AgentConfig>): AgentConfig {
  Object.assign(config, partial);
  return config;
}

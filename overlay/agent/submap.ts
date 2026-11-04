// Same orchestration and geography/unit conversion as controllers/submap-tool.ts,
// but explicit map-space bounds instead of the current camera or dialog fields.
import { applyGraphSize, fitMapToScreen } from "@/components/canvas";
import { Layers } from "@/components/layers";
import { registerMap } from "@/components/lifecycle";
import { undraw } from "@/components/undraw";
import { Resample } from "@/generators/resample";
import { getLatitude, getLongitude, minmax, rn } from "@/utils";
import { resolveRegionBounds } from "./inset";
import { dropSelections } from "./selection";
import { AgentError, type Params } from "./types";

export function validateSubmap(p: Params) {
  if (p.confirmDestructiveResample !== true)
    throw new AgentError(
      "createSubmap: confirmDestructiveResample must be true; use a non-destructive inset otherwise"
    );
  const bounds = resolveRegionBounds(p);
  const { width, height } = options.map.graph;
  const scale = Math.min(width / (bounds.x1 - bounds.x0), height / (bounds.y1 - bounds.y0));
  const w = width / scale;
  const h = height / scale;
  const x0 = minmax((bounds.x0 + bounds.x1 - w) / 2, 0, width - w);
  const y0 = minmax((bounds.y0 + bounds.y1 - h) / 2, 0, height - h);
  if (p.rescaleBurgStyles !== undefined && typeof p.rescaleBurgStyles !== "boolean")
    throw new AgentError("createSubmap: rescaleBurgStyles must be true or false");
  return { bounds: { x0, y0, x1: x0 + w, y1: y0 + h }, scale };
}

export function createSubmap(p: Params) {
  const { bounds, scale } = validateSubmap(p);
  const { x0, y0 } = bounds;
  const { geography, graph, units } = options.map;
  const { coordinates } = geography;
  geography.mapSize = rn(geography.mapSize / scale, 2);
  const latT = coordinates.latT / scale;
  const latN = getLatitude(y0, coordinates, graph.height);
  geography.latitude = rn(((90 - latN) / (180 - latT)) * 100, 2);
  const lonT = coordinates.lonT / scale;
  const lonE = getLongitude(bounds.x1, coordinates, graph.width);
  geography.longitude = rn(((180 - lonE) / (360 - lonT)) * 100, 2);
  units.distance.scale = rn(units.distance.scale / scale, 2);
  units.population.scale = rn(units.population.scale / scale, 2);
  Options.save();
  const projection = (x: number, y: number): [number, number] => [(x - x0) * scale, (y - y0) * scale];
  const inverse = (x: number, y: number): [number, number] => [x / scale + x0, y / scale + y0];
  applyGraphSize();
  fitMapToScreen();
  resetZoom(0);
  undraw();
  Resample.process({ projection, inverse, scale });
  if (p.rescaleBurgStyles !== false) rescaleBurgStyles(scale);
  // Persistent free annotations use parent coordinates; do not misrepresent them on the child.
  document.getElementById("annotations")?.remove();
  Layers.drawAll();
  dropSelections();
  registerMap();
  return {
    ok: true,
    changed: 1,
    message: "Submap created (parent can be restored with map_undo)",
    details: { bounds, scale },
    warnings: [
      "Region expanded to the canvas aspect ratio if needed. Cell ids changed; selections were dropped. Free annotations were removed from the child. The native resampler defines which parent entities survive."
    ]
  };
}

function rescaleBurgStyles(scale: number): void {
  window.Burgs.ensureBurgGroupStyles();
  for (const group of document.querySelectorAll<SVGGElement>("#burgIcons > g")) {
    const iconStyle = styles.burgIcons.groups[group.id]?.groups.icons;
    if (iconStyle) iconStyle.options.size = rn(minmax(iconStyle.options.size * scale, 0.2, 10), 2);
    group.remove();
  }
  const groups = new Set(pack.burgs.filter(b => b.i && !b.removed).map(b => b.label?.group || b.group || "burg"));
  for (const name of groups) {
    const style = styles.labels.groups[name];
    if (!style) continue;
    const size = Number.parseFloat(style.attrs["font-size"]) || 0;
    style.attrs["font-size"] = `${rn(Math.max(rn((size + size / scale) / 2, 2), 1) * scale, 2)}%`;
  }
}

import { AgentError } from "./types";

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function viewbox(): SVGGElement {
  const el = document.getElementById("viewbox");
  if (!(el instanceof SVGGElement)) throw new AgentError("The map is not displayed yet (no #viewbox)");
  return el;
}

/** Browser window pixel (CSS pixels, origin top-left of the page) -> map coordinates. */
export function screenToMap(px: number, py: number): [number, number] {
  const ctm = viewbox().getScreenCTM();
  if (!ctm) throw new AgentError("The map has no screen transform (hidden?)");
  const p = new DOMPoint(px, py).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

export function mapToScreen(x: number, y: number): [number, number] {
  const ctm = viewbox().getScreenCTM();
  if (!ctm) throw new AgentError("The map has no screen transform (hidden?)");
  const p = new DOMPoint(x, y).matrixTransform(ctm);
  return [p.x, p.y];
}

/** Matrix of the map layer in page pixels, for overlays that live outside the map. */
export function mapMatrix(): DOMMatrix {
  const ctm = viewbox().getScreenCTM();
  if (!ctm) throw new AgentError("The map has no screen transform (hidden?)");
  return ctm;
}

export function mapSize(): { width: number; height: number } {
  const { width, height } = options.map.graph;
  return { width, height };
}

/** Part of the map currently visible in the window, clipped to the map. */
export function visibleBounds(): Bounds {
  const [ax, ay] = screenToMap(0, 0);
  const [bx, by] = screenToMap(window.innerWidth, window.innerHeight);
  const { width, height } = mapSize();
  return {
    x0: Math.max(0, Math.min(ax, bx)),
    y0: Math.max(0, Math.min(ay, by)),
    x1: Math.min(width, Math.max(ax, bx)),
    y1: Math.min(height, Math.max(ay, by))
  };
}

export function cellAt(x: number, y: number): number {
  const { width, height } = mapSize();
  if (x < 0 || y < 0 || x > width || y > height) throw new AgentError(`Point (${x}, ${y}) is outside the map`);
  const cell = Pack.findCell(x, y);
  if (cell === undefined) throw new AgentError(`No cell found at (${x}, ${y})`);
  return cell;
}

export function round(value: number, decimals = 1): number {
  const k = 10 ** decimals;
  return Math.round(value * k) / k;
}

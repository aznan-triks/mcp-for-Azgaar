import { config } from "./config";
import { mapMatrix, visibleBounds } from "./geometry";
import { getSelection } from "./selection";

const SVG_NS = "http://www.w3.org/2000/svg"; // const-ok: XML namespace constant
const OVERLAY_ID = "fmgAgentOverlay";

export interface OverlayOptions {
  grid?: boolean;
  cellIds?: boolean;
  stateIds?: boolean;
}

let selectionId: string | null = null;
let observer: MutationObserver | null = null;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function layers(): { root: SVGSVGElement; selection: SVGGElement; aux: SVGGElement } {
  let root = document.getElementById(OVERLAY_ID) as SVGSVGElement | null;
  if (!root) {
    root = el("svg", { id: OVERLAY_ID, width: "100%", height: "100%" });
    // Outside #map on purpose: the saved .map file serialises #map only.
    root.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:${config.overlayZIndex}`;
    root.append(el("g", { id: `${OVERLAY_ID}-sel` }), el("g", { id: `${OVERLAY_ID}-aux` }));
    document.body.append(root);
    const viewbox = document.getElementById("viewbox");
    if (viewbox) {
      observer = new MutationObserver(() => syncTransform());
      observer.observe(viewbox, { attributes: true, attributeFilter: ["transform"] });
    }
  }
  return {
    root,
    selection: root.querySelector(`#${OVERLAY_ID}-sel`) as SVGGElement,
    aux: root.querySelector(`#${OVERLAY_ID}-aux`) as SVGGElement
  };
}

function syncTransform(): void {
  const { selection, aux } = layers();
  const m = mapMatrix();
  const value = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
  selection.setAttribute("transform", value);
  aux.setAttribute("transform", value);
}

function cellPath(cells: Iterable<number>): string {
  const { v } = pack.cells;
  const { p } = pack.vertices;
  const parts: string[] = [];
  for (const cell of cells) {
    const ring = v[cell].map(vertex => p[vertex]);
    if (ring.length < 3) continue;
    parts.push(`M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`);
  }
  return parts.join("");
}

/** Shows (or hides, with null) the persistent selection preview, visible to the person watching. */
export function showSelection(id: string | null): void {
  const { selection } = layers();
  selection.replaceChildren();
  selectionId = id;
  if (!id) return;
  syncTransform();
  selection.append(
    el("path", {
      d: cellPath(getSelection(id)),
      fill: config.selectionFill,
      stroke: config.selectionStroke,
      "stroke-width": 1.5,
      "vector-effect": "non-scaling-stroke"
    })
  );
}

export function currentSelectionId(): string | null {
  return selectionId;
}

function label(parent: SVGGElement, x: number, y: number, text: string, scale: number, anchor = "middle"): void {
  const size = config.labelPx / scale;
  const t = el("text", {
    x,
    y,
    "font-size": size,
    "font-family": config.labelFont,
    "font-weight": "bold",
    "text-anchor": anchor,
    "dominant-baseline": "central",
    fill: config.labelColor,
    stroke: config.labelHalo,
    "stroke-width": size / 4,
    "paint-order": "stroke"
  });
  t.textContent = text;
  parent.append(t);
}

function niceStep(raw: number): number {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * exp;
}

/** Temporary annotations for a screenshot: coordinate graticule, cell ids, state ids. Call clearAnnotations() after. */
export function drawAnnotations(options: OverlayOptions): {
  gridStep?: number;
  cellsLabelled?: number;
  cellIdsSkipped?: string;
} {
  const { aux } = layers();
  aux.replaceChildren();
  syncTransform();
  const scale = mapMatrix().a;
  const b = visibleBounds();
  const out: { gridStep?: number; cellsLabelled?: number; cellIdsSkipped?: string } = {};

  if (options.grid) {
    const longest = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const step = niceStep(longest / config.gridDivisions);
    out.gridStep = step;
    const path: string[] = [];
    for (let x = Math.ceil(b.x0 / step) * step; x <= b.x1; x += step) path.push(`M${x},${b.y0}L${x},${b.y1}`);
    for (let y = Math.ceil(b.y0 / step) * step; y <= b.y1; y += step) path.push(`M${b.x0},${y}L${b.x1},${y}`);
    aux.append(
      el("path", {
        d: path.join(""),
        stroke: config.gridStroke,
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
        fill: "none",
        "vector-effect": "non-scaling-stroke"
      })
    );
    const pad = (config.labelPx * 0.8) / scale;
    for (let x = Math.ceil(b.x0 / step) * step; x <= b.x1; x += step)
      label(aux, x, b.y0 + pad, String(Math.round(x)), scale);
    for (let y = Math.ceil(b.y0 / step) * step; y <= b.y1; y += step)
      label(aux, b.x0 + pad * 1.6, y, String(Math.round(y)), scale);
  }

  if (options.cellIds) {
    const visible = pack.cells.i.filter(c => {
      const [x, y] = pack.cells.p[c];
      return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    });
    if (visible.length <= config.maxCellLabels) {
      for (const c of visible) label(aux, pack.cells.p[c][0], pack.cells.p[c][1], String(c), scale);
      out.cellsLabelled = visible.length;
    } else {
      out.cellIdsSkipped = `${visible.length} cells visible (limit ${config.maxCellLabels}): zoom in`;
    }
  }

  if (options.stateIds) {
    for (const state of pack.states) {
      if (!state.i || state.removed || !state.pole) continue;
      const [x, y] = state.pole;
      aux.append(
        el("circle", {
          cx: x,
          cy: y,
          r: (config.labelPx * 0.9) / scale,
          fill: config.badgeFill,
          stroke: config.badgeStroke,
          "stroke-width": 1,
          "vector-effect": "non-scaling-stroke"
        })
      );
      label(aux, x, y, String(state.i), scale);
    }
  }
  return out;
}

export function clearAnnotations(): void {
  layers().aux.replaceChildren();
}

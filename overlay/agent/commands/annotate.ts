import { color } from "d3";
import { config } from "../config";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg"; // const-ok: the SVG XML namespace
const GROUP_ID = "annotations";
const KINDS = ["text", "marker", "line", "area"] as const;
type Kind = (typeof KINDS)[number];
const ACTIONS = ["add", "list", "remove", "clear"] as const;

/** The overlay lives in the map's own SVG, so it is saved with the .map and drawn in every export. */
function group(create: boolean): SVGGElement | null {
  const existing = document.getElementById(GROUP_ID) as SVGGElement | null;
  if (existing || !create) return existing;
  const g = document.createElementNS(SVG_NS, "g");
  g.id = GROUP_ID;
  document.getElementById("viewbox")?.appendChild(g);
  return g as SVGGElement;
}

const items = (): SVGGElement[] => Array.from(group(false)?.querySelectorAll<SVGGElement>(":scope > g[data-id]") ?? []);

function describe(node: SVGGElement): Record<string, unknown> {
  return {
    id: Number(node.dataset.id),
    kind: node.dataset.kind,
    text: node.dataset.text || undefined,
    color: node.dataset.color,
    x: node.dataset.x ? Number(node.dataset.x) : undefined
  };
}

function inside(x: number, y: number): void {
  const { width, height } = options.map.graph;
  if (x < 0 || y < 0 || x > width || y > height)
    throw new AgentError(`annotate: point (${x}, ${y}) is outside the map (0..${width}, 0..${height})`);
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const annotate: Command = {
  name: "annotate",
  description:
    "Persistent annotations drawn over the map and saved with it (they come back after map_file load and appear in exports). add: kind text (needs x, y, text), marker (x, y, optional text beside it), line (needs path), area (needs area, filled translucent, optional text at its first point). list: every annotation with its id. remove: one by id. clear: all of them. Coordinates are map units (0 to the map's width/height).",
  params: {
    action: { type: "string", required: true, enum: ACTIONS, description: "add, list, remove or clear" },
    kind: { type: "string", enum: KINDS, description: "add only: what to draw" },
    x: { type: "number", min: 0, description: "text / marker: horizontal position in map units (give y too)" },
    y: { type: "number", min: 0, description: "text / marker: vertical position in map units (give x too)" },
    path: { type: "path", description: "line: at least 2 [x, y] points" },
    area: { type: "points", description: "area: at least 3 [x, y] points" },
    text: { type: "string", description: "text shown (text, marker, area)" },
    color: { type: "string", description: "Colour name or hex code; default is a dark red" },
    size: { type: "number", min: 0.5, max: 100, description: "marker radius, text size or line width, in map units" },
    id: { type: "integer", min: 1, description: "remove only: the annotation id from list" }
  },
  run(p: Params): CommandResult {
    const action = p.action as (typeof ACTIONS)[number];
    if (action === "list") {
      const rows = items().map(describe);
      return { ok: true, message: `${rows.length} annotation(s)`, changed: 0, details: { annotations: rows } };
    }
    if (action === "clear") {
      const n = items().length;
      group(false)?.replaceChildren();
      return { ok: true, message: `${n} annotation(s) removed`, changed: n };
    }
    if (action === "remove") {
      if (p.id === undefined) throw new AgentError("annotate remove: `id` is required (see action list)");
      const node = items().find(i => Number(i.dataset.id) === p.id);
      if (!node) throw new AgentError(`annotate remove: annotation ${p.id} does not exist`);
      node.remove();
      return { ok: true, message: `Annotation ${p.id} removed`, changed: 1 };
    }

    const kind = p.kind as Kind | undefined;
    if (!kind) throw new AgentError(`annotate add: \`kind\` is required (${KINDS.join(", ")})`);
    const paint = color(String(p.color ?? config.annotationColor));
    if (!paint) throw new AgentError(`annotate: "${p.color}" is not a colour`);
    const colour = paint.formatHex();
    const label = String(p.text ?? "").trim();
    if (label.length > config.annotationTextMax)
      throw new AgentError(`annotate: text is longer than ${config.annotationTextMax} characters`);
    const size = (p.size as number | undefined) ?? undefined;

    const node = group(true) as SVGGElement;
    const id = Math.max(0, ...items().map(i => Number(i.dataset.id))) + 1;
    const wrap = el("g", { "data-id": id, "data-kind": kind, "data-color": colour }) as SVGGElement;
    if (label) wrap.dataset.text = label;
    const fontSize = kind === "text" ? (size ?? config.annotationFontSize) : config.annotationFontSize;
    const addText = (x: number, y: number, dx: number): void => {
      if (!label) return;
      const t = el("text", {
        x: x + dx,
        y,
        fill: colour,
        "font-size": fontSize,
        "dominant-baseline": "central",
        stroke: config.annotationHaloColor,
        "stroke-width": fontSize / 8,
        "paint-order": "stroke"
      }); // const-ok: white halo ratio keeps the text readable
      t.textContent = label;
      wrap.appendChild(t);
    };

    if (kind === "text" || kind === "marker") {
      if (p.x === undefined || p.y === undefined) throw new AgentError(`annotate add ${kind}: x and y are required`);
      if (kind === "text" && !label) throw new AgentError("annotate add text: `text` is required");
      const [x, y] = [p.x as number, p.y as number];
      inside(x, y);
      wrap.dataset.x = String(x);
      wrap.dataset.y = String(y);
      if (kind === "marker") {
        const r = size ?? config.annotationMarkerRadius;
        wrap.appendChild(
          el("circle", { cx: x, cy: y, r, fill: colour, stroke: config.annotationHaloColor, "stroke-width": r / 4 })
        ); // const-ok: white ring ratio
        addText(x, y, r * 2); // const-ok: label sits two radii to the right
      } else addText(x, y, 0);
    } else if (kind === "line") {
      const pts = p.path as [number, number][] | undefined;
      if (!pts) throw new AgentError("annotate add line: `path` is required");
      for (const [x, y] of pts) inside(x, y);
      wrap.appendChild(
        el("polyline", {
          points: pts.map(q => q.join(",")).join(" "),
          fill: "none",
          stroke: colour,
          "stroke-width": size ?? config.annotationStrokeWidth,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        })
      );
      if (pts[0]) addText(pts[0][0], pts[0][1], config.annotationMarkerRadius);
    } else {
      const pts = p.area as [number, number][] | undefined;
      if (!pts) throw new AgentError("annotate add area: `area` is required");
      for (const [x, y] of pts) inside(x, y);
      wrap.appendChild(
        el("polygon", {
          points: pts.map(q => q.join(",")).join(" "),
          fill: colour,
          "fill-opacity": config.annotationAreaOpacity,
          stroke: colour,
          "stroke-width": size ?? config.annotationStrokeWidth
        })
      );
      if (pts[0]) addText(pts[0][0], pts[0][1], config.annotationMarkerRadius);
    }
    node.appendChild(wrap);
    return { ok: true, message: `Annotation ${id} (${kind}) added`, changed: 1, details: { id, kind, color: colour } };
  }
};

export const annotateCommands: Command[] = [annotate];

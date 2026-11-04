import { Services } from "@/services";
import type { Region } from "@/services/io/export";
import { config } from "./config";
import { AgentError } from "./types";

export interface RegionBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface InsetOptions extends RegionBounds {
  title?: string;
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  cover?: number;
}

/** Reject rather than silently clipping a caller's requested geography. */
export function resolveRegionBounds(input: unknown): RegionBounds {
  if (!input || typeof input !== "object") throw new AgentError("region: give x0,y0,x1,y1 in map units");
  const { x0, y0, x1, y1 } = input as RegionBounds;
  const { width, height } = options.map.graph;
  if (![x0, y0, x1, y1].every(Number.isFinite) || !(x1 > x0 && y1 > y0))
    throw new AgentError("region: needs finite x0 < x1 and y0 < y1");
  if (x0 < 0 || y0 < 0 || x1 > width || y1 > height)
    throw new AgentError(`region: outside map bounds (0..${width}, 0..${height})`);
  return { x0, y0, x1, y1 };
}

function dimensions(width: number, height: number): void {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= config.downsampleMaxDimension))
    throw new AgentError(`inset: canvas dimensions must be 1..${config.downsampleMaxDimension}`);
}

export function validateInset(input: InsetOptions): RegionBounds {
  const bounds = resolveRegionBounds(input);
  const keys = ["x0", "y0", "x1", "y1", "title", "corner", "cover"];
  if (Object.keys(input).some(key => !keys.includes(key))) throw new AgentError("inset: unknown option");
  if (input.title !== undefined && (typeof input.title !== "string" || input.title.length > config.insetTitleMax))
    throw new AgentError(`inset: title must be text of at most ${config.insetTitleMax} characters`);
  if (input.cover !== undefined && !(Number.isFinite(input.cover) && input.cover >= 0.15 && input.cover <= 0.65))
    throw new AgentError("inset: cover must be 0.15..0.65");
  if (input.corner !== undefined && !["top-left", "top-right", "bottom-left", "bottom-right"].includes(input.corner))
    throw new AgentError("inset: unknown corner");
  return bounds;
}

/** Vector-render at the regional zoom, not a crop of the low-resolution world image. */
export async function renderRegionLoupe(input: RegionBounds, width: number, height: number): Promise<string> {
  dimensions(width, height);
  const bounds = resolveRegionBounds(input);
  // Native renderer uses a uniform fit: any integer pixel rounding becomes letterboxing, never stretching.
  const region: Region = { ...bounds, width, height };
  return Services.ExportMap.getRegionImage(region, 1, "image/png");
}

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export async function compositeInsetOnCanvas(canvas: HTMLCanvasElement, inset: InsetOptions) {
  const bounds = validateInset(inset);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AgentError("inset: 2D canvas unavailable");
  const { width, height } = canvas;
  const margin = Math.max(2, Math.min(width, height) * config.insetMargin);
  const titleHeight = Math.max(12, height * 0.035);
  const fit = Math.min(
    (width * (inset.cover ?? config.insetCover) - 2 * margin) / (bounds.x1 - bounds.x0),
    (height * 0.7 - titleHeight - 2 * margin) / (bounds.y1 - bounds.y0)
  );
  const w = (bounds.x1 - bounds.x0) * fit;
  const h = (bounds.y1 - bounds.y0) * fit;
  if (fit <= 0 || w < 1 || h < 1) throw new AgentError("inset: output too small for this region");
  const corner = inset.corner ?? "bottom-right";
  const x = corner.endsWith("right") ? width - w - 3 * margin : margin;
  const y = corner.startsWith("bottom") ? height - h - titleHeight - 3 * margin : margin;
  const loupe = await image(await renderRegionLoupe(bounds, Math.max(1, Math.round(w)), Math.max(1, Math.round(h))));
  const graph = options.map.graph;
  const scale = Math.min(width / graph.width, height / graph.height);
  const ox = (width - graph.width * scale) / 2;
  const oy = (height - graph.height * scale) / 2;
  const rx = ox + bounds.x0 * scale;
  const ry = oy + bounds.y0 * scale;
  const rw = (bounds.x1 - bounds.x0) * scale;
  const rh = (bounds.y1 - bounds.y0) * scale;
  ctx.strokeStyle = config.insetInk;
  ctx.lineWidth = Math.max(1, height / 400);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, ry + rh / 2);
  ctx.lineTo(x + w / 2 + margin, y + h / 2 + margin);
  ctx.stroke();
  ctx.fillStyle = config.insetBackground;
  ctx.fillRect(x, y, w + 2 * margin, h + titleHeight + 2 * margin);
  ctx.strokeRect(x, y, w + 2 * margin, h + titleHeight + 2 * margin);
  ctx.fillStyle = config.insetInk;
  ctx.font = `${titleHeight * 0.7}px serif`;
  ctx.fillText(inset.title ?? "Region", x + margin, y + margin + titleHeight * 0.75, w);
  const imageScale = Math.min(w / loupe.naturalWidth, h / loupe.naturalHeight);
  const iw = loupe.naturalWidth * imageScale;
  const ih = loupe.naturalHeight * imageScale;
  ctx.drawImage(loupe, x + margin + (w - iw) / 2, y + margin + titleHeight + (h - ih) / 2, iw, ih);
  return {
    bounds,
    cartouche: { x, y, width: w, height: h },
    regionRatio: (bounds.x1 - bounds.x0) / (bounds.y1 - bounds.y0)
  };
}

/** Entire atlas is off-screen: no camera, layer, selection or map-data writes. */
export async function renderInset(args: {
  inset: InsetOptions;
  width: number;
  height: number;
  format?: "png" | "jpeg";
}) {
  dimensions(args.width, args.height);
  validateInset(args.inset);
  if (args.format !== undefined && args.format !== "png" && args.format !== "jpeg")
    throw new AgentError("inset: format must be png or jpeg");
  const canvas = document.createElement("canvas");
  canvas.width = args.width;
  canvas.height = args.height;
  try {
    const graph = options.map.graph;
    const world = await image(
      await renderRegionLoupe({ x0: 0, y0: 0, x1: graph.width, y1: graph.height }, args.width, args.height)
    );
    canvas.getContext("2d")!.drawImage(world, 0, 0);
    const details = await compositeInsetOnCanvas(canvas, args.inset);
    const mimeType = `image/${args.format ?? "png"}`;
    const url = canvas.toDataURL(mimeType, config.downsampleJpegQuality);
    return { data: url.slice(url.indexOf(",") + 1), mimeType, width: canvas.width, height: canvas.height, ...details };
  } finally {
    canvas.width = 0;
  }
}

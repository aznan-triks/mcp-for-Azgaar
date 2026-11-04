// Supersampled 2D exports: dyadic Canvas reductions followed by a separable
// Lanczos-3 pass for the remaining fractional ratio. No native dependency.
import { config } from "./config";
import { AgentError } from "./types";

export type DownsampleFilter = "lanczos3" | "stepdown" | "fast";
const CHANNELS = 4; // RGBA
const ALPHA_MAX = 255;
const HALVE = 2;
const LANCZOS_RADIUS = 3;

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new AgentError("downsample: dimensions must be positive integers");
  if (Math.max(width, height) > config.downsampleMaxDimension)
    throw new AgentError(`downsample: ${width}x${height} exceeds ${config.downsampleMaxDimension}px canvas limit`);
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  return output;
}

function draw(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const output = canvas(width, height);
  const ctx = output.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return output;
}

function lanczos(x: number): number {
  const distance = Math.abs(x);
  if (distance < Number.EPSILON) return 1;
  if (distance >= LANCZOS_RADIUS) return 0;
  const angle = Math.PI * distance;
  return (Math.sin(angle) / angle) * (Math.sin(angle / LANCZOS_RADIUS) / (angle / LANCZOS_RADIUS));
}

// Pre-tabulate clipped, normalized kernel weights once per destination pixel.
// Scaling the kernel by the ratio is the antialiasing low-pass for reductions.
function taps(sourceSize: number, targetSize: number) {
  const ratio = sourceSize / targetSize;
  const stretch = Math.max(1, ratio);
  const radius = LANCZOS_RADIUS * stretch;
  const offsets = new Int32Array(targetSize + 1);
  const index: number[] = [];
  const weight: number[] = [];
  for (let x = 0; x < targetSize; x++) {
    const center = (x + 0.5) * ratio - 0.5;
    const start = Math.max(0, Math.ceil(center - radius));
    const end = Math.min(sourceSize - 1, Math.floor(center + radius));
    let total = 0;
    for (let i = start; i <= end; i++) {
      const w = lanczos((i - center) / stretch);
      index.push(i);
      weight.push(w);
      total += w;
    }
    for (let i = offsets[x]; i < weight.length; i++) weight[i] /= total;
    offsets[x + 1] = weight.length;
  }
  return { offsets, index: Int32Array.from(index), weight: Float32Array.from(weight) };
}

// Premultiply RGB by alpha before filtering: a transparent SVG background
// must not introduce black fringes along a coastline or around glyphs.
function lanczosCanvas(source: HTMLCanvasElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const { width, height } = source;
  const pixels = source.getContext("2d")!.getImageData(0, 0, width, height).data;
  const horizontal = new Float32Array(targetWidth * height * CHANNELS);
  const xt = taps(width, targetWidth);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const out = (y * targetWidth + x) * CHANNELS;
      for (let k = xt.offsets[x]; k < xt.offsets[x + 1]; k++) {
        const src = (y * width + xt.index[k]) * CHANNELS;
        const w = xt.weight[k];
        const alpha = pixels[src + 3] / ALPHA_MAX;
        horizontal[out] += pixels[src] * alpha * w;
        horizontal[out + 1] += pixels[src + 1] * alpha * w;
        horizontal[out + 2] += pixels[src + 2] * alpha * w;
        horizontal[out + 3] += pixels[src + 3] * w;
      }
    }
  }

  const output = canvas(targetWidth, targetHeight);
  const ctx = output.getContext("2d")!;
  const image = ctx.createImageData(targetWidth, targetHeight);
  const yt = taps(height, targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const dest = (y * targetWidth + x) * CHANNELS;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = yt.offsets[y]; k < yt.offsets[y + 1]; k++) {
        const src = (yt.index[k] * targetWidth + x) * CHANNELS;
        const w = yt.weight[k];
        r += horizontal[src] * w;
        g += horizontal[src + 1] * w;
        b += horizontal[src + 2] * w;
        a += horizontal[src + 3] * w;
      }
      const alpha = Math.max(0, Math.min(ALPHA_MAX, a));
      const unpremultiply = a > 0 ? ALPHA_MAX / a : 0;
      image.data[dest] = r * unpremultiply;
      image.data[dest + 1] = g * unpremultiply;
      image.data[dest + 2] = b * unpremultiply;
      image.data[dest + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  return output;
}

/** No-op returns the original canvas, without reading/copying any pixels. */
export function downsampleCanvas(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  filter: DownsampleFilter = "lanczos3"
): HTMLCanvasElement {
  dimensions(targetWidth, targetHeight);
  if (source.width === targetWidth && source.height === targetHeight) return source;
  dimensions(source.width, source.height);
  if (targetWidth > source.width || targetHeight > source.height)
    throw new AgentError("downsample: target must not be larger than its source");
  if (filter === "fast") return draw(source, targetWidth, targetHeight);
  if (filter !== "stepdown" && filter !== "lanczos3") throw new AgentError("downsample: unknown filter");

  let current = source;
  while (current.width >= targetWidth * HALVE || current.height >= targetHeight * HALVE) {
    const width =
      current.width >= targetWidth * HALVE ? Math.max(targetWidth, Math.round(current.width / HALVE)) : current.width;
    const height =
      current.height >= targetHeight * HALVE
        ? Math.max(targetHeight, Math.round(current.height / HALVE))
        : current.height;
    const next = draw(current, width, height);
    if (current !== source) current.width = 0; // release intermediate backing store
    current = next;
  }
  if (current.width === targetWidth && current.height === targetHeight) return current;
  const result =
    filter === "stepdown"
      ? draw(current, targetWidth, targetHeight)
      : lanczosCanvas(current, targetWidth, targetHeight);
  if (current !== source) current.width = 0;
  return result;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new AgentError("downsample: cannot decode the image"));
    img.src = url;
  });
}

/** Vector source is rasterized only AFTER its dimensions have been checked. */
export async function renderSvgSupersampled(
  url: string,
  targetWidth: number,
  targetHeight: number,
  supersample: number,
  filter: DownsampleFilter
): Promise<HTMLCanvasElement> {
  dimensions(targetWidth, targetHeight);
  if (!Number.isInteger(supersample) || supersample < 1 || supersample > config.downsampleMaxSupersample)
    throw new AgentError(`downsample: supersample must be 1..${config.downsampleMaxSupersample}`);
  dimensions(targetWidth * supersample, targetHeight * supersample);
  const image = await loadImage(url);
  const source = draw(image, targetWidth * supersample, targetHeight * supersample);
  const result = downsampleCanvas(source, targetWidth, targetHeight, filter);
  if (result !== source) source.width = 0;
  return result;
}

/** Bridge entry point for Chromium's supersampled PNG screenshot (also used by map_view). */
export async function downsampleImage(args: {
  base64: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  filter: DownsampleFilter;
  quality?: number;
}): Promise<{ base64: string; width: number; height: number; downsampleMs: number; reusedSource: boolean }> {
  dimensions(args.width, args.height);
  if (!/^[A-Za-z0-9+/=]+$/.test(args.base64)) throw new AgentError("downsample: invalid base64 image");
  const image = await loadImage(`data:image/png;base64,${args.base64}`);
  dimensions(image.naturalWidth, image.naturalHeight);
  const source = draw(image, image.naturalWidth, image.naturalHeight);
  const started = performance.now();
  const output = downsampleCanvas(source, args.width, args.height, args.filter);
  const downsampleMs = performance.now() - started;
  const reusedSource = output === source;
  const dataUrl = output.toDataURL(args.mimeType, args.quality ?? config.downsampleJpegQuality);
  if (output !== source) output.width = 0;
  source.width = 0;
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    width: args.width,
    height: args.height,
    downsampleMs,
    reusedSource
  };
}

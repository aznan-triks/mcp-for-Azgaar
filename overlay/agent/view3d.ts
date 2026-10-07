// 3D views (relief scene and globe) and the "clean" capture mode. The interface's own 3D engine does the drawing;
// this file only opens it with the requested settings, points the camera, waits for the picture to be finished and reads it.
import { globeLayout } from "@/data/view-3d-options";
import { config } from "./config";
import { AgentError } from "./types";

export interface View3dArgs {
  mode: "relief" | "globe";
  satellite?: boolean; // procedural terrain texture (relief only)
  erosion?: boolean; // eroded terrain (relief only)
  atmosphere?: boolean; // relief: sky and horizon fog; the globe always has its starfield
  sun?: { x: number; y: number; z?: number };
  scale?: number; // relief height exaggeration
  textureResolution?: number;
  labels?: boolean;
  rotation?: { x: number; y: number }; // see setView in the 3D renderer
  distance?: number;
}

type ThreeD = typeof options.app.threeD;
let saved: ThreeD | null = null; // the person's own 3D settings, put back when the view is closed

const canvas3d = (): HTMLCanvasElement | null => document.getElementById("canvas3d") as HTMLCanvasElement | null;

const renderer = () => import("@/renderers/view-3d-renderer");

/** Opens the relief scene or the globe on the current map and waits until its picture stops changing. */
export async function open3d(args: View3dArgs): Promise<Record<string, unknown>> {
  if (args.mode !== "relief" && args.mode !== "globe") throw new AgentError('open3d: mode must be "relief" or "globe"');
  const globe = args.mode === "globe";
  if (globe && (args.satellite || args.erosion))
    throw new AgentError("open3d: satellite and erosion only exist in relief mode");
  if (canvas3d()) await close3d();
  saved = structuredClone(options.app.threeD);

  const sun = args.sun ? { x: args.sun.x, y: args.sun.y, z: args.sun.z ?? options.app.threeD.sun.z } : undefined;
  Options.set(o => {
    const t = o.app.threeD;
    t.rotateMesh = 0; // a still picture: no turntable
    t.rotateGlobe = 0;
    if (args.satellite !== undefined) t.satellite = args.satellite;
    if (args.erosion !== undefined) t.erosion = args.erosion;
    if (args.atmosphere !== undefined) t.extendedWater = args.atmosphere;
    if (sun) t.sun = sun;
    if (args.scale !== undefined) t.scale = args.scale;
    if (args.labels !== undefined) t.labels3d = args.labels;
    if (args.textureResolution !== undefined)
      t.resolutionScale = Math.min(args.textureResolution, config.view3dTextureMax);
  });

  await Controllers.View3d.open(globe ? "viewGlobe" : "viewMesh");
  const canvas = canvas3d();
  if (!canvas)
    throw new AgentError("open3d: the 3D view did not start (WebGL unavailable or the 3D library failed to load)");
  $("#options3d").dialog("close"); // the settings dialog is for hands, not for pictures

  const r = await renderer();
  r.setView({
    x: args.rotation?.x,
    y: args.rotation?.y,
    distance: args.distance ?? config.view3dDefaultDistance[args.mode]
  });
  const finished = await waitUntilStable();
  return {
    mode: args.mode,
    canvas: { width: canvas.width, height: canvas.height },
    finished,
    settings: current3d(),
    globe: globe ? globeInfo() : undefined
  };
}

/** Points the camera of the open 3D view (globe: longitude/latitude of the view centre; relief: azimuth and tilt, degrees). */
export async function view3d(args: { x?: number; y?: number; distance?: number }): Promise<Record<string, unknown>> {
  if (!canvas3d()) throw new AgentError("view3d: no 3D view is open (use open3d first)");
  (await renderer()).setView(args);
  return { finished: await waitUntilStable() };
}

/** The 3D picture as base64 (PNG, JPEG or WebP). */
export function capture3d(
  format: "png" | "jpeg" | "webp",
  quality: number
): { data: string; mimeType: string; width: number; height: number } {
  const canvas = canvas3d();
  if (!canvas) throw new AgentError("capture3d: no 3D view is open (use open3d first)");
  const mimeType = `image/${format}`;
  const url = canvas.toDataURL(mimeType, quality / 100);
  if (!url.startsWith(`data:${mimeType}`)) throw new AgentError(`capture3d: this browser cannot encode ${format}`);
  return { data: url.slice(url.indexOf(",") + 1), mimeType, width: canvas.width, height: canvas.height };
}

/** Closes the 3D view and puts the person's own 3D settings back. */
export async function close3d(): Promise<void> {
  Controllers.View3d.enterStandard();
  if (saved) {
    const previous = saved;
    saved = null;
    Options.set(o => {
      o.app.threeD = previous;
    });
  }
}

export const is3dOpen = (): boolean => canvas3d() !== null;

/** How the flat map sits on the globe: the true longitude span, and the closing ocean around it. */
export function globeInfo(): Record<string, unknown> {
  const c = options.map.geography.coordinates;
  const layout = globeLayout(c, options.app.threeD.resolutionScale);
  const mapDegrees = c.lonT;
  return {
    mapLongitudeDegrees: mapDegrees,
    closingOceanDegrees: Math.max(0, 360 - mapDegrees),
    texturePx: { width: layout.width, height: layout.height },
    mapPx: { width: layout.mapWidth, height: layout.mapHeight, x: layout.dx, y: layout.dy },
    featherPx: layout.feather,
    coversWholeWorld: layout.coversLatitude && layout.coversLongitude
  };
}

function current3d(): Record<string, unknown> {
  const t = options.app.threeD;
  return {
    satellite: t.satellite,
    erosion: t.erosion,
    atmosphere: t.extendedWater,
    sun: t.sun,
    scale: t.scale,
    textureResolution: t.resolutionScale,
    labels: t.labels3d
  };
}

/** A tiny copy of what the 3D canvas shows now (a few thousand bytes). */
function sample(): Uint8ClampedArray {
  const canvas = canvas3d();
  const size = config.view3dSampleSize;
  const probe = document.createElement("canvas");
  probe.width = probe.height = size;
  const ctx = probe.getContext("2d");
  if (!canvas || !ctx) return new Uint8ClampedArray(0);
  ctx.drawImage(canvas, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Mean difference per byte between two samples (0 = identical, 255 = opposite). */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// The satellite water shimmers all the time, so "finished" means "changing less than view3dStableDiff", not "identical".
async function waitUntilStable(): Promise<boolean> {
  const started = Date.now();
  let previous = sample();
  let same = 0;
  while (Date.now() - started < config.view3dTimeoutMs) {
    await new Promise(resolve => setTimeout(resolve, config.view3dPollMs));
    const now = sample();
    same = difference(now, previous) <= config.view3dStableDiff ? same + 1 : 0;
    previous = now;
    if (same >= config.view3dStableReads) return true;
  }
  return false; // reported, never hidden: the picture may still be changing
}

// ---- clean capture mode -------------------------------------------------------------------------------------------

const hiddenByClean = new Map<Element, string>(); // element -> its own inline display value, put back by setCleanMode(false)

/**
 * Forces the given elements off (game pictograms such as port anchors, routes, markers, ice) so a capture shows pure cartography,
 * whatever layer or reset turned them back on. `setCleanMode(false)` puts every element back exactly as it was.
 */
export function setCleanMode(on: boolean, selectors: string[] = []): { hidden: number } {
  if (!on) {
    for (const [el, display] of hiddenByClean) {
      (el as SVGElement).style.removeProperty("display");
      if (display) (el as SVGElement).style.display = display;
    }
    hiddenByClean.clear();
    return { hidden: 0 };
  }
  if (!selectors.length) throw new AgentError("setCleanMode: the list of elements to hide is empty");
  for (const selector of selectors)
    for (const el of document.querySelectorAll<SVGElement>(selector)) {
      if (!hiddenByClean.has(el)) hiddenByClean.set(el, el.style.display);
      el.style.setProperty("display", "none", "important");
    }
  return { hidden: hiddenByClean.size };
}

/** Composites the two hemisphere images (west, east) side-by-side into a single planetary diptych. */
export async function captureDiptych(
  format: "png" | "jpeg" | "webp",
  quality: number,
  shift: number,
  rotationY = 0,
  distance?: number
): Promise<{ data: string; mimeType: string; width: number; height: number }> {
  const canvas = canvas3d();
  if (!canvas) throw new AgentError("captureDiptych: no 3D view is open (use open3d first)");
  const cw = canvas.width;
  const ch = canvas.height;

  // Globe distance with breathing margins so headers and footers never collide with the spheres
  const dist = distance ?? config.view3dDefaultDistance.globe * 1.22; // const-ok
  const r = await renderer();
  r.setView({ x: -shift, y: rotationY, distance: dist });
  await waitUntilStable();
  const westPic = capture3d("png", 100);

  r.setView({ x: shift, y: rotationY, distance: dist });
  await waitUntilStable();
  const eastPic = capture3d("png", 100);

  // Perspective camera projection of a sphere of radius 1 at distance dist:
  const fovRad = (45 * Math.PI) / 180; // const-ok: camera field of view (45 degrees)
  const safeDist = Math.max(1.1, dist); // const-ok
  const theta = Math.asin(1 / safeDist);
  const radiusPx = (ch / 2) * (Math.tan(theta) / Math.tan(fovRad / 2));

  const comp = document.createElement("canvas");
  comp.width = cw * 2; // const-ok
  comp.height = ch;
  const ctx = comp.getContext("2d");
  if (!ctx) throw new AgentError("captureDiptych: 2D canvas context unavailable");

  ctx.fillStyle = config.diptychBgColor;
  ctx.fillRect(0, 0, comp.width, comp.height);

  let seed = 42;
  const next = () => {
    seed = (seed * 16807) % 2147483647; // const-ok
    return (seed - 1) / 2147483646; // const-ok
  };
  const starCount = 350;
  for (let i = 0; i < starCount; i++) {
    const sx = next() * comp.width;
    const sy = next() * comp.height;
    const sr = next() * 1.5 + 0.3;
    const sa = 0.2 + next() * 0.7;
    ctx.fillStyle = config.diptychTextColor;
    ctx.globalAlpha = sa;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  const loadImg = (b64: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });

  const [westImg, eastImg] = await Promise.all([loadImg(westPic.data), loadImg(eastPic.data)]);

  const drawGlobe = (img: HTMLImageElement, offsetX: number) => {
    const cx = offsetX + cw / 2;
    const cy = ch / 2;

    // Atmospheric limb glow (Rayleigh halo) behind and around the planet rim
    const glowGrad = ctx.createRadialGradient(cx, cy, radiusPx * 0.98, cx, cy, radiusPx * 1.035);
    glowGrad.addColorStop(0, config.diptychAtmosphereColor);
    glowGrad.addColorStop(0.5, config.diptychAtmosphereMidColor);
    glowGrad.addColorStop(1, config.diptychAtmosphereEndColor);
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx * 1.035, 0, Math.PI * 2);
    ctx.fill();

    // Clip to exact spherical disc to preserve the seamless continuous starfield
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx + 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, offsetX, 0, cw, ch);
    ctx.restore();
  };

  drawGlobe(westImg, 0);
  drawGlobe(eastImg, cw);

  const mapName = (options.map.lore?.name || "WORLD").toUpperCase();
  const coords = options.map.geography?.coordinates;
  const spanLon = coords ? coords.lonT : 360;
  const oceanClose = Math.max(0, 360 - spanLon);

  ctx.textAlign = "center";
  ctx.fillStyle = config.diptychTextColor;
  ctx.font = "bold 28px 'Segoe UI', Montserrat, sans-serif";
  ctx.fillText(`PLANÈTE ${mapName}`, comp.width / 2, 45);

  ctx.fillStyle = config.diptychSubtextColor;
  ctx.font = "14px 'Segoe UI', monospace";
  ctx.fillText(
    `CARTOGRAPHIE ORBITALE • ÉTENDUE : ${spanLon}° LON • OCÉAN DE FERMETURE : ${oceanClose}°`,
    comp.width / 2,
    72
  );

  ctx.fillStyle = config.diptychTextColor;
  ctx.font = "bold 20px 'Segoe UI', sans-serif";
  ctx.fillText("HÉMISPHÈRE OCCIDENTAL", cw / 2, ch - 35);
  ctx.fillText("HÉMISPHÈRE ORIENTAL", cw + cw / 2, ch - 35);

  const mimeType = `image/${format}`;
  const url = comp.toDataURL(mimeType, quality / 100);
  if (!url.startsWith(`data:${mimeType}`)) throw new AgentError(`captureDiptych: this browser cannot encode ${format}`);
  return { data: url.slice(url.indexOf(",") + 1), mimeType, width: comp.width, height: comp.height };
}

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const schema = z.object({
  azgaarDist: z.string(),
  azgaarPackage: z.string(),
  mapsDir: z.string(),
  presetsFile: z.string(),
  layerPresets: z.record(z.string(), z.array(z.string())), // built-in layer presets; the ones saved in maps/ win on a same name
  exportsDir: z.string(),
  profileDir: z.string(),
  startup: z.enum(["autosave", "new"]),
  allowEval: z.boolean(),
  server: z.object({ host: z.string(), port: z.number().int().min(0).max(65535) }),
  browser: z.object({
    channel: z.string().nullable(),
    fallbackChannels: z.array(z.string()),
    seedStorage: z.record(z.string(), z.string()),
    executablePath: z.string().nullable(),
    headless: z.boolean(),
    openOnStart: z.boolean(), // false: the window opens at the first tool that needs the map, not when the AI client starts
    viewport: z.object({ width: z.number().int().min(320), height: z.number().int().min(240) }),
    readyTimeoutMs: z.number().int().min(1000),
    args: z.array(z.string())
  }),
  map: z.object({ seed: z.string().nullable(), width: z.number().int().min(100), height: z.number().int().min(100) }),
  history: z.object({ maxEntries: z.number().int().min(1) }),
  autosave: z.object({ intervalSec: z.number().min(0) }), // 0 turns the periodic save off (saves after each edit remain)
  view: z.object({ format: z.enum(["png", "jpeg"]), jpegQuality: z.number().int().min(1).max(100), settleMs: z.number().int().min(0), maxImageBytes: z.number().int().min(10000), textOnly: z.boolean().default(false) }),
  export: z.object({
    format: z.enum(["png", "jpeg"]),
    jpegQuality: z.number().int().min(1).max(100),
    maxPixels: z.number().int().min(100),
    maxSourcePixels: z.number().int().min(512).default(8192), // opt-in supersampled canvas (Chromium/bridge limit)
    clean: z.boolean(), // default of map_export "clean": force game pictograms off for the shot
    cleanHide: z.array(z.string()) // CSS selectors hidden by a clean capture (port anchors, routes, markers, ice)
  }),
  view3d: z.object({
    format: z.enum(["png", "jpeg", "webp"]),
    quality: z.number().int().min(1).max(100),
    hemisphereOffset: z.number().min(0).max(0.5), // two-hemisphere globe: each view is centred this fraction of the map's longitude span from its middle
    presets: z.record(z.string(), z.object({ satellite: z.boolean().optional(), erosion: z.boolean().optional(), layerPreset: z.string().optional() }))
  }),
  limits: z.object({ listMax: z.number().int(), zoomMin: z.number(), zoomMax: z.number(), cameraMsMax: z.number().int(), scaleTolerance: z.number(), imageBytesMin: z.number().int(), imageBytesMax: z.number().int(), mapSizeMin: z.number().int(), mapSizeMax: z.number().int(), exportTimeoutMs: z.number().int().min(1000).default(60000), mapFileBytesMax: z.number().int().min(1).default(200000000) }),
  bridge: z.record(z.string(), z.unknown())
});

export type Config = z.infer<typeof schema> & { root: string };

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]); // const-ok: loopback host names are protocol constants

/** True when the map server only listens on this computer. Anything else lets other devices of the network reach it. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** Reads config/fmg-mcp.json (or $FMG_CONFIG), then applies the few environment overrides. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const file = env.FMG_CONFIG ?? join(PROJECT_ROOT, "config", "fmg-mcp.json");
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`Invalid config ${file}: ${z.prettifyError(parsed.error)}`);
  const cfg = parsed.data;
  const headless = flag(env.FMG_HEADLESS);
  if (headless !== undefined) cfg.browser.headless = headless;
  if (env.FMG_EXECUTABLE_PATH) cfg.browser.executablePath = env.FMG_EXECUTABLE_PATH;
  if (env.FMG_PORT) {
    const port = schema.shape.server.shape.port.safeParse(Number(env.FMG_PORT));
    if (!port.success) throw new Error(`Invalid FMG_PORT "${env.FMG_PORT}": it must be a whole number from 0 to 65535 (0 = any free port)`);
    cfg.server.port = port.data;
  }
  if (env.FMG_MAPS_DIR) cfg.mapsDir = env.FMG_MAPS_DIR;
  if (env.FMG_EXPORTS_DIR) cfg.exportsDir = env.FMG_EXPORTS_DIR;
  if (env.FMG_PROFILE_DIR) cfg.profileDir = env.FMG_PROFILE_DIR;
  const textOnly = flag(env.FMG_TEXT_ONLY);
  if (textOnly !== undefined) cfg.view.textOnly = textOnly;
  const allowEval = flag(env.FMG_ALLOW_EVAL);
  if (allowEval !== undefined) cfg.allowEval = allowEval;
  const fromRoot = (p: string) => {
    if (process.platform !== "win32" && /^[a-z]:[\\/]/i.test(p)) {
      throw new Error(`Windows drive path is not valid on ${process.platform}: ${p}. Use an OS-native path (FMG_EXPORTS_DIR for exports).`);
    }
    return isAbsolute(p) ? p : join(PROJECT_ROOT, p);
  };
  return { ...cfg, azgaarDist: fromRoot(cfg.azgaarDist), azgaarPackage: fromRoot(cfg.azgaarPackage), mapsDir: fromRoot(cfg.mapsDir), exportsDir: fromRoot(cfg.exportsDir), profileDir: fromRoot(cfg.profileDir), root: PROJECT_ROOT };
}

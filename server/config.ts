import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const schema = z.object({
  azgaarDist: z.string(),
  azgaarPackage: z.string(),
  mapsDir: z.string(),
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
    viewport: z.object({ width: z.number().int().min(320), height: z.number().int().min(240) }),
    readyTimeoutMs: z.number().int().min(1000),
    args: z.array(z.string())
  }),
  map: z.object({ seed: z.string().nullable(), width: z.number().int().min(100), height: z.number().int().min(100) }),
  history: z.object({ maxEntries: z.number().int().min(1) }),
  autosave: z.object({ intervalSec: z.number().min(0) }), // 0 turns the periodic save off (saves after each edit remain)
  view: z.object({ format: z.enum(["png", "jpeg"]), jpegQuality: z.number().int().min(1).max(100), settleMs: z.number().int().min(0), maxImageBytes: z.number().int().min(10000), textOnly: z.boolean().default(false) }),
  limits: z.object({ listMax: z.number().int(), zoomMin: z.number(), zoomMax: z.number(), cameraMsMax: z.number().int(), mapSizeMin: z.number().int(), mapSizeMax: z.number().int(), exportTimeoutMs: z.number().int().min(1000) }),
  bridge: z.record(z.string(), z.unknown())
});

export type Config = z.infer<typeof schema> & { root: string };

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  return ["1", "true", "yes"].includes(value.toLowerCase());
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
  if (env.FMG_PORT) cfg.server.port = Number(env.FMG_PORT);
  if (env.FMG_MAPS_DIR) cfg.mapsDir = env.FMG_MAPS_DIR;
  if (env.FMG_PROFILE_DIR) cfg.profileDir = env.FMG_PROFILE_DIR;
  const textOnly = flag(env.FMG_TEXT_ONLY);
  if (textOnly !== undefined) cfg.view.textOnly = textOnly;
  const allowEval = flag(env.FMG_ALLOW_EVAL);
  if (allowEval !== undefined) cfg.allowEval = allowEval;
  const fromRoot = (p: string) => (isAbsolute(p) ? p : join(PROJECT_ROOT, p));
  return { ...cfg, azgaarDist: fromRoot(cfg.azgaarDist), azgaarPackage: fromRoot(cfg.azgaarPackage), mapsDir: fromRoot(cfg.mapsDir), exportsDir: fromRoot(cfg.exportsDir), profileDir: fromRoot(cfg.profileDir), root: PROJECT_ROOT };
}

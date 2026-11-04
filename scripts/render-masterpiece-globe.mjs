// Standalone CLI for the same in-page globe renderer used by map_3d.
// Example: node scripts/render-masterpiece-globe.mjs --seed trois --resolution 1024 --erosion --clouds --diptych
// Build once with `npm run build:azgaar`; optionally set FMG_TEST_CHROMIUM / FMG_TEST_ARGS for a local browser.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/config.ts";
import { MapSession } from "../server/browser.ts";
import { startStaticServer } from "../server/static.ts";

function parseArgs(argv) {
  const opts = { resolution: 2048, seed: null, name: "planet", erosion: false, clouds: false, diptych: false, atmosphere: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") return null;
    if (arg === "--erosion") opts.erosion = true;
    else if (arg === "--clouds") opts.clouds = true;
    else if (arg === "--diptych") opts.diptych = true;
    else if (arg === "--no-atmosphere") opts.atmosphere = false;
    else if (["--resolution", "--name", "--seed"].includes(arg)) {
      if (!argv[++i]) throw new Error(`Missing value for ${arg}`);
      opts[arg.slice(2)] = argv[i];
    } else throw new Error(`Unknown option: ${arg} (see --help)`);
  }
  opts.resolution = Number(opts.resolution);
  if (!Number.isInteger(opts.resolution) || opts.resolution < 512 || opts.resolution > 8192)
    throw new Error("--resolution must be an integer between 512 and 8192");
  if (!/^[\w-]{1,80}$/.test(opts.name)) throw new Error("--name must contain only letters, digits, underscores or hyphens");
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.log("Usage: node scripts/render-masterpiece-globe.mjs [--seed SEED] [--name NAME] [--resolution 512..8192] [--erosion] [--clouds] [--no-atmosphere] [--diptych]");
    return;
  }
  const cfg = loadConfig();
  cfg.browser.headless = true;
  if (opts.seed) cfg.map.seed = opts.seed;
  if (process.env.FMG_TEST_CHROMIUM) { cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM; cfg.browser.channel = null; }
  if (process.env.FMG_TEST_ARGS) cfg.browser.args = process.env.FMG_TEST_ARGS.split(",").filter(Boolean);
  const tempProfile = mkdtempSync(join(tmpdir(), "fmg-globe-cli-"));
  cfg.profileDir = tempProfile;
  let web;
  let session;
  try {
    web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    session = new MapSession(cfg, web.url);
    // These calls are FMG_AGENT.open3d / capture3d / captureDiptych / close3d
    // in the running Azgaar page — precisely the native path used by map_3d.
    const opened = await session.call("open3d", {
      mode: "globe", satellite: true, erosion: opts.erosion, atmosphere: opts.atmosphere,
      clouds: opts.clouds, textureResolution: opts.resolution
    });
    if (!opened.finished) console.warn("Globe is still rendering: try a lower resolution if the image is incomplete.");
    const image = opts.diptych
      ? await session.call("captureDiptych", "png", 95, 80)
      : await session.call("capture3d", "png", 95);
    mkdirSync(cfg.exportsDir, { recursive: true });
    const path = join(cfg.exportsDir, `${opts.name}${opts.diptych ? "-diptych" : ""}.png`);
    writeFileSync(path, Buffer.from(image.data, "base64"));
    console.log(`Globe saved to ${path} (${image.width} x ${image.height})`);
  } finally {
    if (session) {
      await session.call("close3d").catch(() => undefined);
      await session.close();
    }
    if (web) await web.close();
    rmSync(tempProfile, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("render-masterpiece-globe.mjs")) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

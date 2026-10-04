// Quick compatibility check of the bridge against a built Azgaar, independent of the map seed.
// Usage: node scripts/compat.mjs [azgaar folder]   (default: upstream/azgaar). Exit code 0 = compatible.
// `npm run update` runs this on a freshly built Azgaar and only switches to it when it passes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../server/config.ts";
import { MapSession } from "../server/browser.ts";
import { startStaticServer } from "../server/static.ts";
import { upstreamDir } from "./azgaar.mjs";

const dir = resolve(process.argv[2] ?? upstreamDir);
const cfg = loadConfig();
const work = mkdtempSync(join(tmpdir(), "azgaar-compat-"));
cfg.azgaarDist = join(dir, "dist-electron", "renderer");
cfg.azgaarPackage = join(dir, "package.json");
cfg.browser.headless = true;
cfg.profileDir = join(work, "profile");
cfg.mapsDir = join(work, "maps");
cfg.map.seed = `compat-${Date.now()}`;
if (process.env.FMG_TEST_CHROMIUM) {
  cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM;
  cfg.browser.channel = null;
}
cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures += 1;
};

const web = await startStaticServer(cfg.azgaarDist, cfg.server.host, 0);
const session = new MapSession(cfg, web.url);
try {
  const page = await session.ensure();
  await page.waitForTimeout(500);
  const A = (fn, arg) => page.evaluate(fn, arg);

  check("the bridge is loaded", await A(() => typeof FMG_AGENT?.summary === "function"));
  const sum = await A(() => FMG_AGENT.summary());
  check("the map has states and cities", sum.states.length > 1 && sum.counts.burgs > 0, `${sum.states.length} states`);
  const total = s => s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells;
  check("state cells + unclaimed land = all land", total(sum) === sum.landCells);

  const pair = sum.states.flatMap(s => s.neighbours.filter(n => n > 0 && sum.states.some(x => x.id === n)).map(n => [s.id, n])).find(() => true);
  check("two neighbouring states exist", Boolean(pair));
  if (pair) {
    const [from, to] = pair;
    const base = await A(() => FMG_AGENT.exportMap());
    const sel = await A(([f, t]) => FMG_AGENT.select("border", { from: f, to: t, depth: 1 }, {}), [from, to]);
    check("a border selection finds cells", sel.count > 0, `${sel.count} cells`);
    check("the selection preview is drawn", await A(() => Boolean(document.getElementById("fmgAgentOverlay")?.querySelector("path"))));
    const res = await A(([id, t]) => FMG_AGENT.apply("assignState", { selection: id, state: t }), [sel.id, to]);
    check("assignState changes cells", res.ok && res.changed > 0, `${res.changed} cells`);
    const after = await A(() => FMG_AGENT.summary());
    check("figures stay consistent after the edit", total(after) === after.landCells);
    check("the receiving state grew", after.states.find(s => s.id === to).cells > sum.states.find(s => s.id === to).cells);
    await A(t => FMG_AGENT.importMap(t), base);
    const back = await A(() => FMG_AGENT.summary());
    check("undo (reload of the saved map) restores the states", JSON.stringify(back.states.map(s => [s.id, s.cells])) === JSON.stringify(sum.states.map(s => [s.id, s.cells])));
  }
  const shot = await session.screenshot();
  check("a screenshot can be taken", shot.data.length > 10000, `${shot.data.length} bytes`);
  check("no JavaScript errors in the page", session.pageErrors.length === 0, session.pageErrors.slice(0, 2).join(" | "));
} catch (err) {
  check("the check ran to the end", false, err instanceof Error ? err.message : String(err));
} finally {
  await session.close().catch(() => {});
  await web.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `\nNOT compatible: ${failures} check(s) failed` : "\nCompatible");
process.exit(failures ? 1 : 0);

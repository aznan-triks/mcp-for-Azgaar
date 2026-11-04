// Real-browser compatibility gate for a freshly built Azgaar candidate (never touches user maps).
// Usage: node scripts/compat.mjs [candidate directory]. npm run update runs this before promotion.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../server/config.ts";
import { MapSession } from "../server/browser.ts";
import { startStaticServer } from "../server/static.ts";
import { vendorDir } from "./azgaar.mjs";

const dir = resolve(process.argv[2] ?? vendorDir);
const cfg = loadConfig();
const work = mkdtempSync(join(tmpdir(), "fmg-compat-"));
cfg.azgaarDist = join(dir, "dist-electron", "renderer");
cfg.azgaarPackage = join(dir, "package.json");
cfg.browser.headless = true;
cfg.browser.viewport = { width: 1280, height: 720 };
cfg.profileDir = join(work, "profile");
cfg.mapsDir = join(work, "maps");
cfg.map.seed = "trois";
cfg.map.width = 1280;
cfg.map.height = 720;
if (process.env.FMG_TEST_CHROMIUM) {
  cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM;
  cfg.browser.channel = null;
}
cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `: ${extra}` : ""}`);
  if (!ok) failed++;
};
let web;
let session;
try {
  web = await startStaticServer(cfg.azgaarDist, cfg.server.host, 0);
  session = new MapSession(cfg, web.url);
  const page = await session.ensure();
  const A = (fn, arg) => page.evaluate(fn, arg);
  check("the bridge is loaded", await A(() => typeof FMG_AGENT?.summary === "function"));
  const sum = await A(() => FMG_AGENT.summary());
  check("a seeded map has states and cities", sum.states.length > 2 && sum.counts.burgs > 0);
  const total = s => s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells;
  check("state and unclaimed cell counts add up", total(sum) === sum.landCells);
  const big = sum.states.filter(s => s.cells >= 20);
  const pair = big.flatMap(a => a.neighbours.map(id => big.find(b => b.id === id)).filter(Boolean).map(b => [a, b]))
    .sort((p, q) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0];
  check("two neighbouring states exist", Boolean(pair));
  if (pair) {
    const [receiver, donor] = pair;
    const saved = await A(() => FMG_AGENT.exportMap());
    const selection = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 1 }, {}), [donor.id, receiver.id]);
    check("border selection has cells", selection.count > 0);
    const result = await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [selection.id, receiver.id]);
    check("territory edit succeeds", result.ok && result.changed > 0);
    const edited = await A(() => FMG_AGENT.summary());
    check("territory figures still add up", total(edited) === edited.landCells);
    check("receiving state grew", edited.states.find(s => s.id === receiver.id).cells > receiver.cells);
    await A(t => FMG_AGENT.importMap(t), saved);
    const restored = await A(() => FMG_AGENT.summary());
    check("snapshot restores the state figures", JSON.stringify(restored.states.map(s => [s.id, s.cells])) === JSON.stringify(sum.states.map(s => [s.id, s.cells])));
  }
  check("text-only map is available", (await A(() => FMG_AGENT.textMap({ cols: 24, rows: 8 }))).rows.length === 8);
  check("native action menu is available", (await A(() => FMG_AGENT.menuList({}))).total > 0);
  const shot = await session.screenshot();
  check("a screenshot is available", shot.data.length > 10000);
  check("no outside requests were attempted", session.blockedRequests.size === 0, [...session.blockedRequests].join(", "));
  check("no browser errors", session.pageErrors.length === 0, session.pageErrors.slice(0, 2).join(" | "));
} catch (err) {
  check("compatibility test completed", false, err instanceof Error ? err.message : String(err));
} finally {
  await session?.close().catch(() => undefined);
  await web?.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? `\nNOT compatible: ${failed} check(s) failed` : "\nCompatible");
process.exit(failed ? 1 : 0);

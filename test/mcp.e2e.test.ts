// End-to-end: a real MCP client talks to the real server over stdio, which drives a real browser on a real (seeded) map.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(import.meta.dirname, "..");
const SEED = "333";
const work = mkdtempSync(join(tmpdir(), "fmg-e2e-"));
const mapsDir = join(work, "maps");

const base = JSON.parse(readFileSync(join(ROOT, "config", "fmg-mcp.json"), "utf8"));
// Default: headless Chromium. FMG_TEST_HEADED=1 FMG_TEST_CHANNEL=chrome exercises the real default route (visible window, installed Chrome).
base.browser.headless = !process.env.FMG_TEST_HEADED;
base.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
base.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
base.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
base.map.seed = SEED;
base.server.port = 0;
base.exportsDir = join(work, "exports");
base.allowEval = true;
base.startup = "autosave";
base.autosave = { intervalSec: 2 };
const configFile = join(work, "config.json");
writeFileSync(configFile, JSON.stringify(base));

type Part = { type: string; text?: string; data?: string; mimeType?: string };
type Reply = { isError?: boolean; content: Part[] };

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "scripts", "start.mjs")], // the same entry point that npm run register gives to AI clients
    env: { ...(process.env as Record<string, string>), FMG_CONFIG: configFile, FMG_MAPS_DIR: mapsDir, FMG_PROFILE_DIR: join(work, "profile") },
    stderr: "pipe"
  });
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(transport);
  return client;
}

let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}): Promise<Reply> => (await client.callTool({ name, arguments: args })) as Reply;
const json = (r: Reply): any => JSON.parse(r.content.find(p => p.type === "text")?.text ?? "null");
const ok = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await call(name, args);
  assert.ok(!r.isError, `${name} failed: ${r.content[0]?.text}`);
  return r;
};
const cells = (summary: any, id: number): number => summary.states.find((s: any) => s.id === id).cells;

describe("MCP server end to end", { timeout: 300000 }, () => {
  let gazd = 0;
  let khuzd = 0;
  let baseline: any;

  before(async () => {
    client = await connect();
    await ok("map_file", { action: "new", seed: SEED, width: 1280, height: 720 });
    baseline = json(await ok("map_summary"));
    const big = baseline.states.filter((s: any) => s.cells >= 60);
    const pairs = big.flatMap((a: any) => a.neighbours.map((n: number) => big.find((s: any) => s.id === n)).filter(Boolean).map((b: any) => [a, b]));
    const best = pairs.sort((p: any, q: any) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0];
    gazd = best[0].id;
    khuzd = best[1].id;
  });
  after(async () => {
    await client.close();
    rmSync(work, { recursive: true, force: true });
  });

  it("exposes instructions and the expected tools", async () => {
    const guide = client.getInstructions() ?? "";
    for (const word of ["map_summary", "map_list with name", "ring", "mergeStates", "map_layers", "scope all"]) assert.ok(guide.includes(word), `instructions must mention: ${word}`);
    const names = (await client.listTools()).tools.map(t => t.name);
    for (const n of ["map_view", "map_summary", "map_locate", "map_list", "map_select", "map_commands", "map_apply", "map_undo", "map_camera", "map_layers", "map_file", "map_status", "map_export", "map_menu", "map_ui", "map_options", "map_eval"]) assert.ok(names.includes(n), `missing ${n}`);
  });

  it("draws the map in characters, with no image, for models that cannot see", async () => {
    const r = await ok("map_view", { text_map: true, cols: 60, rows: 24 });
    assert.equal(r.content.filter(p => p.type === "image").length, 0);
    const map = JSON.parse((r.content.find(p => p.type === "text") as { text: string }).text);
    assert.ok(map.rows, "the first text part holds the map");
    assert.equal(map.rows.length, 24);
    assert.ok(map.rows.every((line: string) => line.length === 60));
    assert.ok(map.rows.join("").includes("~"), "sea is drawn");
    assert.ok(Object.keys(map.key).length > 1, "states are listed in the key");
    const refused = await client.callTool({ name: "map_view", arguments: { text_map: true, cols: 3 } });
    assert.ok(refused.isError, "a too small size is refused");
  });

  it("returns a real screenshot with legend and annotations", async () => {
    const r = await ok("map_view", { grid: true, state_ids: true });
    const img = r.content.find(p => p.type === "image");
    assert.ok(img?.data && img.mimeType === "image/png");
    const png = Buffer.from(img.data, "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 720);
    const info = json(r);
    assert.equal(info.legend.length, baseline.counts.states);
    assert.ok(info.annotations.gridStep > 0);
    const plain = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    assert.notEqual(plain, img.data, "annotations must change the picture");
  });

  it("describes commands and refuses bad input with a useful message", async () => {
    const d = json(await ok("map_commands"));
    assert.ok(d.commands.some((c: any) => c.name === "assignState") && d.shapes.border);
    const bad = await call("map_apply", { command: "assignState", params: { selection: "sel-1", stat: 3 } });
    assert.ok(bad.isError);
    assert.match(bad.content[0].text ?? "", /unknown parameter "stat"/);
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, 0, "failed edit must leave no undo entry");
  });

  it("previews a selection, applies it, and the figures add up", async () => {
    const before = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    const sel = json(await ok("map_select", { shape: "border", args: { from: khuzd, to: gazd, depth: 3 } }));
    assert.ok(sel.count > 20);
    const withPreview = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    assert.notEqual(withPreview, before, "red preview must be visible in the screenshot");
    const res = json(await ok("map_apply", { command: "assignState", params: { selection: sel.id, state: gazd } }));
    assert.equal(res.result.changed, sel.count);
    const after = json(await ok("map_summary"));
    assert.equal(cells(after, gazd) - cells(baseline, gazd), sel.count);
    assert.equal(cells(baseline, khuzd) - cells(after, khuzd), sel.count);
    assert.ok(existsSync(join(mapsDir, "autosave.map")), "autosave written");
  });

  it("undo and redo restore exact figures", async () => {
    await ok("map_undo", { action: "undo" });
    const undone = json(await ok("map_summary"));
    assert.equal(cells(undone, gazd), cells(baseline, gazd));
    assert.equal(cells(undone, khuzd), cells(baseline, khuzd));
    await ok("map_undo", { action: "redo" });
    const redone = json(await ok("map_summary"));
    assert.ok(cells(redone, gazd) > cells(baseline, gazd));
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, 1);
  });

  it("an edit that changes nothing leaves no undo entry", async () => {
    let waterCell = -1;
    for (const [x, y] of [[640, 20], [30, 380], [640, 700], [1250, 380], [320, 40]]) {
      const here = json(await ok("map_locate", { x, y }));
      if (!here.land) {
        waterCell = here.cell;
        break;
      }
    }
    assert.ok(waterCell >= 0, "test needs a water cell");
    const water = json(await ok("map_select", { shape: "cells", args: { cells: [waterCell] }, land_only: false }));
    assert.ok(water.count === 1 && water.land === 0);
    const before = json(await ok("map_undo", { action: "list" })).undoable.length;
    const r = json(await ok("map_apply", { command: "assignState", params: { selection: water.id, state: gazd } }));
    assert.equal(r.result.changed, 0);
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, before);
  });

  it("saves, loads and rejects unsafe names", async () => {
    const snap = json(await ok("map_summary"));
    await ok("map_file", { action: "save", name: "checkpoint one" });
    assert.ok(existsSync(join(mapsDir, "checkpoint one.map")));
    await ok("map_apply", { command: "rename", params: { kind: "state", id: gazd, name: "Zorgland", full_name: "Empire of Zorgland" } });
    assert.match(JSON.stringify(json(await ok("map_summary")).states), /Empire of Zorgland/);
    await ok("map_file", { action: "load", name: "checkpoint one" });
    const loaded = json(await ok("map_summary"));
    assert.deepEqual(loaded.states.map((s: any) => [s.id, s.name, s.cells]), snap.states.map((s: any) => [s.id, s.name, s.cells]));
    const listed = json(await ok("map_file", { action: "list" })).maps.find((m: any) => m.name === "checkpoint one");
    assert.ok(listed && listed.sizeBytes > 0 && listed.path.endsWith("checkpoint one.map") && !Number.isNaN(Date.parse(listed.modified)), "list gives name, path, size and date");
    for (const name of ["../escape", "a/b", "..", ""]) assert.ok((await call("map_file", { action: "save", name })).isError, `name "${name}" must be refused`);
  });

  it("map_locate answers from a screenshot pixel", async () => {
    await ok("map_camera", { scale: 1 });
    const r = json(await ok("map_locate", { px: 500, py: 345 }));
    assert.equal(typeof r.cell, "number");
    assert.equal(r.land, true);
    assert.ok(r.queried.mapX > 0);
  });

  it("map_eval works and takes an undo snapshot first", async () => {
    const r = json(await ok("map_eval", { code: "return FMG_AGENT.summary().counts.states" }));
    assert.equal(r.result, baseline.counts.states);
    assert.ok(json(await ok("map_undo", { action: "list" })).undoable.includes("map_eval"));
  });

  it("lists and toggles layers", async () => {
    const l = json(await ok("map_layers"));
    assert.ok(l.available.includes("heightmap") && l.active.includes("states"));
    assert.ok(json(await ok("map_layers", { show: ["heightmap"] })).active.includes("heightmap"));
    assert.ok(!json(await ok("map_layers", { hide: ["heightmap"] })).active.includes("heightmap"));
    const bad = await call("map_layers", { show: ["nope"] });
    assert.ok(bad.isError && /Unknown layer/.test(bad.content[0].text ?? ""));
  });

  it("edits terrain in place, shows it, and undo takes it back", async () => {
    await ok("map_layers", { show: ["heightmap"] });
    const before = json(await ok("map_locate", { x: 840, y: 330 })).height;
    const sums = json(await ok("map_summary")).states.map((s: any) => [s.id, s.cells]);
    const plain = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    const res = json(await ok("map_apply", { command: "shapeCone", params: { x: 840, y: 330, radius: 60, peak: 95 } }));
    assert.equal(res.result.details.mode, "in place");
    const raised = json(await ok("map_locate", { x: 840, y: 330 })).height;
    assert.ok(raised >= 85 && raised > before, `${before} -> ${raised}`);
    assert.deepEqual(json(await ok("map_summary")).states.map((s: any) => [s.id, s.cells]), sums, "states untouched by an in-place relief edit");
    const edited = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    assert.notEqual(edited, plain, "the new relief must be visible with the heightmap layer on");
    await ok("map_undo", { action: "undo" });
    const back = json(await ok("map_locate", { x: 840, y: 330 })).height;
    assert.ok(back < raised && Math.abs(back - before) <= 1, `undo: ${before} -> ${raised} -> ${back}`);
    await ok("map_layers", { hide: ["heightmap"] });
  });

  it("restores the map automatically when an edit crashes midway", async () => {
    const sums = json(await ok("map_summary")).states.map((s: any) => [s.id, s.cells]);
    await ok("map_eval", { code: "window.__realEconomy = Production.regenerateEconomy; Production.regenerateEconomy = () => { throw new Error('simulated crash'); }; return true" });
    const depth = json(await ok("map_undo", { action: "list" })).undoable.length;
    const r = await call("map_apply", { command: "shapeCone", params: { x: 640, y: 690, radius: 40, peak: 45, scope: "all" } });
    assert.ok(r.isError, "the edit must fail");
    assert.match(r.content[0].text ?? "", /simulated crash/);
    assert.match(r.content[0].text ?? "", /restored/);
    await ok("map_eval", { code: "Production.regenerateEconomy = window.__realEconomy; return true" });
    assert.deepEqual(json(await ok("map_summary")).states.map((s: any) => [s.id, s.cells]), sums, "map back as before the crashed edit");
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth + 1, "only the second map_eval added an entry; the crashed edit left none");
    const ok2 = json(await ok("map_apply", { command: "shapeCone", params: { x: 640, y: 690, radius: 40, peak: 45, scope: "all" } }));
    assert.equal(ok2.result.details.mode, "rebuild", "the same edit works once the sabotage is removed");
    assert.equal(json(await ok("map_summary")).counts.states, baseline.counts.states);
  });

  it("founds a state through MCP, then undo removes it", async () => {
    const base = json(await ok("map_summary"));
    const owner = base.states[0];
    const p = json(await ok("map_locate", { x: owner.pole[0], y: owner.pole[1] }));
    assert.equal(p.state.id, owner.id);
    const made = json(await ok("map_apply", { command: "createState", params: { x: owner.pole[0] + 3, y: owner.pole[1] + 3, name: "Mcpland" } }));
    assert.ok(made.result.details.state > baseline.counts.states);
    assert.equal(json(await ok("map_summary")).counts.states, base.counts.states + 1);
    await ok("map_undo", { action: "undo" });
    const back = json(await ok("map_summary"));
    assert.equal(back.counts.states, base.counts.states);
    assert.deepEqual(back.states.map((s: any) => [s.id, s.cells]), base.states.map((s: any) => [s.id, s.cells]));
  });

  it("lists marker types, markers and routes", async () => {
    const types = json(await ok("map_list", { kind: "markerTypes" }));
    assert.ok(types.rows.length > 5);
    assert.ok(Array.isArray(json(await ok("map_list", { kind: "markers" })).rows));
    assert.ok(Array.isArray(json(await ok("map_list", { kind: "routes" })).rows));
    const bad = await call("map_list", { kind: "nonsense" });
    assert.ok(bad.isError && /Available/.test(bad.content[0].text ?? ""));
  });

  it("the periodic autosave also captures edits made by hand in the window", async () => {
    // Simulates a manual edit that happens after the tool call returned (so no tool autosaved it).
    await ok("map_eval", { code: "setTimeout(() => { for (const s of pack.states) if (s.i === 3) { s.name = 'ManualEdit'; s.fullName = 'ManualEdit'; } }, 300); return true" });
    const file = join(mapsDir, "autosave.map");
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      await new Promise(r => setTimeout(r, 500));
      seen = readFileSync(file, "utf8").includes("ManualEdit");
    }
    assert.ok(seen, "the manual edit never reached maps/autosave.map");
  });

  it("finds things by name and frames a region in one call", async () => {
    const all = json(await ok("map_list", { kind: "burgs", limit: 1 }));
    const first = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows[0];
    const part = first.name.slice(0, 3);
    const found = json(await ok("map_list", { kind: "burgs", name: part, limit: 1000 }));
    assert.ok(found.rows.some((r: any) => r.id === first.id) && found.total <= all.total);
    const view = await ok("map_view", { region: { x0: 400, y0: 260, x1: 600, y1: 420 }, grid: true });
    assert.ok(view.content.some(p => p.type === "image"));
    assert.ok(json(view).camera.scale > 1.5, "the window zoomed onto the region");
    assert.ok(json(await ok("map_view", { whole_map: true })).camera.scale <= 1.01, "whole_map frames the whole map before the shot");
    await ok("map_camera", { scale: 1 });
  });

  it("stays offline and serves nothing outside the build folder", async () => {
    const s = json(await ok("map_status"));
    assert.deepEqual(s.pageErrors, []);
    assert.deepEqual(s.blockedOutsideRequests, [], "the map must not ask the network for anything (fonts are bundled)");
    const [host, port] = new URL(s.localUrl).host.split(":");
    for (const path of ["/%2e%2e/%2e%2e/package.json", "/..%2f..%2fconfig/fmg-mcp.json"]) {
      const status = await new Promise<number>((done, fail) => request({ host, port: Number(port), path }, res => (res.resume(), done(res.statusCode ?? 0))).on("error", fail).end());
      assert.ok(status === 403 || status === 404, `${path} -> ${status}`);
    }
  });

  it("founds provinces, cultures and religions, moves labels and emblems through MCP", async () => {
    const base = json(await ok("map_summary"));
    const owner = base.states[0];
    // A free spot inside the owner state, and a city whose label to move (probed via map_eval, whose
    // undo entries stay below the six edits this test undoes at the end).
    const probe = json(
      await ok("map_eval", {
        code: `const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && pack.cells.state[i] === ${owner.id} && !pack.cells.burg[i] && !(pack.cells.province[i] && pack.provinces[pack.cells.province[i]].center === i)); const b = pack.burgs.find(x => x.i && !x.removed); return { x: pack.cells.p[c][0], y: pack.cells.p[c][1], burg: b.i };`
      })
    ).result;
    const spot = { x: probe.x, y: probe.y };
    const province = json(await ok("map_apply", { command: "createProvince", params: { x: spot.x, y: spot.y, name: "E2eprovince" } }));
    assert.ok(province.result.ok && province.result.details.fullName.includes("E2eprovince"));
    assert.equal(province.result.details.state, owner.id);
    const provinces = json(await ok("map_list", { kind: "provinces", state: owner.id, limit: 1000 }));
    assert.ok(provinces.rows.some((r: any) => r.id === province.result.details.province));
    assert.equal(json(await ok("map_summary")).counts.provinces, base.counts.provinces + 1);

    const culture = json(await ok("map_apply", { command: "createCulture", params: { x: spot.x, y: spot.y, name: "E2efolk" } }));
    assert.ok(culture.result.ok && culture.result.warnings.some((w: string) => w.includes("assignCulture")));
    const painted = json(await ok("map_select", { shape: "circle", args: { x: spot.x, y: spot.y, radius: 20 } }));
    const given = json(await ok("map_apply", { command: "assignCulture", params: { selection: painted.id, culture: culture.result.details.culture } }));
    assert.ok(given.result.changed > 0, "the new culture got land");
    const religion = json(await ok("map_apply", { command: "createReligion", params: { x: spot.x + 1, y: spot.y, name: "E2efaith" } }));
    assert.ok(religion.result.ok && religion.result.details.religion > base.counts.religions);

    const labels = json(await ok("map_list", { kind: "labels", limit: 1000 }));
    const burgLabel = labels.rows.find((r: any) => r.type === "burg") ?? { id: probe.burg };
    const moved = json(await ok("map_apply", { command: "moveLabel", params: { kind: "burg", id: burgLabel.id, dx: 4, dy: -2 } }));
    assert.ok(moved.result.ok && moved.result.details.after.dx === 4);
    const emblem = json(await ok("map_apply", { command: "setEmblemStyle", params: { kind: "state", id: owner.id, shield: "round" } }));
    assert.ok(emblem.result.ok && emblem.result.details.after.shield === "round");

    await ok("map_undo", { action: "undo" }); // setEmblemStyle
    await ok("map_undo", { action: "undo" }); // moveLabel
    await ok("map_undo", { action: "undo" }); // createReligion
    await ok("map_undo", { action: "undo" }); // assignCulture
    await ok("map_undo", { action: "undo" }); // createCulture
    await ok("map_undo", { action: "undo" }); // createProvince
    const back = json(await ok("map_summary"));
    assert.deepEqual(
      back.states.map((s: any) => [s.id, s.cells]),
      base.states.map((s: any) => [s.id, s.cells]),
      "undoing the whole founding sequence restores the map"
    );
    assert.equal(back.counts.provinces, base.counts.provinces);
  });

  it("exports pictures and data to files, with the layers the AI chose", async () => {
    const svg = json(await ok("map_export", { format: "svg", name: "t-political" }));
    assert.ok(existsSync(svg.file) && readFileSync(svg.file, "utf8").includes("<svg"), "svg file");
    const png = await ok("map_export", { format: "png", only_layers: ["heightmap", "cultures"], name: "t-height-culture" });
    const info = json({ ...png, content: png.content.filter(p => p.type === "text") });
    assert.deepEqual(readFileSync(info.file).subarray(1, 4).toString(), "PNG");
    assert.ok(info.layersOnScreen.includes("heightmap") && info.layersOnScreen.includes("cultures") && !info.layersOnScreen.includes("states"), `layers: ${info.layersOnScreen}`);
    assert.ok(png.content.some(p => p.type === "image"), "the picture is also returned");
    const full = json(await ok("map_export", { format: "json-full", name: "t-full" }));
    assert.ok(JSON.parse(readFileSync(full.file, "utf8")).info, "json export parses");
    const geo = json(await ok("map_export", { format: "geojson-cells", name: "t-cells" }));
    assert.equal(JSON.parse(readFileSync(geo.file, "utf8")).type, "FeatureCollection");
    const csv = json(await ok("map_export", { format: "csv-burgs", name: "t-burgs" }));
    assert.ok(readFileSync(csv.file, "utf8").split("\n").length > 10, "csv rows");
    const saved = json(await ok("map_export", { format: "map", name: "t-save" }));
    assert.ok(readFileSync(saved.file, "utf8").length > 10000, ".map file");
    await ok("map_layers", { preset: "political" });
    assert.ok(json(await ok("map_layers")).active.includes("states"), "a preset restores the political layers");
    assert.ok((await call("map_layers", { preset: "nope" })).isError);
  });

  it("runs Azgaar's own actions (regenerate, editors) and can undo them", async () => {
    const found = json(await ok("map_menu", { action: "list", query: "burgs" }));
    assert.ok(found.commands.some((c: any) => c.id === "regenerateBurgs"));
    assert.ok((await call("map_menu", { action: "run", id: "newMap" })).isError, "replacing the map is refused here");
    const names = async () => JSON.stringify(json(await ok("map_list", { kind: "burgs", limit: 8 })));
    const before = await names();
    await ok("map_menu", { action: "run", id: "regenerateBurgs" });
    assert.notEqual(await names(), before, "burgs were regenerated");
    await ok("map_undo", { action: "undo" });
    assert.equal(await names(), before, "undo brings the old burgs back");
    const opened = json(await ok("map_menu", { action: "run", id: "editStatesButton" }));
    assert.ok(opened.dialogs.length > 0, "an editor dialog opened");
    const status = json(await ok("map_status"));
    assert.ok(status.history.undoable.length >= 0);
  });

  it("operates the interface: list, find, read and set fields, close dialogs", async () => {
    const list = json(await ok("map_ui", { action: "list", scope: "dialogs" }));
    assert.ok(list.dialogs.length > 0 && list.controls.length > 0, "the open editor and its controls are listed");
    const field = list.controls.find((c: any) => c.kind.startsWith("input:") && c.id && !["checkbox", "radio", "button", "file"].includes(c.kind.slice(6)));
    if (field) {
      const same = json(await ok("map_ui", { action: "get", id: field.id }));
      assert.equal(same.control.id, field.id);
    }
    const missing = await call("map_ui", { action: "click", text: "no such thing on screen xyz" });
    assert.ok(missing.isError && /nothing on screen/.test(missing.content[0].text ?? ""));
    const closed = json(await ok("map_ui", { action: "close_dialogs" }));
    assert.equal(closed.dialogs.length, 0);
    const sel = json(await ok("map_ui", { action: "find", scope: "page", query: "points", hidden: true }));
    assert.ok(sel.total > 0, "page controls can be found");
    await ok("map_menu", { action: "run", id: "selectHeightmap" });
    await ok("map_ui", { action: "click", text: "Archipelago" }); // a tile found by its visible name
    await ok("map_ui", { action: "click", text: "Select" });
    assert.equal(json(await ok("map_options", { action: "get" })).generation.template, "archipelago", "the template chosen in the dialog is used");
    const upload = await call("map_ui", { action: "upload", id: "convertImageLoad", path: join(work, "missing.png") });
    assert.ok(upload.isError && /existing file/.test(upload.content[0].text ?? ""), "a missing file is refused");
  });

  it("a restarted server reloads the autosaved map", async () => {
    const before = json(await ok("map_summary"));
    await client.close();
    client = await connect();
    let after: any = null;
    for (let i = 0; i < 120 && !after; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const r = await call("map_summary");
        if (!r.isError) after = json(r);
        if (after && JSON.stringify(after.states.map((s: any) => [s.id, s.cells])) !== JSON.stringify(before.states.map((s: any) => [s.id, s.cells]))) {
          after = null; // autosave not yet reloaded
        }
      } catch {
        /* server still starting */
      }
    }
    assert.ok(after, "autosaved map was not restored");
    assert.deepEqual(after.states.map((s: any) => [s.id, s.cells]), before.states.map((s: any) => [s.id, s.cells]));
  });
  it("generation settings are read, validated, and used for a new map", async () => {
    const got = json(await ok("map_options", { action: "get" }));
    assert.ok(got.generation.states.limit > 0 && got.choices.templates.length > 3 && got.choices.cultureSets.length > 3);
    const refused = await call("map_options", { action: "set", values: { states: { limit: -4 }, template: 42 } });
    assert.ok(refused.isError && /nothing changed/.test(refused.content[0].text ?? ""), "a bad value is refused");
    assert.equal(json(await ok("map_options", { action: "get" })).generation.states.limit, got.generation.states.limit, "and nothing changed");
    const made = json(await ok("map_file", { action: "new", seed: "333", options: { states: { limit: 5 } } }));
    assert.ok(made.counts.states <= 5 && made.counts.states >= 2, `states asked 5, got ${made.counts.states}`);
    const after = json(await ok("map_options", { action: "get" }));
    assert.equal(after.generation.states.limit, 5, "the setting is kept");
    assert.equal(after.pinned.statesNumber, 5, "and pinned, so the next map does not re-roll it");
    const mapSet = json(await ok("map_options", { action: "set", section: "map", values: { units: { distance: { unit: "mi" } }, lore: { name: "Test Realm" } } }));
    assert.equal(mapSet.pinnedForNextMap["lore.name"], "Test Realm");
    const named = json(await ok("map_file", { action: "new", seed: "333" }));
    assert.equal(named.counts.states <= 5, true, "the pinned state count is used again");
    assert.equal(json(await ok("map_options", { action: "get", section: "map" })).map.lore.name, "Test Realm");
    const released = json(await ok("map_options", { action: "release" }));
    assert.deepEqual(released.pinned, {}, "everything is random again");
    assert.ok((await call("map_options", { action: "set", values: { app: 1 } })).isError, "unknown keys are refused");
  });
});

// End-to-end: a real MCP client talks to the real server over stdio, which drives a real browser on a real (seeded) map.
import { diplomacyMilitaryScenario, militaryProbe } from "./diplomacy-military.scenario.ts";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(import.meta.dirname, "..");
const SEED = "trois";
const work = mkdtempSync(join(tmpdir(), "fmg-e2e-"));
const mapsDir = join(work, "maps");

const base = JSON.parse(readFileSync(join(ROOT, "config", "fmg-mcp.json"), "utf8"));
// Default: headless Chromium. FMG_TEST_HEADED=1 FMG_TEST_CHANNEL=chrome exercises the real default route (visible window, installed Chrome).
base.browser.headless = !process.env.FMG_TEST_HEADED;
base.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
base.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
base.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
base.map.seed = SEED;
base.browser.viewport = { width: 1280, height: 720 }; // tests do not depend on the user-facing default size
base.map.width = 1280;
base.map.height = 720;
base.server.port = 0;
base.allowEval = true;
base.startup = "autosave";
base.autosave = { intervalSec: 2 };
const configFile = join(work, "config.json");
writeFileSync(configFile, JSON.stringify(base));

type Part = { type: string; text?: string; data?: string; mimeType?: string };
type Reply = { isError?: boolean; content: Part[] };

async function connect(evalEnabled = true): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "scripts", "start.mjs")], // the same entry point that npm run register gives to AI clients
    env: { ...(process.env as Record<string, string>), FMG_CONFIG: configFile, FMG_MAPS_DIR: mapsDir, FMG_EXPORTS_DIR: join(work, "exports"), FMG_PROFILE_DIR: join(work, "profile"), FMG_ALLOW_EVAL: evalEnabled ? "1" : "0" },
    stderr: "pipe"
  });
  if (process.env.FMG_DEBUG_SERVER_STDERR) transport.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server] ${d}`));
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

// 8 minutes: the suite runs ~39 real client/server/browser tests end to end (TASK-08 adds the styles block)
describe("MCP server end to end", { timeout: 480000 }, () => {
  let receiver = 0;
  let source = 0;
  let baseline: any;

  before(async () => {
    client = await connect();
    await ok("map_file", { action: "new", seed: SEED, width: 1280, height: 720 });
    baseline = json(await ok("map_summary"));
    const bigStates = baseline.states.filter((s: any) => s.cells >= 60);
    const pairs = bigStates.flatMap((a: any) => a.neighbours.map((n: number) => bigStates.find((s: any) => s.id === n)).filter(Boolean).map((b: any) => [a, b]));
    const best = pairs.sort((p: any, q: any) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0];
    assert.ok(best, "the generated map needs neighbouring states");
    receiver = best[0].id;
    source = best[1].id;
  });
  after(async () => {
    await client.close();
    rmSync(work, { recursive: true, force: true });
  });

  it("exposes instructions and the expected tools", async () => {
    const guide = client.getInstructions() ?? "";
    for (const word of ["map_summary", "map_list with name", "ring", "mergeStates", "map_layers", "scope all"]) assert.ok(guide.includes(word), `instructions must mention: ${word}`);
    const tools = (await client.listTools()).tools;
    const names = tools.map(t => t.name);
    for (const n of ["map_view", "map_summary", "map_locate", "map_list", "map_select", "map_commands", "map_apply", "map_undo", "map_camera", "map_layers", "map_file", "map_status", "map_export", "map_3d", "map_menu", "map_ui", "map_options", "map_legend", "map_eval"]) assert.ok(names.includes(n), `missing ${n}`);
    assert.equal(names.length, 19, "18 tools plus the opt-in map_eval");
    const formatSchema = tools.find(t => t.name === "map_export")?.inputSchema?.properties?.format as { enum?: unknown[] } | undefined;
    assert.equal(formatSchema?.enum?.length, 24, "all Azgaar picture, map, JSON, GeoJSON and CSV formats are exposed");
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
    assert.equal(info.legend.length, baseline.states.length);
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

  it("TASK-06: all diplomacy/military commands and map_undo restore exact data", { timeout: 300000 }, async () => {
    await diplomacyMilitaryScenario({
      apply: async (command, params) => json(await ok("map_apply", { command, params })).result,
      list: async (kind, state) => json(await ok("map_list", { kind, ...(state === undefined ? {} : { state }), limit: 1000 })),
      commands: async () => json(await ok("map_commands")).commands.map((c: any) => c.name),
      probe: async () => {
        const data = json(await ok("map_eval", { code: `return ${militaryProbe}` })).result;
        await ok("map_undo", { action: "undo" }); // read-only probe must not leave a history entry
        return data;
      },
      snapshot: async () => "", // MCP owns its snapshots; undo must go through the real tool.
      undo: async () => { await ok("map_undo", { action: "undo" }); },
      reject: async (command, params) => {
        const before = json(await ok("map_undo", { action: "list" })).undoable.length;
        const result = await call("map_apply", { command, params });
        assert.ok(result.isError, `${command}: invalid input must be rejected`);
        assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, before);
      },
      passed: () => {}
    });
    const regiment = json(await ok("map_list", { kind: "military", limit: 1 })).rows[0];
    const local = json(await ok("map_list", { kind: "military", near: { x: regiment.x, y: regiment.y }, within: 0.01, limit: 1000 }));
    assert.ok(local.rows.some((row: any) => row.id === regiment.id), "military spatial filtering keeps the referenced position");
    assert.ok(local.rows.every((row: any) => Math.hypot(row.x - regiment.x, row.y - regiment.y) <= 0.011));
    // Remove scenario setup edits so the existing history-count assertions stay independent.
    await ok("map_undo", { action: "undo" });
    await ok("map_undo", { action: "undo" });
  });

  it("previews a selection, applies it, and the figures add up", async () => {
    const before = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    const sel = json(await ok("map_select", { shape: "border", args: { from: source, to: receiver, depth: 3 } }));
    assert.ok(sel.count > 20);
    const withPreview = (await ok("map_view")).content.find(p => p.type === "image")?.data;
    assert.notEqual(withPreview, before, "red preview must be visible in the screenshot");
    const res = json(await ok("map_apply", { command: "assignState", params: { selection: sel.id, state: receiver } }));
    assert.equal(res.result.changed, sel.count);
    const after = json(await ok("map_summary"));
    assert.equal(cells(after, receiver) - cells(baseline, receiver), sel.count);
    assert.equal(cells(baseline, source) - cells(after, source), sel.count);
    assert.ok(existsSync(join(mapsDir, "autosave.map")), "autosave written");
  });

  it("undo and redo restore exact figures", async () => {
    const res = json(await ok("map_undo", { action: "undo" }));
    assert.ok(res.rescueSnapshot?.includes("rescue-before-undo.map"), "rescue snapshot reported in undo response");
    assert.ok(existsSync(join(mapsDir, "rescue-before-undo.map")), "rescue snapshot written to mapsDir");
    const undone = json(await ok("map_summary"));
    assert.equal(cells(undone, receiver), cells(baseline, receiver));
    assert.equal(cells(undone, source), cells(baseline, source));
    await ok("map_undo", { action: "redo" });
    const redone = json(await ok("map_summary"));
    assert.ok(cells(redone, receiver) > cells(baseline, receiver));
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
    const r = json(await ok("map_apply", { command: "assignState", params: { selection: water.id, state: receiver } }));
    assert.equal(r.result.changed, 0);
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, before);
  });

  it("saves, loads and rejects unsafe names", async () => {
    const snap = json(await ok("map_summary"));
    await ok("map_file", { action: "save", name: "checkpoint one" });
    assert.ok(existsSync(join(mapsDir, "checkpoint one.map")));
    await ok("map_apply", { command: "rename", params: { kind: "state", id: receiver, name: "Zorgland", full_name: "Empire of Zorgland" } });
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

  it("map_eval works (including async code) and takes an undo snapshot first", async () => {
    const r = json(await ok("map_eval", { code: "await Promise.resolve(); return FMG_AGENT.summary().counts.states" }));
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
    assert.equal(json(await ok("map_summary")).counts.states, 16);
  });

  it("founds a state through MCP, then undo removes it", async () => {
    const base = json(await ok("map_summary"));
    const owner = base.states[0];
    const p = json(await ok("map_locate", { x: owner.pole[0], y: owner.pole[1] }));
    assert.equal(p.state.id, owner.id);
    const made = json(await ok("map_apply", { command: "createState", params: { x: owner.pole[0] + 3, y: owner.pole[1] + 3, name: "Mcpland" } }));
    assert.ok(made.result.details.state > 16);
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

  it("finds things by place: near a city, inside a rectangle, one side of a point", async () => {
    const burgs = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows;
    const ref = burgs[Math.floor(burgs.length / 2)];
    const near = json(await ok("map_list", { kind: "burgs", near: { burg: ref.id }, within: 400, limit: 1000 }));
    assert.ok(near.total > 0 && near.total < burgs.length, "a radius keeps some cities, not all");
    assert.ok(near.rows.every((r: any) => r.id !== ref.id && typeof r.distance === "number" && typeof r.side === "string"), "self excluded, distance and side given");
    assert.ok(near.rows.every((r: any, i: number, a: any[]) => i === 0 || a[i - 1].distance <= r.distance), "nearest first");
    assert.ok(near.rows.every((r: any) => r.distance <= 400), "within is a hard limit (the distance is in the map unit, km by default)");
    const inRect = json(await ok("map_list", { kind: "burgs", rect: { x0: ref.x - 70, y0: ref.y - 70, x1: ref.x + 70, y1: ref.y + 70 }, limit: 1000 }));
    assert.ok(inRect.rows.some((r: any) => r.id === ref.id) && inRect.rows.every((r: any) => Math.abs(r.x - ref.x) <= 70 && Math.abs(r.y - ref.y) <= 70));
    const north = json(await ok("map_list", { kind: "burgs", near: { x: ref.x, y: ref.y }, within: 800, direction: "N", limit: 1000 }));
    assert.ok(north.rows.every((r: any) => r.side === "N" && r.y < ref.y), "north means higher up the map");
    assert.ok(json(await ok("map_list", { kind: "states", near: { x: ref.x, y: ref.y } })).rows.length > 0, "states can be ordered by distance too");
    const noNear = await call("map_list", { kind: "burgs", within: 10 });
    assert.equal(noNear.isError, true, "within without near is refused");
    assert.ok(JSON.stringify(noNear.content).includes("needs `near`"));
    const twoRefs = await call("map_list", { kind: "burgs", near: { burg: 1, river: 1 }, within: 10 });
    assert.equal(twoRefs.isError, true, "two references are refused");
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

  it("exports an image at the requested size, with configurable format", async () => {
    const layersBefore = json(await ok("map_layers")).active;
    const camBefore = json(await ok("map_camera", { scale: 2 })).scale;
    const res = await ok("map_export", { width: 1920, only_layers: ["states", "borders"], name: "e2e export" });
    const info = json(res);
    assert.equal(info.widthPx, 1920);
    const png = readFileSync(info.saved);
    assert.equal(png.readUInt32BE(16), 1920, "PNG header width");
    assert.deepEqual(json(await ok("map_layers")).active, layersBefore, "layers put back");
    assert.equal(json(await ok("map_camera", { scale: 2 })).scale, camBefore, "camera usable after export");
    const jpg = await ok("map_export", { format: "jpeg", resolution: 1, name: "e2e export jpg" });
    assert.match(String(json(jpg).saved), /\.jpg$/);
    assert.ok((await call("map_export", { width: 1920, height: 100 })).isError, "conflicting width/height refused");
    assert.ok((await call("map_export", { width: 1920, resolution: 2 })).isError, "width + resolution refused");
    const small = await ok("map_export", { max_image_bytes: 10000, name: "e2e export small" });
    assert.ok(small.content.some(p => p.type === "image"), "a preview is still returned when the export is too heavy");
    const jpegView = await ok("map_view", { format: "jpeg" });
    assert.ok(jpegView.content.some(p => p.type === "image" && p.mimeType === "image/jpeg"));
    const filtered = json(await ok("map_export", {
      format: "png", resolution: 1, supersample: 2, filter: "lanczos3", max_image_bytes: 5000000,
      name: "e2e filtered map"
    }));
    const filteredPng = readFileSync(filtered.saved);
    assert.equal(filteredPng.subarray(1, 4).toString(), "PNG");
    assert.equal(filteredPng.readUInt32BE(16), 1280, "filtered export keeps requested IHDR width");
    assert.equal(filteredPng.readUInt32BE(20), 720, "filtered export keeps requested IHDR height");
    assert.equal(filtered.supersample, 2);
    assert.equal(filtered.filter, "lanczos3");
    const filteredView = await ok("map_view", { supersample: 2, filter: "stepdown", max_image_bytes: 5000000 });
    const preview = Buffer.from(filteredView.content.find(p => p.type === "image")?.data ?? "", "base64");
    assert.equal(preview.subarray(1, 4).toString(), "PNG");
    assert.equal(preview.readUInt32BE(16), 1280, "filtered preview keeps the viewport width");
    assert.ok((await call("map_export", { format: "svg", supersample: 2 })).isError, "non-bitmaps do not accept filters");
    assert.ok((await call("map_export", { format: "png", width: 9600, supersample: 2 })).isError, "oversize supersampled source refused");
    await ok("map_camera", { scale: 1 });
  });

  it("exports at resolution 5 (D-018) and with the clean option (D-021)", async () => {
    const hi = json(await ok("map_export", { resolution: 5, format: "jpeg", name: "e2e export x5" }));
    assert.equal(hi.widthPx, 6400, "1280 x 5");
    assert.equal(readFileSync(hi.saved).readUInt16BE(0), 0xffd8, "a JPEG file was written");
    const layers = json(await ok("map_layers")).active;
    const clean = json(await ok("map_export", { clean: true, only_layers: ["burgIcons", "routes"], resolution: 1, name: "e2e export clean" }));
    assert.equal(clean.clean, true);
    const svg = json(await ok("map_export", { format: "svg", clean: true, only_layers: ["burgIcons", "routes"], name: "e2e clean svg" }));
    const svgText = readFileSync(svg.saved, "utf8");
    const anchors = svgText.match(/<g[^>]*data-group=["']anchors["'][^>]*>/g) ?? [];
    assert.ok(anchors.length > 0, "SVG retains an anchor group to test the clean mask");
    assert.ok(anchors.every((tag: string) => /display\s*:\s*none/.test(tag)), "clean SVG hides ports even when Azgaar redraws its groups");
    assert.deepEqual(json(await ok("map_layers")).active, layers, "layers put back after a clean export");
    const left = json(await ok("map_eval", { code: "return document.querySelector('#burgIcons [data-group=anchors]').style.display" }));
    assert.notEqual(left.result, "none", "clean mode was undone after the export");
    const plain = json(await ok("map_export", { resolution: 1, name: "e2e export plain" }));
    assert.equal(plain.clean, false, "clean is off unless asked (config export.clean)");
    assert.ok((await call("map_export", { resolution: 9 })).isError, "above export.maxPixels is refused");
  });

  it("takes 3D pictures: relief, globe, two hemispheres (D-019, D-020)", async () => {
    const relief = await ok("map_3d", { mode: "relief", preset: "biomes", clean: true, texture_resolution: 1024, name: "e2e 3d relief" });
    const r = json(relief);
    assert.equal(r.saved.length, 1);
    assert.ok(relief.content.some(p => p.type === "image"), "an inline picture comes back");
    assert.equal(readFileSync(r.saved[0].file).subarray(1, 4).toString(), "PNG");
    assert.equal(r.preset, "biomes");
    const globe = json(await ok("map_3d", { mode: "globe", hemispheres: "both", texture_resolution: 1024, output: "webp", name: "e2e 3d globe" }));
    assert.deepEqual(globe.saved.map((x: any) => x.view), ["west", "east"]);
    assert.ok(globe.saved.every((x: any) => /\.webp$/.test(x.file) && x.bytes > 100));
    const diptRes = await ok("map_3d", { mode: "globe", hemispheres: "diptych", texture_resolution: 1024, name: "e2e 3d diptych" });
    const dipt = json(diptRes);
    assert.equal(dipt.saved.length, 1);
    assert.equal(dipt.saved[0].view, "diptych");
    assert.ok(dipt.saved[0].widthPx > dipt.saved[0].heightPx, "diptych is a wide composite plate");
    assert.ok(dipt.saved[0].bytes > 10000, "diptych image has content");
    assert.ok(existsSync(dipt.saved[0].file), "diptych file was written");
    assert.ok(diptRes.content.some((p: any) => p.type === "image" && p.data?.length > 1000), "inline image returned for diptych");
    const sat = await call("map_3d", { mode: "relief", preset: "satellite", texture_resolution: 1024, name: "e2e 3d sat" });
    assert.ok(!sat.isError, String(sat.content[0]?.text));
    const planet = json(await ok("map_3d", {
      mode: "globe", preset: "satellite", erosion: true, atmosphere: true, clouds: true,
      sun_position: { azimuth: 135, altitude: 35 }, diptych: true,
      texture_resolution: 1024, name: "e2e pbr satellite globe"
    }));
    assert.equal(planet.saved[0].view, "diptych");
    assert.ok(planet.saved[0].bytes > 10000, "the PBR diptych contains rendered pixels");
    assert.equal(planet.settings.satellite, true);
    assert.equal(planet.settings.erosion, true);
    assert.equal(planet.settings.clouds, true);
    assert.deepEqual(planet.globe.render, {
      texture: "satellite", material: "MeshStandardMaterial", bump: true, roughness: true,
      atmosphere: true, clouds: true
    });
    assert.ok(Number.isInteger(planet.globe.centerCell) && planet.globe.centerCell >= 0, "only the globe surface is picked");
    assert.ok((await call("map_3d", { mode: "relief", hemispheres: "both" })).isError, "hemispheres only for the globe");
    const status = json(await ok("map_status"));
    assert.deepEqual(status.blockedOutsideRequests, [], "3D stays offline");
    assert.equal(json(await ok("map_eval", { code: "return FMG_AGENT.is3dOpen()" })).result, false, "the flat map is back");
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

  it("legends, built-in layer presets, river names and loading a map by absolute path work through MCP", async () => {
    // read the boxes from a saved copy of the map (map_eval would add its own undo step and hide what we test)
    const boxes = async (): Promise<string[]> => {
      await ok("map_file", { action: "save", name: "legend-probe" });
      const saved = readFileSync(join(mapsDir, "legend-probe.map"), "utf8");
      return [...saved.matchAll(/data-legend="([^"]+)"/g)].map(m => m[1] as string);
    };
    assert.ok((await client.listTools()).tools.some(t => t.name === "map_legend"), "map_legend is listed");
    const shown = await ok("map_legend", { action: "show", layer: "biomes", corner: "bottom-right" });
    assert.equal(shown.content.find(p => p.type === "text")?.text?.includes("Biomes"), true);
    assert.deepEqual(await boxes(), ["Biomes"]);
    await ok("map_legend", { action: "show", layer: "custom", title: "Mine", items: "#aa3355=Dry lands;#3355aa=Wet lands", corner: "top-left" });
    assert.deepEqual((await boxes()).sort(), ["Biomes", "Mine"]);
    const bad = await call("map_legend", { action: "show", layer: "custom", items: "oops" });
    assert.equal(bad.isError, true, "a malformed custom legend is an error");
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await boxes(), ["Biomes"], "undo removes the last legend only");
    await ok("map_legend", { action: "hide_all" });
    assert.deepEqual(await boxes(), []);

    const built = json(await ok("map_layers", { preset: "political" }));
    assert.ok(built.active.includes("states") && built.active.includes("provinces") && !built.active.includes("heightmap"), "built-in political preset");
    assert.ok(json(await ok("map_layers")).presets.includes("topography"));

    const river = json(await ok("map_list", { kind: "rivers", limit: 1 })).rows[0];
    const renamed = json(await ok("map_apply", { command: "rename", params: { kind: "river", id: river.id, name: "Fleuve Test" } }));
    assert.equal(renamed.result.details.to, "Fleuve Test");
    assert.ok(JSON.stringify(json(await ok("map_list", { kind: "rivers", name: "Fleuve Test" }))).includes("Fleuve Test"));

    // load a .map that lives outside maps/ (D-004)
    await ok("map_file", { action: "save", name: "path-source" });
    const outside = join(work, "elsewhere");
    mkdirSync(outside, { recursive: true });
    const target = join(outside, "from-vault.map");
    copyFileSync(join(mapsDir, "path-source.map"), target);
    const loaded = json(await ok("map_file", { action: "load", path: target }));
    assert.equal(loaded.loaded, target);
    assert.equal((await call("map_file", { action: "load", path: "relative/x.map" })).isError, true, "a relative path is refused");
    assert.equal((await call("map_file", { action: "save", name: "x", path: target })).isError, true, "path only works with load");
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

  it("the browser does not open when the server starts, only at the first map tool", async () => {
    await client.close();
    client = await connect();
    const idle = json(await ok("map_status"));
    assert.equal(idle.browserOpen, false, "map_status must not open the window");
    assert.equal((await ok("map_file", { action: "list" })).isError ?? false, false, "listing saved maps needs no window");
    assert.equal(json(await ok("map_status")).browserOpen, false);
    assert.equal((await client.listResources()).resources.length, 4);
    assert.equal((await client.listPrompts()).prompts.length, 3);
    await client.getPrompt({ name: "inspect-map", arguments: {} });
    assert.equal(json(await ok("map_status")).browserOpen, false, "resource/prompt discovery must stay lazy");
    await client.readResource({ uri: "fmg://map/summary" });
    assert.equal(json(await ok("map_status")).browserOpen, true, "reading a live resource opens the browser");
  });

  it("map_list error message enumerates all 15 supported kinds including diplomacy, military, zones, notes and styles", async () => {
    const bad = await call("map_list", { kind: "nonexistent_kind" });
    assert.equal(bad.isError, true);
    const msg = bad.content[0]?.text ?? "";
    for (const expectedKind of ["states", "provinces", "cultures", "religions", "burgs", "markers", "routes", "labels", "markerTypes", "rivers", "diplomacy", "military", "zones", "notes", "styles"]) {
      assert.ok(msg.includes(expectedKind), `error message must include kind "${expectedKind}": ${msg}`);
    }
  });

  it("pilots zones, notes and lore with typed, undoable, XSS-safe commands (S-026b)", async () => {
    // ---- zones: create over a cells list, edit, reshape, delete, regenerate
    const zonesBefore = json(await ok("map_list", { kind: "zones", limit: 50 })).total;
    const loreBefore = json(await ok("map_summary", {})).lore;
    const stateId = receiver;
    const cells = json(await ok("map_eval", { code: `return [...pack.cells.i.filter(c => pack.cells.h[c] >= 20 && pack.cells.state[c] === ${stateId})].slice(0, 6);` })).result as number[]; // spread: pack.cells.i is a Uint32Array
    assert.ok(cells.length >= 3, "state has land cells for a zone");
    const created = json(await ok("map_apply", { command: "addZone", params: { name: "E2E Quarantine", type: "Plague", cells, color: "#112233" } })).result;
    assert.equal(created.ok, true);
    const zoneId = created.details.zone as number;
    assert.ok(Number.isInteger(zoneId), "a zone id is returned");
    const zoneRows = json(await ok("map_list", { kind: "zones", limit: 500 })).rows;
    assert.ok(zoneRows.some((r: any) => r.id === zoneId && r.type === "Plague" && r.cells === cells.length), "the zone shows in kind=zones");
    const edited = json(await ok("map_apply", { command: "updateZone", params: { zone: zoneId, name: "E2E Sector", color: "url(#hatch5)", hidden: true } })).result;
    assert.equal(edited.details.changed.length, 3, "name, color and visibility changed");
    const badFill = await call("map_apply", { command: "updateZone", params: { zone: zoneId, color: "url(#hatch99)" } });
    assert.equal(badFill.isError, true, "a fill outside the 42 hatches is refused");
    const both = await call("map_apply", { command: "setZoneCells", params: { zone: zoneId, cells: [1], selection: "sel-9" } });
    assert.equal(both.isError, true, "cells and selection together are refused");
    const coverage = json(await ok("map_select", { shape: "cells", args: { cells: cells.slice(0, 2) } }));
    const reshaped = json(await ok("map_apply", { command: "setZoneCells", params: { zone: zoneId, selection: coverage.id } })).result;
    assert.equal(reshaped.details.cells, 2);
    await ok("map_undo", { action: "undo" });
    assert.equal(json(await ok("map_list", { kind: "zones", limit: 500 })).rows.find((row: any) => row.id === zoneId).cells, cells.length);
    await ok("map_apply", { command: "removeZone", params: { zone: zoneId } });
    assert.ok(!json(await ok("map_list", { kind: "zones", limit: 500 })).rows.some((row: any) => row.id === zoneId));
    await ok("map_undo", { action: "undo" });
    assert.ok(json(await ok("map_list", { kind: "zones", limit: 500 })).rows.some((row: any) => row.id === zoneId));
    const regen = json(await ok("map_apply", { command: "regenerateZones", params: {} })).result;
    assert.ok(regen.warnings.length >= 1 && regen.details.zones >= 1, "regeneration rebuilds the event zones");

    // ---- notes: XSS payloads are stripped, never stored raw
    const payload = `<script>alert(1)</script><p>E2E <b>note</b></p><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">l</a>`;
    const noted = json(await ok("map_apply", { command: "setNote", params: { id: `state:${stateId}`, html: payload } })).result;
    assert.equal(noted.ok, true);
    assert.equal(noted.details.sanitized, true, "sanitization is reported");
    assert.ok(noted.warnings.length >= 1, "a warning accompanies sanitization");
    const noteRow = json(await ok("map_list", { kind: "notes", limit: 500 })).rows.find((r: any) => r.id === `state:${stateId}`);
    assert.ok(noteRow, "the note is listed");
    for (const poison of ["<script", "onerror", "javascript:"]) assert.ok(!noteRow.note.includes(poison), `no ${poison} may survive`);
    assert.ok(noteRow.note.includes("<b>note</b>"), "safe markup survives");
    const appended = json(await ok("map_apply", { command: "appendNote", params: { entity_type: "state", entity_id: stateId, html: "<p>tail</p>" } })).result;
    assert.equal(appended.details.characters, noted.details.characters + "<p>tail</p>".length, "append grows the note");
    const regiment = json(await ok("map_list", { kind: "military", limit: 1 })).rows[0];
    const regNote = json(await ok("map_apply", { command: "setNote", params: { entity_type: "regiment", entity_id: regiment.state, entity_sub: regiment.regimentId, html: "<p>roll</p>" } })).result;
    assert.equal(regNote.details.key, `regiment:${regiment.state}-${regiment.regimentId}`, "regiments are addressed by their composite key");
    const regRm = json(await ok("map_apply", { command: "removeNote", params: { id: regNote.details.key } })).result;
    assert.equal(regRm.details.had, true);
    const missing = await call("map_apply", { command: "setNote", params: { id: "burg:99999", html: "<p>x</p>" } });
    assert.equal(missing.isError, true, "a note on a missing entity is refused");

    // ---- lore: calendar and texts reach map_summary
    const lore = json(await ok("map_apply", { command: "setMapLore", params: { name: "E2E World", year: 737, era: "Storm Era" } })).result;
    assert.equal(lore.details.eraShort, "SE", "the short form is derived from the era");
    const summary = json(await ok("map_summary", {}));
    assert.equal(summary.lore.year, 737, "summary.lore reflects setMapLore");
    assert.equal(typeof summary.counts.zonesCount, "number");
    assert.equal(typeof summary.counts.notesCount, "number");
    assert.equal(typeof summary.counts.regimentsCount, "number");

    // every one of the 8 successful applies (addZone, updateZone, regenerateZones, setNote, appendNote, setNote regiment, removeNote regiment, setMapLore) is undoable
    for (let i = 0; i < 8; i++) await ok("map_undo", { action: "undo" });
    assert.equal(json(await ok("map_list", { kind: "zones", limit: 50 })).total, zonesBefore, "zone count is back (regeneration and additions undone)");
    assert.equal(json(await ok("map_list", { kind: "notes", limit: 50 })).rows.some((r: any) => String(r.note).includes("<b>note</b>")), false, "notes undone");
    assert.equal(json(await ok("map_summary", {})).lore.year, loreBefore.year, "the calendar is back");
  });

  it("pilots styles, burg architecture and route/river topology with undoable commands (S-026c)", async () => {
    const depth0 = json(await ok("map_undo", { action: "list" })).undoable.length;
    const styleRows = async () => json(await ok("map_list", { kind: "styles", limit: 500 })).rows;
    const oceanFill = async () => (await styleRows()).find((r: any) => r.name === "ocean").config.groups.base.attrs.fill;

    // ---- styles: kind=styles lists the preset and the configuration; applyStylePreset and setStyle undo cleanly
    const styles0 = json(await ok("map_list", { kind: "styles", limit: 500 }));
    assert.equal(styles0.preset, "default");
    assert.equal(styles0.systemPresets.length, 15, "the 15 built-in themes");
    assert.ok(styles0.rows.some((r: any) => r.name === "ocean" && r.config?.groups), "each style element carries its configuration");
    const fill0 = await oceanFill();
    const preset = json(await ok("map_apply", { command: "applyStylePreset", params: { preset: "ink" } })).result;
    assert.equal(preset.ok, true);
    assert.equal(preset.details.preset, "ink");
    assert.equal(json(await ok("map_list", { kind: "styles" })).preset, "ink", "the list follows the applied preset");
    assert.notEqual(await oceanFill(), fill0, "the style values changed with the theme");
    const unknown = await call("map_apply", { command: "applyStylePreset", params: { preset: "no-such-theme" } });
    assert.equal(unknown.isError, true, "an unknown preset is refused");
    assert.ok((unknown.content[0]?.text ?? "").includes("Available"), "the refusal lists the available presets");
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth0 + 1, "the refused preset left no undo entry");
    await ok("map_undo", { action: "undo" });
    assert.equal(json(await ok("map_list", { kind: "styles" })).preset, "default", "undo restores the preset");
    assert.equal(await oceanFill(), fill0, "undo restores the style values");

    const sv = json(await ok("map_apply", { command: "setStyle", params: { path: "ocean.groups.base.attrs.fill", value: "#224466" } })).result; // const-ok: e2e colour
    assert.equal(sv.ok, true);
    assert.equal(await oceanFill(), "#224466"); // const-ok: e2e colour
    const svMissing = await call("map_apply", { command: "setStyle", params: { path: "relief.options.density" } });
    assert.equal(svMissing.isError, true, "setStyle without a value is refused");
    assert.ok((svMissing.content[0]?.text ?? "").includes("null unsets"), "the refusal explains the null form");
    await ok("map_undo", { action: "undo" });
    assert.equal(await oceanFill(), fill0, "undo restores a single value");

    // ---- updateBurg: architecture and demography, listed in real inhabitants
    const burgRow = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows.find((b: any) => !b.capital && b.state > 0 && !b.walls);
    assert.equal(typeof burgRow.citadel, "boolean", "map_list burgs lists the architecture");
    assert.equal(typeof burgRow.port, "boolean");
    const ub = json(await ok("map_apply", { command: "updateBurg", params: { burg: burgRow.id, population: 8000, walls: true } })).result;
    assert.equal(ub.changed, 2);
    const listed = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows.find((b: any) => b.id === burgRow.id);
    assert.ok(Math.abs(listed.population - 8000) <= 5, `population in inhabitants, got ${listed.population}`);
    assert.equal(listed.walls, true);
    assert.equal(typeof listed.populationRaw, "number", "the stored value stays available");
    await ok("map_undo", { action: "undo" });
    const back = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows.find((b: any) => b.id === burgRow.id);
    assert.equal(back.walls, false, "undo restores the city");

    // ---- mergeStates accepts the asProvinces spelling the plans use
    const sums = json(await ok("map_summary"));
    const big = sums.states.filter((s: any) => s.cells >= 60);
    const pairs = big.flatMap((a: any) => a.neighbours.map((n: number) => big.find((s: any) => s.id === n)).filter(Boolean).map((b: any) => [a, b]));
    const [into, away] = pairs.sort((p: any, q: any) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0] ?? [];
    assert.ok(into && away, "two neighbouring states to merge");
    const merged = json(await ok("map_apply", { command: "mergeStates", params: { states: [away.id], into: into.id, asProvinces: true } })).result;
    assert.equal(merged.details.keptAsProvinces, true);
    assert.ok(!json(await ok("map_summary")).states.some((s: any) => s.id === away.id), "the merged state is gone");
    await ok("map_undo", { action: "undo" });
    assert.ok(json(await ok("map_summary")).states.some((s: any) => s.id === away.id), "undo brings the state back");
    const both = await call("map_apply", { command: "mergeStates", params: { states: [away.id], into: into.id, asProvinces: true, as_provinces: true } });
    assert.equal(both.isError, true, "both spellings together are refused");

    // ---- routes: create, edit, split and join back
    const pts = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows.slice(0, 5).map((b: any) => [b.x, b.y]);
    const added = json(await ok("map_apply", { command: "addRoute", params: { path: pts, group: "trails", name: "E2E Trail" } })).result;
    const routeId = added.details.route;
    const routes0 = json(await ok("map_list", { kind: "routes", limit: 500 })).total;
    const edited = json(await ok("map_apply", { command: "updateRoute", params: { route: routeId, name: "E2E Renamed", locked: true } })).result;
    assert.equal(edited.details.name, "E2E Renamed");
    assert.equal(edited.details.locked, true);
    assert.ok(json(await ok("map_list", { kind: "routes", name: "E2E Renamed" })).total === 1, "the renamed route is findable by name");
    await ok("map_undo", { action: "undo" });
    const split = json(await ok("map_apply", { command: "splitRoute", params: { route: routeId, point: 2 } })).result;
    assert.equal(json(await ok("map_list", { kind: "routes", limit: 500 })).total, routes0 + 1, "the split adds a route");
    assert.equal(json(await ok("map_list", { kind: "routes", name: "E2E Trail" })).total, 2, "the tail keeps the name");
    const joined = json(await ok("map_apply", { command: "joinRoutes", params: { route: routeId, other: split.details.newRoute } })).result;
    assert.equal(joined.details.removed, split.details.newRoute, "the tail route is the one removed");
    assert.equal(json(await ok("map_list", { kind: "routes", limit: 500 })).total, routes0, "the join removes the other route");
    const splitEdge = await call("map_apply", { command: "splitRoute", params: { route: routeId, point: 0 } });
    assert.equal(splitEdge.isError, true, "a route is never split at its endpoint");
    const selfJoin = await call("map_apply", { command: "joinRoutes", params: { route: routeId, other: routeId } });
    assert.equal(selfJoin.isError, true, "a route cannot join itself");
    await ok("map_undo", { action: "undo" }); // joinRoutes
    await ok("map_undo", { action: "undo" }); // splitRoute
    await ok("map_undo", { action: "undo" }); // addRoute
    assert.equal(json(await ok("map_list", { kind: "routes", limit: 500 })).total, routes0 - 1, "the trail is gone again");

    // ---- rivers: edit name, type and width; a cyclic parent is refused and rolled back
    const river = json(await ok("map_list", { kind: "rivers", limit: 500 })).rows[0];
    const changed = json(await ok("map_apply", { command: "updateRiver", params: { river: river.id, name: "E2E Flow", type: "Creek", sourceWidth: 2, widthFactor: 1.1 } })).result;
    assert.deepEqual(changed.details.changed, ["name", "type", "sourceWidth", "widthFactor"]);
    const riverNow = json(await ok("map_list", { kind: "rivers", name: "E2E Flow" })).rows[0];
    assert.equal(riverNow.type, "Creek");
    await ok("map_undo", { action: "undo" });
    assert.ok(json(await ok("map_list", { kind: "rivers", name: "E2E Flow" })).total === 0, "undo restores the river name");
    const tributary = json(await ok("map_list", { kind: "rivers", limit: 500 })).rows.find((r: any) => r.parent && r.parent !== r.id);
    if (tributary) {
      const cycle = await call("map_apply", { command: "updateRiver", params: { river: tributary.parent, name: "Bad Compound", parent: tributary.id } });
      assert.equal(cycle.isError, true, "a parent that flows into the river is refused");
      const msg = cycle.content[0]?.text ?? "";
      assert.ok(msg.includes("mainstem") && msg.includes("was restored"), `the compound edit is rolled back: ${msg}`);
      assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth0, "no undo entry for the refused edit");
    }
    const mainstem = json(await ok("map_apply", { command: "updateRiver", params: { river: river.id, parent: river.id } })).result;
    assert.equal(mainstem.details.parent, river.id, "its own id makes the river a mainstem");
    await ok("map_undo", { action: "undo" });

    // every successful apply was undone one by one
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth0, "the history is back to its depth before the task");
  });

  it("TASK-09: atlas is non-destructive; submap backup, undo and failed-resample rollback", async () => {
    const inset = { x0: 400, y0: 180, x1: 720, y1: 420, title: "MCP region", corner: "top-left", cover: 0.4 };
    await ok("map_camera", { x: 600, y: 350, scale: 2 });
    const before = json(await ok("map_summary"));
    const layers = json(await ok("map_layers")).active;
    const view = await ok("map_view", { inset, max_image_bytes: 5000000 });
    const png = Buffer.from(view.content.find(p => p.type === "image")?.data ?? "", "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 720);
    const atlas = json(view).inset;
    assert.equal(atlas.regionRatio, 4 / 3);
    assert.ok(Math.abs(atlas.cartouche.width / atlas.cartouche.height - 4 / 3) < 1e-10);
    assert.deepEqual(json(await ok("map_summary")).camera, before.camera);
    const exported = json(await ok("map_export", { format: "png", width: 1920, inset, only_layers: ["states", "borders"], name: "regional-atlas" }));
    assert.equal(readFileSync(exported.saved).readUInt32BE(16), 1920);
    assert.deepEqual(json(await ok("map_layers")).active, layers);
    assert.deepEqual(json(await ok("map_summary")).camera, before.camera);
    const small = await ok("map_export", { inset, max_image_bytes: 10000, name: "regional-preview" });
    assert.ok(small.content.some(p => p.type === "image" && p.mimeType === "image/jpeg"));
    await ok("map_export", { inset, format: "jpeg", name: "regional-jpeg" });
    for (const bad of [{ format: "svg", inset }, { inset, supersample: 2 }, { inset: { ...inset, x1: 9999 } }])
      assert.ok((await call("map_export", bad)).isError);
    for (const bad of [{ inset, region: { x0: 1, y0: 1, x1: 10, y1: 10 } }, { inset, text_map: true }, { inset, grid: true }, { inset, filter: "fast" }])
      assert.ok((await call("map_view", bad)).isError);
    assert.deepEqual(json(await ok("map_summary")).camera, before.camera);

    const parent = json(await ok("map_summary"));
    const stateData = (s: any) => s.states.map((v: any) => [v.id, v.name, v.cells, v.capital]);
    const args = { x0: 320, y0: 180, x1: 960, y1: 540 };
    const depth = json(await ok("map_undo", { action: "list" })).undoable.length;
    for (const confirm of [undefined, false]) {
      const refused = await call("map_apply", { command: "createSubmap", params: { ...args, ...(confirm === undefined ? {} : { confirmDestructiveResample: confirm }) } });
      assert.ok(refused.isError);
      assert.match(refused.content[0]?.text ?? "", /confirmDestructiveResample/);
    }
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth);
    assert.equal(existsSync(join(mapsDir, "pre-submap.map")), false);
    const made = json(await ok("map_apply", { command: "createSubmap", params: { ...args, confirmDestructiveResample: true } }));
    assert.equal(made.result.details.scale, 2);
    assert.equal(made.backup, join(mapsDir, "pre-submap.map"));
    assert.ok(readFileSync(made.backup, "utf8").length > 10000);
    assert.notDeepEqual(stateData(json(await ok("map_summary"))), stateData(parent));
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(stateData(json(await ok("map_summary"))), stateData(parent));
    await ok("map_undo", { action: "redo" });
    assert.notDeepEqual(stateData(json(await ok("map_summary"))), stateData(parent));
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(stateData(json(await ok("map_summary"))), stateData(parent));
    await ok("map_eval", { code: "window.__task09Generate = Grid.generate; Grid.generate = () => { throw new Error('TASK-09 resample crash'); }; return true" });
    const failDepth = json(await ok("map_undo", { action: "list" })).undoable.length;
    try {
      const failed = await call("map_apply", { command: "createSubmap", params: { ...args, confirmDestructiveResample: true } });
      assert.ok(failed.isError);
      assert.match(failed.content[0]?.text ?? "", /TASK-09 resample crash.*restored/);
      assert.deepEqual(stateData(json(await ok("map_summary"))), stateData(parent));
      assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, failDepth);
    } finally {
      await ok("map_eval", { code: "Grid.generate = window.__task09Generate; delete window.__task09Generate; return true" });
    }
    await ok("map_camera", { scale: 1 });
  });

  it("TASK-10: native topography, seven-layer preset, partial updates, Undo and rollback", async () => {
    const style = async () => json(await ok("map_list", { kind: "styles", name: "heightmap" })).rows.find((v: any) => v.name === "heightmap").config;
    const before = await style();
    const layers0 = json(await ok("map_layers")).active;
    const preset = json(await ok("map_layers", { preset: "topographic" }));
    const expected = ["heightmap", "rivers", "relief", "routes", "burgIcons", "labels", "scaleBar"];
    assert.deepEqual(preset.active.filter((id: string) => preset.available.includes(id)).sort(), expected.sort());
    const svg = async () => {
      const saved = json(await ok("map_export", { format: "svg", name: "topo-probe" }));
      return readFileSync(saved.file, "utf8");
    };
    await ok("map_apply", { command: "setTopography", params: { scheme: "natural", contours: true, contourInterval: 8, hachures: true, isolineFills: true } });
    const rendered = await svg();
    assert.match(rendered, /class="heightmap-contours"/);
    assert.match(rendered, /class="heightmap-hachures"/);
    assert.match(rendered, /data-height="/);
    const now = await style();
    assert.equal(now.groups.landHeights.options.contours.interval, 8);
    assert.deepEqual(now.groups.oceanHeights, before.groups.oceanHeights);
    await ok("map_apply", { command: "setTopography", params: { isolineFills: false, terracing: 4 } });
    const lines = await style();
    assert.equal(lines.groups.landHeights.options.contours.mode, "only");
    assert.equal(lines.groups.landHeights.options.hachures.mode, "only");
    assert.equal(lines.groups.landHeights.options.scheme, "natural");
    const depth = json(await ok("map_undo", { action: "list" })).undoable.length;
    for (const params of [{}, { contourInterval: 1 }, { scheme: "earth" }, { contours: false, hachures: false, isolineFills: false }, { scheme: "natural", contourInterval: 21 }]) {
      assert.ok((await call("map_apply", { command: "setTopography", params })).isError);
      assert.deepEqual(await style(), lines);
      assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth);
    }
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await style(), now);
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await style(), before);
    await ok("map_apply", { command: "setTopography", params: { target: "ocean", scheme: "light", contours: true, contourInterval: 4 } });
    const ocean = await style();
    assert.equal(ocean.groups.oceanHeights.options.render, true);
    assert.equal(ocean.groups.oceanHeights.options.contours.interval, 4);
    assert.deepEqual(ocean.groups.landHeights, before.groups.landHeights);
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await style(), before);
    // A renderer error AFTER the style writes must restore the parent snapshot, not just drop history.
    await ok("map_eval", { code: "window.__task10Draw = Layers.draw; Layers.draw = function () { Layers.draw = window.__task10Draw; delete window.__task10Draw; throw new Error('TASK-10 draw crash'); }; return true" });
    const failDepth = json(await ok("map_undo", { action: "list" })).undoable.length;
    const failed = await call("map_apply", { command: "setTopography", params: { scheme: "olive", contours: true } });
    assert.ok(failed.isError);
    assert.match(failed.content[0]?.text ?? "", /TASK-10 draw crash.*restored/);
    assert.deepEqual(await style(), before);
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, failDepth);
    await ok("map_undo", { action: "undo" }); // discard the injection snapshot (saved before injection)
    await ok("map_layers", { only: layers0 });
  });

  it("TASK-11: annotated tools, live queued resources and safe workflow prompts", async () => {
    const tools = (await client.listTools()).tools;
    const readOnly = ["map_view", "map_status", "map_summary", "map_locate", "map_list", "map_commands"];
    for (const tool of tools) {
      const a = tool.annotations;
      assert.ok(a, `annotations missing: ${tool.name}`);
      for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const)
        assert.equal(typeof a[key], "boolean", `${tool.name}.${key}`);
      assert.equal(a.openWorldHint, false);
      assert.equal(a.readOnlyHint, readOnly.includes(tool.name));
    }
    const resources = (await client.listResources()).resources;
    assert.deepEqual(resources.map(r => r.uri).sort(), ["summary", "lore", "notes", "chronicle"].map(n => `fmg://map/${n}`).sort());
    assert.ok(resources.every(r => r.mimeType === "application/json"));
    const read = async (name: string) => {
      const r = await client.readResource({ uri: `fmg://map/${name}` });
      assert.equal(r.contents.length, 1);
      assert.equal(r.contents[0].mimeType, "application/json");
      assert.equal(r.contents[0].uri, `fmg://map/${name}`);
      return JSON.parse((r.contents[0] as { text: string }).text);
    };
    const depth = json(await ok("map_undo", { action: "list" })).undoable.length;
    const summary = json(await ok("map_summary"));
    const [resSummary, lore, notes, chronicle] = await Promise.all(["summary", "lore", "notes", "chronicle"].map(read));
    assert.deepEqual(resSummary, summary);
    assert.deepEqual(lore, summary.lore);
    assert.deepEqual(notes, json(await ok("map_list", { kind: "notes", limit: 1000 })).rows);
    assert.deepEqual(chronicle, json(await ok("map_list", { kind: "diplomacy" })).chronicle);
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth, "resource reads never create undo entries");
    await ok("map_apply", { command: "setMapLore", params: { name: "MCP resource world", year: 832 } });
    assert.equal((await read("lore")).year, 832);
    assert.equal((await read("summary")).lore.name, "MCP resource world");
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await read("lore"), lore);
    const stateId = summary.states[0].id;
    await ok("map_apply", { command: "setNote", params: { id: `state:${stateId}`, html: "<p>MCP live note</p>" } });
    assert.ok((await read("notes")).some((n: any) => n.note === "<p>MCP live note</p>"));
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await read("notes"), notes);
    await ok("map_apply", { command: "addChronicleEvent", params: { title: "Resource event", text: "One\nTwo" } });
    assert.deepEqual((await read("chronicle")).at(-1), ["Resource event", "One", "Two"]);
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await read("chronicle"), chronicle);
    await ok("map_eval", { code: "for (const {id} of FMG_AGENT.list('notes', undefined, Number.MAX_SAFE_INTEGER).rows) await FMG_AGENT.apply('removeNote', {id}); return true" });
    assert.deepEqual(await read("notes"), [], "empty notes return [], not null or a truncated wrapper");
    await ok("map_undo", { action: "undo" });
    assert.deepEqual(await read("notes"), notes);
    const failDepth = json(await ok("map_undo", { action: "list" })).undoable.length;
    const failure = await call("map_eval", { code: "await FMG_AGENT.apply('setMapLore', {name:'must roll back', year:999}); throw new Error('TASK-11 lore crash');" });
    assert.ok(failure.isError);
    assert.match(failure.content[0]?.text ?? "", /TASK-11 lore crash/);
    assert.deepEqual(await read("lore"), lore, "resource reads observe rollback, never stale cached data");
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, failDepth);
    await assert.rejects(() => client.readResource({ uri: "fmg://map/missing" }));
    const prompts = (await client.listPrompts()).prompts;
    assert.equal(prompts.length, 3);
    for (const prompt of prompts) {
      const r = await client.getPrompt({ name: prompt.name, arguments: { request: "Inspect the northern coast" } });
      assert.equal(r.messages[0].role, "user");
      const content = r.messages[0].content as { type: string; text: string };
      assert.equal(content.type, "text");
      assert.ok(content.text.includes("map_view") && content.text.includes("fmg://map/summary"));
      assert.ok(content.text.includes("Inspect the northern coast"));
      assert.ok((await client.getPrompt({ name: prompt.name, arguments: {} })).messages.length > 0);
    }
    const atlas = await client.getPrompt({ name: "regional-atlas", arguments: {} });
    assert.match((atlas.messages[0].content as { text: string }).text, /confirmDestructiveResample:true/);
  });

  it("setCapital works cleanly when a state has no prior capital", async () => {
    const burgs = json(await ok("map_list", { kind: "burgs", limit: 1000 })).rows;
    const nonCapBurg = burgs.find((b: any) => !b.capital && b.state > 0);
    assert.ok(nonCapBurg, "must find a non-capital burg belonging to a state");
    await ok("map_eval", { code: `pack.states[${nonCapBurg.state}].capital = 0; return true` });
    const res = json(await ok("map_apply", { command: "setCapital", params: { burg: nonCapBurg.id } }));
    assert.equal(res.result.ok, true);
    assert.equal(res.result.details.newCapital, nonCapBurg.id);
    assert.equal(res.result.details.oldCapital, null);
    await ok("map_undo", { action: "undo" });
  });

  it("terrain lowering protects cells under cities from submersion below sea level", async () => {
    const burg = json(await ok("map_list", { kind: "burgs", limit: 1 })).rows[0];
    const cellLoc = json(await ok("map_locate", { cell: burg.cell }));
    const gx = cellLoc.x;
    const gy = cellLoc.y;
    const res = json(await ok("map_apply", {
      command: "shapeCone",
      params: { x: gx, y: gy, radius: 30, peak: 5, scope: "all" }
    }));
    assert.equal(res.result.ok, true);
    assert.ok(res.result.warnings.some((w: string) => w.includes("could not be lowered below sea level")), "warning confirms protection");
    const afterLoc = json(await ok("map_locate", { cell: burg.cell }));
    assert.ok(afterLoc.height >= 20, `city height must remain >= 20, got ${afterLoc.height}`);
    await ok("map_undo", { action: "undo" });
  });

  it("exhaustively tests boundary conditions and bad parameters on all tools", async () => {
    assert.ok((await call("map_locate", { cell: -1 })).isError);
    assert.ok((await call("map_locate", { cell: 9999999 })).isError);
    assert.ok((await call("map_locate", { px: 100 })).isError);
    assert.ok((await call("map_locate", { x: -99999, y: -99999 })).isError);

    assert.ok((await call("map_select", { shape: "unknown_shape", args: {} })).isError);
    assert.ok((await call("map_select", { shape: "border", args: { from: 1, to: 1, depth: 2 } })).isError);
    assert.ok((await call("map_select", { shape: "cells", args: { cells: [-5, 999999] } })).isError);
    assert.ok((await call("map_select", { shape: "circle", args: { x: 100, y: 100, radius: -10 } })).isError);

    assert.ok((await call("map_camera", { scale: -1 })).isError);
    assert.ok((await call("map_camera", { scale: 100 })).isError);
    assert.ok((await call("map_camera", { duration_ms: -50 })).isError);

    assert.ok((await call("map_view", { region: { x0: 500, y0: 500, x1: 200, y1: 200 } })).isError);
    assert.ok((await call("map_view", { format: "invalid_format" })).isError);

    assert.ok((await call("map_layers", { show: ["nonexistent_layer_xyz"] })).isError);
    assert.ok((await call("map_layers", { preset: "nonexistent_preset_xyz" })).isError);

    assert.ok((await call("map_legend", { action: "invalid_action" })).isError);
    assert.ok((await call("map_legend", { action: "show", layer: "custom", items: "badly-formatted-item" })).isError);

    assert.ok((await call("map_export", { width: -50 })).isError);
    assert.ok((await call("map_export", { format: "unsupported_fmt" })).isError);
    assert.ok((await call("map_export", { resolution: 10 })).isError);

    assert.ok((await call("map_3d", { mode: "unknown_mode" })).isError);
    const globe = json(await ok("map_3d", { mode: "globe", preset: "satellite", erosion: true, clouds: true, texture_resolution: 1024 }));
    assert.ok(globe.saved[0].bytes > 10000 && Number.isInteger(globe.globe.centerCell));
    assert.ok((await call("map_3d", { mode: "relief", hemispheres: "both" })).isError);

    assert.ok((await call("map_file", { action: "save", name: "../escaped" })).isError);
    assert.ok((await call("map_file", { action: "load", name: "" })).isError);
    assert.ok((await call("map_file", { action: "unknown_action" })).isError);

    assert.ok((await call("map_undo", { action: "unknown_undo_action" })).isError);
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
    const cleanExp = json(await ok("map_export", { format: "png", clean: true, name: "t-clean" }));
    assert.equal(cleanExp.clean, true);
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
    const undoBefore = json(await ok("map_undo", { action: "list" })).undoable.length;
    const opened = json(await ok("map_menu", { action: "run", id: "editStatesButton" }));
    assert.ok(opened.dialogs.length > 0, "an editor dialog opened");
    assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, undoBefore, "opening an editor must not waste an undo step");
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

  it("rolls back an action-menu failure even after it partially changed the map", async () => {
    const before = json(await ok("map_summary")).states.find((s: any) => s.id === 1).name;
    await ok("map_eval", { code: "window.__originalMenuRun = FMG_AGENT.menuRun; FMG_AGENT.menuRun = async () => { pack.states[1].name = 'Partially modified'; throw new Error('simulated menu crash'); }; return true" });
    const depth = json(await ok("map_undo", { action: "list" })).undoable.length;
    try {
      const failed = await call("map_menu", { action: "run", id: "regenerateBurgs" });
      assert.ok(failed.isError && /simulated menu crash/.test(failed.content[0]?.text ?? ""));
      assert.equal(json(await ok("map_summary")).states.find((s: any) => s.id === 1).name, before);
      assert.equal(json(await ok("map_undo", { action: "list" })).undoable.length, depth);
    } finally {
      await ok("map_eval", { code: "FMG_AGENT.menuRun = window.__originalMenuRun; delete window.__originalMenuRun; return true" });
    }
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

  it("has exactly 18 tools by default, without dynamic JavaScript execution", async () => {
    await client.close();
    client = await connect(false);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 18);
    assert.ok(!tools.some(tool => tool.name === "map_eval"));
  });
});


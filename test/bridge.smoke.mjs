// End-to-end check of the in-page bridge (FMG_AGENT) on a fixed seed. No real user map is ever touched.
import { diplomacyMilitaryScenario, militaryProbe } from "./diplomacy-military.scenario.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../server/config.ts";
import { MapSession } from "../server/browser.ts";
import { startStaticServer } from "../server/static.ts";

const cfg = loadConfig();
const work = join(dirname(fileURLToPath(import.meta.url)), "..", ".test-tmp");
cfg.browser.headless = true;
cfg.profileDir = join(work, `profile-${process.pid}`);
cfg.map.seed = "trois";
cfg.browser.viewport = { width: 1280, height: 720 }; cfg.map.width = 1280; cfg.map.height = 720; // tests do not depend on the user-facing default size

if (process.env.FMG_TEST_CHROMIUM) { cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM; cfg.browser.channel = null; }
cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
const web = await startStaticServer(cfg.azgaarDist, cfg.server.host, 0);
const session = new MapSession(cfg, web.url);
const page = await session.ensure();
const errors = session.pageErrors;
const server = { close: () => web.close() };
const browser = { close: () => session.close() };

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) failures++; };

await page.waitForTimeout(500);
const A = (fn, arg) => page.evaluate(fn, arg);

// ---- TASK-06: browser smoke, including the snapshot/import primitive used by map_undo
await diplomacyMilitaryScenario({
  apply: (command, params) => A(([c, p]) => FMG_AGENT.apply(c, p), [command, params]),
  list: (kind, state) => A(([k, s]) => FMG_AGENT.list(k, s, 10000), [kind, state]),
  commands: () => A(() => FMG_AGENT.describe().commands.map(c => c.name)),
  // page.evaluate takes the probe source as an expression, so this test bundle needs no dynamic evaluation.
  probe: () => page.evaluate(militaryProbe),
  snapshot: () => A(() => FMG_AGENT.exportMap()),
  undo: async snapshot => { await A(t => FMG_AGENT.importMap(t), snapshot); },
  reject: async (command, params) => {
    const snap = await A(() => FMG_AGENT.exportMap());
    const refused = await A(async ([c, p]) => { try { await FMG_AGENT.apply(c, p); return false; } catch { return true; } }, [command, params]);
    check(`${command}: invalid input rejected`, refused);
    await A(t => FMG_AGENT.importMap(t), snap);
  },
  passed: label => check(`TASK-06 ${label}`, true)
});

// ---- queries
const sum = await A(() => FMG_AGENT.summary());
check("summary lists states", sum.states.length > 5, `states=${sum.states.length}`);
const bigStates = sum.states.filter(s => s.cells >= 60);
const neighbourPairs = bigStates.flatMap(a => a.neighbours.map(n => bigStates.find(s => s.id === n)).filter(Boolean).map(b => [a, b]));
// Two big neighbouring states, whatever the generator calls them: the largest smaller side wins.
const [receiver, source] = neighbourPairs.sort((p, q) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0] ?? [];
check("found two big neighbouring states", Boolean(receiver && source), `${receiver?.id} ${source?.id}`);
const sumCellsLand = sum.landCells;
const stateCellSum = () => A(() => { const s = FMG_AGENT.summary(); return s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells; });
check("state cells + unclaimed = land cells (before)", (await stateCellSum()) === sumCellsLand);

// pixel -> cell round trip at several zoom levels (camera centred on the probe cell, so it is always on screen)
for (const scale of [1, 3, 6, 12]) {
  const r = await A(async ([k, cell]) => {
    const [x, y] = pack.cells.p[cell];
    await FMG_AGENT.setCamera({ x, y, scale: k, duration: 0 });
    const [px, py] = FMG_AGENT.mapToScreen(x, y);
    const back = FMG_AGENT.locate({ px, py });
    const off = FMG_AGENT.locate({ px: px + 3, py: py + 3 }); // a few pixels away must still be this cell or a direct neighbour
    return { want: cell, got: back.cell, px, py, offOk: off.cell === cell || pack.cells.c[cell].includes(off.cell) };
  }, [scale, receiver.capital.cell]);
  const inView = r.px >= 0 && r.py >= 0 && r.px <= 1280 && r.py <= 720;
  check(`pixel->cell round trip at zoom ${scale}`, inView && r.got === r.want && r.offOk, `want ${r.want} got ${r.got} px=(${Math.round(r.px)},${Math.round(r.py)}) inView=${inView}`);
}
await A(() => FMG_AGENT.setCamera({ scale: 1, duration: 0 }));

// ---- selection + assignState (extend recipient state into donor state by 3 layers)
const sel = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 3 }, {}), [source.id, receiver.id]);
check("border selection non-empty", sel.count > 20, `count=${sel.count}`);
const overlayThere = await A(() => Boolean(document.getElementById("fmgAgentOverlay")?.querySelector("path")));
check("selection preview drawn", overlayThere);
const inSavedSvg = await A(() => Boolean(document.getElementById("map").querySelector("#fmgAgentOverlay")));
check("overlay is outside #map (never saved in .map)", !inSavedSvg);

const res = await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [sel.id, receiver.id]);
check("assignState ok", res.ok && res.changed > 0, JSON.stringify({ changed: res.changed, skipped: res.skipped }));
const after = await A(() => FMG_AGENT.summary());
const receiverAfter = after.states.find(s => s.id === receiver.id).cells; const sourceAfter = after.states.find(s => s.id === source.id).cells;
check("recipient state gained exactly what donor state lost", receiverAfter - receiver.cells === source.cells - sourceAfter && receiverAfter - receiver.cells === res.changed, `recipient state ${receiver.cells}->${receiverAfter}, donor state ${source.cells}->${sourceAfter}, moved ${res.changed}`);
check("state cells + unclaimed = land cells (after)", (await stateCellSum()) === sumCellsLand);
check("counters not stale (summary == array count)", await A(([id]) => pack.cells.i.filter(c => pack.cells.state[c] === id).length === pack.states[id].cells, [receiver.id]));
check("overlay preview cleared after apply", await A(() => !document.getElementById("fmgAgentOverlay").querySelector("path")));
check("neighbours include each other", await A(([a, b]) => pack.states[a].neighbors.includes(b), [receiver.id, source.id]));

// capital cells are protected
const cap = await A(([id]) => pack.states[id].center, [source.id]);
const selCap = await A(([c]) => FMG_AGENT.select("cells", { cells: [c] }, {}), [cap]);
const resCap = await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [selCap.id, receiver.id]);
check("capital cell is never taken", resCap.changed === 0 && resCap.skipped.capital_cell === 1, JSON.stringify(resCap.skipped));

// ---- burgs
const free = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !pack.cells.burg[i] && pack.cells.state[i]); return { c, p: pack.cells.p[c] }; });
const nb = await A(([p]) => FMG_AGENT.apply("addBurg", { x: p[0], y: p[1], name: "Testburg" }), [free.p]);
check("addBurg ok", nb.ok && nb.details.name === "Testburg", JSON.stringify(nb.details));
const burgId = nb.details.burg;
const free2 = await A(([c]) => { const n = pack.cells.i.find(i => i !== c && pack.cells.h[i] >= 20 && !pack.cells.burg[i] && pack.cells.state[i] === pack.cells.state[c]); return { c: n, p: pack.cells.p[n] }; }, [free.c]);
const mv = await A(([id, p]) => FMG_AGENT.apply("moveBurg", { burg: id, x: p[0], y: p[1] }), [burgId, free2.p]);
check("moveBurg ok", mv.ok && mv.details.to.cell === free2.c, JSON.stringify(mv.details));
check("old cell freed, new cell holds burg", await A(([id, a, b]) => pack.cells.burg[a] === 0 && pack.cells.burg[b] === id, [burgId, free.c, free2.c]));
const water = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] < 20); return pack.cells.p[c]; });
const bad = await A(async ([p]) => { try { await FMG_AGENT.apply("addBurg", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [water]);
check("burg in water is refused with a clear message", bad.includes("water"), bad);
const rm = await A(([id]) => FMG_AGENT.apply("removeBurg", { burg: id }), [burgId]);
check("removeBurg ok", rm.ok && (await A(([id]) => pack.burgs[id].removed === true, [burgId])));
const capBurg = await A(([id]) => pack.states[id].capital, [receiver.id]);
const rmCap = await A(async ([id]) => { try { await FMG_AGENT.apply("removeBurg", { burg: id }); return "no error"; } catch (e) { return e.message; } }, [capBurg]);
check("capital removal is refused", rmCap.includes("capital"), rmCap);

// ---- rename / validation
const rn = await A(([id]) => FMG_AGENT.apply("rename", { kind: "state", id, name: "Zorgland", full_name: "Empire of Zorgland" }), [receiver.id]);
check("rename state", rn.ok && rn.details.to === "Empire of Zorgland");
const unk = await A(async () => { try { await FMG_AGENT.apply("assignState", { selection: "sel-1", stat: 3 }); return "no error"; } catch (e) { return e.message; } });
check("unknown parameter is rejected with the allowed list", unk.includes("unknown parameter") && unk.includes("Allowed"), unk);
const badCommand = await A(async () => { try { await FMG_AGENT.apply("teleportState", {}); return "no error"; } catch (e) { return e.message; } });
check("unknown command is rejected with the command list", badCommand.includes("Unknown command") && badCommand.includes("assignState"), badCommand.slice(0, 60));
const badShape = await A(async () => { try { FMG_AGENT.select("hexagon", {}, {}); return "no error"; } catch (e) { return e.message; } });
check("unknown selection shape is rejected with the shape list", badShape.includes("unknown shape") && badShape.includes("circle"), badShape.slice(0, 60));

// ---- annotations (graticule, ids) and screenshot sanity
const ann = await A(() => FMG_AGENT.annotate({ grid: true, stateIds: true }));
check("graticule drawn", ann.gridStep > 0, `step=${ann.gridStep}`);
await page.screenshot({ path: "/tmp/bridge-annotated.png" });
await A(() => FMG_AGENT.clearAnnotations());
check("annotations cleared", await A(() => document.getElementById("fmgAgentOverlay-aux").childElementCount === 0));

// ---- checkpoint / restore (undo): politics must come back exactly
const hashPolitics = () => A(() => { const h = a => { let x = 0; for (const v of a) x = (x * 31 + v) | 0; return x; }; return [h(pack.cells.state), h(pack.cells.province), h(pack.cells.burg), pack.burgs.filter(b => b.i && !b.removed).length, pack.states.map(s => s.fullName ?? s.name).join("|")].join(","); });
const t0 = Date.now();
const snap = await A(() => FMG_AGENT.exportMap());
const hBefore = await hashPolitics();
const sel2 = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 4 }, {}), [receiver.id, source.id]);
await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [sel2.id, source.id]);
check("second change really changed politics", (await hashPolitics()) !== hBefore);
await A(t => FMG_AGENT.importMap(t), snap);
const hRestored = await hashPolitics();
check("restore returns politics exactly (states, provinces, burgs, names)", hRestored === hBefore, `${Date.now() - t0} ms for export+change+restore`);
check("bridge survives a map reload", await A(() => FMG_AGENT.isReady() && typeof FMG_AGENT.summary().cells === "number"));

// ---- selections survive an undo-style reload (kept by position), but not a plain load
const selKeep = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 3 }, {}), [receiver.id, source.id]);
await A(([t]) => FMG_AGENT.importMap(t, true), [snap]);
const selAfter = await A(([id]) => { try { return FMG_AGENT.describeSelection(id); } catch { return null; } }, [selKeep.id]);
check("selection kept after a reload that keeps selections", selAfter !== null && selAfter.count === selKeep.count, `${selAfter?.count} of ${selKeep.count} cells`);
await A(([t]) => FMG_AGENT.importMap(t), [snap]);
check("selection dropped by a plain reload", await A(([id]) => { try { FMG_AGENT.describeSelection(id); return false; } catch { return true; } }, [selKeep.id]));

// ---- map_layers `only`: exactly these layers
const layersBefore = await A(() => FMG_AGENT.layers().active);
const onlyState = await A(() => FMG_AGENT.setLayers({ only: ["states", "borders"] }));
check("layers only: exactly the listed layers are on", onlyState.active.length === 2 && onlyState.active.includes("states") && onlyState.active.includes("borders"), onlyState.active.join(","));
await A(([ids]) => FMG_AGENT.setLayers({ only: ids }), [layersBefore]); // leave the view as it was for the next tests
await page.screenshot({ path: "/tmp/bridge-final.png" });


// ---- layers
{
  const l = await A(() => FMG_AGENT.layers());
  check("layers: heightmap and relief are available", l.available.includes("heightmap") && l.available.includes("relief"), `${l.available.length} layers`);
  const on = await A(() => FMG_AGENT.setLayers({ show: ["relief"] }));
  check("layers: show relief", on.active.includes("relief"));
  const off = await A(() => FMG_AGENT.setLayers({ hide: ["relief"] }));
  check("layers: hide relief", !off.active.includes("relief"));
  const badLayer = await A(async () => { try { await FMG_AGENT.setLayers({ show: ["nope"] }); return "no error"; } catch (e) { return e.message; } });
  check("layers: unknown layer refused with the valid list", badLayer.includes("Unknown layer") && badLayer.includes("heightmap"), badLayer.slice(0, 80));
}

// ---- terrain
const politicsAndRivers = () => A(() => { const h = a => { let x = 0; for (const v of a) x = (x * 31 + v) | 0; return x; }; const c = pack.cells; return [h(c.state), h(c.province), h(c.burg), h(c.r), h(c.biome), c.i.length, pack.states.filter(x => x.i && !x.removed).map(x => x.cells).join(",")].join("|"); });
const terrainBase = await A(() => FMG_AGENT.exportMap());
const restoreBase = () => A(t => FMG_AGENT.importMap(t), terrainBase);
await restoreBase();
{
  // in place: a mountain that does not move the coast
  const centre = await A(() => { const c = FMG_AGENT.locate({ x: 840, y: 330 }); return { cell: c.cell, h: c.height, land: c.land }; });
  const selBefore = await A(() => FMG_AGENT.select("circle", { x: 840, y: 330, radius: 20 }, {}));
  const before = await politicsAndRivers();
  const t0 = Date.now();
  const r = await A(() => FMG_AGENT.apply("shapeCone", { x: 840, y: 330, radius: 60, peak: 95 }));
  const ms = Date.now() - t0;
  check("terrain: coast-neutral mountain runs in place", r.ok && r.details.mode === "in place" && r.changed > 20, `${ms} ms, ${r.changed} grid cells`);
  check("terrain in place: states, provinces, cities, rivers, biomes, cell ids all untouched", before === (await politicsAndRivers()));
  const raised = await A(([cell]) => pack.cells.h[cell], [centre.cell]);
  check("terrain in place: centre is now a high peak", centre.land && raised > centre.h && raised >= 85, `${centre.h} -> ${raised}`);
  check("terrain in place: earlier selections stay valid", await A(([id]) => FMG_AGENT.describeSelection(id).count > 0, [selBefore.id]));
  check("terrain in place: hidden-layer reminder given", r.warnings.some(w => w.includes("not visible") && w.includes("heightmap")));
  const lower = await A(([id]) => FMG_AGENT.apply("adjustHeight", { selection: id, delta: -10 }), [selBefore.id]);
  check("terrain: adjustHeight lowers in place", lower.details.mode === "in place" && (await A(([cell]) => pack.cells.h[cell], [centre.cell])) < raised);
  const smooth = await A(([id]) => FMG_AGENT.apply("smoothHeight", { selection: id, passes: 3 }), [selBefore.id]);
  check("terrain: smoothHeight runs", smooth.ok);
  const ridge = await A(() => FMG_AGENT.apply("shapeRidge", { path: [[780, 300], [900, 340]], width: 25, peak: 80 }));
  check("terrain: shapeRidge runs in place", ridge.ok && ridge.details.mode === "in place");
  await restoreBase();
}
{
  // scope filtering: water cells with the default scope are left alone, and the AI is told why
  const water = await A(() => { const out = []; for (const [x, y] of [[640, 20], [30, 380], [640, 700], [1250, 380]]) { const c = FMG_AGENT.locate({ x, y }); if (!c.land) out.push(c.cell); } return out; });
  const sel = await A(([cells]) => FMG_AGENT.select("cells", { cells }, { land_only: false }), [water]);
  const r = await A(([id]) => FMG_AGENT.apply("setHeight", { selection: id, height: 30 }), [sel.id]);
  check("terrain scope: water->land refused by default with an explanation", r.changed === 0 && r.details.filteredByScope > 0 && r.warnings.some(w => w.includes('scope "land"')), JSON.stringify(r.details));
}
{
  // rebuild: create land at sea, cities and states must survive
  const base = await A(() => FMG_AGENT.summary());
  const sel = await A(() => FMG_AGENT.select("circle", { x: 400, y: 300, radius: 30 }, {}));
  const t0 = Date.now();
  const r = await A(() => FMG_AGENT.apply("shapeCone", { x: 640, y: 690, radius: 40, peak: 45, scope: "all" }));
  const ms = Date.now() - t0;
  check("terrain rebuild: island creation runs through the rebuild", r.ok && r.details.mode === "rebuild" && r.details.landGridCells.after > r.details.landGridCells.before, `${ms} ms, land ${r.details.landGridCells.before}->${r.details.landGridCells.after}`);
  check("terrain rebuild: warnings advise map_apply annotate", r.warnings.some(w => w.includes("annotate")));
  check("terrain rebuild: relief icons regenerated and valid (D-023)", await A(() => pack.relief?.length > 0));
  const after = await A(() => FMG_AGENT.summary());
  check("terrain rebuild: same states and same number of cities", after.counts.states === base.counts.states && after.counts.burgs === base.counts.burgs, `${base.counts.burgs} -> ${after.counts.burgs}`);
  check("terrain rebuild: every capital is still on land", await A(() => pack.states.filter(x => x.i && !x.removed).every(x => pack.cells.h[x.center] >= 20 && pack.burgs[x.capital] && !pack.burgs[x.capital].removed)));
  check("terrain rebuild: cell ids renumbered, so earlier selections are dropped", await A(async ([id]) => { try { FMG_AGENT.describeSelection(id); return false; } catch { return true; } }, [sel.id]));
check("a map load (undo / load / rollback) also drops earlier selections: ids may differ", await A(async t => {
  const s = FMG_AGENT.select("cells", { cells: [100] }, {});
  await FMG_AGENT.importMap(t);
  try { FMG_AGENT.describeSelection(s.id); return false; } catch { return true; }
}, await A(() => FMG_AGENT.exportMap())));
  check("terrain rebuild: state cells + unclaimed = land cells", await A(() => { const s = FMG_AGENT.summary(); return s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells === s.landCells; }));
  check("terrain rebuild: new land starts unclaimed (nothing silently given to a state)", after.unclaimedLandCells >= base.unclaimedLandCells);
  await restoreBase();
}
{
  // a city is never submerged
  const b = await A(() => { const burg = pack.burgs.find(x => x.i && !x.removed && !x.capital && pack.cells.h[x.cell] >= 20 && pack.cells.t[x.cell] === 1); return { id: burg.i, cell: burg.cell }; });
  const sel = await A(([cell]) => FMG_AGENT.select("cells", { cells: [cell] }, {}), [b.cell]);
  const r = await A(([id]) => FMG_AGENT.apply("adjustHeight", { selection: id, delta: -100, scope: "all" }), [sel.id]);
  const still = await A(([id]) => { const burg = pack.burgs[id]; return { alive: !burg.removed, land: pack.cells.h[burg.cell] >= 20 }; }, [b.id]);
  check("terrain: lowering the ground under a city never submerges it", r.ok && still.alive && still.land, JSON.stringify(still) + " " + (r.warnings ?? []).filter(w => w.includes("city")).join(""));
  await restoreBase();
}
{
  // failure handling: a validation error is clean, a crash midway is flagged dirty
  const bad = await A(async () => { try { await FMG_AGENT.apply("setHeight", { selection: "sel-none", height: 30 }); return "no error"; } catch (e) { return e.message; } });
  check("terrain: unknown selection refused", bad.includes("Unknown selection"), bad.slice(0, 70));
  check("a validation failure is not flagged dirty", (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === false);
  const crashed = await A(async () => {
    const real = Pack.generate; Pack.generate = () => { throw new Error("simulated crash"); };
    try { const c = FMG_AGENT.locate({ x: 1230, y: 60 }); const sel = FMG_AGENT.select("cells", { cells: [c.cell] }, { land_only: false }); await FMG_AGENT.apply("setHeight", { selection: sel.id, height: 30, scope: "all" }); return "no error"; }
    catch (e) { return e.message; } finally { Pack.generate = real; }
  });
  check("a crash midway surfaces its message", crashed.includes("simulated crash"), crashed.slice(0, 60));
  check("a crash midway is flagged dirty (the server will restore the map)", (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === true);
  await restoreBase();
}


// ---- states, capital, markers, routes
await restoreBase();
{
  const landSum = () => A(() => { const s = FMG_AGENT.summary(); return s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells === s.landCells; });
  const base = await A(() => FMG_AGENT.summary());
  // a free land cell inside a province, not a capital, no city
  const spot = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !pack.cells.burg[i] && pack.cells.province[i] && pack.cells.state[i]); return { cell: c, p: pack.cells.p[c], oldState: pack.cells.state[c] }; });
  const cs = await A(([p]) => FMG_AGENT.apply("createState", { x: p[0], y: p[1], name: "Newlandia", color: "#336699" }), [spot.p]);
  check("createState: new state founded", cs.ok && cs.details.name.includes("Newlandia") && cs.details.leftState === spot.oldState, JSON.stringify(cs.details));
  const nid = cs.details.state;
  const st = await A(([id]) => { const s = pack.states[id]; const b = pack.burgs[s.capital]; return { cells: s.cells, color: s.color, capital: Boolean(b.capital), burgState: b.state, owner: pack.cells.state[s.center], diplo: s.diplomacy.length === pack.states.length, nbs: pack.states[0].diplomacy.length }; }, [nid]);
  check("createState: one cell, its capital city, right owner and colour", st.cells === 1 && st.capital && st.burgState === nid && st.owner === nid && st.color === "#336699", JSON.stringify(st));
  check("createState: diplomacy table covers every state", st.diplo);
  check("createState: figures coherent (cells + unclaimed = land)", await landSum());
  check("createState: state count +1", (await A(() => FMG_AGENT.summary())).counts.states === base.counts.states + 1);
  const grow = await A(([from, to]) => { const sel = FMG_AGENT.select("border", { from, to, depth: 2 }, {}); return FMG_AGENT.apply("assignState", { selection: sel.id, state: to }); }, [spot.oldState, nid]);
  check("createState: the new state can be grown with border + assignState", grow.ok && grow.changed > 1, `changed ${grow.changed}`);
  const bad = await A(async ([p]) => { try { await FMG_AGENT.apply("createState", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [await A(([id]) => pack.cells.p[pack.states[id].center], [nid])]);
  check("createState: an existing capital cannot be reused", bad.includes("capital"), bad.slice(0, 60));

  // setCapital
  const cand = await A(([id]) => { const b = pack.burgs.find(x => x.i && !x.removed && !x.capital && x.state === id); return b ? { id: b.i, state: id } : null; }, [spot.oldState]);
  if (cand) {
    const prev = await A(([id]) => pack.states[id].capital, [cand.state]);
    const sc = await A(([id]) => FMG_AGENT.apply("setCapital", { burg: id }), [cand.id]);
    const after = await A(([id, sid, old]) => ({ flag: Boolean(pack.burgs[id].capital), oldFlag: Boolean(pack.burgs[old].capital), cap: pack.states[sid].capital, centre: pack.states[sid].center === pack.burgs[id].cell }), [cand.id, cand.state, prev]);
    check("setCapital: roles swapped, state centre moved", sc.ok && after.flag && !after.oldFlag && after.cap === cand.id && after.centre, JSON.stringify(after));
  } else check("setCapital: (no candidate city in this state)", true);
  const capErr = await A(async ([id]) => { try { await FMG_AGENT.apply("setCapital", { burg: pack.states[id].capital }); return "no error"; } catch (e) { return e.message; } }, [spot.oldState]);
  check("setCapital: refuses a city that is already a capital", capErr.includes("already"), capErr);

  // removeState
  const ownCells = await A(([id]) => pack.cells.i.filter(c => pack.cells.state[c] === id).length, [nid]);
  const rs = await A(([id]) => FMG_AGENT.apply("removeState", { state: id }), [nid]);
  const gone = await A(([id]) => ({ removed: pack.states[id].removed === true, left: pack.cells.i.filter(c => pack.cells.state[c] === id).length, burgs: pack.burgs.filter(b => b.i && !b.removed && b.state === id).length, caps: pack.burgs.filter(b => b.capital && b.state === 0).length }), [nid]);
  check("removeState: land unclaimed, cities independent, no capital left behind", rs.ok && rs.changed === ownCells && gone.removed && gone.left === 0 && gone.burgs === 0 && gone.caps === 0, JSON.stringify(gone));
  check("removeState: figures coherent", await landSum());
  const noState = await A(async () => { try { await FMG_AGENT.apply("removeState", { state: 999 }); return "no error"; } catch (e) { return e.message; } });
  check("removeState: unknown state refused", noState.includes("does not exist"), noState);
  await restoreBase();

  // markers
  const pt = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !pack.cells.burg[i]); return pack.cells.p[c]; });
  const nMarkers = await A(() => pack.markers.length);
  const am = await A(([p]) => FMG_AGENT.apply("addMarker", { x: p[0], y: p[1], type: "custom", icon: "X", name: "Lost tower", note: "A tower." }), [pt]);
  check("addMarker: added, named, markers layer shown", am.ok && (await A(() => pack.markers.length)) === nMarkers + 1 && (await A(() => FMG_AGENT.layers().active.includes("markers"))), JSON.stringify(am.details));
  check("map_list markers includes it", await A(([id]) => FMG_AGENT.list("markers", undefined, 1000).rows.some(r => r.id === id && r.name === "Lost tower"), [am.details.marker]));
  const rm = await A(([id]) => FMG_AGENT.apply("removeMarker", { marker: id }), [am.details.marker]);
  check("removeMarker: removed", rm.ok && (await A(() => pack.markers.length)) === nMarkers);

  // map_list spatial filters: each expectation is recomputed here by brute force, not by the code under test
  const sp = await A(() => {
    const alive = pack.burgs.filter(b => b.i && !b.removed);
    const ref = alive[Math.floor(alive.length / 2)];
    const scale = options.map.units.distance.scale;
    const dist = b => Math.hypot(b.x - ref.x, b.y - ref.y) * scale;
    const radius = 60 * scale; // 60 map units, whatever the distance scale
    const expectNear = alive.filter(b => b.i !== ref.i && dist(b) <= radius).map(b => b.i).sort((a, b) => a - b);
    const gotNear = FMG_AGENT.list("burgs", undefined, 1000, undefined, { near: { burg: ref.i }, within: radius });
    const rect = { x0: ref.x - 80, y0: ref.y - 50, x1: ref.x + 80, y1: ref.y + 50 };
    const expectRect = alive.filter(b => b.x >= rect.x0 && b.x <= rect.x1 && b.y >= rect.y0 && b.y <= rect.y1).map(b => b.i).sort((a, b) => a - b);
    const gotRect = FMG_AGENT.list("burgs", undefined, 1000, undefined, { rect });
    const north = FMG_AGENT.list("burgs", undefined, 1000, undefined, { near: { burg: ref.i }, within: radius * 3, direction: "N" });
    const all = FMG_AGENT.list("burgs", undefined, 1000, undefined, { near: { x: ref.x, y: ref.y }, within: radius * 3 });
    // north = bearing within 22.5 degrees of straight up (y grows downward)
    const expectNorth = alive.filter(b => b.i !== ref.i && dist(b) <= radius * 3 && Math.abs(Math.atan2(b.x - ref.x, ref.y - b.y)) <= Math.PI / 8 + 1e-9).length;
    const river = pack.rivers.find(r => r.cells?.length > 5);
    const riverCells = river.cells.map(c => pack.cells.p[c]).filter(Boolean); // some rivers list an off-map cell (-1)
    const nearRiver = (b) => Math.min(...riverCells.map(p => Math.hypot(p[0] - b.x, p[1] - b.y))) * scale;
    const expectRiver = alive.filter(b => nearRiver(b) <= 25 * scale).map(b => b.i).sort((a, b) => a - b);
    const gotRiver = FMG_AGENT.list("burgs", undefined, 1000, undefined, { near: { river: river.i }, within: 25 * scale });
    const errors = [];
    for (const bad of [{ within: 5 }, { near: { x: 1 } }, { near: { x: 1, y: 1, burg: 2 } }, { direction: "UP", near: { burg: ref.i } }, { rect: { x0: 0, y0: 0, x1: 5 } }, { oops: 1 }, {}]) {
      try { FMG_AGENT.list("burgs", undefined, 5, undefined, bad); errors.push("no error"); } catch (e) { errors.push(e.message); }
    }
    try { FMG_AGENT.list("markerTypes", undefined, 5, undefined, { rect: { x0: 0, y0: 0, x1: 9, y1: 9 } }); errors.push("no error"); } catch (e) { errors.push(e.message); }
    const sorted = gotNear.rows.every((r, i, a) => i === 0 || a[i - 1].distance <= r.distance);
    return {
      refId: ref.i, expectNear, gotNear: gotNear.rows.map(r => r.id).sort((a, b) => a - b), sorted, hasUnit: typeof gotNear.distanceUnit === "string", hasSide: gotNear.rows.every(r => typeof r.side === "string"),
      expectRect, gotRect: gotRect.rows.map(r => r.id).sort((a, b) => a - b), noSortField: gotRect.rows.every(r => r.distance === undefined),
      northCount: north.rows.length, expectNorth, northAreAll: north.rows.every(r => r.side === "N"), northSubset: north.rows.length <= all.rows.length,
      expectRiver, gotRiver: gotRiver.rows.map(r => r.id).sort((a, b) => a - b), riverLen: expectRiver.length,
      errors
    };
  });
  check("map_list near burg + within: same set as a brute-force count (self excluded)", sp.expectNear.length > 0 && JSON.stringify(sp.expectNear) === JSON.stringify(sp.gotNear), `${sp.gotNear.length} found, ${sp.expectNear.length} expected`);
  check("map_list near: sorted nearest first, with unit, distance and side", sp.sorted && sp.hasUnit && sp.hasSide);
  check("map_list rect: same set as a brute-force count, no distance field", sp.expectRect.length > 0 && JSON.stringify(sp.expectRect) === JSON.stringify(sp.gotRect) && sp.noSortField, `${sp.gotRect.length} found, ${sp.expectRect.length} expected`);
  check("map_list direction N: only northern entries, same count as brute force", sp.northAreAll && sp.northSubset && sp.northCount === sp.expectNorth, `${sp.northCount} vs ${sp.expectNorth}`);
  check("map_list near river + within: any bank cell counts, same set as brute force", sp.riverLen > 0 && JSON.stringify(sp.expectRiver) === JSON.stringify(sp.gotRiver), `${sp.gotRiver.length} found, ${sp.expectRiver.length} expected`);
  check("map_list spatial: bad filters are refused with a clear message", sp.errors.slice(0, 7).every(m => m !== "no error" && m.startsWith("list:")) && sp.errors[7].includes("no place on the map"), JSON.stringify(sp.errors));

  // routes
  const land = await A(([probe]) => { const a = pack.cells.i.filter(i => pack.cells.h[i] >= 20 && pack.cells.state[i] === pack.cells.state[probe]); return [pack.cells.p[a[0]], pack.cells.p[a[10]], pack.cells.p[a[20]]]; }, [receiver.capital.cell]);
  const nRoutes = await A(() => pack.routes.length);
  const ar = await A(([pts]) => FMG_AGENT.apply("addRoute", { path: pts, group: "trails", name: "Old Trail" }), [land]);
  const links = await A(([id]) => Object.values(pack.cells.routes).some(o => Object.values(o).includes(id)), [ar.details.route]);
  check("addRoute: route stored with its cell links", ar.ok && (await A(() => pack.routes.length)) === nRoutes + 1 && links && ar.details.name === "Old Trail", JSON.stringify(ar.details));
  const waterPt = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] < 20); return pack.cells.p[c]; });
  const badRoute = await A(async ([a, w]) => { try { await FMG_AGENT.apply("addRoute", { path: [a, w] }); return "no error"; } catch (e) { return e.message; } }, [land[0], waterPt]);
  check("addRoute: a road through water is refused", badRoute.includes("water"), badRoute.slice(0, 70));
  const rr = await A(([id]) => FMG_AGENT.apply("removeRoute", { route: id }), [ar.details.route]);
  check("removeRoute: route and its cell links removed", rr.ok && (await A(() => pack.routes.length)) === nRoutes && !(await A(([id]) => Object.values(pack.cells.routes).some(o => Object.values(o).includes(id)), [ar.details.route])));
  await restoreBase();
}


// ---- states, markers, routes
const featureBase = await A(() => FMG_AGENT.exportMap());
const restoreFeatures = () => A(t => FMG_AGENT.importMap(t), featureBase);
await restoreFeatures();
{
  const base = await A(() => FMG_AGENT.summary());
  const spot = await A(() => { const owner = pack.states[1]; const c = pack.cells.i.find(i => pack.cells.state[i] === 1 && !pack.cells.burg[i] && pack.cells.h[i] >= 25 && i !== owner.center && pack.cells.c[i].every(n => pack.cells.state[n] === 1)); return { cell: c, p: pack.cells.p[c] }; });
  const r = await A(([p]) => FMG_AGENT.apply("createState", { x: p[0], y: p[1], name: "Newland", color: "#336699" }), [spot.p]);
  const id = r.details?.state;
  check("createState: a new state is founded", r.ok && id === base.counts.states + 1 && r.details.createdNewCity === true, JSON.stringify(r.details));
  const st = await A(([id, cell]) => { const s = pack.states[id]; const b = pack.burgs[s.capital]; return { cells: s.cells, center: s.center, capFlag: b.capital, burgState: b.state, cellState: pack.cells.state[cell], color: s.color, enemy: s.diplomacy[1], form: s.fullName }; }, [id, spot.cell]);
  check("createState: capital city, one cell, colour and name set", st.center === spot.cell && st.capFlag && st.burgState === id && st.cellState === id && st.cells === 1 && st.color === "#336699" && /Newland/.test(st.form), JSON.stringify(st));
  check("createState: the former owner becomes its enemy", st.enemy === "Enemy", st.enemy);
  const after = await A(() => FMG_AGENT.summary());
  check("createState: one more state, one more city, old owner lost exactly 1 cell", after.counts.states === base.counts.states + 1 && after.counts.burgs === base.counts.burgs + 1 && after.states.find(x => x.id === 1).cells === base.states.find(x => x.id === 1).cells - 1);
  // grow it
  const sel = await A(([x, y]) => FMG_AGENT.select("circle", { x, y, radius: 30 }, { only_state: 1 }), spot.p);
  const grow = await A(([sid, to]) => FMG_AGENT.apply("assignState", { selection: sid, state: to }), [sel.id, id]);
  check("createState: new state can be grown with assignState", grow.ok && grow.changed > 3, `changed ${grow.changed}`);
  // change capital of the old owner
  const cand = await A(() => pack.burgs.find(b => b.i && !b.removed && !b.capital && b.state === 1).i);
  const oldCap = await A(() => pack.states[1].capital);
  const sc = await A(([b]) => FMG_AGENT.apply("setCapital", { burg: b }), [cand]);
  check("setCapital: new capital registered, old one demoted", sc.ok && await A(([b, o]) => pack.states[1].capital === b && pack.burgs[b].capital === 1 && !pack.burgs[o].capital && pack.states[1].center === pack.burgs[b].cell, [cand, oldCap]));
  const dup = await A(async ([b]) => { try { await FMG_AGENT.apply("setCapital", { burg: b }); return "no error"; } catch (e) { return e.message; } }, [cand]);
  check("setCapital: already a capital is refused", dup.includes("already a capital"));
  // remove the new state
  const cellsBefore = (await A(() => FMG_AGENT.summary())).unclaimedLandCells;
  const rm = await A(([id]) => FMG_AGENT.apply("removeState", { state: id }), [id]);
  const fin = await A(() => FMG_AGENT.summary());
  check("removeState: land becomes unclaimed, state count back, cities remain independent", rm.ok && fin.counts.states === base.counts.states && fin.unclaimedLandCells === cellsBefore + rm.details.landCellsNowUnclaimed && await A(([cap]) => pack.burgs[cap].state === 0 && !pack.burgs[cap].capital && !pack.burgs[cap].removed, [r.details.capitalBurg]), JSON.stringify(rm.details));
  check("removeState: figures stay coherent", await A(() => { const s = FMG_AGENT.summary(); return s.states.reduce((n, x) => n + x.cells, 0) + s.unclaimedLandCells === s.landCells; }));
  check("a state can no longer be selected after removal", (await A(async ([gone]) => { try { await FMG_AGENT.apply("removeState", { state: gone }); return "no error"; } catch (e) { return e.message; } }, [id])).includes("does not exist"));
  await restoreFeatures();
}
{
  const types = await A(() => FMG_AGENT.list("markerTypes"));
  check("list: marker types", types.rows.length > 5, `${types.rows.length} types`);
  const land = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] >= 30 && !pack.cells.burg[i]); return pack.cells.p[c]; });
  const before = (await A(() => FMG_AGENT.list("markers"))).total;
  const m1 = await A(([p, t]) => FMG_AGENT.apply("addMarker", { x: p[0], y: p[1], type: t, note: "A test legend" }), [land, types.rows[0].type]);
  check("addMarker: configured type", m1.ok && m1.details.knownType === true, JSON.stringify(m1.details));
  const m2 = await A(([p]) => FMG_AGENT.apply("addMarker", { x: p[0] + 2, y: p[1] + 2, icon: "\u{1F3F0}", name: "Hidden keep" }), [land]);
  check("addMarker: custom emoji marker with a name", m2.ok && m2.details.type === "custom" && (await A(([id]) => pack.markers.find(m => m.i === id)?.name === "Hidden keep" && pack.markers.find(m => m.i === id)?.icon === "\u{1F3F0}", [m2.details.marker])));
  check("addMarker: shown on the markers layer", await A(() => Layers.isOn("markers")) && (await A(() => FMG_AGENT.list("markers"))).total === before + 2);
  const rm = await A(([id]) => FMG_AGENT.apply("removeMarker", { marker: id }), [m1.details.marker]);
  check("removeMarker", rm.ok && (await A(() => FMG_AGENT.list("markers"))).total === before + 1);
  // routes
  const pts = await A(() => { const a = pack.cells.i.find(i => pack.cells.h[i] >= 30); const b = pack.cells.c[a].find(n => pack.cells.h[n] >= 30); const c = pack.cells.c[b].find(n => n !== a && pack.cells.h[n] >= 30); return [a, b, c].map(i => pack.cells.p[i]); });
  const routesBefore = (await A(() => FMG_AGENT.list("routes"))).total;
  const rt = await A(([p]) => FMG_AGENT.apply("addRoute", { path: p, group: "trails" }), [pts]);
  check("addRoute: trail over land", rt.ok && rt.details.points === 3 && (await A(() => FMG_AGENT.list("routes"))).total === routesBefore + 1, JSON.stringify(rt.details));
  check("addRoute: link data registered between consecutive cells", await A(([id, p]) => { const [a, b] = [Pack.findCell(p[0][0], p[0][1]), Pack.findCell(p[1][0], p[1][1])]; return pack.cells.routes[a]?.[b] === id && pack.cells.routes[b]?.[a] === id; }, [rt.details.route, pts]));
  const wet = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] < 20); return pack.cells.p[c]; });
  const bad = await A(async ([p, q]) => { try { await FMG_AGENT.apply("addRoute", { path: [p, q] }); return "no error"; } catch (e) { return e.message; } }, [pts[0], wet]);
  check("addRoute: a road into water is refused", bad.includes("water"), bad.slice(0, 70));
  const rr = await A(([id]) => FMG_AGENT.apply("removeRoute", { route: id }), [rt.details.route]);
  check("removeRoute", rr.ok && (await A(() => FMG_AGENT.list("routes"))).total === routesBefore);
  await restoreFeatures();
}


// ---- rivers
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const before = await A(() => ({ n: FMG_AGENT.list("rivers", undefined, 1000).total, drawn: document.querySelectorAll("#rivers path").length, riverCells: pack.cells.r.filter(r => r).length }));
  const pts = await A(() => {
    const start = pack.cells.i.find(i => pack.cells.h[i] >= 30 && !pack.cells.r[i] && pack.cells.c[i].every(n => pack.cells.h[n] >= 30 && !pack.cells.r[n]));
    const path = [start]; let cur = start;
    for (let k = 0; k < 10; k++) { const next = pack.cells.c[cur].find(n => !path.includes(n) && pack.cells.h[n] >= 30 && !pack.cells.r[n]); if (!next) break; path.push(next); cur = next; }
    return [pack.cells.p[path[0]], pack.cells.p[path[path.length - 1]]];
  });
  const r = await A(([p]) => FMG_AGENT.apply("addRiver", { path: p, name: "Test Run" }), [pts]);
  check("addRiver: river drawn through the joined cells", r.ok && r.details.name === "Test Run" && r.details.cells >= 5, JSON.stringify(r.details));
  const mid = await A(([id]) => ({ n: FMG_AGENT.list("rivers", undefined, 1000).total, listed: FMG_AGENT.list("rivers", undefined, 1000).rows.some(x => x.id === id && x.name === "Test Run"), drawn: document.querySelectorAll("#rivers path").length, owned: pack.rivers.find(x => x.i === id).cells.every(c => pack.cells.r[c] === id), fluxOk: pack.rivers.find(x => x.i === id).cells.every(c => pack.cells.fl[c] >= 30) }), [r.details.river]);
  check("addRiver: listed, owns its cells, carries water", mid.n === before.n + 1 && mid.listed && mid.owned && mid.fluxOk, JSON.stringify(mid));
  check("addRiver: visible on the map", mid.drawn > before.drawn, `${before.drawn} -> ${mid.drawn} drawn paths`);
  const wet = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] < 20); return pack.cells.p[c]; });
  const bad = await A(async ([a, w]) => { try { await FMG_AGENT.apply("addRiver", { path: [a, w] }); return "no error"; } catch (e) { return e.message; } }, [pts[0], wet]);
  check("addRiver: a source or mouth in water is refused", bad.includes("water"), bad.slice(0, 70));
  const same = await A(async ([a]) => { try { await FMG_AGENT.apply("addRiver", { path: [a, a] }); return "no error"; } catch (e) { return e.message; } }, [pts[0]]);
  check("addRiver: a one-cell river is refused", same.includes("at least 2"), same.slice(0, 70));
  const rm = await A(([id]) => FMG_AGENT.apply("removeRiver", { river: id }), [r.details.river]);
  const end = await A(() => ({ n: FMG_AGENT.list("rivers", undefined, 1000).total, riverCells: pack.cells.r.filter(x => x).length }));
  check("removeRiver: river and its cells gone", rm.ok && end.n === before.n && end.riverCells === before.riverCells, JSON.stringify({ before, end }));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}


// ---- ring / rim selections
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const g = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === receiver.id); // renamed earlier in this test, so match by id
  const r1 = await A(([id]) => FMG_AGENT.select("ring", { state: id, depth: 1 }, {}), [g.id]);
  const r3 = await A(([id]) => FMG_AGENT.select("ring", { state: id, depth: 3 }, {}), [g.id]);
  const check1 = await A(([id]) => {
    const inReceiver = c => pack.cells.state[c] === id;
    const cells = Array.from(pack.cells.i).filter(c => pack.cells.h[c] >= 20 && !inReceiver(c) && pack.cells.c[c].some(inReceiver));
    const sel = FMG_AGENT.select("cells", { cells }, {});
    const ring = FMG_AGENT.select("ring", { state: id, depth: 1 }, {});
    const same = FMG_AGENT.select("cells", { cells }, { combine_op: "subtract", combine_with: ring.id });
    return { expected: sel.count, got: ring.count, diff: same.count };
  }, [g.id]);
  check("ring depth 1 = exactly the land cells touching the state from outside", check1.got === check1.expected && check1.diff === 0, JSON.stringify(check1));
  check("ring grows with depth", r3.count > r1.count && r1.count > 0, `${r1.count} -> ${r3.count}`);
  const rim = await A(([id]) => FMG_AGENT.select("rim", { state: id, depth: 1 }, {}), [g.id]);
  const rimOk = await A(([id, sid]) => { const sample = FMG_AGENT.describeSelection(sid); return sample.byState[id] === sample.count && sample.count > 0; }, [g.id, rim.id]);
  check("rim = cells of the state itself along its border with other land", rimOk, `${rim.count} cells`);
  const north = await A(([sid, y]) => FMG_AGENT.select("rect", { x0: 0, y0: 0, x1: 1280, y1: y }, { combine_op: "intersect", combine_with: sid }), [r3.id, g.pole[1]]);
  check("ring restricted to the north by intersecting with a rect", north.count > 0 && north.count < r3.count && north.bounds.y1 <= g.pole[1], `${r3.count} -> ${north.count}, y1=${north.bounds.y1}`);
  const before = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === g.id).cells;
  const res = await A(([sid, id]) => FMG_AGENT.apply("assignState", { selection: sid, state: id }), [north.id, g.id]);
  const after = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === g.id).cells;
  check("extending a state north with ring + rect + assignState", res.ok && after - before === res.changed && res.changed > 0, `${before} -> ${after}`);
  await A(t => FMG_AGENT.importMap(t), featureBase);
}


// ---- find by name, frame a region
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const some = await A(() => { const b = pack.burgs.find(x => x.i && !x.removed && x.name.length > 4); return { id: b.i, name: b.name }; });
  const needle = some.name.slice(1, 4).toUpperCase();
  const found = await A(([n]) => FMG_AGENT.list("burgs", undefined, 1000, n), [needle]);
  check("list: finds a city by part of its name, case-insensitive", found.rows.some(r => r.id === some.id) && found.rows.every(r => r.name.toLowerCase().includes(needle.toLowerCase())) && found.total < (await A(() => FMG_AGENT.list("burgs", undefined, 1).total)), `${found.total} match "${needle}"`);
  const none = await A(() => FMG_AGENT.list("burgs", undefined, 50, "zzzzzzqq"));
  check("list: no match gives an empty list, not an error", none.total === 0 && none.rows.length === 0);
  const g = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === receiver.id);
  const stateByName = await A(([n]) => FMG_AGENT.list("states", undefined, 50, n), [g.name.slice(0, 3)]);
  check("list: finds a state by name", stateByName.rows.some(r => r.id === g.id));

  const region = { x0: 400, y0: 260, x1: 600, y1: 420 };
  const cam = await A(([r]) => FMG_AGENT.showRegion(r), [region]);
  const v = cam.visibleMapArea;
  check("showRegion: the rectangle is fully inside the window", v.x0 <= region.x0 && v.y0 <= region.y0 && v.x1 >= region.x1 && v.y1 >= region.y1, JSON.stringify(v));
  check("showRegion: it really zoomed in, without wasting the window", cam.scale > 1.5 && (v.x1 - v.x0) < 2.2 * (region.x1 - region.x0), `scale ${cam.scale}, window shows ${Math.round(v.x1 - v.x0)} x ${Math.round(v.y1 - v.y0)}`);
  const bad = await A(async () => { try { await FMG_AGENT.showRegion({ x0: 5, y0: 5, x1: 5, y1: 9 }); return "no error"; } catch (e) { return e.message; } });
  check("showRegion: an empty rectangle is refused", bad.includes("x0 < x1"), bad.slice(0, 60));
  await A(() => FMG_AGENT.setCamera({ scale: 1 }));
}


// ---- merge states
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const base = await A(() => FMG_AGENT.summary());
  const into = base.states.find(x => x.id === receiver.id);
  const away = base.states.find(x => x.id === source.id);
  const oldCapital = away.capital.burg;
  const provinceCount = base.counts.provinces;
  const r = await A(([a, b]) => FMG_AGENT.apply("mergeStates", { states: [a], into: b }), [away.id, into.id]);
  const after = await A(() => FMG_AGENT.summary());
  check("mergeStates: one state fewer, the ruler gains exactly the land and cities", r.ok && after.counts.states === base.counts.states - 1 && after.states.find(x => x.id === into.id).cells === into.cells + away.cells && after.states.find(x => x.id === into.id).burgs === into.burgs + away.burgs, JSON.stringify(r.details));
  check("mergeStates: the merged state is gone and its land is coherent", !after.states.some(x => x.id === away.id) && after.states.reduce((n, x) => n + x.cells, 0) + after.unclaimedLandCells === after.landCells);
  check("mergeStates: its old capital is now an ordinary city of the ruler", await A(([id, to]) => pack.burgs[id].state === to && !pack.burgs[id].capital && !pack.burgs[id].removed, [oldCapital, into.id]));
  check("mergeStates: without as_provinces the province count is unchanged", after.counts.provinces === provinceCount);
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const p2 = await A(([a, b]) => FMG_AGENT.apply("mergeStates", { states: [a], into: b, as_provinces: true }), [away.id, into.id]);
  const keep = await A(([a, b, cap]) => { const sp = pack.provinces.filter(x => x.i && !x.removed && x.state === b && x.name === pack.states[a].name); const alive = pack.provinces.filter(x => x.i && !x.removed).length; return { named: sp.length, alive, owner: sp[0]?.state, burg: sp[0]?.burg === cap }; }, [away.id, into.id, oldCapital]);
  check("mergeStates as_provinces: the merged state lives on as one province of the ruler", p2.ok && keep.named === 1 && keep.owner === into.id && keep.alive < provinceCount, JSON.stringify({ ...keep, before: provinceCount }));
  const self = await A(async ([b]) => { try { await FMG_AGENT.apply("mergeStates", { states: [b], into: b }); return "no error"; } catch (e) { return e.message; } }, [into.id]);
  check("mergeStates: merging a state into itself is refused", self.includes("itself"), self.slice(0, 60));
  const ghost = await A(async ([b]) => { try { await FMG_AGENT.apply("mergeStates", { states: [99], into: b }); return "no error"; } catch (e) { return e.message; } }, [into.id]);
  check("mergeStates: an unknown state is refused", ghost.includes("does not exist"), ghost.slice(0, 60));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}


// ---- edit a city
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const target = await A(() => { const b = pack.burgs.find(x => x.i && !x.removed && !x.capital && !x.port && !pack.markets?.some(m => m.centerBurgId === x.i)); return b.i; });
  const pop = await A(([id]) => FMG_AGENT.apply("editBurg", { burg: id, population: 12345 }), [target]);
  const back = await A(([id]) => { const u = options.map.units.population; return Math.round(pack.burgs[id].population * u.scale * u.urbanization.rate); }, [target]);
  check("editBurg: population set to the requested number of people", pop.ok && Math.abs(back - 12345) <= 5, `asked 12345, now ${back} (${JSON.stringify(pop.details.population)})`);
  const walls = await A(([id]) => FMG_AGENT.apply("editBurg", { burg: id, walls: true, citadel: true, temple: true, shanty: false }), [target]);
  const flags = await A(([id]) => { const b = pack.burgs[id]; return { walls: b.walls, citadel: b.citadel, temple: b.temple, shanty: b.shanty }; }, [target]);
  check("editBurg: features switched on and off", walls.ok && flags.walls === 1 && flags.citadel === 1 && flags.temple === 1 && !flags.shanty, JSON.stringify(flags));
  const same = await A(([id]) => FMG_AGENT.apply("editBurg", { burg: id, walls: true }), [target]);
  check("editBurg: asking for what is already so changes nothing", same.ok && same.changed === 0);
  const empty = await A(async ([id]) => { try { await FMG_AGENT.apply("editBurg", { burg: id }); return "no error"; } catch (e) { return e.message; } }, [target]);
  check("editBurg: nothing to change is refused with a hint", empty.includes("population and/or"), empty.slice(0, 60));
  const market = await A(() => pack.markets?.[0]?.centerBurgId ?? null);
  if (market) {
    const m = await A(async ([id]) => { try { await FMG_AGENT.apply("editBurg", { burg: id, plaza: false }); return "no error"; } catch (e) { return e.message; } }, [market]);
    check("editBurg: a market centre keeps its plaza", m.includes("centre of a market"), m.slice(0, 60));
  }
  const ports = await A(async () => {
    const out = { ok: null, refused: null };
    for (const b of pack.burgs.filter(x => x.i && !x.removed && !x.port)) {
      try { const r = await FMG_AGENT.apply("editBurg", { burg: b.i, port: true }); if (!out.ok) out.ok = { id: b.i, port: pack.burgs[b.i].port, valid: Boolean(pack.features[pack.burgs[b.i].port]) }; }
      catch (e) { if (!out.refused) out.refused = e.message; }
      if (out.ok && out.refused) break;
    }
    return out;
  });
  check("editBurg: a coastal city can become a port (linked to a real water body)", ports.ok?.valid === true && ports.ok.port > 0, JSON.stringify(ports.ok));
  if (ports.refused) check("editBurg: a city with no navigable water is refused", ports.refused.includes("navigable"), ports.refused.slice(0, 70));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}

// ---- provinces, cultures, religions: creation
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const base = await A(() => FMG_AGENT.summary());
  const spot = await A(() => {
    const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && pack.cells.state[i] && !pack.cells.burg[i] && !(pack.cells.province[i] && pack.provinces[pack.cells.province[i]].center === i));
    return { cell: c, p: pack.cells.p[c], state: pack.cells.state[c] };
  });
  const cp = await A(([p]) => FMG_AGENT.apply("createProvince", { x: p[0], y: p[1], name: "Testmark", form_name: "Margrave" }), [spot.p]);
  check("createProvince: founded with the requested name and form", cp.ok && cp.details.name === "Testmark" && cp.details.fullName === "Testmark Margrave" && cp.details.state === spot.state, JSON.stringify(cp.details));
  const pid = cp.details.province;
  const prov = await A(([id, cell, state]) => { const p = pack.provinces[id]; return { owner: p.state, center: p.center, listed: pack.states[state].provinces.includes(id), cellGiven: pack.cells.province[cell] === id, neighbours: p.burgs !== undefined, area: p.area, pole: Boolean(p.pole), color: p.color }; }, [pid, spot.cell, spot.state]);
  check("createProvince: cell given, registered on its state, statistics and pole computed", prov.owner === spot.state && prov.center === spot.cell && prov.listed && prov.cellGiven && prov.area > 0 && prov.pole && /^#[0-9a-f]{6}$/i.test(prov.color), JSON.stringify(prov));
  check("createProvince: listed and count +1", (await A(() => FMG_AGENT.list("provinces", undefined, 2000))).rows.some(r => r.id === pid && r.name === "Testmark Margrave") && (await A(() => FMG_AGENT.summary())).counts.provinces === base.counts.provinces + 1);
  const grow = await A(([p, id, state]) => { const sel = FMG_AGENT.select("circle", { x: p[0], y: p[1], radius: 45 }, { only_state: state }); return FMG_AGENT.apply("assignProvince", { selection: sel.id, province: id }); }, [spot.p, pid, spot.state]);
  const areaAfter = await A(([id]) => pack.provinces[id].area, [pid]);
  check("createProvince: grows with select + assignProvince, area recomputed", grow.ok && grow.changed > 0 && areaAfter > prov.area, `changed ${grow?.changed}, area ${prov.area} -> ${areaAfter}`);
  const inWater = await A(async () => { try { await FMG_AGENT.apply("createProvince", { x: 640, y: 20 }); return "no error"; } catch (e) { return e.message; } });
  check("createProvince: a point in the water is refused", inWater.includes("water"), inWater.slice(0, 60));
  const free = await A(() => { const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !pack.cells.state[i]); return pack.cells.p[c]; });
  const neutral = await A(async ([p]) => { try { await FMG_AGENT.apply("createProvince", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [free]);
  check("createProvince: neutral land is refused with the way out", neutral.includes("Neutral lands") && neutral.includes("assignState"), neutral.slice(0, 60));
  const provCenter = await A(([cell]) => pack.cells.p[pack.provinces[pack.cells.province[cell]].center], [spot.cell]);
  const dup = await A(async ([p]) => { try { await FMG_AGENT.apply("createProvince", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [provCenter]);
  check("createProvince: another province's centre is refused", dup.includes("already the centre"), dup.slice(0, 60));

  const cSpot = await A(() => { const taken = new Set(pack.cultures.filter(c => c.i && !c.removed && c.center !== undefined).map(c => c.center)); const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !taken.has(i)); return { cell: c, p: pack.cells.p[c] }; });
  const cc = await A(([p]) => FMG_AGENT.apply("createCulture", { x: p[0], y: p[1], name: "Testfolk", type: "Naval", color: "#123456" }), [cSpot.p]);
  check("createCulture: created with name, type and colour", cc.ok && cc.details.name === "Testfolk" && cc.details.type === "Naval" && cc.details.color === "#123456", JSON.stringify(cc.details));
  const cid = cc.details.culture;
  check("createCulture: starts with no cells and says how to give it land", cc.details.cells === 0 && cc.warnings.some(w => w.includes("assignCulture")) && (await A(([id]) => pack.cells.culture.filter(c => c === id).length, [cid])) === 0);
  const paint = await A(([p, id]) => { const sel = FMG_AGENT.select("circle", { x: p[0], y: p[1], radius: 25 }, {}); return FMG_AGENT.apply("assignCulture", { selection: sel.id, culture: id }); }, [cSpot.p, cid]);
  const cStats = await A(([id, cell]) => ({ cells: pack.cultures[id].cells, area: pack.cultures[id].area, centre: pack.cells.culture[cell] }), [cid, cSpot.cell]);
  check("createCulture: assignCulture gives it land and the counters are fresh", paint.ok && cStats.cells > 0 && cStats.area > 0 && cStats.centre === cid, JSON.stringify(cStats));
  check("createCulture: listed", (await A(() => FMG_AGENT.list("cultures", undefined, 2000))).rows.some(r => r.id === cid && r.name === "Testfolk"));
  const dupCulture = await A(async ([p]) => { try { await FMG_AGENT.apply("createCulture", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [cSpot.p]);
  check("createCulture: an existing culture centre is refused", dupCulture.includes("already a culture centre"), dupCulture.slice(0, 60));

  const rSpot = await A(() => { const taken = new Set(pack.religions.filter(r => r.i && !r.removed && r.center !== undefined).map(r => r.center)); const c = pack.cells.i.find(i => pack.cells.h[i] >= 20 && !taken.has(i)); return { cell: c, p: pack.cells.p[c] }; });
  const cr = await A(([p]) => FMG_AGENT.apply("createReligion", { x: p[0], y: p[1], name: "Testfaith" }), [rSpot.p]);
  check("createReligion: created, holds its centre cell", cr.ok && cr.details.name === "Testfaith" && cr.details.type, JSON.stringify(cr.details));
  const rid = cr.details.religion;
  const rStats = await A(([id, cell]) => ({ centre: pack.cells.religion[cell], cells: pack.religions[id].cells, area: pack.religions[id].area, form: pack.religions[id].form }), [rid, rSpot.cell]);
  check("createReligion: centre cell converted, counters fresh", rStats.centre === rid && rStats.cells >= 1 && rStats.area > 0 && typeof rStats.form === "string", JSON.stringify(rStats));
  const dupReligion = await A(async ([p]) => { try { await FMG_AGENT.apply("createReligion", { x: p[0], y: p[1] }); return "no error"; } catch (e) { return e.message; } }, [rSpot.p]);
  check("createReligion: an existing religion centre is refused", dupReligion.includes("already a religion centre"), dupReligion.slice(0, 60));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}

// ---- labels: list, move, hide, reset
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const labels = await A(() => FMG_AGENT.list("labels", undefined, 5000));
  check("list labels: states, provinces and burgs are there with their position", labels.rows.length > 100 && ["state", "province", "burg"].every(t => labels.rows.some(r => r.type === t)) && labels.rows.every(r => Number.isFinite(r.x) && Number.isFinite(r.y)), `${labels.total} labels`);
  const target = labels.rows.find(r => r.type === "burg" && r.dx === 0 && r.dy === 0);
  const mv = await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id, dx: 5, dy: 3 }), [target]);
  const moved = await A(([t]) => FMG_AGENT.list("labels", undefined, 5000).rows.find(r => r.type === t.type && r.id === t.id), [target]);
  check("moveLabel: offset applied to the automatic position", mv.ok && moved.dx === 5 && moved.dy === 3 && moved.x === target.x + 5 && moved.y === target.y + 3, `${target.x},${target.y} -> ${moved.x},${moved.y}`);
  const hide = await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id, hide: true }), [target]);
  const hidden = await A(([t]) => Boolean(pack.burgs[t.id].label?.hidden), [target]);
  check("moveLabel: hidden", hide.ok && hidden);
  const show = await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id, hide: false }), [target]);
  check("moveLabel: shown again", show.ok && !(await A(([t]) => Boolean(pack.burgs[t.id].label?.hidden), [target])));
  const reset = await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id, reset: true }), [target]);
  const back = await A(([t]) => FMG_AGENT.list("labels", undefined, 5000).rows.find(r => r.type === t.type && r.id === t.id), [target]);
  check("moveLabel: reset returns to the automatic position", reset.ok && back.dx === 0 && back.dy === 0 && back.x === target.x && back.y === target.y);
  const stateLabel = labels.rows.find(r => r.type === "state");
  const sm = await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: "state", id: t.id, dx: -10, dy: 4 }), [stateLabel]);
  const smBack = await A(([t]) => pack.states[t.id].label, [stateLabel]);
  check("moveLabel: a state label keeps its offset on the entity", sm.ok && smBack.dx === -10 && smBack.dy === 4, JSON.stringify(smBack));
  await A(([t]) => FMG_AGENT.apply("moveLabel", { kind: "state", id: t.id, reset: true }), [stateLabel]);
  const half = await A(async ([t]) => { try { await FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id, dx: 2 }); return "no error"; } catch (e) { return e.message; } }, [target]);
  check("moveLabel: dx without dy is refused", half.includes("both dx and dy"), half.slice(0, 60));
  const ghost = await A(async () => { try { await FMG_AGENT.apply("moveLabel", { kind: "burg", id: 9999, dx: 1, dy: 1 }); return "no error"; } catch (e) { return e.message; } });
  check("moveLabel: an unknown entity is refused", ghost.includes("does not exist"), ghost.slice(0, 60));
  const nothing = await A(async ([t]) => { try { await FMG_AGENT.apply("moveLabel", { kind: t.type, id: t.id }); return "no error"; } catch (e) { return e.message; } }, [target]);
  check("moveLabel: nothing to do is refused with a hint", nothing.includes("dx+dy, hide, or reset"), nothing.slice(0, 60));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}

// ---- emblems
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const id = receiver.id;
  const before = await A(([s]) => ({ coa: pack.states[s].coa, shield: pack.states[s].coa.shield, size: pack.states[s].coa.size ?? 1, drawn: document.querySelectorAll("#stateEmblems use").length }), [id]);
  const re = await A(([s]) => FMG_AGENT.apply("regenerateEmblem", { kind: "state", id: s }), [id]);
  const after = await A(([s]) => ({ t1: pack.states[s].coa.t1, shield: pack.states[s].coa.shield, size: pack.states[s].coa.size ?? 1, drawn: document.querySelectorAll("#stateEmblems use").length }), [id]);
  check("regenerateEmblem: new heraldry, shape and size kept, still on the map", re.ok && after.t1 !== before.t1 && after.shield === before.shield && after.size === before.size && after.drawn === before.drawn, JSON.stringify({ before: { shield: before.shield, size: before.size }, after: { shield: after.shield, size: after.size } }));
  const se = await A(([s]) => FMG_AGENT.apply("setEmblemStyle", { kind: "state", id: s, shield: "round", size: 1.5 }), [id]);
  const styled = await A(([s]) => ({ shield: pack.states[s].coa.shield, size: pack.states[s].coa.size, t1: pack.states[s].coa.t1 }), [id]);
  check("setEmblemStyle: shape and size applied without new heraldry", se.ok && styled.shield === "round" && styled.size === 1.5 && styled.t1 === after.t1);
  const burg = await A(() => pack.burgs.find(b => b.i && !b.removed && b.coa).i);
  const be = await A(([b]) => FMG_AGENT.apply("setEmblemStyle", { kind: "burg", id: b, shield: "banner" }), [burg]);
  check("setEmblemStyle: works on a city emblem too", be.ok && (await A(([b]) => pack.burgs[b].coa.shield, [burg])) === "banner");
  const noParam = await A(async ([s]) => { try { await FMG_AGENT.apply("setEmblemStyle", { kind: "state", id: s }); return "no error"; } catch (e) { return e.message; } }, [id]);
  check("setEmblemStyle: nothing to change is refused with a pointer to regenerateEmblem", noParam.includes("shield and/or size") && noParam.includes("regenerateEmblem"), noParam.slice(0, 70));
  const badShape = await A(async ([s]) => { try { await FMG_AGENT.apply("setEmblemStyle", { kind: "state", id: s, shield: "banana" }); return "no error"; } catch (e) { return e.message; } }, [id]);
  check("setEmblemStyle: an unknown shield shape is refused with the vocabulary", badShape.includes("must be one of") && badShape.includes("heater"), badShape.slice(0, 70));
  const ghost = await A(async () => { try { await FMG_AGENT.apply("regenerateEmblem", { kind: "state", id: 999 }); return "no error"; } catch (e) { return e.message; } });
  check("regenerateEmblem: an unknown entity is refused", ghost.includes("does not exist"), ghost.slice(0, 60));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}

// ---- legends and river names
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const boxes = () => A(() => Array.from(document.querySelectorAll("#legend > g[data-legend]")).map(n => n.dataset.legend));
  const apply = (params) => A(async (p) => { try { return await FMG_AGENT.apply("legend", p); } catch (e) { return { error: e.message }; } }, params);
  await A(() => document.getElementById("legend").setAttribute("transform", "translate(1690, 931)")); // the leftover shift an old .map can carry (D-008)
  for (const layer of ["states", "provinces", "cultures", "religions", "biomes", "zones", "heightmap", "temperature", "precipitation", "population", "routes", "markets", "trade"]) {
    const r = await apply({ action: "show", layer });
    check(`legend ${layer}: box drawn with items`, r.ok === true && r.details.items.length > 0, r.error ?? `${r.details?.items.length} items`);
  }
  check("legend: the layer's leftover shift is removed so boxes stay on the canvas (D-008)", (await A(() => document.getElementById("legend").getAttribute("transform"))) === null);
  const wide = await apply({ action: "show", layer: "provinces" });
  check("legend: a very long legend is flagged with how to shorten it", Array.isArray(wide.warnings) && wide.warnings.some(w => w.includes("state")), JSON.stringify(wide.warnings));
  await apply({ action: "hide", layer: "provinces" }); // 300+ items cannot fit in a window by nature: judged apart
  const onCanvas = await A(() => Array.from(document.querySelectorAll("#legend > g[data-legend]")).every(n => { const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(n.getAttribute("transform") ?? ""); return m && Number(m[1]) > -50 && Number(m[2]) > -50 && Number(m[1]) < window.innerWidth && Number(m[2]) < window.innerHeight; }));
  check("legend: every box sits inside the window", onCanvas);
  check("legend: a box is named like Azgaar's own editor boxes", (await boxes()).includes("States") && (await boxes()).includes("Biomes"));
  const noColour = await A(() => Array.from(document.querySelectorAll("#legend > g[data-legend] rect[fill]")).filter(r => !/^(#[0-9a-f]{3,8}|url\(#[\w-]+\))$/i.test(r.getAttribute("fill")) && r.getAttribute("class") !== "legendBox").map(r => r.getAttribute("fill")));
  check("legend: swatches are plain hex colours or patterns (they survive a save)", noColour.length === 0, noColour.slice(0, 3).join(" "));
  const list = await apply({ action: "show", layer: "provinces", state: sum.states[0].id });
  check("legend provinces: one state's provinces only", list.ok === true && list.details.items.length < 40, `${list.details?.items.length}`);
  const custom = await apply({ action: "show", layer: "custom", title: "Mine", items: "#aa3355=Dry, lands;#3355aa=Wet | lands", corner: "top-left", columns: 7, opacity: 0.5 });
  check("legend custom: commas and bars in a label are cleaned", custom.ok === true && custom.details.items.join("/") === "Dry lands/Wet lands", JSON.stringify(custom.details?.items));
  check("legend: columns and opacity applied to the style", (await A(() => [styles.legend.options.columns, styles.legend.groups.box.attrs["fill-opacity"]])).join() === "7,0.5");
  const corner = await A(() => { const n = document.querySelector('#legend > g[data-legend="Mine"]'); const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(n.getAttribute("transform")); return [Number(m[1]), Number(m[2])]; });
  check("legend: corner top-left puts the box near the top-left of the map", corner[0] < 40 && corner[1] < 40, corner.join(","));
  check("legend custom: a malformed item is refused with an example", String((await apply({ action: "show", layer: "custom", items: "oops" })).error).includes("#aa3355=Label"));
  check("legend: items without layer custom is refused", String((await apply({ action: "show", layer: "states", items: "#aa3355=x" })).error).includes("only goes with layer custom"));
  // the boxes are part of the saved map (D-017): save, reload, still there
  const withBoxes = await boxes();
  const saved = await A(() => FMG_AGENT.exportMap());
  await A(t => FMG_AGENT.importMap(t), featureBase);
  check("legend: a reload of another map drops the boxes", (await boxes()).length === 0);
  await A(t => FMG_AGENT.importMap(t), saved);
  const afterReload = await boxes();
  check("legend: boxes come back with the saved map", JSON.stringify(afterReload.sort()) === JSON.stringify(withBoxes.sort()), `${afterReload.length}/${withBoxes.length}`);
  const hid = await apply({ action: "hide", layer: "states" });
  check("legend: hide removes one box only", hid.changed === 1 && !(await boxes()).includes("States") && (await boxes()).includes("Biomes"));
  const hidAgain = await apply({ action: "hide", layer: "states" });
  check("legend: hiding a box that is not shown changes nothing", hidAgain.changed === 0);
  await apply({ action: "hide_all" });
  check("legend: hide_all clears every box", (await boxes()).length === 0);

  const river = await A(() => pack.rivers[0].i);
  const rn = await A(([id]) => FMG_AGENT.apply("rename", { kind: "river", id, name: "Fleuve Test" }), [river]);
  check("rename river: name changed", rn.ok === true && (await A(([id]) => pack.rivers.find(r => r.i === id).name, [river])) === "Fleuve Test");
  const rn2 = await A(async () => { try { await FMG_AGENT.apply("rename", { kind: "river", id: 99999, name: "x" }); return "no error"; } catch (e) { return e.message; } });
  check("rename river: unknown river refused", rn2.includes("does not exist"), rn2.slice(0, 50));
  await A(t => FMG_AGENT.importMap(t), featureBase);
}

// ---- persistent annotations (D-017) and the goods legend
{
  await A(t => FMG_AGENT.importMap(t), featureBase);
  const run = (params) => A(async (p) => { try { return await FMG_AGENT.apply("annotate", p); } catch (e) { return { error: e.message }; } }, params);
  const goods = await A(async () => { try { return await FMG_AGENT.apply("legend", { action: "show", layer: "goods" }); } catch (e) { return { error: e.message }; } });
  check("legend goods: lists the shown goods or says there is nothing to show", goods.ok === true ? goods.details.items.length > 0 : String(goods.error).includes("nothing to show"), goods.error ?? goods.details.items.join(","));
  await A(() => FMG_AGENT.apply("legend", { action: "hide_all" }));

  const text = await run({ action: "add", kind: "text", x: 200, y: 150, text: "Ici <b>bas</b>", color: "teal" });
  const marker = await run({ action: "add", kind: "marker", x: 300, y: 200, text: "Port", size: 4 });
  const line = await run({ action: "add", kind: "line", path: [[10, 10], [200, 90], [300, 60]], color: "#336699", text: "Route du sel" });
  const area = await run({ action: "add", kind: "area", area: [[400, 300], [500, 300], [450, 380]], text: "Zone" });
  check("annotate: text, marker, line and area are added with increasing ids", [text, marker, line, area].map(r => r.details?.id).join() === "1,2,3,4", JSON.stringify([text, marker, line, area].map(r => r.error ?? r.details?.id)));
  check("annotate: a colour name is stored as hex", text.details.color === "#008080", text.details?.color);
  check("annotate: text is plain text, never markup", (await A(() => document.querySelector("#annotations text").textContent)) === "Ici <b>bas</b>" && (await A(() => document.querySelectorAll("#annotations b").length)) === 0);
  check("annotate: refused outside the map", String((await run({ action: "add", kind: "marker", x: 99999, y: 5 })).error).includes("outside the map"));
  check("annotate: a bad colour is refused", String((await run({ action: "add", kind: "marker", x: 5, y: 5, color: "notacolour" })).error).includes("not a colour"));
  check("annotate: add text without text is refused", String((await run({ action: "add", kind: "text", x: 5, y: 5 })).error).includes("`text` is required"));
  check("annotate: a line needs its path", String((await run({ action: "add", kind: "line" })).error).includes("`path` is required"));
  check("annotate: list gives every id", (await run({ action: "list" })).details.annotations.length === 4);

  // the overlay is saved with the map and comes back, drawn, after a reload
  const saved = await A(() => FMG_AGENT.exportMap());
  await A(t => FMG_AGENT.importMap(t), featureBase);
  check("annotate: another map has none", (await run({ action: "list" })).details.annotations.length === 0);
  await A(t => FMG_AGENT.importMap(t), saved);
  const back = (await run({ action: "list" })).details.annotations;
  check("annotate: all four come back after save and reload", back.length === 4 && back.map(a => a.kind).join() === "text,marker,line,area", JSON.stringify(back.map(a => a.kind)));
  check("annotate: the reloaded shapes are really drawn", (await A(() => [document.querySelectorAll("#annotations circle").length, document.querySelectorAll("#annotations polyline").length, document.querySelectorAll("#annotations polygon").length].join())) === "1,1,1");
  const next = await run({ action: "add", kind: "marker", x: 50, y: 50 });
  check("annotate: ids keep counting after a reload", next.details.id === 5, `${next.details?.id}`);
  const removed = await run({ action: "remove", id: 2 });
  check("annotate: remove deletes one", removed.changed === 1 && (await run({ action: "list" })).details.annotations.length === 4);
  check("annotate: removing an unknown id is refused", String((await run({ action: "remove", id: 77 })).error).includes("does not exist"));
  const cleared = await run({ action: "clear" });
  check("annotate: clear removes them all", cleared.changed === 4 && (await run({ action: "list" })).details.annotations.length === 0);
  await A(t => FMG_AGENT.importMap(t), featureBase);
}


// ---- clean capture mode (D-021): pictograms forced off, then put back exactly
{
  await A(() => FMG_AGENT.setLayers({ show: ["burgIcons", "routes", "markers", "ice"] }));
  const sels = ["#burgIcons [data-group=anchors]", "#routes", "#markers", "#ice"];
  const shown = await A(sl => sl.map(q => document.querySelector(q) ? getComputedStyle(document.querySelector(q)).display : "missing"), sels);
  const on = await A(sl => FMG_AGENT.setCleanMode(true, sl), sels);
  const hiddenNow = await A(sl => sl.map(q => getComputedStyle(document.querySelector(q)).display), sels);
  check("clean mode: anchors, routes, markers and ice are forced off", on.hidden >= 4 && hiddenNow.every(d => d === "none"), JSON.stringify(hiddenNow));
  await A(() => FMG_AGENT.setLayers({ show: ["burgIcons"] })); // a redraw must not bring them back
  check("clean mode: a layer redraw does not bring them back", (await A(() => getComputedStyle(document.querySelector("#burgIcons [data-group=anchors]")).display)) === "none");
  await A(() => FMG_AGENT.setCleanMode(false));
  const after = await A(sl => sl.map(q => document.querySelector(q) ? getComputedStyle(document.querySelector(q)).display : "missing"), sels);
  check("clean mode off: every element is back as it was", JSON.stringify(after) === JSON.stringify(shown) && (await A(() => document.querySelector("#burgIcons [data-group=anchors]").style.display === "")), JSON.stringify([shown, after]));
  check("clean mode: an empty list is refused", String(await A(async () => { try { FMG_AGENT.setCleanMode(true, []); return "no error"; } catch (e) { return e.message; } })).includes("empty"));
}

// ---- globe layout (D-020): the map takes exactly its share of the 360 degrees, centred
{
  const real = await A(() => JSON.stringify(options.map.geography.coordinates));
  const info = await A(c => { options.map.geography.coordinates = c; return FMG_AGENT.globeInfo(); }, { latT: 180, latN: 90, lonT: 320, lonW: -160, lonE: 160 });
  const w = info.texturePx.width;
  check("globe: 320 degrees take 320/360 of the texture width", info.mapPx.width === Math.round((320 / 360) * w), `${info.mapPx.width}/${w}`);
  check("globe: the map is centred, closing ocean on both sides", Math.abs(info.mapPx.x * 2 + info.mapPx.width - w) <= 1 && info.closingOceanDegrees === 40, JSON.stringify(info.mapPx));
  check("globe: the edge fades over a few percent of the width", info.featherPx > 0 && info.featherPx < w / 10, `${info.featherPx}`);
  check("globe: partial map is not reported as the whole world", info.coversWholeWorld === false);
  const full = await A(c => { options.map.geography.coordinates = c; return FMG_AGENT.globeInfo(); }, { latT: 180, latN: 90, lonT: 360, lonW: -180, lonE: 180 });
  check("globe: a 360 degree map fills the width, no fade", full.mapPx.width === full.texturePx.width && full.featherPx === 0 && full.coversWholeWorld === true);
  await A(c => { options.map.geography.coordinates = JSON.parse(c); }, real);
}

// ---- high-fidelity 2D downsampling: fractional Lanczos, transparent edges and no-op short circuit
{
  const sampled = await A(async () => {
    const c = document.createElement("canvas"); c.width = c.height = 27;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(250,20,10,1)"; ctx.fillRect(0, 0, 13, 27);
    const base64 = c.toDataURL("image/png").split(",")[1];
    const same = await FMG_AGENT.downsampleImage({ base64, mimeType: "image/png", width: 27, height: 27, filter: "lanczos3" });
    const fractional = await FMG_AGENT.downsampleImage({ base64, mimeType: "image/png", width: 18, height: 18, filter: "lanczos3" });
    const img = new Image(); img.src = `data:image/png;base64,${fractional.base64}`;
    await img.decode();
    const out = document.createElement("canvas"); out.width = out.height = 18;
    const g = out.getContext("2d"); g.drawImage(img, 0, 0);
    return { noOp: same.reusedSource, fractional: !fractional.reusedSource && fractional.width === 18 && fractional.height === 18,
      edge: Array.from(g.getImageData(8, 9, 1, 1).data), empty: Array.from(g.getImageData(17, 9, 1, 1).data) };
  });
  check("downsample: equal dimensions reuse the source canvas", sampled.noOp);
  check("downsample: fractional Lanczos3 keeps clean transparent edges", sampled.fractional && sampled.edge[0] > sampled.edge[2] && sampled.edge[3] > 0 && sampled.empty[3] === 0, JSON.stringify(sampled));
}

// ---- 3D views (D-019): relief and globe open, are read as pictures, and leave the person's settings alone
{
  const settingsBefore = await A(() => JSON.stringify(options.app.threeD));
  const blockedBefore = session.blockedRequests.size;
  for (const mode of ["relief", "globe"]) {
    const opened = await A(m => FMG_AGENT.open3d({ mode: m, textureResolution: 1024 }), mode);
    check(`3d ${mode}: opens and the picture settles`, opened.finished === true && (await A(() => FMG_AGENT.is3dOpen())), JSON.stringify(opened.canvas));
    const png = await A(() => FMG_AGENT.capture3d("png", 90));
    const buf = Buffer.from(png.data, "base64");
    check(`3d ${mode}: a real PNG comes back`, buf.subarray(1, 4).toString() === "PNG" && buf.length > 5000 && png.width === 1280, `${buf.length} bytes ${png.width}x${png.height}`);
    const webp = await A(() => FMG_AGENT.capture3d("webp", 80));
    check(`3d ${mode}: WebP output works`, webp.mimeType === "image/webp" && webp.data.length > 100);
    await A(g => FMG_AGENT.view3d({ x: g ? 60 : 45, y: g ? 20 : 30 }), mode === "globe");
    const moved = await A(() => FMG_AGENT.capture3d("png", 90));
    check(`3d ${mode}: turning the camera changes the picture`, moved.data !== png.data);
    await A(() => FMG_AGENT.close3d());
    check(`3d ${mode}: closing returns to the flat map`, !(await A(() => FMG_AGENT.is3dOpen())) && (await A(() => document.getElementById("canvas3d") === null)));
  }
  check("3d: the person's own 3D settings are put back", (await A(() => JSON.stringify(options.app.threeD))) === settingsBefore);
  check("3d: nothing asked the network (starfield is local)", session.blockedRequests.size === blockedBefore, [...session.blockedRequests].join(","));
  const planet = await A(() => FMG_AGENT.open3d({
    mode: "globe", satellite: true, erosion: true, clouds: true, atmosphere: true,
    sun: { azimuth: 135, altitude: 35 }, textureResolution: 1024
  }));
  check("3d globe: satellite and erosion work together", planet.finished === true && planet.settings.satellite === true && planet.settings.erosion === true, JSON.stringify(planet.settings));
  check("3d globe: actual texture, PBR channels and shells installed", planet.globe.render.texture === "satellite" && planet.globe.render.material === "MeshStandardMaterial" && planet.globe.render.bump && planet.globe.render.roughness && planet.globe.render.atmosphere && planet.globe.render.clouds, JSON.stringify(planet.globe.render));
  const globeCell = await A(() => FMG_AGENT.globeInfo().centerCell);
  const validCenter = await A(cell => Number.isInteger(cell) && cell >= 0 && cell < pack.cells.i.length, globeCell);
  check("3d globe: atmosphere and clouds do not intercept surface picking", validCenter, `cell=${globeCell}`);
  const planetPng = await A(() => FMG_AGENT.capture3d("png", 90));
  check("3d globe: PBR satellite capture has pixels", planetPng.data.length > 10000, `${planetPng.data.length} chars`);
  await A(() => FMG_AGENT.close3d());
  check("3d globe: satellite/erosion/clouds settings are restored", (await A(() => JSON.stringify(options.app.threeD))) === settingsBefore);
  const polarRace = await A(async () => {
    const oldCoords = structuredClone(options.map.geography.coordinates);
    const OriginalImage = window.Image;
    let queued = false, loaded = false;
    window.Image = class DelayedPolarImage extends OriginalImage {
      set src(value) {
        if (String(value).startsWith("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHL")) {
          queued = true;
          this.addEventListener("load", () => { loaded = true; }, { once: true });
          setTimeout(() => { super.src = value; }, 250);
        } else super.src = value;
      }
      get src() { return super.src; }
    };
    try {
      options.map.geography.coordinates = { ...oldCoords, latT: 120, latN: 60 };
      const opened = await FMG_AGENT.open3d({ mode: "globe", textureResolution: 1024 });
      return { queued, loaded, finished: opened.finished, texture: opened.globe.render.texture };
    } finally {
      await FMG_AGENT.close3d();
      options.map.geography.coordinates = oldCoords;
      window.Image = OriginalImage;
    }
  });
  check("3d globe: polar image is decoded before map texture is committed", polarRace.queued && polarRace.loaded && polarRace.finished && polarRace.texture === "map", JSON.stringify(polarRace));
  const none = await A(() => { try { FMG_AGENT.capture3d("png", 90); return "no error"; } catch (e) { return e.message; } });
  check("3d: capture without an open view is refused", none.includes("no 3D view"), none);

  await A(() => FMG_AGENT.open3d({ mode: "globe", textureResolution: 1024 }));
  const dipt = await A(() => FMG_AGENT.captureDiptych("png", 90, 80));
  check("3d globe diptych: composites double-width image (S-022)", dipt.width === 2560 && dipt.height === 720);
  const bufDipt = Buffer.from(dipt.data, "base64");
  check("3d globe diptych: valid PNG output", bufDipt.subarray(1, 4).toString() === "PNG" && bufDipt.length > 5000);
  const diptJpeg = await A(() => FMG_AGENT.captureDiptych("jpeg", 80, 80));
  check("3d globe diptych: valid JPEG preview output", diptJpeg.mimeType === "image/jpeg" && diptJpeg.data.length > 1000);
  await A(() => FMG_AGENT.close3d());
}

// ---- merge regression: the native renderer respects wide planetary geography, not a 125-degree sticker
{
  const geography = await A(() => structuredClone(options.map.geography.coordinates));
  try {
    await A(() => { options.map.geography.coordinates.lonT = 288; });
    const opened = await A(() => FMG_AGENT.open3d({ mode: "globe", satellite: true, textureResolution: 1024 }));
    check("288-degree globe: native render completes", opened.finished);
    const info = await A(() => FMG_AGENT.globeInfo());
    check("288-degree globe: map keeps its actual longitude span", info.mapLongitudeDegrees === 288 && info.closingOceanDegrees === 72);
    check("288-degree globe: texture layout wraps across hemispheres", info.mapPx.width === Math.round(info.texturePx.width * 288 / 360)
      && info.mapPx.x === (info.texturePx.width - info.mapPx.width) / 2);
    await A(() => FMG_AGENT.view3d({ x: -55, y: 0 }));
    const west = await A(() => FMG_AGENT.capture3d("png", 95));
    await A(() => FMG_AGENT.view3d({ x: 55, y: 0 }));
    const east = await A(() => FMG_AGENT.capture3d("png", 95));
    check("288-degree globe: west/east views reveal distinct hemispheres", west.data !== east.data && west.data.length > 1000 && east.data.length > 1000);
    const diptych = await A(() => FMG_AGENT.captureDiptych("png", 95, 55));
    check("288-degree globe: atlas capture remains a double-width PNG", diptych.width === 2560 && diptych.height === 720
      && Buffer.from(diptych.data, "base64").subarray(1, 4).toString() === "PNG");
  } finally {
    await A(() => FMG_AGENT.close3d());
    await A(coords => { options.map.geography.coordinates = coords; }, geography);
  }
}

// ---- zones, notes & lore (S-026b): 9 commands, hatch fills, XSS stripping
{
  const snap = await A(() => FMG_AGENT.exportMap());
  const sum0 = await A(() => FMG_AGENT.summary());
  const zoneRows = async () => (await A(() => FMG_AGENT.list("zones", undefined, 5000))).rows;

  const described = await A(() => FMG_AGENT.describe().commands.map(c => c.name));
  const wanted = ["addZone", "updateZone", "setZoneCells", "removeZone", "regenerateZones", "setNote", "appendNote", "removeNote", "setMapLore"];
  check("map_commands lists the 9 new commands", wanted.every(w => described.includes(w)), wanted.filter(w => !described.includes(w)).join(",") || "all 9 present");

  // zones over an explicit cells list of the receiver state, then reshape
  const cellIds = await A(([s]) => [...pack.cells.i.filter(c => pack.cells.h[c] >= 20 && pack.cells.state[c] === s)].slice(0, 8), [receiver.id]); // spread: cells.i is a Uint32Array, page.evaluate would return a plain object otherwise
  const z = await A(([ids]) => FMG_AGENT.apply("addZone", { name: "Quarantine", type: "Plague", cells: ids, color: "#1a2b3c" }), [cellIds]); // const-ok: smoke colour
  const zid = z.details?.zone;
  check("addZone creates over a cells list", z.ok && Number.isInteger(zid) && z.details.cells === cellIds.length, JSON.stringify(z.details));
  check("zone listed with fill and type", (await zoneRows()).some(r => r.id === zid && r.type === "Plague" && r.color === "#1a2b3c" && r.cells === cellIds.length), JSON.stringify((await zoneRows()).find(r => r.id === zid)));
  const upd = await A(([i]) => FMG_AGENT.apply("updateZone", { zone: i, name: "Sector 7", color: "url(#hatch2)", hidden: true }), [zid]);
  check("updateZone renames, recolours to a hatch and hides", upd.ok && upd.details.changed.length === 3 && upd.details.hidden === true && upd.details.color === "url(#hatch2)", upd.details.changed?.join(","));
  const newIds = await A(([s]) => [...pack.cells.i.filter(c => pack.cells.state[c] === s)].slice(8, 14), [receiver.id]);
  const setC = await A(([i, ids]) => FMG_AGENT.apply("setZoneCells", { zone: i, cells: ids }), [zid, newIds]);
  check("setZoneCells replaces coverage", setC.ok && setC.details.cells === newIds.length && setC.details.previousCells === cellIds.length, JSON.stringify(setC.details));
  const both = await A(async () => { try { await FMG_AGENT.apply("addZone", { name: "x", type: "y", cells: [0], selection: "sel-1" }); return "no error"; } catch (e) { return e.message; } });
  check("cells and selection together are refused", String(both).includes("exactly one"), String(both).slice(0, 110));
  const badCell = await A(async ([i]) => { try { await FMG_AGENT.apply("setZoneCells", { zone: i, cells: [-1] }); return "no error"; } catch (e) { return e.message; } }, [zid]);
  check("out-of-range cells refused before any change", String(badCell).includes("does not exist"), String(badCell).slice(0, 110));
  const badColor = await A(async ([i]) => { try { await FMG_AGENT.apply("updateZone", { zone: i, color: "url(#hatch99)" }); return "no error"; } catch (e) { return e.message; } }, [zid]);
  check("a fill outside the 42 hatches is refused with the hatch hint", String(badColor).includes("url(#hatch41)"), String(badColor).slice(0, 130));
  const rmZone = await A(([i]) => FMG_AGENT.apply("removeZone", { zone: i }), [zid]);
  check("removeZone deletes", rmZone.ok && !(await zoneRows()).some(r => r.id === zid), rmZone.message);
  const regen = await A(() => FMG_AGENT.apply("regenerateZones", {}));
  check("regenerateZones rebuilds the event zones with a warning", regen.ok && regen.warnings.length >= 1, `${regen.details.zones} zones (was ${regen.details.previousZones})`);

  // notes: an XSS payload must be stored clean, never executed
  const payload = `<script>alert(1)</script><p>Hello <b>world</b></p><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">link</a><iframe src="https://evil.example"></iframe>`;
  const note = await A(([s, h]) => FMG_AGENT.apply("setNote", { id: `state:${s}`, html: h }), [receiver.id, payload]);
  check("setNote strips unsafe markup and warns", note.ok && note.details.sanitized === true && note.details.characters < payload.length && note.warnings?.length >= 1, JSON.stringify(note.details));
  const noteRows = async () => (await A(() => FMG_AGENT.list("notes", undefined, 5000))).rows;
  const myNote = (await noteRows()).find(r => r.id === `state:${receiver.id}`);
  check("stored note holds no XSS but keeps safe tags", Boolean(myNote) && !myNote.note.includes("<script") && !myNote.note.includes("onerror") && !myNote.note.includes("javascript:") && !myNote.note.includes("<iframe") && myNote.note.includes("<b>world</b>"), myNote?.note);
  const app = await A(([s]) => FMG_AGENT.apply("appendNote", { entity_type: "state", entity_id: s, html: "<p>Afterword</p>" }), [receiver.id]);
  check("appendNote grows the note", app.ok && app.details.characters === note.details.characters + "<p>Afterword</p>".length, `chars=${app.details.characters}`);
  const milRow = (await A(() => FMG_AGENT.list("military", undefined, 1))).rows[0];
  const regNote = await A(([s, r]) => FMG_AGENT.apply("setNote", { entity_type: "regiment", entity_id: s, entity_sub: r, html: "<p>Muster roll.</p>" }), [milRow.state, milRow.regimentId]);
  check("regiment note via entity_type + entity_sub uses the composite key", regNote.ok && regNote.details.key === `regiment:${milRow.state}-${milRow.regimentId}`, regNote.details?.key);
  const regRm = await A(([k]) => FMG_AGENT.apply("removeNote", { id: k }), [regNote.details.key]);
  check("removeNote deletes by key", regRm.ok && regRm.details.had === true);
  const noSub = await A(async ([s]) => { try { await FMG_AGENT.apply("setNote", { entity_type: "regiment", entity_id: s, html: "<p>x</p>" }); return "no error"; } catch (e) { return e.message; } }, [milRow.state]);
  check("a regiment note without entity_sub is refused", String(noSub).includes("entity_sub"), String(noSub).slice(0, 110));
  const noEnt = await A(async () => { try { await FMG_AGENT.apply("setNote", { id: "culture:999", html: "<p>x</p>" }); return "no error"; } catch (e) { return e.message; } });
  check("a note on a missing entity is refused", String(noEnt).includes("does not exist"), String(noEnt).slice(0, 110));
  const cleanNote = await A(([s]) => FMG_AGENT.apply("setNote", { id: `state:${s}`, html: "<p>Clean.</p>" }), [receiver.id]);
  check("clean markup is stored untouched without warning", cleanNote.ok && cleanNote.details.sanitized === false && !cleanNote.warnings, JSON.stringify(cleanNote.details));

  // lore: calendar and world texts
  const lore = await A(() => FMG_AGENT.apply("setMapLore", { name: "Smoke World", year: 525, era: "Water Era", description: "The world of the smoke test." }));
  check("setMapLore sets name, year, era and derives the short form", lore.ok && lore.details.name === "Smoke World" && lore.details.year === 525 && lore.details.era === "Water Era" && lore.details.eraShort === "WE", JSON.stringify(lore.details.changed));
  const sum2 = await A(() => FMG_AGENT.summary());
  check("map_summary carries lore and the zone/note/regiment counts", sum2.lore.year === 525 && sum2.lore.era === "Water Era" && typeof sum2.counts.zonesCount === "number" && typeof sum2.counts.notesCount === "number" && typeof sum2.counts.regimentsCount === "number", `notes=${sum2.counts.notesCount}, zones=${sum2.counts.zonesCount}, regiments=${sum2.counts.regimentsCount}`);
  const empty = await A(async () => { try { await FMG_AGENT.apply("setMapLore", {}); return "no error"; } catch (e) { return e.message; } });
  check("setMapLore without any field is refused", String(empty).includes("at least one"), String(empty).slice(0, 110));

  // undoability: reloading the snapshot undoes the whole block
  await A(t => FMG_AGENT.importMap(t), snap);
  const end = await A(() => FMG_AGENT.summary());
  const endNotes = await noteRows();
  check("reload undoes zones, notes and lore", end.lore.year === sum0.lore.year && end.lore.name === sum0.lore.name && !endNotes.some(r => r.id === `state:${receiver.id}` || r.note.includes("Afterword")) && end.counts.zonesCount === sum0.counts.zonesCount, `lore=${end.lore.name}/${end.lore.year}`);
}


// ---- styles, burg architecture & route/river topology (S-026c): 7 commands, presets, undo
{
  const snap = await A(() => FMG_AGENT.exportMap());
  const net0 = await A(() => ({ routes: pack.routes.length, rivers: pack.rivers.length }));
  const described = await A(() => FMG_AGENT.describe().commands.map(c => c.name));
  const wanted = ["applyStylePreset", "setStyle", "updateBurg", "updateRoute", "splitRoute", "joinRoutes", "updateRiver"];
  check("map_commands lists the 7 new commands", wanted.every(w => described.includes(w)), wanted.filter(w => !described.includes(w)).join(",") || "all 7 present");

  // map_list kind=styles: the preset and the configuration setStyle addresses
  const styleList = await A(() => FMG_AGENT.list("styles", undefined, 1000));
  const oceanFill0 = await A(() => styles.ocean.groups.base.attrs.fill);
  check("map_list styles returns the preset and the configuration", styleList.preset === "default" && styleList.systemPresets.length === 15 && styleList.rows.some(r => r.name === "ocean" && r.config?.groups), `preset=${styleList.preset}, rows=${styleList.total}`);

  // applyStylePreset: a built-in theme replaces the whole look
  const preset = await A(() => FMG_AGENT.apply("applyStylePreset", { preset: "ink" }));
  const oceanFill1 = await A(() => styles.ocean.groups.base.attrs.fill);
  check("applyStylePreset applies a built-in theme", preset.ok && preset.details.preset === "ink" && oceanFill1 !== oceanFill0 && (await A(() => options.map.style.preset)) === "ink", JSON.stringify(preset.details));
  check("map_list styles follows the applied preset", (await A(() => FMG_AGENT.list("styles", undefined, 1000))).preset === "ink");
  check("the applied style reached the SVG", await A(() => document.querySelector('[data-layer="ocean"] [data-group="base"]').getAttribute("fill") === styles.ocean.groups.base.attrs.fill));
  const badPreset = await A(async () => { try { await FMG_AGENT.apply("applyStylePreset", { preset: "no-such-theme" }); return "no error"; } catch (e) { return e.message; } });
  check("an unknown preset is refused with the available names", badPreset.includes("Available"), badPreset.slice(0, 90));
  check("a refused preset is a clean failure", (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === false);

  // setStyle: one value at a time, null unsets
  const sv = await A(() => FMG_AGENT.apply("setStyle", { path: "ocean.groups.base.attrs.fill", value: "#336699" }));
  check("setStyle writes one value and redraws it", sv.ok && sv.changed === 1 && (await A(() => styles.ocean.groups.base.attrs.fill)) === "#336699" && (await A(() => document.querySelector('[data-layer="ocean"] [data-group="base"]').getAttribute("fill"))) === "#336699", JSON.stringify(sv.details)); // const-ok: smoke colour
  const svNum = await A(() => FMG_AGENT.apply("setStyle", { path: "relief.options.density", value: 0.75 }));
  check("setStyle accepts numbers for options", svNum.ok && (await A(() => styles.relief.options.density)) === 0.75, JSON.stringify(svNum.details));
  const svNull = await A(() => FMG_AGENT.apply("setStyle", { path: "ocean.groups.base.attrs.fill", value: null }));
  check("setStyle null unsets an attribute", svNull.ok && (await A(() => styles.ocean.groups.base.attrs.fill)) === null && (await A(() => document.querySelector('[data-layer="ocean"] [data-group="base"]').getAttribute("fill"))) === null);
  const svBad = await A(async () => { try { await FMG_AGENT.apply("setStyle", { path: "ocean.groups.base.attrs.nope", value: 1 }); return "no error"; } catch (e) { return e.message; } });
  check("setStyle refuses an unknown attribute cleanly", svBad !== "no error" && (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === false, svBad.slice(0, 90));
  const svType = await A(async () => { try { await FMG_AGENT.apply("setStyle", { path: "relief.options.density", value: {} }); return "no error"; } catch (e) { return e.message; } });
  check("setStyle refuses an object value", String(svType).includes("text, a number"), String(svType).slice(0, 90));
  const svMissing = await A(async () => { try { await FMG_AGENT.apply("setStyle", { path: "relief.options.density" }); return "no error"; } catch (e) { return e.message; } });
  check("setStyle without a value is refused with the null hint", String(svMissing).includes("null unsets"), String(svMissing).slice(0, 90));

  // updateBurg: the published editBurg under the plan's name, with map_list attributes
  const target = await A(() => pack.burgs.find(x => x.i && !x.removed && !x.capital && !x.walls && !pack.markets?.some(m => m.centerBurgId === x.i))?.i);
  const ub = await A(([id]) => FMG_AGENT.apply("updateBurg", { burg: id, population: 9000, walls: true }), [target]);
  const row = (await A(() => FMG_AGENT.list("burgs", undefined, 1000))).rows.find(r => r.id === target);
  check("updateBurg sets population and architecture", ub.ok && ub.changed === 2 && Math.abs(row.population - 9000) <= 5 && row.walls === true && typeof row.citadel === "boolean" && typeof row.port === "boolean", JSON.stringify({ details: ub.details, row }));
  check("map_list burgs carries the architecture attributes", ["temple", "plaza", "shanty", "type", "group"].every(k => k in row), JSON.stringify(row));

  // mergeStates accepts the plan's asProvinces spelling; both spellings together are refused
  const sums = await A(() => FMG_AGENT.summary());
  const big = sums.states.filter(s => s.cells >= 60);
  const pair = big.flatMap(a => a.neighbours.map(n => big.find(s => s.id === n)).filter(Boolean).map(b => [a, b])).sort((p, q) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0] ?? [];
  const [into, away] = pair;
  check("found neighbouring states for the alias merge", Boolean(into && away), `${into?.id} ${away?.id}`);
  const aliasMerge = await A(([a, b]) => FMG_AGENT.apply("mergeStates", { states: [a], into: b, asProvinces: true }), [away.id, into.id]);
  check("mergeStates asProvinces: true keeps the merged state as a province", aliasMerge.ok && aliasMerge.details.keptAsProvinces === true, JSON.stringify(aliasMerge.details));
  const both = await A(async ([a, b]) => { try { await FMG_AGENT.apply("mergeStates", { states: [a], into: b, asProvinces: true, as_provinces: true }); return "no error"; } catch (e) { return e.message; } }, [away.id, into.id]);
  check("asProvinces and as_provinces together are refused", both.includes("not both"), both.slice(0, 80));

  // routes: create, edit, split, join back, with the shared redraw table
  const pts = await A(() => {
    const cells = pack.cells.i.filter(i => pack.cells.h[i] >= 20 && !pack.cells.burg[i]);
    return [0, 40, 80, 120, 160].map(n => pack.cells.p[cells[n]]);
  });
  const rt = await A(([p]) => FMG_AGENT.apply("addRoute", { path: p, group: "trails", name: "S-026c Trail" }), [pts]);
  const rid = rt.details.route;
  const ur = await A(([id]) => FMG_AGENT.apply("updateRoute", { route: id, name: "Renamed Trail", locked: true }), [rid]);
  const edited = await A(([id]) => { const r = pack.routes.find(x => x.i === id); return { name: r.name, lock: r.lock }; }, [rid]);
  check("updateRoute renames and locks", ur.ok && ur.changed === 2 && edited.name === "Renamed Trail" && edited.lock === true, JSON.stringify({ details: ur.details, edited }));
  const noChange = await A(async ([id]) => { try { await FMG_AGENT.apply("updateRoute", { route: id }); return "no error"; } catch (e) { return e.message; } }, [rid]);
  check("updateRoute without a field is refused", noChange.includes("at least one"), noChange.slice(0, 80));
  const sp = await A(([id]) => FMG_AGENT.apply("splitRoute", { route: id, point: 2 }), [rid]);
  const halves = await A(([a, b]) => [pack.routes.find(x => x.i === a)?.points.length, pack.routes.find(x => x.i === b)?.points.length], [rid, sp.details.newRoute]);
  check("splitRoute cuts at the inner point", sp.ok && Number.isInteger(sp.details.newRoute) && halves[0] === 3 && halves[1] === 3, JSON.stringify({ details: sp.details, halves }));
  const edge = await A(async ([id]) => { try { await FMG_AGENT.apply("splitRoute", { route: id, point: 0 }); return "no error"; } catch (e) { return e.message; } }, [rid]);
  check("splitRoute refuses an endpoint", edge.includes("inner point"), edge.slice(0, 80));
  const jr = await A(([a, b]) => FMG_AGENT.apply("joinRoutes", { route: a, other: b }), [rid, sp.details.newRoute]);
  const rejoined = await A(([id, gone]) => ({ points: pack.routes.find(x => x.i === id)?.points.length, otherStays: pack.routes.some(x => x.i === gone) }), [rid, sp.details.newRoute]);
  check("joinRoutes rejoins the two halves", jr.ok && rejoined.points === 5 && !rejoined.otherStays, JSON.stringify({ details: jr.details, rejoined }));
  const selfJoin = await A(async ([id]) => { try { await FMG_AGENT.apply("joinRoutes", { route: id, other: id }); return "no error"; } catch (e) { return e.message; } }, [rid]);
  check("joinRoutes refuses joining a route to itself", selfJoin.includes("itself"), selfJoin.slice(0, 80));
  const road = await A(([p]) => FMG_AGENT.apply("addRoute", { path: p, group: "roads", name: "S-026c Road" }), [[pts[0], pts[4]]]);
  const cross = await A(async ([a, b]) => { try { await FMG_AGENT.apply("joinRoutes", { route: a, other: b }); return "no error"; } catch (e) { return e.message; } }, [rid, road.details.route]);
  check("joinRoutes refuses different groups", cross.includes("different groups"), cross.slice(0, 80));
  const lone = await A(() => {
    const cells = pack.cells.i.filter(i => pack.cells.h[i] >= 20 && !pack.cells.burg[i]);
    return FMG_AGENT.apply("addRoute", { path: [pack.cells.p[cells[200]], pack.cells.p[cells[220]]], group: "trails", name: "S-026c Lone" });
  });
  const none = await A(async ([a, b]) => { try { await FMG_AGENT.apply("joinRoutes", { route: a, other: b }); return "no error"; } catch (e) { return e.message; } }, [rid, lone.details.route]);
  check("joinRoutes refuses routes that share no endpoint", none.includes("no endpoint"), none.slice(0, 80));

  // rivers: edit name, type, width and parent; a compound failure is flagged for the server to restore
  const rivers = await A(() => FMG_AGENT.list("rivers", undefined, 1000).rows);
  const main = rivers.find(r => r.parent === r.id) ?? rivers[0];
  const uw = await A(([id]) => FMG_AGENT.apply("updateRiver", { river: id, name: "Test Flow", type: "Creek", sourceWidth: 2.5, widthFactor: 1.1 }), [main.id]);
  const listedRiver = (await A(() => FMG_AGENT.list("rivers", undefined, 1000))).rows.find(r => r.id === main.id);
  check("updateRiver changes name, type and width", uw.ok && uw.changed === 4 && listedRiver.name === "Test Flow" && listedRiver.type === "Creek", JSON.stringify({ details: uw.details, listedRiver }));
  const tributary = rivers.find(r => r.parent && r.parent !== r.id);
  if (tributary) {
    const cycle = await A(async ([p, t]) => { try { await FMG_AGENT.apply("updateRiver", { river: p, name: "Bad Compound", parent: t }); return "no error"; } catch (e) { return e.message; } }, [tributary.parent, tributary.id]);
    check("updateRiver refuses a parent that flows into it", cycle.includes("mainstem"), cycle.slice(0, 90));
    check("the failed compound edit is flagged dirty for the server to restore", (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === true);
  } else check("updateRiver cycle check (no tributary on this map to probe)", true);
  const mainstem = await A(([id]) => FMG_AGENT.apply("updateRiver", { river: id, parent: id }), [main.id]);
  check("updateRiver parent = own id makes it a mainstem", mainstem.ok && (await A(([id]) => pack.rivers.find(r => r.i === id).parent === id, [main.id])), JSON.stringify(mainstem.details));
  const noRiver = await A(async () => { try { await FMG_AGENT.apply("updateRiver", { river: 9999, name: "Ghost" }); return "no error"; } catch (e) { return e.message; } });
  check("updateRiver refuses an unknown river cleanly", noRiver.includes("does not exist") && (await A(() => FMG_AGENT.lastFailureLeftMapDirty())) === false, noRiver.slice(0, 80));

  // undoability: reloading the snapshot undoes the whole block, styles included
  await A(t => FMG_AGENT.importMap(t), snap);
  const end = await A(() => ({ preset: options.map.style.preset, fill: styles.ocean.groups.base.attrs.fill, routes: pack.routes.length, rivers: pack.rivers.length, trail: pack.routes.some(r => r.name === "Renamed Trail"), flow: pack.rivers.some(r => r.name === "Test Flow") }));
  check("reload undoes styles, burg, routes and rivers", end.preset === "default" && end.fill === oceanFill0 && !end.trail && !end.flow && end.routes === net0.routes && end.rivers === net0.rivers, JSON.stringify({ end, net0 }));
}


// ---- TASK-09: regional vector loupe, non-destructive atlas, resample + snapshot undo/rollback
{
  const inset = { x0: 400, y0: 180, x1: 720, y1: 420, title: "Regional atlas <not HTML>" };
  const snap = await A(() => FMG_AGENT.exportMap());
  const probe = () => A(() => JSON.stringify({ camera: FMG_AGENT.camera(), layers: FMG_AGENT.layers().active,
    geography: options.map.geography, units: options.map.units, h: Array.from(pack.cells.h),
    states: pack.states, burgs: pack.burgs, routes: pack.routes, rivers: pack.rivers }));
  const before = await probe();
  const pic = await A(i => FMG_AGENT.renderInset({ inset: i, width: 1280, height: 720 }), inset);
  check("TASK-09 atlas is PNG at requested dimensions", pic.mimeType === "image/png" && pic.width === 1280 && pic.height === 720 && Buffer.from(pic.data, "base64").subarray(1, 4).toString() === "PNG");
  check("TASK-09 loupe keeps exact aspect ratio", Math.abs(pic.cartouche.width / pic.cartouche.height - 4 / 3) < 1e-10);
  check("TASK-09 atlas leaves camera, layers and map data intact", await probe() === before);
  const plain = await A(() => FMG_AGENT.renderRegionLoupe({ x0: 0, y0: 0, x1: 1280, y1: 720 }, 1280, 720));
  check("TASK-09 cartouche changes the output pixels", plain.split(",")[1] !== pic.data);
  for (const bad of [{ ...inset, x1: 9999 }, { ...inset, x1: 400 }, { ...inset, x0: NaN }, { ...inset, cover: 1 }]) {
    const refused = await A(async i => { try { await FMG_AGENT.renderInset({ inset: i, width: 1280, height: 720 }); return false; } catch { return true; } }, bad);
    check("TASK-09 invalid inset rejected", refused);
  }
  const noConfirm = await A(async i => { try { await FMG_AGENT.apply("createSubmap", i); return false; } catch { return !FMG_AGENT.lastFailureLeftMapDirty(); } }, { x0: 400, y0: 180, x1: 720, y1: 420 });
  check("TASK-09 resampling requires explicit confirmation before mutation", noConfirm && await probe() === before);
  const args = { x0: 320, y0: 180, x1: 960, y1: 540, confirmDestructiveResample: true };
  const child = await A(p => FMG_AGENT.apply("createSubmap", p), args);
  check("TASK-09 native resampling runs", child.ok && child.details.scale === 2 && await probe() !== before);
  await A(t => FMG_AGENT.importMap(t), snap);
  // import resets the camera as usual: compare the persisted geography and entities, not camera framing.
  const restored = JSON.parse(await probe());
  const original = JSON.parse(before);
  delete restored.camera; delete original.camera;
  check("TASK-09 snapshot undo restores exact parent geography and entities", JSON.stringify(restored) === JSON.stringify(original));
  await A(() => { window.__task09Generate = Grid.generate; Grid.generate = () => { throw new Error("TASK-09 resample crash"); }; });
  const failed = await A(async p => { try { await FMG_AGENT.apply("createSubmap", p); return "no error"; } catch (e) { return `${e.message}:${FMG_AGENT.lastFailureLeftMapDirty()}`; } }, args);
  check("TASK-09 partial resample failure is marked dirty for rollback", failed.includes("TASK-09 resample crash:true"));
  await A(() => { Grid.generate = window.__task09Generate; delete window.__task09Generate; });
  await A(t => FMG_AGENT.importMap(t), snap);
  const rolled = JSON.parse(await probe()); delete rolled.camera;
  check("TASK-09 rollback snapshot restores parent after partial failure", JSON.stringify(rolled) === JSON.stringify(original));
  const download = await session.captureDownload(() => session.call("exportPicture", { format: "png", resolution: 1, inset }), "smoke-atlas");
  check("TASK-09 native bridge exportPicture downloads atlas", download.bytes > 1000);
}

// ---- TASK-10: native contour/hachure paths, partial styles, snapshot undo and rollback
{
  const snap = await A(() => FMG_AGENT.exportMap());
  const before = await A(() => JSON.stringify({ styles, h: Array.from(grid.cells.h), states: pack.states }));
  const preset = await A(() => FMG_AGENT.setLayers({ preset: "topographic" }));
  const expected = ["heightmap", "rivers", "relief", "routes", "burgIcons", "labels", "scaleBar"];
  check("TASK-10 topographic preset has the seven real layer ids", expected.every(id => preset.active.includes(id)) && preset.active.filter(id => preset.available.includes(id)).length === 7);
  const topo = await A(() => FMG_AGENT.apply("setTopography", { scheme: "natural", contours: true, contourInterval: 8, hachures: true, isolineFills: true }));
  const paths = await A(() => ({ contours: document.querySelectorAll("#terrs .heightmap-contours path[d]").length, hachures: document.querySelectorAll("#terrs .heightmap-hachures path[d]").length, fills: document.querySelectorAll("#landHeights > path[data-height]").length }));
  check("TASK-10 native contour, hachure and fill paths are drawn", topo.ok && paths.contours > 0 && paths.hachures > 0 && paths.fills > 0, JSON.stringify(paths));
  const preserved = await A(() => JSON.stringify({ opacity: styles.heightmap.groups.landHeights.attrs, ocean: styles.heightmap.groups.oceanHeights, relief: styles.relief, h: Array.from(grid.cells.h), states: pack.states }));
  await A(() => FMG_AGENT.apply("setTopography", { isolineFills: false, terracing: 5 }));
  check("TASK-10 line-only mode removes colored land fills", await A(() => !document.querySelector("#landHeights > path[data-height]") && styles.heightmap.groups.landHeights.options.contours.mode === "only"));
  check("TASK-10 partial style update preserves unrelated options and terrain", preserved === await A(() => JSON.stringify({ opacity: styles.heightmap.groups.landHeights.attrs, ocean: styles.heightmap.groups.oceanHeights, relief: styles.relief, h: Array.from(grid.cells.h), states: pack.states })));
  const current = await A(() => JSON.stringify(styles.heightmap));
  for (const bad of [{}, { contours: false, hachures: false, isolineFills: false }, { contourInterval: 1 }, { scheme: "earth" }, { scheme: "natural", contourInterval: 21 }]) {
    const refused = await A(async p => { try { await FMG_AGENT.apply("setTopography", p); return false; } catch { return !FMG_AGENT.lastFailureLeftMapDirty(); } }, bad);
    check("TASK-10 invalid topography is refused atomically", refused && await A(() => JSON.stringify(styles.heightmap)) === current);
  }
  const land0 = await A(() => JSON.stringify(styles.heightmap.groups.landHeights));
  await A(() => FMG_AGENT.apply("setTopography", { target: "ocean", scheme: "light", contours: true, contourInterval: 4 }));
  check("TASK-10 ocean target enables ocean rendering without changing land", await A(() => styles.heightmap.groups.oceanHeights.options.render && styles.heightmap.groups.oceanHeights.options.contours.interval === 4 && !!document.querySelector("#oceanHeights .heightmap-contours path")) && land0 === await A(() => JSON.stringify(styles.heightmap.groups.landHeights)));
  await A(() => { window.__task10Draw = Layers.draw; Layers.draw = function () { Layers.draw = window.__task10Draw; delete window.__task10Draw; throw new Error("TASK-10 draw crash"); }; });
  const failure = await A(async () => { try { await FMG_AGENT.apply("setTopography", { scheme: "olive" }); return false; } catch { return FMG_AGENT.lastFailureLeftMapDirty(); } });
  check("TASK-10 post-mutation render failure is marked dirty", failure);
  await A(t => FMG_AGENT.importMap(t), snap);
  check("TASK-10 snapshot rollback restores exact styles, terrain and states", before === await A(() => JSON.stringify({ styles, h: Array.from(grid.cells.h), states: pack.states })));
}

// ---- public bridge capabilities: text map, action menu, interface and pinned settings
{
  const drawn = await A(() => FMG_AGENT.textMap({ cols: 32, rows: 12 }));
  check("text map has requested dimensions and a state key", drawn.rows.length === 12 && drawn.rows.every(row => row.length === 32) && Object.keys(drawn.key).length > 0);
  const actions = await A(() => FMG_AGENT.menuList({ query: "regenerateBurgs" }));
  check("Azgaar's action menu lists regenerators", actions.commands.some(cmd => cmd.id === "regenerateBurgs"));
  const forbidden = await A(async () => { try { await FMG_AGENT.menuRun({ id: "newMap" }); return "allowed"; } catch (e) { return e.message; } });
  check("menu refuses replacing a map outside map_file", forbidden.includes("map_file new"));
  const controls = await A(() => FMG_AGENT.uiList({ scope: "page", query: "points", hidden: true }));
  check("interface controls can be found without opening a dialog", controls.total > 0 && controls.controls.length > 0);
  const settings = await A(() => FMG_AGENT.getSettings({ section: "generation" }));
  check("generation settings include valid choices", settings.generation.states.limit > 0 && settings.choices.templates.length > 3);
  const refused = await A(() => { try { FMG_AGENT.setSettings({ values: { states: { limit: -1 } } }); return "allowed"; } catch (e) { return e.message; } });
  check("invalid generation settings do not change the map", refused.includes("nothing changed"));
  const choices = await A(() => FMG_AGENT.layers());
  check("native layer presets are discoverable", choices.presets.includes("political") && choices.presets.includes("physical"));
}

{
  // map_ui by text: a guess between equally good candidates must be reported, a clear match must stay silent.
  await A(() => {
    const box = document.createElement("div");
    box.id = "smokeUiFixture";
    window.__smokeClicked = [];
    for (const text of ["Zzriver width", "Zzriver length", "Zztwin", "Zztwin", "Zzunique control"]) {
      const b = document.createElement("button");
      b.textContent = text;
      b.style.cssText = "display:block;width:120px;height:20px";
      b.addEventListener("click", () => window.__smokeClicked.push(text));
      box.appendChild(b);
    }
    document.body.appendChild(box);
  });
  const partial = await A(() => FMG_AGENT.uiClick({ text: "zzriver", scope: "page" }));
  check("map_ui text: a partial match shared by two controls is reported", partial.alsoMatched?.length === 1 && partial.alsoMatched[0].label === "Zzriver length" && /zzriver/.test(partial.warning ?? ""), JSON.stringify(partial.alsoMatched));
  const twin = await A(() => FMG_AGENT.uiClick({ text: "Zztwin", scope: "page" }));
  check("map_ui text: two identical controls are reported", twin.alsoMatched?.length === 1 && twin.clicked.label === "Zztwin");
  const clear = await A(() => FMG_AGENT.uiClick({ text: "zzunique", scope: "page" }));
  check("map_ui text: a clear match stays silent", clear.alsoMatched === undefined && clear.warning === undefined);
  const clicked = await A(() => window.__smokeClicked);
  check("map_ui text: the same control as before is still the one clicked", clicked.join("|") === "Zzriver width|Zztwin|Zzunique control", clicked.join("|"));
  await A(() => document.getElementById("smokeUiFixture")?.remove());
}

check("no JavaScript errors in the page", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);

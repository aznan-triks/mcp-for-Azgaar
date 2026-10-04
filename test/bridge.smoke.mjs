// End-to-end check of the in-page bridge (FMG_AGENT) on a fixed seed. No real user map is ever touched.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../server/config.ts";
import { MapSession } from "../server/browser.ts";
import { startStaticServer } from "../server/static.ts";

const cfg = loadConfig();
const work = join(dirname(fileURLToPath(import.meta.url)), "..", ".test-tmp");
cfg.browser.headless = true;
cfg.profileDir = join(work, `profile-${process.pid}`);
cfg.map.seed = "333";
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

// ---- queries
const sum = await A(() => FMG_AGENT.summary());
check("summary lists states", sum.states.length > 5, `states=${sum.states.length}`);
const bigStates = sum.states.filter(s => s.cells >= 60);
const neighbourPairs = bigStates.flatMap(a => a.neighbours.map(n => bigStates.find(s => s.id === n)).filter(Boolean).map(b => [a, b]));
// Two big neighbouring states, whatever the seed: the largest "smaller side" wins.
const [gazd, khuzd] = neighbourPairs.sort((p, q) => Math.min(q[0].cells, q[1].cells) - Math.min(p[0].cells, p[1].cells))[0] ?? [];
check("found two big neighbouring states", Boolean(gazd && khuzd), `${gazd?.id} ${khuzd?.id}`);
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
  }, [scale, gazd.capital.cell]);
  const inView = r.px >= 0 && r.py >= 0 && r.px <= 1280 && r.py <= 720;
  check(`pixel->cell round trip at zoom ${scale}`, inView && r.got === r.want && r.offOk, `want ${r.want} got ${r.got} px=(${Math.round(r.px)},${Math.round(r.py)}) inView=${inView}`);
}
await A(() => FMG_AGENT.setCamera({ scale: 1, duration: 0 }));

// ---- selection + assignState (extend Gazd into Khuzd by 3 layers)
const sel = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 3 }, {}), [khuzd.id, gazd.id]);
check("border selection non-empty", sel.count > 20, `count=${sel.count}`);
const overlayThere = await A(() => Boolean(document.getElementById("fmgAgentOverlay")?.querySelector("path")));
check("selection preview drawn", overlayThere);
const inSavedSvg = await A(() => Boolean(document.getElementById("map").querySelector("#fmgAgentOverlay")));
check("overlay is outside #map (never saved in .map)", !inSavedSvg);

const res = await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [sel.id, gazd.id]);
check("assignState ok", res.ok && res.changed > 0, JSON.stringify({ changed: res.changed, skipped: res.skipped }));
const after = await A(() => FMG_AGENT.summary());
const gazdAfter = after.states.find(s => s.id === gazd.id).cells; const khuzdAfter = after.states.find(s => s.id === khuzd.id).cells;
check("Gazd gained exactly what Khuzd lost", gazdAfter - gazd.cells === khuzd.cells - khuzdAfter && gazdAfter - gazd.cells === res.changed, `Gazd ${gazd.cells}->${gazdAfter}, Khuzd ${khuzd.cells}->${khuzdAfter}, moved ${res.changed}`);
check("state cells + unclaimed = land cells (after)", (await stateCellSum()) === sumCellsLand);
check("counters not stale (summary == array count)", await A(([id]) => pack.cells.i.filter(c => pack.cells.state[c] === id).length === pack.states[id].cells, [gazd.id]));
check("overlay preview cleared after apply", await A(() => !document.getElementById("fmgAgentOverlay").querySelector("path")));
check("neighbours include each other", await A(([a, b]) => pack.states[a].neighbors.includes(b), [gazd.id, khuzd.id]));

// capital cells are protected
const cap = await A(([id]) => pack.states[id].center, [khuzd.id]);
const selCap = await A(([c]) => FMG_AGENT.select("cells", { cells: [c] }, {}), [cap]);
const resCap = await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [selCap.id, gazd.id]);
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
const capBurg = await A(([id]) => pack.states[id].capital, [gazd.id]);
const rmCap = await A(async ([id]) => { try { await FMG_AGENT.apply("removeBurg", { burg: id }); return "no error"; } catch (e) { return e.message; } }, [capBurg]);
check("capital removal is refused", rmCap.includes("capital"), rmCap);

// ---- rename / validation
const rn = await A(([id]) => FMG_AGENT.apply("rename", { kind: "state", id, name: "Zorgland", full_name: "Empire of Zorgland" }), [gazd.id]);
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
const sel2 = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 4 }, {}), [gazd.id, khuzd.id]);
await A(([id, to]) => FMG_AGENT.apply("assignState", { selection: id, state: to }), [sel2.id, khuzd.id]);
check("second change really changed politics", (await hashPolitics()) !== hBefore);
await A(t => FMG_AGENT.importMap(t), snap);
const hRestored = await hashPolitics();
check("restore returns politics exactly (states, provinces, burgs, names)", hRestored === hBefore, `${Date.now() - t0} ms for export+change+restore`);
check("bridge survives a map reload", await A(() => FMG_AGENT.isReady() && typeof FMG_AGENT.summary().cells === "number"));

// ---- selections survive an undo-style reload (kept by position), but not a plain load
const selKeep = await A(([from, to]) => FMG_AGENT.select("border", { from, to, depth: 3 }, {}), [gazd.id, khuzd.id]);
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

  // routes
  const land = await A(([probe]) => { const a = pack.cells.i.filter(i => pack.cells.h[i] >= 20 && pack.cells.state[i] === pack.cells.state[probe]); return [pack.cells.p[a[0]], pack.cells.p[a[10]], pack.cells.p[a[20]]]; }, [gazd.capital.cell]);
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
  const g = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === gazd.id); // renamed earlier in this test, so match by id
  const r1 = await A(([id]) => FMG_AGENT.select("ring", { state: id, depth: 1 }, {}), [g.id]);
  const r3 = await A(([id]) => FMG_AGENT.select("ring", { state: id, depth: 3 }, {}), [g.id]);
  const check1 = await A(([id]) => {
    const inGazd = c => pack.cells.state[c] === id;
    const cells = Array.from(pack.cells.i).filter(c => pack.cells.h[c] >= 20 && !inGazd(c) && pack.cells.c[c].some(inGazd));
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
  const g = (await A(() => FMG_AGENT.summary())).states.find(x => x.id === gazd.id);
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
  const into = base.states.find(x => x.id === gazd.id);
  const away = base.states.find(x => x.id === khuzd.id);
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
  const id = gazd.id;
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

check("no JavaScript errors in the page", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);

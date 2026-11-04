// Same behavioral contract exercised through the browser bridge and through the real MCP transport.
import assert from "node:assert/strict";

type Data = Record<string, any>;
export interface DiplomacyMilitaryHarness {
  apply: (command: string, params: Data) => Promise<Data>;
  list: (kind: string, state?: number) => Promise<Data>;
  commands: () => Promise<string[]>;
  probe: () => Promise<Data>;
  snapshot: () => Promise<string>;
  undo: (snapshot: string) => Promise<void>;
  reject: (command: string, params: Data) => Promise<void>;
  passed: (label: string) => void;
}

export const militaryProbe = `(() => {
  const inland = pack.cells.i.find(c => pack.cells.h[c] >= 20 && pack.cells.c[c].every(n => pack.cells.h[n] >= 20));
  const water = pack.cells.i.find(c => pack.cells.h[c] < 20);
  const states = pack.states.filter(s => s.i && !s.removed);
  return { states: states.map(s => s.i), land: pack.cells.p[inland], water: pack.cells.p[water],
    unit: options.map.military.units.find(u => u.type !== "naval").name };
})()`;

export async function diplomacyMilitaryScenario(h: DiplomacyMilitaryHarness): Promise<void> {
  const probe = await h.probe();
  const [s, t] = probe.states;
  const [x, y] = probe.land;
  const troops = { [probe.unit]: 20 };
  const names = ["setDiplomacy", "resetDiplomacy", "addChronicleEvent", "clearChronicle", "addRegiment",
    "updateRegiment", "moveRegiment", "splitRegiment", "attachRegiment", "removeRegiment", "regenerateMilitary"];
  const catalog = await h.commands();
  for (const name of names) assert.ok(catalog.includes(name), `${name} is discoverable`);
  h.passed("all 11 commands are discoverable");
  const first = (await h.apply("addRegiment", { stateId: s, x, y, units: troops, name: "Scenario source" })).details;
  const target = (await h.apply("addRegiment", { state: t, x, y, units: troops, name: "Scenario target" })).details;
  const read = async () => ({ diplomacy: await h.list("diplomacy"), military: await h.list("military") });
  const find = async (id: number) => (await h.list("military")).rows.find((r: Data) => r.id === id);
  const reversible = async (name: string, params: Data, verify: (result: Data) => Promise<void>) => {
    const before = await read();
    const snap = await h.snapshot();
    const result = await h.apply(name, params);
    assert.equal(result.ok, true);
    await verify(result);
    await h.undo(snap);
    assert.deepEqual(await read(), before, `${name}: undo restores relations, chronicle, regiments and composition exactly`);
    h.passed(`${name}: mutation and undo`);
  };
  for (const status of ["Vassal", "Suzerain", "Ally"]) {
    await reversible("setDiplomacy", { stateId: s, targetStateId: t, status }, async () => {
      const rows = (await h.list("diplomacy")).rows;
      assert.equal(rows.find((r: Data) => r.id === s).relations[t], status);
      assert.equal(rows.find((r: Data) => r.id === t).relations[s], { Vassal: "Suzerain", Suzerain: "Vassal", Ally: "Ally" }[status]);
      assert.ok((await h.list("diplomacy")).chronicle.length > 0);
    });
  }
  await reversible("resetDiplomacy", {}, async () => {
    const rows = (await h.list("diplomacy")).rows;
    for (const a of rows) for (const b of rows) {
      if (a.id === b.id) continue;
      const relation = a.relations[b.id];
      assert.equal(b.relations[a.id], relation === "Vassal" ? "Suzerain" : relation === "Suzerain" ? "Vassal" : relation);
    }
  });
  await reversible("addChronicleEvent", { title: "Scenario event", text: "First paragraph\nSecond paragraph" }, async () => {
    assert.deepEqual((await h.list("diplomacy")).chronicle.at(-1), ["Scenario event", "First paragraph", "Second paragraph"]);
  });
  await reversible("clearChronicle", {}, async () => assert.deepEqual((await h.list("diplomacy")).chronicle, []));
  await reversible("addRegiment", { stateId: s, x, y, naval: true, units: troops }, async r => {
    assert.ok(r.warnings.some((w: string) => w.includes("inland")));
    const added = await find(r.details.id);
    assert.equal(added.naval, true);
    assert.equal(added.id, s * 10000 + added.regimentId);
    assert.deepEqual(added.units, troops);
    assert.equal(added.total, 20);
  });
  await reversible("addRegiment", { stateId: s, x: probe.water[0], y: probe.water[1] }, async r => {
    assert.equal((await find(r.details.id)).naval, true);
    assert.deepEqual(r.warnings, []);
  });
  await reversible("updateRegiment", { stateId: s, regimentId: first.regimentId, units: { [probe.unit]: 42 }, name: "Renamed", naval: true }, async r => {
    const updated = await find(first.id);
    assert.equal(updated.name, "Renamed");
    assert.equal(updated.total, 42);
    assert.equal(updated.naval, true);
    assert.ok(r.warnings.length);
  });
  await reversible("moveRegiment", { id: first.id, x: probe.water[0], y: probe.water[1] }, async () => {
    const moved = await find(first.id);
    assert.equal(moved.x, Math.round(probe.water[0] * 100) / 100);
    assert.equal(moved.y, Math.round(probe.water[1] * 100) / 100);
    assert.equal(moved.bx, x);
    assert.equal(moved.by, y);
  });
  await reversible("setDiplomacy", { state: s, to: t, relation: "Vassal" }, async () => {
    assert.equal((await h.list("diplomacy")).rows.find((r: Data) => r.id === t).relations[s], "Suzerain");
  });
  await reversible("moveRegiment", { state: s, regiment: first.regimentId, rebase: true, x: probe.water[0], y: probe.water[1] }, async () => {
    const moved = await find(first.id);
    assert.equal(moved.bx, moved.x);
    assert.equal(moved.by, moved.y);
    const spatial = await h.list("military", s);
    assert.ok(spatial.rows.some((row: Data) => row.id === first.id));
  });
  await reversible("splitRegiment", { id: first.id }, async r => {
    assert.equal((await find(first.id)).total, 10);
    assert.equal((await find(r.details.id)).total, 10);
  });
  await reversible("attachRegiment", { id: first.id, targetId: target.id }, async () => {
    assert.equal(await find(first.id), undefined);
    assert.equal((await find(target.id)).total, 40);
  });
  await reversible("removeRegiment", { stateId: s, regimentId: first.regimentId }, async () => assert.equal(await find(first.id), undefined));
  await reversible("regenerateMilitary", {}, async () => {
    const rows = (await h.list("military")).rows;
    assert.ok(rows.length);
    assert.ok(rows.every((r: Data) => r.id === r.stateId * 10000 + r.regimentId));
    assert.ok(!rows.some((r: Data) => r.name === "Scenario source"));
  });
  const filtered = await h.list("military", s);
  assert.ok(filtered.rows.length && filtered.rows.every((r: Data) => r.stateId === s));
  assert.equal((await h.list("diplomacy", s)).rows.length, 1);
  const stable = await read();
  for (const [name, params] of [
    ["setDiplomacy", { stateId: s, targetStateId: s, status: "Vassal" }],
    ["setDiplomacy", { stateId: s, state: s, to: t, relation: "Vassal" }],
    ["setDiplomacy", { stateId: s, targetStateId: t, status: "Invalid" }],
    ["addRegiment", { stateId: s, x, y, units: { [probe.unit]: -1 } }],
    ["updateRegiment", { id: first.id, stateId: s, regimentId: first.regimentId, name: "Ambiguous" }],
    ["updateRegiment", { id: first.id, units: { nonexistent_unit: 1 } }],
    ["updateRegiment", { id: first.id, units: { [probe.unit]: 1.5 } }],
    ["moveRegiment", { id: first.id, x: -1, y: -1 }],
    ["splitRegiment", { stateId: s, regimentId: 9999 }],
    ["attachRegiment", { id: first.id, targetId: first.id }],
    ["removeRegiment", { stateId: s }]
  ] as [string, Data][]) {
    await h.reject(name, params);
    assert.deepEqual(await read(), stable, `${name}: invalid input leaves no partial mutation`);
  }
  // Known-valid units followed by an invalid name must also roll back the whole compound edit.
  await h.reject("updateRegiment", { id: first.id, units: troops, name: "   " });
  assert.deepEqual(await read(), stable);
  h.passed("state filters, invalid addresses, invalid composition and failed compound edit rollback");
}

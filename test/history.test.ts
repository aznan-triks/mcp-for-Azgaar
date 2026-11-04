import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { Autosave } from "../server/autosave.ts";
import { History, withoutSaveDate } from "../server/history.ts";
import type { MapSession } from "../server/browser.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-history-"));
after(() => rmSync(work, { recursive: true, force: true }));

/** The smallest stand-in for the browser session: a map held in memory. */
function fakeSession(initial: string) {
  const state = { text: initial };
  const session = {
    call: async (name: string, ...args: unknown[]) => {
      if (name === "exportMap") return state.text;
      if (name === "importMap") state.text = args[0] as string;
      return undefined;
    }
  } as unknown as MapSession;
  return { state, session };
}

const header = (date: string) => `1.99|File can be loaded in a generator|${date}|seed|1920|1080\r\nsettings and cells`;

describe("undo history ignores the day a map was saved", () => {
  it("withoutSaveDate blanks only the date field of the first line", () => {
    assert.equal(withoutSaveDate(header("2026-10-31")), withoutSaveDate(header("2026-11-1")));
    assert.notEqual(withoutSaveDate(header("2026-10-31")), withoutSaveDate(header("2026-10-31").replace("seed", "other")));
    assert.equal(withoutSaveDate("no header line"), "no header line");
  });

  it("an action that changed nothing is recognised even when the clock moved to the next day", async () => {
    const { state, session } = fakeSession(header("2026-10-31"));
    const history = new History(join(work, "a", "history"), 30, session);
    await history.pushBefore("open a dialog");
    state.text = header("2026-11-1"); // same map, exported after midnight
    assert.equal(await history.lastSnapshotMatchesCurrent(), true);
    state.text = header("2026-11-1").replace("settings", "edited settings");
    assert.equal(await history.lastSnapshotMatchesCurrent(), false);
  });
});

describe("rescue checkpoints", () => {
  it("keeps the two previous ones instead of overwriting them", async () => {
    const { state, session } = fakeSession("one");
    const history = new History(join(work, "b", "history"), 30, session);
    const maps = join(work, "b");
    const read = (name: string) => readFileSync(join(maps, name), "utf8");
    const rescued: string[] = [];
    for (const text of ["one", "two", "three", "four"]) {
      state.text = text;
      rescued.push(await history.rescue());
    }
    assert.equal(rescued[0], join(maps, "rescue-before-undo.map"));
    assert.equal(read("rescue-before-undo.map"), "four");
    assert.equal(read("rescue-before-undo-1.map"), "three");
    assert.equal(read("rescue-before-undo-2.map"), "two");
    assert.equal(existsSync(join(maps, "rescue-before-undo-3.map")), false);
  });

  it("two undos in a row keep the hand edits that only the first checkpoint holds", async () => {
    const { state, session } = fakeSession("start");
    const history = new History(join(work, "c", "history"), 30, session);
    await history.pushBefore("edit 1");
    state.text = "after edit 1";
    await history.pushBefore("edit 2");
    state.text = "after edit 2 plus hand edits";
    await history.undo();
    await history.undo();
    const found = readdirSync(join(work, "c")).filter(f => f.startsWith("rescue-before-undo")).map(f => readFileSync(join(work, "c", f), "utf8"));
    assert.ok(found.includes("after edit 2 plus hand edits"), `hand edits lost, rescue files hold: ${found.join(" | ")}`);
  });
});

describe("autosave", () => {
  it("writes the map and leaves no temporary file behind", async () => {
    const { session } = fakeSession("map text");
    const file = join(work, "d", "autosave.map");
    const autosave = new Autosave(file, session);
    assert.equal(await autosave.write(), true);
    assert.equal(readFileSync(file, "utf8"), "map text");
    assert.equal(await autosave.write(), false); // nothing changed
    assert.deepEqual(readdirSync(join(work, "d")), ["autosave.map"]);
  });

  it("cleans its temporary file up when the final rename fails", async () => {
    const { session } = fakeSession("map text");
    const dir = join(work, "e");
    const file = join(dir, "autosave.map");
    mkdirSync(join(file, "blocker"), { recursive: true }); // a non-empty folder where the file should go: the rename cannot succeed
    writeFileSync(join(file, "blocker", "x"), "x");
    const autosave = new Autosave(file, session);
    await assert.rejects(() => autosave.write());
    assert.deepEqual(readdirSync(dir), ["autosave.map"]);
  });
});

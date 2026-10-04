// The person can close the tab or the whole window at any time: the next call must reopen it with the last saved map.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { Autosave, restoreOnLaunch } from "../server/autosave.ts";
import { MapSession } from "../server/browser.ts";
import { loadConfig } from "../server/config.ts";
import { startStaticServer } from "../server/static.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-reopen-"));

async function setup(name: string) {
  const cfg = loadConfig();
  cfg.browser.headless = true;
  cfg.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
  cfg.browser.fallbackChannels = [];
  cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
  cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
  cfg.profileDir = join(work, `profile-${name}`);
  cfg.map.seed = "333";
  const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
  const session = new MapSession(cfg, web.url);
  const autosave = new Autosave(join(work, `${name}.map`), session);
  restoreOnLaunch(session, autosave, true, () => undefined);
  await session.ensure();
  await session.call("apply", "rename", { kind: "state", id: 4, name: "Marker", full_name: `Marker ${name}` });
  assert.equal(await autosave.write(), true, "first write saves");
  assert.equal(await autosave.write(), false, "nothing changed: no rewrite");
  const names = async () => (await session.call<{ states: { name: string }[] }>("summary")).states.map(s => s.name);
  return { session, web, names };
}

describe("reopening after the person closed the window", { timeout: 180000 }, () => {
  after(() => rmSync(work, { recursive: true, force: true }));

  it("tab closed (browser still running): reopens with the last map", async () => {
    const { session, web, names } = await setup("tab");
    try {
      const page = await session.ensure();
      await page.close();
      assert.equal(session.isOpen(), false, "the page really is closed");
      assert.ok((await names()).includes("Marker tab"), "the last map came back");
      assert.equal(session.isOpen(), true);
      assert.deepEqual(session.startupWarnings, []);
    } finally {
      await session.close();
      await web.close();
    }
  });

  it("whole browser closed: reopens with the last map", async () => {
    const { session, web, names } = await setup("window");
    try {
      await session["context"]?.close();
      assert.equal(session.isOpen(), false, "the browser really is closed");
      assert.ok((await names()).includes("Marker window"), "the last map came back");
    } finally {
      await session.close();
      await web.close();
    }
  });

  it("a corrupt autosave does not block the start: a new map is generated and the problem is reported", async () => {
    const { session, web } = await setup("corrupt");
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(work, "corrupt.map"), "this is not a map");
      await session["context"]?.close();
      await session.ensure().catch(() => undefined);
      assert.ok(session.isOpen(), "the window opens anyway");
      assert.ok(session.startupWarnings.length > 0, "the failure is reported, not hidden");
      const counts = (await session.call<{ counts: { states: number } }>("summary")).counts;
      assert.ok(counts.states > 0, "a usable map is on screen");
    } finally {
      await session.close();
      await web.close();
    }
  });
});

// Browser selection: fallback between channels, and a useful error when no browser exists.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { MapSession } from "../server/browser.ts";
import { loadConfig } from "../server/config.ts";
import { startStaticServer } from "../server/static.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-chan-"));
const args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);

function config() {
  const cfg = loadConfig();
  cfg.browser.headless = true;
  cfg.browser.executablePath = null;
  cfg.browser.args = args;
  cfg.profileDir = join(work, `profile-${Math.random().toString(36).slice(2)}`);
  cfg.map.seed = "333";
  return cfg;
}

describe("browser channel selection", { timeout: 180000 }, () => {
  after(() => rmSync(work, { recursive: true, force: true }));

  it("falls back to the next channel when the first is not installed", async t => {
    const cfg = config();
    cfg.browser.channel = process.env.FMG_TEST_MISSING_CHANNEL ?? "msedge";
    cfg.browser.fallbackChannels = [process.env.FMG_TEST_CHANNEL ?? "chrome"];
    const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    const session = new MapSession(cfg, web.url);
    try {
      try {
        await session.ensure();
      } catch (err) {
        if (/No browser found/.test(String(err))) return t.skip("neither channel is installed on this machine");
        throw err;
      }
      assert.ok(
        session.usedChannel === cfg.browser.fallbackChannels[0] || session.usedChannel === cfg.browser.channel,
        `used ${session.usedChannel}`
      );
    } finally {
      // Must run on the skip path too: a leaked server handle would keep the test process alive forever.
      await session.close();
      await web.close();
    }
  });

  it("explains what to do when no browser can be found", async () => {
    const cfg = config();
    cfg.browser.channel = "msedge-beta";
    cfg.browser.fallbackChannels = ["chrome-dev"];
    const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    const session = new MapSession(cfg, web.url);
    try {
      await assert.rejects(() => session.ensure(), /No browser found.*Install Google Chrome or Microsoft Edge.*browser\.executablePath/s);
    } finally {
      await session.close();
      await web.close();
    }
  });
});

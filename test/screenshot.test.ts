import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { MapSession } from "../server/browser.ts";
import { loadConfig } from "../server/config.ts";
import { startStaticServer } from "../server/static.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-shot-"));

describe("screenshot size guard", { timeout: 180000 }, () => {
  after(() => rmSync(work, { recursive: true, force: true }));

  async function shoot(maxImageBytes: number) {
    const cfg = loadConfig();
    cfg.browser.headless = true;
    cfg.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
    cfg.browser.fallbackChannels = [];
    cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
    cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
    cfg.profileDir = join(work, `p-${maxImageBytes}`);
    cfg.map.seed = "333";
    cfg.browser.viewport = { width: 1280, height: 720 }; cfg.map.width = 1280; cfg.map.height = 720;
    cfg.view.format = "png";
    cfg.view.maxImageBytes = maxImageBytes;
    const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    const session = new MapSession(cfg, web.url);
    try {
      await session.ensure();
      return await session.screenshot();
    } finally {
      await session.close();
      await web.close();
    }
  }

  it("keeps PNG when it fits", async () => {
    const shot = await shoot(5_000_000);
    assert.equal(shot.mimeType, "image/png");
    assert.equal(shot.data.subarray(1, 4).toString(), "PNG");
  });

  it("falls back to JPEG when PNG is too heavy", async () => {
    const shot = await shoot(20_000);
    assert.equal(shot.mimeType, "image/jpeg");
    assert.equal(shot.data[0], 0xff);
    assert.equal(shot.data[1], 0xd8);
  });

  it("shows no release-notes window or popup on the very first launch", async () => {
    const cfg = loadConfig();
    cfg.browser.headless = true;
    cfg.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
    cfg.browser.fallbackChannels = [];
    cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
    cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
    cfg.profileDir = join(work, "fresh-profile"); // a brand new browser profile, like the person's first run
    cfg.map.seed = "333";
    const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    const session = new MapSession(cfg, web.url);
    try {
      const page = await session.ensure();
      await page.waitForTimeout(8000); // Azgaar opens its notes after 6 s
      const dialogs = await page.locator(".ui-dialog:visible").count();
      assert.equal(dialogs, 0, "no dialog may cover the map");
    } finally {
      await session.close();
      await web.close();
    }
  });
});

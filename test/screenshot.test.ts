import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    cfg.map.seed = "trois";
    cfg.browser.viewport = { width: 1280, height: 720 }; cfg.map.width = 1280; cfg.map.height = 720; // tests do not depend on the user-facing default size

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

  it("filters a supersampled screenshot and Azgaar's native SVG export to exact PNG IHDR sizes", async () => {
    const cfg = loadConfig();
    cfg.browser.headless = true;
    cfg.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
    cfg.browser.fallbackChannels = [];
    cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
    cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
    cfg.profileDir = join(work, "filtered-profile");
    cfg.exportsDir = join(work, "filtered-exports");
    cfg.map.seed = "trois";
    cfg.browser.viewport = { width: 1280, height: 720 };
    cfg.map.width = 1280;
    cfg.map.height = 720;
    const web = await startStaticServer(cfg.azgaarDist, "127.0.0.1", 0);
    const session = new MapSession(cfg, web.url);
    try {
      const page = await session.ensure();
      const captured = await session.captureFiltered(1, "png", cfg.export.jpegQuality, 1280, 720, 2, "lanczos3");
      assert.equal(captured.data.subarray(1, 4).toString(), "PNG");
      assert.equal(captured.data.readUInt32BE(16), 1280);
      assert.equal(captured.data.readUInt32BE(20), 720);
      assert.ok(captured.downsampleMs >= 0);
      const quick = await session.captureFiltered(1, "jpeg", cfg.export.jpegQuality, 1280, 720, 2, "fast");
      assert.equal(quick.data.readUInt16BE(0), 0xffd8, "fast filter also encodes JPEG at the requested size");

      const native = await session.captureDownload(
        () => session.call("exportPicture", { format: "png", resolution: 1, supersample: 2, filter: "lanczos3" }),
        "native-filtered"
      );
      const bitmap = readFileSync(native.file);
      assert.equal(bitmap.subarray(1, 4).toString(), "PNG");
      assert.equal(bitmap.readUInt32BE(16), 1280);
      assert.equal(bitmap.readUInt32BE(20), 720);
      assert.notDeepEqual(bitmap, captured.data, "the native SVG export and a live window capture use distinct sources");
      const nativeJpeg = await session.captureDownload(
        () => session.call("exportPicture", { format: "jpeg", resolution: 1, supersample: 2, filter: "stepdown" }),
        "native-filtered-jpeg"
      );
      assert.equal(readFileSync(nativeJpeg.file).readUInt16BE(0), 0xffd8, "native filtered JPEG also downloads");

      const bench = await page.evaluate(async () => {
        const input = document.createElement("canvas");
        input.width = 3840; input.height = 2160;
        const ctx = input.getContext("2d")!;
        ctx.fillStyle = "#eee"; ctx.fillRect(0, 0, input.width, input.height);
        ctx.fillStyle = "#111";
        for (let x = 0; x < input.width; x += 8) ctx.fillRect(x, 0, 2, input.height);
        const bridge = (window as unknown as {
          FMG_AGENT: {
            downsampleImage: (args: { base64: string; mimeType: "image/png"; width: number; height: number; filter: "lanczos3" }) =>
              Promise<{ downsampleMs: number; width: number; height: number }>;
          };
        }).FMG_AGENT;
        const result = await bridge.downsampleImage({
          base64: input.toDataURL("image/png").split(",")[1], mimeType: "image/png",
          width: 1920, height: 1080, filter: "lanczos3"
        });
        return { ms: result.downsampleMs, width: result.width, height: result.height };
      });
      assert.equal(bench.width, 1920);
      assert.equal(bench.height, 1080);
      assert.ok(bench.ms < 500, `3840x2160 -> 1920x1080 should take <500ms, measured ${bench.ms.toFixed(1)}ms`);
      console.log(`downsample benchmark 3840x2160 -> 1920x1080: ${bench.ms.toFixed(1)}ms`);
    } finally {
      await session.close();
      await web.close();
    }
  });

  it("shows no release-notes window or popup on the very first launch", async () => {
    const cfg = loadConfig();
    cfg.browser.headless = true;
    cfg.browser.channel = process.env.FMG_TEST_CHANNEL ?? null;
    cfg.browser.fallbackChannels = [];
    cfg.browser.executablePath = process.env.FMG_TEST_CHROMIUM ?? null;
    cfg.browser.args = (process.env.FMG_TEST_ARGS ?? "").split(",").filter(Boolean);
    cfg.profileDir = join(work, "fresh-profile"); // a brand new browser profile, like the person's first run
    cfg.map.seed = "trois";
    cfg.browser.viewport = { width: 1280, height: 720 }; cfg.map.width = 1280; cfg.map.height = 720; // tests do not depend on the user-facing default size

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

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const work = mkdtempSync(join(tmpdir(), "fmg-doc-"));
process.env.FMG_PORT = "0";
process.env.FMG_MAPS_DIR = join(work, "maps");
process.env.FMG_PROFILE_DIR = join(work, "profile");
if (process.env.FMG_TEST_CHROMIUM) process.env.FMG_EXECUTABLE_PATH = process.env.FMG_TEST_CHROMIUM;
const { doctor } = await import("../scripts/doctor.mjs");

describe("doctor", { timeout: 120000 }, () => {
  after(() => rmSync(work, { recursive: true, force: true }));
  it("finds nothing to fix on a healthy install", async () => {
    assert.equal(await doctor(), 0);
  });
  it("tells what to do when Azgaar is not built", async () => {
    const real = process.env.FMG_CONFIG;
    const { writeFileSync, readFileSync } = await import("node:fs");
    const cfg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "config", "fmg-mcp.json"), "utf8"));
    cfg.azgaarDist = join(work, "nothing-here");
    const file = join(work, "cfg.json");
    writeFileSync(file, JSON.stringify(cfg));
    process.env.FMG_CONFIG = file;
    const lines = [];
    const log = console.log;
    console.log = (...a) => lines.push(a.join(" "));
    try {
      assert.equal(await doctor(), 1);
    } finally {
      console.log = log;
      if (real === undefined) delete process.env.FMG_CONFIG;
      else process.env.FMG_CONFIG = real;
    }
    assert.match(lines.join("\n"), /Azgaar is not built[\s\S]*npm run setup/);
  });
});

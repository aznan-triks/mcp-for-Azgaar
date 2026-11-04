import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { applyPatches, download, incompatible, knownGood, vendorDir } from "../scripts/azgaar.mjs";

const patchedFiles = [
  "src/main.ts", "src/renderers/view-3d-renderer.ts", "src/renderers/draw-satellite-texture.ts",
  "src/data/view-3d-options.ts", "src/components/options-schema.ts", "src/controllers/view-3d.ts",
  "src/controllers/states-editor.ts", "src/controllers/heightmap-editor.ts",
  "src/controllers/provinces-editor.ts", "src/controllers/cultures-editor.ts",
  "src/controllers/religions-editor.ts", "src/generators/states-generator.ts",
  "src/generators/religions-generator.ts", "src/services/fonts.ts"
];
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");

test("Azgaar overlay is idempotent, pinned and refuses an unknown 3D renderer", async () => {
  const work = mkdtempSync(join(tmpdir(), "fmg-azgaar-pipeline-"));
  try {
    const good = knownGood();
    assert.match(good.ref, /^[a-f0-9]{40}$/);
    assert.match(readFileSync(join(vendorDir, ".upstream-commit"), "utf8").trim(), /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/);
    assert.match(JSON.parse(readFileSync(join(vendorDir, "package.json"), "utf8")).version, /^\d+\.\d+\.\d+$/);
    const fixture = join(work, "fixture");
    for (const path of patchedFiles) {
      const target = join(fixture, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(vendorDir, path), target);
    }
    const first = applyPatches(fixture);
    assert.deepEqual(incompatible(first), []);
    assert.ok(existsSync(join(fixture, "src", "agent", "index.ts")));
    assert.ok(existsSync(join(fixture, "public", "fonts", "macondo.woff2")));
    const before = patchedFiles.map(path => hash(join(fixture, path)));
    const second = applyPatches(fixture);
    assert.ok(second.every(p => p.status === "already"), JSON.stringify(second));
    assert.deepEqual(patchedFiles.map(path => hash(join(fixture, path))), before);

    appendFileSync(join(fixture, "src", "renderers", "view-3d-renderer.ts"), "\n// upstream changed this renderer\n");
    appendFileSync(join(fixture, "src", "components", "options-schema.ts"), "\n// upstream changed this schema\n");
    const drift = applyPatches(fixture);
    assert.ok(incompatible(drift).some(p => p.id.includes("view-3d-renderer.ts") && p.id.includes("upstream changed")), "do not silently discard an upstream renderer change");
    assert.ok(incompatible(drift).some(p => p.id.includes("options-schema.ts") && p.id.includes("upstream changed")), "do not silently discard an upstream schema change");
    await assert.rejects(download("../../invalid", join(work, "bad")), /Invalid Azgaar ref/);
    assert.ok(!existsSync(join(work, "bad")), "invalid refs cannot cause a download or create files");
  } finally { rmSync(work, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { readMapFile, uniqueFile } from "../server/files.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-files-"));
after(() => rmSync(work, { recursive: true, force: true }));

describe("map_file load reads only plain, reasonably sized .map files", () => {
  it("reads a normal map and refuses a missing one", () => {
    const file = join(work, "ok.map");
    writeFileSync(file, "header\r\nbody");
    assert.equal(readMapFile(file, 1000), "header\r\nbody");
    assert.throws(() => readMapFile(join(work, "missing.map"), 1000), /ENOENT/);
  });

  it("refuses a map over the size limit, saying how big it is", () => {
    const file = join(work, "big.map");
    writeFileSync(file, "x".repeat(2000));
    assert.throws(() => readMapFile(file, 1000), /over the .* MB limit \(limits\.mapFileBytesMax\)/);
  });

  it("refuses a link named .map that points at another kind of file, but follows a link to a real map", t => {
    if (process.platform === "win32") return t.skip("creating links needs extra rights on Windows");
    const secret = join(work, "secret.txt");
    writeFileSync(secret, "not a map");
    const disguised = join(work, "disguised.map");
    symlinkSync(secret, disguised);
    assert.throws(() => readMapFile(disguised, 1000), /link to a file that is not a \.map file/);
    const real = join(work, "real.map");
    writeFileSync(real, "real map");
    const alias = join(work, "alias.map");
    symlinkSync(real, alias);
    assert.equal(readMapFile(alias, 1000), "real map");
  });

  it("refuses something that is not a regular file", () => {
    const folder = join(work, "folder.map");
    mkdirSync(folder);
    assert.throws(() => readMapFile(folder, 1000), /not a regular file/);
  });
});

describe("export file names never overwrite each other", () => {
  it("keeps the wanted name when it is free", () => {
    assert.equal(uniqueFile("out", "world", ".png", () => false), join("out", "world.png"));
  });

  it("adds the time when the name is taken, then a counter when even that is taken in the same millisecond", () => {
    const taken = new Set<string>([join("out", "world.png")]);
    const exists = (path: string) => taken.has(path);
    const now = () => 1000;
    const first = uniqueFile("out", "world", ".png", exists, now);
    assert.equal(first, join("out", "world-1000.png"));
    taken.add(first);
    const second = uniqueFile("out", "world", ".png", exists, now);
    assert.equal(second, join("out", "world-1000-2.png"));
    taken.add(second);
    assert.equal(uniqueFile("out", "world", ".png", exists, now), join("out", "world-1000-3.png"));
  });
});

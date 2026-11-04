import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { isLoopbackHost, loadConfig, PROJECT_ROOT } from "../server/config.ts";

const work = mkdtempSync(join(tmpdir(), "fmg-config-"));
after(() => rmSync(work, { recursive: true, force: true }));

describe("portable directories", () => {
  it("uses a project-local exports directory by default, with an OS-native override", () => {
    assert.equal(loadConfig({}).exportsDir, join(PROJECT_ROOT, "exports"));
    assert.equal(loadConfig({ FMG_EXPORTS_DIR: join(work, "my exports") }).exportsDir, join(work, "my exports"));
    assert.equal(loadConfig({ FMG_TEXT_ONLY: "1" }).view.textOnly, true);
    assert.equal(loadConfig({ FMG_TEXT_ONLY: "0" }).view.textOnly, false);
  });

  it("rejects Windows drive paths on non-Windows hosts, including overrides", t => {
    if (process.platform === "win32") return t.skip("Windows paths are valid on Windows");
    const drivePath = ["C:", "Users", "someone", "Exports"].join("/");
    const backslashPath = ["D:", "Users", "someone", "Exports"].join("\\");
    assert.throws(() => loadConfig({ FMG_EXPORTS_DIR: drivePath }), /Windows drive path is not valid.*FMG_EXPORTS_DIR/);
    assert.throws(() => loadConfig({ FMG_MAPS_DIR: backslashPath }), /Windows drive path is not valid/);

    const config = JSON.parse(readFileSync(join(PROJECT_ROOT, "config", "fmg-mcp.json"), "utf8"));
    config.exportsDir = drivePath;
    const file = join(work, "non-portable.json");
    writeFileSync(file, JSON.stringify(config));
    assert.throws(() => loadConfig({ FMG_CONFIG: file }), /Windows drive path is not valid/);
  });
});

describe("environment overrides are validated", () => {
  it("accepts a good FMG_PORT and refuses one that is not a port, naming the variable", () => {
    assert.equal(loadConfig({ FMG_PORT: "4321" }).server.port, 4321);
    for (const bad of ["abc", "99999", "-1", "80.5"]) assert.throws(() => loadConfig({ FMG_PORT: bad }), /Invalid FMG_PORT/, bad);
  });

  it("knows which hosts keep the map page on this computer", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1"]) assert.equal(isLoopbackHost(host), true, host);
    for (const host of ["0.0.0.0", "192.168.1.20", "::"]) assert.equal(isLoopbackHost(host), false, host);
  });

  it("ships a size limit for map files", () => {
    assert.ok(loadConfig({}).limits.mapFileBytesMax > 0);
  });
});

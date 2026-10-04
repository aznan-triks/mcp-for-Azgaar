import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { claudeCodeCommand, codexToml, continueYaml, desktopConfigPath, hermesYaml, JSON_CLIENTS, patchDesktopConfig, serverEntry } from "../scripts/register.mjs";

const work = mkdtempSync(join(tmpdir(), "fmg-reg-"));
const entry = { command: "/usr/bin/node", args: ["/proj/scripts/start.mjs"] };

describe("register", () => {
  after(() => rmSync(work, { recursive: true, force: true }));

  it("knows where each OS keeps Claude Desktop's config", () => {
    assert.match(desktopConfigPath("win32", { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "C:\\Users\\a"), /Claude[\\/]claude_desktop_config\.json$/);
    assert.match(desktopConfigPath("win32", { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "C:\\Users\\a"), /AppData/);
    assert.match(desktopConfigPath("darwin", {}, "/Users/a"), /Library[\\/]Application Support[\\/]Claude/);
    assert.match(desktopConfigPath("linux", {}, "/home/a"), /\.config[\\/]Claude/);
  });

  it("uses absolute paths (Claude Desktop may not see PATH)", () => {
    const e = serverEntry("C:/Program Files/nodejs/node.exe", "C:/my projects/azgaar");
    assert.equal(e.command, "C:/Program Files/nodejs/node.exe");
    assert.match(e.args[0], /azgaar[\\/]scripts[\\/]start\.mjs$/);
    const cmd = claudeCodeCommand("azgaar", e);
    assert.match(cmd, /^claude mcp add azgaar -- "C:\/Program Files\/nodejs\/node\.exe" "C:[\\/]my projects/);
  });

  it("creates the file when absent", () => {
    const file = join(work, "new", "claude_desktop_config.json");
    const r = patchDesktopConfig(file, { entry });
    assert.equal(r.action, "added");
    assert.equal(r.backup, null);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { mcpServers: { "azgaar": entry } });
  });

  it("keeps everything else, backs up, and is idempotent", () => {
    const file = join(work, "existing.json");
    const original = { theme: "dark", mcpServers: { other: { command: "x", args: [] } } };
    writeFileSync(file, JSON.stringify(original));
    const first = patchDesktopConfig(file, { entry });
    assert.equal(first.action, "added");
    assert.ok(first.backup && existsSync(first.backup));
    assert.deepEqual(JSON.parse(readFileSync(first.backup, "utf8")), original);
    const after1 = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(after1.theme, "dark");
    assert.deepEqual(after1.mcpServers.other, original.mcpServers.other);
    const second = patchDesktopConfig(file, { entry: { ...entry, args: ["/moved/scripts/start.mjs"] } });
    assert.equal(second.action, "updated");
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).mcpServers["azgaar"].args, ["/moved/scripts/start.mjs"]);
    assert.equal(Object.keys(JSON.parse(readFileSync(file, "utf8")).mcpServers).length, 2);
  });

  it("removes only its own entry", () => {
    const file = join(work, "remove.json");
    writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: "x" }, "azgaar": entry } }));
    assert.equal(patchDesktopConfig(file, { remove: true }).action, "removed");
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8")).mcpServers), ["other"]);
    assert.equal(patchDesktopConfig(file, { remove: true }).action, "absent");
  });

  it("refuses a config it cannot parse and leaves it untouched", () => {
    const file = join(work, "broken.json");
    writeFileSync(file, "{ not json");
    assert.throws(() => patchDesktopConfig(file, { entry }), /not plain JSON/);
    assert.equal(readFileSync(file, "utf8"), "{ not json");
    assert.equal(readdirSync(work).filter(f => f.startsWith("broken.json.bak")).length, 0, "no backup of a file we did not touch");
    const arr = join(work, "array.json");
    writeFileSync(arr, "[1,2]");
    assert.throws(() => patchDesktopConfig(arr, { entry }), /does not hold a JSON object/);
  });
});

describe("register: other AI programs", () => {
  const e = { command: String.raw`C:\Program Files\nodejs\node.exe`, args: [String.raw`C:\tools\azgaar\scripts\start.mjs`] };

  it("--text-only adds the environment variable that switches screenshots off", () => {
    const t = serverEntry("/usr/bin/node", "/proj", { textOnly: true });
    assert.deepEqual(t.env, { FMG_TEXT_ONLY: "1" });
    assert.equal(serverEntry("/usr/bin/node", "/proj").env, undefined);
  });

  it("the Claude Code command carries the text-only variable and quotes paths with spaces", () => {
    const cmd = claudeCodeCommand("azgaar", serverEntry("/usr/bin/node", "/my projects/az", { textOnly: true }));
    assert.ok(cmd.startsWith("claude mcp add --env FMG_TEXT_ONLY=1 azgaar -- /usr/bin/node \""), cmd);
    assert.ok(cmd.endsWith('start.mjs"') && cmd.includes("my projects"), cmd);
  });

  it("writes Zed's own key and every client's own file location", () => {
    const file = join(work, "zed-settings.json");
    patchDesktopConfig(file, { entry, key: JSON_CLIENTS.zed.key });
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8"))), ["context_servers"]);
    assert.match(JSON_CLIENTS.cline.file("win32", { APPDATA: "C:/A" }, "C:/u"), /saoudrizwan\.claude-dev[\\/]settings[\\/]cline_mcp_settings\.json$/);
    assert.match(JSON_CLIENTS.cursor.file("linux", {}, "/home/a"), /\.cursor[\\/]mcp\.json$/);
  });

  it("produces valid TOML and YAML for Codex, Hermes and Continue (paths with spaces and backslashes)", () => {
    const toml = codexToml("azgaar", { ...e, env: { FMG_TEXT_ONLY: "1" } });
    const q = s => JSON.stringify(s);
    assert.equal(toml, `[mcp_servers.azgaar]\ncommand = ${q(e.command)}\nargs = [${q(e.args[0])}]\nenv = { FMG_TEXT_ONLY = "1" }`);
    assert.ok(toml.includes(String.raw`"C:\\Program Files\\nodejs\\node.exe"`), "backslashes are escaped");
    const yaml = hermesYaml("azgaar", e);
    assert.equal(yaml, `mcp_servers:\n  azgaar:\n    command: ${q(e.command)}\n    args:\n      - ${q(e.args[0])}`);
    assert.match(continueYaml("azgaar", e), /^mcpServers:\n {2}- name: azgaar\n/);
  });
});

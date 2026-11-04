// The project's single verification command: `npm run check`.
// Types, lint, layer rules, hard-coded values, then tests. Stops at the first failure.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const azgaar = join(root, "vendor", "azgaar");
const win = process.platform === "win32";
const npx = win ? "npx.cmd" : "npx";
let failed = false;

function section(title) {
  console.log(`\n== ${title}`);
}
function run(title, cmd, args, cwd = root, env = {}) {
  section(title);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: win && cmd !== process.execPath, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`FAILED: ${title}`);
    failed = true;
  }
  return r.status === 0;
}
function files(dir, ext = ".ts") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
function scan(title, list, rules) {
  section(title);
  let bad = 0;
  for (const file of list) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("// const-ok")) return;
      for (const [re, why] of rules) {
        if (re.test(line)) {
          bad += 1;
          console.error(`${relative(root, file)}:${i + 1}: ${why}\n    ${line.trim()}`);
        }
      }
    });
  }
  if (bad) failed = true;
  else console.log("none");
}

// Inspect both tracked files and new, non-ignored files so a personal path cannot slip into a commit.
section("Personal machine paths in source and documentation");
const tracked = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
if (tracked.status !== 0) {
  console.error(tracked.stderr || "git ls-files failed");
  process.exit(1);
}
// A drive-absolute path or a `file:` URI is a machine, not a project: it must never be what a reader follows.
const windowsHome = /[a-z]:[\\/]+(?:Users|home|projets)[\\/]+|file:\/\/\//i;
let leaked = 0;
for (const name of tracked.stdout.split("\0").filter(Boolean)) {
  const file = join(root, name);
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue; // binary assets
  if (windowsHome.test(bytes.toString("utf8"))) {
    console.error(`${name}: machine-local path (use a project-relative path, configuration or an environment override)`);
    leaked++;
  }
}
if (leaked) failed = true;
else console.log("none");

const server = files(join(root, "server"));
const agent = files(join(azgaar, "src", "agent"));
const agentLogic = agent.filter(f => !f.endsWith("config.ts"));
const serverLogic = server.filter(f => !f.endsWith("config.ts"));

const scriptFiles = files(join(root, "scripts"), ".mjs");
for (const s of scriptFiles) {
  if (!run(`Syntax: ${relative(root, s)}`, process.execPath, ["--check", s])) process.exit(1);
}

if (!run("Types: server", npx, ["tsc", "-p", "server/tsconfig.json"])) process.exit(1);
if (existsSync(join(azgaar, "node_modules"))) {
  if (!run("Types: Azgaar + bridge", npx, ["tsc", "--noEmit"], azgaar)) process.exit(1);
  if (!run("Lint: bridge", npx, ["biome", "check", "src/agent", "src/main.ts"], azgaar)) process.exit(1);
} else {
  console.warn("\n(!) vendor/azgaar/node_modules missing: bridge types and lint NOT checked. Run npm run build:azgaar");
}

scan("Layer violations: server must not touch Azgaar structures", server, [
  [/\b(pack|grid)\s*\.\s*(cells|burgs|states|provinces|cultures|religions|vertices|biomes)\b/, "server code must not know Azgaar's data structures"],
  [/\bwindow\s*\.\s*(pack|grid)\b/, "server code must not read Azgaar globals"]
]);
scan("Layer violations: bridge must not know the server or the browser driver", agent, [
  [/from\s+["'](playwright|playwright-core|@modelcontextprotocol)/, "bridge must not import the driver or MCP"],
  [/from\s+["'][./]*server\//, "bridge must not import the server"]
]);
scan("Unsafe casts: bridge must keep Azgaar methods typed", agent, [
  [/\bas\s+any\b/, "use a typed Azgaar API, not an any cast"]
]);
scan("Hard-coded values: server", serverLogic, [
  [/https?:\/\/(?!localhost)[^\s"'`)]+/, "URL in logic: move to config"],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/, "IP address in logic: move to config"],
  [/\b\d{4,}\b/, "large number in logic: move to config"]
]);
scan("Hard-coded values: bridge", agentLogic, [
  [/#[0-9a-fA-F]{3,8}\b(?!\s*\))/, "colour literal in logic: move to config.ts (except in user-facing examples)"],
  [/\brgba?\(/, "colour literal in logic: move to config.ts"],
  [/\b\d{4,}\b/, "large number in logic: move to config.ts"]
]);
if (failed) process.exit(1);

const chromium = process.env.FMG_TEST_CHROMIUM;
if (!existsSync(join(azgaar, "dist-electron", "renderer", "index.html"))) {
  console.error("\nAzgaar is not built: run npm run build:azgaar before the tests.");
  process.exit(1);
}
const env = chromium ? { FMG_TEST_CHROMIUM: chromium, FMG_TEST_ARGS: process.env.FMG_TEST_ARGS ?? "" } : { FMG_TEST_CHANNEL: process.env.FMG_TEST_CHANNEL ?? "chrome" };
if (!chromium) console.warn("\n(!) FMG_TEST_CHROMIUM not set: tests use the 'chrome' channel from config (Chrome must be installed).");
run("Tests: bridge in a real browser (seeded map)", process.execPath, ["test/bridge.smoke.mjs"], root, env);
run("Tests: portable config", process.execPath, ["--test", "test/config.test.ts"], root, env);
run("Tests: map files, export names, undo history and autosave", process.execPath, ["--test", "test/files.test.ts", "test/history.test.ts"], root, env);
run("Tests: documentation completeness (generated reference, French twins, links)", process.execPath, ["--test", "test/docs.test.mjs"], root, env);
run("Tests: Azgaar overlay idempotence and compatibility guards", process.execPath, ["--test", "test/azgaar.pipeline.test.mjs"], root, env);
run("Tests: Node version gate", process.execPath, ["--test", "test/node-version.test.mjs"], root, env);
run("Tests: register script", process.execPath, ["--test", "test/register.test.mjs"], root, env);
run("Tests: browser selection and fallback", process.execPath, ["--test", "test/browser.channel.test.ts"], root, env);
run("Tests: screenshot size guard", process.execPath, ["--test", "test/screenshot.test.ts"], root, env);
run("Tests: window closed and reopened", process.execPath, ["--test", "test/session.reopen.test.ts"], root, env);
run("Tests: doctor", process.execPath, ["--test", "test/doctor.test.mjs"], root, env);
run("Tests: MCP end to end (real client, server, browser)", process.execPath, ["--test", "test/mcp.e2e.test.ts"], root, env);

console.log(failed ? "\nCHECK FAILED" : "\nCHECK PASSED");
console.log("Not covered: Windows, Claude Desktop / Claude Code rendering of images. A visible window is covered by: FMG_TEST_HEADED=1 FMG_TEST_CHANNEL=chrome (needs a display, e.g. xvfb-run).");
process.exit(failed ? 1 : 0);

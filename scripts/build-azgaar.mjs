// Installs the frozen Azgaar's dependencies and builds it for local use. Needs internet once (npm packages).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const azgaar = join(root, "vendor", "azgaar");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: azgaar, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(azgaar, "package.json"))) {
  console.error("vendor/azgaar is missing: the repository is incomplete.");
  process.exit(1);
}
if (!isSupportedNode()) console.warn(`\n${unsupportedNodeMessage()}\n`);

run(npm, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
// --mode electron: relative base path and no analytics (the default build assumes a web host path and breaks locally).
run(npx, ["vite", "build", "--mode", "electron"]);
console.log("\nAzgaar built in vendor/azgaar/dist-electron/renderer");

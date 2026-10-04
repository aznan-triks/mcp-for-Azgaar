// `npm run doctor`: checks everything the server needs and says what to fix. Opens a hidden browser to prove it works.
//   --headed   show the browser window during the check
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isSupportedNode, parseNode, PREFERRED_NODE_MAJOR, unsupportedNodeMessage } from "./node-version.mjs";
import { desktopConfigPath } from "./register.mjs";

let bad = 0;
const ok = msg => console.log(`  OK    ${msg}`);
const warn = msg => console.log(`  WARN  ${msg}`);
const fail = (msg, fix) => {
  bad += 1;
  console.log(`  FAIL  ${msg}${fix ? `\n        -> ${fix}` : ""}`);
};

export async function doctor({ headed = false } = {}) {
  console.log("azgaar doctor\n");
  if (!isSupportedNode()) {
    fail(unsupportedNodeMessage(), "after installing a newer Node, run npm run doctor again");
    return finish();
  }
  if (parseNode().major < PREFERRED_NODE_MAJOR) warn(`Node ${process.versions.node}: works, Azgaar itself prefers Node ${PREFERRED_NODE_MAJOR}`);
  else ok(`Node ${process.versions.node}`);
  // Loaded only now: these files are TypeScript and cannot be imported by a Node that is too old.
  const { loadConfig } = await import("../server/config.ts");
  const { MapSession } = await import("../server/browser.ts");
  const { startStaticServer } = await import("../server/static.ts");

  let cfg;
  try {
    cfg = loadConfig();
    ok("config/fmg-mcp.json is valid");
  } catch (err) {
    fail(`configuration: ${err.message}`, "fix config/fmg-mcp.json (or delete your edits with git checkout config/fmg-mcp.json)");
    return finish();
  }

  if (!existsSync(join(cfg.azgaarDist, "index.html"))) {
    fail("Azgaar is not built", "run: npm run setup");
    return finish();
  }
  ok("Azgaar is built");

  try {
    mkdirSync(cfg.mapsDir, { recursive: true });
    accessSync(cfg.mapsDir, constants.W_OK);
    ok(`maps folder writable (${cfg.mapsDir})`);
  } catch {
    fail(`cannot write in ${cfg.mapsDir}`, "check the folder permissions or change mapsDir in config/fmg-mcp.json");
  }

  let web;
  try {
    web = await startStaticServer(cfg.azgaarDist, cfg.server.host, cfg.server.port);
    ok(`local port ${web.port} is free`);
  } catch (err) {
    fail(err.message, "close the other copy of the server (another AI client may be using it) or change server.port");
    return finish();
  }

  cfg.browser.headless = !headed;
  cfg.profileDir = join(cfg.profileDir, "..", ".browser-profile-doctor");
  const session = new MapSession(cfg, web.url);
  const started = Date.now();
  try {
    await session.ensure();
    const s = await session.call("summary");
    ok(`browser launched (${session.usedChannel ?? "custom executable"}), map generated: ${s.counts.states} states, ${s.counts.burgs} cities, ${((Date.now() - started) / 1000).toFixed(1)} s`);
    const blocked = [...session.blockedRequests];
    if (blocked.length) warn(`the map tried to reach the network (refused): ${blocked.slice(0, 3).join(", ")}`);
    else ok("no network request attempted: fully offline");
    if (session.pageErrors.length) warn(`page errors: ${session.pageErrors.slice(0, 2).join(" | ")}`);
  } catch (err) {
    fail(`browser: ${err.message}`, "install Google Chrome or Microsoft Edge, or set browser.executablePath in config/fmg-mcp.json");
  } finally {
    await session.close();
    await web.close();
  }

  const desktop = desktopConfigPath();
  try {
    const registered = existsSync(desktop) && /azgaar/.test((await import("node:fs")).readFileSync(desktop, "utf8"));
    if (registered) ok("registered in Claude Desktop");
    else warn("not registered in Claude Desktop (Claude Code is not checked): run npm run register");
  } catch {
    warn("could not read the Claude Desktop config");
  }
  return finish();
}

function finish() {
  console.log(bad ? `\n${bad} problem(s) to fix.` : "\nAll good.");
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit((await doctor({ headed: process.argv.includes("--headed") })) ? 1 : 0);
}

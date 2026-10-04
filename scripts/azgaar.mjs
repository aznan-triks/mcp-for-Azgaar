// Shared helpers: download Azgaar's Fantasy Map Generator, apply this project's small patches, build it.
// Used by `npm run setup` (install) and `npm run update` (move to a newer Azgaar, with automatic rollback).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const upstreamDir = join(root, "upstream", "azgaar");
export const distIndex = join(upstreamDir, "dist-electron", "renderer", "index.html");
export const stateFile = join(root, "upstream", "state.json");
export const knownGood = () => JSON.parse(readFileSync(join(root, "known-good.json"), "utf8"));

const REPO = "Azgaar/Fantasy-Map-Generator";

// npm and vite are started through Node itself, never through a shell: no shell warnings, no argument-quoting surprises.
function npmCli() {
  const bin = dirname(process.execPath);
  const candidates = [process.env.npm_execpath, join(bin, "node_modules", "npm", "bin", "npm-cli.js"), join(bin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  const found = candidates.find(c => c && existsSync(c));
  if (!found) throw new Error("Could not find npm next to Node. Start the setup with: npm run setup");
  return found;
}
const viteCli = dir => join(dir, "node_modules", "vite", "bin", "vite.js");

export function run(cmd, args, cwd, quiet = false) {
  if (!quiet) console.log(`> ${cmd} ${args.join(" ")}`);
  return spawnSync(cmd, args, { cwd, stdio: quiet ? "pipe" : "inherit", shell: false, encoding: "utf8" });
}

export async function latestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { "User-Agent": "mcp-for-azgaar" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} when asking for the latest Azgaar release. Check your internet connection and try again.`);
  return (await res.json()).tag_name;
}

/** Download a tag, branch or commit of Azgaar and unpack it into `dest` (replaced if present). */
export async function download(ref, dest) {
  const url = `https://codeload.github.com/${REPO}/tar.gz/${ref}`;
  console.log(`Downloading Azgaar (${ref}) ...`);
  const res = await fetch(url, { headers: { "User-Agent": "mcp-for-azgaar" } });
  if (!res.ok) throw new Error(`Could not download ${url} (HTTP ${res.status}). Check your internet connection.`);
  const work = mkdtempSync(join(tmpdir(), "azgaar-dl-"));
  const archive = join(work, "azgaar.tar.gz");
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // Windows ships its own tar; a GNU tar from Git Bash that comes first in PATH misreads "C:\..." paths
  const winTar = join(process.env.SystemRoot ?? String.raw`C:\Windows`, "System32", "tar.exe");
  const tar = run(process.platform === "win32" && existsSync(winTar) ? winTar : "tar", ["-xzf", "azgaar.tar.gz", "-C", dest, "--strip-components=1"], work, true);
  rmSync(work, { recursive: true, force: true });
  if (tar.status !== 0) throw new Error(`Could not unpack the download (tar): ${tar.stderr || tar.error}`);
}

const read = file => readFileSync(file, "utf8");
const rel = (dir, file) => file.slice(dir.length + 1).replaceAll("\\", "/");
function walk(dir, ext) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

// What the bridge needs from Azgaar's own code: a few internal functions must be importable.
const EXPORTS = ["adjustProvinces", "mergeStates", "restoreRiskedData", "collectStatistics", "culturesCollectStatistics", "religionsCollectStatistics"];
const slug = family => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Apply the patches to an unpacked Azgaar. Returns a list of {id, status, required}; status is applied | already | missing.
 * A `required` patch that is missing means this Azgaar version is not compatible yet.
 */
export function applyPatches(dir) {
  const src = join(dir, "src");
  const results = [];
  const note = (id, status, required) => results.push({ id, status, required });

  // 1. the bridge itself + its fonts
  cpSync(join(root, "overlay", "agent"), join(src, "agent"), { recursive: true });
  cpSync(join(root, "overlay", "fonts"), join(dir, "public", "fonts"), { recursive: true });
  note("copy the bridge (src/agent)", "applied", true);

  // 2. load the bridge at startup
  const main = join(src, "main.ts");
  let text = read(main);
  if (/import\s+["']@\/agent["']/.test(text)) note("load the bridge in main.ts", "already", true);
  else {
    const imports = [...text.matchAll(/^import\s.+;[ \t]*$/gm)];
    if (imports.length) {
      const last = imports[imports.length - 1];
      const at = last.index + last[0].length;
      writeFileSync(main, `${text.slice(0, at)}\nimport "@/agent";${text.slice(at)}`);
      note("load the bridge in main.ts", "applied", true);
    } else note("load the bridge in main.ts", "missing", true);
  }

  // 3. export the internal functions the bridge reuses (found wherever Azgaar keeps them, so file moves do not matter)
  const files = walk(src, ".ts").filter(f => !rel(dir, f).startsWith("src/agent/"));
  for (const name of EXPORTS) {
    const declare = new RegExp(`^((?:async\\s+)?function\\s+${name}\\s*[(<])`, "m");
    const exported = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\s*[(<]`, "m");
    let status = "missing";
    for (const f of files) {
      const body = read(f);
      if (exported.test(body)) { status = "already"; break; }
      if (declare.test(body)) { writeFileSync(f, body.replace(declare, "export $1")); status = "applied"; break; }
    }
    note(`export ${name}()`, status, true);
  }

  // 4. merging states ends by refreshing the States editor table, which does not exist while the editor is closed
  const states = files.find(f => /states-editor\.ts$/.test(f));
  const refreshId = "States editor refresh works with the editor closed";
  if (states) {
    const body = read(states);
    const m = body.match(/function refreshStatesEditor\(\)[^{]*\{[\s\S]*?\n\}/);
    if (m && /statesTable\.refresh\(\);/.test(m[0]) && !/getElementById\("statesFooter"\)/.test(m[0])) {
      writeFileSync(states, body.replace(m[0], m[0].replace(/statesTable\.refresh\(\);/, 'if (document.getElementById("statesFooter")) statesTable.refresh();')));
      note(refreshId, "applied", false);
    } else note(refreshId, m ? "already" : "missing", false);
  } else note(refreshId, "missing", false);

  // 5. upstream crash: the religion name generator splits a null deity (Non-theism / Animism)
  const religions = files.find(f => /religions-generator\.ts$/.test(f));
  const deityId = "religion name generator survives a missing deity";
  if (religions) {
    const body = read(religions);
    if (/\bdeity\.split\(/.test(body)) {
      writeFileSync(religions, body.replace(/\bdeity\.split\((\/[^)]*\/)\)\[0\]/, 'deity?.split($1)[0] ?? ""'));
      note(deityId, "applied", false);
    } else note(deityId, "already", false);
  } else note(deityId, "missing", false);

  // 6. offline fonts: point each bundled family to its local file (families we do not bundle keep their web address)
  const fonts = join(src, "services", "fonts.ts");
  if (existsSync(fonts)) {
    let count = 0;
    const body = read(fonts).replace(/(family:\s*"([^"]+)",\s*src:\s*)"url\(https:\/\/fonts\.gstatic\.com[^)]+\)"/g, (all, head, family) => {
      if (!existsSync(join(dir, "public", "fonts", `${slug(family)}.woff2`))) return all;
      count += 1;
      return `${head}"url(./fonts/${slug(family)}.woff2)"`;
    });
    writeFileSync(fonts, body);
    note(`offline fonts (${count} rewritten)`, count ? "applied" : "already", false);
  } else note("offline fonts", "missing", false);

  return results;
}

export const incompatible = results => results.filter(r => r.required && r.status === "missing");

export function install(dir) {
  const ci = run(process.execPath, [npmCli(), "ci", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
  if (ci.status !== 0) throw new Error("npm could not install Azgaar's dependencies (see the messages above).");
  // --mode electron: relative base path and no analytics (the default web build breaks when served locally)
  const build = run(process.execPath, [viteCli(dir), "build", "--mode", "electron"], dir);
  if (build.status !== 0 || !existsSync(join(dir, "dist-electron", "renderer", "index.html"))) throw new Error("Azgaar did not build with the bridge (see the messages above).");
}

export function writeState(dir, ref, label) {
  const pkg = JSON.parse(read(join(dir, "package.json")));
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify({ ref, label, azgaarVersion: pkg.version, installedAt: new Date().toISOString() }, null, 2)}\n`);
}

export const readState = () => (existsSync(stateFile) ? JSON.parse(read(stateFile)) : null);

/** Download, patch and build `ref` into `dest`. Throws a plain-language Error when it cannot work. */
export async function prepare(ref, dest) {
  await download(ref, dest);
  const results = applyPatches(dest);
  for (const r of results) console.log(`  ${r.status === "missing" ? (r.required ? "FAIL" : "skip") : "ok  "}  ${r.id}${r.status === "already" ? " (already in place)" : ""}`);
  const broken = incompatible(results);
  if (broken.length) throw new Error(`This Azgaar version is not compatible yet (could not apply: ${broken.map(b => b.id).join("; ")}).`);
  install(dest);
}

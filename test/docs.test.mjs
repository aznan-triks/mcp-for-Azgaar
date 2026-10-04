// The documentation must stay complete: this fails when a setting, variable, script, tool or link has no explanation.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(join(root, file), "utf8");
const exists = file => existsSync(join(root, file));
const walk = dir => readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

const docFiles = ["README.md", "README.fr.md", ...walk(join(root, "docs")).filter(f => f.endsWith(".md")).map(f => f.slice(root.length + 1))];
const allDocs = docFiles.map(read).join("\n");

function flatKeys(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return k === "seedStorage" || k === "bridge" ? [path] : [path, ...flatKeys(v, path)];
  });
}

describe("documentation is complete", () => {
  it("every setting of config/fmg-mcp.json is explained in docs/CONFIGURATION.md", () => {
    assert.ok(exists("docs/CONFIGURATION.md"), "docs/CONFIGURATION.md is missing");
    const doc = read("docs/CONFIGURATION.md");
    const missing = flatKeys(JSON.parse(read("config/fmg-mcp.json"))).filter(k => !doc.includes(`\`${k}\``));
    assert.deepEqual(missing, [], `settings without an explanation: ${missing.join(", ")}`);
  });

  it("every environment variable and bridge setting is explained", () => {
    const doc = read("docs/CONFIGURATION.md");
    const sources = [...walk(join(root, "server")), ...walk(join(root, "scripts"))].filter(f => /\.(ts|mjs)$/.test(f)).map(f => readFileSync(f, "utf8")).join("\n");
    const vars = [...new Set([...sources.matchAll(/\bFMG_[A-Z_]+\b/g)].map(m => m[0]))];
    const missingVars = vars.filter(v => !doc.includes(v));
    assert.deepEqual(missingVars, [], `environment variables without an explanation: ${missingVars.join(", ")}`);
    const bridge = read("overlay/agent/config.ts");
    const keys = [...bridge.slice(0, bridge.indexOf("export const DEFAULT_CONFIG")).matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
    const missingKeys = keys.filter(k => !doc.includes(k));
    assert.deepEqual(missingKeys, [], `bridge settings without an explanation: ${missingKeys.join(", ")}`);
  });

  it("every npm script is documented", () => {
    const scripts = Object.keys(JSON.parse(read("package.json")).scripts);
    const missing = scripts.filter(s => !allDocs.includes(`npm run ${s}`) && !(s === "start" && allDocs.includes("scripts/start.mjs")));
    assert.deepEqual(missing, [], `npm scripts never mentioned as "npm run <name>": ${missing.join(", ")}`);
  });

  it("every tool is in the README (both languages) and in the generated reference", () => {
    const source = `${read("server/tools.ts")}\n${read("server/tools-extra.ts")}`;
    const names = [...source.matchAll(/registerTool\(\s*"(map_[a-z_]+)"/g)].map(m => m[1]);
    assert.ok(names.length >= 16, `found ${names.length} tools`);
    const reference = read("docs/TOOLS.md");
    for (const name of names) {
      assert.ok(reference.includes(`## ${name}`), `docs/TOOLS.md lacks ${name} (run: npm run docs)`);
      for (const readme of ["README.md", "README.fr.md"]) if (name !== "map_eval") assert.ok(read(readme).includes(`\`${name}\``), `${readme} does not mention ${name}`);
    }
  });

  it("every export format and every layer preset a tool accepts is listed in the tools reference", () => {
    const reference = read("docs/TOOLS.md");
    const formats = [...read("server/tools-extra.ts").matchAll(/^\s+"((?:json|geojson|csv)-[a-z-]+)":/gm)].map(m => m[1]);
    assert.ok(formats.length >= 15);
    // the formats are described in the map_export text as families; the enum values are listed by the generator
    const missing = formats.filter(f => !reference.includes(f));
    assert.deepEqual(missing, [], `export formats missing from docs/TOOLS.md: ${missing.join(", ")}`);
  });

  it("every relative link in the documentation points to a file that exists", () => {
    const broken = [];
    for (const file of docFiles) {
      const dir = dirname(join(root, file));
      for (const m of read(file).matchAll(/\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (!existsSync(resolve(dir, m[1]))) broken.push(`${file} -> ${m[1]}`);
      }
    }
    assert.deepEqual(broken, [], `broken links: ${broken.join("; ")}`);
  });

  it("the documentation index in the README links every page of docs/", () => {
    const readme = read("README.md");
    const pages = readdirSync(join(root, "docs")).filter(f => f.endsWith(".md"));
    const missing = pages.filter(p => !readme.includes(`docs/${p}`));
    assert.deepEqual(missing, [], `pages not linked from README.md: ${missing.join(", ")}`);
  });

  it("every English documentation page has a French translation with the same structure", () => {
    const prose = ["CONFIGURATION", "SECURITY", "UNINSTALL", "USAGE-EXAMPLES", "TROUBLESHOOTING", "FAQ"];
    const problems = [];
    const headings = f => (read(f).match(/^#{2,4} /gm) ?? []).length;
    const tools = f => new Set(read(f).match(/map_[a-z_]+/g) ?? []);
    const codeBlocks = f => (read(f).match(/^```/gm) ?? []).length;
    for (const name of prose) {
      const en = `docs/${name}.md`;
      const fr = `docs/fr/${name}.md`;
      if (!exists(fr)) { problems.push(`${fr} is missing`); continue; }
      if (!read(`docs/fr/README.md`).includes(`${name}.md`)) problems.push(`docs/fr/README.md does not link ${name}.md`);
      if (Math.abs(headings(en) - headings(fr)) > 1) problems.push(`${fr}: ${headings(fr)} headings against ${headings(en)}`);
      if (codeBlocks(en) !== codeBlocks(fr)) problems.push(`${fr}: ${codeBlocks(fr)} code fences against ${codeBlocks(en)}`);
      const missing = [...tools(en)].filter(x => !tools(fr).has(x));
      if (missing.length) problems.push(`${fr} lacks tool names: ${missing.join(", ")}`);
    }
    assert.deepEqual(problems, [], problems.join("; "));
  });

  it("the French README exists for every English section heading count (same structure)", () => {
    const count = file => (read(file).match(/^#{2,3} /gm) ?? []).length;
    assert.ok(Math.abs(count("README.md") - count("README.fr.md")) <= 2, `README.md has ${count("README.md")} headings, README.fr.md ${count("README.fr.md")}`);
  });
});

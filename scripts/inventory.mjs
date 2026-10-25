#!/usr/bin/env node
// Static inventory of a UI project. Read-only on source. Writes
// <project>/docs/design/inventory.json and rewrites only the marked section of
// <project>/docs/design/DESIGN.md (falls back to <project>/DESIGN.md when the
// former does not exist). Exit 0 on success, 2 on error.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const START = "<!-- artist:inventory:start -->";
export const END = "<!-- artist:inventory:end -->";

// Capability map shared with reuse-check.mjs (imported there).
export const CAPS = {
  charts: ["chart.js", "react-chartjs-2", "recharts", "echarts", "apexcharts", "victory", "@nivo/*", "d3"],
  icons: ["lucide-react", "react-icons", "@heroicons/*", "@fortawesome/*"],
  "ui-kit": ["@mui/*", "antd", "@chakra-ui/*", "@radix-ui/*", "@headlessui/*", "@mantine/*"],
  animation: ["framer-motion", "motion", "gsap", "react-spring"],
  dates: ["date-fns", "dayjs", "moment", "luxon"],
  forms: ["react-hook-form", "formik"],
  state: ["zustand", "redux", "@reduxjs/toolkit", "jotai"],
};
const matches = (pat, name) => (pat.endsWith("/*") ? name.startsWith(pat.slice(0, -1)) : pat === name);
export const capOf = (name) => Object.keys(CAPS).find((c) => CAPS[c].some((p) => matches(p, name))) ?? null;

export function formatOf(md) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const f = fm && /^format:\s*(\d+)\s*$/m.exec(fm[1]);
  return f ? Number(f[1]) : 1;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
const ROUTE_FILE = /(^|\/)(layout|page|template|loading|error|not-found|route)\.(tsx|jsx|ts|js)$/;
const isTsx = (p) => /\.(tsx|jsx)$/.test(p);

function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

function parseMembers(body) {
  const props = [];
  for (const raw of body.split(/[;\n,]/)) {
    const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+?)\s*$/.exec(raw);
    if (!m) continue;
    const type = m[3];
    const lits = type.split("|").map((s) => s.trim());
    const values = lits.length > 1 && lits.every((s) => /^(["'`]).*\1$/.test(s)) ? lits.map((s) => s.slice(1, -1)) : undefined;
    props.push({ name: m[1], type, optional: !!m[2], ...(values ? { values } : {}) });
  }
  return props;
}

function propsFor(content, name) {
  const decl = new RegExp(`(?:type\\s+${name}Props\\s*=\\s*|interface\\s+${name}Props\\s*(?:extends[^{]+)?)\\{`).exec(content);
  if (decl) {
    const body = balanced(content, decl.index + decl[0].length - 1);
    if (body != null) return parseMembers(body);
  }
  const inline = new RegExp(`(?:function\\s+${name}|const\\s+${name}\\s*=)[^{]*?\\}\\s*:\\s*\\{`).exec(content);
  if (inline) {
    const body = balanced(content, inline.index + inline[0].length - 1);
    if (body != null) return parseMembers(body);
  }
  return [];
}

const exportedNames = (content) => {
  const out = [];
  const re = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;
  let m;
  while ((m = re.exec(content))) out.push(m[1]);
  return uniqSorted(out);
};

function isDeprecated(content, name, designMd) {
  const m = new RegExp(`/\\*\\*(?:(?!\\*/)[\\s\\S])*@deprecated(?:(?!\\*/)[\\s\\S])*\\*/\\s*export\\s+(?:default\\s+)?(?:function|const|class)\\s+${name}\\b`).test(content);
  if (m) return true;
  if (!designMd) return false;
  const outside = designMd.includes(START) && designMd.includes(END)
    ? designMd.slice(0, designMd.indexOf(START)) + designMd.slice(designMd.indexOf(END) + END.length)
    : designMd;
  return outside.split(/\r?\n/).some((l) => /deprecated/i.test(l) && new RegExp(`\\b${name}\\b`).test(l));
}

function layoutRoutes(layoutPath, pagePaths) {
  const segs = layoutPath.split("/");
  const ai = segs.lastIndexOf("app", segs.length - 2);
  const root = ai >= 0 ? segs.slice(0, ai + 1).join("/") : "";
  const dir = posix.dirname(layoutPath);
  const routes = [];
  for (const p of pagePaths) {
    if (!(dir === "." ? true : p.startsWith(dir + "/"))) continue;
    const rel = posix.dirname(p) === root ? "" : posix.relative(root || ".", posix.dirname(p));
    const parts = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
    routes.push("/" + parts.join("/"));
  }
  return uniqSorted(routes);
}

export function buildInventory(files, { designMd = "" } = {}) {
  const fs = [...files].sort((a, b) => cmp(a.path, b.path));
  const unparsed = [];
  const components = [];
  const layouts = [];
  const schemas = [];
  const pkgs = new Map();
  const pagePaths = fs.filter((f) => /(^|\/)page\.(tsx|jsx|ts|js)$/.test(f.path)).map((f) => f.path);

  for (const f of fs) {
    const { path, content } = f;
    if (/(^|\/)package\.json$/.test(path)) {
      try {
        const j = JSON.parse(content);
        for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
          for (const [name, version] of Object.entries(j[key] ?? {})) {
            const e = pkgs.get(name) ?? { name, versions: new Set(), sources: new Set() };
            e.versions.add(String(version));
            e.sources.add(path);
            pkgs.set(name, e);
          }
        }
      } catch (e) { unparsed.push({ path, reason: `invalid JSON: ${e.message}` }); }
      continue;
    }
    if (path.endsWith(".json")) {
      let j;
      try { j = JSON.parse(content); } catch (e) {
        if (/\.schema\.json$/.test(path)) unparsed.push({ path, reason: `invalid JSON: ${e.message}` });
        continue;
      }
      if (/\.schema\.json$/.test(path) || (j && typeof j === "object" && typeof j.$schema === "string")) {
        schemas.push({
          kind: "json-schema",
          name: j.title || posix.basename(path).replace(/\.schema\.json$|\.json$/, ""),
          path,
          fields: Object.keys(j.properties ?? {}).sort(cmp),
        });
      }
      continue;
    }
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) continue;

    if (/(^|\/)layout\.(tsx|jsx|ts|js)$/.test(path)) {
      const names = exportedNames(content);
      const def = /export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(content);
      layouts.push({ name: def?.[1] ?? names[0] ?? posix.basename(posix.dirname(path)), path, routes: layoutRoutes(path, pagePaths) });
    } else if (isTsx(path) && !ROUTE_FILE.test(path)) {
      const names = exportedNames(content);
      if (!names.length) unparsed.push({ path, reason: "no exported component found" });
      for (const name of names) {
        const props = propsFor(content, name);
        const variants = {};
        for (const p of props) if (p.values) variants[p.name] = p.values;
        components.push({
          name, path, props, variants,
          tokensUsed: uniqSorted([...content.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])),
          usage: { count: 0, files: [] },
          status: isDeprecated(content, name, designMd) ? "deprecated" : "current",
        });
      }
    }

    for (const m of content.matchAll(/(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(z|yup|Yup)\.object\s*\(\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const body = balanced(content, open);
      if (body == null) unparsed.push({ path, reason: `unbalanced ${m[2]}.object for ${m[1]}` });
      schemas.push({ kind: m[2] === "z" ? "zod" : "yup", name: m[1], path, fields: depth0(body ?? "") });
    }
    const typeFile = /(^|\/)types\//.test(path) || /\.types\.(ts|tsx)$/.test(path);
    for (const m of content.matchAll(/export\s+(?:type|interface)\s+([A-Z][\w$]*)/g)) {
      if (!typeFile && !/Props$/.test(m[1])) continue;
      const rest = content.slice(m.index + m[0].length);
      const br = /^[^{;]*?\{/.exec(rest);
      const body = br ? balanced(content, m.index + m[0].length + br[0].length - 1) : null;
      schemas.push({ kind: "ts-type", name: m[1], path, fields: body ? parseMembers(body).map((p) => p.name).sort(cmp) : [] });
    }
  }

  // usage: files (other than the definition) importing and rendering the component
  for (const c of components) {
    const files = new Set();
    let count = 0;
    for (const f of fs) {
      if (f.path === c.path || !/\.(tsx|jsx|ts|js)$/.test(f.path)) continue;
      const imported = new RegExp(`import\\s+(?:[^;]*?[{,\\s])?${c.name}\\b[^;]*?from\\s+["']`).test(f.content);
      if (!imported) continue;
      const n = [...f.content.matchAll(new RegExp(`<${c.name}(?=[\\s/>])`, "g"))].length;
      if (n) { count += n; files.add(f.path); }
    }
    c.usage = { count, files: [...files].sort(cmp) };
  }

  const packages = [...pkgs.values()].map((e) => ({
    name: e.name,
    version: [...e.versions].sort(cmp).join(", "),
    capability: capOf(e.name),
    sources: [...e.sources].sort(cmp),
  })).sort((a, b) => cmp(a.name, b.name));

  const byKey = (a, b) => cmp(a.path + "\0" + a.name, b.path + "\0" + b.name);
  return {
    schema: 1,
    components: components.sort(byKey),
    layouts: layouts.sort(byKey),
    schemas: schemas.sort(byKey),
    packages,
    unparsed: unparsed.sort((a, b) => cmp(a.path, b.path)),
  };
}

// top-level keys of an object literal body
function depth0(body) {
  const keys = [];
  let depth = 0, start = 0;
  const flush = (s) => { const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(s); if (m) keys.push(m[1]); };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) { flush(body.slice(start, i)); start = i + 1; }
  }
  flush(body.slice(start));
  return keys.sort(cmp);
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");

export function renderSections(inv) {
  const comps = table(
    ["name", "path", "props", "variants", "tokens", "used", "status"],
    inv.components.map((c) => [
      c.name, c.path,
      c.props.map((p) => p.name + (p.optional ? "?" : "")).join(", "),
      Object.entries(c.variants).map(([k, v]) => `${k}: ${v.join(" / ")}`).join("; "),
      c.tokensUsed.join(", "),
      `${c.usage.count} in ${c.usage.files.length} file${c.usage.files.length === 1 ? "" : "s"}`,
      c.status,
    ]),
  );
  const lays = table(["name", "path", "routes"], inv.layouts.map((l) => [l.name, l.path, l.routes.join(", ")]));
  const schs = table(["name", "path", "kind", "fields"], inv.schemas.map((s) => [s.name, s.path, s.kind, s.fields.join(", ")]));
  const pks = table(["package", "version", "capability"], inv.packages.map((p) => [p.name, p.version, p.capability ?? ""]));
  const tail = inv.unparsed.length
    ? `\n\n## Unparsed\n\n${table(["path", "reason"], inv.unparsed.map((u) => [u.path, u.reason]))}`
    : "";
  return `## Components\n\n${comps}\n\n## Layouts\n\n${lays}\n\n## Schemas\n\n${schs}\n\n## Packages\n\n${pks}${tail}\n`;
}

const SKIP_DIRS = new Set(["node_modules", ".artist", ".git", ".worktrees"]);
const skipped = (rel) => rel.split("/").some((seg) => SKIP_DIRS.has(seg));
const isRegular = (abs) => { try { return lstatSync(abs).isFile(); } catch { return false; } };

// Every existing regular project file, relative posix paths, sorted. In a git
// repo: tracked + untracked-not-ignored (so ignored build output is excluded and
// unstaged deletions are dropped). Outside git: a filesystem walk.
export function listProjectFiles(project) {
  let names = null;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: project, stdio: "pipe" });
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: project, encoding: "utf8", maxBuffer: 1 << 28 });
    names = out.split("\0").filter(Boolean);
  } catch { names = null; }
  if (names === null) {
    names = [];
    const rec = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rec(join(dir, e.name)); continue; }
        if (e.isFile()) names.push(relative(project, join(dir, e.name)).split(sep).join("/"));
      }
    };
    rec(project);
  }
  return uniqSorted(names.filter((n) => !skipped(n) && isRegular(join(project, n))));
}

function walk(root) {
  return listProjectFiles(root)
    .filter((rel) => /\.(tsx|jsx|ts|js|json)$/.test(rel) && rel !== "docs/design/inventory.json")
    .map((rel) => ({ path: rel, content: readFileSync(join(root, rel), "utf8") }));
}

export function replaceMarked(md, section) {
  const s = md.indexOf(START), e = md.indexOf(END);
  if (s < 0 || e < s) throw new Error(`DESIGN.md has no ${START} / ${END} markers`);
  return md.slice(0, s + START.length) + "\n\n" + section + "\n" + md.slice(e);
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--project");
  if (i < 0 || !argv[i + 1]) throw new Error("usage: inventory.mjs --project <dir>");
  const project = argv[i + 1];
  const preferred = join(project, "docs", "design", "DESIGN.md");
  const designPath = existsSync(preferred) ? preferred : join(project, "DESIGN.md");
  if (!existsSync(designPath)) throw new Error(`no DESIGN.md at docs/design/DESIGN.md or DESIGN.md in ${project}`);
  const md = readFileSync(designPath, "utf8");
  if (formatOf(md) !== 2) throw new Error(`${designPath} is not format 2; rerun design-system init`);
  const files = walk(project).filter((f) => f.path !== relative(project, designPath).split(sep).join("/"));
  const inv = buildInventory(files, { designMd: md });
  const updated = replaceMarked(md, renderSections(inv));
  mkdirSync(join(project, "docs", "design"), { recursive: true });
  writeFileSync(join(project, "docs", "design", "inventory.json"), JSON.stringify(inv, null, 2) + "\n");
  writeFileSync(designPath, updated);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(`inventory: ${e.message}`); process.exitCode = 2; }
}

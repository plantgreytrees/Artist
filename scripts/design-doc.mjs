#!/usr/bin/env node
// Renders docs/design/design-system.html from DESIGN.md (ARCH-VERIFY-24, ARCH-PLUGIN-37).
// Deterministic, self-contained, no <script>, every data field escaped; a CSS value becomes a
// swatch only if it matches the allowlist; no href/src is ever derived from data.
// Imports design-md only; never the reuse audit module (ARCH-VERIFY-25).

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { formatOf, tokensOf, componentTokensOf, decisionsOf } from "./design-md.mjs";

export const RENDERER_VERSION = "1";
const OUT_REL = "docs/design/design-system.html";
const CSP = `default-src 'none'; style-src 'unsafe-inline'`;
const META_NAME = "artist-design-doc-manifest";

export class UserError extends Error {}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const unesc = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

// ---- value allowlist -------------------------------------------------------
const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const ARG = String.raw`(?:${NUM}(?:%|deg|turn|rad|grad)?|none)`;
const COLOUR = [
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  new RegExp(String.raw`^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*${ARG}(?:[\s,/]+${ARG}){2,3}\s*\)$`, "i"),
];
const VAR = /^var\(\s*--[A-Za-z0-9_-]+\s*\)$/;
const LENGTH = new RegExp(String.raw`^(${NUM})(px|rem|em)$`);

export function classify(raw) {
  const v = String(raw).trim();
  if (COLOUR.some((r) => r.test(v)) || VAR.test(v)) return { kind: "colour", value: v };
  const m = LENGTH.exec(v);
  if (m) return { kind: "length", px: Math.max(0, Math.min(320, Number(m[1]) * (m[2] === "px" ? 1 : 16))) };
  return null;
}

function cell(raw) {
  const c = classify(raw);
  const text = esc(raw);
  if (c?.kind === "colour") return `<span class="sw" style="background:${esc(c.value)}"></span>${text}`;
  if (c?.kind === "length") return `<span class="bar" style="width:${Math.round(c.px * 100) / 100}px"></span>${text}`;
  return text;
}

// ---- tables ---------------------------------------------------------------
function table(headers, rows, cellFn = cell) {
  if (!rows.length) return `<p class="empty">None recorded.</p>`;
  return (
    `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${headers.map((h) => `<td>${cellFn(r[h] ?? "")}</td>`).join("")}</tr>`).join("") +
    `</tbody></table>`
  );
}
const headersOf = (rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
const section = (id, title, body) => `<section id="${esc(id)}"><h2>${esc(title)}</h2>${body}</section>`;
const generic = (rows) => table(headersOf(rows), rows);

// Append-only (ARCH-PLUGIN-39): a row may only supersede a row above it, so no forward
// reference and no cycle can be expressed.
function validateDecisions(rows) {
  const ids = new Set();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    if (!id) throw new UserError("Decisions row with an empty id");
    if (ids.has(id)) throw new UserError(`duplicate Decisions id: ${id}`);
    ids.add(id);
  }
  const earlier = new Set();
  for (const r of rows) {
    const id = r.id.trim();
    const refs = (r.supersedes ?? "")
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter((x) => x && !/^[-–—]+$/.test(x));
    for (const ref of refs) {
      if (ref === id || !ids.has(ref)) {
        throw new UserError(`Decisions ${id}: supersedes "${ref}" does not resolve to another Decisions id`);
      }
      if (!earlier.has(ref)) throw new UserError(`Decisions ${id}: supersedes "${ref}" must name an earlier row`);
    }
    earlier.add(id);
  }
}

// inventory.json cells: props are objects ({name, type, ...}), variants map a prop to its
// values, usage is {count, files}; render each as text, never as "[object Object]".
const isScalar = (v) => ["string", "number", "boolean"].includes(typeof v);
const itemText = (x) => (x && typeof x === "object" && !Array.isArray(x) ? String(x.name ?? "") : String(x));
function cellText(v) {
  if (isScalar(v)) return String(v);
  if (Array.isArray(v)) return v.map(itemText).join(", ");
  if (v && typeof v === "object") {
    return Object.entries(v)
      .filter(([, x]) => isScalar(x) || Array.isArray(x))
      .map(([k, x]) => `${k}: ${Array.isArray(x) ? x.map(itemText).join("|") : String(x)}`)
      .join("; ");
  }
  return null;
}

function inventorySection(inv) {
  if (inv.schema !== 1) throw new UserError("inventory.json: unsupported schema (expected 1)");
  const parts = [];
  for (const key of ["components", "layouts", "schemas", "packages"]) {
    const items = Array.isArray(inv[key]) ? inv[key] : [];
    const rows = items.map((it) =>
      Object.fromEntries(
        Object.entries(it ?? {})
          .map(([k, v]) => [k, cellText(v)])
          .filter(([, v]) => v !== null),
      ),
    );
    parts.push(`<h3>${esc(key)}</h3>${table(headersOf(rows), rows, esc)}`);
  }
  return section("inventory", "Inventory", parts.join(""));
}

const CATEGORY_KEYS = ["conforming", "justified", "unjustified", "total"];
function reuseSection(reuse) {
  const ratios = reuse?.ratios;
  if (!ratios || typeof ratios !== "object") throw new UserError("reuse.json has no ratios (run the audit with --all)");
  const rows = Object.keys(ratios)
    .sort()
    .map((cat) => {
      const r = ratios[cat];
      const nums = CATEGORY_KEYS.map((k) => r?.[k]);
      if (!nums.every((n) => Number.isInteger(n) && n >= 0))
        throw new UserError(`reuse.json ratios.${cat} is malformed`);
      if (nums[0] + nums[1] + nums[2] !== nums[3])
        throw new UserError(`reuse.json ratios.${cat}: conforming + justified + unjustified !== total`);
      return `<tr data-category="${esc(cat)}"><th>${esc(cat)}</th>${nums.map((n) => `<td class="num">${n}</td>`).join("")}</tr>`;
    });
  return section(
    "uniformity",
    "Uniformity by category",
    `<p>Each category is reported on its own; justified items are kept apart from conforming ones.</p>` +
      `<table><thead><tr><th>category</th>${CATEGORY_KEYS.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`,
  );
}

const CSS = `:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--line:#d0d0d0}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--bg:#161616;--line:#444}}
body{font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg);margin:0 auto;max-width:72rem;padding:1.5rem}
h1,h2,h3{line-height:1.2}table{border-collapse:collapse;margin:.5rem 0 1.5rem}
th,td{border:1px solid var(--line);padding:.35rem .6rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.sw{display:inline-block;width:1.1rem;height:1.1rem;border:1px solid var(--line);border-radius:3px;vertical-align:middle;margin-right:.4rem}
.bar{display:inline-block;height:.6rem;background:var(--fg);opacity:.5;vertical-align:middle;margin-right:.4rem;max-width:20rem}
footer{font-size:.85rem;opacity:.8}code{font-family:ui-monospace,monospace}`;

// ---- inputs ---------------------------------------------------------------
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(sep).join("/");

// entries: [{role, path (project-relative, posix), sha256}]; `read(entry)` gives text.
export function render(entries, texts) {
  const design = texts.design;
  if (formatOf(design) !== 2) throw new UserError("DESIGN.md is not format 2; rerun design-system init");
  const t = tokensOf(design);
  const decisions = decisionsOf(design);
  validateDecisions(decisions);

  const body = [
    section("primitives", "Primitives", generic(t.primitives)),
    section("semantic", "Semantic tokens", generic(t.semantic)),
    section("themes", "Themes", generic(t.themes)),
    section("type-scale", "Type scale", generic(t.typeScale)),
    section("spacing", "Spacing", generic(t.spacing)),
    section("motion", "Motion", generic(t.motion)),
    section("component-tokens", "Component tokens", generic(componentTokensOf(design))),
    section("decisions", "Decisions", table(["id", "decision", "why", "date", "supersedes"], decisions, esc)),
  ];
  if (texts.inventory !== undefined) {
    let inv;
    try {
      inv = JSON.parse(texts.inventory);
    } catch {
      throw new UserError("inventory.json is not valid JSON");
    }
    body.push(inventorySection(inv));
  }
  if (texts.reuse !== undefined) {
    let reuse;
    try {
      reuse = JSON.parse(texts.reuse);
    } catch {
      throw new UserError("reuse.json is not valid JSON");
    }
    body.push(reuseSection(reuse));
  }

  const manifest = JSON.stringify({ renderer: RENDERER_VERSION, inputs: entries });
  const list = entries.map((e) => `<li><code>${esc(e.path)}</code> <code>${e.sha256}</code></li>`).join("");
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta name="${META_NAME}" content="${esc(manifest)}">\n` +
    `<title>Design system</title>\n<style>${CSS}</style></head><body>\n<h1>Design system</h1>\n` +
    body.join("\n") +
    `\n<footer><p>Generated by design-doc renderer ${RENDERER_VERSION} from:</p><ul>${list}</ul></footer>\n</body></html>\n`
  );
}

// The manifest lives in a committed, editable file: --check trusts none of it. Roles are fixed,
// design and inventory paths are fixed, and a reuse path must stay inside the project.
const DESIGN_PATHS = ["DESIGN.md", "docs/design/DESIGN.md"];
const INVENTORY_PATH = "docs/design/inventory.json";
const insideProject = (project, path) => {
  if (typeof path !== "string" || !path || isAbsolute(path)) return false;
  const rel = relative(project, resolve(project, path));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};
function validateSpecs(project, specs) {
  const seen = new Set();
  for (const [role, path] of specs) {
    const ok =
      !seen.has(role) &&
      ((role === "design" && DESIGN_PATHS.includes(path)) ||
        (role === "inventory" && path === INVENTORY_PATH) ||
        (role === "reuse" && insideProject(project, path)));
    if (!ok) throw new UserError(`manifest input rejected: ${JSON.stringify({ role, path })}`);
    seen.add(role);
  }
  if (!seen.has("design")) throw new UserError("manifest has no design input");
}

const within = (project, real) => real.startsWith(realpathSync(project) + sep);

// Write only docs/design/design-system.html inside the project (ARCH-VERIFY-24). Each parent
// is checked before anything is created under it, so a symlinked `docs` or `docs/design`
// that leaves the project gets nothing; the file is opened O_NOFOLLOW, so a symlinked
// output is refused at open time rather than after a separate check.
function writeOutput(project, out, html) {
  let dir = project;
  for (const part of dirname(OUT_REL).split("/")) {
    dir = join(dir, part);
    if (!existsSync(dir)) {
      try {
        lstatSync(dir); // a dangling symlink: refuse rather than create through it
        throw new UserError(`${relative(project, dir)} is a dangling link`);
      } catch (e) {
        if (e instanceof UserError) throw e;
      }
      mkdirSync(dir);
    }
    if (!within(project, realpathSync(dir))) throw new UserError(`${posix(relative(project, dir))} resolves outside the project`);
  }
  let fd;
  try {
    fd = openSync(out, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (e) {
    // ELOOP: a symlink; ENXIO: a FIFO with no reader (O_NONBLOCK keeps it from hanging)
    if (e.code === "ELOOP" || e.code === "ENXIO") throw new UserError(`${OUT_REL} is not a regular file`);
    throw e;
  }
  try {
    if (!lstatSync(out).isFile()) throw new UserError(`${OUT_REL} is not a regular file`);
    writeFileSync(fd, html);
  } finally {
    closeSync(fd);
  }
}

function readEntry(project, role, path) {
  const abs = resolve(project, path);
  if (!existsSync(abs)) return null;
  // stat follows a symlink; the realpath check below keeps it inside the project.
  if (!statSync(abs).isFile()) throw new UserError(`input is not a regular file: ${path}`);
  if (!within(project, realpathSync(abs))) throw new UserError(`input resolves outside the project: ${path}`);
  const buf = readFileSync(abs);
  return { entry: { role, path, sha256: sha256(buf) }, text: buf.toString("utf8") };
}

function gather(project, reusePath) {
  const designRel = existsSync(join(project, "docs", "design", "DESIGN.md")) ? "docs/design/DESIGN.md" : "DESIGN.md";
  const specs = [["design", designRel]];
  if (existsSync(join(project, "docs", "design", "inventory.json"))) {
    specs.push(["inventory", INVENTORY_PATH]);
  }
  if (reusePath) {
    const rel = posix(relative(project, resolve(project, reusePath)));
    if (!insideProject(project, rel)) throw new UserError(`--reuse must be a file inside the project: ${reusePath}`);
    specs.push(["reuse", rel]);
  }
  return specs;
}

function build(project, specs, { missingIsStale }) {
  const entries = [];
  const texts = {};
  for (const [role, path] of specs) {
    const r = readEntry(project, role, path);
    if (!r) {
      // The audit's reuse.json is a run artefact (.artist/ is usually gitignored): its absence
      // means the ratios cannot be recomputed, not that the page is stale.
      if (missingIsStale && role === "reuse") throw new UserError(`reuse input ${path} absent; rerun audit to re-verify`);
      if (missingIsStale) return { stale: `${path} is missing` };
      throw new UserError(`${role === "design" ? "DESIGN.md" : path} not found`);
    }
    entries.push(r.entry);
    texts[role] = r.text;
  }
  return { html: render(entries, texts) };
}

export function main(argv) {
  const opt = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new UserError(`${name} needs a value`);
    return argv[i + 1];
  };
  const project = resolve(opt("--project") ?? ".");
  const reuse = opt("--reuse");
  const out = join(project, ...OUT_REL.split("/"));

  if (argv.includes("--check")) {
    if (!existsSync(out)) throw new UserError(`${OUT_REL} does not exist; run design-doc first`);
    const current = readFileSync(out, "utf8");
    const m = new RegExp(`<meta name="${META_NAME}" content="([^"]*)">`).exec(current);
    let manifest;
    try {
      manifest = JSON.parse(unesc(m?.[1] ?? ""));
      if (!Array.isArray(manifest.inputs)) throw new Error();
    } catch {
      throw new UserError(`${OUT_REL} carries no readable manifest`);
    }
    const specs = manifest.inputs.map((e) => [e?.role, e?.path]);
    validateSpecs(project, specs);
    const r = build(project, specs, { missingIsStale: true });
    if (r.stale) {
      console.error(`design-doc: stale: ${r.stale}`);
      return 1;
    }
    if (r.html !== current) {
      console.error("design-doc: stale: inputs or renderer changed since the last run");
      return 1;
    }
    return 0;
  }

  const specs = gather(project, reuse);
  const { html } = build(project, specs, { missingIsStale: false });
  writeOutput(project, out, html);
  return 0;
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`design-doc: ${e.message}`);
    process.exitCode = 2;
  }
}

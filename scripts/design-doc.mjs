#!/usr/bin/env node
// Renders docs/design/design-system.html from DESIGN.md (ARCH-VERIFY-24, ARCH-PLUGIN-37).
// Deterministic, self-contained, no <script>, every data field escaped; a CSS value becomes a
// swatch only if it matches the allowlist; no href/src is ever derived from data.
// Imports design-md only; never the reuse audit module (ARCH-VERIFY-25).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function validateDecisions(rows) {
  const ids = new Set();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    if (!id) throw new UserError("Decisions row with an empty id");
    if (ids.has(id)) throw new UserError(`duplicate Decisions id: ${id}`);
    ids.add(id);
  }
  for (const r of rows) {
    const refs = (r.supersedes ?? "")
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter((x) => x && !/^[-–—]+$/.test(x));
    for (const ref of refs) {
      if (ref === r.id.trim() || !ids.has(ref)) {
        throw new UserError(`Decisions ${r.id.trim()}: supersedes "${ref}" does not resolve to another Decisions id`);
      }
    }
  }
}

function inventorySection(inv) {
  if (inv.schema !== 1) throw new UserError("inventory.json: unsupported schema (expected 1)");
  const parts = [];
  for (const key of ["components", "layouts", "schemas", "packages"]) {
    const items = Array.isArray(inv[key]) ? inv[key] : [];
    const rows = items.map((it) =>
      Object.fromEntries(
        Object.entries(it)
          .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v) || Array.isArray(v))
          .map(([k, v]) => [k, Array.isArray(v) ? v.map(String).join(", ") : String(v)]),
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

function readEntry(project, role, path) {
  const abs = resolve(project, path);
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  return { entry: { role, path, sha256: sha256(buf) }, text: buf.toString("utf8") };
}

function gather(project, reusePath) {
  const designRel = existsSync(join(project, "docs", "design", "DESIGN.md")) ? "docs/design/DESIGN.md" : "DESIGN.md";
  const specs = [["design", designRel]];
  if (existsSync(join(project, "docs", "design", "inventory.json"))) {
    specs.push(["inventory", "docs/design/inventory.json"]);
  }
  if (reusePath) {
    const abs = resolve(reusePath);
    specs.push(["reuse", posix(isAbsolute(reusePath) ? relative(project, abs) : relative(project, abs))]);
  }
  return specs;
}

function build(project, specs, { missingIsStale }) {
  const entries = [];
  const texts = {};
  for (const [role, path] of specs) {
    const r = readEntry(project, role, path);
    if (!r) {
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
    const specs = manifest.inputs.map((e) => [e.role, e.path]);
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
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return 0;
}

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`design-doc: ${e.message}`);
    process.exitCode = 2;
  }
}

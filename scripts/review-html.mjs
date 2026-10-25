#!/usr/bin/env node
// Self-contained review.html renderer (ARCH-VERIFY-10, ARCH-VERIFY-13)
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { THRESHOLDS } from "./verify.mjs";

export const DIMENSIONS = ["Hierarchy", "Typography", "Spacing & rhythm", "Colour & contrast", "Distinctiveness", "Responsiveness", "Accessibility", "Motion"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const relPath = (outDir, runDir, file) => relative(resolve(outDir), join(resolve(runDir), String(file))).split("\\").join("/");

function readReuse(runDir) {
  const p = join(runDir, "reuse.json");
  if (!existsSync(p)) return null;
  // An unreadable reuse.json must never let the verdict read PASS.
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return { unreadable: true }; }
}

function slider(bp, before, after, i) {
  const id = `cmp-${i}`;
  if (!before) return `<figure><figcaption>${esc(bp)}px</figcaption><img src="${esc(after)}" alt="${esc(bp)}px screenshot"></figure>`;
  return `<div class="cmp" data-cmp style="--pos:50%">
<h3>${esc(bp)}px</h3>
<div class="stack"><img src="${esc(before)}" alt="Before at ${esc(bp)}px"><div class="top"><img src="${esc(after)}" alt="After at ${esc(bp)}px"></div></div>
<label for="${id}">Reveal before / after at ${esc(bp)}px</label>
<input id="${id}" type="range" min="0" max="100" value="50"></div>`;
}

function rubric(r, n) {
  const badge = r.isolated === false ? ' <span class="badge">NOT ISOLATED</span>' : "";
  let body;
  if (r.scores) {
    body = `<table><thead><tr><th>Dimension</th><th>Score (1-5)</th></tr></thead><tbody>${DIMENSIONS.map((d) => `<tr><td>${esc(d)}</td><td>${esc(r.scores[d] ?? "n/a")}</td></tr>`).join("")}</tbody></table>`;
  } else body = "<p>No scores recorded.</p>";
  return `<h3>Round ${n}${badge}</h3>${body}${r.critique ? `<p class="crit">${esc(r.critique)}</p>` : ""}`;
}

function reuseSection(reuse) {
  if (!reuse) return "";
  if (reuse.unreadable) return `<section><h2>Reuse findings</h2><p class="warn">reuse.json unreadable: rerun reuse-check.</p></section>`;
  const groups = [["New components", "new_components"], ["New layouts", "new_layouts"], ["Raw colours", "raw_colours"], ["Raw spacing", "raw_spacing"], ["Raw motion", "raw_motion"], ["Missing reduced motion", "missing_reduced_motion"], ["New packages", "new_packages"], ["Stale inventory", "stale_inventory"], ["Near-duplicates", "near_duplicates"]];
  const rows = groups.filter(([, k]) => reuse[k] !== undefined || !["stale_inventory", "near_duplicates"].includes(k)).map(([t, k]) => {
    const items = reuse[k] || [];
    const li = items.map((it) => `<li class="${it.justified ? "ok" : "bad"}"><code>${esc(it.name ?? it.value)}</code> <small>${esc(it.file)}:${esc(it.line)}</small> <strong>${it.justified ? "justified" : "unjustified"}</strong>${it.reason ? ` - ${esc(it.reason)}` : ""}${it.duplicates ? ` <em>duplicates: ${esc([].concat(it.duplicates).join(", "))}</em>` : ""}</li>`).join("");
    return `<h3>${t}</h3>${items.length ? `<ul>${li}</ul>` : "<p>None.</p>"}`;
  }).join("");
  return `<section><h2>Reuse findings</h2><p>Unjustified: ${esc(reuse.unjustified ?? 0)}</p>${rows}</section>`;
}

function tokenSection(d) {
  if (!d) return `<section><h2>Token diff</h2><p>No DESIGN.md token changes recorded.</p></section>`;
  const a = (d.added || []).map((t) => `<li class="ok">+ <code>${esc(t.name)}</code>: ${esc(t.value)}</li>`);
  const r = (d.removed || []).map((n) => `<li class="bad">- <code>${esc(n)}</code></li>`);
  const c = (d.changed || []).map((t) => `<li>~ <code>${esc(t.name)}</code>: ${esc(t.from)} &rarr; ${esc(t.to)}</li>`);
  const all = [...a, ...r, ...c];
  return `<section><h2>Token diff</h2>${all.length ? `<ul>${all.join("")}</ul>` : "<p>No changes.</p>"}</section>`;
}

const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mu:#666;--bd:#ccc;--ok:#0a6b2d;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mu:#aaa;--bd:#444;--ok:#6fdc8c;--bad:#ff8a80}}
body{font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:60rem;margin:0 auto;padding:1rem}
section{border-top:1px solid var(--bd);margin-top:1.5rem}table{border-collapse:collapse}td,th{border:1px solid var(--bd);padding:.25rem .6rem;text-align:left}
img{max-width:100%;display:block}.stack{position:relative}.top{position:absolute;inset:0;clip-path:inset(0 0 0 var(--pos))}
.cmp input{width:100%}.badge{background:var(--bad);color:var(--bg);padding:0 .5rem;border-radius:.25rem;font-size:.8em}
.ok strong,.ok{color:var(--ok)}.bad strong,.bad{color:var(--bad)}.warn{color:var(--bad);font-weight:bold}small{color:var(--mu)}
input:focus-visible{outline:3px solid currentColor;outline-offset:2px}`;
const JS = `document.querySelectorAll('[data-cmp]').forEach(function(c){var i=c.querySelector('input');function u(){c.style.setProperty('--pos',i.value+'%')}i.addEventListener('input',u);u()});`;

// Mirrors the create loop's stop condition (ARCH-PLUGIN-24), so the page never says
// PASS for a run the loop would refine again.
function passes(round, reuse) {
  const rep = round.report;
  const cwv = rep.cwv || {};
  if ((rep.axe?.critical || 0) + (rep.axe?.serious || 0) > 0) return false;
  if (cwv.unstable || !(cwv.lcp_ms <= THRESHOLDS.lcp_ms) || !(cwv.cls <= THRESHOLDS.cls)) return false;
  if (round.scores && DIMENSIONS.some((d) => !(Number(round.scores[d]) >= 4))) return false;
  return !(reuse && (reuse.unreadable || reuse.unjustified > 0));
}

export function renderReview({ rounds, tokenDiff, outDir }) {
  const latest = rounds[rounds.length - 1];
  const prev = rounds.length > 1 ? rounds[0] : null;
  const rep = latest.report;
  const cwv = rep.cwv || {};
  const reuse = readReuse(latest.runDir);
  const verdict = passes(latest, reuse) ? "PASS" : "NEEDS WORK";
  const bps = rep.breakpoints || Object.keys(rep.screenshots || {});
  const cmp = bps.map((bp, i) => {
    const after = rep.screenshots?.[bp];
    if (!after) return "";
    const b = prev?.report?.screenshots?.[bp];
    return slider(bp, b ? relPath(outDir, prev.runDir, b) : null, relPath(outDir, latest.runDir, after), i);
  }).join("");
  const axe = rep.axe || {};
  const vio = (axe.violations || []).map((v) => `<tr><td>${esc(v.id)}</td><td>${esc(v.impact)}</td><td>${esc(v.help)}</td><td>${esc(v.nodes)}</td><td>${esc((v.breakpoints || []).join(", "))}</td><td>${(v.targets || []).map((t) => `<code>${esc(t)}</code>`).join("<br>")}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review: ${esc(rep.url)}</title><style>${CSS}</style></head><body>
<header><h1>Design review</h1><p>URL: ${esc(rep.url)}<br>Time: ${esc(rep.generated_at)}<br>Final verdict: <strong>${verdict}</strong></p></header>
<section><h2>Before / after</h2>${cmp || "<p>No screenshots.</p>"}</section>
<section><h2>Rubric</h2>${rounds.map((r, i) => rubric(r, i + 1)).join("")}</section>
<section><h2>Accessibility (axe)</h2><p>Critical ${esc(axe.critical ?? 0)}, serious ${esc(axe.serious ?? 0)}, moderate ${esc(axe.moderate ?? 0)}, minor ${esc(axe.minor ?? 0)}</p>${vio ? `<table><thead><tr><th>Rule</th><th>Impact</th><th>Help</th><th>Nodes</th><th>Breakpoints</th><th>Elements</th></tr></thead><tbody>${vio}</tbody></table>` : "<p>No violations.</p>"}</section>
<section><h2>Core Web Vitals</h2><p>LCP median: ${esc(cwv.lcp_ms)} ms, CLS: ${esc(cwv.cls)}, runs: ${esc(cwv.runs)}, spread: ${esc(cwv.spread)}</p>${cwv.unstable ? '<p class="warn">Unstable: CWV not treated as passed.</p>' : "<p>Stable.</p>"}</section>
${tokenSection(tokenDiff)}
${reuseSection(reuse)}
<script>${JS}</script></body></html>`;
}

function loadRound(runDir, extra = {}) {
  return { ...extra, runDir, report: JSON.parse(readFileSync(join(runDir, "report.json"), "utf8")) };
}

function main(argv) {
  if (argv[0] === "--rounds") {
    const oi = argv.indexOf("--out");
    if (!argv[1] || oi < 0 || !argv[oi + 1]) throw new Error("usage: review-html.mjs --rounds <rounds.json> --out <dir>");
    const spec = JSON.parse(readFileSync(argv[1], "utf8"));
    const list = Array.isArray(spec) ? spec : spec.rounds;
    const outDir = argv[oi + 1];
    const rounds = list.map((r) => loadRound(r.runDir, { scores: r.scores, critique: r.critique, isolated: r.isolated }));
    writeFileSync(join(outDir, "review.html"), renderReview({ rounds, tokenDiff: spec.tokenDiff, outDir }));
  } else if (argv[0]) {
    writeFileSync(join(argv[0], "review.html"), renderReview({ rounds: [loadRound(argv[0])], outDir: argv[0] }));
  } else throw new Error("usage: review-html.mjs <runDir> | --rounds <rounds.json> --out <dir>");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
}

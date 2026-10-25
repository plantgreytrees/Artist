#!/usr/bin/env node
// Deterministic reuse check: DESIGN.md + changed files + justifications -> reuse.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const CAPS = {
  charts: ["chart.js", "react-chartjs-2", "recharts", "echarts", "apexcharts", "victory", "@nivo/*", "d3"],
  icons: ["lucide-react", "react-icons", "@heroicons/*", "@fortawesome/*"],
  "ui-kit": ["@mui/*", "antd", "@chakra-ui/*", "@radix-ui/*", "@headlessui/*", "@mantine/*"],
  animation: ["framer-motion", "motion", "gsap", "react-spring"],
  dates: ["date-fns", "dayjs", "moment", "luxon"],
  forms: ["react-hook-form", "formik"],
  state: ["zustand", "redux", "@reduxjs/toolkit", "jotai"],
};

const matches = (pat, name) => (pat.endsWith("/*") ? name.startsWith(pat.slice(0, -1)) : pat === name);
const capOf = (name) => Object.keys(CAPS).find((c) => CAPS[c].some((p) => matches(p, name)));

function sections(md) {
  const out = {};
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = h[1]; out[cur] = []; continue; }
    if (cur && line.trim().startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      out[cur].push(cells);
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(1); // drop header row
  return out;
}

const hexOf = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
const COLOUR_RE = /(?<![\w&])(?<!\b(?:href|id)\s*=\s*["']?)#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(rgba?|hsla?)\(\s*([^)]*?)\s*\)/gi;

function normColour(m) {
  if (m[1] !== undefined) {
    let h = m[1].toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
    return "#" + h;
  }
  const fn = m[2].toLowerCase();
  const parts = m[3].split(/[\s,/]+/).filter(Boolean);
  if (fn.startsWith("rgb") && parts.length >= 3 && parts.slice(0, 3).every((p) => /^\d+(\.\d+)?$/.test(p))) {
    const alpha = parts[3];
    if (alpha === undefined || Number(alpha) === 1) return "#" + parts.slice(0, 3).map(hexOf).join("");
  }
  return `${fn.replace(/a$/, "")}(${parts.join(",")})`.toLowerCase();
}

function colours(text) {
  const found = [];
  for (const m of text.matchAll(COLOUR_RE)) {
    if (m[3] !== undefined && /var\(/i.test(m[3])) continue;
    found.push({ value: normColour(m), index: m.index });
  }
  return found;
}

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;
const justify = (item, just) => {
  const key = [item.name, item.value, item.file].find((k) => k !== undefined && Object.hasOwn(just, k));
  if (key !== undefined) { item.justified = true; item.reason = String(just[key]); } else item.justified = false;
  return item;
};
const ROUTE_FILES = /^(page|layout|template|loading|error|not-found|route|default|_layout|_app|_document|index)\./;

export function checkReuse({ designMd, files, justifications = {} }) {
  const sec = sections(designMd);
  const compNames = new Set((sec.Components || []).map((r) => r[0]));
  const compPaths = new Set((sec.Components || []).map((r) => r[1]));
  const layoutPaths = new Set((sec.Layouts || []).map((r) => r[1]));
  const pkgs = new Map((sec.Packages || []).map((r) => [r[0], r[2] || ""]));
  const tokenVals = new Set();
  for (const r of sec.Tokens || []) for (const c of colours(r[1] || "")) tokenVals.add(c.value);

  const res = { schema: 1, new_components: [], new_layouts: [], raw_colours: [], new_packages: [], unjustified: 0 };
  const seenComp = new Set();

  for (const f of files) {
    const p = f.path.replace(/\\/g, "/");
    const base = basename(p);
    const stem = base.replace(/\.[^.]+$/, "");
    if (/(^|\/)package\.json$/.test(p)) {
      let json;
      try { json = JSON.parse(f.content); } catch (e) { throw new Error(`bad JSON in ${p}: ${e.message}`); }
      for (const sect of ["dependencies", "devDependencies"]) {
        for (const name of Object.keys(json[sect] || {})) {
          if (pkgs.has(name) || res.new_packages.some((x) => x.name === name)) continue;
          const line = lineOf(f.content, f.content.indexOf(`"${name}"`));
          const item = { name, file: p, line };
          const cap = capOf(name);
          if (cap) {
            const dup = [...pkgs.keys()].find((k) => k !== name && capOf(k) === cap);
            if (dup) item.duplicates = dup;
          }
          res.new_packages.push(justify(item, justifications));
        }
      }
      continue;
    }
    if (/(^|\/)DESIGN\.md$/.test(p) || /\.json$/.test(p)) continue;

    const isLayout = /^(layout|_layout)\.[^.]+$/.test(base) || /Layout\.[^.]+$/.test(base);
    if (isLayout) {
      if (!layoutPaths.has(p)) res.new_layouts.push(justify({ name: p, file: p, line: 1 }, justifications));
    } else if (/(^|\/)components\//.test(p) && /\.[jt]sx?$|\.vue$|\.svelte$/.test(base)) {
      if (!compNames.has(stem) && !compPaths.has(p) && !seenComp.has(stem)) {
        seenComp.add(stem);
        res.new_components.push(justify({ name: stem, file: p, line: 1 }, justifications));
      }
    } else if (/\.[jt]sx$/.test(base) && !ROUTE_FILES.test(base)) {
      const re = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;
      for (const m of f.content.matchAll(re)) {
        if (compNames.has(m[1]) || seenComp.has(m[1])) continue;
        seenComp.add(m[1]);
        res.new_components.push(justify({ name: m[1], file: p, line: lineOf(f.content, m.index) }, justifications));
      }
    }

    const seenCol = new Set();
    for (const c of colours(f.content)) {
      if (tokenVals.has(c.value) || seenCol.has(c.value)) continue;
      seenCol.add(c.value);
      res.raw_colours.push(justify({ value: c.value, file: p, line: lineOf(f.content, c.index) }, justifications));
    }
  }
  for (const k of ["new_components", "new_layouts", "raw_colours", "new_packages"])
    res.unjustified += res[k].filter((x) => !x.justified).length;
  return res;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`);
    a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.project || !a.run) throw new Error("usage: reuse-check.mjs --project <dir> --run <runDir> [--files a,b] [--base <ref>]");
  const designPath = [a.design, join(a.project, "docs/design/DESIGN.md"), join(a.project, "DESIGN.md")].find((p) => p && existsSync(p));
  if (!designPath) throw new Error("DESIGN.md not found");
  const designMd = readFileSync(designPath, "utf8");
  const jPath = a.justifications || join(a.run, "justifications.json");
  let justifications = {};
  if (existsSync(jPath)) {
    try { justifications = JSON.parse(readFileSync(jPath, "utf8")); } catch (e) { throw new Error(`bad JSON in ${jPath}: ${e.message}`); }
  } else if (a.justifications) throw new Error(`cannot read ${jPath}`);
  // New files are usually untracked until committed, so the diff alone would miss them.
  const gitList = (args) => execFileSync("git", args, { cwd: a.project, encoding: "utf8" }).split("\n").filter(Boolean);
  const names = a.files
    ? a.files.split(",").map((s) => s.trim()).filter(Boolean)
    : [...new Set([...gitList(["diff", "--name-only", "--relative", "--diff-filter=d", a.base || "HEAD"]), ...gitList(["ls-files", "--others", "--exclude-standard"])])];
  const SKIP = /(^|\/)\.artist\/|\.(png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i;
  const files = names.filter((n) => !SKIP.test(n.replace(/\\/g, "/"))).map((n) => {
    try { return { path: n, content: readFileSync(join(a.project, n), "utf8") }; } catch (e) { throw new Error(`cannot read ${n}: ${e.message}`); }
  });
  const result = checkReuse({ designMd, files, justifications });
  mkdirSync(a.run, { recursive: true });
  writeFileSync(join(a.run, "reuse.json"), JSON.stringify(result, null, 2) + "\n");
  return result.unjustified ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(`reuse-check: ${e.message}`); process.exitCode = 2; }
}

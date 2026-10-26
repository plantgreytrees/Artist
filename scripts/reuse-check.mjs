#!/usr/bin/env node
// Deterministic reuse check: DESIGN.md + changed files + justifications -> reuse.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildInventory, capOf, formatOf, listProjectFiles } from "./inventory.mjs";
import {
  bindTokens,
  spacingBaseOf,
  tokensOf,
  componentTokensOf,
  tableOf,
  tokenFilesOf,
  isTokenFile,
  tokenFilePaths,
} from "./design-md.mjs";
import { resolveClass, tokenRefsIn, classesIn } from "./token-refs.mjs";

const hexOf = (n) =>
  Math.max(0, Math.min(255, Number(n)))
    .toString(16)
    .padStart(2, "0");
const COLOUR_RE =
  /(?<![\w&])(?<!\b(?:href|id)\s*=\s*["']?)#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(rgba?|hsla?)\(\s*([^)]*?)\s*\)/gi;

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
  if (key !== undefined) {
    item.justified = true;
    item.reason = String(just[key]);
  } else item.justified = false;
  return item;
};

const num = (x) => Number(x);
const toMs = (n, unit) => Math.round((unit === "s" ? num(n) * 1000 : num(n)) * 1000) / 1000;
const toPx = (n, unit) => (unit === "rem" ? num(n) * 16 : num(n));
const normBezier = (s) => s.toLowerCase().replace(/[\s_]+/g, "");


const SPACING_PROP = String.raw`(?:padding|margin|gap|row-gap|column-gap|rowGap|columnGap)(?:-?(?:Top|Right|Bottom|Left|top|right|bottom|left|block|inline)(?:-?(?:start|end|Start|End))?)?`;
const CSS_SPACING = new RegExp(String.raw`(?<![\w-])${SPACING_PROP}\s*:\s*([^;}\n]*)`, "g");
const TW_SPACING =
  /(?<![\w-])(?:[\w-]+:)*-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-\[(\d*\.?\d+)(px|rem)\]/g;
const JS_BARE_SPACING = new RegExp(String.raw`(?<![\w-])${SPACING_PROP}\s*:\s*(\d*\.?\d+)\s*[,}]`, "g");
const LEN = /(?<![\w.#-])-?(\d*\.?\d+)(px|rem)\b/g;
const DUR = /(?<![\w.#-])(\d*\.?\d+)(ms|s)\b/g;
const CSS_MOTION_DECL = /(?<![\w-])(?:transition|animation)(?:-(?:duration|delay))?\s*:\s*([^;}\n]*)/g;
const TW_DURATION = /(?<![\w-])(?:duration|delay)-\[(\d*\.?\d+)(ms|s)\]/g;
const JS_DURATION = /(?<![\w-])duration\s*:\s*(\d*\.?\d+)\s*[,}\n]/g;
const BEZIER = /cubic-bezier\(([^)]*)\)/gi;

const ANIMATED = [
  /(?<![\w-])(?:animation|transition)(?:-[a-z-]+)?\s*:/,
  /@keyframes\b/,
  /\bmotion\.[A-Za-z]/,
  /\banimate\s*=/,
  /\btransition\s*=/,
  /\bgsap\./,
  /\bAnimated\./,
  /\b(?:useSharedValue|withTiming)\b/,
];
const REDUCED =
  /prefers-reduced-motion|motion-reduce:|motion-safe:|useReducedMotion|isReduceMotionEnabled|reduceMotion/;

function scanSpacing(text, scale) {
  const hits = [];
  const off = (px) => px !== 0 && !scale.has(px);
  for (const m of text.matchAll(CSS_SPACING)) {
    for (const l of m[1].matchAll(LEN)) if (off(toPx(l[1], l[2]))) hits.push({ value: l[1] + l[2], index: m.index });
  }
  for (const m of text.matchAll(TW_SPACING))
    if (off(toPx(m[1], m[2]))) hits.push({ value: m[1] + m[2], index: m.index });
  for (const m of text.matchAll(JS_BARE_SPACING)) if (off(num(m[1]))) hits.push({ value: m[1] + "px", index: m.index });
  return hits;
}

function scanMotion(text, mo) {
  const hits = [];
  const dur = (n, u, index, label) => {
    const ms = toMs(n, u);
    if (ms !== 0 && !mo.durations.has(ms)) hits.push({ value: label, index });
  };
  for (const m of text.matchAll(CSS_MOTION_DECL))
    for (const d of m[1].matchAll(DUR)) dur(d[1], d[2], m.index, d[1] + d[2]);
  for (const m of text.matchAll(TW_DURATION)) dur(m[1], m[2], m.index, m[1] + m[2]);
  for (const m of text.matchAll(JS_DURATION)) {
    const n = num(m[1]);
    dur(m[1], n < 20 ? "s" : "ms", m.index, m[1] + (n < 20 ? "s" : "ms"));
  }
  for (const m of text.matchAll(BEZIER)) {
    const v = normBezier(m[0]);
    if (!mo.easings.has(v)) hits.push({ value: v, index: m.index });
  }
  return hits;
}

// Spacing and Motion scales from each row's `value` cell (tables read by header, ARCH-VERIFY-25).
function scales(md) {
  const spacing = new Set();
  for (const r of tableOf(md, "Spacing")) for (const l of (r.value ?? "").matchAll(LEN)) spacing.add(toPx(l[1], l[2]));
  const durations = new Set(),
    easings = new Set();
  for (const r of tableOf(md, "Motion")) {
    const v = r.value ?? "";
    for (const d of v.matchAll(DUR)) durations.add(toMs(d[1], d[2]));
    for (const b of v.matchAll(BEZIER)) easings.add(normBezier(b[0]));
  }
  return { spacing, motion: { durations, easings } };
}

const propSet = (c) => new Set((c.props || []).map((p) => p.name));

const SCAN_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|css|scss|sass|less|vue|svelte|html)$/i;
const isDesignDoc = (p) => /(^|\/)docs\/design\//.test(p);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const ratio = (conforming, items) => {
  const justified = items.filter((x) => x.justified).length;
  const unjustified = items.length - justified;
  return { conforming, justified, unjustified, total: conforming + justified + unjustified };
};

const ROUTE_FILES = /^(page|layout|template|loading|error|not-found|route|default|_layout|_app|_document|index)\./;

export function checkReuse({ designMd, files, justifications = {}, all = false, inventory = null }) {
  if (formatOf(designMd) !== 2) throw new Error("DESIGN.md is not format 2; rerun design-system init");
  const tokFiles = tokenFilesOf(designMd);
  const scale = scales(designMd);
  const components = tableOf(designMd, "Components");
  const compNames = new Set(components.map((r) => r.name));
  const compPaths = new Set(components.map((r) => r.path));
  const layoutPaths = new Set(tableOf(designMd, "Layouts").map((r) => r.path));
  const pkgs = new Map(tableOf(designMd, "Packages").map((r) => [r.package ?? r.name, r.capability || ""]));

  const res = {
    schema: 3,
    new_components: [],
    new_layouts: [],
    raw_colours: [],
    raw_spacing: [],
    raw_motion: [],
    missing_reduced_motion: [],
    new_packages: [],
    unjustified: 0,
  };
  if (all) {
    res.stale_inventory = [];
    res.near_duplicates = [];
  }
  const seenComp = new Set();
  const byPath = new Map(files.map((f) => [f.path.replace(/\\/g, "/"), f.content]));
  const tokenTexts = all ? tokenFilePaths(tokFiles, [...byPath.keys()]).map((p) => byPath.get(p)) : [];
  const tctx = { tokens: all ? bindTokens(designMd) : [], spacingPx: spacingBaseOf(tokenTexts) };
  const varCat = new Map(tctx.tokens.map((t) => [t.variable, t.category]));
  // A Component tokens variable aliasing a token counts in that token's category (ARCH-PLUGIN-35).
  const catByName = new Map(tctx.tokens.map((t) => [t.name, t.category]));
  for (const r of all ? componentTokensOf(designMd) : []) {
    const v = (r.variable ?? "").trim();
    const cat = catByName.get((r.semantic ?? "").trim());
    if (v && cat && !varCat.has(v)) varCat.set(v, cat);
  }
  const conforming = { colours: new Set(), spacing: new Set(), motion: new Set() };
  const offClasses = [];
  const offSeen = new Set();
  let animatedConforming = 0;

  for (const f of files) {
    const p = f.path.replace(/\\/g, "/");
    const base = basename(p);
    const stem = base.replace(/\.[^.]+$/, "");
    if (/(^|\/)package\.json$/.test(p)) {
      let json;
      try {
        json = JSON.parse(f.content);
      } catch (e) {
        throw new Error(`bad JSON in ${p}: ${e.message}`);
      }
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

    if (isDesignDoc(p)) continue;
    const isLayout =
      /^(layout|_layout)\.[^.]+$/.test(base) || /Layout\.[^.]+$/.test(base) || /(^|\/)layouts\/.+\.vue$/.test(p);
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

    if (isTokenFile(tokFiles, p) || !SCAN_EXT.test(p)) continue;
    const seen = new Set();
    const report = (list, hits, key) => {
      for (const h of hits) {
        const id = key + "|" + h.value;
        if (seen.has(id)) continue;
        seen.add(id);
        list.push(justify({ value: h.value, file: p, line: lineOf(f.content, h.index) }, justifications));
      }
    };
    report(res.raw_colours, colours(f.content), "c");
    report(res.raw_spacing, scanSpacing(f.content, scale.spacing), "s");
    report(res.raw_motion, scanMotion(f.content, scale.motion), "m");
    if (ANIMATED.some((re) => re.test(f.content)) && !REDUCED.test(f.content)) {
      const idx = Math.min(...ANIMATED.map((re) => re.exec(f.content)?.index ?? Infinity));
      res.missing_reduced_motion.push(justify({ name: p, file: p, line: lineOf(f.content, idx) }, justifications));
    } else if (ANIMATED.some((re) => re.test(f.content))) animatedConforming++;
    if (all) {
      for (const v of tokenRefsIn(f.content, tctx)) {
        const cat = varCat.get(v);
        if (conforming[cat]) conforming[cat].add(p + "\0" + v);
      }
      if (tctx.tokens.length)
        for (const { cls, index } of classesIn(f.content)) {
          if (offSeen.has(cls)) continue;
          const r = resolveClass(cls, tctx);
          if (r.kind !== "unknown" && r.kind !== "ambiguous") continue;
          offSeen.add(cls);
          offClasses.push({ class: cls, reason: r.kind, file: p, line: lineOf(f.content, index) });
        }
    }
  }
  if (all) {
    const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
    const inv = inventory?.components || [];
    for (const group of [inv, inventory?.layouts || [], inventory?.schemas || []]) {
      for (const e of group)
        if (e.path && !paths.has(e.path))
          res.stale_inventory.push(justify({ name: e.name, file: e.path, line: 1 }, justifications));
    }
    const code = files
      .filter(
        // package.json lets buildInventory spot Nuxt apps and give .vue files their Nuxt names
        (f) =>
          (/\.([jt]sx?|vue)$/.test(f.path) || /(^|[\\/])package\.json$/.test(f.path)) &&
          !isTokenFile(tokFiles, f.path) &&
          !isDesignDoc(f.path.replace(/\\/g, "/")),
      )
      .map((f) => ({ path: f.path.replace(/\\/g, "/"), content: f.content }));
    const cur = buildInventory(code, { designMd }).components;
    ratiosOf(res, { cur, designMd, justifications, conforming, animatedConforming, offClasses });
    // Generic wrapper props say nothing about duplication; need ≥2 meaningful props.
    const GENERIC = new Set(["children", "className"]);
    const sets = new Map(cur.map((c) => [c, new Set([...propSet(c)].filter((n) => !GENERIC.has(n)))]));
    const overlap = (a, b) => {
      const x = sets.get(a),
        y = sets.get(b);
      if (x.size < 2 || y.size < 2) return false;
      return [...x].filter((n) => y.has(n)).length / Math.max(x.size, y.size) >= 0.8;
    };
    for (const c of cur) {
      const dups = cur.filter((o) => o.path !== c.path && (o.name === c.name || overlap(c, o)));
      if (dups.length)
        res.near_duplicates.push(
          justify(
            { name: c.name, file: c.path, line: 1, duplicates: [...new Set(dups.map((d) => d.name))] },
            justifications,
          ),
        );
    }
  }
  for (const k of [
    "component_token_literals",
    "new_components",
    "new_layouts",
    "raw_colours",
    "raw_spacing",
    "raw_motion",
    "missing_reduced_motion",
    "new_packages",
    "stale_inventory",
    "near_duplicates",
  ])
    res.unjustified += (res[k] || []).filter((x) => !x.justified).length;
  return res;
}

// --all only: ratios, component_token_literals and the advisory lists (ARCH-VERIFY-22).
function ratiosOf(res, { cur, designMd, justifications, conforming, animatedConforming, offClasses }) {
  const t = tokensOf(designMd);
  const known = new Set([...t.semantic, ...t.typeScale, ...t.spacing, ...t.motion].map((r) => r.name).filter(Boolean));
  const block = componentTokensOf(designMd);
  res.component_token_literals = [];
  for (const r of block) {
    if (!r.component || known.has(r.semantic)) continue;
    res.component_token_literals.push(
      justify({ name: `${r.component}.${r.variable}`, value: r.semantic, component: r.component }, justifications),
    );
  }
  const litBy = (name) => res.component_token_literals.filter((x) => x.component === name);
  const ct = { conforming: 0, items: [] };
  for (const c of cur) {
    if (!Object.keys(c.variants || {}).length) continue;
    const rows = block.filter((r) => r.component === c.name);
    const lits = litBy(c.name);
    if (rows.length && !lits.length) ct.conforming++;
    else {
      // keyed by name only: a file-path justification is for missing_reduced_motion (ARCH-VERIFY-22)
      const item = { ...justify({ name: c.name }, justifications), file: c.path, line: 1 };
      if (!item.justified && lits.length && lits.every((l) => l.justified)) item.justified = true;
      ct.items.push(item);
    }
  }
  const byProp = new Map();
  for (const c of cur)
    for (const [prop, vals] of Object.entries(c.variants || {})) {
      if (!byProp.has(prop)) byProp.set(prop, []);
      byProp.get(prop).push({ c, joined: [...vals].sort(cmpStr).join(",") });
    }
  const api = { conforming: 0, items: [] };
  const synonyms = new Map();
  for (const [prop, list] of [...byProp].sort((a, b) => cmpStr(a[0], b[0]))) {
    const synKey = (e) => e.joined;
    for (const e of list) {
      if (e.joined.split(",").length < 2) continue;
      const g = synonyms.get(synKey(e)) ?? new Map();
      if (!g.has(prop)) g.set(prop, new Set());
      g.get(prop).add(e.c.name);
      synonyms.set(synKey(e), g);
    }
    if (list.length < 2) continue;
    const freq = new Map();
    for (const e of list) freq.set(e.joined, (freq.get(e.joined) ?? 0) + 1);
    const best = [...freq].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))[0][0];
    for (const e of list) {
      if (e.joined === best) api.conforming++;
      else
        api.items.push({
          ...justify({ name: `${e.c.name}.${prop}` }, justifications),
          file: e.c.path,
          line: 1,
          values: e.joined.split(","),
          expected: best.split(","),
        });
    }
  }
  const mkRatio = (cat, raw) => ratio(conforming[cat].size, raw);
  const rm = res.missing_reduced_motion;
  res.ratios = {
    colours: mkRatio("colours", res.raw_colours),
    spacing: mkRatio("spacing", res.raw_spacing),
    motion: mkRatio("motion", res.raw_motion),
    reduced_motion: ratio(animatedConforming, rm),
    component_tokens: ratio(ct.conforming, ct.items),
    component_api: ratio(api.conforming, api.items),
  };
  res.off_token_classes = offClasses;
  res.prop_synonyms = [...synonyms]
    .filter(([, g]) => g.size >= 2)
    .map(([joined, g]) => ({
      props: [...g.keys()].sort(cmpStr),
      values: joined.split(","),
      components: [...new Set([...g.values()].flatMap((s) => [...s]))].sort(cmpStr),
    }))
    .sort((a, b) => cmpStr(a.values.join(","), b.values.join(",")));
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === "--all") {
      a.all = true;
      i--;
      continue;
    }
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`);
    a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.project || !a.run)
    throw new Error("usage: reuse-check.mjs --project <dir> --run <runDir> [--files a,b | --all] [--base <ref>]");
  const designPath = [a.design, join(a.project, "docs/design/DESIGN.md"), join(a.project, "DESIGN.md")].find(
    (p) => p && existsSync(p),
  );
  if (!designPath) throw new Error("DESIGN.md not found");
  const designMd = readFileSync(designPath, "utf8");
  if (formatOf(designMd) !== 2) throw new Error(`${designPath} is not format 2; rerun design-system init`);
  // A relative --run is relative to --project, as design-doc's --reuse is (ARCH-PLUGIN-36);
  // the default justifications.json is read from the same folder reuse.json is written to.
  const runDir = resolve(a.project, a.run);
  const jPath = a.justifications || join(runDir, "justifications.json");
  let justifications = {};
  if (existsSync(jPath)) {
    try {
      justifications = JSON.parse(readFileSync(jPath, "utf8"));
    } catch (e) {
      throw new Error(`bad JSON in ${jPath}: ${e.message}`);
    }
  } else if (a.justifications) throw new Error(`cannot read ${jPath}`);
  // New files are usually untracked until committed, so the diff alone would miss them.
  const gitList = (args) => execFileSync("git", args, { cwd: a.project, encoding: "utf8" }).split("\n").filter(Boolean);
  const names = a.all
    ? listProjectFiles(a.project)
    : a.files
      ? a.files
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [
          ...new Set([
            ...gitList(["diff", "--name-only", "--relative", "--diff-filter=d", a.base || "HEAD"]),
            ...gitList(["ls-files", "--others", "--exclude-standard"]),
          ]),
        ];
  const SKIP =
    /(^|\/)(\.artist|node_modules|\.git|\.worktrees)\/|\.(png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i;
  const files = names
    .filter((n) => !SKIP.test(n.replace(/\\/g, "/")))
    .map((n) => {
      try {
        return { path: n, content: readFileSync(join(a.project, n), "utf8") };
      } catch (e) {
        throw new Error(`cannot read ${n}: ${e.message}`);
      }
    });
  let inventory = null;
  const invPath = join(a.project, "docs/design/inventory.json");
  if (a.all && existsSync(invPath)) {
    try {
      inventory = JSON.parse(readFileSync(invPath, "utf8"));
    } catch (e) {
      throw new Error(`bad JSON in ${invPath}: ${e.message}`);
    }
  }
  const result = checkReuse({ designMd, files, justifications, all: !!a.all, inventory });
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "reuse.json"), JSON.stringify(result, null, 2) + "\n");
  return result.unjustified ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`reuse-check: ${e.message}`);
    process.exitCode = 2;
  }
}

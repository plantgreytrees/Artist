// Design directions core (ARCH-DIRECTIONS-02..05, 07..09, 11, 14): schools, schema validation, the strict
// CSS-value grammar, WCAG contrast, and pick resolution. Exported functions throw a DirectionsError
// (exitCode 2, named reason); only the CLI maps it to stderr and the exit code.
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOf, tokensOf, componentTokensOf, bindTokens, categoryOf } from "./design-md.mjs";

export class DirectionsError extends Error {
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "DirectionsError";
    this.exitCode = 2;
    this.reason = reason;
  }
}
const fail = (reason, detail) => {
  throw new DirectionsError(reason, detail);
};

export const SCHOOLS = Object.freeze(
  [
    ["minimalist"],
    ["swiss"],
    ["material"],
    ["flat"],
    ["neumorphism"],
    ["glassmorphism", true],
    ["brutalist"],
    ["editorial"],
    ["retro-futurist", true],
    ["aurora", true],
  ].map(([id, ambitious]) => Object.freeze(ambitious ? { id, ambitious: true } : { id })),
);
const SCHOOL = new Map(SCHOOLS.map((s) => [s.id, s]));
const AXES = ["palette", "type", "shape", "motion", "base"];

// ---- strict CSS-value grammar (ARCH-DIRECTIONS-07) ----

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOUR_FN = /^(?:rgba?|hsla?|oklch)\([0-9a-z.,%\s/+-]*\)$/i;
const NUM = /^-?(?:\d+\.?\d*|\.\d+)$/;
const LEN = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ms|%)$/;
const ANGLE = /^-?(?:\d+\.?\d*|\.\d+)deg$/;
const EASING = /^cubic-bezier\(\s*-?[\d.]+\s*(?:,\s*-?[\d.]+\s*){3}\)$/;
const KEYWORD = /^(?:inset|ease|ease-in|ease-out|ease-in-out|linear)$/;
const SHAPE_WORD =
  /^(?:circle|ellipse|closest-side|farthest-side|closest-corner|farthest-corner|at|center|top|bottom|left|right|to)$/;
const FAMILY = /^[A-Za-z][A-Za-z0-9 -]*(?:\s*,\s*[A-Za-z][A-Za-z0-9 -]*)*$/;
const GENERIC = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "cursive",
  "fantasy",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
]);

// Split on `sep` at bracket depth 0 (sep " " splits on whitespace).
function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return null;
    if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) {
      if (cur.trim() || sep !== " ") out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (depth !== 0) return null;
  if (cur.trim() || sep !== " ") out.push(cur.trim());
  return out;
}

const isColour = (t) => HEX.test(t) || COLOUR_FN.test(t);

function isGradient(t) {
  const m = /^(?:linear|radial)-gradient\(([\s\S]*)\)$/.exec(t);
  if (!m) return false;
  const parts = splitTop(m[1], ",");
  if (!parts || !parts.length) return false;
  let colours = 0;
  for (const p of parts) {
    const words = splitTop(p, " ");
    if (!words || !words.length) return false;
    if (words.every((w) => ANGLE.test(w) || SHAPE_WORD.test(w) || LEN.test(w))) continue;
    if (!isColour(words[0])) return false;
    if (words.slice(1).some((w) => !LEN.test(w))) return false;
    colours++;
  }
  return colours >= 2;
}

const isTerm = (t) => isColour(t) || isGradient(t) || LEN.test(t) || NUM.test(t) || EASING.test(t) || KEYWORD.test(t);

export function checkCssValue(value, { fonts } = {}) {
  const bad = (d) => fail("css-value", d);
  if (typeof value !== "string") bad(`not a string: ${JSON.stringify(value)}`);
  const v = value.trim();
  if (!v || v.length > 200) bad("empty or too long");
  if (/[;{}<>\\"'`]/.test(v) || /url\(|expression\(|\/\*|@import/i.test(v)) bad(JSON.stringify(value));
  const layers = splitTop(v, ",");
  const layered =
    layers &&
    layers.every((layer) => {
      const terms = splitTop(layer, " ");
      return terms && terms.length > 0 && terms.every(isTerm);
    });
  if (layered) return v;
  if (FAMILY.test(v)) {
    if (fonts) {
      const known = new Set(fonts.map((f) => f.toLowerCase()));
      for (const f of v.split(",").map((x) => x.trim().toLowerCase()))
        if (!known.has(f) && !GENERIC.has(f)) bad(`font family not in the manifest: ${f}`);
    }
    return v;
  }
  return bad(JSON.stringify(value));
}

// ---- Current, read only through design-md.mjs (ARCH-DIRECTIONS-04) ----

export function currentFrom(md) {
  const t = tokensOf(md);
  const tokens = new Map();
  const themed = new Map();
  for (const r of t.themes) if (r.token && !themed.has(r.token)) themed.set(r.token, r);
  const colours = new Map();
  for (const b of bindTokens(md).filter((x) => x.kind === "semantic")) {
    const th = themed.get(b.name);
    const colour = !!th || b.category === "colours";
    const light = th?.light || b.value;
    const dark = th?.dark || "";
    tokens.set(b.name, { name: b.name, variable: b.variable, kind: "semantic", value: light, light, dark, colour });
    if (colour) colours.set(b.name, { light, dark });
  }
  const scaled = [
    ["type", t.typeScale, (r) => r.value ?? r.size ?? ""],
    ["spacing", t.spacing, (r) => r.value ?? ""],
    ["motion", t.motion, (r) => r.value ?? ""],
  ];
  for (const [kind, rows, val] of scaled)
    for (const r of rows) {
      if (!r.name) continue;
      const variable = (r.variable ?? "").trim() || `--${r.name.replace(/\./g, "-")}`;
      tokens.set(r.name, {
        name: r.name,
        variable,
        kind,
        value: val(r),
        colour: false,
        category: categoryOf(r.name, val(r)),
      });
    }
  for (const r of componentTokensOf(md))
    if (r.variable)
      tokens.set(r.variable, {
        name: r.variable,
        variable: r.variable,
        kind: "component",
        value: r.semantic ?? "",
        colour: false,
      });
  return { tokens, colours };
}

export function readCurrent(project) {
  const file = join(project, "docs", "design", "DESIGN.md");
  if (!existsSync(file)) fail("design-md-missing", file);
  const md = readFileSync(file, "utf8");
  if (formatOf(md) !== 2) fail("design-md-format", `${file} must start with format: 2 frontmatter`);
  return currentFrom(md);
}

// ---- schema validation (ARCH-DIRECTIONS-03, 05) ----

const ID = /^[a-z][a-z0-9-]{0,30}$/;
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const onlyKeys = (o, keys, reason, where) => {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) fail(reason, `unexpected key ${JSON.stringify(k)} in ${where}`);
};
const PROPOSED_BASE = /^(?:space|spacing)[.-]|^--/;

function checkEntry(axis, name, entry, cur, opts) {
  const where = `${axis}.${name}`;
  const known = cur.tokens.get(name);
  const o = typeof entry === "string" ? { value: entry } : entry;
  if (!isObj(o)) fail("entry-shape", where);
  onlyKeys(o, ["proposed", "value", "light", "dark"], "entry-shape", where);
  if ("proposed" in o && o.proposed !== true) fail("entry-shape", `${where}: proposed must be true`);
  if (axis === "base" && !known && !(o.proposed && PROPOSED_BASE.test(name)))
    fail("base-not-token", `${where}: base holds only spacing and component tokens`);
  if (o.proposed) {
    if (known) fail("proposed-exists", `${where} is already a DESIGN.md token`);
  } else if (!known) fail("unknown-token", `${where} is not in DESIGN.md; mark it "proposed": true`);
  if (axis === "base") {
    const ok = known ? known.kind === "spacing" || known.kind === "component" : PROPOSED_BASE.test(name);
    if (!ok) fail("base-not-token", `${where}: base holds only spacing and component tokens`);
  }
  const hasMode = "light" in o || "dark" in o;
  const colour = known ? known.colour : hasMode || (typeof o.value === "string" && isColour(o.value.trim()));
  if (colour) {
    if (typeof entry === "string") fail("missing-dark", `${where} needs light and dark values`);
    if (typeof o.light !== "string") fail("missing-light", `${where} needs a light value`);
    if (typeof o.dark !== "string") fail("missing-dark", `${where} needs a dark value`);
    if ("value" in o) fail("entry-shape", `${where}: a colour carries light and dark, not value`);
    checkCssValue(o.light, opts);
    checkCssValue(o.dark, opts);
  } else {
    if (hasMode || !("value" in o)) fail("entry-shape", `${where}: a non-colour token carries a single value`);
    if (known?.kind === "component" && cur.tokens.get(o.value)?.kind === "semantic") return;
    checkCssValue(o.value, opts);
  }
}

export function validateDirections(raw, cur, opts = {}) {
  if (!isObj(raw)) fail("schema", "directions.json must be an object");
  onlyKeys(raw, ["schema", "current", "directions"], "schema", "directions.json");
  if (raw.schema !== 1) fail("schema", "schema must be 1");
  const c = raw.current;
  if (!isObj(c)) fail("schema", "current is required");
  onlyKeys(
    c,
    ["school", "concept", "evidence"],
    "current-values",
    "current (Current's values are read from DESIGN.md)",
  );
  if (!SCHOOL.has(c.school)) fail("unknown-school", `current.school ${JSON.stringify(c.school)}`);
  if (typeof c.concept !== "string" || !c.concept.trim()) fail("schema", "current.concept is required");
  if (!Array.isArray(c.evidence) || !c.evidence.length || c.evidence.some((e) => typeof e !== "string" || !e.trim()))
    fail("schema", "current.evidence must cite DESIGN.md rows or file:line");
  const list = raw.directions;
  if (!Array.isArray(list) || list.length < 3 || list.length > 5) fail("direction-count", "need 3 to 5 directions");
  const ids = new Set();
  const schools = new Set();
  for (const [i, d] of list.entries()) {
    const where = `directions[${i}]`;
    if (!isObj(d)) fail("schema", where);
    onlyKeys(d, ["id", "school", "brief", ...AXES], "schema", where);
    if (typeof d.id !== "string" || !ID.test(d.id) || d.id === "current" || ids.has(d.id))
      fail("direction-id", `${where}.id`);
    ids.add(d.id);
    if (!SCHOOL.has(d.school)) fail("unknown-school", `${where}.school ${JSON.stringify(d.school)}`);
    if (typeof d.brief !== "string" || !d.brief.trim()) fail("schema", `${where}.brief`);
    if (schools.has(d.school)) fail("duplicate-school", d.school);
    schools.add(d.school);
    if (d.school === c.school) fail("current-school-reused", d.school);
    for (const a of AXES) if (!isObj(d[a])) fail("schema", `${where}.${a} must be an object`);
  }
  if (![...schools].some((s) => SCHOOL.get(s).ambitious))
    fail("no-ambitious", "include one of glassmorphism, retro-futurist, aurora");
  for (const d of list)
    for (const a of AXES) for (const [name, entry] of Object.entries(d[a])) checkEntry(a, name, entry, cur, opts);
  return raw;
}

// ---- WCAG 2.x contrast (ARCH-DIRECTIONS-08) ----

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// CSS colour -> linear sRGB [r,g,b], or null when it is not a plain colour (gradients, var()). Alpha is ignored.
function toLinear(css) {
  const s = String(css ?? "").trim();
  if (HEX.test(s)) {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join("");
    return [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  }
  const m = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/i.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  const num = (p, scale = 1) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const fn = m[1].toLowerCase();
  if (parts.length < 3) return null;
  if (fn.startsWith("rgb")) {
    const v = parts.slice(0, 3).map((p) => clamp01(num(p, 255) / 255));
    return v.some(Number.isNaN) ? null : v.map(lin);
  }
  if (fn.startsWith("hsl")) {
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
    const sv = parseFloat(parts[1]) / 100;
    const lv = parseFloat(parts[2]) / 100;
    if ([h, sv, lv].some(Number.isNaN)) return null;
    const q = lv < 0.5 ? lv * (1 + sv) : lv + sv - lv * sv;
    const p = 2 * lv - q;
    const f = (t) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(lin);
  }
  const L = num(parts[0]);
  const C = parseFloat(parts[1]);
  const H = (parseFloat(parts[2]) * Math.PI) / 180;
  if ([L, C, H].some(Number.isNaN)) return null;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map(clamp01);
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Contrast ratio of two CSS colours (unrounded); null when either is not a plain colour.
export function contrast(fg, bg) {
  const a = toLinear(fg);
  const b = toLinear(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const norm = (n) =>
  String(n)
    .toLowerCase()
    .replace(/^colou?r[.-]/, "")
    .replace(/\./g, "-");
const ROLES = {
  background: ["background", "bg", "canvas", "page"],
  surface: ["surface", "card", "panel"],
  text: ["text", "fg", "foreground", "text-primary"],
  muted: ["text-muted", "muted", "text-secondary", "fg-muted"],
  link: ["link", "link-text", "text-link"],
  accent: ["accent", "accent-text", "brand", "primary", "action"],
};
const roleOf = (role, colours) => [...colours.keys()].find((k) => ROLES[role].includes(norm(k)));
const FG = [
  ["text", "text"],
  ["muted", "muted text"],
  ["link", "link"],
  ["accent", "accent-text"],
];
const BG = [
  ["background", "background"],
  ["surface", "surface"],
];

// colours: Map token -> {light, dark}. Returns every computable pair with its 2 dp ratio.
export function contrastPairs(colours) {
  const out = [];
  for (const mode of ["light", "dark"])
    for (const [fr, fl] of FG)
      for (const [br, bl] of BG) {
        const fg = roleOf(fr, colours);
        const bg = roleOf(br, colours);
        if (!fg || !bg) continue;
        const r = contrast(colours.get(fg)[mode], colours.get(bg)[mode]);
        if (r === null) continue;
        out.push({ pair: `${fl} on ${bl}`, mode, fg, bg, ratio: Math.round(r * 100) / 100, pass: r >= 4.5 });
      }
  return out;
}

const modes = (e) => (isObj(e) && typeof e.light === "string" ? { light: e.light, dark: e.dark } : null);

// Contrast of Current with a direction's (or a mix's) palette overrides applied. Warnings never throw.
// source: a direction, or an array of palette maps.
export function contrastFor(cur, source) {
  const colours = new Map(cur.colours);
  const maps = Array.isArray(source) ? source : [source.palette];
  for (const m of maps) for (const [n, e] of Object.entries(m ?? {})) if (modes(e)) colours.set(n, modes(e));
  const pairs = contrastPairs(colours);
  return {
    pairs,
    warnings: pairs.filter((p) => !p.pass).map(({ pair, mode, fg, bg, ratio }) => ({ pair, mode, fg, bg, ratio })),
  };
}

// ---- pick line and resolve (ARCH-DIRECTIONS-09) ----

const PICK =
  /^artist-pick v1 base=([a-z][a-z0-9-]{0,30}) palette=([a-z][a-z0-9-]{0,30}) type=([a-z][a-z0-9-]{0,30}) shape=([a-z][a-z0-9-]{0,30}) motion=([a-z][a-z0-9-]{0,30})$/;

export function parsePickLine(line) {
  if (typeof line !== "string") fail("pick-line", "not a string");
  const m = PICK.exec(line);
  if (!m) fail("pick-line", "expected: artist-pick v1 base=<id> palette=<id> type=<id> shape=<id> motion=<id>");
  return { base: m[1], palette: m[2], type: m[3], shape: m[4], motion: m[5] };
}

const SUPPORTED = /\.(?:tsx|jsx|ts|js|mjs|cjs|vue)$/;

// Which components reach each changed token. tokens: [{name, axis}] (names without the @dark suffix).
export function impactOf({ tokens, current, inventory }) {
  if (!inventory)
    return {
      status: "inventory-absent",
      note: "docs/design/inventory.json not found: impact not computed. Run `design-system init` to build it.",
      items: [],
      unsupported: [],
    };
  const comps = Array.isArray(inventory.components) ? inventory.components : [];
  const unsupported = [
    ...new Set([...comps, ...(inventory.layouts ?? [])].map((c) => c.path).filter((p) => p && !SUPPORTED.test(p))),
  ].sort();
  const items = tokens.map(({ name, axis }) => {
    const known = current.tokens.get(name);
    const variable = known ? known.variable : `--${name.replace(/\./g, "-")}`;
    const item = {
      token: name,
      variable,
      axis,
      components: comps
        .filter((c) => SUPPORTED.test(c.path ?? "") && (c.tokensUsed ?? []).includes(variable))
        .map((c) => ({
          name: c.name,
          path: c.path,
          usage: { count: c.usage?.count ?? 0, files: [...(c.usage?.files ?? [])] },
        })),
    };
    if (!known) item.proposed = true;
    if (unsupported.length) item.unsupported = true;
    return item;
  });
  const note = unsupported.length
    ? `unsupported component format (${unsupported.join(", ")}): impact for these files is not computed, not zero`
    : "";
  return { status: "computed", note, items, unsupported };
}

const REUSE_KEYS = ["raw_colours", "raw_spacing", "raw_motion", "component_token_literals"];
const WONT_BY_AXIS = {
  palette: ["raw_colours"],
  shape: ["raw_spacing"],
  motion: ["raw_motion"],
  base: ["raw_spacing", "component_token_literals"],
};
const NOT_CHECKED =
  "not checked: run `design-system audit` (reuse-check --all) to list values that will not carry across";

function wontCarryOf(reuse, axes) {
  const all = isObj(reuse) && REUSE_KEYS.every((k) => Array.isArray(reuse[k]));
  if (!all) return { status: "not-checked", note: NOT_CHECKED, items: [] };
  const kinds = new Set(axes.flatMap((a) => WONT_BY_AXIS[a] ?? []));
  const items = [];
  for (const kind of REUSE_KEYS.filter((k) => kinds.has(k)))
    for (const r of reuse[kind]) {
      if (r.justified === true) continue;
      items.push({
        kind,
        value: r.value ?? null,
        name: r.name ?? null,
        location: r.file ? (r.line ? `${r.file}:${r.line}` : r.file) : "docs/design/DESIGN.md",
      });
    }
  return { status: "checked", note: "", items };
}

const scalar = (e) => (typeof e === "string" ? e : e.value);
const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function resolvePick({ line, directions, current, inventory = null, reuse = null }) {
  const pick = parsePickLine(line);
  const byId = new Map(directions.directions.map((d) => [d.id, d]));
  for (const [axis, id] of Object.entries(pick))
    if (id !== "current" && !byId.has(id)) fail("unknown-pick-id", `${axis}=${id}`);
  const merged = new Map();
  for (const axis of ["base", "palette", "type", "shape", "motion"]) {
    if (pick[axis] === "current") continue;
    for (const [name, entry] of Object.entries(byId.get(pick[axis])[axis])) merged.set(name, { entry, axis });
  }
  const added = [];
  const changed = [];
  const touched = [];
  const record = (name, from, to, proposed) => {
    if (proposed) added.push({ name, value: to });
    else if (!same(from, to)) changed.push({ name, from, to });
    else return false;
    return true;
  };
  for (const [name, { entry, axis }] of merged) {
    const known = current.tokens.get(name);
    let hit;
    if (isObj(entry) && entry.light !== undefined) {
      const a = record(name, known?.light, entry.light, !known);
      const b = record(`${name}@dark`, known?.dark, entry.dark, !known);
      hit = a || b;
    } else hit = record(name, known?.value, scalar(entry), !known);
    if (hit) touched.push({ name, axis });
  }
  added.sort(byName);
  changed.sort(byName);
  touched.sort(byName);
  const palette = pick.palette === "current" ? [] : [byId.get(pick.palette).palette];
  return {
    schema: 1,
    pick,
    tokenDiff: { added, removed: [], changed },
    contrastWarnings: contrastFor(current, palette).warnings,
    impact: impactOf({ tokens: touched, current, inventory }),
    wontCarry: wontCarryOf(reuse, [...new Set(touched.map((t) => t.axis))]),
  };
}

// ---- CLI ----

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return fail("json", `${what} ${file}: ${e.message}`);
  }
}

function main(argv) {
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dj = arg("--directions");
  const project = arg("--project");
  if (!dj || !project)
    fail(
      "usage",
      'directions.mjs --directions <json> --project <dir> [--resolve "<pick line>" [--reuse <reuse.json>]]',
    );
  const cur = readCurrent(project);
  const directions = validateDirections(readJson(dj, "directions"), cur);
  const line = arg("--resolve");
  if (line === undefined) {
    console.log(`directions.json valid: ${directions.directions.length} directions`);
    return;
  }
  const invFile = join(project, "docs", "design", "inventory.json");
  const reuseFile = arg("--reuse");
  const pick = resolvePick({
    line,
    directions,
    current: cur,
    inventory: existsSync(invFile) ? readJson(invFile, "inventory") : null,
    reuse: reuseFile ? readJson(reuseFile, "reuse") : null,
  });
  const base = join(project, ".artist", "directions");
  const runs = existsSync(base)
    ? readdirSync(base, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
  if (!runs.length) fail("no-run-dir", `no directions run under ${base}; render directions.html first`);
  const out = join(base, runs[runs.length - 1], "pick.json");
  writeFileSync(out, JSON.stringify(pick, null, 2) + "\n");
  console.log(out);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(e.exitCode ?? 2);
  }
}

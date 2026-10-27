// Design directions (ARCH-DIRECTIONS-02..09, 11, 12, 14): schools, schema validation, the strict
// CSS-value grammar, WCAG contrast, pick resolution and the offline directions.html renderer. Exported functions throw a DirectionsError
// (exitCode 2, named reason); only the CLI maps it to stderr and the exit code.
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, resolve, relative, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOf, tokensOf, componentTokensOf, bindTokens, categoryOf, tokenFilesOf } from "./design-md.mjs";

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
    ["minimalist", false, ["inter"]],
    ["swiss", false, ["inter-tight"]],
    ["material", false, ["figtree"]],
    ["flat", false, ["nunito"]],
    ["neumorphism", false, ["nunito"]],
    ["glassmorphism", true, ["plus-jakarta-sans"]],
    ["brutalist", false, ["space-grotesk", "space-mono"]],
    ["editorial", false, ["fraunces", "inter"]],
    ["retro-futurist", true, ["orbitron", "jetbrains-mono"]],
    ["aurora", true, ["sora"]],
  ].map(([id, ambitious, fonts]) =>
    Object.freeze({ id, ...(ambitious ? { ambitious: true } : {}), fonts: Object.freeze(fonts) }),
  ),
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

// ---- renderer (ARCH-DIRECTIONS-06, 07, 08, 12) ----
// Everything below builds directions.html from a fixed template. No input path accepts HTML: values reach the page
// only through esc() (text, attributes), checkCssValue() (CSS) or the JSON data block (script).

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "assets", "fonts");
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:";
const MIX_AXES = ["base", "palette", "type", "shape", "motion"];
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function loadFontManifest(dir = FONT_DIR) {
  return JSON.parse(readFileSync(join(dir, "fonts.json"), "utf8"));
}

// A value only reaches CSS when it passes the strict grammar; anything else is dropped, never escaped into place.
function safeCss(value, opts) {
  try {
    return checkCssValue(value, opts);
  } catch {
    return null;
  }
}

const cssVar = (name, cur) => {
  const known = cur.tokens.get(name)?.variable;
  const v = known || (name.startsWith("--") ? name : `--${name.replace(/[.@]/g, "-")}`);
  return /^--[A-Za-z0-9_-]{1,60}$/.test(v) ? v : null;
};
const isLen = (v) => LEN.test(String(v).trim());
const isFamily = (v) => typeof v === "string" && !isTerm(v.trim()) && FAMILY.test(v.trim());
const isModal = (e) => isObj(e) && typeof e.light === "string";
const GENERIC_FOR = { fraunces: "serif", "space-mono": "monospace", "jetbrains-mono": "monospace" };
const stack = (fam) => `${fam}, ${GENERIC_FOR[fam] ?? "sans-serif"}`;
const ffName = (name) => `--ff-${name.replace(/[^A-Za-z0-9_-]/g, "-")}`;

// One axis of one direction as CSS declarations for a mode ("light" carries every non-colour value).
function axisDecls(d, axis, cur, mode, opts) {
  const out = [];
  if (axis === "type" && mode === "light") {
    const fonts = SCHOOL.get(d.school).fonts;
    out.push(`--ff-body:${stack(fonts[0])}`, `--ff-heading:${stack(fonts[1] ?? fonts[0])}`);
  }
  for (const [name, entry] of Object.entries(d[axis] ?? {})) {
    const v = cssVar(name, cur);
    if (!v) continue;
    if (isModal(entry)) {
      const val = safeCss(entry[mode], opts);
      if (val) out.push(`${v}:${val}`);
      continue;
    }
    if (mode !== "light") continue;
    const raw = typeof entry === "string" ? entry : entry?.value;
    const sem = cur.tokens.get(raw);
    if (cur.tokens.get(name)?.kind === "component" && sem?.kind === "semantic") {
      out.push(`${v}:var(${cssVar(raw, cur) ?? "--x"})`);
      continue;
    }
    const val = safeCss(raw, opts);
    if (!val) continue;
    out.push(isFamily(val) ? `${ffName(name)}:${val}` : `${v}:${val}`);
  }
  return out;
}

function currentDecls(cur, mode, opts) {
  const out = [];
  for (const t of cur.tokens.values()) {
    const v = cssVar(t.name, cur);
    if (!v) continue;
    if (t.colour) {
      const val = safeCss(t[mode], opts);
      if (val) out.push(`${v}:${val}`);
    } else if (mode === "light") {
      if (t.kind === "component" && cur.tokens.get(t.value)?.kind === "semantic") {
        out.push(`${v}:var(${cssVar(t.value, cur) ?? "--x"})`);
        continue;
      }
      const val = safeCss(t.value, opts);
      if (val && !isFamily(val)) out.push(`${v}:${val}`);
    }
  }
  return out;
}

// The aliases the fixed sample screen is styled with: role -> the project's own variable, with a neutral fallback.
function aliasDecls(cur) {
  const fallback = {
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#111111",
    muted: "#555555",
    link: "#0645ad",
    accent: "#0b57d0",
  };
  const role = (r) => {
    const n = roleOf(r, cur.colours);
    const v = n && cssVar(n, cur);
    return v ? `var(${v},${fallback[r]})` : fallback[r];
  };
  const tok = (n, fb) => {
    const v = cssVar(n, cur);
    return v ? `var(${v},${fb})` : fb;
  };
  return [
    ["bg", role("background")],
    ["surface", role("surface")],
    ["text", role("text")],
    ["muted", role("muted")],
    ["link", role("link")],
    ["accent", role("accent")],
    ["sp2", tok("space.2", "8px")],
    ["sp4", tok("space.4", "16px")],
    ["radius", tok("radius.md", "8px")],
    ["fs-body", tok("body", "1rem")],
    ["fs-head", tok("heading", "1.5rem")],
    ["dur", tok("dur.fast", "150ms")],
    ["ease", tok("ease.out", "ease-out")],
    ["shadow", tok("shadow.md", "none")],
    ["blur", tok("blur", "0px")],
  ].map(([k, v]) => `--s-${k}:${v}`);
}

// ---- the fixed sample screen: sign-in form plus a small dashboard ----

function sampleScreen(id, label) {
  return `<div class="screen" data-v="${esc(id)}" role="img" aria-label="${esc(label)} sample screen" inert>
<div class="app"><nav class="nav"><b class="brand">Acme</b><span class="link">Overview</span><span class="link">Reports</span><span class="link">Team</span></nav>
<div class="panes"><div class="signin-form"><h4>Sign in</h4><label>Email<input type="text" placeholder="you@example.com" tabindex="-1"></label>
<label>Password<input type="password" placeholder="password" tabindex="-1"></label>
<div class="row"><button type="button" class="btn-primary" tabindex="-1">Sign in</button><button type="button" class="btn-secondary" tabindex="-1">Cancel</button></div>
<p class="muted">Forgot your <span class="link">password</span>?</p></div>
<div class="card-sample"><h4>Revenue</h4><p class="big">$12,480</p><p class="muted">Up 4% this week</p>
<ul class="list"><li>Invoices <span class="badge-sample ok">Paid</span></li><li>Renewals <span class="badge-sample warn">Due</span></li><li>Trials <span class="badge-sample">New</span></li></ul>
<div class="row"><button type="button" class="btn-primary" tabindex="-1">Export</button><button type="button" class="btn-secondary" tabindex="-1">Filter</button></div></div></div></div></div>`;
}

// ---- tokens grouped for the specimen view ----

function groupOf(name, cur, entry) {
  if (isModal(entry) || cur.tokens.get(name)?.colour) return "colour";
  const kind = cur.tokens.get(name)?.kind;
  if (kind === "component") return "other";
  if (/dur|delay|ease|motion/i.test(name) || kind === "motion") return "motion";
  if (/radius|round/i.test(name)) return "radius";
  if (/shadow|elev/i.test(name)) return "elevation";
  if (/^space|^spacing|gap/i.test(name) || kind === "spacing") return "spacing";
  if (kind === "type" || /font|body|heading|display|caption|title|text/i.test(name)) return "type";
  return "other";
}

const scalarOf = (e) => (typeof e === "string" ? e : (e?.value ?? ""));
const shown = (e) => (isModal(e) ? `${e.light} / ${e.dark}` : scalarOf(e));

// name -> entry for Current, or Current with every axis of direction d applied.
function effectiveOf(cur, d) {
  const m = new Map();
  for (const t of cur.tokens.values())
    if (t.kind !== "component") m.set(t.name, t.colour ? { light: t.light, dark: t.dark } : t.value);
  if (d) for (const a of MIX_AXES) for (const [n, e] of Object.entries(d[a])) m.set(n, e);
  return m;
}

function specimen(id, label, eff, base, cur) {
  const rows = { colour: [], type: [], spacing: [], radius: [], elevation: [], motion: [], other: [] };
  let diffs = 0;
  for (const [name, entry] of eff) {
    const v = cssVar(name, cur);
    const g = groupOf(name, cur, entry);
    const differs = shown(entry) !== shown(base.get(name) ?? "");
    if (differs) diffs++;
    const cell = (inner) =>
      `<div class="cell${differs ? " diff" : ""}">${inner}<small>${esc(name)}: ${esc(shown(entry))}</small></div>`;
    const family = !isModal(entry) && isFamily(scalarOf(entry));
    if (!v) rows.other.push(cell(""));
    else if (g === "colour") rows.colour.push(cell(`<i class="swatch" style="background:var(${v})"></i>`));
    else if (g === "type") {
      const style = family ? `font-family:var(${ffName(name)},inherit)` : `font-size:var(${v})`;
      rows.type.push(cell(`<span class="ramp" style="${style}">Aa Hamburgefonstiv</span>`));
    } else if (g === "spacing") rows.spacing.push(cell(`<i class="space" style="width:var(${v})"></i>`));
    else if (g === "radius") rows.radius.push(cell(`<i class="radius" style="border-radius:var(${v})"></i>`));
    else if (g === "elevation") rows.elevation.push(cell(`<i class="elev" style="box-shadow:var(${v})"></i>`));
    else if (g === "motion")
      rows.motion.push(
        cell(isLen(scalarOf(entry)) ? `<i class="motion-dot" style="animation-duration:var(${v})"></i>` : ""),
      );
    else rows.other.push(cell(""));
  }
  const group = (title, list) => (list.length ? `<h5>${title}</h5><div class="cells">${list.join("")}</div>` : "");
  return `<article class="spec scope" data-v="${esc(id)}"><h3>${esc(label)} <small>${diffs} cell${diffs === 1 ? "" : "s"} differ from Current</small></h3>
${group("Colour", rows.colour)}${group("Type ramp", rows.type)}${group("Spacing", rows.spacing)}${group("Radius", rows.radius)}${group("Elevation", rows.elevation)}${group("Motion", rows.motion)}${group("Other", rows.other)}</article>`;
}

// ---- contrast badges (ARCH-DIRECTIONS-08) ----

const badge = (w) =>
  `<span class="badge warn" role="note">Warning: ${esc(w.pair)} (${esc(w.mode)}) ${esc(w.ratio.toFixed(2))}:1, under 4.5:1</span>`;

// ---- fonts (ARCH-DIRECTIONS-12) ----

function fontFaces(families, manifest) {
  const copies = [];
  const css = [];
  for (const f of manifest.fonts.filter((x) => families.has(x.family)).sort((a, b) => (a.family < b.family ? -1 : 1))) {
    if (!SAFE_NAME.test(f.family)) continue;
    for (const file of f.files) {
      if (!SAFE_NAME.test(file.name) || !existsSync(join(FONT_DIR, f.family, file.name))) continue;
      const rel = `fonts/${f.family}/${file.name}`;
      copies.push({ abs: join(FONT_DIR, f.family, file.name), rel });
      css.push(
        `@font-face{font-family:"${f.family}";font-weight:${Number(file.weight) || 400};font-style:normal;font-display:swap;src:url(${rel}) format("woff2")}`,
      );
    }
  }
  return { copies, css };
}

// The project's own font: an @font-face in a Platform-notes token file whose font file exists inside the project.
export function findProjectFont(project, md) {
  let intended = null;
  const root = resolve(project);
  for (const declared of tokenFilesOf(md)) {
    const file = resolve(root, declared);
    if (relative(root, file).startsWith("..") || !/\.css$/i.test(file) || !existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const fam = /font-family:\s*["']?([A-Za-z0-9 -]+)/.exec(m[1])?.[1]?.trim() ?? null;
      intended ??= fam;
      const url = /url\(\s*["']?([^"')]+\.woff2?)["']?\s*\)/i.exec(m[1])?.[1];
      if (!url) continue;
      const abs = resolve(dirname(file), url);
      const inside = relative(root, abs);
      if (inside.startsWith("..") || isAbsolute(inside) || !existsSync(abs)) continue;
      const name = basename(abs).replace(/[^A-Za-z0-9._-]/g, "_");
      return { abs, rel: `fonts/current/${name}`, format: /\.woff2$/i.test(abs) ? "woff2" : "woff", intended: fam };
    }
    intended ??= /--font[\w-]*:\s*["']?([A-Za-z0-9 -]+)/.exec(text)?.[1]?.trim() ?? null;
  }
  return { intended };
}

// ---- the page ----

const PAGE_CSS = `*{box-sizing:border-box}.title{margin:0 8px 0 0;font-size:16px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:#f4f4f6;color:#16161a}
body[data-mode="dark"]{background:#14141a;color:#eeeef2}
header{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #c8c8d0;color:#16161a}
body[data-mode="dark"] header{background:#1e1e26;color:#eeeef2;border-color:#3a3a46}
header button,.ctl button,.ctl select{font:inherit;padding:4px 10px;border:1px solid #888;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
button[aria-pressed="true"]{background:#16161a;color:#fff}body[data-mode="dark"] button[aria-pressed="true"]{background:#eeeef2;color:#16161a}
.view{display:none;padding:16px}body[data-view="final"] #view-final,body[data-view="specimen"] #view-specimen,body[data-view="mix"] #view-mix{display:block}
.banner{margin:8px 16px;padding:8px 12px;border:1px solid #b58900;border-radius:6px;background:#fff8dc;color:#4a3a00}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
[data-layout="one"] .card{display:none}[data-layout="one"] .card.active{display:block}[data-layout="one"] .cards{grid-template-columns:minmax(0,720px)}
.card{border:1px solid #c8c8d0;border-radius:8px;padding:12px;background:#fff;color:#16161a}body[data-mode="dark"] .card{background:#1e1e26;color:#eeeef2;border-color:#3a3a46}
.card h3,.spec h3{margin:0 0 4px}small{opacity:.75;font-weight:400}.brief{margin:0 0 8px}
.badge.warn{display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;background:#b3261e;color:#fff;font-size:12px}
.badge.ok{display:inline-block;padding:2px 8px;border-radius:999px;background:#146c2e;color:#fff;font-size:12px}
.spec{margin:0 0 20px;padding:12px;border:1px solid #c8c8d0;border-radius:8px}
.cells{display:flex;flex-wrap:wrap;gap:8px}.cell{display:flex;flex-direction:column;gap:4px;min-width:150px;padding:6px;border:1px solid transparent;border-radius:6px}
.cell.diff{border-color:#d97706;background:rgba(217,119,6,.14)}.cell small{word-break:break-all}
.swatch{display:block;width:64px;height:32px;border:1px solid #8886;border-radius:4px}.space{display:block;height:12px;background:currentColor}
.radius{display:block;width:48px;height:48px;border:2px solid currentColor}.elev{display:block;width:64px;height:40px;background:#fff}
.motion-dot{display:block;width:12px;height:12px;border-radius:50%;background:currentColor;animation:slide 400ms ease-in-out infinite alternate}
@keyframes slide{from{transform:translateX(0)}to{transform:translateX(96px)}}
.mix-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}.ctl{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;align-items:center}
.pane{border:1px solid #c8c8d0;border-radius:8px;padding:8px;background:#fff;color:#16161a}body[data-mode="dark"] .pane{background:#1e1e26;color:#eeeef2;border-color:#3a3a46}
code#pickline{display:block;padding:8px;background:#0001;border-radius:6px;word-break:break-all;user-select:all}
.panel{margin:12px 0}.panel ul{margin:4px 0;padding-left:20px}
.screen{font-family:var(--ff-body,system-ui,sans-serif);font-size:var(--s-fs-body);background:var(--s-bg);color:var(--s-text);border:1px solid var(--s-muted);border-radius:var(--s-radius);overflow:hidden}
.screen .app{padding:var(--s-sp2)}.screen .nav{display:flex;gap:var(--s-sp4);align-items:center;padding:var(--s-sp2) var(--s-sp4);background:var(--s-surface);border-radius:var(--s-radius)}
.screen .brand{margin-right:auto;color:var(--s-accent)}.screen .link{color:var(--s-link);text-decoration:underline}
.screen .panes{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--s-sp4);margin-top:var(--s-sp4)}
.screen h4{margin:0 0 var(--s-sp2);font-family:var(--ff-heading,var(--ff-body,system-ui,sans-serif));font-size:var(--s-fs-head)}
.screen .signin-form,.screen .card-sample{padding:var(--s-sp4);background:var(--s-surface);border-radius:var(--s-radius);box-shadow:var(--s-shadow);backdrop-filter:blur(var(--s-blur))}
.screen label{display:block;margin-bottom:var(--s-sp2);color:var(--s-muted)}.screen input{display:block;width:100%;margin-top:4px;padding:var(--s-sp2);border:1px solid var(--s-muted);border-radius:var(--s-radius);background:var(--s-bg);color:var(--s-text);font:inherit}
.screen .row{display:flex;gap:var(--s-sp2);margin-top:var(--s-sp2)}.screen .muted{color:var(--s-muted);margin:var(--s-sp2) 0 0}.screen .big{margin:0;font-size:var(--s-fs-head);font-weight:700}
.screen .list{list-style:none;margin:var(--s-sp2) 0;padding:0}.screen .list li{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--s-muted)}
.screen .badge-sample{padding:0 var(--s-sp2);border:1px solid var(--s-muted);border-radius:999px;font-size:.8em}.screen .badge-sample.ok{border-color:var(--s-accent);color:var(--s-accent)}.screen .badge-sample.warn{background:var(--s-muted);color:var(--s-bg)}
.screen button{font:inherit;padding:var(--s-sp2) var(--s-sp4);border-radius:var(--s-radius);cursor:pointer;transition:background-color var(--s-dur) var(--s-ease),transform var(--s-dur) var(--s-ease)}
.screen .btn-primary{background:var(--s-accent);color:var(--s-bg);border:1px solid var(--s-accent)}.screen .btn-secondary{background:transparent;color:var(--s-accent);border:1px solid var(--s-accent)}
.screen button:hover{transform:translateY(-1px)}
.scope{font-family:var(--ff-body,system-ui,sans-serif)}
@media (prefers-reduced-motion:reduce){.screen *,.scope *{transition:none!important;animation:none!important}}
body[data-rm="on"] .screen *,body[data-rm="on"] .scope *{transition:none!important;animation:none!important}
body[data-rt="on"] .screen *,body[data-rt="on"] .scope *{backdrop-filter:none!important}
@media (prefers-reduced-transparency:reduce){.screen *{backdrop-filter:none!important}}`;

// Switches precomputed values only: reads the JSON block, sets attributes and textContent.
const PAGE_JS = `(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("directions-data").textContent);
  var body = document.body;
  var AXES = ["base", "palette", "type", "shape", "motion"];
  var sel = { base: "current", palette: "current", type: "current", shape: "current", motion: "current" };
  var mix = document.querySelector('[data-v="mix"]');
  function byId(id) { return document.getElementById(id); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear(box) { while (box.firstChild) box.removeChild(box.firstChild); }
  function fill(box, rows, empty) {
    clear(box);
    if (!rows.length) { box.appendChild(node("p", "", empty)); return; }
    var ul = node("ul");
    rows.forEach(function (r) { ul.appendChild(node("li", "", r)); });
    box.appendChild(ul);
  }
  function press(attr, value) {
    each(document.querySelectorAll("[" + attr + "]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute(attr) === value ? "true" : "false");
    });
  }
  function setView(v) { body.setAttribute("data-view", v); press("data-view-btn", v); }
  function setMode(m) { body.setAttribute("data-mode", m); press("data-mode-btn", m); }
  function cards() { return document.querySelectorAll("#finals .card"); }
  var cur = 0;
  function setLayout(l) {
    byId("finals").setAttribute("data-layout", l);
    press("data-layout-btn", l);
    each(cards(), function (c, i) { c.classList.toggle("active", i === cur); });
  }
  function step(n) {
    var len = cards().length;
    cur = (cur + n + len) % len;
    setLayout("one");
  }
  function refresh() {
    each(AXES, function (a) { mix.setAttribute("data-" + a, sel[a]); });
    byId("pickline").textContent = "artist-pick v1 base=" + sel.base + " palette=" + sel.palette +
      " type=" + sel.type + " shape=" + sel.shape + " motion=" + sel.motion;
    var diff = {}, impact = {}, wont = {};
    AXES.forEach(function (a) {
      var o = data.axes[a][sel[a]];
      if (!o) return;
      o.diff.forEach(function (d) {
        diff[d.name] = d.from === undefined ? "+ " + d.name + ": " + d.to : d.name + ": " + d.from + " -> " + d.to;
      });
      o.impact.forEach(function (i) {
        var uses = i.components.map(function (c) { return c.name + " " + c.path + " (" + c.usage.count + " uses)"; });
        impact[i.token] = i.token + " (" + i.variable + "): " + (uses.length ? uses.join(", ") : "no component uses it") +
          (i.unsupported ? " [unsupported formats not counted]" : "");
      });
      o.wont.forEach(function (w) { wont[w.kind + w.value + w.location] = w.kind + " " + (w.value || w.name) + " at " + w.location; });
    });
    function vals(o) { return Object.keys(o).sort().map(function (k) { return o[k]; }); }
    fill(byId("mix-diff"), vals(diff), "No token differs from Current.");
    fill(byId("mix-impact"), vals(impact), data.notes.impact || "No changed token.");
    fill(byId("mix-wont"), vals(wont), data.notes.wont || "Nothing listed.");
    var cbox = byId("mix-contrast");
    clear(cbox);
    var warns = data.contrast[sel.palette] || [];
    if (!warns.length) cbox.appendChild(node("span", "badge ok", "All text pairs are at least 4.5:1"));
    warns.forEach(function (w) {
      cbox.appendChild(node("span", "badge warn", "Warning: " + w.pair + " (" + w.mode + ") " + w.ratio.toFixed(2) + ":1, under 4.5:1"));
    });
  }
  each(document.querySelectorAll("[data-view-btn]"), function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view-btn")); });
  });
  each(document.querySelectorAll("[data-mode-btn]"), function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-mode-btn")); });
  });
  each(document.querySelectorAll("[data-layout-btn]"), function (b) {
    b.addEventListener("click", function () { setLayout(b.getAttribute("data-layout-btn")); });
  });
  byId("prev").addEventListener("click", function () { step(-1); });
  byId("next").addEventListener("click", function () { step(1); });
  byId("toggle-rm").addEventListener("change", function (e) { body.setAttribute("data-rm", e.target.checked ? "on" : "off"); });
  byId("toggle-rt").addEventListener("change", function (e) { body.setAttribute("data-rt", e.target.checked ? "on" : "off"); });
  each(document.querySelectorAll("select[data-axis]"), function (s) {
    s.addEventListener("change", function () {
      var a = s.getAttribute("data-axis");
      if (a === "base") {
        AXES.forEach(function (x) {
          sel[x] = s.value;
          document.querySelector('select[data-axis="' + x + '"]').value = s.value;
        });
      } else sel[a] = s.value;
      refresh();
    });
  });
  byId("copy").addEventListener("click", function () {
    var t = byId("pickline").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(t);
    var r = document.createRange();
    r.selectNodeContents(byId("pickline"));
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  setView("final"); setMode("light"); setLayout("grid"); refresh();
})();`;

const jsonForScript = (o) =>
  JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(String.fromCharCode(0x2028))
    .join("\\u2028")
    .split(String.fromCharCode(0x2029))
    .join("\\u2029");

// directions: validated directions.json; current: from readCurrent. Returns { html, copies: [{abs, rel}] }.
export function renderDirections({
  directions,
  current: cur,
  inventory = null,
  reuse = null,
  manifest = loadFontManifest(),
  projectFont = { intended: null },
  reactNative = false,
}) {
  const list = directions.directions;
  const opts = { fonts: manifest.fonts.map((f) => f.family) };
  const variants = [{ id: "current", label: "Current", d: null }, ...list.map((d) => ({ id: d.id, label: d.id, d }))];

  const used = new Set();
  for (const d of list) {
    for (const f of SCHOOL.get(d.school).fonts) used.add(f);
    for (const e of Object.values(d.type ?? {}))
      for (const f of String(scalarOf(e)).split(",")) used.add(f.trim().toLowerCase());
  }
  const faces = fontFaces(used, manifest);
  const copies = [...faces.copies];
  const css = [...faces.css];
  let curFont = "system-ui, sans-serif";
  if (projectFont.rel) {
    copies.push({ abs: projectFont.abs, rel: projectFont.rel });
    css.push(
      `@font-face{font-family:"current-font";font-display:swap;src:url(${projectFont.rel}) format("${projectFont.format}")}`,
    );
    curFont = '"current-font", system-ui, sans-serif';
  }
  const fontNote = projectFont.rel
    ? `Current font: ${projectFont.intended ?? "project font"} (loaded from the project by relative path).`
    : `Current font: ${projectFont.intended ?? "not found"}, shown with a fallback stack (no font file found through the Platform notes token files).`;

  // Cascade: Current on every scope, then each direction, then the mix axes in resolvePick's order.
  const block = (sel, decls) => (decls.length ? `${sel}{${decls.join(";")}}` : "");
  const dark = (sel) => `body[data-mode="dark"] ${sel}`;
  css.push(block(".screen,.scope", [...aliasDecls(cur), `--ff-body:${curFont}`, ...currentDecls(cur, "light", opts)]));
  css.push(block(`${dark(".screen")},${dark(".scope")}`, currentDecls(cur, "dark", opts)));
  for (const d of list) {
    const sel = `[data-v="${d.id}"]`;
    css.push(
      block(
        sel,
        MIX_AXES.flatMap((a) => axisDecls(d, a, cur, "light", opts)),
      ),
    );
    css.push(
      block(
        dark(sel),
        MIX_AXES.flatMap((a) => axisDecls(d, a, cur, "dark", opts)),
      ),
    );
  }
  for (const a of MIX_AXES)
    for (const d of list) {
      const sel = `[data-v="mix"][data-${a}="${d.id}"]`;
      css.push(block(sel, axisDecls(d, a, cur, "light", opts)));
      css.push(block(dark(sel), axisDecls(d, a, cur, "dark", opts)));
    }

  // Precomputed per-axis picks (one axis moved, the rest Current): the page only switches between these.
  const lineFor = (axis, id) =>
    `artist-pick v1 ${MIX_AXES.map((a) => `${a}=${a === axis ? id : "current"}`).join(" ")}`;
  const axes = {};
  const notes = { impact: "", wont: "" };
  for (const a of MIX_AXES) {
    axes[a] = { current: { diff: [], impact: [], wont: [] } };
    for (const d of list) {
      const p = resolvePick({ line: lineFor(a, d.id), directions, current: cur, inventory, reuse });
      axes[a][d.id] = {
        diff: [
          ...p.tokenDiff.added.map((x) => ({ name: x.name, to: x.value })),
          ...p.tokenDiff.changed.map((x) => ({ name: x.name, from: x.from, to: x.to })),
        ],
        impact: p.impact.items,
        wont: p.wontCarry.items,
      };
      notes.impact = p.impact.note;
      notes.wont = p.wontCarry.status === "checked" ? "" : p.wontCarry.note;
    }
  }
  const contrast = { current: contrastFor(cur, []).warnings };
  for (const d of list) contrast[d.id] = contrastFor(cur, d).warnings;
  const baseEff = effectiveOf(cur, null);

  const cards = variants
    .map((v) => {
      const brief = v.d
        ? esc(v.d.brief)
        : `${esc(directions.current.concept)} <small>(${esc(directions.current.school)}; evidence: ${esc(directions.current.evidence.join("; "))})</small><br><small>${esc(fontNote)}</small>`;
      return `<article class="card" data-card="${esc(v.id)}"><h3>${esc(v.label)}${v.d ? ` <small>${esc(v.d.school)}</small>` : ""}</h3>
<p class="brief">${brief}</p>
<div class="badges">${contrast[v.id].map(badge).join("")}</div>
${sampleScreen(v.id, v.label)}</article>`;
    })
    .join("\n");
  const specimens = variants.map((v) => specimen(v.id, v.label, effectiveOf(cur, v.d), baseEff, cur)).join("\n");
  const options = ["current", ...list.map((d) => d.id)]
    .map((id) => `<option value="${esc(id)}">${esc(id)}</option>`)
    .join("");
  const selects = MIX_AXES.map(
    (a) =>
      `<label>${a === "base" ? "Base direction" : a[0].toUpperCase() + a.slice(1)} <select data-axis="${a}">${options}</select></label>`,
  ).join("\n");
  const banner = reactNative
    ? `<p class="banner">This project is React Native: every screen below is a web approximation of the tokens, not native rendering.</p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design directions</title>
<style>${PAGE_CSS}
${css.filter(Boolean).join("\n")}</style></head>
<body data-view="final" data-mode="light" data-rm="off" data-rt="off">
<header><h1 class="title">Design directions</h1>
<button type="button" data-view-btn="final">Final result</button><button type="button" data-view-btn="specimen">Specimen</button><button type="button" data-view-btn="mix">Pick &amp; mix</button>
<span aria-hidden="true">|</span>
<button type="button" data-mode-btn="light">Light</button><button type="button" data-mode-btn="dark">Dark</button></header>
${banner}
<main>
<section id="view-final" class="view" aria-label="Final result"><h2 class="sr">Final result</h2><div class="ctl"><button type="button" data-layout-btn="grid">Side by side</button><button type="button" data-layout-btn="one">One at a time</button>
<button type="button" id="prev">Previous</button><button type="button" id="next">Next</button></div>
<div id="finals" data-layout="grid"><div class="cards">
${cards}
</div></div></section>
<section id="view-specimen" class="view" aria-label="Specimen"><h2 class="sr">Specimen</h2><p>Cells highlighted differ from Current.</p>
${specimens}
</section>
<section id="view-mix" class="view" aria-label="Pick and mix"><h2 class="sr">Pick and mix</h2><div class="ctl">${selects}
<label><input type="checkbox" id="toggle-rm"> Reduced motion</label><label><input type="checkbox" id="toggle-rt"> Reduced transparency</label></div>
<div class="mix-grid"><div class="pane"><h3>Your mix</h3>${sampleScreen("mix", "Mix")}</div><div class="pane"><h3>Current</h3>${sampleScreen("current", "Current")}</div></div>
<div class="panel"><h3>Contrast</h3><div id="mix-contrast"></div></div>
<div class="panel"><h3>Token diff</h3><div id="mix-diff"></div></div>
<div class="panel"><h3>Impact</h3><div id="mix-impact"></div></div>
<div class="panel"><h3>Won't carry across</h3><div id="mix-wont"></div></div>
<div class="panel"><h3>Pick line</h3><code id="pickline">artist-pick v1 base=current palette=current type=current shape=current motion=current</code>
<button type="button" id="copy">Copy pick line</button><p>Paste it back to the assistant; it is resolved against this directions.json only.</p></div>
</section></main>
<script type="application/json" id="directions-data">${jsonForScript({ axes, contrast, notes })}</script>
<script>${PAGE_JS}</script>
</body></html>
`;
  return { html, copies };
}

// ---- CLI ----

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return fail("json", `${what} ${file}: ${e.message}`);
  }
}

const stamp = (d) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

function render({ project, directions, cur, manifest, inventory, reuse, ts }) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  } catch {
    // no package.json: not a React Native project as far as we can tell
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const md = readFileSync(join(project, "docs", "design", "DESIGN.md"), "utf8");
  const { html, copies } = renderDirections({
    directions,
    current: cur,
    inventory,
    reuse,
    manifest,
    projectFont: findProjectFont(project, md),
    reactNative: "react-native" in deps || "expo" in deps,
  });
  const out = join(project, ".artist", "directions", ts);
  mkdirSync(join(out, "fonts"), { recursive: true });
  for (const c of copies) {
    mkdirSync(dirname(join(out, c.rel)), { recursive: true });
    copyFileSync(c.abs, join(out, c.rel));
  }
  writeFileSync(join(out, "directions.html"), html);
  return join(out, "directions.html");
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
      'directions.mjs --directions <json> --project <dir> [--reuse <reuse.json>] | --resolve "<pick line>" [--reuse <reuse.json>]',
    );
  const cur = readCurrent(project);
  const manifest = loadFontManifest();
  const directions = validateDirections(readJson(dj, "directions"), cur, {
    fonts: manifest.fonts.map((f) => f.family),
  });
  const invFile = join(project, "docs", "design", "inventory.json");
  const inventory = existsSync(invFile) ? readJson(invFile, "inventory") : null;
  const reuseFile = arg("--reuse");
  const reuse = reuseFile ? readJson(reuseFile, "reuse") : null;
  const line = arg("--resolve");
  if (line === undefined) {
    const ts = arg("--timestamp") ?? stamp(new Date());
    if (!/^\d{8}T\d{6}Z$/.test(ts)) fail("usage", "--timestamp must be YYYYMMDDTHHMMSSZ");
    console.log(render({ project, directions, cur, manifest, inventory, reuse, ts }));
    return;
  }
  const pick = resolvePick({ line, directions, current: cur, inventory, reuse });
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

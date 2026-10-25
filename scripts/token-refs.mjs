// Pure Tailwind v4 class -> DESIGN.md token resolver (ARCH-VERIFY-27). Builtins only, no I/O.
import { bindTokens } from "./design-md.mjs";

export { bindTokens };

const COLOUR = ["bg", "text", "border", "fill", "stroke", "ring", "outline", "decoration", "accent", "caret", "shadow"];
const SPACING = [
  ...["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe", "m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me"],
  ...["gap", "gap-x", "gap-y", "space-x", "space-y", "w", "h", "size", "min-w", "min-h", "max-w", "max-h"],
  ...["inset", "inset-x", "inset-y", "top", "right", "bottom", "left", "start", "end", "scroll-m", "scroll-p"],
];
const NAMESPACES = {
  ...Object.fromEntries(COLOUR.map((p) => [p, ["--color-"]])),
  text: ["--color-", "--text-"],
  font: ["--font-", "--font-weight-"],
  rounded: ["--radius-"],
  ease: ["--ease-"],
  animate: ["--animate-"],
};
const SPACING_SET = new Set(SPACING);
const PREFIX_LIST = [...Object.keys(NAMESPACES), ...SPACING].sort((a, b) => b.length - a.length);
// Colour-family values that are keywords, widths or alignment, never tokens.
const NOT_COLOUR = /^(transparent|current|inherit|black|white|none|auto|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|[trblxyse]|[trblxyse]-.+|\d+(\.\d+)?)$/;

// Split on `sep` at bracket/paren depth 0.
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

// `hover:bg-brand/80!` -> { variants, utility: "bg-brand" , negative }
export function parseClass(cls) {
  const segs = splitTop(cls, ":");
  const variants = segs.slice(0, -1);
  let u = segs[segs.length - 1];
  if (u.startsWith("!")) u = u.slice(1);
  if (u.endsWith("!")) u = u.slice(0, -1);
  let negative = false;
  if (u.startsWith("-")) {
    negative = true;
    u = u.slice(1);
  }
  const slash = splitTop(u, "/");
  return { variants, utility: slash[0], opacity: slash.length > 1 ? slash.slice(1).join("/") : null, negative, raw: u };
}

const toPx = (v) => {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
};

function verdict(cls, matches, extra = {}) {
  const vars = [...new Set(matches.map((t) => t.variable))];
  const kind = vars.length === 0 ? "unknown" : vars.length === 1 ? "token" : "ambiguous";
  return { class: cls, kind, variables: vars, ...extra };
}

// Resolve one class. kind: token | unknown | ambiguous | var | literal | none (not a themed utility).
// ctx: { tokens (bindTokens output), spacingPx (default 4) }
export function resolveClass(cls, ctx = {}) {
  const tokens = ctx.tokens ?? [];
  const base = ctx.spacingPx ?? 4;
  const p = parseClass(cls);
  const prefix = PREFIX_LIST.find((x) => p.utility.startsWith(`${x}-`));
  if (!prefix) return { class: cls, kind: "none", variables: [] };
  const rest = p.utility.slice(prefix.length + 1);
  const colourish = COLOUR.includes(prefix);
  const spacing = SPACING_SET.has(prefix);
  // Opacity is a colour-only suffix; `w-1/2` is a fraction.
  const body = spacing && p.opacity !== null ? `${rest}/${p.opacity}` : rest;
  const arbitrary = /^\[.*\]$/.test(rest);
  if (arbitrary) return { class: cls, kind: "literal", variables: [] };
  const ref = /^\((?:[a-z-]+:)?(--[\w-]+)\)$/.exec(rest);
  if (ref) return verdict(cls, tokens.filter((t) => t.variable === ref[1]), { ref: ref[1] });
  if (spacing) {
    if (/\//.test(body)) return { class: cls, kind: "none", variables: [] };
    const direct = tokens.filter((t) => t.variable === `--spacing-${body}`);
    if (direct.length) return verdict(cls, direct);
    if (!/^\d*\.?\d+$/.test(body)) return { class: cls, kind: "none", variables: [] };
    const px = Number(body) * base;
    return verdict(
      cls,
      tokens.filter((t) => t.category === "spacing" && toPx(t.value) === px),
    );
  }
  if (colourish && NOT_COLOUR.test(rest)) return { class: cls, kind: "none", variables: [] };
  const wanted = new Set(NAMESPACES[prefix].map((ns) => `${ns}${rest}`));
  return verdict(
    cls,
    tokens.filter((t) => wanted.has(t.variable)),
  );
}

// Classes matching no DESIGN.md token or more than one, as unique { class, reason }.
export function offTokenClasses(classes, ctx = {}) {
  const seen = new Set();
  const out = [];
  for (const cls of classes) {
    if (seen.has(cls)) continue;
    seen.add(cls);
    const r = resolveClass(cls, ctx);
    if (r.kind === "unknown" || r.kind === "ambiguous") out.push({ class: cls, reason: r.kind });
  }
  return out;
}

#!/usr/bin/env node
// Static inventory of a UI project. Read-only on source. Writes
// <project>/docs/design/inventory.json and rewrites only the marked section of
// <project>/docs/design/DESIGN.md (falls back to <project>/DESIGN.md when the
// former does not exist). Exit 0 on success, 2 on error.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOf, bindTokens, decisionsOf, spacingBaseOf, tokenFilesOf, tokenFilePaths } from "./design-md.mjs";
import { tokenRefsIn } from "./token-refs.mjs";

export const START = "<!-- artist:inventory:start -->";
export const END = "<!-- artist:inventory:end -->";

// Capability map shared with reuse-check.mjs (imported there).
export const CAPS = {
  charts: [
    "chart.js",
    "react-chartjs-2",
    "vue-chartjs",
    "recharts",
    "echarts",
    "vue-echarts",
    "apexcharts",
    "vue3-apexcharts",
    "victory",
    "@nivo/*",
    "d3",
  ],
  icons: ["lucide-react", "lucide-vue-next", "react-icons", "@heroicons/*", "@fortawesome/*", "@iconify/vue"],
  "ui-kit": [
    "@mui/*",
    "antd",
    "@chakra-ui/*",
    "@radix-ui/*",
    "@headlessui/*",
    "@mantine/*",
    "@nuxt/ui",
    "vuetify",
    "primevue",
    "element-plus",
    "naive-ui",
    "quasar",
    "radix-vue",
    "reka-ui",
  ],
  animation: ["framer-motion", "motion", "gsap", "react-spring", "@vueuse/motion"],
  dates: ["date-fns", "dayjs", "moment", "luxon"],
  forms: ["react-hook-form", "formik", "vee-validate", "@formkit/*"],
  state: ["zustand", "redux", "@reduxjs/toolkit", "jotai", "pinia", "vuex"],
};
const matches = (pat, name) => (pat.endsWith("/*") ? name.startsWith(pat.slice(0, -1)) : pat === name);
export const capOf = (name) => Object.keys(CAPS).find((c) => CAPS[c].some((p) => matches(p, name))) ?? null;

// formatOf lives in design-md.mjs (ARCH-VERIFY-25); re-exported for compatibility.
export { formatOf };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
const ROUTE_FILE = /(^|\/)(layout|page|template|loading|error|not-found|route)\.(tsx|jsx|ts|js)$/;
const isTsx = (p) => /\.(tsx|jsx)$/.test(p);

// Body between the bracket at `open` ({ or [) and its match.
function balanced(src, open) {
  const o = src[open],
    c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return src.slice(open + 1, i);
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
    const values =
      lits.length > 1 && lits.every((s) => /^(["'`]).*\1$/.test(s)) ? lits.map((s) => s.slice(1, -1)) : undefined;
    props.push({ name: m[1], type, optional: !!m[2], ...(values ? { values } : {}) });
  }
  return props;
}

function propsFor(content, name) {
  const decl = new RegExp(`(?:type\\s+${name}Props\\s*=\\s*|interface\\s+${name}Props\\s*(?:extends[^{]+)?)\\{`).exec(
    content,
  );
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
  const m = new RegExp(
    `/\\*\\*(?:(?!\\*/)[\\s\\S])*@deprecated(?:(?!\\*/)[\\s\\S])*\\*/\\s*export\\s+(?:default\\s+)?(?:function|const|class)\\s+${name}\\b`,
  ).test(content);
  return m || deprecatedInDesign(designMd, name);
}

// Only an exact `Deprecate <Name>` Decisions row deprecates (ARCH-VERIFY-23).
function deprecatedInDesign(designMd, name) {
  if (!designMd) return false;
  return decisionsOf(designMd).some((r) => String(r.decision ?? "").trim() === `Deprecate ${name}`);
}

// Token context: bound tokens plus the Tailwind spacing base read from token-file text.
function tokenCtx(designMd, tokenTexts) {
  return { tokens: bindTokens(designMd || ""), spacingPx: spacingBaseOf(tokenTexts ?? []) };
}

// Bound variables a source file references (shared with reuse-check via token-refs).
const tokensIn = (content, ctx) => uniqSorted([...tokenRefsIn(content, ctx)]);

// ---- Vue single-file components ----

const pascal = (s) =>
  s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
const kebab = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
const scriptOf = (content) => [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
const dirOf = (p) => (p.includes("/") ? posix.dirname(p) : "");

// Where a .vue file sits in its app: Nuxt (an ancestor package.json depends on
// nuxt) knows pages/, layouts/ and auto-imported components/; plain Vue only
// has components, with App.vue as the root.
function vueRole(path, nuxtRoots) {
  const root = nuxtRoots.filter((r) => r === "" || path.startsWith(r + "/")).sort((a, b) => b.length - a.length)[0];
  if (root === undefined) return { nuxt: false, kind: posix.basename(path) === "App.vue" ? "root" : "component" };
  const rel = (root ? path.slice(root.length + 1) : path).replace(/^app\//, "");
  if (rel === "app.vue" || rel === "error.vue") return { nuxt: true, root, rel, kind: "root" };
  const kind = /^pages\//.test(rel) ? "page" : /^layouts\//.test(rel) ? "layout" : "component";
  return { nuxt: true, root, rel, kind };
}

// Nuxt's auto-import name: folders under components/ prefix the file name,
// minus any trailing folders the file name already starts with.
function vueName(path, role) {
  const base = posix.basename(path, ".vue");
  if (!role.nuxt || !/^components\//.test(role.rel)) return pascal(base);
  const parts = role.rel.slice("components/".length).split("/").slice(0, -1).map(pascal);
  let file = pascal(base);
  if (base === "index" && parts.length) file = parts.pop();
  for (let k = parts.length; k > 0; k--) {
    if (file.startsWith(parts.slice(-k).join(""))) return parts.slice(0, -k).join("") + file;
  }
  return parts.join("") + file;
}

// Top-level comma-separated entries of an object or array body, in order.
function splitTop(body) {
  const out = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// The generic argument of defineProps<...>(), ignoring => and anything in braces.
function genericArg(src, from) {
  let angle = 1,
    brace = 0;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (brace === 0 && ch === "<") angle++;
    else if (brace === 0 && ch === ">" && src[i - 1] !== "=" && --angle === 0) return src.slice(from, i);
  }
  return null;
}

function typeBody(content, name) {
  const decl = new RegExp(`(?:interface\\s+${name}\\b[^{]*|type\\s+${name}\\s*=\\s*)\\{`).exec(content);
  return decl ? balanced(content, decl.index + decl[0].length - 1) : null;
}

function runtimeProps(src, open) {
  const body = balanced(src, open);
  if (body == null) return null;
  if (src[open] === "[") {
    return [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => ({ name: m[1], type: "unknown", optional: true }));
  }
  const props = [];
  for (const entry of splitTop(body)) {
    const m = /^["']?([A-Za-z_$][\w$-]*)["']?\s*:\s*([\s\S]*)$/.exec(entry);
    if (!m) continue;
    const val = m[2].trim();
    if (val.startsWith("{")) {
      const t = /\btype\s*:\s*([^,}\n]+)/.exec(val);
      props.push({ name: m[1], type: t ? t[1].trim() : "unknown", optional: !/\brequired\s*:\s*true\b/.test(val) });
    } else props.push({ name: m[1], type: val, optional: true });
  }
  return props;
}

// Props of a .vue file: defineProps<T>() (T inline, declared in the file or
// exported by another project file, & intersections joined), runtime
// defineProps({...} | [...]), or an Options API `props:`. Names a props type
// it cannot find in `missing`.
function vueProps(script, files) {
  const missing = [];
  const gen = /defineProps\s*</.exec(script);
  if (gen) {
    const arg = genericArg(script, gen.index + gen[0].length);
    if (arg == null) return { props: [], missing };
    const props = [];
    for (const part of splitTop(arg.replace(/&/g, ","))) {
      if (part.startsWith("{")) {
        props.push(...parseMembers(part.slice(1, -1)));
        continue;
      }
      const name = /^[A-Za-z_$][\w$]*/.exec(part)?.[0];
      if (!name) continue;
      let body = typeBody(script, name);
      for (const f of files) {
        if (body != null) break;
        if (new RegExp(`export\\s+(?:interface|type)\\s+${name}\\b`).test(f.content)) body = typeBody(f.content, name);
      }
      if (body == null) missing.push(name);
      else props.push(...parseMembers(body));
    }
    return { props, missing };
  }
  const rt =
    /defineProps\s*\(\s*([{[])/.exec(script) ??
    (/export\s+default\b/.test(script) && /\bprops\s*:\s*([{[])/.exec(script));
  if (rt) return { props: runtimeProps(script, rt.index + rt[0].length - 1) ?? [], missing };
  return { props: [], missing };
}

const vueDeprecated = (content, script, name, designMd) =>
  /^\s*<!--(?:(?!-->)[\s\S])*@deprecated/.test(content) ||
  /\/\*\*(?:(?!\*\/)[\s\S])*@deprecated(?:(?!\*\/)[\s\S])*\*\/\s*(?:(?:const|let)\s+\w+\s*=\s*)?(?:withDefaults\s*\(\s*)?(?:defineProps|defineOptions|defineComponent|export\s+default)\b/.test(
    script,
  ) ||
  deprecatedInDesign(designMd, name);

// Nuxt route of a pages/ file and the layout it renders in (null for layout: false).
function nuxtPage(role, script) {
  const segs = role.rel
    .slice("pages/".length)
    .replace(/\.vue$/, "")
    .split("/")
    .filter((s) => !/^\(.*\)$/.test(s));
  if (segs[segs.length - 1] === "index") segs.pop();
  const meta = /definePageMeta\s*\(\s*\{[\s\S]*?\blayout\s*:\s*(false|["'`]([^"'`]+)["'`])/.exec(script);
  return {
    root: role.root,
    route: "/" + segs.join("/"),
    layout: !meta ? "default" : meta[1] === "false" ? null : meta[2],
  };
}

// Each code file's opening-tag counts and .vue default imports, scanned once.
function vueScan(fs) {
  return fs
    .filter((f) => /\.(vue|tsx|jsx|ts|js)$/.test(f.path))
    .map((f) => {
      const tags = new Map();
      for (const m of f.content.matchAll(/<([A-Za-z][\w-]*)(?=[\s/>])/g)) tags.set(m[1], (tags.get(m[1]) ?? 0) + 1);
      const imports = [...f.content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.vue)["']/g)].map(
        (m) => ({
          binding: m[1],
          // "./x.vue" resolves against the importer; "~/x.vue", "@/x.vue" are matched by path suffix
          target: m[2].startsWith(".")
            ? posix.normalize(posix.join(dirOf(f.path), m[2]))
            : "/" + m[2].replace(/^(~~|@@|~|@)\//, ""),
        }),
      );
      return { path: f.path, tags, imports };
    });
}

// Files rendering a .vue component: by its Nuxt auto-import name (plain,
// Lazy-prefixed, or kebab-case) or by a default-import binding of its file.
function vueUsage(c, nuxt, scanned) {
  const files = new Set();
  let count = 0;
  for (const f of scanned) {
    if (f.path === c.path) continue;
    const names = new Set(nuxt ? [c.name, "Lazy" + c.name] : []);
    for (const i of f.imports) if (i.target === c.path || ("/" + c.path).endsWith(i.target)) names.add(i.binding);
    let n = 0;
    for (const t of names) for (const tag of new Set([t, kebab(t)])) n += f.tags.get(tag) ?? 0;
    if (n) {
      count += n;
      files.add(f.path);
    }
  }
  return { count, files: [...files].sort(cmp) };
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

export function buildInventory(files, { designMd = "", tokenTexts = [] } = {}) {
  const tctx = tokenCtx(designMd, tokenTexts);
  const fs = [...files].sort((a, b) => cmp(a.path, b.path));
  const unparsed = [];
  const components = [];
  const layouts = [];
  const schemas = [];
  const pkgs = new Map();
  const pagePaths = fs.filter((f) => /(^|\/)page\.(tsx|jsx|ts|js)$/.test(f.path)).map((f) => f.path);
  const nuxtRoots = fs
    .filter((f) => /(^|\/)package\.json$/.test(f.path))
    .filter((f) => {
      try {
        const j = JSON.parse(f.content);
        return ["dependencies", "devDependencies"].some((k) => j[k]?.nuxt);
      } catch {
        return false;
      }
    })
    .map((f) => dirOf(f.path));
  const vueMeta = new Map(); // component -> rendered via Nuxt auto-import?
  const nuxtPages = fs
    .filter((f) => f.path.endsWith(".vue"))
    .map((f) => [vueRole(f.path, nuxtRoots), f])
    .filter(([r]) => r.kind === "page")
    .map(([r, f]) => nuxtPage(r, scriptOf(f.content)));

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
      } catch (e) {
        unparsed.push({ path, reason: `invalid JSON: ${e.message}` });
      }
      continue;
    }
    if (path.endsWith(".json")) {
      let j;
      try {
        j = JSON.parse(content);
      } catch (e) {
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
    if (!/\.(tsx|jsx|ts|js|vue)$/.test(path)) continue;

    if (path.endsWith(".vue")) {
      const role = vueRole(path, nuxtRoots);
      const script = scriptOf(content);
      if (role.kind === "layout") {
        const name = kebab(
          role.rel
            .slice("layouts/".length)
            .replace(/\.vue$/, "")
            .split("/")
            .map(pascal)
            .join(""),
        );
        const routes = nuxtPages.filter((p) => p.root === role.root && p.layout === name).map((p) => p.route);
        layouts.push({ name, path, routes: uniqSorted(routes) });
      } else if (role.kind === "component") {
        const name = vueName(path, role);
        const { props, missing } = vueProps(script, fs);
        for (const t of missing) unparsed.push({ path, reason: `props type ${t} not found` });
        const variants = {};
        for (const p of props) if (p.values) variants[p.name] = p.values;
        const c = {
          name,
          path,
          props,
          variants,
          tokensUsed: tokensIn(content, tctx),
          usage: { count: 0, files: [] },
          status: vueDeprecated(content, script, name, designMd) ? "deprecated" : "current",
        };
        components.push(c);
        vueMeta.set(c, role.nuxt);
      }
    } else if (/(^|\/)layout\.(tsx|jsx|ts|js)$/.test(path)) {
      const names = exportedNames(content);
      const def = /export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(content);
      layouts.push({
        name: def?.[1] ?? names[0] ?? posix.basename(posix.dirname(path)),
        path,
        routes: layoutRoutes(path, pagePaths),
      });
    } else if (isTsx(path) && !ROUTE_FILE.test(path)) {
      const names = exportedNames(content);
      if (!names.length) unparsed.push({ path, reason: "no exported component found" });
      for (const name of names) {
        const props = propsFor(content, name);
        const variants = {};
        for (const p of props) if (p.values) variants[p.name] = p.values;
        components.push({
          name,
          path,
          props,
          variants,
          tokensUsed: tokensIn(content, tctx),
          usage: { count: 0, files: [] },
          status: isDeprecated(content, name, designMd) ? "deprecated" : "current",
        });
      }
    }

    for (const m of content.matchAll(
      /(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(z|yup|Yup)\.object\s*\(\s*\{/g,
    )) {
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
      schemas.push({
        kind: "ts-type",
        name: m[1],
        path,
        fields: body
          ? parseMembers(body)
              .map((p) => p.name)
              .sort(cmp)
          : [],
      });
    }
  }

  // usage: files (other than the definition) importing and rendering the component
  const scanned = vueMeta.size ? vueScan(fs) : [];
  for (const c of components) {
    if (vueMeta.has(c)) {
      c.usage = vueUsage(c, vueMeta.get(c), scanned);
      continue;
    }
    const files = new Set();
    let count = 0;
    for (const f of fs) {
      if (f.path === c.path || !/\.(tsx|jsx|ts|js)$/.test(f.path)) continue;
      const imported = new RegExp(`import\\s+(?:[^;]*?[{,\\s])?${c.name}\\b[^;]*?from\\s+["']`).test(f.content);
      if (!imported) continue;
      const n = [...f.content.matchAll(new RegExp(`<${c.name}(?=[\\s/>])`, "g"))].length;
      if (n) {
        count += n;
        files.add(f.path);
      }
    }
    c.usage = { count, files: [...files].sort(cmp) };
  }

  const packages = [...pkgs.values()]
    .map((e) => ({
      name: e.name,
      version: [...e.versions].sort(cmp).join(", "),
      capability: capOf(e.name),
      sources: [...e.sources].sort(cmp),
    }))
    .sort((a, b) => cmp(a.name, b.name));

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
  let depth = 0,
    start = 0;
  const flush = (s) => {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(s);
    if (m) keys.push(m[1]);
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      flush(body.slice(start, i));
      start = i + 1;
    }
  }
  flush(body.slice(start));
  return keys.sort(cmp);
}

const cell = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
const table = (head, rows) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");

export function renderSections(inv) {
  const comps = table(
    ["name", "path", "props", "variants", "tokens", "used", "status"],
    inv.components.map((c) => [
      c.name,
      c.path,
      c.props.map((p) => p.name + (p.optional ? "?" : "")).join(", "),
      Object.entries(c.variants)
        .map(([k, v]) => `${k}: ${v.join(" / ")}`)
        .join("; "),
      c.tokensUsed.join(", "),
      `${c.usage.count} in ${c.usage.files.length} file${c.usage.files.length === 1 ? "" : "s"}`,
      c.status,
    ]),
  );
  const lays = table(
    ["name", "path", "routes"],
    inv.layouts.map((l) => [l.name, l.path, l.routes.join(", ")]),
  );
  const schs = table(
    ["name", "path", "kind", "fields"],
    inv.schemas.map((s) => [s.name, s.path, s.kind, s.fields.join(", ")]),
  );
  const pks = table(
    ["package", "version", "capability"],
    inv.packages.map((p) => [p.name, p.version, p.capability ?? ""]),
  );
  const tail = inv.unparsed.length
    ? `\n\n## Unparsed\n\n${table(
        ["path", "reason"],
        inv.unparsed.map((u) => [u.path, u.reason]),
      )}`
    : "";
  return `## Components\n\n${comps}\n\n## Layouts\n\n${lays}\n\n## Schemas\n\n${schs}\n\n## Packages\n\n${pks}${tail}\n`;
}

const SKIP_DIRS = new Set(["node_modules", ".artist", ".git", ".worktrees"]);
const skipped = (rel) => rel.split("/").some((seg) => SKIP_DIRS.has(seg));
const isRegular = (abs) => {
  try {
    return lstatSync(abs).isFile();
  } catch {
    return false;
  }
};
// Build output the walk never descends into, even without a .gitignore.
const WALK_SKIP = new Set([...SKIP_DIRS, "dist", "build", "out", ".next", ".turbo", "coverage"]);

// Names the project's own .gitignore files exclude, judged against a throwaway
// git dir whose work tree is the project, so a parent repo's rule that ignores
// the whole project does not apply. No git → nothing is excluded.
function ownIgnored(project, names) {
  if (!names.length) return new Set();
  const gitDir = mkdtempSync(join(tmpdir(), "artist-ignore-"));
  try {
    execFileSync("git", ["init", "-q", "--bare", gitDir], { stdio: "pipe" });
    const out = execFileSync(
      "git",
      ["--git-dir", gitDir, "--work-tree", project, "check-ignore", "--no-index", "-z", "--stdin"],
      {
        cwd: project,
        input: names.join("\0") + "\0",
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return new Set(out.split("\0").filter(Boolean));
  } catch {
    return new Set();
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }
}

// Every existing regular project file, relative posix paths, sorted. In a git
// repo: tracked + untracked-not-ignored (so ignored build output is excluded and
// unstaged deletions are dropped). Outside git, or in a folder its parent repo
// ignores: a filesystem walk that skips WALK_SKIP and honours the project's own
// .gitignore files.
export function listProjectFiles(project) {
  let names = null;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: project, stdio: "pipe" });
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: project,
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
    names = out.split("\0").filter(Boolean);
    // A project folder its parent repo ignores lists nothing; walk it instead.
    let ignored = false;
    try {
      execFileSync("git", ["check-ignore", "-q", "."], { cwd: project, stdio: "pipe" });
      ignored = true;
    } catch {}
    if (ignored || (!names.length && readdirSync(project).length)) names = null;
  } catch {
    names = null;
  }
  if (names === null) {
    names = [];
    const rec = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!WALK_SKIP.has(e.name)) rec(join(dir, e.name));
          continue;
        }
        if (e.isFile()) names.push(relative(project, join(dir, e.name)).split(sep).join("/"));
      }
    };
    rec(project);
    const ignored = ownIgnored(project, names);
    names = names.filter((n) => !ignored.has(n));
  }
  return uniqSorted(names.filter((n) => !skipped(n) && isRegular(join(project, n))));
}

function walk(root) {
  return listProjectFiles(root)
    .filter((rel) => /\.(tsx|jsx|ts|js|vue|json)$/.test(rel) && rel !== "docs/design/inventory.json")
    .map((rel) => ({ path: rel, content: readFileSync(join(root, rel), "utf8") }));
}

export function replaceMarked(md, section) {
  const s = md.indexOf(START),
    e = md.indexOf(END);
  if (s < 0 || e < s) throw new Error(`DESIGN.md has no ${START} / ${END} markers`);
  return md.slice(0, s + START.length) + "\n\n" + section + "\n" + md.slice(e);
}

// Declared `token files` (Platform notes) read as text, never executed; paths stay inside the
// project. Selected with tokenFilePaths, exactly as reuse-check selects them (ARCH-VERIFY-26).
function tokenFileTexts(project, md) {
  const texts = [];
  for (const rel of tokenFilePaths(tokenFilesOf(md), listProjectFiles(project))) {
    const abs = join(project, rel);
    const back = relative(project, abs);
    if (back.startsWith("..") || !existsSync(abs) || !isRegular(abs)) continue;
    texts.push(readFileSync(abs, "utf8"));
  }
  return texts;
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
  const inv = buildInventory(files, { designMd: md, tokenTexts: tokenFileTexts(project, md) });
  const updated = replaceMarked(md, renderSections(inv));
  mkdirSync(join(project, "docs", "design"), { recursive: true });
  writeFileSync(join(project, "docs", "design", "inventory.json"), JSON.stringify(inv, null, 2) + "\n");
  writeFileSync(designPath, updated);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`inventory: ${e.message}`);
    process.exitCode = 2;
  }
}

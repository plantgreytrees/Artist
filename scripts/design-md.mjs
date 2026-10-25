// Pure DESIGN.md parser (ARCH-VERIFY-25). Takes strings, returns data; no I/O and no imports.
// Tables are read by header name so column order never matters, `##` sections are the
// only structural level, and `###` sub-headings are tolerated inside a section.

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontmatter(md) {
  const m = FM.exec(md);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (kv) data[kv[1]] = kv[2];
  }
  return { data, body: md.slice(m[0].length) };
}

export function formatOf(md) {
  const f = /^\d+$/.exec(parseFrontmatter(md).data.format ?? "");
  return f ? Number(f[0]) : 1;
}

const FENCE = /^\s*(```|~~~)/;

// `##` sections only (a `###` stays in its parent's body); fenced lines are never headings.
export function parseSections(md) {
  const sections = [];
  let cur = null;
  let fence = false;
  for (const line of parseFrontmatter(md).body.split(/\r?\n/)) {
    if (FENCE.test(line)) fence = !fence;
    const h = !fence && /^##[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (h) {
      cur = { title: h[1], lines: [] };
      sections.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return sections.map((s) => ({ title: s.title, body: s.lines.join("\n") }));
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += s[i];
  }
  cells.push(cell.trim());
  return cells;
}

const isRow = (l) => l.trim().startsWith("|");
const isDelimiter = (l) => isRow(l) && splitRow(l).every((c) => /^:?-{1,}:?$/.test(c));

// Every table in a block of markdown: { heading (nearest ### or null), headers, rows[{header: cell}] }.
export function parseTables(body) {
  const lines = body.split(/\r?\n/);
  const tables = [];
  let heading = null;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) fence = !fence;
    if (fence) continue;
    const h = /^###[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (h) {
      heading = h[1];
      continue;
    }
    if (!isRow(line) || i + 1 >= lines.length || !isDelimiter(lines[i + 1])) continue;
    const headers = splitRow(line);
    const rows = [];
    i += 2;
    for (; i < lines.length && isRow(lines[i]); i++) {
      const cells = splitRow(lines[i]);
      rows.push(Object.fromEntries(headers.map((k, j) => [k, cells[j] ?? ""])));
    }
    i--;
    tables.push({ heading, headers, rows });
  }
  return tables;
}

const norm = (s) => s.trim().toLowerCase();

// Rows of every table in the `##` section titled `title` (case-insensitive), concatenated.
export function tableOf(md, title) {
  return parseSections(md)
    .filter((s) => norm(s.title) === norm(title))
    .flatMap((s) => parseTables(s.body).flatMap((t) => t.rows));
}

// Themes appear as one table with a `brand` column, or as one `### <brand>` table per brand.
function themesOf(md) {
  const out = [];
  for (const s of parseSections(md).filter((x) => norm(x.title) === "themes")) {
    for (const t of parseTables(s.body)) {
      for (const r of t.rows) {
        out.push({ brand: r.brand ?? t.heading ?? "", token: r.token ?? "", light: r.light ?? "", dark: r.dark ?? "" });
      }
    }
  }
  return out;
}

export function tokensOf(md) {
  return {
    primitives: tableOf(md, "Primitives"),
    semantic: tableOf(md, "Semantic tokens"),
    themes: themesOf(md),
    typeScale: tableOf(md, "Type scale"),
    spacing: tableOf(md, "Spacing"),
    motion: tableOf(md, "Motion"),
  };
}

export const componentTokensOf = (md) => tableOf(md, "Component tokens");
export const decisionsOf = (md) => tableOf(md, "Decisions");

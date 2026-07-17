import fs from "fs";

const path =
  "C:/Project/eighty-erp/supabase/migrations/20260717000004_material_system_v1.sql";
const s = fs.readFileSync(path, "utf8");

function stripNoise(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (sql[i] === "$") {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        const tag = m[0];
        const start = i + tag.length;
        const end = sql.indexOf(tag, start);
        if (end === -1) throw new Error(`Unclosed dollar quote ${tag}`);
        out += " ";
        i = end + tag.length;
        continue;
      }
    }
    if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += " ";
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

const stripped = stripNoise(s);
let depth = 0;
let minDepth = 0;
for (const ch of stripped) {
  if (ch === "(") depth += 1;
  if (ch === ")") depth -= 1;
  if (depth < minDepth) minDepth = depth;
}

const badPatterns = [
  /insert\s+into\s+public\.project_material_images\s*\(\s*;/i,
  /insert\s+into\s+public\.project_material_images\s*;/i,
  /do\s+\$migrate_images\$/i,
  /end;\s*\n\s*\$migrate_images\$\s*;/i,
];

const checks = {
  lines: s.split(/\r?\n/).length,
  has_do_execute_migrate: /DO\s+\$\$[\s\S]*EXECUTE\s+\$sql\$[\s\S]*END\s+\$\$/i.test(
    s,
  ),
  has_end_dollar_no_semicolon_between: /END\s+\$\$\s*;/.test(s),
  paren_depth_end: depth,
  paren_went_negative: minDepth < 0,
  bad_pattern_hits: badPatterns
    .map((re, idx) => (re.test(s) ? idx : -1))
    .filter((x) => x >= 0),
  ends_notify: /NOTIFY\s+pgrst,\s*'reload schema'\s*;/i.test(s),
};

console.log(JSON.stringify(checks, null, 2));

let failed = false;
const fail = (m) => {
  console.error("FAIL:", m);
  failed = true;
};

if (!checks.has_do_execute_migrate) fail("image migrate DO/EXECUTE block missing");
if (checks.paren_went_negative || checks.paren_depth_end !== 0)
  fail("unbalanced parentheses");
if (checks.bad_pattern_hits.length)
  fail(`bad patterns: ${checks.bad_pattern_hits.join(",")}`);
if (!checks.ends_notify) fail("missing NOTIFY footer");

if (failed) process.exit(1);
console.log("SQL 문법 검사 완료");

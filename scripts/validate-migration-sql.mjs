import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const allowDestructive = args.includes("--allow-destructive");
const input = args.find((arg) => !arg.startsWith("--"));

if (!input) {
  console.error(
    "사용법: node scripts/validate-migration-sql.mjs <migration.sql> [--allow-destructive]",
  );
  process.exit(2);
}

const filePath = path.resolve(process.cwd(), input);
if (!fs.existsSync(filePath)) {
  console.error(`FAIL: migration 파일을 찾을 수 없습니다: ${filePath}`);
  process.exit(2);
}

if (!/\.sql$/i.test(filePath)) {
  console.error("FAIL: .sql migration 파일만 검사할 수 있습니다.");
  process.exit(2);
}

const sql = fs.readFileSync(filePath, "utf8");

function stripNoise(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "-" && source[i + 1] === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }

    if (source[i] === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) throw new Error("닫히지 않은 /* */ 주석이 있습니다.");
      out += " ";
      i = end + 2;
      continue;
    }

    if (source[i] === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        const start = i + tag.length;
        const end = source.indexOf(tag, start);
        if (end === -1) throw new Error(`닫히지 않은 dollar quote가 있습니다: ${tag}`);
        out += " ";
        i = end + tag.length;
        continue;
      }
    }

    if (source[i] === "'") {
      i += 1;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (source[i] === "'") {
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) throw new Error("닫히지 않은 문자열 리터럴이 있습니다.");
      out += " ";
      continue;
    }

    out += source[i];
    i += 1;
  }
  return out;
}

let stripped;
try {
  stripped = stripNoise(sql);
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let parenDepth = 0;
let minParenDepth = 0;
for (const char of stripped) {
  if (char === "(") parenDepth += 1;
  if (char === ")") parenDepth -= 1;
  minParenDepth = Math.min(minParenDepth, parenDepth);
}

const destructivePatterns = [
  { label: "DROP TABLE", regex: /\bdrop\s+table\b/i },
  { label: "TRUNCATE", regex: /\btruncate(?:\s+table)?\b/i },
  { label: "DELETE FROM", regex: /\bdelete\s+from\b/i },
  {
    label: "DROP COLUMN",
    regex: /\balter\s+table\b[\s\S]*?\bdrop\s+column\b/i,
  },
];

const destructiveHits = destructivePatterns
  .filter(({ regex }) => regex.test(stripped))
  .map(({ label }) => label);

const checks = {
  file: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
  lines: sql.split(/\r?\n/).length,
  hasTransactionBegin: /\bbegin\s*;/i.test(stripped),
  hasTransactionCommit: /\bcommit\s*;/i.test(stripped),
  hasSchemaReload: /\bnotify\s+pgrst\s*,/i.test(stripped),
  parenDepthEnd: parenDepth,
  parenWentNegative: minParenDepth < 0,
  destructiveHits,
  allowDestructive,
};

console.log(JSON.stringify(checks, null, 2));

let failed = false;
const fail = (message) => {
  console.error("FAIL:", message);
  failed = true;
};

if (checks.parenWentNegative || checks.parenDepthEnd !== 0) {
  fail("괄호가 맞지 않습니다.");
}
if (checks.hasTransactionBegin !== checks.hasTransactionCommit) {
  fail("BEGIN/COMMIT 쌍이 맞지 않습니다.");
}
if (checks.destructiveHits.length > 0 && !allowDestructive) {
  fail(
    `파괴적 SQL이 감지되었습니다: ${checks.destructiveHits.join(", ")}. 정말 필요한 경우에만 --allow-destructive를 사용하세요.`,
  );
}
if (!checks.hasSchemaReload) {
  console.warn("WARN: NOTIFY pgrst, 'reload schema'가 없습니다. PostgREST 스키마 변경이 있는지 확인하세요.");
}

if (failed) process.exit(1);
console.log("Migration SQL 안전 검사 PASS");

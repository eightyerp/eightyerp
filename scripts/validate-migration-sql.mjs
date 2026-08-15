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

/**
 * structural: 괄호/트랜잭션 같은 외부 SQL 구조를 볼 때 문자열과 dollar body를 제거한다.
 * danger: 주석만 제거하고 문자열/dollar body는 보존한다. 동적 EXECUTE 안의 DROP/DELETE도
 *         안전 검사에서 놓치지 않기 위한 보수적 스캔용이다.
 */
function scanSql(source) {
  let structural = "";
  let danger = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === "-" && source[i + 1] === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      structural += "\n";
      danger += "\n";
      continue;
    }

    if (source[i] === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) {
        throw new Error("닫히지 않은 /* */ 주석이 있습니다.");
      }
      structural += " ";
      danger += " ";
      i = end + 2;
      continue;
    }

    if (source[i] === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        const start = i + tag.length;
        const end = source.indexOf(tag, start);
        if (end === -1) {
          throw new Error(`닫히지 않은 dollar quote가 있습니다: ${tag}`);
        }
        const quoted = source.slice(i, end + tag.length);
        structural += " ";
        danger += quoted;
        i = end + tag.length;
        continue;
      }
    }

    if (source[i] === "'") {
      const start = i;
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
      if (!closed) {
        throw new Error("닫히지 않은 문자열 리터럴이 있습니다.");
      }
      structural += " ";
      danger += source.slice(start, i);
      continue;
    }

    structural += source[i];
    danger += source[i];
    i += 1;
  }

  return { structural, danger };
}

let scanned;
try {
  scanned = scanSql(sql);
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let parenDepth = 0;
let minParenDepth = 0;
for (const char of scanned.structural) {
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
  .filter(({ regex }) => regex.test(scanned.danger))
  .map(({ label }) => label);

const checks = {
  file: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
  lines: sql.split(/\r?\n/).length,
  hasTransactionBegin: /\bbegin\s*;/i.test(scanned.structural),
  hasTransactionCommit: /\bcommit\s*;/i.test(scanned.structural),
  hasSchemaReload: /\bnotify\s+pgrst\s*,/i.test(scanned.structural),
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
  console.warn(
    "WARN: NOTIFY pgrst, 'reload schema'가 없습니다. PostgREST 스키마 변경이 있는지 확인하세요.",
  );
}

if (failed) process.exit(1);
console.log("Migration SQL 안전 검사 PASS");

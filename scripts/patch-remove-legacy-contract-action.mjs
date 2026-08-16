import { readFileSync, writeFileSync } from "node:fs";

const path = "app/actions/quote-mgmt.ts";
let source = readFileSync(path, "utf8");

source = source.replace(
  `import {\n  getQuoteContractTransitionOptions,\n  transitionQuoteToContract,\n} from "@/lib/crm/quote-contract-transition";\n`,
  "",
);

const start = source.indexOf(`/**\n * 기존 UI 이름은 유지하지만 실제 동작은 더 이상 quote 플래그만 바꾸지 않는다.`);
const endMarker = `\nexport async function getQuoteFileSignedUrlAction(`;
const end = source.indexOf(endMarker, start);

if (start >= 0 && end > start) {
  source = source.slice(0, start) + source.slice(end + 1);
}

if (source.includes("setContractQuoteAction")) {
  throw new Error("Legacy setContractQuoteAction still remains");
}
if (source.includes("getQuoteContractTransitionOptions")) {
  throw new Error("Unused legacy transition import still remains");
}

writeFileSync(path, source);
console.log("Removed legacy contract server action; explicit transition action remains authoritative.");

import { readFileSync, writeFileSync } from "node:fs";

const path = "components/quotes/QuoteDetailView.tsx";
let source = readFileSync(path, "utf8");

source = source.replace(
  `  getQuoteFileSignedUrlAction,\n  setContractQuoteAction,\n  type QuoteActionResult,\n`,
  `  getQuoteFileSignedUrlAction,\n`,
);

source = source.replace(
  `  const [contractPending, startContractTransition] = useTransition();\n  const [showContractConfirm, setShowContractConfirm] = useState(false);\n\n`,
  "",
);

source = source.replace(
  /\n  function handleSetContract\(\) \{[\s\S]*?\n  \}\n\n  async function handleDelete/,
  `\n  async function handleDelete`,
);

source = source.replace(
  /\n            \{!quote\.is_contract_quote && \(\n              <button[\s\S]*?\n            \)\}/,
  "",
);

source = source.replace(
  /\n      \{\/\* Contract confirm \*\/\}[\s\S]*?\n      \{\/\* Delete modal \*\/\}/,
  `\n      {/* Delete modal */}`,
);

if (source.includes("계약 견적으로 지정")) {
  throw new Error("Legacy contract-entry copy still remains in QuoteDetailView");
}
if (source.includes("setContractQuoteAction")) {
  throw new Error("Legacy contract action import still remains in QuoteDetailView");
}

writeFileSync(path, source);
console.log("Removed duplicate legacy contract entry from QuoteDetailView.");

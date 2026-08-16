import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected block not found: ${path}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "components/finance/ExpenseEntrySearchV3.tsx",
  `  useEffect(() => {\n    if (!state.success || !state.expenseId) return;\n    // 연속 입력이 많은 현장업무를 고려해 현장/공종/비용유형은 유지합니다.\n    setVendorChoice(\"\");\n    setNewVendorName(\"\");\n    setTotalAmount(0);\n    setSupplyAmount(0);\n    setVatAmount(0);\n    setDescription(\"\");\n    setAnalysis(null);\n    setAnalysisMessage(null);\n    if (fileRef.current) fileRef.current.value = \"\";\n  }, [state.success, state.expenseId]);`,
  `  useEffect(() => {\n    if (!state.success || !state.expenseId) return;\n    // 액션 결과와 로컬 입력 상태의 동기화를 다음 tick으로 넘겨\n    // effect 본문의 연쇄 렌더를 피한다.\n    const timer = window.setTimeout(() => {\n      setVendorChoice(\"\");\n      setNewVendorName(\"\");\n      setTotalAmount(0);\n      setSupplyAmount(0);\n      setVatAmount(0);\n      setDescription(\"\");\n      setAnalysis(null);\n      setAnalysisMessage(null);\n      if (fileRef.current) fileRef.current.value = \"\";\n    }, 0);\n    return () => window.clearTimeout(timer);\n  }, [state.success, state.expenseId]);`,
);

replaceExact(
  "components/finance/ExpenseWorkspaceV2.tsx",
  `  const [analysisBusy, setAnalysisBusy] = useState(false);\n  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);\n  const [showAdvanced, setShowAdvanced] = useState(false);`,
  `  const [analysisBusy, setAnalysisBusy] = useState(false);\n  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);\n  const [hasDocumentFile, setHasDocumentFile] = useState(false);\n  const [showAdvanced, setShowAdvanced] = useState(false);`,
);

replaceExact(
  "components/finance/ExpenseWorkspaceV2.tsx",
  `  useEffect(() => {\n    if (!state.success || !state.expenseId) return;\n    setVendorChoice(\"\");\n    setNewVendorName(\"\");\n    setTotalAmount(0);\n    setSupplyAmount(0);\n    setVatAmount(0);\n    setDescription(\"\");\n    setAnalysis(null);\n    setAnalysisMessage(null);\n    setShowAdvanced(false);\n    if (fileRef.current) fileRef.current.value = \"\";\n    router.refresh();\n  }, [state.success, state.expenseId, router]);`,
  `  useEffect(() => {\n    if (!state.success || !state.expenseId) return;\n    const timer = window.setTimeout(() => {\n      setVendorChoice(\"\");\n      setNewVendorName(\"\");\n      setTotalAmount(0);\n      setSupplyAmount(0);\n      setVatAmount(0);\n      setDescription(\"\");\n      setAnalysis(null);\n      setAnalysisMessage(null);\n      setHasDocumentFile(false);\n      setShowAdvanced(false);\n      if (fileRef.current) fileRef.current.value = \"\";\n      router.refresh();\n    }, 0);\n    return () => window.clearTimeout(timer);\n  }, [state.success, state.expenseId, router]);`,
);

replaceExact(
  "components/finance/ExpenseWorkspaceV2.tsx",
  `                    onChange={() => void analyzeDocument()}\n                    className=\"block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white\"`,
  `                    onChange={() => {\n                      setHasDocumentFile(Boolean(fileRef.current?.files?.[0]));\n                      void analyzeDocument();\n                    }}\n                    className=\"block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white\"`,
);

replaceExact(
  "components/finance/ExpenseWorkspaceV2.tsx",
  `                  disabled={analysisBusy || !fileRef.current?.files?.[0]}`,
  `                  disabled={analysisBusy || !hasDocumentFile}`,
);

console.log("React 19 lint patches applied.");

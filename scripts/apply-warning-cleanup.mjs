import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected block not found: ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "components/auth/CompanyRegistrationForm.tsx",
  `import { useState } from "react";\nimport { createClient } from "@/lib/supabase";`,
  `import { useState } from "react";\nimport { useRouter } from "next/navigation";\nimport { createClient } from "@/lib/supabase";`,
);
replaceExact(
  "components/auth/CompanyRegistrationForm.tsx",
  `}: CompanyRegistrationFormProps) {\n  const [pending, setPending] = useState(false);`,
  `}: CompanyRegistrationFormProps) {\n  const router = useRouter();\n  const [pending, setPending] = useState(false);`,
);
replaceExact(
  "components/auth/CompanyRegistrationForm.tsx",
  `      window.location.assign("/dashboard");`,
  `      router.replace("/dashboard");`,
);

replaceExact(
  "components/auth/SignupForm.tsx",
  `import Link from "next/link";\nimport { useState } from "react";`,
  `import Link from "next/link";\nimport { useRouter } from "next/navigation";\nimport { useState } from "react";`,
);
replaceExact(
  "components/auth/SignupForm.tsx",
  `}: SignupFormProps) {\n  const isCompanyInvite = Boolean(inviteToken);`,
  `}: SignupFormProps) {\n  const router = useRouter();\n  const isCompanyInvite = Boolean(inviteToken);`,
);
replaceExact(
  "components/auth/SignupForm.tsx",
  `        window.location.assign(\n          isCompanyInvite ? "/dashboard" : "/company/register",\n        );`,
  `        router.replace(isCompanyInvite ? "/dashboard" : "/company/register");`,
);
replaceExact(
  "components/auth/SignupForm.tsx",
  `      window.location.assign(\n        "/pending-approval?registered=1&company=1",\n      );`,
  `      router.replace("/pending-approval?registered=1&company=1");`,
);

replaceExact(
  "components/quotes/QuoteWizardForm.tsx",
  `import type { ErpQuoteItem } from "@/types/database";\n`,
  ``,
);
replaceExact(
  "components/quotes/QuoteWizardForm.tsx",
  `  const [persistedQuoteId, setPersistedQuoteId] = useState<string | null>(`,
  `  const [persistedQuoteId] = useState<string | null>(`,
);
replaceExact(
  "components/quotes/QuoteWizardForm.tsx",
  `  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() =>`,
  `  const [lastSavedAt] = useState<Date | null>(() =>`,
);
replaceExact(
  "components/quotes/QuoteWizardForm.tsx",
  `  const [saveBanner, setSaveBanner] = useState<string | null>(`,
  `  const [saveBanner] = useState<string | null>(`,
);
replaceExact(
  "components/quotes/QuoteWizardForm.tsx",
  `  const [originalExistingItemIds, setOriginalExistingItemIds] = useState<`,
  `  const [originalExistingItemIds] = useState<`,
);

replaceExact(
  "components/schedules/CustomerSchedulesWorkspace.tsx",
  `import { useActionState, useEffect, useMemo, useRef, useState } from "react";`,
  `import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";`,
);
replaceExact(
  "components/schedules/CustomerSchedulesWorkspace.tsx",
  `  function upsertSchedule(row: CustomerSchedule) {\n    setSchedules((prev) => {\n      const idx = prev.findIndex((s) => s.id === row.id);\n      if (idx < 0) return [row, ...prev];\n      const next = prev.slice();\n      next[idx] = row;\n      return next;\n    });\n  }\n\n  async function finalizeSaveSuccess(state: ScheduleActionResult) {\n    setToast(state.message ?? "저장되었습니다.");\n    setFormOpen(false);\n    setEditing(null);\n    setDetail(null);\n    setForceSave(false);\n    setActionResetKey((k) => k + 1);\n\n    let full = state.schedule ?? null;\n    if (state.id) {\n      const fetched = await fetchCustomerScheduleAction(state.id);\n      if (fetched.success) {\n        full = fetched.schedule;\n      }\n    }\n    if (full) {\n      upsertSchedule(full);\n    }\n    router.refresh();\n  }`,
  `  const upsertSchedule = useCallback((row: CustomerSchedule) => {\n    setSchedules((prev) => {\n      const idx = prev.findIndex((s) => s.id === row.id);\n      if (idx < 0) return [row, ...prev];\n      const next = prev.slice();\n      next[idx] = row;\n      return next;\n    });\n  }, []);\n\n  const finalizeSaveSuccess = useCallback(async (state: ScheduleActionResult) => {\n    setToast(state.message ?? "저장되었습니다.");\n    setFormOpen(false);\n    setEditing(null);\n    setDetail(null);\n    setForceSave(false);\n    setActionResetKey((k) => k + 1);\n\n    let full = state.schedule ?? null;\n    if (state.id) {\n      const fetched = await fetchCustomerScheduleAction(state.id);\n      if (fetched.success) {\n        full = fetched.schedule;\n      }\n    }\n    if (full) {\n      upsertSchedule(full);\n    }\n    router.refresh();\n  }, [router, upsertSchedule]);`,
);
replaceExact(
  "components/schedules/CustomerSchedulesWorkspace.tsx",
  `  }, [updatePending, createPending, updateState, createState]);`,
  `  }, [updatePending, createPending, updateState, createState, finalizeSaveSuccess]);`,
);

console.log("Warning cleanup patches applied.");
